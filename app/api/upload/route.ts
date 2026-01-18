import { NextRequest, NextResponse } from "next/server";
import {
  uploadToS3,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  S3_FOLDERS,
} from "@/lib/aws";
import { processImage, validateImage } from "@/lib/aws/image-processing";

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    // Get form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const folder = formData.get("folder") as keyof typeof S3_FOLDERS;
    const userId = formData.get("userId") as string;
    const clinicId = formData.get("clinicId") as string;
    const processImageFlag = formData.get("processImage") === "true";

    // Validation
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder is required" },
        { status: 400 }
      );
    }

    // Check file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    let fileBuffer = Buffer.from(arrayBuffer);

    // Validate image
    const validation = await validateImage(fileBuffer, MAX_IMAGE_SIZE / (1024 * 1024));
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Process image if requested
    let contentType = file.type;
    if (processImageFlag) {
      const processed = await processImage(fileBuffer, {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 90,
        format: "jpeg",
      });
      fileBuffer = processed.buffer;
      contentType = processed.contentType;
    }

    // Upload to S3
    const uploadResult = await uploadToS3(fileBuffer, contentType, {
      folder,
      userId: userId || undefined,
      clinicId: clinicId || undefined,
    });

    if (!uploadResult.success) {
      return NextResponse.json(
        { success: false, error: uploadResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: uploadResult.url,
      key: uploadResult.key,
    });
  } catch (error) {
    console.error("❌ Upload API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}
