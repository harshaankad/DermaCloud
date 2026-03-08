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
const KANNADA_FONT = path.join(FONTS_DIR, "NotoSansKannada-Regular.ttf");
const DEVANAGARI_FONT = path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf");

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
  const boldFont = useIndicFont ? "Indic" : "Helvetica-Bold";
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

    if (line.startsWith("## ")) {
      ensureSpace(doc, useIndicFont ? 50 : 36);
      doc.y += 10;  // gap before main heading
      const headingText = line.slice(3);
      // Always bold (Indic Regular at larger size for scripts without bold variant)
      const h2Font = useIndicFont ? "Indic" : "Helvetica-Bold";
      doc.fillColor(titleColor).font(h2Font).fontSize(useIndicFont ? 12 : 13)
         .text(headingText, ML + pad, doc.y, { width: w, lineGap });
      // Prominent underline beneath heading
      hLine(doc, ML + pad, ML + pad + w, doc.y, titleColor, 1.5);
      doc.y += 10;  // gap after heading
      safePageBreak();
      continue;
    }

    if (line.startsWith("### ")) {
      ensureSpace(doc, useIndicFont ? 40 : 28);
      doc.y += 6;  // gap before subheading
      const headingText = line.slice(4);
      // Always bold
      const h3Font = useIndicFont ? "Indic" : "Helvetica-Bold";
      doc.fillColor(C.navy).font(h3Font).fontSize(useIndicFont ? 11 : 11)
         .text(headingText, ML + pad, doc.y, { width: w, lineGap });
      // Subtle divider line beneath subheading
      hLine(doc, ML + pad, ML + pad + w, doc.y, C.border, 0.75);
      doc.y += 7;  // gap after subheading
      safePageBreak();
      continue;
    }

    if (line.startsWith("• ") || line.startsWith("- ")) {
      ensureSpace(doc, lineEst);
      renderLineWithBold(line, ML + pad + 8, 9.5, C.body, w - 8);
      doc.y += 4;  // gap after bullet
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

// ── Main PDF builder ───────────────────────────────────────────────────────────
function buildPdf(
  doc: PDFKit.PDFDocument,
  consultation: any,
  includeExplanation: boolean,
  language: string | null,
) {
  // Register Indic fonts for Hindi/Kannada support
  // We use the Kannada font as it has good coverage for both scripts
  const indicFontPath = language === "hindi" ? DEVANAGARI_FONT : KANNADA_FONT;
  if (language && fs.existsSync(indicFontPath)) {
    doc.registerFont("Indic", indicFontPath);
  } else if (language && fs.existsSync(KANNADA_FONT)) {
    // Fallback to Kannada font
    doc.registerFont("Indic", KANNADA_FONT);
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

      const rows: { label: string; value: string }[] = [
        ...(fd.complaint || fd.chiefComplaint           ? [{ label: "Chief Complaint",      value: fd.complaint || fd.chiefComplaint }] : []),
        ...(fd.duration                                  ? [{ label: "Duration",             value: fd.duration }] : []),
        ...(fd.lesionSite                                ? [{ label: "Lesion Site",          value: fd.lesionSite }] : []),
        ...(fd.morphology                                ? [{ label: "Morphology",           value: fd.morphology }] : []),
        ...(fd.distribution                              ? [{ label: "Distribution",         value: fd.distribution }] : []),
        ...(fd.severity                                  ? [{ label: "Severity",             value: fd.severity }] : []),
        ...(fd.finalInterpretation || fd.dermoscopicFindings
                                                         ? [{ label: "Dermoscopic Findings", value: fd.finalInterpretation || fd.dermoscopicFindings }] : []),
        ...(diagnosis                                    ? [{ label: "Diagnosis",            value: diagnosis }] : []),
        ...(fd.differentials || fd.differentialDiagnosis ? [{ label: "Differentials",        value: fd.differentials || fd.differentialDiagnosis }] : []),
        ...(fd.topicals || fd.topicalMedications         ? [{ label: "Topical Medications",  value: fd.topicals || fd.topicalMedications }] : []),
        ...(fd.orals    || fd.oralMedications            ? [{ label: "Oral Medications",     value: fd.orals    || fd.oralMedications }] : []),
        ...(fd.lifestyleChanges || fd.lifestyleAdvice    ? [{ label: "Lifestyle Advice",     value: fd.lifestyleChanges || fd.lifestyleAdvice }] : []),
        ...(fd.investigations                            ? [{ label: "Investigations",       value: fd.investigations }] : []),
      ];
      if (rows.length > 0) infoTable(doc, rows);
    });
  } else {
    // ── Single-issue (original behaviour) ──────────────────────────────────────
    if (exam.lesionSite || exam.morphology || exam.distribution || exam.severity) {
      sectionHeader(doc, "Clinical Examination");
      infoTable(doc, [
        ...(exam.lesionSite   ? [{ label: "Lesion Site",   value: exam.lesionSite }] : []),
        ...(exam.morphology   ? [{ label: "Morphology",    value: exam.morphology }] : []),
        ...(exam.distribution ? [{ label: "Distribution",  value: exam.distribution }] : []),
        ...(exam.severity     ? [{ label: "Severity",      value: exam.severity }] : []),
      ]);
    }
    if (dermo.finalInterpretation) {
      sectionHeader(doc, "Dermoscopic Findings");
      simpleBox(doc, dermo.finalInterpretation);
    }
    if (diag.provisional || (diag.differentials && diag.differentials.length > 0)) {
      sectionHeader(doc, "Diagnosis");
      infoTable(doc, [
        ...(diag.provisional          ? [{ label: "Provisional",   value: diag.provisional }] : []),
        ...(diag.differentials?.length ? [{ label: "Differentials", value: diag.differentials.join(", ") }] : []),
      ]);
    }
    if (tx.topicals || tx.orals || tx.lifestyleChanges || tx.investigations) {
      sectionHeader(doc, "Treatment Plan");
      infoTable(doc, [
        ...(tx.topicals         ? [{ label: "Topical Medications", value: tx.topicals }] : []),
        ...(tx.orals            ? [{ label: "Oral Medications",    value: tx.orals }] : []),
        ...(tx.lifestyleChanges ? [{ label: "Lifestyle Advice",    value: tx.lifestyleChanges }] : []),
        ...(tx.investigations   ? [{ label: "Investigations",      value: tx.investigations }] : []),
      ]);
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
      margin: 0,
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
