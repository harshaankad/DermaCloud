/**
 * Server-side PDF generation for dermatology consultation reports.
 *
 * Designed to print on top of a pre-printed letterhead — the top 130pt of every
 * page is left blank for the clinic's printed header. The PDF body is plain
 * black text with thin grey borders only (no fills, no colors) to save ink.
 *
 * Field-level toggles: caller passes `includedFields` (array of keys) and only
 * those rows/sections render. Patient name + age/gender always render at top.
 */

import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import { applyClinicBranding } from "@/lib/pdf/clinicBranding";
import ConsultationDermatology from "@/models/ConsultationDermatology";
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

// Section header: bold uppercase label + thin underline. No fill, no color.
function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 30);
  doc.y += 12;
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(10)
     .text(title.toUpperCase(), ML, doc.y, { width: CW, lineBreak: false });
  doc.y += 13;
  hLine(doc, ML, ML + CW, doc.y, BLACK, 0.8);
  doc.y += 8;
}

// Single-line patient header: bold name left, "Age / Gender: X yrs · Y" right.
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

// Two-column label/value table — thin borders only, no fills.
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

// Markdown-lite text block. Plain black, no fills.
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

// Single-line box for short prose (e.g., dermoscopic finding interpretation).
function simpleBox(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 30);
  const pad = 8;
  doc.font("Helvetica").fontSize(9.5);
  const h = Math.max(24, doc.heightOfString(text, { width: CW - pad * 2 }) + pad * 2);
  const y = doc.y;
  doc.save().rect(ML, y, CW, h).strokeColor(BORDER).lineWidth(0.5).stroke().restore();
  doc.fillColor(BLACK).font("Helvetica").fontSize(9.5)
     .text(text, ML + pad, y + pad, { width: CW - pad * 2 });
  doc.y = y + h + 6;
}

// Prescription Rx table — thin borders only, no fills.
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
  // vertical column dividers in header
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
  "complaint", "chiefComplaint", "duration", "previousTreatment",
  "lesionSite", "morphology", "distribution", "severity",
  "finalInterpretation", "patterns", "dermoscopicFindings",
  "provisional", "provisionalDiagnosis", "differentials", "differentialDiagnosis",
  "prescription",
  "topicals", "topicalMedications", "orals", "oralMedications",
  "lifestyleChanges", "lifestyleAdvice", "investigations",
  "followUpDate", "date", "followUpReason", "reason",
  "aiExplanation", "aiTranslation",
  "_multiIssue", "_issues",
]);

// Build custom-field rows (only those in includedFields) from a form-data object.
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

// ── Field key labels (must match frontend labels) ────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  contact: "Contact",
  complaint: "Chief Complaint",
  duration: "Duration",
  previousTreatment: "Previous Treatment",
  lesionSite: "Lesion Site",
  morphology: "Morphology",
  distribution: "Distribution",
  severity: "Severity",
  finalInterpretation: "Dermoscopic Findings",
  provisional: "Provisional Diagnosis",
  differentials: "Differential Diagnoses",
  topicals: "Topical Medications",
  orals: "Oral Medications",
  lifestyleChanges: "Lifestyle Advice",
  investigations: "Investigations",
  followUpDate: "Next Appointment",
  followUpReason: "Follow-up Reason",
};

