import sharp from "sharp";

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: "jpeg" | "png" | "webp";
}

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
  size: number;
}

/**
 * Process and optimize image
 * - Resize to max dimensions
 * - Compress to reduce file size
 * - Convert to optimal format
 */
export async function processImage(
  imageBuffer: Buffer,
  options: ImageProcessingOptions = {}
): Promise<ProcessedImage> {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 90,
    format = "jpeg",
  } = options;

  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    // Resize if needed
    if (
      metadata.width! > maxWidth ||
      metadata.height! > maxHeight
    ) {
      image.resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Convert and compress
    let processedBuffer: Buffer;
    let contentType: string;

    switch (format) {
      case "jpeg":
        processedBuffer = await image.jpeg({ quality }).toBuffer();
        contentType = "image/jpeg";
        break;
      case "png":
        processedBuffer = await image.png({ quality }).toBuffer();
        contentType = "image/png";
        break;
      case "webp":
        processedBuffer = await image.webp({ quality }).toBuffer();
        contentType = "image/webp";
        break;
      default:
        processedBuffer = await image.jpeg({ quality }).toBuffer();
        contentType = "image/jpeg";
    }

    const processedMetadata = await sharp(processedBuffer).metadata();

    return {
      buffer: processedBuffer,
      contentType,
      width: processedMetadata.width!,
      height: processedMetadata.height!,
      size: processedBuffer.length,
    };
  } catch (error) {
    console.error("❌ Image Processing Error:", error);
    throw new Error("Failed to process image");
  }
}

/**
 * Generate thumbnail from image
 */
export async function generateThumbnail(
  imageBuffer: Buffer,
  size: number = 300
): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(size, size, { fit: "cover" })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Validate image file
 */
export async function validateImage(
  imageBuffer: Buffer,
  maxSizeInMB: number = 8
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check file size
    const sizeInMB = imageBuffer.length / (1024 * 1024);
    if (sizeInMB > maxSizeInMB) {
      return {
        valid: false,
        error: `Image size exceeds ${maxSizeInMB}MB limit`,
      };
    }

    // Validate image format using sharp
    const metadata = await sharp(imageBuffer).metadata();

    if (!metadata.format) {
      return {
        valid: false,
        error: "Invalid image format",
      };
    }

    // Check if format is supported
    const supportedFormats = ["jpeg", "png", "webp"];
    if (!supportedFormats.includes(metadata.format)) {
      return {
        valid: false,
        error: `Unsupported format. Use: ${supportedFormats.join(", ")}`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: "Invalid image file",
    };
  }
}

/**
 * Get image metadata
 */
export async function getImageMetadata(imageBuffer: Buffer) {
  return sharp(imageBuffer).metadata();
}

/**
 * Create a watermarked image (for reports/downloads)
 */
export async function addWatermark(
  imageBuffer: Buffer,
  watermarkText: string
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  // Create SVG watermark
  const watermarkSvg = Buffer.from(`
    <svg width="${metadata.width}" height="${metadata.height}">
      <text
        x="50%"
        y="50%"
        font-family="Arial"
        font-size="24"
        fill="rgba(255, 255, 255, 0.5)"
        text-anchor="middle"
      >
        ${watermarkText}
      </text>
    </svg>
  `);

  return image.composite([{ input: watermarkSvg }]).toBuffer();
}
