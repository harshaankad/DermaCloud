/**
 * Server-side PDF generation for cosmetology consultation reports.
 *
 * Top 130pt of every page is left blank for the clinic's pre-printed letterhead.
 * Body is plain black text with thin grey borders only (no fills, no colors).
 *
 * Field-level toggles: caller passes `includedFields` (array of keys). Patient
 * name + age/gender always render at top.
 */

import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import { applyClinicBranding } from "@/lib/pdf/clinicBranding";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import "@/models/Clinic";
import "@/models/User";
import "@/models/Patient";
import path from "path";
import fs from "fs";

// ── Page geometry ─────────────────────────────────────────────────────────────
const PW = 595.28;
const PH = 841.89;
const MT = 130;    // top — reserved for pre-printed letterhead on every page
const ML = 50;
const MR = 50;
const MB = 50;
const CW = PW - ML - MR;

// ── Font paths for Indic scripts ──────────────────────────────────────────────
const FONTS_DIR = path.join(process.cwd(), "public", "fonts");
const KANNADA_FONT         = path.join(FONTS_DIR, "NotoSansKannada-Regular.ttf");
const KANNADA_BOLD_FONT    = path.join(FONTS_DIR, "NotoSansKannada-Bold.ttf");
const DEVANAGARI_FONT      = path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf");
const DEVANAGARI_BOLD_FONT = path.join(FONTS_DIR, "NotoSansDevanagari-Bold.ttf");

// ── Plain palette ─────────────────────────────────────────────────────────────
const BLACK  = "#000000";
const BORDER = "#999999";

// ── Drawing helpers ───────────────────────────────────────────────────────────
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
  doc.y += 12;
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(10)
     .text(title.toUpperCase(), ML, doc.y, { width: CW, lineBreak: false });
  doc.y += 13;
  hLine(doc, ML, ML + CW, doc.y, BLACK, 0.8);
  doc.y += 8;
}

function patientInfoLine(doc: PDFKit.PDFDocument, name: string, age: any, gender: string) {
  ensureSpace(doc, 28);
  const y = doc.y;
  const genderStr = (gender || "").charAt(0).toUpperCase() + (gender || "").slice(1);
  const right = `Age / Gender: ${age || "N/A"} yrs  ·  ${genderStr || "N/A"}`;
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(11)
     .text(name || "N/A", ML, y, { lineBreak: false });
  doc.fillColor(BLACK).font("Helvetica").fontSize(10)
     .text(right, ML, y + 1, { width: CW, align: "right", lineBreak: false });
  doc.y = y + 18;
  hLine(doc, ML, ML + CW, doc.y, BLACK, 0.6);
  doc.y += 6;
}

function infoTable(doc: PDFKit.PDFDocument, rows: { label: string; value: string }[]) {
  if (rows.length === 0) return;
  const labelW = Math.round(CW * 0.32);
  const valueW = CW - labelW;
  const pad    = 8;
  const minH   = 22;

  rows.forEach((row) => {
    doc.font("Helvetica").fontSize(9.5);
    const textH = doc.heightOfString(row.value || " ", { width: valueW - pad * 2 });
    const rowH  = Math.max(minH, Math.ceil(textH) + pad * 2);

    ensureSpace(doc, rowH + 4);
    const y = doc.y;

    doc.save().rect(ML, y, CW, rowH).strokeColor(BORDER).lineWidth(0.5).stroke().restore();
    doc.save().moveTo(ML + labelW, y).lineTo(ML + labelW, y + rowH)
       .strokeColor(BORDER).lineWidth(0.5).stroke().restore();

    doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(9)
       .text(row.label, ML + pad, y + pad, { width: labelW - pad * 2, lineBreak: false });
    doc.fillColor(BLACK).font("Helvetica").fontSize(9.5)
       .text(row.value || "—", ML + labelW + pad, y + pad, { width: valueW - pad * 2 });

    doc.y = y + rowH;
  });
}

