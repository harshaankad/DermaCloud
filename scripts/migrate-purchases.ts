import mongoose from "mongoose";
import dotenv from "dotenv";
import XLSX from "xlsx";
import path from "path";

dotenv.config({ path: ".env.local" });

import User from "../models/User";
import Clinic from "../models/Clinic";
import Purchase from "../models/Purchase";
import InventoryItem from "../models/InventoryItem";

const MONGODB_URI = process.env.MONGODB_URI || "";
const CUSTOMER_EMAIL = "rajvarsha02@gmail.com";
const DATA_DIR = path.resolve(__dirname, "../../Data/Purchase Tax Report");
const FILES = ["1.xlsx", "2.xlsx", "3.xlsx", "4.xlsx", "5.xlsx"];

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ──

function parseDate(raw: any): Date {
  if (raw instanceof Date) return raw;
  const str = String(raw);
  // Format: "04-Jun-25" → June 4, 2025
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const match = str.match(/^(\d{1,2})-(\w{3})-(\d{2})$/);
  if (match) {
    const day = parseInt(match[1]);
    const month = months[match[2]];
    const year = 2000 + parseInt(match[3]);
    if (month !== undefined) return new Date(year, month, day);
  }
  // Fallback: try native parsing
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  throw new Error(`Cannot parse date: "${raw}"`);
}

function inferCategory(name: string): "medicine" | "cream" | "lotion" | "supplement" | "other" {
  const n = name.toUpperCase();
  if (n.includes("CREAM") || n.includes("OINTMENT") || n.includes("GEL")) return "cream";
  if (n.includes("LOTION") || n.includes("SERUM") || n.includes("MOISTUR")) return "lotion";
  if (n.includes("TABLET") || n.includes("TAB") || n.includes("CAP") || n.includes("CAPSULE")) return "medicine";
  if (n.includes("SOAP") || n.includes("WASH") || n.includes("SHAMPOO") || n.includes("SPRAY")) return "other";
  if (n.includes("SUNSCREEN") || n.includes("SPF")) return "cream";
  return "other";
}

function inferUnit(name: string): "tablets" | "capsules" | "ml" | "units" | "tubes" | "bottles" | "pieces" | "grams" {
  const n = name.toUpperCase();
  if (n.includes("TABLET") || n.includes("TAB ") || n.match(/TAB$/)) return "tablets";
  if (n.includes("CAPSULE") || n.includes("CAP ") || n.match(/CAP$/)) return "capsules";
  if (n.includes("ML")) return "ml";
  if (n.includes("GM") || n.includes("GRAM")) return "grams";
  return "units";
}

function toGstSlab(cgstPercent: number): 0 | 5 | 12 | 18 | 28 {
  const total = Math.round(cgstPercent * 2);
  if (total === 5) return 5;
  if (total === 12) return 12;
  if (total === 18) return 18;
  if (total === 28) return 28;
  return 0;
}

// ── Types ──

interface RawRow {
  "Invoice No": string | number;
  "Invoice Date": string;
  "Stockist Name": string;
  Batch: string | number;
  "HSN Code": string | number;
  "GST No": string;
  "Medicine Name": string;
  Qty: number;
  Discount: number;
  "Cost/Strip": number;
  Amount: number;
  "CGST %": number;
  "SGST %": number;
  "CGST Amt.": number;
  "SGST Amt.": number;
  "Total GST Amt.": number;
}

// ── Main ──

