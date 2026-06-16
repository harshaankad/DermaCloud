/**
 * Server-side PDF generation for signed consent forms.
 *
 * Renders a self-contained A4 document: clinic header, patient details, the
 * filled procedure blanks, the consent body (lightweight markdown), the captured
 * signatures (patient/guardian + operating doctor) and an audit footer.
 *
 * Helpers (geometry, hLine, ensureSpace, infoTable, textBlock) mirror the
 * cosmetology report generator so the visual language stays consistent.
 */

import PDFDocument from "pdfkit";

const PW = 595.28;
const PH = 841.89;
const MT = 50;
const ML = 50;
const MR = 50;
const MB = 50;
const CW = PW - ML - MR;

const BLACK = "#000000";
const GREY = "#555555";
const BORDER = "#999999";

export interface ConsentPdfField {
  label: string;
  value: string;
}

export interface ConsentPdfOptions {
  clinicName: string;
  title: string;
  source?: string;
  patient: {
    name: string;
    code?: string;
    age?: number;
    gender?: string;
    phone?: string;
    address?: string;
  };
  dateStr: string;
  fields: ConsentPdfField[];
  bodyMarkdown: string;
  isMinor: boolean;
  guardianName?: string;
  guardianRelation?: string;
  doctorName?: string;
  doctorSignature?: Buffer | null;
  patientSignature: Buffer;
  signatureMethod: "drawn" | "thumb" | "uploaded";
  recordId: string;
}

function hLine(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number, color = BLACK, lw = 0.5) {
  doc.save().moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(lw).stroke().restore();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > PH - MB) {
    doc.addPage();
    doc.y = MT;
  }
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 30);
  doc.y += 10;
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(10)
    .text(title.toUpperCase(), ML, doc.y, { width: CW, lineBreak: false });
  doc.y += 13;
  hLine(doc, ML, ML + CW, doc.y, BLACK, 0.8);
  doc.y += 8;
}

function infoTable(doc: PDFKit.PDFDocument, rows: ConsentPdfField[]) {
  if (rows.length === 0) return;
  const labelW = Math.round(CW * 0.3);
  const valueW = CW - labelW;
  const pad = 8;
  const minH = 20;

  rows.forEach((row) => {
    doc.font("Helvetica").fontSize(9.5);
    const textH = doc.heightOfString(row.value || " ", { width: valueW - pad * 2 });
    const rowH = Math.max(minH, Math.ceil(textH) + pad * 2);

    ensureSpace(doc, rowH + 4);
    const y = doc.y;

    doc.save().rect(ML, y, CW, rowH).strokeColor(BORDER).lineWidth(0.5).stroke().restore();
    doc.save().moveTo(ML + labelW, y).lineTo(ML + labelW, y + rowH)
      .strokeColor(BORDER).lineWidth(0.5).stroke().restore();

    doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(9)
      .text(row.label, ML + pad, y + pad, { width: labelW - pad * 2 });
    doc.fillColor(BLACK).font("Helvetica").fontSize(9.5)
      .text(row.value || "—", ML + labelW + pad, y + pad, { width: valueW - pad * 2 });

    doc.y = y + rowH;
  });
}

// Minimal renderer: ## / ### headings become small bold headings; every other
// line is a clean left-aligned paragraph. Bullet markers are stripped so the
// body reads as plain prose with even spacing between clauses.
function textBlock(doc: PDFKit.PDFDocument, text: string) {
  const w = CW;
  const FONT = 9.5;
  const lineGap = 2.5;
  const paraGap = 6; // space after each paragraph/clause

  const paragraph = (line: string) => {
    const plain = line.replace(/\*\*([^*]+)\*\*/g, "$1");
    const h = doc.heightOfString(plain, { width: w, lineGap });
    ensureSpace(doc, h + paraGap);
    doc.fillColor(BLACK).font("Helvetica").fontSize(FONT).text(plain, ML, doc.y, { width: w, lineGap, align: "left" });
    doc.y += paraGap;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue; // blank lines collapse — spacing handled by paraGap

    if (line.startsWith("## ") || line.startsWith("### ")) {
      const heading = line.replace(/^#{2,3}\s+/, "");
      ensureSpace(doc, 28);
      doc.y += 4;
      doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(10.5).text(heading, ML, doc.y, { width: w });
      doc.y += 4;
      continue;
    }

    // Strip any leading bullet/dash marker — minimal prose, no bullets.
    paragraph(line.replace(/^[•\-]\s+/, ""));
  }
}

function signatureCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  cellW: number,
  image: Buffer | null,
  caption: string,
  subCaption: string
) {
  const boxH = 60;
  // Signature image (or blank line for absent doctor signature).
  if (image) {
    try {
      doc.image(image, x, y, { fit: [cellW, boxH], align: "center", valign: "bottom" });
    } catch {
      /* ignore unreadable image */
    }
  }
  const lineY = y + boxH + 4;
  hLine(doc, x, x + cellW, lineY, BLACK, 0.6);
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(8.5)
    .text(caption, x, lineY + 4, { width: cellW, lineBreak: false });
  if (subCaption) {
    doc.fillColor(GREY).font("Helvetica").fontSize(8)
      .text(subCaption, x, lineY + 15, { width: cellW });
  }
}

