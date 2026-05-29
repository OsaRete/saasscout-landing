import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file received." }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";

    if (fileName.endsWith(".pdf")) {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();

      extractedText = result.text;
    } else if (fileName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({
        buffer,
      });

      extractedText = result.value;
    } else {
      return Response.json(
        { error: "Unsupported file type." },
        { status: 400 }
      );
    }

    return Response.json({
      text: extractedText.trim(),
    });
  } catch (error) {
    console.error("File extraction error:", error);

    return Response.json(
      {
        error: "Failed to extract text.",
      },
      { status: 500 }
    );
  }
}