function textBlock(doc: PDFKit.PDFDocument, text: string, useIndicFont = false) {
  const pad = 10;
  const w   = CW - pad * 2;
  const lines = text.split("\n");
  const bodyFont = useIndicFont ? "Indic" : "Helvetica";
  const boldFont = useIndicFont ? "IndicBold" : "Helvetica-Bold";
  const lineEst  = useIndicFont ? 40 : 16;
  const lineGap  = useIndicFont ? 6  : 2;

  const safePageBreak = () => {
    if (doc.y > PH - MB) { doc.addPage(); doc.y = MT; }
  };

  const renderLineWithBold = (line: string, x: number, fontSize: number, maxWidth: number) => {
    if (!line.includes("**")) {
      doc.fillColor(BLACK).font(bodyFont).fontSize(fontSize)
         .text(line, x, doc.y, { width: maxWidth, lineGap });
      return;
    }
    const segments = line.split(/(\*\*[^*]+\*\*)/g);
    let currentX = x;
    const startY = doc.y;
    let totalWidth = 0;
    for (const seg of segments) {
      if (!seg) continue;
      const isBold = seg.startsWith("**") && seg.endsWith("**");
      const segText = isBold ? seg.slice(2, -2) : seg;
      doc.font(isBold ? boldFont : bodyFont).fontSize(fontSize);
      totalWidth += doc.widthOfString(segText);
    }
    if (totalWidth <= maxWidth) {
      for (const seg of segments) {
        if (!seg) continue;
        const isBold = seg.startsWith("**") && seg.endsWith("**");
        const segText = isBold ? seg.slice(2, -2) : seg;
        doc.fillColor(BLACK).font(isBold ? boldFont : bodyFont).fontSize(fontSize)
           .text(segText, currentX, startY, { continued: segments.indexOf(seg) < segments.length - 1, lineGap });
        currentX += doc.widthOfString(segText);
      }
      doc.text("", x, doc.y);
    } else {
      const plainText = line.replace(/\*\*([^*]+)\*\*/g, "$1");
      doc.fillColor(BLACK).font(bodyFont).fontSize(fontSize)
         .text(plainText, x, doc.y, { width: maxWidth, lineGap });
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) { doc.y += 8; continue; }

    if (useIndicFont) {
      const plainText = line.replace(/^##+ /, "").replace(/\*\*/g, "");
      ensureSpace(doc, lineEst);
      doc.fillColor(BLACK).font(bodyFont).fontSize(9.5)
         .text(plainText, ML + pad, doc.y, { width: w, lineGap });
      doc.y += 2;
      safePageBreak();
      continue;
    }

    if (line.startsWith("## ")) {
      ensureSpace(doc, 28);
      doc.y += 6;
      doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(12)
         .text(line.slice(3), ML + pad, doc.y, { width: w, lineGap });
      doc.y += 4;
      safePageBreak();
      continue;
    }
    if (line.startsWith("### ")) {
      ensureSpace(doc, 24);
      doc.y += 4;
      doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(10.5)
         .text(line.slice(4), ML + pad, doc.y, { width: w, lineGap });
      doc.y += 3;
      safePageBreak();
      continue;
    }
    if (line.startsWith("• ") || line.startsWith("- ")) {
      ensureSpace(doc, lineEst);
      renderLineWithBold(line, ML + pad + 8, 9.5, w - 8);
      doc.y += 4;
      safePageBreak();
      continue;
    }

    ensureSpace(doc, lineEst);
    renderLineWithBold(line, ML + pad, 9.5, w);
    doc.y += 2;
    safePageBreak();
  }
}

function prescriptionTable(doc: PDFKit.PDFDocument, meds: any[]) {
  const cols = [
    { label: "#",            w: 22  },
    { label: "Medicine",     w: 110 },
    { label: "Dosage",       w: 55  },
    { label: "Route",        w: 50  },
    { label: "Frequency",    w: 65  },
    { label: "Duration",     w: 55  },
    { label: "Qty",          w: 38  },
    { label: "Instructions", w: CW - 22 - 110 - 55 - 50 - 65 - 55 - 38 },
  ];
  const minRowH = 20;
  const headerH = 18;
  const pad = 5;

  ensureSpace(doc, headerH + minRowH + 10);
  const startY = doc.y;

  let x = ML;
  for (const col of cols) {
    doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(7.5)
       .text(col.label.toUpperCase(), x + pad, startY + 5, { width: col.w - pad * 2, lineBreak: false });
    x += col.w;
  }
  doc.save().rect(ML, startY, CW, headerH).strokeColor(BORDER).lineWidth(0.5).stroke().restore();
  let dx = ML;
  for (let i = 0; i < cols.length - 1; i++) {
    dx += cols[i].w;
    doc.save().moveTo(dx, startY).lineTo(dx, startY + headerH).strokeColor(BORDER).lineWidth(0.4).stroke().restore();
  }
  doc.y = startY + headerH;

  meds.forEach((med: any, idx: number) => {
    const vals = [
      String(idx + 1),
      med.name || "—",
      med.dosage || "—",
      med.route || "—",
      med.frequency || "—",
      med.duration || "—",
      med.quantity || "—",
      med.instructions || "—",
    ];

    // Pre-measure each cell's wrapped height; row grows to fit the tallest cell.
    let maxTextH = 0;
    vals.forEach((val, ci) => {
      const isName = ci === 1;
      doc.font(isName ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      const h = doc.heightOfString(val, { width: cols[ci].w - pad * 2 });
      if (h > maxTextH) maxTextH = h;
    });
    const rowH = Math.max(minRowH, Math.ceil(maxTextH) + pad * 2);

    ensureSpace(doc, rowH + 2);
    const y = doc.y;
    x = ML;
    vals.forEach((val, ci) => {
      const isName = ci === 1;
      doc.fillColor(BLACK).font(isName ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
         .text(val, x + pad, y + pad, { width: cols[ci].w - pad * 2 });
      x += cols[ci].w;
    });

    doc.save().rect(ML, y, CW, rowH).strokeColor(BORDER).lineWidth(0.4).stroke().restore();
    let vx = ML;
    for (let i = 0; i < cols.length - 1; i++) {
      vx += cols[i].w;
      doc.save().moveTo(vx, y).lineTo(vx, y + rowH).strokeColor(BORDER).lineWidth(0.3).stroke().restore();
    }
    doc.y = y + rowH;
  });

  doc.y += 6;
}

// Keys handled by hardcoded rendering — anything else in fd is a custom field.
const KNOWN_FIELD_KEYS = new Set([
  "contact",
  "primaryConcern", "skinType",
  "findings", "diagnosis", "baselineEvaluation", "contraindicationsCheck",
  "procedureName", "name", "goals", "sessionNumber", "package",
  "productsAndParameters", "immediateOutcome",
  "basePrice", "gstRate", "gstAmount", "totalAmount",
  "instructions", "homeProducts", "expectedResults", "followUpDate",
  "risksExplained", "consentConfirmed",
  "prescription",
  "aiExplanation", "aiTranslation",
  "_multiIssue", "_issues", "procedureId",
]);

function buildCustomRows(fd: Record<string, any>, includedFields: Set<string>, fieldLabels: Record<string, string>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const [key, val] of Object.entries(fd)) {
    if (!includedFields.has(key)) continue;
    if (KNOWN_FIELD_KEYS.has(key)) continue;
    if (val == null || val === "") continue;
    if (typeof val === "string" && !val.trim()) continue;
    if (Array.isArray(val) || typeof val === "object") continue;
    const label = fieldLabels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    rows.push({ label, value: String(val) });
  }
  return rows;
}

// ── Field label map (must match frontend) ────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  contact: "Contact",
  primaryConcern: "Primary Concern",
  skinType: "Skin Type",
  findings: "Clinical Findings",
  diagnosis: "Diagnosis",
  baselineEvaluation: "Baseline Evaluation",
  contraindicationsCheck: "Contraindications",
  procedureName: "Procedure Name",
  goals: "Treatment Goals",
  sessionNumber: "Session Number",
  package: "Package",
  productsAndParameters: "Products & Parameters",
  immediateOutcome: "Immediate Outcome",
  basePrice: "Procedure Base Price",
  gstRate: "GST Rate",
  gstAmount: "GST Amount",
  totalAmount: "Procedure Total",
  instructions: "Aftercare Instructions",
  homeProducts: "Home Products",
  expectedResults: "Expected Results",
  followUpDate: "Follow-up Date",
  risksExplained: "Risks Explained",
  consentConfirmed: "Consent Status",
};

const FORMAT: Record<string, (v: any) => string> = {
  followUpDate: (v) => {
    try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }); }
    catch { return String(v); }
  },
  consentConfirmed: (v) => (v === true || v === "true" ? "Confirmed" : "Not confirmed"),
  basePrice:   (v) => `Rs. ${Number(v).toLocaleString("en-IN")}`,
  gstAmount:   (v) => `Rs. ${Number(v).toLocaleString("en-IN")}`,
  totalAmount: (v) => `Rs. ${Number(v).toLocaleString("en-IN")}`,
  gstRate:     (v) => `${Number(v)}%`,
};