// ── Main PDF builder ──────────────────────────────────────────────────────────
function buildPdf(
  doc: PDFKit.PDFDocument,
  consultation: any,
  includedFields: Set<string>,
  language: string | null,
  fieldLabels: Record<string, string>,
) {
  // Register Indic fonts for AI translation rendering
  const indicFontPath     = language === "hindi" ? DEVANAGARI_FONT      : KANNADA_FONT;
  const indicBoldFontPath = language === "hindi" ? DEVANAGARI_BOLD_FONT : KANNADA_BOLD_FONT;
  if (language && fs.existsSync(indicFontPath)) {
    doc.registerFont("Indic", indicFontPath);
    doc.registerFont("IndicBold", fs.existsSync(indicBoldFontPath) ? indicBoldFontPath : indicFontPath);
  }

  const patient = consultation.patientId  || {};
  const info    = consultation.patientInfo || {};
  const exam    = consultation.clinicalExamination || {};
  const dermo   = consultation.dermoscopeFindings  || {};
  const diag    = consultation.diagnosis  || {};
  const tx      = consultation.treatmentPlan || {};
  const fu      = consultation.followUp   || {};
  const summary = consultation.patientSummary || {};

  const has = (key: string) => includedFields.has(key);

  doc.y = MT;  // ensure first page starts below letterhead reserve

  // ── Patient header (always rendered) ──────────────────────────────────────
  patientInfoLine(doc, info.name || "N/A", info.age, info.gender);

  // Date + Patient ID line directly under patient name
  const dateStr = new Date(consultation.consultationDate).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const pidStr = patient.patientId || "N/A";
  const metaY = doc.y;
  doc.fillColor(BLACK).font("Helvetica").fontSize(9).text(`Date: ${dateStr}`, ML, metaY, { lineBreak: false });
  doc.fillColor(BLACK).font("Helvetica").fontSize(9)
     .text(`Patient ID: ${pidStr}`, ML, metaY, { width: CW, align: "right", lineBreak: false });
  doc.y = metaY + 14;

  // ── Optional contact row ──────────────────────────────────────────────────
  if (has("contact") && patient.phone) {
    infoTable(doc, [{ label: "Contact", value: patient.phone }]);
  }

  // Per-issue rendering for multi-issue, single-block for single
  const isMultiIssue =
    consultation.customFields?._multiIssue === true &&
    Array.isArray(consultation.customFields?._issues) &&
    consultation.customFields._issues.length > 1;

  // Helper: build infoTable rows for a given fd object, only for included field keys
  const collectRows = (fd: Record<string, any>, keys: { key: string; label: string; alts?: string[] }[]) => {
    const out: { label: string; value: string }[] = [];
    for (const item of keys) {
      if (!has(item.key)) continue;
      const val = fd[item.key] || (item.alts ? item.alts.map((a) => fd[a]).find(Boolean) : undefined);
      if (val) out.push({ label: item.label, value: String(val) });
    }
    return out;
  };

  if (isMultiIssue) {
    const issues: any[] = consultation.customFields._issues;
    issues.forEach((issue: any, idx: number) => {
      const fd = issue.formData || {};
      const diagnosis  = fd.provisional || fd.provisionalDiagnosis || "";
      const issueLabel = issue.label || `Issue ${idx + 1}`;
      const title      = diagnosis ? `${issueLabel}: ${diagnosis}` : issueLabel;

      // History
      const historyRows = collectRows(fd, [
        { key: "complaint", label: FIELD_LABELS.complaint, alts: ["chiefComplaint"] },
        { key: "duration", label: FIELD_LABELS.duration },
        { key: "previousTreatment", label: FIELD_LABELS.previousTreatment },
      ]);
      // Exam
      const examRows = collectRows(fd, [
        { key: "lesionSite", label: FIELD_LABELS.lesionSite },
        { key: "morphology", label: FIELD_LABELS.morphology },
        { key: "distribution", label: FIELD_LABELS.distribution },
        { key: "severity", label: FIELD_LABELS.severity },
      ]);
      // Diagnosis
      const diagRows = collectRows(fd, [
        { key: "provisional", label: FIELD_LABELS.provisional, alts: ["provisionalDiagnosis"] },
        { key: "differentials", label: FIELD_LABELS.differentials, alts: ["differentialDiagnosis"] },
      ]);
      // Treatment
      const txRows = collectRows(fd, [
        { key: "topicals", label: FIELD_LABELS.topicals, alts: ["topicalMedications"] },
        { key: "orals", label: FIELD_LABELS.orals, alts: ["oralMedications"] },
        { key: "lifestyleChanges", label: FIELD_LABELS.lifestyleChanges, alts: ["lifestyleAdvice"] },
        { key: "investigations", label: FIELD_LABELS.investigations },
      ]);

      const dermoText = has("finalInterpretation")
        ? (fd.finalInterpretation || fd.dermoscopicFindings || fd.patterns)
        : null;
      const rxMeds = has("prescription") && Array.isArray(fd.prescription)
        ? fd.prescription.filter((m: any) => m.name?.trim())
        : [];
      const fuRows = collectRows(fd, [
        { key: "followUpDate", label: FIELD_LABELS.followUpDate, alts: ["date"] },
        { key: "followUpReason", label: FIELD_LABELS.followUpReason, alts: ["reason"] },
      ]);

      const customRows = buildCustomRows(fd, includedFields, fieldLabels);

      const hasAnything =
        historyRows.length || examRows.length || dermoText ||
        diagRows.length || rxMeds.length || txRows.length || fuRows.length || customRows.length;
      if (!hasAnything) return;

      sectionHeader(doc, title);
      if (historyRows.length) infoTable(doc, historyRows);
      if (examRows.length)    infoTable(doc, examRows);
      if (dermoText)          simpleBox(doc, dermoText);
      if (diagRows.length)    infoTable(doc, diagRows);
      if (rxMeds.length > 0)  prescriptionTable(doc, rxMeds);
      if (txRows.length)      infoTable(doc, txRows);
      if (fuRows.length)      infoTable(doc, fuRows);
      if (customRows.length)  infoTable(doc, customRows);
    });
  } else {
    const cf = consultation.customFields || {};
    const fd = cf._issues?.[0]?.formData || cf;

    // Clinical History
    const historyRows = collectRows(fd, [
      { key: "complaint", label: FIELD_LABELS.complaint, alts: ["chiefComplaint"] },
      { key: "duration", label: FIELD_LABELS.duration },
      { key: "previousTreatment", label: FIELD_LABELS.previousTreatment },
    ]);
    if (!historyRows.length && (has("complaint") || has("duration") || has("previousTreatment"))) {
      // pull from structured patientInfo as fallback
      const sRows: { label: string; value: string }[] = [];
      if (has("complaint") && info.complaint) sRows.push({ label: FIELD_LABELS.complaint, value: info.complaint });
      if (has("duration") && info.duration) sRows.push({ label: FIELD_LABELS.duration, value: info.duration });
      if (has("previousTreatment") && info.previousTreatment) sRows.push({ label: FIELD_LABELS.previousTreatment, value: info.previousTreatment });
      if (sRows.length) {
        sectionHeader(doc, "Clinical History");
        infoTable(doc, sRows);
      }
    } else if (historyRows.length) {
      sectionHeader(doc, "Clinical History");
      infoTable(doc, historyRows);
    }

    // Clinical Examination
    const examRows: { label: string; value: string }[] = [];
    if (has("lesionSite") && (exam.lesionSite || fd.lesionSite)) examRows.push({ label: FIELD_LABELS.lesionSite, value: String(exam.lesionSite || fd.lesionSite) });
    if (has("morphology") && (exam.morphology || fd.morphology)) examRows.push({ label: FIELD_LABELS.morphology, value: String(exam.morphology || fd.morphology) });
    if (has("distribution") && (exam.distribution || fd.distribution)) examRows.push({ label: FIELD_LABELS.distribution, value: String(exam.distribution || fd.distribution) });
    if (has("severity") && (exam.severity || fd.severity)) examRows.push({ label: FIELD_LABELS.severity, value: String(exam.severity || fd.severity) });
    if (examRows.length) {
      sectionHeader(doc, "Clinical Examination");
      infoTable(doc, examRows);
    }

    // Dermoscopic Findings
    if (has("finalInterpretation")) {
      const dermoText = dermo.finalInterpretation || fd.finalInterpretation || fd.patterns;
      if (dermoText) {
        sectionHeader(doc, "Dermoscopic Findings");
        simpleBox(doc, String(dermoText));
      }
    }

    // Diagnosis
    const diagRows: { label: string; value: string }[] = [];
    if (has("provisional")) {
      const v = diag.provisional || fd.provisional;
      if (v) diagRows.push({ label: FIELD_LABELS.provisional, value: String(v) });
    }
    if (has("differentials")) {
      const v = diag.differentials?.length ? diag.differentials.join(", ") : (fd.differentials || "");
      if (v) diagRows.push({ label: FIELD_LABELS.differentials, value: String(v) });
    }
    if (diagRows.length) {
      sectionHeader(doc, "Diagnosis");
      infoTable(doc, diagRows);
    }

    // Prescription
    if (has("prescription")) {
      const rxData = fd.prescription || cf.prescription;
      const rxMeds = Array.isArray(rxData) ? rxData.filter((m: any) => m.name?.trim()) : [];
      if (rxMeds.length > 0) {
        sectionHeader(doc, "Prescription (Rx)");
        prescriptionTable(doc, rxMeds);
      }
    }

    // Treatment Plan
    const txRows: { label: string; value: string }[] = [];
    if (has("topicals")) {
      const v = tx.topicals || fd.topicals;
      if (v) txRows.push({ label: FIELD_LABELS.topicals, value: String(v) });
    }
    if (has("orals")) {
      const v = tx.orals || fd.orals;
      if (v) txRows.push({ label: FIELD_LABELS.orals, value: String(v) });
    }
    if (has("lifestyleChanges")) {
      const v = tx.lifestyleChanges || fd.lifestyleChanges;
      if (v) txRows.push({ label: FIELD_LABELS.lifestyleChanges, value: String(v) });
    }
    if (has("investigations")) {
      const v = tx.investigations || fd.investigations;
      if (v) txRows.push({ label: FIELD_LABELS.investigations, value: String(v) });
    }
    if (txRows.length) {
      sectionHeader(doc, "Treatment Plan");
      infoTable(doc, txRows);
    }

    // Follow-Up
    const fuRows: { label: string; value: string }[] = [];
    if (has("followUpDate") && fu.date) {
      fuRows.push({
        label: FIELD_LABELS.followUpDate,
        value: new Date(fu.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
      });
    }
    if (has("followUpReason") && fu.reason) {
      fuRows.push({ label: FIELD_LABELS.followUpReason, value: fu.reason });
    }
    if (fuRows.length) {
      sectionHeader(doc, "Follow-Up");
      infoTable(doc, fuRows);
    }

    // Additional / custom fields from FormSettings
    const customRows = buildCustomRows(fd, includedFields, fieldLabels);
    if (customRows.length) {
      sectionHeader(doc, "Additional Details");
      infoTable(doc, customRows);
    }
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

    const consultation = await ConsultationDermatology.findById(consultationId).lean();
    if (!consultation) {
      return NextResponse.json({ success: false, message: "Consultation not found" }, { status: 404 });
    }

    await ConsultationDermatology.populate(consultation, [
      { path: "patientId" },
      { path: "clinicId" },
    ]);

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MT, bottom: MB, left: ML, right: MR },
      bufferPages: true,
      info: {
        Title: "Dermatology Consultation Report",
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

    await ConsultationDermatology.findByIdAndUpdate(consultationId, {
      "generatedFiles.generatedAt": new Date(),
    });

    const patientId = (consultation as any).patientId?.patientId || "Unknown";
    const dateStr   = new Date().toISOString().split("T")[0];
    const filename  = `Consultation_${patientId}_${dateStr}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate PDF", error: error.message },
      { status: 500 }
    );
  }
}
