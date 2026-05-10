import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import User from "../models/User";
import Patient from "../models/Patient";

const MONGODB_URI = process.env.MONGODB_URI || "";
const CUSTOMER_EMAIL = "rajvarsha02@gmail.com";

function titleCase(str: string): string {
  return str.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

const PATIENTS: { id: number; name: string; age: number; phone: string; gender: string; date: string }[] = [
  // Data wiped after migration — do not re-populate
];

async function migratePatientsPart2() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const user = await User.findOne({ email: CUSTOMER_EMAIL });
    if (!user || !user.clinicId) {
      console.error("Customer not found.");
      process.exit(1);
    }
    const clinicId = user.clinicId;
    console.log(`Customer: ${user.name} | Clinic ID: ${clinicId}\n`);

    const existing = await Patient.find({ clinicId }, { patientId: 1 }).lean();
    const existingIds = new Set(existing.map((p) => p.patientId));
    console.log(`Existing patients in DB: ${existingIds.size}`);

    let created = 0;
    let skipped = 0;
    let flagged = 0;

    for (const row of PATIENTS) {
      const patientId = `PT-${row.id}`;

      if (existingIds.has(patientId)) {
        skipped++;
        continue;
      }

      if (!row.age || row.age <= 0) {
        console.log(`  FLAGGED: ID ${row.id} "${row.name}" — age is 0`);
        flagged++;
        continue;
      }

      if (!isValidPhone(row.phone)) {
        console.log(`  FLAGGED: ID ${row.id} "${row.name}" — invalid phone "${row.phone}"`);
        flagged++;
        continue;
      }

      const regDate = new Date(row.date);

      await Patient.collection.insertOne({
        clinicId,
        patientId,
        name: titleCase(row.name),
        age: row.age,
        gender: row.gender,
        phone: row.phone,
        createdAt: regDate,
        updatedAt: regDate,
      });

      created++;
    }

    console.log(`\n========== SUMMARY ==========`);
    console.log(`Total in script: ${PATIENTS.length}`);
    console.log(`Created:         ${created}`);
    console.log(`Skipped (exist): ${skipped}`);
    console.log(`Flagged:         ${flagged}`);
    console.log(`=============================`);

    await mongoose.disconnect();
    console.log("\nDone.");
  } catch (error: any) {
    console.error("Error:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

migratePatientsPart2();
