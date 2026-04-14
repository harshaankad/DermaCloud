import * as XLSX from "xlsx";

export const GST_RATES = [0, 5, 12, 18, 28] as const;

// Shared GST column headers for both sales and purchase registers
export const GST_COLUMNS = [
  "0% Taxable", "0% CGST", "0% SGST", "0% IGST",
  "5% Value", "5% CGST", "5% SGST", "5% IGST",
  "12% Value", "12% CGST", "12% SGST", "12% IGST",
  "18% Value", "18% CGST", "18% SGST", "18% IGST",
  "28% Value", "28% CGST", "28% SGST", "28% IGST",
];

export function gstRowValues(gst0: any, gst5: any, gst12: any, gst18: any, gst28: any) {
  return [
    gst0?.taxable || 0, gst0?.cgst || 0, gst0?.sgst || 0, gst0?.igst || 0,
    gst5?.taxable || 0, gst5?.cgst || 0, gst5?.sgst || 0, gst5?.igst || 0,
    gst12?.taxable || 0, gst12?.cgst || 0, gst12?.sgst || 0, gst12?.igst || 0,
    gst18?.taxable || 0, gst18?.cgst || 0, gst18?.sgst || 0, gst18?.igst || 0,
    gst28?.taxable || 0, gst28?.cgst || 0, gst28?.sgst || 0, gst28?.igst || 0,
  ];
}

export function buildExcelResponse(rows: any[][], headers: string[], sheetName: string, filename: string) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Auto column widths
  ws["!cols"] = headers.map((h, i) => {
    let maxLen = h.length;
    for (const row of rows) {
      const cell = row[i];
      if (cell != null) {
        const len = String(cell).length;
        if (len > maxLen) maxLen = len;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function formatDate(date: Date | string) {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function sumGst(field: "cgst" | "sgst" | "igst", gst0: any, gst5: any, gst12: any, gst18: any, gst28: any): number {
  return (gst0?.[field] || 0) + (gst5?.[field] || 0) + (gst12?.[field] || 0) + (gst18?.[field] || 0) + (gst28?.[field] || 0);
}

// Item-level columns shared across sale/purchase reports
const SALE_ITEM_COLUMNS = [
  "Item Code", "Item Name", "HSN", "Batch No", "Expiry", "Manufacturer",
  "Qty", "Rate", "Item Discount", "GST%", "Item Total",
];

const PURCHASE_ITEM_COLUMNS = [
  "Item Name", "HSN", "Pack", "Batch No", "Expiry",
  "Qty", "Free Qty", "MRP", "Rate", "Item Discount", "GST%", "Item Total",
];

const SALES_RETURN_ITEM_COLUMNS = [
  "Item Code", "Item Name", "Qty", "Rate", "Item Discount", "GST%", "Item Total",
];

const PURCHASE_RETURN_ITEM_COLUMNS = [
  "Item Name", "HSN", "Pack", "Batch No", "Expiry",
  "Qty", "Free Qty", "MRP", "Rate", "Item Discount", "GST%", "Item Total",
];

// Sales Register headers (per-rate GST breakdown)
export const SALES_REGISTER_HEADERS = [
  "Invoice No", "Invoice Date", "Mode Of Payment", "Party Name", "City",
  ...SALE_ITEM_COLUMNS,
  "Gross Value", "Discount",
  ...GST_COLUMNS,
  "Total GST", "Rounding Amount", "Net Amount",
];

// Purchase Register headers
export const PURCHASE_REGISTER_HEADERS = [
  "Sup. Inv. No", "GSTN No", "Invoice Date", "Mode Of Payment", "Supplier Name", "City",
  ...PURCHASE_ITEM_COLUMNS,
  "Gross Value", "Discount",
  "CGST", "SGST", "IGST", "Total GST",
  "Adding", "Less", "Rounding Amount", "Net Amount",
];

// Sales Return Register headers
export const SALES_RETURN_REGISTER_HEADERS = [
  "Invoice No", "Invoice Date", "Mode Of Payment", "Party Name", "City",
  ...SALES_RETURN_ITEM_COLUMNS,
  "Gross Value", "Discount",
  "CGST", "SGST", "IGST", "Total GST",
  "Rounding Amount", "Net Amount",
];

// Purchase Return Register headers
export const PURCHASE_RETURN_REGISTER_HEADERS = [
  "Sup. Inv. No", "GSTN No", "Invoice Date", "Mode Of Payment", "Supplier Name", "City",
  ...PURCHASE_RETURN_ITEM_COLUMNS,
  "Gross Value", "Discount",
  "CGST", "SGST", "IGST", "Total GST",
  "Adding", "Less", "Rounding Amount", "Net Amount",
];
