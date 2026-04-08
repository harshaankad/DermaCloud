import AWS from "aws-sdk";

// AWS S3 Configuration
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || "eu-north-1";
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET_NAME) {
  console.warn(
    "⚠️  AWS credentials not configured. S3 uploads will not work."
  );
}

// Configure AWS SDK
AWS.config.update({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
});

// Create S3 instance
export const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  signatureVersion: "v4",
});

// Export bucket name
export const BUCKET_NAME = AWS_S3_BUCKET_NAME || "";

// S3 folder structure
export const S3_FOLDERS = {
  // Tier 2 uploads
  TIER2_CLINICAL: "tier2/clinical",
  TIER2_DERMOSCOPIC: "tier2/dermoscopic",
  TIER2_BEFORE: "tier2/before",
  TIER2_AFTER: "tier2/after",

  // Generated reports
  REPORTS_PDF: "reports/pdf",
  REPORTS_WORD: "reports/word",

  // Clinic assets
  CLINIC_LOGOS: "clinics/logos",
  CLINIC_SEALS: "clinics/seals",
  DOCTOR_SIGNATURES: "clinics/signatures",
};

// Allowed file types
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// File size limits (in bytes)
export const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB
