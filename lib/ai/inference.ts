/**
 * AI Model Inference for Skin Condition Detection
 *
 * The ONNX model is hosted on a separate microservice (see ai-service/)
 * because it's too large for Vercel's 250 MB function limit. This module
 * just forwards the image bytes to that service over HTTPS.
 *
 * Env vars (set on Vercel):
 *   AI_API_URL  — e.g. https://dermacloud-ai.up.railway.app
 *   AI_API_KEY  — shared secret, must match the service
 *
 * If the env vars are missing or the service is unreachable, this module
 * degrades gracefully: predictSkinCondition returns null so image uploads
 * still succeed without AI analysis.
 */

const AI_API_URL = process.env.AI_API_URL;
const AI_API_KEY = process.env.AI_API_KEY;
const AI_TIMEOUT_MS = 30_000;

export interface Prediction {
  condition: string;
  probability: number;
  confidence: "high" | "medium" | "low";
}

export interface InferenceResult {
  predictions: Prediction[];
  topPrediction: Prediction;
  processingTime: number;
}

/**
 * Run skin-condition inference on an image buffer.
 * Returns null if the remote service is unavailable.
 */
export async function predictSkinCondition(
  imageBuffer: Buffer,
): Promise<InferenceResult | null> {
  if (!AI_API_URL) {
    console.warn("[ai] AI_API_URL not configured — skipping inference");
    return null;
  }

  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
    formData.append("file", blob, "image.jpg");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const res = await fetch(`${AI_API_URL}/predict`, {
      method: "POST",
      body: formData,
      headers: AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {},
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[ai] inference service returned ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = (await res.json()) as InferenceResult;
    return data;
  } catch (err) {
    console.warn("[ai] inference request failed:", (err as Error).message);
    return null;
  }
}

/**
 * Legacy no-op kept for backwards compat with scripts/test-ai-inference.ts
 * The remote service loads the model at its own startup — nothing to do here.
 */
export async function initializeModel(): Promise<void> {
  if (!AI_API_URL) {
    console.warn("[ai] AI_API_URL not configured");
  }
}

export function getLabels(): string[] {
  return [];
}

export function isModelReady(): boolean {
  return !!AI_API_URL;
}
