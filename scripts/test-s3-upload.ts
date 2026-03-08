/**
 * Test S3 Upload
 * This script tests S3 connection and upload functionality
 *
 * Usage: npm run test:s3
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

import fs from "fs";

async function testS3Connection() {
  console.log("🔍 Testing AWS S3 Connection...\n");
  console.log("📋 Environment Check:");
  console.log(`   AWS_S3_BUCKET_NAME from env: "${process.env.AWS_S3_BUCKET_NAME}"`);
  console.log(`   BUCKET_NAME from config: "${BUCKET_NAME}"`);
  console.log("");

  try {
    // Test 1: List buckets
    console.log("1️⃣  Testing AWS credentials...");
    const buckets = await s3.listBuckets().promise();
    console.log("   ✅ AWS credentials valid");
    console.log(`   📦 Found ${buckets.Buckets?.length || 0} buckets`);

    // Test 2: Check if our bucket exists
    console.log("\n2️⃣  Checking bucket existence...");
    const bucketExists = buckets.Buckets?.some((b) => b.Name === BUCKET_NAME);

    if (bucketExists) {
      console.log(`   ✅ Bucket '${BUCKET_NAME}' exists`);
    } else {
      console.log(`   ❌ Bucket '${BUCKET_NAME}' NOT found`);
      console.log(`   📋 Available buckets:`, buckets.Buckets?.map(b => b.Name));
      console.log(`\n   ⚠️  Please create bucket '${BUCKET_NAME}' in region 'eu-north-1'`);
      return false;
    }

    // Test 3: Check bucket region
    console.log("\n3️⃣  Checking bucket region...");
    const location = await s3.getBucketLocation({ Bucket: BUCKET_NAME }).promise();
    const region = location.LocationConstraint || "us-east-1";
    console.log(`   📍 Bucket region: ${region}`);

    if (region !== "eu-north-1") {
      console.log(`   ⚠️  Warning: Expected 'eu-north-1', got '${region}'`);
    } else {
      console.log(`   ✅ Correct region`);
    }

    // Test 4: Test upload with a small test file
    console.log("\n4️⃣  Testing file upload...");
    const testContent = Buffer.from("Test upload from DermaHMS - " + new Date().toISOString());
    const testKey = `tier1/scans/test-user-123/test-${Date.now()}.txt`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: testKey,
      Body: testContent,
      ContentType: "text/plain",
      ServerSideEncryption: "AES256",
    };

    const uploadResult = await s3.upload(uploadParams).promise();

    if (uploadResult.Location) {
      console.log(`   ✅ Upload successful!`);
      console.log(`   🔗 URL: ${uploadResult.Location}`);
      console.log(`   📁 Key: ${uploadResult.Key}`);

      // Test 5: Verify file exists
      console.log("\n5️⃣  Verifying uploaded file...");
      const headObject = await s3.headObject({
        Bucket: BUCKET_NAME,
        Key: uploadResult.Key!,
      }).promise();

      console.log(`   ✅ File verified`);
      console.log(`   📏 Size: ${headObject.ContentLength} bytes`);
      console.log(`   📅 Last Modified: ${headObject.LastModified}`);

      // Clean up test file
      console.log("\n6️⃣  Cleaning up test file...");
      await s3.deleteObject({
        Bucket: BUCKET_NAME,
        Key: uploadResult.Key!,
      }).promise();
      console.log(`   ✅ Test file deleted`);

    } else {
      console.log(`   ❌ Upload failed`);
      return false;
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("✨ ALL TESTS PASSED! ✨");
    console.log("=".repeat(60));
    console.log("\n✅ Your S3 setup is working correctly!");
    console.log("✅ AWS Credentials: Valid");
    console.log(`✅ Bucket: ${BUCKET_NAME}`);
    console.log(`✅ Region: ${region}`);
    console.log("✅ Upload: Working");
    console.log("✅ Delete: Working");
    console.log("\n🎉 Ready to use S3 for image uploads!\n");

    return true;

  } catch (error) {
    console.log("\n" + "=".repeat(60));
    console.log("❌ TEST FAILED");
    console.log("=".repeat(60));

    if (error instanceof Error) {
      console.log("\n🔴 Error:", error.message);

      if (error.message.includes("credentials")) {
        console.log("\n💡 Fix:");
        console.log("   1. Check AWS_ACCESS_KEY_ID in .env.local");
        console.log("   2. Check AWS_SECRET_ACCESS_KEY in .env.local");
        console.log("   3. Make sure credentials are valid");
      } else if (error.message.includes("bucket")) {
        console.log("\n💡 Fix:");
        console.log(`   1. Create bucket '${BUCKET_NAME}' in AWS Console`);
        console.log("   2. Set region to 'eu-north-1' (Stockholm)");
      } else if (error.message.includes("Access Denied")) {
        console.log("\n💡 Fix:");
        console.log("   1. Check IAM user permissions");
        console.log("   2. Attach 'AmazonS3FullAccess' policy");
      }
    }

    console.log("\n📚 Full error details:");
    console.error(error);

    return false;
  }
}

// Run test
testS3Connection().then((success) => {
  process.exit(success ? 0 : 1);
});
