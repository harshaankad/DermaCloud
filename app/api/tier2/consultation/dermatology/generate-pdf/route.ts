/**
 * Server-side PDF generation for dermatology consultation reports.
 * Uses pdfkit (already in dependencies) — returns a proper PDF binary.
 */

import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import "@/models/Clinic";
import "@/models/User";
import "@/models/Patient";
import path from "path";
import fs from "fs";

// ── Page geometry ─────────────────────────────────────────────────────────────
const PW = 595.28;
const PH = 841.89;
const MT = 40;     // top margin
const ML = 50;
const MR = 50;
const MB = 90;     // bottom margin — generous buffer above footer (footer line at PH-45)
const CW = PW - ML - MR;   // 495.28 pt

// ── Font paths for Indic scripts ──────────────────────────────────────────────
const FONTS_DIR = path.join(process.cwd(), "public", "fonts");
const KANNADA_FONT        = path.join(FONTS_DIR, "NotoSansKannada-Regular.ttf");
const KANNADA_BOLD_FONT   = path.join(FONTS_DIR, "NotoSansKannada-Bold.ttf");
const DEVANAGARI_FONT     = path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf");
const DEVANAGARI_BOLD_FONT = path.join(FONTS_DIR, "NotoSansDevanagari-Bold.ttf");

// ── Vibrant professional color palette ───────────────────────────────────────
const C = {
  navy:      "#0F2D52",   // primary — headings, header bg (deeper, richer)
  navyDark:  "#0A1F3A",   // header top/bottom stripe (darker accent)
  navyLight: "#EEF2F9",   // label column bg, section header bg
  blue:      "#2B6CB0",   // accent (links, highlights)
  body:      "#1A202C",   // main body text
  muted:     "#718096",   // secondary text, footer
  border:    "#CBD5E0",   // table / box borders
  rowAlt:    "#F7F8FA",   // alternate row tint
  white:     "#FFFFFF",
  gold:      "#D4A84B",   // accent for header decoration
};

// ── Low-level drawing helpers ─────────────────────────────────────────────────

function fillRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function hLine(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number, color: string, lw = 0.5) {
  doc.save().moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(lw).stroke().restore();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > PH - MB) {
    doc.addPage();
    doc.y = MT;  // start content with top margin on new pages
  }
}

// ── Section header ─────────────────────────────────────────────────────────────
// Simple: light-navy background bar, dark navy bold text
// Consistent spacing: 16pt before, 10pt after
function sectionHeader(doc: PDFKit.PDFDocument, title: string, useIndicFont = false) {
  ensureSpace(doc, 40);
  doc.y += 16;  // consistent gap before section
  const y  = doc.y;
  const h  = 24;
  const sw = 4;   // left accent strip width

  fillRect(doc, ML,      y, sw, h, C.navy);
  fillRect(doc, ML + sw, y, CW - sw, h, C.navyLight);

  const fontName = useIndicFont ? "Indic" : "Helvetica-Bold";
  doc.fillColor(C.navy).font(fontName).fontSize(10)
     .text(title.toUpperCase(), ML + sw + 10, y + 7, { width: CW - sw - 20, lineBreak: false });

  doc.y = y + h + 10;  // consistent gap after header
}

