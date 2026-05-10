import mongoose from "mongoose";
import dotenv from "dotenv";
import XLSX from "xlsx";
import path from "path";

dotenv.config({ path: ".env.local" });

import User from "../models/User";
import Sale from "../models/Sale";
import SalesReturn from "../models/SalesReturn";
import InventoryItem from "../models/InventoryItem";

const MONGODB_URI = process.env.MONGODB_URI || "";
const CUSTOMER_EMAIL = "rajvarsha02@gmail.com";
const DATA_DIR = path.resolve(__dirname, "../../Data/Medicines return");
const FILES = ["1.xlsx", "2.xlsx", "3.xlsx", "4.xlsx", "5.xlsx", "6.xlsx"];

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ──

function parseDate(raw: any): Date {
  if (raw instanceof Date) return raw;
  const str = String(raw);
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  // "11-Jun-2025"
  const match = str.match(/^(\d{1,2})-(\w{3})-(\d{4})$/);
  if (match) {
    const day = parseInt(match[1]);
    const month = months[match[2]];
    const year = parseInt(match[3]);
    if (month !== undefined) return new Date(year, month, day);
  }
  // "11-Jun-25"
  const match2 = str.match(/^(\d{1,2})-(\w{3})-(\d{2})$/);
  if (match2) {
    const day = parseInt(match2[1]);
    const month = months[match2[2]];
    const year = 2000 + parseInt(match2[3]);
    if (month !== undefined) return new Date(year, month, day);
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  throw new Error(`Cannot parse date: "${raw}"`);
}

function toGstSlab(rate: number): 0 | 5 | 12 | 18 | 28 {
  const rounded = Math.round(rate);
  if (rounded === 5) return 5;
  if (rounded === 12) return 12;
  if (rounded === 18) return 18;
  if (rounded === 28) return 28;
  return 0;
}

const roundTo2 = (n: number) => Math.round(n * 100) / 100;

// ── Types ──

interface RawRow {
  "Order #": number;
  Date: string;
  "Patient Name": string;
  Medicine: string;
  Batch: string | number;
  "Returned Units": number;
  MRP: number;
  Cost: number;
  Disc: number;
  "Total Net(incl.Tax)": number;
}

// ── Main ──

async function migrateSalesReturns() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    if (DRY_RUN) console.log("\n*** DRY RUN — no data will be written ***\n");

    const user = await User.findOne({ email: CUSTOMER_EMAIL });
    if (!user || !user.clinicId) {
      console.error("Customer not found or has no clinic.");
      process.exit(1);
    }
    const clinicId = user.clinicId;
    const doctorId = user._id;
    console.log(`Customer: ${user.name} | Clinic ID: ${clinicId}\n`);

    // ── Load inventory items (for itemId, itemCode, gstRate) ──
    console.log("--- Loading inventory items ---");
    const allItems = await InventoryItem.find({ clinicId }).lean();
    const itemByName = new Map<string, { _id: mongoose.Types.ObjectId; itemCode: string; gstRate: number }>();
    for (const item of allItems) {
      itemByName.set(item.name.toUpperCase(), {
        _id: item._id as mongoose.Types.ObjectId,
        itemCode: item.itemCode,
        gstRate: item.gstRate || 0,
      });
    }
    console.log(`Loaded ${itemByName.size} inventory items\n`);

    // ── Load sales (for originalSaleId lookup) ──
    console.log("--- Loading sales for order # matching ---");
    const salesByOrder = new Map<number, mongoose.Types.ObjectId>();
    const allSales = await Sale.find({ clinicId, notes: { $regex: /^Migrated: Order #/ } }, { _id: 1, notes: 1 }).lean();
    for (const sale of allSales) {
      const match = sale.notes?.match(/Order #(\d+)/);
      if (match) salesByOrder.set(parseInt(match[1]), sale._id as mongoose.Types.ObjectId);
    }
    console.log(`Loaded ${salesByOrder.size} sales\n`);

    // ── Read all Excel files ──
    console.log("--- Reading Excel files ---");
    const allRows: RawRow[] = [];
    for (const file of FILES) {
      const filePath = path.join(DATA_DIR, file);
      const wb = XLSX.readFile(filePath);
      const rows = XLSX.utils.sheet_to_json<RawRow>(wb.Sheets[wb.SheetNames[0]]);
      console.log(`  ${file}: ${rows.length} rows`);
      allRows.push(...rows);
    }
    console.log(`Total rows: ${allRows.length}\n`);

    // Filter zero-quantity rows
    const validRows = allRows.filter((r) => Number(r["Returned Units"]) > 0);
    console.log(`Valid rows: ${validRows.length}`);
    console.log(`Skipped: ${allRows.length - validRows.length}\n`);

    // ── Group by Order # + Date (one return event per combination) ──
    const returnMap = new Map<string, RawRow[]>();
    for (const row of validRows) {
      const key = `${row["Order #"]}|||${row.Date}`;
      if (!returnMap.has(key)) returnMap.set(key, []);
      returnMap.get(key)!.push(row);
    }
    console.log(`Unique return events: ${returnMap.size}\n`);

    // ── Check existing returns for dedup ──
    const existingReasons = new Set<string>();
    if (!DRY_RUN) {
      const existing = await SalesReturn.find({ clinicId }, { reason: 1 }).lean();
      existing.forEach((r) => { if (r.reason) existingReasons.add(r.reason); });
    }

    // ── Create SalesReturn documents ──
    console.log("--- Creating sales return records ---");
    let returnsCreated = 0;
    let returnsSkipped = 0;
    let noSaleMatch = 0;
    let totalNetAmount = 0;

    let returnCounter = 0;

    for (const [key, rows] of returnMap) {
      const firstRow = rows[0];
      const orderNo = Number(firstRow["Order #"]);
      const dupeKey = `Migrated: Return for Order #${orderNo}`;

      if (!DRY_RUN && existingReasons.has(dupeKey)) {
        returnsSkipped++;
        continue;
      }

      const originalSaleId = salesByOrder.get(orderNo);
      if (!originalSaleId) noSaleMatch++;

      returnCounter++;
      const invoiceNo = `SR-${String(returnCounter).padStart(4, "0")}`;

      // Build items
      const items = rows.map((row) => {
        const medicineName = row.Medicine?.trim();
        const inv = itemByName.get(medicineName.toUpperCase());
        const qty = Number(row["Returned Units"]) || 1;
        const mrp = Number(row.MRP) || 0;
        const disc = Number(row.Disc) || 0;
        const totalNet = Number(row["Total Net(incl.Tax)"]) || 0;
        const gstRate = inv ? toGstSlab(inv.gstRate) : 0;

        return {
          ...(inv ? { itemId: inv._id, itemCode: inv.itemCode } : {}),
          itemName: medicineName,
          quantity: qty,
          unitPrice: mrp,
          discount: roundTo2(disc * qty),
          gstRate,
          total: totalNet,
          restock: false,
        };
      });

      if (items.length === 0) continue;

      // Compute totals
      const grossValue = roundTo2(items.reduce((s, it) => s + it.total, 0));
      const totalDiscount = roundTo2(items.reduce((s, it) => s + it.discount, 0));

      // Compute GST breakdown
      // Total Net is MRP-inclusive. Taxable = Total / (1 + gstRate/100)
      const gstSlabs = {
        gst0: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        gst5: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        gst12: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        gst18: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        gst28: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      };
      let totalGst = 0;

      for (const item of items) {
        const slab = toGstSlab(item.gstRate);
        const slabKey = `gst${slab}` as keyof typeof gstSlabs;
        const taxable = roundTo2(item.total / (1 + slab / 100));
        const tax = roundTo2(item.total - taxable);
        const halfTax = roundTo2(tax / 2);

        gstSlabs[slabKey].taxable += taxable;
        gstSlabs[slabKey].cgst += halfTax;
        gstSlabs[slabKey].sgst += halfTax;
        totalGst += tax;
      }

      for (const slab of Object.values(gstSlabs)) {
        slab.taxable = roundTo2(slab.taxable);
        slab.cgst = roundTo2(slab.cgst);
        slab.sgst = roundTo2(slab.sgst);
      }
      totalGst = roundTo2(totalGst);
      totalNetAmount += grossValue;

      if (!DRY_RUN) {
        const invoiceDate = parseDate(firstRow.Date);

        const doc = {
          clinicId,
          originalSaleId: originalSaleId || undefined,
          invoiceNo,
          invoiceDate,
          modeOfPayment: "cash" as const,
          partyName: firstRow["Patient Name"]?.trim() || "Walk-in",
          items,
          grossValue,
          discount: totalDiscount,
          ...gstSlabs,
          totalGst,
          roundingAmount: 0,
          netAmount: grossValue,
          reason: dupeKey,
          createdBy: doctorId,
          createdAt: invoiceDate,
          updatedAt: invoiceDate,
        };

        await SalesReturn.collection.insertOne(doc);
      }

      returnsCreated++;
    }

    console.log(`  Created: ${returnsCreated}`);
    console.log(`  Skipped (duplicates): ${returnsSkipped}`);
    console.log(`  No matching sale found: ${noSaleMatch} (still imported, just no link)`);
    console.log(`  Total net amount: ₹${totalNetAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n`);

    console.log("========== MIGRATION SUMMARY ==========");
    console.log(`Mode:              ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
    console.log(`Excel rows read:   ${allRows.length}`);
    console.log(`Valid rows:        ${validRows.length}`);
    console.log(`Returns created:   ${returnsCreated}`);
    console.log(`Returns skipped:   ${returnsSkipped}`);
    console.log(`No sale match:     ${noSaleMatch}`);
    console.log(`Total net amount:  ₹${totalNetAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
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

migrateSalesReturns();
