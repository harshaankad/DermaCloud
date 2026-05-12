import mongoose from "mongoose";
import dotenv from "dotenv";
import XLSX from "xlsx";
import path from "path";

dotenv.config({ path: ".env.local" });

import User from "../models/User";
import Sale from "../models/Sale";
import InventoryItem from "../models/InventoryItem";

const MONGODB_URI = process.env.MONGODB_URI || "";
const CUSTOMER_EMAIL = "rajvarsha02@gmail.com";
const DATA_DIR = path.resolve(__dirname, "../../Data/Sales Tax Report");
const FILES = ["7.xlsx"];

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ──

function parseDate(raw: any): Date {
  if (raw instanceof Date) return raw;
  const str = String(raw);
  // Format: "07-Jun-2025"
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const match = str.match(/^(\d{1,2})-(\w{3})-(\d{4})$/);
  if (match) {
    const day = parseInt(match[1]);
    const month = months[match[2]];
    const year = parseInt(match[3]);
    if (month !== undefined) return new Date(Date.UTC(year, month, day));
  }
  // Also handle "DD-Mon-YY" format just in case
  const match2 = str.match(/^(\d{1,2})-(\w{3})-(\d{2})$/);
  if (match2) {
    const day = parseInt(match2[1]);
    const month = months[match2[2]];
    const year = 2000 + parseInt(match2[3]);
    if (month !== undefined) return new Date(Date.UTC(year, month, day));
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  throw new Error(`Cannot parse date: "${raw}"`);
}

function mapPaymentMode(mode: string): "cash" | "card" | "upi" | "insurance" | "credit" {
  const m = (mode || "").trim().toLowerCase();
  if (m === "cash") return "cash";
  if (m === "card") return "card";
  if (m === "m-wallet" || m === "upi" || m === "wallet") return "upi";
  return "cash";
}

function toGstSlab(cgstPercent: number): 0 | 5 | 12 | 18 | 28 {
  const total = Math.round(cgstPercent * 2);
  if (total === 5) return 5;
  if (total === 12) return 12;
  if (total === 18) return 18;
  if (total === 28) return 28;
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
  "HSN Code": string | number;
  Qty: number;
  MRP: number;
  Cost: number;
  Disc: number;
  "Sales Col.": number;
  "Total(MRP (excl.Tax))": number;
  "Total(Cost)": number;
  "Total(Tax)": number;
  "CGST(%)": number;
  "CGST(#)": number;
  "SGST(%)": number;
  "SGST(#)": number;
  "P.Mode": string;
}

// ── Main ──

async function migrateSales() {
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
    const doctorId = user._id;
    const doctorName = user.name;
    console.log(`Customer: ${user.name} | Clinic ID: ${clinicId}\n`);

    // Check existing sales
    const existingCount = await Sale.countDocuments({ clinicId });
    if (existingCount > 0) {
      console.log(`WARNING: ${existingCount} sales already exist for this clinic.`);
      console.log("The script will skip orders that already exist.\n");
    }

    // ── Step 1: Load inventory item map ──
    console.log("--- Loading inventory items ---");
    const allItems = await InventoryItem.find({ clinicId }).lean();
    const itemByName = new Map<string, { _id: mongoose.Types.ObjectId; itemCode: string }>();
    for (const item of allItems) {
      itemByName.set(item.name.toUpperCase(), { _id: item._id as mongoose.Types.ObjectId, itemCode: item.itemCode });
    }
    console.log(`Loaded ${itemByName.size} inventory items\n`);

    // ── Step 2: Read all Excel files ──
    console.log("--- Reading Excel files ---");
    const allRows: RawRow[] = [];
    for (const file of FILES) {
      const filePath = path.join(DATA_DIR, file);
      const wb = XLSX.readFile(filePath);
      const rows = XLSX.utils.sheet_to_json<RawRow>(wb.Sheets["Sheet1"]);
      console.log(`  ${file}: ${rows.length} rows`);
      allRows.push(...rows);
    }
    console.log(`Total rows: ${allRows.length}\n`);

    // Filter out zero-quantity rows
    const validRows = allRows.filter((r) => Number(r.Qty) > 0);
    console.log(`Valid rows (qty > 0): ${validRows.length}`);
    console.log(`Skipped: ${allRows.length - validRows.length}\n`);

    // ── Step 3: Group by Order # ──
    const orderMap = new Map<number, RawRow[]>();
    for (const row of validRows) {
      const orderNo = Number(row["Order #"]);
      if (!orderMap.has(orderNo)) orderMap.set(orderNo, []);
      orderMap.get(orderNo)!.push(row);
    }
    console.log(`Unique orders: ${orderMap.size}\n`);

    // ── Step 4: Check for missing inventory items ──
    let missingItems = 0;
    for (const row of validRows) {
      const name = row.Medicine?.trim().toUpperCase();
      if (name && !itemByName.has(name)) missingItems++;
    }
    if (missingItems > 0) {
      console.log(`WARNING: ${missingItems} line items reference medicines not in inventory.\n`);
    }

    // ── Step 5: Compute starting saleId and per-date invoice counters ──
    // Find max saleId number in DB to avoid collisions with pre-save hook
    const maxSaleDoc = await Sale.findOne({ clinicId }, { saleId: 1 }).sort({ saleId: -1 }).lean();
    let saleCounter = 0;
    if (maxSaleDoc?.saleId) {
      const m = maxSaleDoc.saleId.match(/SALE-(\d+)/);
      if (m) saleCounter = parseInt(m[1]);
    }
    console.log(`Starting saleId from: SALE-${String(saleCounter + 1).padStart(6, "0")}\n`);

    // For each unique date in the file, seed the invoice counter from DB
    const invoiceCounters = new Map<string, number>();
    const uniqueDatesInFile = new Set<string>();
    for (const row of validRows) {
      const d = parseDate(row.Date);
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      uniqueDatesInFile.add(dateStr);
    }
    for (const dateStr of uniqueDatesInFile) {
      const count = await Sale.countDocuments({
        clinicId,
        invoiceNumber: { $regex: `^INV-${dateStr}-` },
      });
      invoiceCounters.set(dateStr, count);
    }

    // ── Step 6: Create Sale documents ──
    console.log("--- Creating sale records ---");
    let salesCreated = 0;
    let salesSkipped = 0;
    let totalSalesAmount = 0;
    let itemsMissing = new Set<string>();

    // Get existing sale notes to detect duplicates
    const existingSaleNotes = new Set<string>();
    if (!DRY_RUN && existingCount > 0) {
      const existing = await Sale.find({ clinicId }, { notes: 1 }).lean();
      existing.forEach((s) => { if (s.notes) existingSaleNotes.add(s.notes); });
    }

    // Sort orders by order number for sequential processing
    const sortedOrders = [...orderMap.entries()].sort((a, b) => a[0] - b[0]);

    for (const [orderNo, rows] of sortedOrders) {
      const dupeKey = `Migrated: Order #${orderNo}`;

      // Skip if already exists
      if (!DRY_RUN && existingSaleNotes.has(dupeKey)) {
        salesSkipped++;
        continue;
      }

      const firstRow = rows[0];
      const paymentMethod = mapPaymentMode(firstRow["P.Mode"]);

      // Build items array
      const items = [];

      for (const row of rows) {
        const medicineName = row.Medicine?.trim();
        const inv = itemByName.get(medicineName.toUpperCase());
        if (!inv) {
          itemsMissing.add(medicineName);
          continue;
        }

        const gstRate = toGstSlab(Number(row["CGST(%)"]) || 0);
        const qty = Number(row.Qty) || 1;
        const mrp = Number(row.MRP) || 0;
        const disc = Number(row.Disc) || 0;
        const salesCol = Number(row["Sales Col."]) || 0;

        items.push({
          itemId: inv._id,
          itemCode: inv.itemCode,
          itemName: medicineName,
          quantity: qty,
          unitPrice: mrp,
          discount: roundTo2(disc * qty),
          gstRate: gstRate as 0 | 5 | 12 | 18 | 28,
          total: salesCol,
          hsnCode: row["HSN Code"] ? String(row["HSN Code"]) : undefined,
          batchNo: row.Batch ? String(row.Batch) : undefined,
        });
      }

      if (items.length === 0) continue;

      // Compute totals from line items
      const grossValue = roundTo2(items.reduce((s, it) => s + it.total, 0));
      const totalDiscount = roundTo2(items.reduce((s, it) => s + it.discount, 0));

      // Compute GST breakdown per slab
      const gstSlabs = {
        gst0: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        gst5: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        gst12: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        gst18: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
        gst28: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
      };

      let totalTax = 0;
      for (const row of rows) {
        const slab = toGstSlab(Number(row["CGST(%)"]) || 0);
        const taxableAmt = Number(row["Total(MRP (excl.Tax))"]) || 0;
        const cgstAmt = Number(row["CGST(#)"]) || 0;
        const sgstAmt = Number(row["SGST(#)"]) || 0;
        const taxAmt = Number(row["Total(Tax)"]) || 0;

        const slabKey = `gst${slab}` as keyof typeof gstSlabs;
        gstSlabs[slabKey].taxable += taxableAmt;
        gstSlabs[slabKey].cgst += cgstAmt;
        gstSlabs[slabKey].sgst += sgstAmt;

        totalTax += taxAmt;
      }

      for (const slab of Object.values(gstSlabs)) {
        slab.taxable = roundTo2(slab.taxable);
        slab.cgst = roundTo2(slab.cgst);
        slab.sgst = roundTo2(slab.sgst);
      }

      totalTax = roundTo2(totalTax);
      const totalAmount = roundTo2(grossValue);
      totalSalesAmount += totalAmount;

      // Assign explicit saleId and invoiceNumber (bypass pre-save hook)
      saleCounter++;
      const saleId = `SALE-${String(saleCounter).padStart(6, "0")}`;

      const invoiceDate = parseDate(firstRow.Date);
      const dateStr = `${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, "0")}${String(invoiceDate.getDate()).padStart(2, "0")}`;
      const invCount = (invoiceCounters.get(dateStr) ?? 0) + 1;
      invoiceCounters.set(dateStr, invCount);
      const invoiceNumber = `INV-${dateStr}-${String(invCount).padStart(4, "0")}`;

      if (!DRY_RUN) {
        await Sale.collection.insertOne({
          clinicId,
          saleId,
          invoiceNumber,
          invoiceDate,
          patientName: firstRow["Patient Name"]?.trim() || "Walk-in",
          items,
          subtotal: grossValue,
          discountAmount: totalDiscount,
          discountPercentage: grossValue > 0 ? roundTo2((totalDiscount / (grossValue + totalDiscount)) * 100) : 0,
          taxAmount: totalTax,
          taxPercentage: grossValue > 0 ? roundTo2((totalTax / grossValue) * 100) : 0,
          totalAmount,
          paymentMethod,
          paymentStatus: "paid",
          amountPaid: totalAmount,
          amountDue: 0,
          soldBy: {
            id: doctorId,
            name: doctorName,
            role: "doctor",
          },
          notes: dupeKey,
          grossValue,
          ...gstSlabs,
          totalGst: totalTax,
          roundingAmount: 0,
          doctorName,
          isInterstate: false,
          igst: 0,
          createdAt: invoiceDate,
          updatedAt: invoiceDate,
        });
      } else {
        console.log(`  [DRY] ${saleId} | ${invoiceNumber} | Order #${orderNo} | ₹${totalAmount}`);
      }

      salesCreated++;
    }

    console.log(`  Created: ${salesCreated}`);
    console.log(`  Skipped (duplicates): ${salesSkipped}`);
    if (itemsMissing.size > 0) {
      console.log(`  Medicines not found in inventory (${itemsMissing.size}):`);
      [...itemsMissing].sort().forEach((m) => console.log(`    - ${m}`));
    }
    console.log(`  Total sales amount: ₹${totalSalesAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n`);

    // ── Summary ──
    console.log("========== MIGRATION SUMMARY ==========");
    console.log(`Mode:              ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
    console.log(`Excel rows read:   ${allRows.length}`);
    console.log(`Valid rows:        ${validRows.length}`);
    console.log(`Sales created:     ${salesCreated}`);
    console.log(`Sales skipped:     ${salesSkipped}`);
    console.log(`Total amount:      ₹${totalSalesAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
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

migrateSales();
