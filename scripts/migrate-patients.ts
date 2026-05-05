import mongoose from "mongoose";
import dotenv from "dotenv";
import XLSX from "xlsx";
import path from "path";

dotenv.config({ path: ".env.local" });

import User from "../models/User";
import Patient from "../models/Patient";

const MONGODB_URI = process.env.MONGODB_URI || "";
const CUSTOMER_EMAIL = "rajvarsha02@gmail.com";
const FILE_PATH = path.resolve(__dirname, "../../Data/Patients/1.xlsx");

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ──

function parseExcelDate(serial: any): Date | null {
  if (serial === undefined || serial === null || serial === "") return null;
  if (typeof serial === "number") {
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + serial * 86400000);
  }
  const d = new Date(String(serial));
  if (!isNaN(d.getTime())) return d;
  return null;
}

function titleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isMerged(name: string): boolean {
  return /merged to \d+/i.test(name);
}

function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

// ── Types ──

interface RawRow {
  ID: number;
  "Patient Name": string;
  "Corrected Name": string;
  Age: number;
  Phone: number | string;
  Gender: string;
  "E-mail": string;
  City: string;
  "Addrs.": string;
  "Reg date": any;
  "Ref. By": string;
  Channel: string;
  Tags: string;
}

// ── Main ──

async function migratePatients() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    if (DRY_RUN) console.log("\n*** DRY RUN — no data will be written ***\n");

    // Find the customer
    const user = await User.findOne({ email: CUSTOMER_EMAIL });
    if (!user || !user.clinicId) {
      console.error("Customer not found or has no clinic. Run create-customer.ts first.");
      process.exit(1);
    }
    const clinicId = user.clinicId;
    console.log(`Customer: ${user.name} | Clinic ID: ${clinicId}\n`);

    // Check existing patients
    const existingCount = await Patient.countDocuments({ clinicId });
    if (existingCount > 0) {
      console.log(`WARNING: ${existingCount} patients already exist for this clinic.`);
      console.log("The script will skip patients whose patientId already exists.\n");
    }

    // ── Step 1: Read Excel ──
    console.log("--- Reading patient data ---");
    const wb = XLSX.readFile(FILE_PATH);
    const allRows = XLSX.utils.sheet_to_json<RawRow>(wb.Sheets["Final"]);
    console.log(`Total rows: ${allRows.length}\n`);

    // ── Step 2: Filter and process ──
    let merged = 0;
    let invalidPhone = 0;
    let noAge = 0;
    let created = 0;
    let skipped = 0;
    const flagged: string[] = [];

    // Track patientIds to handle duplicates in the Excel itself + DB
    const seenIds = new Set<string>();
    if (!DRY_RUN && existingCount > 0) {
      const existing = await Patient.find({ clinicId }, { patientId: 1 }).lean();
      existing.forEach((p) => seenIds.add(p.patientId));
    }

    for (const row of allRows) {
      const originalName = String(row["Patient Name"] || "").trim();
      const correctedName = String(row["Corrected Name"] || "").trim();

      // Skip merged patients
      if (isMerged(originalName)) {
        merged++;
        continue;
      }

      const patientId = `PT-${row.ID}`;
      const name = correctedName || titleCase(originalName);
      const phone = String(row.Phone || "").trim();
      const age = Number(row.Age);
      const gender = (String(row.Gender || "").trim().toLowerCase()) as "male" | "female" | "other";
      const email = String(row["E-mail"] || "").trim() || undefined;
      const city = row.City ? titleCase(String(row.City).trim()) : "";
      const address = [String(row["Addrs."] || "").trim(), city].filter(Boolean).join(", ") || undefined;
      const regDate = parseExcelDate(row["Reg date"]);

      // Validate phone
      if (!isValidPhone(phone)) {
        invalidPhone++;
        flagged.push(`ID ${row.ID}: "${name}" — invalid phone "${phone}"`);
        continue;
      }

      // Validate age
      if (!age || age <= 0) {
        noAge++;
        flagged.push(`ID ${row.ID}: "${name}" — missing/invalid age (${row.Age})`);
        continue;
      }

      // Validate gender
      if (!["male", "female", "other"].includes(gender)) {
        flagged.push(`ID ${row.ID}: "${name}" — invalid gender "${row.Gender}"`);
        continue;
      }

      // Skip duplicates (from Excel or DB)
      if (seenIds.has(patientId)) {
        skipped++;
        continue;
      }
      seenIds.add(patientId);

      if (!DRY_RUN) {
        const doc = {
          clinicId,
          patientId,
          name,
          age,
          gender,
          phone,
          email: email && /^\S+@\S+\.\S+$/.test(email) ? email : undefined,
          address,
          createdAt: regDate || new Date(),
          updatedAt: regDate || new Date(),
        };

        // Use raw insertOne to bypass Mongoose's timestamp override
        await Patient.collection.insertOne(doc);
      }

      created++;
    }

    console.log(`  Created: ${created}`);
    console.log(`  Merged (skipped): ${merged}`);
    console.log(`  Invalid phone (skipped): ${invalidPhone}`);
    console.log(`  Missing age (skipped): ${noAge}`);
    console.log(`  Duplicate (skipped): ${skipped}`);

    if (flagged.length > 0) {
      console.log(`\n  Flagged rows (${flagged.length}):`);
      flagged.forEach((f) => console.log(`    ${f}`));
    }

    // ── Summary ──
    console.log("\n========== MIGRATION SUMMARY ==========");
    console.log(`Mode:              ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
    console.log(`Total rows:        ${allRows.length}`);
    console.log(`Patients created:  ${created}`);
    console.log(`Merged (skipped):  ${merged}`);
    console.log(`Flagged (skipped): ${flagged.length}`);
    console.log(`Duplicates:        ${skipped}`);
    console.log("========================================");

    await mongoose.disconnect();
    console.log("\nDone.");
  } catch (error: any) {
    console.error("Error:", error.message);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

migratePatients();
