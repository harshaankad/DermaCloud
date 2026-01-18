import { s3, BUCKET_NAME } from "./s3-config";

export interface DeleteResult {
  success: boolean;
  error?: string;
}

/**
 * Delete a file from S3
 * @param key - S3 object key (path) or full URL
 */
export async function deleteFromS3(key: string): Promise<DeleteResult> {
  try {
    // Extract key from URL if full URL is provided
    const s3Key = extractKeyFromUrl(key);

    const params = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
    };

    await s3.deleteObject(params).promise();

    return { success: true };
  } catch (error) {
    console.error("❌ S3 Delete Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}

/**
 * Delete multiple files from S3
 */
export async function deleteMultipleFromS3(
  keys: string[]
): Promise<DeleteResult[]> {
  const deletePromises = keys.map((key) => deleteFromS3(key));
  return Promise.all(deletePromises);
}

/**
 * Delete all files in a folder (useful for cleanup)
 * WARNING: Use with caution
 */
export async function deleteFolder(prefix: string): Promise<DeleteResult> {
  try {
    // List all objects with the prefix
    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    };

    const listedObjects = await s3.listObjectsV2(listParams).promise();

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      return { success: true };
    }

    // Delete all objects
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: listedObjects.Contents.map((obj) => ({ Key: obj.Key! })),
      },
    };

    await s3.deleteObjects(deleteParams).promise();

    // If there are more objects (pagination), delete recursively
    if (listedObjects.IsTruncated) {
      await deleteFolder(prefix);
    }

    return { success: true };
  } catch (error) {
    console.error("❌ S3 Folder Delete Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Folder delete failed",
    };
  }
}

/**
 * Extract S3 key from full URL
 * Example: https://bucket.s3.region.amazonaws.com/path/to/file.jpg -> path/to/file.jpg
 */
function extractKeyFromUrl(urlOrKey: string): string {
  // If it's already a key (doesn't start with http), return as is
  if (!urlOrKey.startsWith("http")) {
    return urlOrKey;
  }

  try {
    const url = new URL(urlOrKey);
    // Remove leading slash
    return url.pathname.substring(1);
  } catch (error) {
    // If URL parsing fails, assume it's already a key
    return urlOrKey;
  }
}
