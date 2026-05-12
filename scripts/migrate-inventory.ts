import mongoose from "mongoose";
import dotenv from "dotenv";
import XLSX from "xlsx";
import path from "path";

dotenv.config({ path: ".env.local" });

import User from "../models/User";
import InventoryItem from "../models/InventoryItem";

const MONGODB_URI = process.env.MONGODB_URI || "";
const CUSTOMER_EMAIL = "rajvarsha02@gmail.com";
const CSV_PATH = path.resolve(__dirname, "../../Data/Inventory/3.csv");

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ──

function parseExpiry(raw: any): Date | null {
  // XLSX parses "Aug-2028" as a serial number; with raw:false it becomes "M/D/YY"
  if (raw === undefined || raw === null || raw === "") return null;

  // If it's an Excel serial number
  if (typeof raw === "number") {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + raw * 86400000);
    if (!isNaN(d.getTime())) return d;
  }

  const str = String(raw);

  // Format: "M/D/YY" e.g. "8/1/28"
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    let year = parseInt(match[3]);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
  }

  // Format: "Mon-YYYY" e.g. "Aug-2028"
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const match2 = str.match(/^(\w{3})-(\d{4})$/);
  if (match2 && months[match2[1]] !== undefined) {
    return new Date(parseInt(match2[2]), months[match2[1]], 1);
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function toGstSlab(gstPercent: number): 0 | 5 | 12 | 18 | 28 {
  const rounded = Math.round(gstPercent);
  if (rounded === 5) return 5;
  if (rounded === 12) return 12;
  if (rounded === 18) return 18;
  if (rounded === 28) return 28;
  return 0;
}

const roundTo2 = (n: number) => Math.round(n * 100) / 100;

// ── Types ──

interface RawRow {
  "Med Name": string;
  "Invoice No.": string | number;
  Batch: string | number;
  "Pack(Price)": number;
  "Pack(MRP)": number;
  "Units(Per Pack)": number;
  "Units(Price)": number;
  "Units in Stock": number;
  Expiry: any;
  "%(Discount)": number;
  "%(GST)": number;
}

interface AggregatedItem {
  name: string;
  totalStock: number;
  costPrice: number;       // from latest batch
  sellingPrice: number;    // from latest batch
  batchNumber: string;     // latest batch
  earliestExpiry: Date | null;
  gstRate: 0 | 5 | 12 | 18 | 28;
  batches: { batch: string; stock: number; expiry: Date | null; costPrice: number; sellingPrice: number }[];
}

// ── Main ──

async function migrateInventory() {
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

    // ── Step 1: Read CSV ──
    console.log("--- Reading inventory CSV ---");
    const wb = XLSX.readFile(CSV_PATH);
    const allRows = XLSX.utils.sheet_to_json<RawRow>(wb.Sheets[wb.SheetNames[0]]);
    console.log(`Total rows: ${allRows.length}\n`);

    // ── Step 2: Aggregate by medicine name ──
    console.log("--- Aggregating by medicine ---");
    const itemMap = new Map<string, AggregatedItem>();

    for (const row of allRows) {
      const name = row["Med Name"]?.trim();
      if (!name) continue;

      const stock = Number(row["Units in Stock"]) || 0;
      const costPrice = roundTo2(Number(row["Pack(Price)"]) || 0);
      const sellingPrice = roundTo2(Number(row["Pack(MRP)"]) || Number(row["Units(Price)"]) || 0);
      const batch = row.Batch ? String(row.Batch) : "";
      const expiry = parseExpiry(row.Expiry);
      const gstRate = toGstSlab(Number(row["%(GST)"]) || 0);

      if (!itemMap.has(name)) {
        itemMap.set(name, {
          name,
          totalStock: 0,
          costPrice,
          sellingPrice,
          batchNumber: batch,
          earliestExpiry: expiry,
          gstRate,
          batches: [],
        });
      }

      const item = itemMap.get(name)!;
      item.totalStock += stock;
      item.batches.push({ batch, stock, expiry, costPrice, sellingPrice });

      // Update earliest expiry
      if (expiry && (!item.earliestExpiry || expiry < item.earliestExpiry)) {
        item.earliestExpiry = expiry;
      }
    }

    // For each medicine, use the latest batch's pricing (last row = most recent)
    for (const item of itemMap.values()) {
      const lastBatch = item.batches[item.batches.length - 1];
      item.costPrice = lastBatch.costPrice;
      item.sellingPrice = lastBatch.sellingPrice;
      item.batchNumber = lastBatch.batch;
    }

    console.log(`Unique medicines: ${itemMap.size}`);
    console.log(`Total stock units: ${[...itemMap.values()].reduce((s, i) => s + i.totalStock, 0)}\n`);

    // ── Step 3: Update inventory items in DB ──
    console.log("--- Updating inventory items ---");
    let updated = 0;
    let notFound = 0;
    const missing: string[] = [];

    for (const [name, agg] of itemMap) {
      if (!DRY_RUN) {
        const dbItem = await InventoryItem.findOne({
          clinicId,
          name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        });

        if (!dbItem) {
          notFound++;
          missing.push(name);
          continue;
        }

        dbItem.currentStock = agg.totalStock;
        dbItem.costPrice = agg.costPrice;
        dbItem.sellingPrice = agg.sellingPrice;
        dbItem.batchNumber = agg.batchNumber;
        dbItem.gstRate = agg.gstRate;
        if (agg.earliestExpiry) dbItem.expiryDate = agg.earliestExpiry;
        dbItem.status = agg.totalStock > 0 ? "active" : "out-of-stock";

        await dbItem.save();
      }
      updated++;
    }

    console.log(`  Updated: ${updated}`);
    console.log(`  Not found in DB: ${notFound}`);
    if (missing.length > 0) {
      console.log(`  Missing items:`);
      missing.forEach((m) => console.log(`    - ${m}`));
    }

    // Count remaining zero-stock items
    if (!DRY_RUN) {
      const zeroStock = await InventoryItem.countDocuments({ clinicId, currentStock: 0 });
      const totalItems = await InventoryItem.countDocuments({ clinicId });
      console.log(`\n  Items in DB with stock > 0: ${totalItems - zeroStock}`);
      console.log(`  Items in DB with stock = 0: ${zeroStock} (purchased but fully sold)`);
    }

    // ── Summary ──
    console.log("\n========== MIGRATION SUMMARY ==========");
    console.log(`Mode:              ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
    console.log(`CSV rows:          ${allRows.length}`);
    console.log(`Unique medicines:  ${itemMap.size}`);
    console.log(`Total stock units: ${[...itemMap.values()].reduce((s, i) => s + i.totalStock, 0)}`);
    console.log(`Items updated:     ${updated}`);
    console.log(`Items not found:   ${notFound}`);
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

migrateInventory();
