// @ts-expect-error pdf-parse internal path does not include TypeScript types
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import { AuthError, requireUser } from "../_utils/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file received." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return Response.json(
        { error: "File is too large. Maximum size is 5 MB." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const isAllowedExtension =
      fileName.endsWith(".pdf") || fileName.endsWith(".docx");

    if (!isAllowedExtension || !ALLOWED_FILE_TYPES.has(file.type)) {
      return Response.json(
        { error: "Unsupported file type." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";

    if (fileName.endsWith(".pdf")) {
      const result = await pdfParse(buffer);
      extractedText = result.text || "";
    }

    if (fileName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value || "";
    }

    if (!extractedText.trim()) {
      return Response.json(
        { error: "No readable text found in this file." },
        { status: 400 }
      );
    }

    return Response.json({
      text: extractedText.trim(),
    });
  } catch (error) {
    console.error("File extraction error:", error);

    if (error instanceof AuthError) {
      return Response.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to extract text.";

    return Response.json({ error: message }, { status: 500 });
  }
}
