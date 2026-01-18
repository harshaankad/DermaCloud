/**
 * Tier 1 Image Upload and AI Analysis API
 * Handles image upload, AI inference, and result storage
 */

import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { predictSkinCondition, initializeModel } from "@/lib/ai/inference";
import { uploadToS3 } from "@/lib/aws/upload";
import { connectDB } from "@/lib/db/connection";
import Tier1Scan from "@/models/Tier1Scan";
import User from "@/models/User";
import sharp from "sharp";
import { getSignedUrl } from "@/lib/aws/signed-url";

// Initialize AI model on server startup
let modelInitialized = false;
async function ensureModelReady() {
  if (!modelInitialized) {
    await initializeModel();
    modelInitialized = true;
  }
}

// File size limit: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed image types
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

// Usage limits for Tier 1
const DAILY_LIMIT = 5;
const MONTHLY_LIMIT = 120;

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    // Verify user is Tier 1 or Tier 2 (Tier 2 can use AI analysis for dermoscope images)
    if (authUser.tier !== "tier1" && authUser.tier !== "tier2") {
      return NextResponse.json(
        {
          success: false,
          message: "This endpoint is only for Tier 1 and Tier 2 users",
        },
        { status: 403 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();

    // Get multiple images (1-5) - support both naming conventions
    const imageFiles: File[] = [];

    // Try indexed format (image0, image1, etc.)
    for (let i = 0; i < 5; i++) {
      const file = formData.get(`image${i}`) as File;
      if (file) {
        imageFiles.push(file);
      }
    }

    // Also try "images" format for multiple files
    if (imageFiles.length === 0) {
      const files = formData.getAll("images") as File[];
      imageFiles.push(...files.slice(0, 5)); // Max 5 images
    }

    const patientName = formData.get("patientName") as string;
    const patientAge = formData.get("patientAge") as string;
    const patientGender = formData.get("patientGender") as string;
    const notes = formData.get("notes") as string;

    // Validate image count
    if (imageFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No image files provided",
        },
        { status: 400 }
      );
    }

    if (imageFiles.length > 5) {
      return NextResponse.json(
        {
          success: false,
          message: "Maximum 5 images allowed per scan",
        },
        { status: 400 }
      );
    }

    // Validate each file
    for (const file of imageFiles) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          {
            success: false,
            message: `Invalid file type for ${file.name}. Only JPEG, PNG, and WebP are allowed`,
          },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            success: false,
            message: `File ${file.name} too large. Maximum size is 10MB`,
          },
          { status: 400 }
        );
      }
    }

    // Connect to database
    await connectDB();

    // Check usage limits (only for Tier 1 users)
    let dailyCount = 0;
    let monthlyCount = 0;

    if (authUser.tier === "tier1") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      [dailyCount, monthlyCount] = await Promise.all([
        Tier1Scan.countDocuments({
          userId: authUser.userId,
          createdAt: { $gte: today },
        }),
        Tier1Scan.countDocuments({
          userId: authUser.userId,
          createdAt: { $gte: firstDayOfMonth },
        }),
      ]);

      if (dailyCount >= DAILY_LIMIT) {
        return NextResponse.json(
          {
            success: false,
            message: `Daily limit reached. You can upload ${DAILY_LIMIT} scans per day`,
            dailyUsed: dailyCount,
            dailyLimit: DAILY_LIMIT,
          },
          { status: 429 }
        );
      }

      if (monthlyCount >= MONTHLY_LIMIT) {
        return NextResponse.json(
          {
            success: false,
            message: `Monthly limit reached. You can upload ${MONTHLY_LIMIT} scans per month`,
            monthlyUsed: monthlyCount,
            monthlyLimit: MONTHLY_LIMIT,
          },
          { status: 429 }
        );
      }
    }

    // Ensure AI model is ready
    await ensureModelReady();

    // Process each image: upload, AI inference
    const imageResults = [];
    let totalProcessingTime = 0;

    for (const file of imageFiles) {
      // Convert File to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Process image with Sharp
      const processedImage = await sharp(buffer)
        .resize(1024, 1024, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Run AI inference
      const aiResult = await predictSkinCondition(processedImage);
      totalProcessingTime += aiResult.processingTime;

      // Upload to S3
      const s3Result = await uploadToS3(processedImage, "image/jpeg", {
        folder: "tier1Scans",
        userId: authUser.userId,
      });

      // Check upload success
      if (!s3Result.success || !s3Result.key) {
        return NextResponse.json(
          {
            success: false,
            message: `Failed to upload ${file.name} to S3`,
            error: s3Result.error,
          },
          { status: 500 }
        );
      }

      imageResults.push({
        imageUrl: s3Result.url,
        s3Key: s3Result.key,
        aiResult: {
          predictions: aiResult.predictions.map((p) => ({
            condition: p.condition,
            probability: p.probability,
            confidence: p.confidence,
          })),
          topPrediction: {
            condition: aiResult.topPrediction.condition,
            probability: aiResult.topPrediction.probability,
            confidence: aiResult.topPrediction.confidence,
          },
          processingTime: aiResult.processingTime,
        },
      });
    }

    // Calculate averaged predictions
    // Create a map to store sum of probabilities for each condition
    const conditionSums = new Map<string, number>();
    const conditionCounts = new Map<string, number>();

    // Sum up probabilities for each condition across all images
    for (const result of imageResults) {
      for (const prediction of result.aiResult.predictions) {
        const current = conditionSums.get(prediction.condition) || 0;
        conditionSums.set(prediction.condition, current + prediction.probability);

        const count = conditionCounts.get(prediction.condition) || 0;
        conditionCounts.set(prediction.condition, count + 1);
      }
    }

    // Calculate averages
    const averagedPredictions = Array.from(conditionSums.entries()).map(([condition, sum]) => {
      const count = conditionCounts.get(condition) || 1;
      const avgProbability = sum / count;

      // Determine confidence level
      let confidence: "high" | "medium" | "low";
      if (avgProbability >= 0.7) confidence = "high";
      else if (avgProbability >= 0.4) confidence = "medium";
      else confidence = "low";

      return {
        condition,
        probability: avgProbability,
        confidence,
      };
    });

    // Sort by probability and get top 3
    averagedPredictions.sort((a, b) => b.probability - a.probability);
    const top3Averaged = averagedPredictions.slice(0, 3);

    const finalResult = {
      predictions: top3Averaged,
      topPrediction: top3Averaged[0],
      processingTime: totalProcessingTime,
    };

    // For Tier 2 users, just return AI results without saving scan record
    if (authUser.tier === "tier2") {
      // Calculate average scores as percentages for ALL conditions
      // Map full condition names to abbreviations (based on labels.json)
      const conditionMap: Record<string, string> = {
        "Alopecia areata": "AA",
        "Basal cell carcinoma": "BCC",
        "Eczema": "ECZ",
        "Herpes Zoster": "HZ",
        "LP": "LP",
        "Nevus Depigmentosus": "ND",
        "Psoriasis": "PSO",
        "Tinea incognito": "TI",
        "Viral warts": "VW",
        "Vitiligo": "VIT",
      };

      const averageScores: any = {};

      // Get all predictions (not just top 3)
      for (const prediction of averagedPredictions) {
        const abbrev = conditionMap[prediction.condition] || prediction.condition;
        averageScores[abbrev] = prediction.probability * 100; // Convert to percentage
      }

      // Add topPrediction to averageScores for easier access
      averageScores.topPrediction = {
        condition: top3Averaged[0].condition,
        probability: top3Averaged[0].probability,
        confidence: top3Averaged[0].confidence,
      };

      return NextResponse.json({
        success: true,
        message: `${imageFiles.length} image(s) analyzed successfully`,
        data: {
          imageUrls: imageResults.map(r => r.imageUrl),
          imageCount: imageFiles.length,
          averageScores,
          finalResult,
        },
      });
    }

    // For Tier 1 users, create scan record and update usage
    const scan = await Tier1Scan.create({
      userId: authUser.userId,
      images: imageResults,
      finalResult,
      patientInfo: {
        name: patientName || "Unknown",
        age: patientAge ? parseInt(patientAge) : undefined,
        gender: patientGender && patientGender.trim() !== "" ? (patientGender as "male" | "female" | "other") : undefined,
      },
      notes: notes && notes.trim() !== "" ? notes : undefined,
      status: "completed",
    });

    // Update user's scan counts
    await User.findByIdAndUpdate(authUser.userId, {
      $inc: {
        "tier1Usage.scansUsedToday": 1,
        "tier1Usage.scansUsedThisMonth": 1,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${imageFiles.length} image(s) uploaded and analyzed successfully`,
      data: {
        scanId: scan._id,
        imageCount: imageFiles.length,
        finalResult,
        usage: {
          dailyUsed: dailyCount + 1,
          dailyLimit: DAILY_LIMIT,
          monthlyUsed: monthlyCount + 1,
          monthlyLimit: MONTHLY_LIMIT,
        },
      },
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Upload failed",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch user's usage statistics
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    // Verify user is Tier 1
    if (authUser.tier !== "tier1") {
      return NextResponse.json(
        {
          success: false,
          message: "This endpoint is only for Tier 1 users",
        },
        { status: 403 }
      );
    }

    await connectDB();

    // Get usage stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [dailyCount, monthlyCount, totalScans, recentScans] = await Promise.all([
      Tier1Scan.countDocuments({
        userId: authUser.userId,
        createdAt: { $gte: today },
      }),
      Tier1Scan.countDocuments({
        userId: authUser.userId,
        createdAt: { $gte: firstDayOfMonth },
      }),
      Tier1Scan.countDocuments({
        userId: authUser.userId,
      }),
      Tier1Scan.find({
        userId: authUser.userId,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("createdAt images finalResult.topPrediction patientInfo status"),
    ]);

    // Generate signed URLs for recent scans
    const recentScansWithSignedUrls = recentScans.map((scan) => {
      const imagesWithSignedUrls = scan.images.map((img) => ({
        imageUrl: getSignedUrl(img.s3Key, 3600),
        s3Key: img.s3Key,
        aiResult: img.aiResult,
      }));

      return {
        id: scan._id,
        createdAt: scan.createdAt,
        images: imagesWithSignedUrls,
        finalResult: scan.finalResult,
        patientInfo: scan.patientInfo,
        status: scan.status,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        usage: {
          dailyUsed: dailyCount,
          dailyLimit: DAILY_LIMIT,
          dailyRemaining: Math.max(0, DAILY_LIMIT - dailyCount),
          monthlyUsed: monthlyCount,
          monthlyLimit: MONTHLY_LIMIT,
          monthlyRemaining: Math.max(0, MONTHLY_LIMIT - monthlyCount),
          totalScans,
        },
        recentScans: recentScansWithSignedUrls,
      },
    });
  } catch (error: any) {
    console.error("Get usage error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch usage statistics",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