function buildPdf(
  doc: PDFKit.PDFDocument,
  consultation: any,
  includedFields: Set<string>,
  language: string | null,
  fieldLabels: Record<string, string>,
) {
  const indicFontPath     = language === "hindi" ? DEVANAGARI_FONT      : KANNADA_FONT;
  const indicBoldFontPath = language === "hindi" ? DEVANAGARI_BOLD_FONT : KANNADA_BOLD_FONT;
  if (language && fs.existsSync(indicFontPath)) {
    doc.registerFont("Indic", indicFontPath);
    doc.registerFont("IndicBold", fs.existsSync(indicBoldFontPath) ? indicBoldFontPath : indicFontPath);
  }

  const patient  = consultation.patientId   || {};
  const info     = consultation.patientInfo || {};
  const assess   = consultation.assessment  || {};
  const proc     = consultation.procedure   || {};
  const ac       = consultation.aftercare   || {};
  const consent  = consultation.consent     || {};
  const summary  = consultation.patientSummary || {};

  const has = (key: string) => includedFields.has(key);

  doc.y = MT;

  patientInfoLine(doc, info.name || "N/A", info.age, info.gender);

  const dateStr = new Date(consultation.consultationDate).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const pidStr = patient.patientId || "N/A";
  const metaY = doc.y;
  doc.fillColor(BLACK).font("Helvetica").fontSize(9).text(`Date: ${dateStr}`, ML, metaY, { lineBreak: false });
  doc.fillColor(BLACK).font("Helvetica").fontSize(9)
     .text(`Patient ID: ${pidStr}`, ML, metaY, { width: CW, align: "right", lineBreak: false });
  doc.y = metaY + 14;

  if (has("contact") && patient.phone) {
    infoTable(doc, [{ label: "Contact", value: patient.phone }]);
  }

  const cf = consultation.customFields || {};
  const isMultiIssue =
    cf._multiIssue === true &&
    Array.isArray(cf._issues) &&
    cf._issues.length > 1;

  const orderedKeys: { key: string; alts?: string[] }[] = [
    { key: "primaryConcern" },
    { key: "skinType" },
    { key: "findings" },
    { key: "diagnosis" },
    { key: "baselineEvaluation" },
    { key: "contraindicationsCheck" },
    { key: "procedureName", alts: ["name"] },
    { key: "goals" },
    { key: "sessionNumber" },
    { key: "package" },
    { key: "productsAndParameters" },
    { key: "immediateOutcome" },
    { key: "basePrice" },
    { key: "gstRate" },
    { key: "gstAmount" },
    { key: "totalAmount" },
    { key: "instructions" },
    { key: "homeProducts" },
    { key: "expectedResults" },
    { key: "followUpDate" },
    { key: "risksExplained" },
    { key: "consentConfirmed" },
  ];

  const renderIssue = (fd: Record<string, any>, issueTitle?: string) => {
    const rows: { label: string; value: string }[] = [];
    for (const item of orderedKeys) {
      if (!has(item.key)) continue;
      let val: any = fd[item.key];
      if (val == null || val === "") {
        val = item.alts ? item.alts.map((a) => fd[a]).find(Boolean) : undefined;
      }
      if (val == null || val === "") continue;
      const formatted = FORMAT[item.key] ? FORMAT[item.key](val) : String(val);
      rows.push({ label: FIELD_LABELS[item.key], value: formatted });
    }

    const rxMeds = has("prescription") && Array.isArray(fd.prescription)
      ? fd.prescription.filter((m: any) => m.name?.trim())
      : [];

    const customRows = buildCustomRows(fd, includedFields, fieldLabels);

    if (rows.length === 0 && rxMeds.length === 0 && customRows.length === 0) return;

    if (issueTitle) sectionHeader(doc, issueTitle);
    if (rows.length) infoTable(doc, rows);
    if (rxMeds.length > 0) {
      if (!issueTitle) sectionHeader(doc, "Prescription (Rx)");
      prescriptionTable(doc, rxMeds);
    }
    if (customRows.length) {
      if (!issueTitle) sectionHeader(doc, "Additional Details");
      infoTable(doc, customRows);
    }
  };

  if (isMultiIssue) {
    const issues: any[] = cf._issues;
    issues.forEach((issue: any, idx: number) => {
      const fd = idx === 0
        ? {
            primaryConcern: info.primaryConcern, ...assess, ...proc, ...ac,
            risksExplained: consent.risksExplained, consentConfirmed: consent.consentConfirmed,
            ...(issue.formData || {}),
          }
        : (issue.formData || {});
      const concern = fd.primaryConcern || fd.procedureName || fd.name || "";
      const title = concern ? `Issue ${idx + 1}: ${concern}` : `Issue ${idx + 1}`;
      renderIssue(fd, title);
    });
  } else {
    const fd: Record<string, any> = {
      primaryConcern: info.primaryConcern,
      skinType: info.skinType,
      ...assess, ...proc, ...ac,
      risksExplained: consent.risksExplained,
      consentConfirmed: consent.consentConfirmed,
      ...(cf._issues?.[0]?.formData || cf),
    };
    renderIssue(fd);
  }

  // AI Explanation
  if (has("aiExplanation")) {
    const text = summary.doctorEdited || summary.aiGenerated;
    if (text) {
      sectionHeader(doc, summary.doctorEdited ? "Patient Explanation (Doctor Reviewed)" : "Patient Explanation");
      textBlock(doc, text);
    }
  }

  // AI Translation
  if (has("aiTranslation") && language && summary.translations) {
    const translated =
      language === "hindi"   ? summary.translations.hindi   :
      language === "kannada" ? summary.translations.kannada :
      undefined;
    if (translated) {
      const title = language === "hindi" ? "Patient Explanation (Hindi)" : "Patient Explanation (Kannada)";
      sectionHeader(doc, title);
      textBlock(doc, translated, true);
    }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) return authResult;

    const { user: authUser } = authResult;
    if (authUser.tier !== "tier2") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { consultationId, includedFields = [], language = null, fieldLabels = {} } = body;

    if (!consultationId) {
      return NextResponse.json({ success: false, message: "consultationId is required" }, { status: 400 });
    }

    await connectDB();

    const consultation = await ConsultationCosmetology.findById(consultationId).lean();
    if (!consultation) {
      return NextResponse.json({ success: false, message: "Consultation not found" }, { status: 404 });
    }

    await ConsultationCosmetology.populate(consultation, [
      { path: "patientId" },
      { path: "clinicId" },
    ]);

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MT, bottom: MB, left: ML, right: MR },
      bufferPages: true,
      info: {
        Title: "Cosmetology Consultation Report",
        Author: "DermaCloud",
        Creator: "DermaCloud",
      },
    });

    const fieldSet = new Set<string>(Array.isArray(includedFields) ? includedFields : []);

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end",  () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      try {
        buildPdf(doc, consultation, fieldSet, language, fieldLabels && typeof fieldLabels === "object" ? fieldLabels : {});

        // Digital letterhead for clinics without pre-printed stationery.
        // Gated strictly by clinic ID — no other clinic is affected.
        const clinicId = String((consultation as any).clinicId?._id ?? (consultation as any).clinicId ?? "");
        applyClinicBranding(doc, clinicId);
      } catch (e) {
        reject(e);
      }
      doc.end();
    });

    await ConsultationCosmetology.findByIdAndUpdate(consultationId, {
      "generatedFiles.generatedAt": new Date(),
    });

    const patientId = (consultation as any).patientId?.patientId || "Unknown";
    const dateStr   = new Date().toISOString().split("T")[0];
    const filename  = `Cosmetology_${patientId}_${dateStr}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("Cosmetology PDF generation error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate PDF", error: error.message },
      { status: 500 }
    );
  }
}