export async function buildConsentPdf(opts: ConsentPdfOptions): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MT, bottom: MB, left: ML, right: MR },
    bufferPages: true,
    info: { Title: opts.title, Author: "DermaCloud", Creator: "DermaCloud" },
  });

  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.y = MT;

  // ── Header ──
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(15)
    .text(opts.clinicName, ML, doc.y, { width: CW, align: "center" });
  doc.y += 2;
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(12)
    .text(opts.title, ML, doc.y, { width: CW, align: "center" });
  if (opts.source) {
    doc.y += 1;
    doc.fillColor(GREY).font("Helvetica-Oblique").fontSize(8)
      .text(opts.source, ML, doc.y, { width: CW, align: "center" });
  }
  doc.y += 6;
  hLine(doc, ML, ML + CW, doc.y, BLACK, 1);
  doc.y += 6;

  // ── Patient details ──
  const p = opts.patient;
  const genderStr = (p.gender || "").charAt(0).toUpperCase() + (p.gender || "").slice(1);
  const detailRows: ConsentPdfField[] = [
    { label: "Patient Name", value: p.name },
    { label: "Patient ID", value: p.code || "—" },
    { label: "Age / Gender", value: `${p.age ?? "—"}${p.age != null ? " yrs" : ""}  ·  ${genderStr || "—"}` },
    { label: "Phone", value: p.phone || "—" },
    { label: "Date", value: opts.dateStr },
  ];
  if (p.address) detailRows.push({ label: "Address", value: p.address });
  for (const f of opts.fields) {
    if (f.value && f.value.trim()) detailRows.push(f);
  }
  infoTable(doc, detailRows);

  // ── Consent body ──
  sectionHeader(doc, "Consent");
  textBlock(doc, opts.bodyMarkdown);

  // ── Signatures ──
  doc.y += 14;
  ensureSpace(doc, 130);
  sectionHeader(doc, "Signatures");
  doc.y += 6;

  const gap = 30;
  const cellW = (CW - gap) / 2;
  const rowY = doc.y;

  // Patient / guardian (left)
  const patientCaption = opts.isMinor ? "Signature of Guardian" : "Signature of Patient";
  let patientSub = "";
  if (opts.isMinor) {
    patientSub = `${opts.guardianName || ""}${opts.guardianRelation ? ` (${opts.guardianRelation})` : ""} — for ${p.name}`;
  } else {
    patientSub = p.name + (opts.signatureMethod === "thumb" ? " (thumb impression)" : "");
  }
  signatureCell(doc, ML, rowY, cellW, opts.patientSignature, patientCaption, patientSub);

  // Operating doctor (right)
  signatureCell(
    doc,
    ML + cellW + gap,
    rowY,
    cellW,
    opts.doctorSignature || null,
    "Operating Doctor",
    opts.doctorName || ""
  );

  doc.y = rowY + 60 + 4 + 30;

  // ── Audit footer ──
  doc.y += 16;
  ensureSpace(doc, 30);
  hLine(doc, ML, ML + CW, doc.y, BORDER, 0.5);
  doc.y += 6;
  doc.fillColor(GREY).font("Helvetica").fontSize(7.5)
    .text(
      `Electronically signed and recorded via DermaCloud on ${opts.dateStr}.  Record ID: ${opts.recordId}`,
      ML,
      doc.y,
      { width: CW, align: "center" }
    );

  doc.end();
  return done;
}
