/**
 * Backfill CA-grade invoice numbers onto existing walk-in appointments.
 *
 * Two independent series per clinic, reset per IST day:
 *   PROC-YYYYMMDD-0001 → cosmetology procedures
 *   CON-YYYYMMDD-0001  → consultations & follow-ups
 *
 * Safety:
 *   - Idempotent: only fills appointments that have NO invoiceNumber yet.
 *     Existing numbers are read to continue each day's sequence without gaps.
 *   - Skips cancelled appointments (they never appear on the daily page).
 *   - Dry-run by default unless --commit is passed; --dry-run forces preview.
 *
 * Usage:
 *   npx tsx scripts/backfill-appointment-invoices.ts            # preview only
 *   npx tsx scripts/backfill-appointment-invoices.ts --commit   # write changes
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import Appointment from "../models/Appointment";
import { istDateKey } from "../lib/dates";

const MONGODB_URI = process.env.MONGODB_URI || "";
const COMMIT = process.argv.includes("--commit") && !process.argv.includes("--dry-run");

type Series = "PROC" | "CON";

function seriesFor(a: any): Series {
  return a.type === "cosmetology" && a.procedureName ? "PROC" : "CON";
}

async function main() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI not set (.env.local). Aborting.");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log(`Connected. Mode: ${COMMIT ? "COMMIT (writing)" : "DRY-RUN (no writes)"}\n`);

  // Walk-in entries shown on the daily page that still lack an invoice number.
  const pending = await Appointment.find({
    walkIn: true,
    status: { $nin: ["cancelled"] },
    $or: [{ invoiceNumber: { $exists: false } }, { invoiceNumber: null }, { invoiceNumber: "" }],
  })
    .sort({ clinicId: 1, appointmentDate: 1, createdAt: 1, tokenNumber: 1 })
    .select("_id clinicId type procedureName appointmentDate createdAt tokenNumber invoiceNumber")
    .lean();

  console.log(`Found ${pending.length} walk-in entries missing an invoice number.\n`);
  if (pending.length === 0) {
    await mongoose.disconnect();
    return;
  }

  // Seed each (clinic, series, day) counter from the current max already in the
  // DB, so backfilled numbers continue the existing sequence with no collisions.
  const counters = new Map<string, number>();
  const counterKey = (clinicId: string, series: Series, dateKey: string) =>
    `${clinicId}|${series}|${dateKey}`;

  async function nextNumber(clinicId: string, series: Series, dateKey: string): Promise<string> {
    const key = counterKey(clinicId, series, dateKey);
    if (!counters.has(key)) {
      const last = (await Appointment.findOne(
        {
          clinicId,
          invoiceNumber: { $regex: `^${series}-${dateKey}-` },
        },
        { invoiceNumber: 1 }
      )
        .sort({ invoiceNumber: -1 })
        .lean()) as { invoiceNumber?: string } | null;
      const lastSeq = last?.invoiceNumber ? parseInt(last.invoiceNumber.split("-")[2], 10) : 0;
      counters.set(key, lastSeq);
    }
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);
    return `${series}-${dateKey}-${String(next).padStart(4, "0")}`;
  }

  let updated = 0;
  for (const a of pending as any[]) {
    const clinicId = String(a.clinicId);
    const series = seriesFor(a);
    const dateKey = istDateKey(new Date(a.appointmentDate || a.createdAt));
    const invoiceNumber = await nextNumber(clinicId, series, dateKey);

    if (COMMIT) {
      await Appointment.updateOne({ _id: a._id }, { $set: { invoiceNumber } });
    }
    updated++;
    if (updated <= 20 || updated % 100 === 0) {
      console.log(`  ${invoiceNumber}  ←  ${a._id} (${series}, ${dateKey})`);
    }
  }

  console.log(`\n${COMMIT ? "Wrote" : "Would write"} ${updated} invoice numbers.`);
  if (!COMMIT) console.log("Re-run with --commit to apply.");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
