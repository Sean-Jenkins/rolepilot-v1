import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Please upload a CV file." },
      { status: 400 },
    );
  }

  const fileName = file.name.toLowerCase();

  if (!fileName.endsWith(".docx") && !fileName.endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only DOCX and PDF extraction are supported by this endpoint." },
      { status: 400 },
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();

    if (fileName.endsWith(".pdf")) {
      const parser = new PDFParse({
        data: Buffer.from(arrayBuffer),
      });

      try {
        const result = await parser.getText();
        const text = result.text.trim();

        if (!text) {
          return NextResponse.json(
            {
              error:
                "We could not extract text from this PDF. Please try a different PDF or paste your CV manually.",
            },
            { status: 422 },
          );
        }

        return NextResponse.json({ text });
      } finally {
        await parser.destroy();
      }
    }

    const result = await mammoth.extractRawText({
      buffer: Buffer.from(arrayBuffer),
    });
    const text = result.value.trim();

    if (!text) {
      return NextResponse.json(
        { error: "No readable text was found in this DOCX file." },
        { status: 422 },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("CV extraction failed", error);

    return NextResponse.json(
      {
        error: fileName.endsWith(".pdf")
          ? "We could not extract text from this PDF. Please try a different PDF or paste your CV manually."
          : "We could not extract text from this DOCX file.",
      },
      { status: 500 },
    );
  }
}
