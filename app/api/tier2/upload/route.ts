import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { uploadToS3, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, S3_FOLDERS } from "@/lib/aws";
import { predictSkinCondition } from "@/lib/ai/inference";

export async function POST(request: NextRequest) {
  const authResult = await authMiddleware(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  try {
    const skipAI = request.nextUrl.searchParams.get("skipAI") === "true";
    const formData = await request.formData();
    const imageFiles = formData.getAll("images") as File[];

    if (!imageFiles || imageFiles.length === 0) {
      return NextResponse.json({ success: false, message: "No images provided" }, { status: 400 });
    }

    // Validate and process each image
    const imageBuffers: Buffer[] = [];
    for (const file of imageFiles) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return NextResponse.json(
          { success: false, message: `Invalid file type: ${file.type}` },
          { status: 400 }
        );
      }
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      if (buffer.length > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          { success: false, message: "Image exceeds 8MB limit" },
          { status: 400 }
        );
      }
      imageBuffers.push(buffer);
    }

    // Upload all images to S3
    const uploadResults = await Promise.all(
      imageBuffers.map((buffer, i) =>
        uploadToS3(buffer, imageFiles[i].type, {
          folder: "TIER2_DERMOSCOPIC",
          clinicId: user.clinicId?.toString(),
        })
      )
    );

    const failedUpload = uploadResults.find((r) => !r.success);
    if (failedUpload) {
      return NextResponse.json({ success: false, message: failedUpload.error }, { status: 500 });
    }

    const imageUrls = uploadResults.map((r) => r.url!);

    // Run AI inference if requested
    if (!skipAI) {
      const inferenceResults = await Promise.all(
        imageBuffers.map((buf) => predictSkinCondition(buf))
      );

      const validResults = inferenceResults.filter(Boolean);

      if (validResults.length > 0) {
        // Average scores across all images
        const allConditions = new Map<string, number[]>();
        for (const result of validResults) {
          for (const pred of result!.predictions) {
            if (!allConditions.has(pred.condition)) allConditions.set(pred.condition, []);
            allConditions.get(pred.condition)!.push(pred.probability);
          }
        }

        const averageScores = Array.from(allConditions.entries())
          .map(([condition, probs]) => ({
            condition,
            probability: probs.reduce((a, b) => a + b, 0) / probs.length,
            confidence: (probs.reduce((a, b) => a + b, 0) / probs.length) > 0.7
              ? "high"
              : (probs.reduce((a, b) => a + b, 0) / probs.length) > 0.4
              ? "medium"
              : "low",
          }))
          .sort((a, b) => b.probability - a.probability)
          .slice(0, 3);

        return NextResponse.json({
          success: true,
          data: {
            imageUrls,
            averageScores,
            finalResult: { predictions: averageScores, topPrediction: averageScores[0] },
          },
        });
      }
    }

    return NextResponse.json({ success: true, data: { imageUrls } });
  } catch (error) {
    console.error("❌ Tier2 upload error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
