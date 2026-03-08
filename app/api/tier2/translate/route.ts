/**
 * Translation API
 * Uses Sarvam AI (Mayura) for accurate Hindi and Kannada translation.
 * Streams each translated chunk to the client as soon as it's ready.
 */

import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";

const SARVAM_ENDPOINT = "https://api.sarvam.ai/translate";
const MAX_CHARS = 900;

const LANG_CODES: Record<string, string> = {
  hindi: "hi-IN",
  kannada: "kn-IN",
};

/** Strip all markdown before sending to Sarvam — plain text translates more reliably */
function cleanForTranslation(text: string): string {
  return text
    .replace(/^##+ /gm, "")   // strip ## and ### heading prefixes
    .replace(/\*\*/g, "");     // strip bold markers
}

async function translateChunk(text: string, targetCode: string, apiKey: string): Promise<string> {
  const res = await fetch(SARVAM_ENDPOINT, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: cleanForTranslation(text),
      source_language_code: "en-IN",
      target_language_code: targetCode,
      speaker_gender: "Female",
      mode: "formal",
      model: "mayura:v1",
      enable_preprocessing: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const translated = data.translated_text;
  if (!translated) throw new Error("Empty response from Sarvam AI");
  return translated;
}


/** Split a long string into chunks ≤ MAX_CHARS on sentence then word boundaries */
function splitLongText(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?।])\s+/);
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > MAX_CHARS) {
      if (current) { chunks.push(current.trim()); current = ""; }
      const words = sentence.split(" ");
      for (const word of words) {
        if ((current + " " + word).trim().length > MAX_CHARS) {
          if (current) chunks.push(current.trim());
          current = word;
        } else {
          current = current ? current + " " + word : word;
        }
      }
    } else if (current && (current + " " + sentence).length > MAX_CHARS) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Translates text in order, calling `emit` with each translated piece as soon
 * as it arrives — so the client sees text appearing progressively.
 */
async function translateStreaming(
  text: string,
  targetCode: string,
  apiKey: string,
  emit: (chunk: string) => void
): Promise<void> {
  if (text.length <= MAX_CHARS) {
    const translated = await translateChunk(text, targetCode, apiKey);
    emit(translated);
    return;
  }

  // Split by double newlines, preserving separators
  const parts = text.split(/(\n\n+)/);

  for (const part of parts) {
    // Preserve blank separators as-is
    if (/^\n+$/.test(part) || part.trim() === "") {
      emit(part);
      continue;
    }

    if (part.length <= MAX_CHARS) {
      const translated = await translateChunk(part, targetCode, apiKey);
      emit(translated);
      continue;
    }

    // Split by single newlines, preserving them
    const lines = part.split(/(\n)/);
    for (const line of lines) {
      if (line === "\n" || line.trim() === "") {
        emit(line);
        continue;
      }

      if (line.length <= MAX_CHARS) {
        const translated = await translateChunk(line, targetCode, apiKey);
        emit(translated);
      } else {
        // Line too long — split into sentence/word chunks
        const subChunks = splitLongText(line);
        for (const sub of subChunks) {
          const translated = await translateChunk(sub, targetCode, apiKey);
          emit(translated + " ");
        }
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) return authResult;

    const { user: authUser } = authResult;
    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        { success: false, message: "This endpoint is only for Tier 2 users" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { text, targetLanguage } = body;

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { success: false, message: "Text and target language are required" },
        { status: 400 }
      );
    }

    const lang = targetLanguage.toLowerCase();
    if (!LANG_CODES[lang]) {
      return NextResponse.json(
        { success: false, message: "Unsupported language. Supported: hindi, kannada" },
        { status: 400 }
      );
    }

    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "SARVAM_API_KEY is not configured" },
        { status: 503 }
      );
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await translateStreaming(text, LANG_CODES[lang], apiKey, (chunk) => {
            controller.enqueue(encoder.encode(chunk));
          });
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to translate text", error: error.message },
      { status: 500 }
    );
  }
}
