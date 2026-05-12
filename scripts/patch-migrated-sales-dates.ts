/**
 * One-time patch: fix createdAt on all migrated sales.
 *
 * The migrate-sales.ts script used new Date(year, month, day) (local time = IST),
 * so every migrated sale was stored 5h30m too early in UTC:
 *   e.g. June 7 midnight IST → stored as June 6 18:30:00Z
 *
 * Fix: add 5h30m (19800 seconds) to createdAt and updatedAt on every migrated record.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const MONGODB_URI = process.env.MONGODB_URI || "";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19800000 ms

const DRY_RUN = process.argv.includes("--dry-run");

async function patchDates() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  if (DRY_RUN) console.log("\n*** DRY RUN — no data will be written ***\n");

  const db = mongoose.connection.db!;
  const collection = db.collection("sales");

  // All migrated sales have notes matching "Migrated: Order #<n>"
  const filter = { notes: { $regex: /^Migrated: Order #\d+$/ } };

  const total = await collection.countDocuments(filter);
  console.log(`Found ${total} migrated sales to patch\n`);

  if (total === 0) {
    console.log("Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Preview first 5 before/after
  const sample = await collection.find(filter).limit(5).toArray();
  console.log("Sample (first 5):");
  for (const doc of sample) {
    const newCreatedAt = new Date(doc.createdAt.getTime() + IST_OFFSET_MS);
    const newUpdatedAt = new Date(doc.updatedAt.getTime() + IST_OFFSET_MS);
    console.log(`  ${doc.saleId} | ${doc.invoiceNumber}`);
    console.log(`    createdAt: ${doc.createdAt.toISOString()} → ${newCreatedAt.toISOString()}`);
    console.log(`    updatedAt: ${doc.updatedAt.toISOString()} → ${newUpdatedAt.toISOString()}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would patch ${total} documents.`);
    await mongoose.disconnect();
    return;
  }

  // Bulk update: $inc on date fields isn't supported, so use a pipeline update
  const result = await collection.updateMany(
    filter,
    [
      {
        $set: {
          createdAt: {
            $add: ["$createdAt", IST_OFFSET_MS],
          },
          updatedAt: {
            $add: ["$updatedAt", IST_OFFSET_MS],
          },
        },
      },
    ]
  );

  console.log(`Patched ${result.modifiedCount} / ${total} documents.`);

  // Verify a sample after patch
  const check = await collection.find(filter).sort({ createdAt: 1 }).limit(3).toArray();
  console.log("\nVerification (first 3 after patch):");
  for (const doc of check) {
    console.log(`  ${doc.saleId} | ${doc.invoiceNumber} | createdAt: ${doc.createdAt.toISOString()}`);
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

patchDates().catch((err) => {
  console.error(err);
  process.exit(1);
});
