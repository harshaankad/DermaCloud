/**
 * AI Model Inference for Skin Condition Detection
 * Uses ONNX Runtime to run the trained Vision Transformer model
 */

import path from "path";
import fs from "fs/promises";

// Load labels
const LABELS_PATH = path.join(process.cwd(), "labels.json");
const MODEL_PATH = path.join(process.cwd(), "skin_condition_model.onnx");

let labels: string[] = [];
let session: any = null; // onnxruntime-node InferenceSession (loaded dynamically)

/**
 * Initialize the AI model and load labels
 */
let modelUnavailable = false;

export async function initializeModel(): Promise<void> {
  try {
    // Check if model file exists
    await fs.access(MODEL_PATH);

    // Load labels
    const labelsData = await fs.readFile(LABELS_PATH, "utf-8");
    labels = JSON.parse(labelsData);
    console.log(`✅ Loaded ${labels.length} skin condition labels`);

    // Load ONNX model (dynamic import keeps onnxruntime-node out of the bundle)
    const ort = await import("onnxruntime-node");
    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["cpu"],
    });
    console.log("✅ ONNX model loaded successfully");
  } catch (error) {
    console.warn("⚠️ AI model not available — running without skin condition detection:", (error as Error).message);
    modelUnavailable = true;
  }
}

/**
 * Preprocess image for the model
 * Input: Image buffer
 * Output: Float32Array of shape [1, 3, 224, 224] with ImageNet normalization
 */
async function preprocessImage(imageBuffer: Buffer): Promise<Float32Array> {
  try {
    // Resize and convert to RGB
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(imageBuffer)
      .resize(224, 224, {
        fit: "cover",
        position: "center",
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // ImageNet normalization constants
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    // Create tensor [1, 3, 224, 224]
    const tensorData = new Float32Array(1 * 3 * 224 * 224);

    // Convert HWC (Height, Width, Channels) to CHW (Channels, Height, Width) and normalize
    for (let c = 0; c < 3; c++) {
      for (let h = 0; h < 224; h++) {
        for (let w = 0; w < 224; w++) {
          const hwcIndex = (h * 224 + w) * 3 + c;
          const chwIndex = c * 224 * 224 + h * 224 + w;

          // Normalize: (pixel / 255 - mean) / std
          const pixelValue = data[hwcIndex] / 255.0;
          tensorData[chwIndex] = (pixelValue - mean[c]) / std[c];
        }
      }
    }

    return tensorData;
  } catch (error) {
    console.error("❌ Image preprocessing failed:", error);
    throw new Error("Failed to preprocess image");
  }
}

/**
 * Apply softmax to convert logits to probabilities
 */
function softmax(logits: Float32Array): number[] {
  const maxLogit = Math.max(...Array.from(logits));
  const exps = Array.from(logits).map((x) => Math.exp(x - maxLogit));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sumExps);
}

/**
 * Prediction result interface
 */
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
 * Run inference on an image
 */
export async function predictSkinCondition(
  imageBuffer: Buffer
): Promise<InferenceResult | null> {
  const startTime = Date.now();

  try {
    // Initialize model if not already loaded
    if (!session && !modelUnavailable && labels.length === 0) {
      await initializeModel();
    }

    if (modelUnavailable || !session) {
      return null;
    }

    // Preprocess image
    const tensorData = await preprocessImage(imageBuffer);

    // Create input tensor (ort already loaded when session was created)
    const ort = await import("onnxruntime-node");
    const inputTensor = new ort.Tensor("float32", tensorData, [1, 3, 224, 224]);

    // Run inference
    const feeds = { input: inputTensor };
    const results = await session.run(feeds);

    // Get output logits
    const output = results.output;
    const logits = output.data as Float32Array;

    // Convert to probabilities
    const probabilities = softmax(logits);

    // Get top 3 predictions
    const indexedProbs = probabilities.map((prob, idx) => ({ idx, prob }));
    indexedProbs.sort((a, b) => b.prob - a.prob);
    const top3 = indexedProbs.slice(0, 3);

    // Format predictions
    const predictions: Prediction[] = top3.map(({ idx, prob }) => ({
      condition: labels[idx],
      probability: prob,
      confidence:
        prob > 0.7 ? "high" : prob > 0.4 ? "medium" : "low",
    }));

    const processingTime = Date.now() - startTime;

    return {
      predictions,
      topPrediction: predictions[0],
      processingTime,
    };
  } catch (error) {
    console.error("❌ Inference failed:", error);
    throw new Error("AI inference failed");
  }
}

/**
 * Get all available skin condition labels
 */
export function getLabels(): string[] {
  return labels;
}

/**
 * Check if model is initialized
 */
export function isModelReady(): boolean {
  return session !== null && labels.length > 0;
}
