import { NextResponse } from "next/server";
import { z } from "zod";

import { generateWwjdResponse } from "@/lib/wwjd";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000)
});

const inputSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(messageSchema).max(20).default([])
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = inputSchema.parse(json);

    const response = await generateWwjdResponse({
      message: input.message,
      history: input.history
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid WWJD input." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unable to generate WWJD response right now." },
      { status: 500 }
    );
  }
}
