import { s3, BUCKET_NAME, S3_FOLDERS } from "./s3-config";
import { v4 as uuidv4 } from "uuid";

export interface UploadOptions {
  folder: keyof typeof S3_FOLDERS;
  userId?: string;
  clinicId?: string;
  customFileName?: string;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

/**
 * Upload file to S3
 * @param file - File buffer or stream
 * @param contentType - MIME type of the file
 * @param options - Upload options (folder, userId, etc.)
 */
export async function uploadToS3(
  file: Buffer,
  contentType: string,
  options: UploadOptions
): Promise<UploadResult> {
  try {
    // Generate unique filename
    const fileExtension = getFileExtension(contentType);
    const timestamp = Date.now();
    const uniqueId = uuidv4().split("-")[0]; // Short UUID
    const fileName =
      options.customFileName ||
      `${timestamp}-${uniqueId}.${fileExtension}`;

    // Construct S3 key (path)
    const folder = S3_FOLDERS[options.folder];
    let key = `${folder}/${fileName}`;

    // Add userId or clinicId to path if provided
    if (options.userId) {
      key = `${folder}/${options.userId}/${fileName}`;
    } else if (options.clinicId) {
      key = `${folder}/${options.clinicId}/${fileName}`;
    }

    // Upload parameters
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
      // ACL: "private", // Ensure files are private
      ServerSideEncryption: "AES256", // Encrypt at rest
    };

    // Upload to S3
    const uploadResult = await s3.upload(params).promise();

    return {
      success: true,
      url: uploadResult.Location,
      key: uploadResult.Key,
    };
  } catch (error) {
    console.error("❌ S3 Upload Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Get file extension from MIME type
 */
function getFileExtension(contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
  };

  return extensions[contentType] || "bin";
}

/**
 * Upload multiple files to S3
 */
export async function uploadMultipleToS3(
  files: Array<{ buffer: Buffer; contentType: string }>,
  options: UploadOptions
): Promise<UploadResult[]> {
  const uploadPromises = files.map((file) =>
    uploadToS3(file.buffer, file.contentType, options)
  );

  return Promise.all(uploadPromises);
}
