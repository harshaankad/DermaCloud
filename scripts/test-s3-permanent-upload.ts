/**
 * Test S3 Upload - Permanent File
 * This script uploads a file and KEEPS it so you can see it in AWS Console
 *
 * Usage: npm run test:s3:permanent
 */

// Load environment variables from .env.local FIRST
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

// Now import AWS after env is loaded
import AWS from "aws-sdk";

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "eu-north-1",
});

const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  signatureVersion: "v4",
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

async function uploadPermanentFile() {
  console.log("🔍 Uploading Permanent Test File to S3...\n");

  try {
    const timestamp = new Date().toISOString();
    const testContent = Buffer.from(`
🏥 DermaHMS Test Upload
=====================

This is a test file to verify S3 upload functionality.

Uploaded at: ${timestamp}
Bucket: ${BUCKET_NAME}
Region: ${process.env.AWS_REGION}

✅ If you can see this file in AWS Console, your S3 setup is working!
    `);

    // Upload to multiple folders to test organization
    const uploads = [
      {
        key: `tier1/scans/test-user-123/test-${Date.now()}.txt`,
        folder: "Tier 1 Scans",
      },
      {
        key: `tier2/clinical/clinic-test/test-${Date.now()}.txt`,
        folder: "Tier 2 Clinical",
      },
      {
        key: `tier2/dermoscopic/clinic-test/test-${Date.now()}.txt`,
        folder: "Tier 2 Dermoscopic",
      },
    ];

    console.log("📤 Uploading test files...\n");

    for (const upload of uploads) {
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: upload.key,
        Body: testContent,
        ContentType: "text/plain",
        ServerSideEncryption: "AES256",
      };

      const result = await s3.upload(uploadParams).promise();

      console.log(`✅ ${upload.folder}:`);
      console.log(`   📁 Key: ${result.Key}`);
      console.log(`   🔗 URL: ${result.Location}`);
      console.log("");
    }

    console.log("=" + "=".repeat(70));
    console.log("✨ FILES UPLOADED SUCCESSFULLY!");
    console.log("=" + "=".repeat(70));
    console.log("\n📋 How to view in AWS Console:");
    console.log("   1. Go to: https://s3.console.aws.amazon.com/s3/buckets");
    console.log(`   2. Click on bucket: ${BUCKET_NAME}`);
    console.log("   3. Browse folders:");
    console.log("      • tier1/scans/test-user-123/");
    console.log("      • tier2/clinical/clinic-test/");
    console.log("      • tier2/dermoscopic/clinic-test/");
    console.log("\n💡 These files will stay in S3 until you delete them.");
    console.log("   You can delete them from AWS Console or run: npm run test:s3:cleanup\n");

  } catch (error) {
    console.error("\n❌ Upload failed:", error);
    process.exit(1);
  }
}

uploadPermanentFile();
