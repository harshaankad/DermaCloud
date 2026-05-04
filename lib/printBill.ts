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

  const items = (sale.items || []).map((item: any, idx: number) => {
    const qty = item.quantity || item.qty || 0;
    const mrp = item.unitPrice || item.mrp || item.rate || 0;
    const discount = item.discount || 0;
    const total = item.total || +(qty * mrp - discount).toFixed(2);
    const gstRate = item.gstRate || 0;
    const taxable = total;
    const gstAmt = isInterstate
      ? +(taxable * gstRate / 100).toFixed(2)
      : +(taxable * gstRate / 100).toFixed(2);
    return {
      sno: idx + 1,
      itemName: item.itemName || item.name || "",
      mrp,
      qty,
      taxable: +taxable.toFixed(2),
      gstRate,
      gstAmt,
    };
  });

  const totTaxable = items.reduce((s: number, it: any) => s + it.taxable, 0);
  const totGst = items.reduce((s: number, it: any) => s + it.gstAmt, 0);

  const itemRows = items.map((it: any) => `
    <tr>
      <td class="tc">${it.sno}</td>
      <td>${it.itemName}</td>
      <td class="tc">${it.qty}</td>
      <td class="tr">${fmt(it.mrp)}</td>
      <td class="tr">${fmt(it.taxable)}</td>
      <td class="tc">${it.gstRate}%</td>
      <td class="tr">${fmt(it.gstAmt)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${sale.invoiceNumber || sale.saleId || "Bill"}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:9px;padding:4mm 6mm;max-width:100%}
  h1{font-size:14px;text-align:center;text-transform:uppercase;letter-spacing:1px;margin-bottom:1px}
  .sub{font-size:8px;text-align:center;margin-top:1px}
  hr{border:none;border-top:1px solid #000;margin:3px 0}
  .inv-title{text-align:center;font-weight:bold;font-size:9px;border:1px solid #000;padding:2px 0;margin:3px 0;letter-spacing:2px}
  .bill-info{display:flex;justify-content:space-between;margin:3px 0;gap:8px}
  .bi p{margin:1px 0;font-size:8.5px}
  table{width:100%;border-collapse:collapse;margin:3px 0}
  th,td{border:1px solid #000;padding:2px 3px}
  th{background:#f0f0f0;font-size:7.5px;text-align:center;font-weight:bold}
  td{font-size:8px}
  td:nth-child(2){white-space:normal;word-wrap:break-word}
  .tc{text-align:center}
  .tr{text-align:right}
  .bld{font-weight:bold}
  .totals{margin:3px 0;font-size:8.5px;text-align:right}
  .totals p{margin:1px 0}
  .net{text-align:right;font-size:12px;font-weight:bold;margin:4px 0;border-top:1.5px solid #000;padding-top:3px}
  .footer{display:flex;justify-content:space-between;margin-top:6px;font-size:8px}
  @media print{body{padding:3mm 5mm}@page{margin:4mm;size:A4 portrait}}
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
    <p><b>Payment:</b> ${(sale.paymentMethod || "CASH").toUpperCase()}</p>
  </div>
  <div class="bi" style="text-align:right">
    <p><b>Bill No:</b> ${sale.invoiceNumber || sale.saleId || "—"}</p>
    <p><b>Date:</b> ${fmtDate(sale.invoiceDate || sale.createdAt)}</p>
  </div>
</div>
<hr>

<table>
  <thead>
    <tr>
      <th style="width:6%">#</th>
      <th style="width:34%">Product Name</th>
      <th style="width:8%">Qty</th>
      <th style="width:14%">MRP</th>
      <th style="width:16%">Amount</th>
      <th style="width:10%">GST</th>
      <th style="width:12%">GST ₹</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
  <tfoot>
    <tr>
      <td colspan="4" class="tr bld">Total</td>
      <td class="tr bld">${fmt(totTaxable)}</td>
      <td></td>
      <td class="tr bld">${fmt(totGst)}</td>
    </tr>
  </tfoot>
</table>

<div class="net">Net Amount: ₹${fmt(sale.totalAmount || 0, 2)}</div>

<div class="footer">
  <div></div>
  <div style="text-align:right">
    <br><p><b>PHARMACIST</b></p>
  </div>
</div>

</body></html>`;

  const w = window.open("", "_blank", "width=600,height=700");
  if (!w) { alert("Please allow pop-ups to print the bill."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 600);
}
