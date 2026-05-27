import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCX_EXTRACTION_ERROR =
  "We could not extract text from this DOCX. Please try another file or paste your CV manually.";
const PDF_EXTRACTION_ERROR =
  "We could not extract text from this PDF. Please try another PDF or paste your CV manually.";

export async function POST(request: Request) {
  let file: File;

  try {
    const formData = await request.formData();
    const uploadedFile = formData.get("file");

    if (!(uploadedFile instanceof File)) {
      console.warn("CV extraction request did not include a file.");
      return jsonError("Please upload a CV file.", 400);
    }

    file = uploadedFile;
  } catch (error) {
    console.error("CV extraction could not read form data.", error);
    return jsonError(
      "We could not read the uploaded file. Please try again.",
      400,
    );
  }

  const fileName = file.name.toLowerCase();
  const fileSize = file.size;
  const isDocx = fileName.endsWith(".docx");
  const isPdf = fileName.endsWith(".pdf");

  console.info("CV extraction started.", {
    fileName,
    fileSize,
    fileType: file.type || "unknown",
  });

  if (!isDocx && !isPdf) {
    console.warn("CV extraction received an unsupported file type.", {
      fileName,
      fileSize,
      fileType: file.type || "unknown",
    });

    return jsonError(
      "Only DOCX and PDF extraction are supported by this endpoint.",
      400,
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = isPdf
      ? await extractPdfText(buffer)
      : await extractDocxText(buffer);

    if (!text) {
      console.warn("CV extraction completed without readable text.", {
        fileName,
        fileSize,
      });

      return jsonError(
        isPdf ? PDF_EXTRACTION_ERROR : DOCX_EXTRACTION_ERROR,
        422,
      );
    }

    console.info("CV extraction completed successfully.", {
      fileName,
      fileSize,
      extractedCharacters: text.length,
    });

    return NextResponse.json({ text });
  } catch (error) {
    console.error("CV extraction failed.", {
      fileName,
      fileSize,
      fileType: file.type || "unknown",
      error,
    });

    return jsonError(isPdf ? PDF_EXTRACTION_ERROR : DOCX_EXTRACTION_ERROR, 500);
  }
}

async function extractDocxText(buffer: Buffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.default.extractRawText({ buffer });

  return result.value.trim();
}

async function extractPdfText(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}
