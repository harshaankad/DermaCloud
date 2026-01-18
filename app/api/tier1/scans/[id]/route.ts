/**
 * Tier 1 Single Scan API - Get individual scan details
 */

import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import Tier1Scan from "@/models/Tier1Scan";
import { getSignedUrl } from "@/lib/aws/signed-url";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    await connectDB();

    // Fetch scan
    const scan = await Tier1Scan.findById(params.id);

    if (!scan) {
      return NextResponse.json(
        {
          success: false,
          message: "Scan not found",
        },
        { status: 404 }
      );
    }

    // Verify ownership
    if (scan.userId.toString() !== authUser.userId) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized access to this scan",
        },
        { status: 403 }
      );
    }

    // Generate signed URLs for all images
    const imagesWithSignedUrls = scan.images.map((img) => ({
      imageUrl: getSignedUrl(img.s3Key, 3600),
      s3Key: img.s3Key,
      aiResult: img.aiResult,
    }));

    return NextResponse.json({
      success: true,
      data: {
        scan: {
          id: scan._id,
          images: imagesWithSignedUrls,
          finalResult: scan.finalResult,
          patientInfo: scan.patientInfo,
          notes: scan.notes,
          status: scan.status,
          createdAt: scan.createdAt,
          updatedAt: scan.updatedAt,
        },
      },
    });
  } catch (error: any) {
    console.error("Get scan error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch scan",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// DELETE endpoint to remove a scan
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    await connectDB();

    // Fetch scan
    const scan = await Tier1Scan.findById(params.id);

    if (!scan) {
      return NextResponse.json(
        {
          success: false,
          message: "Scan not found",
        },
        { status: 404 }
      );
    }

    // Verify ownership
    if (scan.userId.toString() !== authUser.userId) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized access to this scan",
        },
        { status: 403 }
      );
    }

    // Delete scan (S3 image will remain for backup purposes)
    await Tier1Scan.findByIdAndDelete(params.id);

    return NextResponse.json({
      success: true,
      message: "Scan deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete scan error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete scan",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
