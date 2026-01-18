import { NextResponse } from "next/server";
import { s3, BUCKET_NAME, S3_FOLDERS } from "@/lib/aws";

/**
 * Test S3 Connection
 * GET /api/test-s3
 */
export async function GET() {
  try {
    // Test 1: List buckets (verifies AWS credentials)
    const buckets = await s3.listBuckets().promise();

    // Test 2: Check if our bucket exists
    const bucketExists = buckets.Buckets?.some((b) => b.Name === BUCKET_NAME);

    return NextResponse.json({
      success: true,
      message: "✅ S3 connection successful",
      config: {
        bucket: BUCKET_NAME,
        region: process.env.AWS_REGION,
        bucketExists,
      },
      availableBuckets: buckets.Buckets?.map((b) => b.Name),
      configuredFolders: Object.values(S3_FOLDERS),
    });
  } catch (error) {
    console.error("❌ S3 Test Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "S3 connection failed",
        message: "Check your AWS credentials in .env.local",
        config: {
          hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
          hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
          bucket: BUCKET_NAME,
          region: process.env.AWS_REGION,
        },
      },
      { status: 500 }
    );
  }
}
