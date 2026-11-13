import { createClient } from "@supabase/supabase-js";

export class AuthError extends Error {
  status = 401;

  constructor(message = "Unauthorized", status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError();
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    throw new AuthError();
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.");
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new AuthError();
  }

  // The JWT establishes identity, never Beta authority. Recheck the persisted
  // membership on every protected request, including OAuth and existing sessions.
  let admission;
  try {
    admission = await supabase.rpc("application_beta_access");
  } catch {
    throw new AuthError("Beta access could not be verified.", 503);
  }
  if (admission.error || typeof admission.data !== "boolean") {
    throw new AuthError("Beta access could not be verified.", 503);
  }
  if (admission.data !== true) {
    throw new AuthError("An active Beta invitation is required.", 403);
  }

  return user;
}
