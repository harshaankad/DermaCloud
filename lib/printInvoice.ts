// Plain black-and-white invoice for a single clinic revenue entry (consultation,
// follow-up or cosmetology procedure). Mirrors the pharmacy cash receipt
// (lib/printBill.ts) so clinics get one consistent, CA-friendly invoice style.
//
// Consultations & follow-ups are GST-exempt healthcare services; cosmetology
// procedures carry the GST captured at booking time.
export interface InvoiceData {
  clinicName?: string;
  clinicGstin?: string;
  invoiceNumber?: string;
  invoiceDate?: string | Date;
  patientName?: string;
  patientPhone?: string;
  patientCode?: string;
  paymentMode?: string;
  serviceLabel: string;
  isProcedure: boolean;
  basePrice?: number;
  gstRate?: number;
  gstAmount?: number;
  totalAmount: number;
}

export function printAppointmentInvoice(inv: InvoiceData) {
  const clinicName = inv.clinicName || "CLINIC";
  const clinicGstin = inv.clinicGstin || "";

  const fmt = (n: number) => Number(n || 0).toFixed(2);

  const fmtDate = (d: string | Date | undefined) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return `${String(dt.getDate()).padStart(2, "0")}-${dt.toLocaleString("en-US", { month: "short" })}-${dt.getFullYear()}`;
  };

  const base = Number(inv.basePrice) || 0;
  const gstRate = Number(inv.gstRate) || 0;
  const gstAmount = Number(inv.gstAmount) || 0;
  const total = Number(inv.totalAmount) || 0;

  const itemRow = `
    <tr>
      <td class="tc">1</td>
      <td>${inv.serviceLabel || ""}</td>
      <td class="tc">1</td>
      <td class="tr">${fmt(total)}</td>
    </tr>`;

  const totalsRows = [
    inv.isProcedure ? { label: "Base Amount", value: fmt(base), bold: false } : null,
    inv.isProcedure ? { label: `GST (${gstRate}%)`, value: fmt(gstAmount), bold: false } : null,
    { label: "Total Payable Amount", value: fmt(total), bold: true, highlight: true },
  ]
    .filter(Boolean)
    .map((row: any) => `
    <tr${row.highlight ? ' class="payable-row"' : ""}>
      <td class="tot-label${row.bold ? " bld" : ""}">${row.label}:</td>
      <td class="tot-val${row.bold ? " bld" : ""}">${row.value}</td>
    </tr>`)
    .join("");

  const gstNote = inv.isProcedure
    ? ""
    : `<div class="note">Consultation is a healthcare service and is exempt from GST.</div>`;

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${inv.invoiceNumber || "Invoice"}</title>
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
  .note{margin-top:16px;font-size:10px;color:#444}
  .footer{margin-top:24px;text-align:center;font-size:11px;color:#444;border-top:1px solid #ccc;padding-top:8px}
  @media print{body{padding:8mm 12mm}@page{margin:0;size:A4 portrait}}
</style>
</head><body>

<div class="clinic-name">${clinicName}</div>
${clinicGstin ? `<div class="clinic-gstin">GSTIN: ${clinicGstin}</div>` : ""}
<div class="receipt-title">Invoice</div>

<div class="bill-info">
  <div class="col">
    <div class="row"><span class="lbl">Patient Name</span><span class="sep">:</span> <span>${inv.patientName || "—"}</span></div>
    <div class="row"><span class="lbl">Mobile Number</span><span class="sep">:</span> <span>${inv.patientPhone || "—"}</span></div>
    <div class="row"><span class="lbl">Patient ID</span><span class="sep">:</span> <span>${inv.patientCode || "—"}</span></div>
  </div>
  <div class="col">
    <div class="row"><span class="lbl">Invoice Number</span><span class="sep">:</span> <span>${inv.invoiceNumber || "—"}</span></div>
    <div class="row"><span class="lbl">Invoice Date</span><span class="sep">:</span> <span>${fmtDate(inv.invoiceDate)}</span></div>
    <div class="row"><span class="lbl">Payment Mode</span><span class="sep">:</span> <span>${inv.paymentMode ? inv.paymentMode.toUpperCase() : "—"}</span></div>
  </div>
</div>

<table class="items">
  <thead>
    <tr>
      <th class="tc" style="width:6%">#</th>
      <th style="width:64%">Description</th>
      <th class="tc" style="width:10%">Qty</th>
      <th class="tr" style="width:20%">Amount</th>
    </tr>
  </thead>
  <tbody>${itemRow}</tbody>
</table>

<table class="totals">${totalsRows}</table>

${gstNote}

<div class="footer">This is a computer generated invoice.</div>

</body></html>`;

  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) { alert("Please allow pop-ups to print the invoice."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 600);
}
