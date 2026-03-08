/**
 * Cleanup S3 Test Files
 * Deletes all test files uploaded to S3
 *
 * Usage: npm run test:s3:cleanup
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

async function cleanupTestFiles() {
  console.log("🧹 Cleaning up S3 test files...\n");

  try {
    // List of test folders to clean
    const testPrefixes = [
      "tier1/scans/test-user-123/",
      "tier2/clinical/clinic-test/",
      "tier2/dermoscopic/clinic-test/",
    ];

    let totalDeleted = 0;

    for (const prefix of testPrefixes) {
      console.log(`🔍 Checking folder: ${prefix}`);

      // List all objects with this prefix
      const listParams = {
        Bucket: BUCKET_NAME,
        Prefix: prefix,
      };

      const listedObjects = await s3.listObjectsV2(listParams).promise();

      if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
        console.log(`   ℹ️  No files found\n`);
        continue;
      }

      console.log(`   📦 Found ${listedObjects.Contents.length} file(s)`);

      // Delete all objects
      for (const obj of listedObjects.Contents) {
        await s3
          .deleteObject({
            Bucket: BUCKET_NAME,
            Key: obj.Key!,
          })
          .promise();

        console.log(`   ✅ Deleted: ${obj.Key}`);
        totalDeleted++;
      }

      console.log("");
    }

    console.log("=" + "=".repeat(60));
    console.log(`✨ CLEANUP COMPLETE!`);
    console.log("=" + "=".repeat(60));
    console.log(`\n🗑️  Total files deleted: ${totalDeleted}`);

    if (totalDeleted === 0) {
      console.log("ℹ️  No test files found. Bucket is already clean!\n");
    } else {
      console.log("✅ All test files have been removed from S3.\n");
    }
  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    process.exit(1);
  }
}

cleanupTestFiles();
