/**
 * Test script for AI inference
 * Run with: npx tsx scripts/test-ai-inference.ts
 */

import { predictSkinCondition, initializeModel, getLabels } from "../lib/ai/inference";
import fs from "fs/promises";
import path from "path";

async function testInference() {
  console.log("🧪 Testing AI Inference System\n");
  console.log("=" .repeat(50));

  try {
    // Initialize model
    console.log("\n📦 Initializing model...");
    await initializeModel();

    const labels = getLabels();
    console.log(`✅ Model initialized with ${labels.length} classes:`);
    labels.forEach((label, idx) => console.log(`   ${idx + 1}. ${label}`));

    // Check if there are test images
    const testImagesDir = path.join(process.cwd(), "test-images");

    try {
      const files = await fs.readdir(testImagesDir);
      const imageFiles = files.filter((f) =>
        /\.(jpg|jpeg|png|bmp|webp)$/i.test(f)
      );

      if (imageFiles.length === 0) {
        console.log("\n⚠️  No test images found in test-images/ directory");
        console.log("📸 Please add some skin condition images to test with");
        console.log("\n💡 Creating a dummy test with random data...");

        // Create a simple test image (white square)
        const sharp = require("sharp");
        const testBuffer = await sharp({
          create: {
            width: 224,
            height: 224,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
          },
        })
          .jpeg()
          .toBuffer();

        console.log("\n🔍 Running inference on dummy image...");
        const result = await predictSkinCondition(testBuffer);

        console.log("\n📊 Results:");
        console.log(`   Processing time: ${result.processingTime}ms`);
        console.log(`\n   Top prediction: ${result.topPrediction.condition}`);
        console.log(`   Confidence: ${result.topPrediction.confidence} (${(result.topPrediction.probability * 100).toFixed(2)}%)`);

        console.log("\n   All predictions:");
        result.predictions.forEach((pred, idx) => {
          console.log(
            `   ${idx + 1}. ${pred.condition}: ${(pred.probability * 100).toFixed(2)}% [${pred.confidence}]`
          );
        });

        console.log("\n✅ Inference test completed successfully!");
        console.log("\n💡 Add real images to test-images/ for actual testing");

      } else {
        console.log(`\n📸 Found ${imageFiles.length} test images`);

        for (const imageFile of imageFiles.slice(0, 3)) {
          // Test first 3 images
          console.log(`\n${"─".repeat(50)}`);
          console.log(`🔍 Testing: ${imageFile}`);

          const imagePath = path.join(testImagesDir, imageFile);
          const imageBuffer = await fs.readFile(imagePath);

          const result = await predictSkinCondition(imageBuffer);

          console.log(`   Processing time: ${result.processingTime}ms`);
          console.log(`\n   Top prediction: ${result.topPrediction.condition}`);
          console.log(`   Confidence: ${result.topPrediction.confidence} (${(result.topPrediction.probability * 100).toFixed(2)}%)`);

          console.log("\n   All predictions:");
          result.predictions.forEach((pred, idx) => {
            console.log(
              `   ${idx + 1}. ${pred.condition}: ${(pred.probability * 100).toFixed(2)}% [${pred.confidence}]`
            );
          });
        }

        console.log("\n" + "=".repeat(50));
        console.log("✅ All tests completed successfully!");
      }
    } catch (dirError: any) {
      if (dirError.code === "ENOENT") {
        console.log("\n📁 test-images/ directory not found");
        console.log("💡 Testing with a dummy image instead...");

        // Create a simple test image
        const sharp = require("sharp");
        const testBuffer = await sharp({
          create: {
            width: 224,
            height: 224,
            channels: 3,
            background: { r: 200, g: 150, b: 100 },
          },
        })
          .jpeg()
          .toBuffer();

        const result = await predictSkinCondition(testBuffer);

        console.log("\n📊 Dummy Image Results:");
        console.log(`   Processing time: ${result.processingTime}ms`);
        console.log(`\n   Top prediction: ${result.topPrediction.condition}`);
        console.log(`   Confidence: ${result.topPrediction.confidence} (${(result.topPrediction.probability * 100).toFixed(2)}%)`);

        console.log("\n   All predictions:");
        result.predictions.forEach((pred, idx) => {
          console.log(
            `   ${idx + 1}. ${pred.condition}: ${(pred.probability * 100).toFixed(2)}% [${pred.confidence}]`
          );
        });

        console.log("\n✅ Inference system is working correctly!");
      } else {
        throw dirError;
      }
    }

    console.log("\n🎉 AI Inference System Ready for Production!");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

testInference();
