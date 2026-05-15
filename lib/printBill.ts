export function printSaleBill(sale: any) {
  const clinicName = sale.clinicName || "PHARMACY";
  const clinicGstin = sale.clinicGstin || "";

  const fmt = (n: number, d = 2) => Number(n || 0).toFixed(d);

  const fmtDate = (d: string | Date) => {
    if (!d) return "—";
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, "0")}-${dt.toLocaleString("en-US", { month: "short" })}-${dt.getFullYear()}`;
  };

  const fmtExpiry = (d: string | Date | undefined) => {
    if (!d) return "—";
    const dt = new Date(d);
    return `${dt.toLocaleString("en-US", { month: "short" })}-${String(dt.getFullYear()).slice(-2)}`;
  };

  // Totals — MRP is GST-inclusive in this codebase, so item.total already includes GST.
  // CGST/SGST are shown for the tax breakup; they don't add on top of Total Bill Amount.
  const totalBill = Number(sale.grossValue ?? sale.subtotal ?? 0);
  const cgst = Number(sale.gst0?.cgst || 0) + Number(sale.gst5?.cgst || 0) + Number(sale.gst12?.cgst || 0) + Number(sale.gst18?.cgst || 0) + Number(sale.gst28?.cgst || 0);
  const sgst = Number(sale.gst0?.sgst || 0) + Number(sale.gst5?.sgst || 0) + Number(sale.gst12?.sgst || 0) + Number(sale.gst18?.sgst || 0) + Number(sale.gst28?.sgst || 0);
  const igst = Number(sale.igst || 0);
  const discount = Number(sale.discountAmount || 0);
  // Discount % is relative to the pre-discount gross (MRP × qty), not the displayed
  // Total Bill (which is already net of discount). 7.50 / 150 = 5%, not 7.50 / 142.50.
  const preDiscountGross = totalBill + discount;
  const discountPct = preDiscountGross > 0 && discount > 0 ? (discount / preDiscountGross) * 100 : 0;
  const roundOff = Number(sale.roundingAmount || 0);
  const payable = Number(sale.totalAmount || 0);
  const paymentStatus = (sale.paymentStatus || "paid") as string;
  const statusLabel = paymentStatus === "pending" ? "UNPAID"
    : paymentStatus === "partial" ? "PARTIAL"
    : paymentStatus === "refunded" ? "REFUNDED"
    : "";

  const itemRows = (sale.items || []).map((item: any, idx: number) => `
    <tr>
      <td class="tc">${idx + 1}</td>
      <td>${item.itemName || ""}</td>
      <td>${item.batchNo || "—"}</td>
      <td>${item.hsnCode || "—"}</td>
      <td>${fmtExpiry(item.expiryDate)}</td>
      <td class="tr">${fmt(item.unitPrice || 0)}</td>
      <td class="tc">${item.quantity || 0}</td>
      <td class="tr">${fmt(item.total || 0)}</td>
    </tr>`).join("");

  const totalsRows = [
    { label: "Total Bill Amount", value: fmt(totalBill), bold: true },
    igst > 0
      ? { label: "IGST", value: fmt(igst), bold: false }
      : null,
    igst === 0 && (cgst > 0 || sgst > 0)
      ? { label: "CGST", value: fmt(cgst), bold: false }
      : null,
    igst === 0 && (cgst > 0 || sgst > 0)
      ? { label: "SGST", value: fmt(sgst), bold: false }
      : null,
    discount > 0
      ? { label: `Discount${discountPct > 0 ? ` (${discountPct.toFixed(2).replace(/\.?0+$/, "")}%)` : ""}`, value: fmt(discount), bold: false }
      : null,
    roundOff !== 0
      ? { label: "Round Off", value: fmt(roundOff), bold: false }
      : null,
    { label: "Total Payable Amount", value: fmt(payable), bold: true, highlight: true },
  ].filter(Boolean).map((row: any) => `
    <tr${row.highlight ? ' class="payable-row"' : ""}>
      <td class="tot-label${row.bold ? " bld" : ""}">${row.label}:</td>
      <td class="tot-val${row.bold ? " bld" : ""}">${row.value}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${sale.invoiceNumber || sale.saleId || "Bill"}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11px;padding:10mm 14mm;color:#111}
  .clinic-name{font-size:20px;text-align:center;text-transform:uppercase;letter-spacing:1px;font-weight:bold;margin-bottom:2px}
  .clinic-gstin{font-size:11px;text-align:center;margin-bottom:6px;letter-spacing:0.5px}
  .receipt-title{font-size:14px;text-align:center;font-weight:bold;margin:8px 0 12px;letter-spacing:0.5px}
  hr{border:none;border-top:1px solid #111;margin:6px 0}
  .bill-info{display:flex;justify-content:space-between;gap:24px;margin-bottom:14px}
  .bill-info .col{display:flex;flex-direction:column;gap:3px}
  .bill-info .row{display:flex;gap:6px;font-size:12px}
  .bill-info .row .lbl{font-weight:bold;min-width:115px}
  .bill-info .row .sep{font-weight:bold}
  table.items{width:100%;border-collapse:collapse;margin:10px 0 6px}
  table.items th{font-size:11px;font-weight:bold;text-align:left;padding:6px 4px;border-bottom:1.5px solid #111}
  table.items td{font-size:11px;padding:5px 4px;border-bottom:1px dashed #ccc}
  table.items th.tc, table.items td.tc{text-align:center}
  table.items th.tr, table.items td.tr{text-align:right}
  table.totals{margin-left:auto;margin-top:8px;border-collapse:collapse}
  table.totals td{padding:3px 6px;font-size:12px}
  table.totals td.tot-label{text-align:right;min-width:160px}
  table.totals td.tot-val{text-align:right;min-width:80px}
  table.totals tr.payable-row td{border-top:1.5px solid #111;padding-top:6px;padding-bottom:4px;font-size:13px}
  .bld{font-weight:bold}
  .footer{margin-top:24px;text-align:center;font-size:11px;color:#444;border-top:1px solid #ccc;padding-top:8px}
  @media print{body{padding:8mm 12mm}@page{margin:0;size:A4 portrait}}
</style>
</head><body>

<div class="clinic-name">${clinicName}</div>
${clinicGstin ? `<div class="clinic-gstin">GSTIN: ${clinicGstin}</div>` : ""}
<div class="receipt-title">Cash Receipt</div>

<div class="bill-info">
  <div class="col">
    <div class="row"><span class="lbl">Patient Name</span><span class="sep">:</span> <span>${sale.patientName || "—"}</span></div>
    <div class="row"><span class="lbl">Mobile Number</span><span class="sep">:</span> <span>${sale.patientPhone || "—"}</span></div>
    <div class="row"><span class="lbl">Patient ID</span><span class="sep">:</span> <span>${sale.patientCode || "—"}</span></div>
  </div>
  <div class="col">
    <div class="row"><span class="lbl">Bill Number</span><span class="sep">:</span> <span>${sale.invoiceNumber || sale.saleId || "—"}</span></div>
    <div class="row"><span class="lbl">Bill Date</span><span class="sep">:</span> <span>${fmtDate(sale.invoiceDate || sale.createdAt)}</span></div>
    ${statusLabel ? `<div class="row"><span class="lbl">Status</span><span class="sep">:</span> <span class="bld">${statusLabel}</span></div>` : ""}
  </div>
</div>

<table class="items">
  <thead>
    <tr>
      <th class="tc" style="width:4%">#</th>
      <th style="width:28%">Item</th>
      <th style="width:14%">Batch</th>
      <th style="width:12%">HSN Code</th>
      <th style="width:10%">Exp</th>
      <th class="tr" style="width:10%">Price</th>
      <th class="tc" style="width:8%">Qty</th>
      <th class="tr" style="width:14%">Amount</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>

<table class="totals">${totalsRows}</table>

<div class="footer">This is a computer generated bill so no signature required.</div>

</body></html>`;

  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) { alert("Please allow pop-ups to print the bill."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 600);
}
