export function printSaleBill(sale: any) {
  const clinicName = sale.clinicName || "PHARMACY";
  const clinicAddress = sale.clinicAddress || "";
  const clinicPhone = sale.clinicPhone || "";
  const isInterstate = !!sale.isInterstate;

  const fmt = (n: number, d = 2) => n.toFixed(d);

  const fmtDate = (d: string | Date) => {
    if (!d) return "—";
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  };

  const fmtExp = (d: string | Date) => {
    if (!d) return "—";
    const dt = new Date(d);
    return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getFullYear()).slice(-2)}`;
  };

  const items = (sale.items || []).map((item: any) => {
    const qty = item.quantity || item.qty || 0;
    const mrp = item.unitPrice || item.mrp || item.rate || 0;
    const discount = item.discount || 0;
    const total = item.total || +(qty * mrp - discount).toFixed(2);
    const gstRate = item.gstRate || 0;
    // total is already the taxable (base) amount; GST is added on top
    const taxable = total;
    const halfRate = gstRate / 2;
    return {
      hsnCode: item.hsnCode || "",
      itemName: item.itemName || item.name || "",
      packing: item.packing || "",
      manufacturer: item.manufacturer || "",
      batchNo: item.batchNo || item.batchNumber || "",
      expiryDate: item.expiryDate,
      mrp,
      qty,
      taxable: +taxable.toFixed(3),
      cgstRate: isInterstate ? 0 : halfRate,
      cgst: isInterstate ? 0 : +(taxable * halfRate / 100).toFixed(3),
      sgstRate: isInterstate ? 0 : halfRate,
      sgst: isInterstate ? 0 : +(taxable * halfRate / 100).toFixed(3),
      igstRate: isInterstate ? gstRate : 0,
      igst: isInterstate ? +(taxable * gstRate / 100).toFixed(3) : 0,
    };
  });

  const totTaxable = items.reduce((s: number, it: any) => s + it.taxable, 0);
  const totCgst    = items.reduce((s: number, it: any) => s + it.cgst, 0);
  const totSgst    = items.reduce((s: number, it: any) => s + it.sgst, 0);
  const totIgst    = items.reduce((s: number, it: any) => s + it.igst, 0);

  const gstCols = isInterstate
    ? `<th>IGST%</th><th>IGST ₹</th>`
    : `<th>CGST%</th><th>CGST ₹</th><th>SGST%</th><th>SGST ₹</th>`;

  const itemRows = items.map((it: any) => `
    <tr>
      <td class="tc">${it.hsnCode}</td>
      <td>${it.itemName}</td>
      <td class="tc">${it.packing}</td>
      <td class="tc">${it.manufacturer}</td>
      <td class="tc">${it.batchNo}</td>
      <td class="tr">${fmt(it.mrp, 3)}</td>
      <td class="tc">${fmtExp(it.expiryDate)}</td>
      <td class="tc">${it.qty}</td>
      <td class="tr">${fmt(it.taxable, 3)}</td>
      ${isInterstate
        ? `<td class="tc">${it.igstRate}</td><td class="tr">${fmt(it.igst, 3)}</td>`
        : `<td class="tc">${it.cgstRate}</td><td class="tr">${fmt(it.cgst, 3)}</td><td class="tc">${it.sgstRate}</td><td class="tr">${fmt(it.sgst, 3)}</td>`
      }
    </tr>`).join("");

  const totCols = isInterstate
    ? `<td></td><td class="tr bld">${fmt(totIgst, 3)}</td>`
    : `<td></td><td class="tr bld">${fmt(totCgst, 3)}</td><td></td><td class="tr bld">${fmt(totSgst, 3)}</td>`;

  const colCount = isInterstate ? 11 : 13;

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${sale.invoiceNumber || sale.saleId || "Bill"}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:8.5px;padding:6mm}
  h1{font-size:13px;text-align:center;text-transform:uppercase;letter-spacing:1px}
  .sub{font-size:8px;text-align:center;margin-top:1px}
  hr{border:none;border-top:1px solid #000;margin:3px 0}
  .inv-title{text-align:center;font-weight:bold;font-size:9px;border:1px solid #000;padding:2px 0;margin:3px 0;letter-spacing:2px}
  .bill-info{display:flex;justify-content:space-between;margin:3px 0;gap:8px}
  .bi p{margin:1.5px 0}
  table{width:100%;border-collapse:collapse;margin:4px 0}
  th,td{border:1px solid #000;padding:1.5px 3px}
  th{background:#f0f0f0;font-size:7.5px;text-align:center;font-weight:bold}
  td{font-size:8px}
  .tc{text-align:center}
  .tr{text-align:right}
  .bld{font-weight:bold}
  .net{text-align:right;font-size:11px;font-weight:bold;margin:4px 0;border-top:1px solid #000;padding-top:3px}
  .footer{display:flex;justify-content:space-between;margin-top:8px;font-size:8px}
  @media print{body{padding:3mm}@page{margin:5mm;size:A4}}
</style>
</head><body>

<h1>${clinicName}</h1>
${clinicAddress ? `<p class="sub">${clinicAddress}</p>` : ""}
${clinicPhone ? `<p class="sub">Phone: ${clinicPhone}</p>` : ""}
<hr>
<div class="inv-title">GST TAX INVOICE</div>

<div class="bill-info">
  <div class="bi">
    <p><b>Patient:</b> ${sale.patientName || "—"}</p>
    <p><b>Doctor:</b> ${sale.doctorName || "—"}</p>
    <p><b>Memo:</b> ${(sale.paymentMethod || "CASH").toUpperCase()}</p>
  </div>
  <div class="bi" style="text-align:right">
    <p><b>Bill No:</b> ${sale.invoiceNumber || sale.saleId || "—"}</p>
    <p><b>Date:</b> ${fmtDate(sale.invoiceDate || sale.createdAt)}</p>
    <p><b>PR No:</b> —</p>
  </div>
</div>
<hr>

<table>
  <thead>
    <tr>
      <th>HSN</th><th>Product Name</th><th>Packing</th><th>Mfg</th>
      <th>Batch</th><th>MRP</th><th>Exp</th><th>Qty</th><th>Amount</th>
      ${gstCols}
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
  <tfoot>
    <tr>
      <td colspan="8" class="tr bld">Total</td>
      <td class="tr bld">${fmt(totTaxable, 3)}</td>
      ${totCols}
    </tr>
  </tfoot>
</table>

<div class="net">Net Amt &nbsp; ₹${fmt(sale.totalAmount || 0, 2)}</div>

<div class="footer">
  <div>
  </div>
  <div style="text-align:right">
    <br><p><b>PHARMACIST</b></p>
  </div>
</div>

</body></html>`;

  const w = window.open("", "_blank", "width=900,height=650");
  if (!w) { alert("Please allow pop-ups to print the bill."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 600);
}
