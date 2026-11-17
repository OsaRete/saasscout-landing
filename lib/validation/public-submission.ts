/** A request body is an in-memory snapshot, never browser storage. */
export class PublicSubmission {
  body: string | null = null;
  private url: string | null = null;
  busy = false;
  done = false;
  stopped = false;
  retryAt = 0;
  async send(
    url: string,
    payload: () => object,
    transport: typeof fetch = fetch,
  ) {
    if (this.busy || this.done || this.stopped || Date.now() < this.retryAt)
      return "";
    this.busy = true;
    try {
      this.body ??= JSON.stringify(payload());
      this.url ??= url;
      const response = await transport(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: this.body,
      });
      const result = await response.json();
      if (
        response.ok &&
        result?.data?.accepted === true &&
        !result.error &&
        !result.data.limited &&
        !result.data.capacity &&
        !result.data.rejected &&
        !result.data.conflict &&
        (result.data.duplicate === undefined ||
          typeof result.data.duplicate === "boolean")
      ) {
        this.done = true;
        this.body = null;
        this.url = null;
        return "";
      }
      const error = result?.error;
      // Only this explicit server contract proves deterministic validation failed before persistence.
      if (
        response.status === 400 &&
        error?.code === "invalid_request" &&
        error.submissionRejected === true
      ) {
        this.body = null;
        this.url = null;
        return "Please correct your response and submit again.";
      }
      if (response.status === 429 && error?.code === "invalid_request") {
        const seconds = Number(response.headers.get("Retry-After"));
        this.retryAt =
          Date.now() +
          (Number.isFinite(seconds) && seconds > 0
            ? Math.min(seconds, 3600)
            : 60) *
            1000;
        return "Please wait before retrying the same response.";
      }
      if (response.status === 404 && error?.code === "not_found") {
        this.stopped = true;
        return "This publication is closed or unavailable. Contact the creator; your submission status could not be confirmed.";
      }
      if (response.status === 409 && error?.code === "idempotency_conflict") {
        this.stopped = true;
        return "This request conflicts with an earlier response. Contact the creator before submitting again.";
      }
      return "Your submission status could not be confirmed. Retry the same response.";
    } catch {
      return "Your submission status could not be confirmed. Retry the same response.";
    } finally {
      this.busy = false;
    }
  }
}