async function migratePurchases() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    if (DRY_RUN) console.log("\n*** DRY RUN — no data will be written ***\n");

    // Find the customer
    const user = await User.findOne({ email: CUSTOMER_EMAIL });
    if (!user || !user.clinicId) {
      console.error(`Customer not found or has no clinic. Run create-customer.ts first.`);
      process.exit(1);
    }
    const clinicId = user.clinicId;
    const doctorId = user._id;
    console.log(`Customer: ${user.name} | Clinic ID: ${clinicId}\n`);

    // Check for existing purchases to avoid duplicates
    const existingCount = await Purchase.countDocuments({ clinicId });
    if (existingCount > 0) {
      console.log(`WARNING: ${existingCount} purchases already exist for this clinic.`);
      console.log("The script will skip invoices that already exist (matched by supplierInvNo + supplierName).\n");
    }

    // ── Step 1: Read all Excel files ──
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

    // Filter out zero-quantity/zero-amount rows
    const validRows = allRows.filter(
      (r) => (Number(r.Qty) > 0 || Number(r.Amount) > 0)
    );
    console.log(`Valid rows (qty > 0 or amount > 0): ${validRows.length}`);
    console.log(`Skipped: ${allRows.length - validRows.length}\n`);

    // ── Step 2: Group by Invoice No + Stockist Name ──
    // (Different suppliers can have the same invoice number)
    const invoiceMap = new Map<string, RawRow[]>();
    for (const row of validRows) {
      const key = `${String(row["Invoice No"])}|||${row["Stockist Name"]}`;
      if (!invoiceMap.has(key)) invoiceMap.set(key, []);
      invoiceMap.get(key)!.push(row);
    }
    console.log(`Unique invoices: ${invoiceMap.size}\n`);

    // ── Step 3: Create/find InventoryItems for all unique medicines ──
    console.log("--- Processing inventory items ---");
    const medicineNames = [...new Set(validRows.map((r) => r["Medicine Name"].trim()))];
    console.log(`Unique medicines: ${medicineNames.length}`);

    const itemMap = new Map<string, mongoose.Types.ObjectId>();

    if (!DRY_RUN) {
      let created = 0;
      let found = 0;

      for (const name of medicineNames) {
        // Find the first row for this medicine to get default values
        const sampleRow = validRows.find((r) => r["Medicine Name"].trim() === name)!;
        const gstRate = toGstSlab(Number(sampleRow["CGST %"]) || 0);

        // Case-insensitive match within this clinic
        let item = await InventoryItem.findOne({
          clinicId,
          name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        });

        if (item) {
          found++;
          itemMap.set(name.toUpperCase(), item._id as mongoose.Types.ObjectId);
        } else {
          item = await InventoryItem.create({
            name,
            clinicId,
            category: inferCategory(name),
            type: "otc",
            currentStock: 0,
            minStockLevel: 10,
            unit: inferUnit(name),
            costPrice: Number(sampleRow["Cost/Strip"]) || 0,
            sellingPrice: Number(sampleRow["Cost/Strip"]) || 0,
            hsnCode: sampleRow["HSN Code"] ? String(sampleRow["HSN Code"]) : undefined,
            gstRate,
            status: "out-of-stock",
          });
          created++;
          itemMap.set(name.toUpperCase(), item._id as mongoose.Types.ObjectId);
        }
      }
      console.log(`  Created: ${created} | Already existed: ${found}\n`);
    } else {
      console.log("  (skipped in dry run)\n");
    }

    // ── Step 4: Create Purchase documents ──
    console.log("--- Creating purchase records ---");
    let purchasesCreated = 0;
    let purchasesSkipped = 0;
    let totalNetAmount = 0;

    for (const [key, rows] of invoiceMap) {
      const firstRow = rows[0];
      const supplierInvNo = String(firstRow["Invoice No"]);
      const supplierName = firstRow["Stockist Name"];

      // Skip if already exists
      if (!DRY_RUN) {
        const exists = await Purchase.findOne({ clinicId, supplierInvNo, supplierName });
        if (exists) {
          purchasesSkipped++;
          continue;
        }
      }

      // Build items array
      const items = rows.map((row) => {
        const gstRate = toGstSlab(Number(row["CGST %"]) || 0);
        const itemId = itemMap.get(row["Medicine Name"].trim().toUpperCase());
        return {
          ...(itemId ? { itemId } : {}),
          itemName: row["Medicine Name"].trim(),
          hsnCode: row["HSN Code"] ? String(row["HSN Code"]) : undefined,
          batchNo: row.Batch ? String(row.Batch) : undefined,
          quantity: Math.max(Number(row.Qty) || 1, 1),
          unitPrice: Number(row["Cost/Strip"]) || 0,
          discount: Number(row.Discount) || 0,
          gstRate: gstRate as 0 | 5 | 12 | 18 | 28,
          total: Number(row.Amount) || 0,
        };
      });

      // Compute GST breakdown per slab
      const gstSlabs = { gst0: { taxable: 0, cgst: 0, sgst: 0, igst: 0 }, gst5: { taxable: 0, cgst: 0, sgst: 0, igst: 0 }, gst12: { taxable: 0, cgst: 0, sgst: 0, igst: 0 }, gst18: { taxable: 0, cgst: 0, sgst: 0, igst: 0 }, gst28: { taxable: 0, cgst: 0, sgst: 0, igst: 0 } };

      let totalCgst = 0;
      let totalSgst = 0;
      let totalGstAmt = 0;
      let grossValue = 0;
      let totalDiscount = 0;

      for (const row of rows) {
        const slab = toGstSlab(Number(row["CGST %"]) || 0);
        const amount = Number(row.Amount) || 0;
        const cgstAmt = Number(row["CGST Amt."]) || 0;
        const sgstAmt = Number(row["SGST Amt."]) || 0;
        const gstAmt = Number(row["Total GST Amt."]) || 0;

        const slabKey = `gst${slab}` as keyof typeof gstSlabs;
        gstSlabs[slabKey].taxable += amount;
        gstSlabs[slabKey].cgst += cgstAmt;
        gstSlabs[slabKey].sgst += sgstAmt;

        totalCgst += cgstAmt;
        totalSgst += sgstAmt;
        totalGstAmt += gstAmt;
        grossValue += amount;
        totalDiscount += Number(row.Discount) || 0;
      }

      // Round values
      const roundTo2 = (n: number) => Math.round(n * 100) / 100;
      grossValue = roundTo2(grossValue);
      totalGstAmt = roundTo2(totalGstAmt);
      const netAmount = roundTo2(grossValue + totalGstAmt);

      for (const slab of Object.values(gstSlabs)) {
        slab.taxable = roundTo2(slab.taxable);
        slab.cgst = roundTo2(slab.cgst);
        slab.sgst = roundTo2(slab.sgst);
      }

      totalNetAmount += netAmount;

      if (!DRY_RUN) {
        const invoiceDate = parseDate(firstRow["Invoice Date"]);
        await Purchase.create({
          clinicId,
          supplierInvNo,
          gstnNo: firstRow["GST No"] || undefined,
          invoiceDate,
          modeOfPayment: "credit",
          supplierName,
          items,
          grossValue,
          discount: roundTo2(totalDiscount),
          cgst: roundTo2(totalCgst),
          sgst: roundTo2(totalSgst),
          igst: 0,
          ...gstSlabs,
          totalGst: roundTo2(totalGstAmt),
          netAmount,
          createdBy: doctorId,
        });
      }

      purchasesCreated++;
    }

    console.log(`  Created: ${purchasesCreated}`);
    console.log(`  Skipped (duplicates): ${purchasesSkipped}`);
    console.log(`  Total net amount: ₹${totalNetAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n`);

    // ── Summary ──
    console.log("========== MIGRATION SUMMARY ==========");
    console.log(`Mode:              ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
    console.log(`Excel rows read:   ${allRows.length}`);
    console.log(`Valid rows:        ${validRows.length}`);
    console.log(`Invoices created:  ${purchasesCreated}`);
    console.log(`Invoices skipped:  ${purchasesSkipped}`);
    console.log(`Inventory items:   ${medicineNames.length}`);
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

migratePurchases();
