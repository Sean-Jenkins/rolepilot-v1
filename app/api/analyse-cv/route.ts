import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    targetRoles: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5,
    },
    skills: {
      type: "array",
      items: { type: "string" },
      minItems: 5,
      maxItems: 10,
    },
    industries: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5,
    },
    seniority: { type: "string" },
    keywords: {
      type: "array",
      items: { type: "string" },
      minItems: 5,
      maxItems: 10,
    },
    profileSummary: { type: "string" },
    matchScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },
    sampleJobs: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          location: { type: "string" },
        },
        required: ["title", "company", "location"],
      },
    },
  },
  required: [
    "targetRoles",
    "skills",
    "industries",
    "seniority",
    "keywords",
    "profileSummary",
    "matchScore",
    "sampleJobs",
  ],
} as const;

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured." },
      { status: 500 },
    );
  }

  let cvText = "";

  try {
    const body = (await request.json()) as { cvText?: unknown };
    cvText = typeof body.cvText === "string" ? body.cvText.trim() : "";
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!cvText) {
    return NextResponse.json(
      { error: "Please provide CV text before analysing." },
      { status: 400 },
    );
  }

  try {
    const controller = new AbortController();
    const timeout = windowlessSetTimeout(() => controller.abort(), 30000);

    const response = await openai.responses.create(
      {
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "You analyse CVs for job search planning. Return concise, practical, non-invented guidance based only on the CV text. If evidence is weak, make cautious inferences.",
          },
          {
            role: "user",
            content: `Analyse this CV and return structured job-search guidance:\n\n${cvText}`,
          },
        ],
        max_output_tokens: 1200,
        text: {
          format: {
            type: "json_schema",
            name: "cv_analysis",
            strict: true,
            schema: analysisSchema,
          },
        },
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const parsed = JSON.parse(response.output_text);

    return NextResponse.json({ analysis: parsed });
  } catch (error) {
    console.error("CV analysis failed", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "The AI returned an invalid response. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "CV analysis failed. Please try again." },
      { status: 500 },
    );
  }
}

function windowlessSetTimeout(callback: () => void, milliseconds: number) {
  return setTimeout(callback, milliseconds);
}
