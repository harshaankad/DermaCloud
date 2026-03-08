/**
 * Test MongoDB Connection
 * Run this script to verify MongoDB setup
 *
 * Usage: npx tsx scripts/test-db-connection.ts
 */

import { connectDB } from "../lib/db/connection";
import {
  User,
  Clinic,
  Patient,
  ConsultationDermatology,
  ConsultationCosmetology,
  OTP,
  Tier1Scan,
  UsageTracking,
} from "../models";

async function testConnection() {
  try {
    console.log("🔄 Testing MongoDB connection...\n");

    // Connect to database
    await connectDB();

    // Test each collection
    const collections = [
      { name: "Users", model: User },
      { name: "Clinics", model: Clinic },
      { name: "Patients", model: Patient },
      { name: "Consultations (Dermatology)", model: ConsultationDermatology },
      { name: "Consultations (Cosmetology)", model: ConsultationCosmetology },
      { name: "OTPs", model: OTP },
      { name: "Tier1 Scans", model: Tier1Scan },
      { name: "Usage Tracking", model: UsageTracking },
    ];

    console.log("📊 Collection Status:\n");

    for (const { name, model } of collections) {
      const count = await model.countDocuments();
      console.log(`  ✅ ${name}: ${count} documents`);
    }

    console.log("\n✨ All models are working correctly!");
    console.log("\n🎯 MongoDB is ready for use!");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error testing MongoDB connection:", error);
    process.exit(1);
  }
}

testConnection();
