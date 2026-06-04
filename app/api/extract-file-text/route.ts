// @ts-expect-error pdf-parse internal path does not include TypeScript types
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file received." }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();

    if (!fileName.endsWith(".pdf") && !fileName.endsWith(".docx")) {
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

    const message =
      error instanceof Error ? error.message : "Failed to extract text.";

    return Response.json({ error: message }, { status: 500 });
  }
}