// ── Two-column info table ──────────────────────────────────────────────────────
function infoTable(doc: PDFKit.PDFDocument, rows: { label: string; value: string }[]) {
  const labelW = Math.round(CW * 0.33);
  const valueW = CW - labelW;
  const pad    = 8;
  const minH   = 24;

  rows.forEach((row, idx) => {
    doc.font("Helvetica").fontSize(9.5);
    const textH = doc.heightOfString(row.value || " ", { width: valueW - pad * 2 });
    const rowH  = Math.max(minH, Math.ceil(textH) + pad * 2);

    ensureSpace(doc, rowH + 4);
    const y = doc.y;

    // Label bg (always light navy), value bg alternates for readability
    fillRect(doc, ML,           y, labelW, rowH, C.navyLight);
    fillRect(doc, ML + labelW,  y, valueW, rowH, idx % 2 === 0 ? C.white : C.rowAlt);

    // Borders
    doc.save()
       .rect(ML, y, CW, rowH)
       .strokeColor(C.border).lineWidth(0.5).stroke().restore();
    doc.save()
       .moveTo(ML + labelW, y).lineTo(ML + labelW, y + rowH)
       .strokeColor(C.border).lineWidth(0.5).stroke().restore();

    // Label text
    doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(9)
       .text(row.label, ML + pad, y + pad, { width: labelW - pad * 2, lineBreak: false });

    // Value text
    doc.fillColor(C.body).font("Helvetica").fontSize(9.5)
       .text(row.value || "—", ML + labelW + pad, y + pad, { width: valueW - pad * 2 });

    doc.y = y + rowH;
  });
}

// ── Prose / markdown-lite text block ──────────────────────────────────────────
// Renders inside a simple bordered box.
// useIndicFont: set true for Hindi/Kannada content
function textBlock(doc: PDFKit.PDFDocument, text: string, titleColor = C.navy, useIndicFont = false) {
  const pad = 12;
  const w   = CW - pad * 2;
  const lines = text.split("\n");
  const bodyFont = useIndicFont ? "Indic" : "Helvetica";

  const boldFont = useIndicFont ? "IndicBold" : "Helvetica-Bold";
  // Indic glyphs (Kannada/Devanagari) are taller than Latin — use larger line estimates
  const lineEst  = useIndicFont ? 40 : 16;
  const lineGap  = useIndicFont ? 6  : 2;

  // Safety check after rendering — if doc.y has overshot the safe area, start a new page
  const safePageBreak = () => {
    if (doc.y > PH - MB) {
      doc.addPage();
      doc.y = MT;
    }
  };

  // Helper to render text with **bold** support
  const renderLineWithBold = (line: string, x: number, fontSize: number, color: string, maxWidth: number) => {
    // Check if line contains bold markers
    if (!line.includes("**")) {
      doc.fillColor(color).font(bodyFont).fontSize(fontSize)
         .text(line, x, doc.y, { width: maxWidth, lineGap });
      return;
    }

    // Parse and render segments with bold
    const segments = line.split(/(\*\*[^*]+\*\*)/g);
    let currentX = x;
    const startY = doc.y;

    // First pass: calculate if we need line wrapping
    let totalWidth = 0;
    for (const seg of segments) {
      if (!seg) continue;
      const isBold = seg.startsWith("**") && seg.endsWith("**");
      const segText = isBold ? seg.slice(2, -2) : seg;
      doc.font(isBold ? boldFont : bodyFont).fontSize(fontSize);
      totalWidth += doc.widthOfString(segText);
    }

    // If fits on one line, render inline
    if (totalWidth <= maxWidth) {
      for (const seg of segments) {
        if (!seg) continue;
        const isBold = seg.startsWith("**") && seg.endsWith("**");
        const segText = isBold ? seg.slice(2, -2) : seg;
        doc.fillColor(color).font(isBold ? boldFont : bodyFont).fontSize(fontSize)
           .text(segText, currentX, startY, { continued: segments.indexOf(seg) < segments.length - 1, lineGap });
        currentX += doc.widthOfString(segText);
      }
      doc.text("", x, doc.y); // end the line
    } else {
      // Multi-line: strip bold markers and render
      const plainText = line.replace(/\*\*([^*]+)\*\*/g, "$1");
      doc.fillColor(color).font(bodyFont).fontSize(fontSize)
         .text(plainText, x, doc.y, { width: maxWidth, lineGap });
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line) { doc.y += 8; continue; }  // consistent blank line spacing

    // Indic scripts: render everything as plain body text (no heading/bold styling)
    if (useIndicFont) {
      const plainText = line.replace(/^##+ /, "").replace(/\*\*/g, "");
      ensureSpace(doc, lineEst);
      doc.fillColor(C.body).font(bodyFont).fontSize(9.5)
         .text(plainText, ML + pad, doc.y, { width: w, lineGap });
      doc.y += 2;
      safePageBreak();
      continue;
    }

    if (line.startsWith("## ")) {
      ensureSpace(doc, 36);
      doc.y += 10;
      const headingText = line.slice(3);
      doc.fillColor(titleColor).font("Helvetica-Bold").fontSize(13)
         .text(headingText, ML + pad, doc.y, { width: w, lineGap });
      hLine(doc, ML + pad, ML + pad + w, doc.y, titleColor, 1.5);
      doc.y += 10;
      safePageBreak();
      continue;
    }

    if (line.startsWith("### ")) {
      ensureSpace(doc, 28);
      doc.y += 6;
      const headingText = line.slice(4);
      doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(11)
         .text(headingText, ML + pad, doc.y, { width: w, lineGap });
      hLine(doc, ML + pad, ML + pad + w, doc.y, C.border, 0.75);
      doc.y += 7;
      safePageBreak();
      continue;
    }

    if (line.startsWith("• ") || line.startsWith("- ")) {
      ensureSpace(doc, lineEst);
      renderLineWithBold(line, ML + pad + 8, 9.5, C.body, w - 8);
      doc.y += 4;
      safePageBreak();
      continue;
    }

    // Regular paragraph with bold support
    ensureSpace(doc, lineEst);
    renderLineWithBold(line, ML + pad, 9.5, C.body, w);
    doc.y += 2;
    safePageBreak();
  }
}

// ── Simple one-line text box ───────────────────────────────────────────────────
function simpleBox(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 36);
  const pad = 10;
  doc.font("Helvetica").fontSize(9.5);
  const h = Math.max(28, doc.heightOfString(text, { width: CW - pad * 2 }) + pad * 2);
  const y = doc.y;
  fillRect(doc, ML, y, CW, h, C.rowAlt);
  doc.save().rect(ML, y, CW, h).strokeColor(C.border).lineWidth(0.5).stroke().restore();
  doc.fillColor(C.body).font("Helvetica").fontSize(9.5)
     .text(text, ML + pad, y + pad, { width: CW - pad * 2 });
  doc.y = y + h + 12;  // consistent spacing after box
}

