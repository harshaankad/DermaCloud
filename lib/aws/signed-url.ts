import { s3, BUCKET_NAME } from "./s3-config";

/**
 * Generate a signed URL for temporary secure access to a private S3 object
 * @param key - S3 object key (path)
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 */
export function getSignedUrl(key: string, expiresIn: number = 3600): string {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: expiresIn, // Expires in seconds
  };

  return s3.getSignedUrl("getObject", params);
}

/**
 * Generate signed URL for upload (allows client to upload directly to S3)
 * @param key - S3 object key (path) where file will be uploaded
 * @param contentType - MIME type of the file
 * @param expiresIn - URL expiration time in seconds (default: 15 minutes)
 */
export function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 900
): string {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: expiresIn,
    ContentType: contentType,
  };

  return s3.getSignedUrl("putObject", params);
}

/**
 * Generate multiple signed URLs
 */
export function getMultipleSignedUrls(
  keys: string[],
  expiresIn: number = 3600
): string[] {
  return keys.map((key) => getSignedUrl(key, expiresIn));
}

/**
 * Check if a URL is expired (for signed URLs with expiration in query param)
 */
export function isUrlExpired(signedUrl: string): boolean {
  try {
    const url = new URL(signedUrl);
    const expires = url.searchParams.get("X-Amz-Expires");
    const date = url.searchParams.get("X-Amz-Date");

    if (!expires || !date) {
      return true; // If params missing, consider expired
    }

    // Parse ISO date format (YYYYMMDDTHHMMSSZ)
    const year = parseInt(date.substring(0, 4));
    const month = parseInt(date.substring(4, 6)) - 1;
    const day = parseInt(date.substring(6, 8));
    const hour = parseInt(date.substring(9, 11));
    const minute = parseInt(date.substring(11, 13));
    const second = parseInt(date.substring(13, 15));

    const signedDate = new Date(Date.UTC(year, month, day, hour, minute, second));
    const expirationDate = new Date(
      signedDate.getTime() + parseInt(expires) * 1000
    );

    return Date.now() > expirationDate.getTime();
  } catch (error) {
    return true; // If parsing fails, consider expired
  }
}
