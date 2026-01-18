/**
 * Tier 1 Scans API - Get scan history
 */

import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import Tier1Scan from "@/models/Tier1Scan";
import { getSignedUrl } from "@/lib/aws/signed-url";

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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Fetch scans with pagination
    const [scans, totalCount] = await Promise.all([
      Tier1Scan.find({ userId: authUser.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Tier1Scan.countDocuments({ userId: authUser.userId }),
    ]);

    // Generate signed URLs for images
    const scansWithSignedUrls = scans.map((scan) => {
      // Generate signed URLs for all images
      const imagesWithSignedUrls = scan.images.map((img) => ({
        imageUrl: getSignedUrl(img.s3Key, 3600),
        s3Key: img.s3Key,
        aiResult: img.aiResult,
      }));

      return {
        id: scan._id,
        images: imagesWithSignedUrls,
        finalResult: scan.finalResult,
        patientInfo: scan.patientInfo,
        notes: scan.notes,
        status: scan.status,
        createdAt: scan.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        scans: scansWithSignedUrls,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: skip + limit < totalCount,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    console.error("Get scans error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch scans",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