// ── Prescription table (horizontal format like a real Rx pad) ──────────────────
function prescriptionTable(doc: PDFKit.PDFDocument, meds: any[]) {
  const cols = [
    { label: "#",            w: 25  },
    { label: "Medicine",     w: 110 },
    { label: "Dosage",       w: 55  },
    { label: "Route",        w: 50  },
    { label: "Frequency",    w: 65  },
    { label: "Duration",     w: 55  },
    { label: "Qty",          w: 40  },
    { label: "Instructions", w: CW - 25 - 110 - 55 - 50 - 65 - 55 - 40 },
  ];
  const rowH = 22;
  const headerH = 20;
  const pad = 6;

  // Section sub-header: ℞ Prescription
  ensureSpace(doc, headerH + rowH * (meds.length + 1) + 10);
  const startY = doc.y;

  // Header row
  let x = ML;
  fillRect(doc, ML, startY, CW, headerH, C.navyLight);
  for (const col of cols) {
    doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(7.5)
       .text(col.label.toUpperCase(), x + pad, startY + 6, { width: col.w - pad * 2, lineBreak: false });
    x += col.w;
  }
  doc.save().rect(ML, startY, CW, headerH).strokeColor(C.border).lineWidth(0.5).stroke().restore();
  doc.y = startY + headerH;

  // Data rows
  meds.forEach((med: any, idx: number) => {
    ensureSpace(doc, rowH + 2);
    const y = doc.y;
    const bg = idx % 2 === 0 ? C.white : C.rowAlt;
    fillRect(doc, ML, y, CW, rowH, bg);

    x = ML;
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
    vals.forEach((val, ci) => {
      const isFirst = ci === 0;
      const isName = ci === 1;
      doc.fillColor(isFirst ? C.blue : C.body)
         .font(isName ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
         .text(val, x + pad, y + 6, { width: cols[ci].w - pad * 2, lineBreak: false });
      x += cols[ci].w;
    });

    // Row border
    doc.save().rect(ML, y, CW, rowH).strokeColor(C.border).lineWidth(0.3).stroke().restore();
    doc.y = y + rowH;
  });

  doc.y += 8;
}

// ── Main PDF builder ───────────────────────────────────────────────────────────
function buildPdf(
  doc: PDFKit.PDFDocument,
  consultation: any,
  includeExplanation: boolean,
  language: string | null,
) {
  // Register Indic fonts (Regular + Bold) for Hindi/Kannada support
  const indicFontPath     = language === "hindi" ? DEVANAGARI_FONT      : KANNADA_FONT;
  const indicBoldFontPath = language === "hindi" ? DEVANAGARI_BOLD_FONT : KANNADA_BOLD_FONT;
  if (language && fs.existsSync(indicFontPath)) {
    doc.registerFont("Indic", indicFontPath);
    if (fs.existsSync(indicBoldFontPath)) {
      doc.registerFont("IndicBold", indicBoldFontPath);
    } else {
      doc.registerFont("IndicBold", indicFontPath); // fallback to regular
    }
  } else if (language && fs.existsSync(KANNADA_FONT)) {
    doc.registerFont("Indic", KANNADA_FONT);
    doc.registerFont("IndicBold", fs.existsSync(KANNADA_BOLD_FONT) ? KANNADA_BOLD_FONT : KANNADA_FONT);
  }

  const patient = consultation.patientId  || {};
  const clinic  = consultation.clinicId   || {};
  const info    = consultation.patientInfo || {};
  const exam    = consultation.clinicalExamination || {};
  const dermo   = consultation.dermoscopeFindings  || {};
  const diag    = consultation.diagnosis  || {};
  const tx      = consultation.treatmentPlan || {};
  const fu      = consultation.followUp   || {};
  const summary = consultation.patientSummary || {};

  const clinicName    = clinic.clinicName || "Dermatology Clinic";
  const clinicAddress = [clinic.address, clinic.city, clinic.state].filter(Boolean).join(", ");
  const clinicPhone   = clinic.phone || "";
  const clinicEmail   = clinic.email || "";
  const explanationText = summary.doctorEdited || summary.aiGenerated || "";

  // ── 1. HEADER ────────────────────────────────────────────────────────────────
  // Header starts from the very top of the page (no margin on first page)

  // Main header block
  const headerH = 75;
  fillRect(doc, 0, 0, PW, headerH, C.navy);

  // Top accent stripe (darker navy)
  fillRect(doc, 0, 0, PW, 4, C.navyDark);

  // Bottom accent stripe
  fillRect(doc, 0, headerH - 4, PW, 4, C.navyDark);

  // Clinic name - larger, bolder, with slight letter spacing
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(20)
     .text(clinicName.toUpperCase(), 0, 22, {
       width: PW,
       align: "center",
       characterSpacing: 1.5
     });

  // Subtle divider line
  const dividerY = 48;
  hLine(doc, PW * 0.3, PW * 0.7, dividerY, "#4A6A8A", 1);

  // Contact line - brighter, more readable
  const contactParts: string[] = [];
  if (clinicAddress) contactParts.push(clinicAddress);
  if (clinicPhone)   contactParts.push(`Tel: ${clinicPhone}`);
  if (clinicEmail)   contactParts.push(clinicEmail);
  if (contactParts.length) {
    doc.fillColor("#E8F0F8").font("Helvetica").fontSize(9)
       .text(contactParts.join("   •   "), 0, 54, { width: PW, align: "center" });
  }

  doc.y = headerH + 16;  // below header + gap

  // ── 2. REPORT TITLE ───────────────────────────────────────────────────────────
  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(12)
     .text("DERMATOLOGY CONSULTATION REPORT", ML, doc.y, { width: CW, align: "center" });
  doc.y += 6;
  hLine(doc, ML, ML + CW, doc.y, C.navy, 1.5);
  doc.y += 16;

  // ── 3. DATE + PATIENT ID ──────────────────────────────────────────────────────
  const dateStr = new Date(consultation.consultationDate).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const pidStr = patient.patientId || "N/A";

  const metaY = doc.y;
  doc.fillColor(C.muted).font("Helvetica").fontSize(9)
     .text(`Date: ${dateStr}`, ML, metaY);
  doc.fillColor(C.muted).font("Helvetica").fontSize(9)
     .text(`Patient ID: ${pidStr}`, ML, metaY, { width: CW, align: "right" });
  doc.y = metaY + 18;
  hLine(doc, ML, ML + CW, doc.y, C.border, 0.5);
  doc.y += 8;  // reduced to let sectionHeader add its own gap

  // ── 4. PATIENT INFORMATION ────────────────────────────────────────────────────
  sectionHeader(doc, "Patient Information");
  infoTable(doc, [
    { label: "Name",               value: info.name || "N/A" },
    { label: "Age / Gender",       value: `${info.age || "N/A"} yrs  ·  ${(info.gender || "N/A").charAt(0).toUpperCase() + (info.gender || "").slice(1)}` },
    { label: "Contact",            value: patient.phone || "N/A" },
    ...(info.complaint         ? [{ label: "Chief Complaint",    value: info.complaint }] : []),
    ...(info.duration          ? [{ label: "Duration",           value: info.duration }] : []),
    ...(info.previousTreatment ? [{ label: "Previous Treatment", value: info.previousTreatment }] : []),
  ]);

  // ── 5–8. CLINICAL DATA (single-issue OR per-issue for multi-issue) ─────────────
  const isMultiIssue =
    consultation.customFields?._multiIssue === true &&
    Array.isArray(consultation.customFields?._issues) &&
    consultation.customFields._issues.length > 1;

  if (isMultiIssue) {
    // Render one labelled block per issue, each containing all its clinical data
    const issues: any[] = consultation.customFields._issues;
    issues.forEach((issue: any, idx: number) => {
      const fd = issue.formData || {};
      const diagnosis  = fd.provisional || fd.provisionalDiagnosis || "";
      const issueLabel = issue.label || `Issue ${idx + 1}`;
      const title      = diagnosis ? `${issueLabel}: ${diagnosis}` : issueLabel;

      sectionHeader(doc, title);

      // Known fields rendered first in a logical order
      const knownOrder: { key: string; label: string; alts?: string[] }[] = [
        { key: "complaint", label: "Chief Complaint", alts: ["chiefComplaint"] },
        { key: "duration", label: "Duration" },
        { key: "previousTreatment", label: "Previous Treatment" },
        { key: "lesionSite", label: "Lesion Site" },
        { key: "morphology", label: "Morphology" },
        { key: "distribution", label: "Distribution" },
        { key: "severity", label: "Severity" },
        { key: "finalInterpretation", label: "Dermoscopic Findings", alts: ["dermoscopicFindings", "patterns"] },
        { key: "provisional", label: "Diagnosis", alts: ["provisionalDiagnosis"] },
        { key: "differentials", label: "Differentials", alts: ["differentialDiagnosis"] },
        { key: "topicals", label: "Topical Medications", alts: ["topicalMedications"] },
        { key: "orals", label: "Oral Medications", alts: ["oralMedications"] },
        { key: "lifestyleChanges", label: "Lifestyle Advice", alts: ["lifestyleAdvice"] },
        { key: "investigations", label: "Investigations" },
        { key: "date", label: "Follow-up Date" },
        { key: "reason", label: "Follow-up Reason" },
      ];
      const renderedKeys = new Set(["prescription", "_multiIssue", "_issues"]);
      const rows: { label: string; value: string }[] = [];

      for (const item of knownOrder) {
        const val = fd[item.key] || (item.alts ? item.alts.map((a) => fd[a]).find(Boolean) : undefined);
        if (val) {
          rows.push({ label: item.label, value: String(val) });
        }
        renderedKeys.add(item.key);
        if (item.alts) item.alts.forEach((a) => renderedKeys.add(a));
      }

      // Custom/extra fields not in the known list
      for (const [key, val] of Object.entries(fd)) {
        if (renderedKeys.has(key) || !val) continue;
        if (typeof val === "string" && !val.trim()) continue;
        if (Array.isArray(val) || typeof val === "object") continue;
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
        rows.push({ label, value: String(val) });
      }

      if (rows.length > 0) infoTable(doc, rows);

      // Prescription table (structured Rx data)
      const rxMeds = Array.isArray(fd.prescription) ? fd.prescription.filter((m: any) => m.name?.trim()) : [];
      if (rxMeds.length > 0) {
        sectionHeader(doc, "Prescription (Rx)");
        prescriptionTable(doc, rxMeds);
      }
    });
  } else {
    // ── Single-issue ──────────────────────────────────────────────────────────
    // Get all form data from customFields
    const cf = consultation.customFields || {};
    const fd = cf._issues?.[0]?.formData || cf;
    const singleRenderedKeys = new Set(["_multiIssue", "_issues", "prescription"]);

    // Clinical Examination — from structured fields + customFields
    const examRows: { label: string; value: string }[] = [];
    const examFields: { key: string; label: string; source?: any }[] = [
      { key: "lesionSite", label: "Lesion Site", source: exam.lesionSite || fd.lesionSite },
      { key: "morphology", label: "Morphology", source: exam.morphology || fd.morphology },
      { key: "distribution", label: "Distribution", source: exam.distribution || fd.distribution },
      { key: "severity", label: "Severity", source: exam.severity || fd.severity },
    ];
    for (const f of examFields) {
      if (f.source) examRows.push({ label: f.label, value: String(f.source) });
      singleRenderedKeys.add(f.key);
    }
    if (examRows.length > 0) {
      sectionHeader(doc, "Clinical Examination");
      infoTable(doc, examRows);
    }

    // Dermoscopic Findings
    const dermoText = dermo.finalInterpretation || fd.finalInterpretation || fd.patterns;
    if (dermoText) {
      sectionHeader(doc, "Dermoscopic Findings");
      simpleBox(doc, dermoText);
    }
    singleRenderedKeys.add("finalInterpretation");
    singleRenderedKeys.add("patterns");

    // Diagnosis
    const diagProv = diag.provisional || fd.provisional;
    const diagDiff = diag.differentials?.length ? diag.differentials.join(", ") : (fd.differentials || "");
    if (diagProv || diagDiff) {
      sectionHeader(doc, "Diagnosis");
      infoTable(doc, [
        ...(diagProv ? [{ label: "Provisional", value: String(diagProv) }] : []),
        ...(diagDiff ? [{ label: "Differentials", value: String(diagDiff) }] : []),
      ]);
    }
    singleRenderedKeys.add("provisional");
    singleRenderedKeys.add("differentials");

    // Prescription table
    const singleRxData = fd.prescription || cf.prescription;
    const singleRxMeds = Array.isArray(singleRxData) ? singleRxData.filter((m: any) => m.name?.trim()) : [];
    if (singleRxMeds.length > 0) {
      sectionHeader(doc, "Prescription (Rx)");
      prescriptionTable(doc, singleRxMeds);
    }

    // Treatment Plan
    const txLifestyle = tx.lifestyleChanges || fd.lifestyleChanges;
    const txInvestigations = tx.investigations || fd.investigations;
    const txTopicals = tx.topicals || fd.topicals;
    const txOrals = tx.orals || fd.orals;
    if (txTopicals || txOrals || txLifestyle || txInvestigations) {
      sectionHeader(doc, "Treatment Plan");
      infoTable(doc, [
        ...(txTopicals       ? [{ label: "Topical Medications", value: String(txTopicals) }] : []),
        ...(txOrals          ? [{ label: "Oral Medications", value: String(txOrals) }] : []),
        ...(txLifestyle      ? [{ label: "Lifestyle Advice", value: String(txLifestyle) }] : []),
        ...(txInvestigations ? [{ label: "Investigations", value: String(txInvestigations) }] : []),
      ]);
    }
    singleRenderedKeys.add("complaint");
    singleRenderedKeys.add("duration");
    singleRenderedKeys.add("previousTreatment");
    singleRenderedKeys.add("lifestyleChanges");
    singleRenderedKeys.add("investigations");
    singleRenderedKeys.add("topicals");
    singleRenderedKeys.add("orals");
    singleRenderedKeys.add("date");
    singleRenderedKeys.add("reason");

    // Custom / additional fields not yet rendered
    const extraRows: { label: string; value: string }[] = [];
    for (const [key, val] of Object.entries(fd)) {
      if (singleRenderedKeys.has(key) || !val) continue;
      if (typeof val === "string" && !val.trim()) continue;
      if (Array.isArray(val) || typeof val === "object") continue;
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
      extraRows.push({ label, value: String(val) });
    }
    if (extraRows.length > 0) {
      sectionHeader(doc, "Additional Details");
      infoTable(doc, extraRows);
    }
  }

  // ── 9. FOLLOW-UP ──────────────────────────────────────────────────────────────
  if (fu.date) {
    sectionHeader(doc, "Follow-Up");
    infoTable(doc, [
      { label: "Next Appointment", value: new Date(fu.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) },
      ...(fu.reason ? [{ label: "Reason", value: fu.reason }] : []),
    ]);
  }

  // ── 10. PATIENT EXPLANATION ───────────────────────────────────────────────────
  if (includeExplanation && explanationText) {
    const label = summary.doctorEdited
      ? "Patient Explanation  (Doctor Reviewed)"
      : "Patient Explanation";
    sectionHeader(doc, label);
    textBlock(doc, explanationText);
  }

  // ── 11. TRANSLATION ───────────────────────────────────────────────────────────
  if (includeExplanation && language && summary.translations) {
    const translatedText: string | undefined =
      language === "hindi"   ? summary.translations.hindi   :
      language === "kannada" ? summary.translations.kannada :
      undefined;

    if (translatedText) {
      // Use English title that works with all fonts
      const title = language === "hindi" ? "Patient Explanation (Hindi)" : "Patient Explanation (Kannada)";
      sectionHeader(doc, title);
      // Use Indic font for the actual translated content
      textBlock(doc, translatedText, C.navy, true);
    }
  }

  // ── 12. SIGNATURE BLOCK ───────────────────────────────────────────────────────
  ensureSpace(doc, 80);
  doc.y += 30;
  hLine(doc, ML, ML + CW, doc.y, C.border, 0.5);
  doc.y += 20;

  const sigX = ML + CW * 0.55;
  const sigW = CW * 0.44;
  doc.fillColor(C.muted).font("Helvetica").fontSize(9)
     .text("_________________________________", sigX, doc.y, { width: sigW, align: "right" });
  doc.y += 16;
  doc.fillColor(C.muted).font("Helvetica-Oblique").fontSize(8.5)
     .text("Doctor's Signature & Stamp", sigX, doc.y, { width: sigW, align: "right" });
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
    const { consultationId, includeExplanation = false, language = null } = body;

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

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end",  () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      try {
        buildPdf(doc, consultation, includeExplanation, language);

        // Stamp page number + footer on every page
        const footerText = "Confidential — For the named patient only. Follow your doctor's instructions.";
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          hLine(doc, ML, ML + CW, PH - 45, C.border, 0.5);
          doc.fillColor(C.muted).font("Helvetica-Oblique").fontSize(7.5)
             .text(footerText, ML, PH - 36, { width: CW - 60, align: "left" });
          doc.fillColor(C.muted).font("Helvetica").fontSize(7.5)
             .text(`Page ${i - range.start + 1} of ${range.count}`, ML, PH - 36, { width: CW, align: "right" });
        }
        doc.flushPages();
      } catch (e) {
        reject(e);
      }
      doc.end();
    });

    // Track PDF generation for analytics
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
