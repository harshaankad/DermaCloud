import { s3, BUCKET_NAME } from "./s3-config";

/**
 * Fetch an S3 object's bytes as a Buffer. Used server-side to embed stored
 * images (e.g. the doctor's signature) into generated PDFs.
 */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  try {
    const result = await s3.getObject({ Bucket: BUCKET_NAME, Key: key }).promise();
    if (!result.Body) return null;
    return Buffer.isBuffer(result.Body) ? result.Body : Buffer.from(result.Body as Uint8Array);
  } catch (error) {
    console.error("❌ S3 getObject error for key:", key, error);
    return null;
  }
}
