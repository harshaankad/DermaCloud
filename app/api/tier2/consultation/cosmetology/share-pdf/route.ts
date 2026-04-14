/**
 * Generates a cosmetology consultation PDF, uploads it to S3,
 * and returns a 7-day signed URL for sharing via WhatsApp.
 */

import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import "@/models/Clinic";
import "@/models/User";
import { uploadToS3 } from "@/lib/aws/upload";
import { getSignedUrl } from "@/lib/aws/signed-url";
import path from "path";
import fs from "fs";

// ── Page geometry ──────────────────────────────────────────────────────────────
const PW = 595.28;
const PH = 841.89;
const MT = 40;
const ML = 50;
const MR = 50;
const MB = 60;
const CW = PW - ML - MR;

const FONTS_DIR = path.join(process.cwd(), "public", "fonts");
const KANNADA_FONT = path.join(FONTS_DIR, "NotoSansKannada-Regular.ttf");
const DEVANAGARI_FONT = path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf");

const C = {
  navy:      "#0F2D52",
  navyDark:  "#0A1F3A",
  navyLight: "#EEF2F9",
  body:      "#1A202C",
  muted:     "#718096",
  border:    "#CBD5E0",
  rowAlt:    "#F7F8FA",
  white:     "#FFFFFF",
};

function fillRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function hLine(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number, color: string, lw = 0.5) {
  doc.save().moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(lw).stroke().restore();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > PH - MB) { doc.addPage(); doc.y = MT; }
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string, useIndicFont = false) {
  ensureSpace(doc, 40);
  doc.y += 16;
  const y = doc.y;
  const h = 24;
  const sw = 4;
  fillRect(doc, ML,      y, sw, h, C.navy);
  fillRect(doc, ML + sw, y, CW - sw, h, C.navyLight);
  const fontName = useIndicFont ? "Indic" : "Helvetica-Bold";
  doc.fillColor(C.navy).font(fontName).fontSize(10)
     .text(title.toUpperCase(), ML + sw + 10, y + 7, { width: CW - sw - 20, lineBreak: false });
  doc.y = y + h + 10;
}

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
    fillRect(doc, ML,           y, labelW, rowH, C.navyLight);
    fillRect(doc, ML + labelW,  y, valueW, rowH, idx % 2 === 0 ? C.white : C.rowAlt);
    doc.save().rect(ML, y, CW, rowH).strokeColor(C.border).lineWidth(0.5).stroke().restore();
    doc.save().moveTo(ML + labelW, y).lineTo(ML + labelW, y + rowH).strokeColor(C.border).lineWidth(0.5).stroke().restore();
    doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(9)
       .text(row.label, ML + pad, y + pad, { width: labelW - pad * 2, lineBreak: false });
    doc.fillColor(C.body).font("Helvetica").fontSize(9.5)
       .text(row.value || "—", ML + labelW + pad, y + pad, { width: valueW - pad * 2 });
    doc.y = y + rowH;
  });
}

function textBlock(doc: PDFKit.PDFDocument, text: string, titleColor = C.navy, useIndicFont = false) {
  const pad = 12;
  const w   = CW - pad * 2;
  const lines = text.split("\n");
  const bodyFont = useIndicFont ? "Indic" : "Helvetica";
  const boldFont = useIndicFont ? "Indic" : "Helvetica-Bold";

  const renderLineWithBold = (line: string, x: number, fontSize: number, color: string, maxWidth: number) => {
    if (!line.includes("**")) {
      doc.fillColor(color).font(bodyFont).fontSize(fontSize)
         .text(line, x, doc.y, { width: maxWidth, lineGap: useIndicFont ? 4 : 2 });
      return;
    }
    const segments = line.split(/(\*\*[^*]+\*\*)/g);
    let currentX = x;
    const startY = doc.y;
    let totalWidth = 0;
    for (const seg of segments) {
      if (!seg) continue;
      const isBold = seg.startsWith("**") && seg.endsWith("**");
      doc.font(isBold ? boldFont : bodyFont).fontSize(fontSize);
      totalWidth += doc.widthOfString(isBold ? seg.slice(2, -2) : seg);
    }
    if (totalWidth <= maxWidth) {
      for (const seg of segments) {
        if (!seg) continue;
        const isBold = seg.startsWith("**") && seg.endsWith("**");
        const segText = isBold ? seg.slice(2, -2) : seg;
        doc.fillColor(color).font(isBold ? boldFont : bodyFont).fontSize(fontSize)
           .text(segText, currentX, startY, { continued: segments.indexOf(seg) < segments.length - 1, lineGap: useIndicFont ? 4 : 2 });
        currentX += doc.widthOfString(segText);
      }
      doc.text("", x, doc.y);
    } else {
      doc.fillColor(color).font(bodyFont).fontSize(fontSize)
         .text(line.replace(/\*\*([^*]+)\*\*/g, "$1"), x, doc.y, { width: maxWidth, lineGap: useIndicFont ? 4 : 2 });
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) { doc.y += 8; continue; }
    if (line.startsWith("## ")) {
      ensureSpace(doc, 24); doc.y += 6;
      renderLineWithBold(line.slice(3), ML + pad, 11, titleColor, w);
      doc.y += 6; continue;
    }
    if (line.startsWith("### ")) {
      ensureSpace(doc, 20); doc.y += 4;
      renderLineWithBold(line.slice(4), ML + pad, 10, C.navy, w);
      doc.y += 4; continue;
    }
    if (line.startsWith("• ") || line.startsWith("- ")) {
      ensureSpace(doc, 16);
      renderLineWithBold(line, ML + pad + 8, 9.5, C.body, w - 8);
      doc.y += 4; continue;
    }
    ensureSpace(doc, 16);
    renderLineWithBold(line, ML + pad, 9.5, C.body, w);
    doc.y += 2;
  }
}

function buildPdf(doc: PDFKit.PDFDocument, consultation: any, includeExplanation: boolean, language: string | null) {
  const indicFontPath = language === "hindi" ? DEVANAGARI_FONT : KANNADA_FONT;
  if (language && fs.existsSync(indicFontPath)) {
    doc.registerFont("Indic", indicFontPath);
  } else if (language && fs.existsSync(KANNADA_FONT)) {
    doc.registerFont("Indic", KANNADA_FONT);
  }

  const patient = consultation.patientId   || {};
  const clinic  = consultation.clinicId    || {};
  const info    = consultation.patientInfo || {};
  const assess  = consultation.assessment  || {};
  const proc    = consultation.procedure   || {};
  const ac      = consultation.aftercare   || {};
  const consent = consultation.consent     || {};
  const summary = consultation.patientSummary || {};

  const clinicName    = clinic.clinicName || "Cosmetology Clinic";
  const clinicAddress = [clinic.address, clinic.city, clinic.state].filter(Boolean).join(", ");
  const clinicPhone   = clinic.phone || "";
  const clinicEmail   = clinic.email || "";
  const explanationText = summary.doctorEdited || summary.aiGenerated || "";

  const headerH = 75;
  fillRect(doc, 0, 0, PW, headerH, C.navy);
  fillRect(doc, 0, 0, PW, 4, C.navyDark);
  fillRect(doc, 0, headerH - 4, PW, 4, C.navyDark);
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(20)
     .text(clinicName.toUpperCase(), 0, 22, { width: PW, align: "center", characterSpacing: 1.5 });
  hLine(doc, PW * 0.3, PW * 0.7, 48, "#4A6A8A", 1);
  const contactParts: string[] = [];
  if (clinicAddress) contactParts.push(clinicAddress);
  if (clinicPhone)   contactParts.push(`Tel: ${clinicPhone}`);
  if (clinicEmail)   contactParts.push(clinicEmail);
  if (contactParts.length) {
    doc.fillColor("#E8F0F8").font("Helvetica").fontSize(9)
       .text(contactParts.join("   •   "), 0, 54, { width: PW, align: "center" });
  }
  doc.y = headerH + 16;

  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(12)
     .text("COSMETOLOGY CONSULTATION REPORT", ML, doc.y, { width: CW, align: "center" });
  doc.y += 6;
  hLine(doc, ML, ML + CW, doc.y, C.navy, 1.5);
  doc.y += 16;

  const dateStr = new Date(consultation.consultationDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const pidStr  = patient.patientId || "N/A";
  const metaY   = doc.y;
  doc.fillColor(C.muted).font("Helvetica").fontSize(9).text(`Date: ${dateStr}`, ML, metaY);
  doc.fillColor(C.muted).font("Helvetica").fontSize(9).text(`Patient ID: ${pidStr}`, ML, metaY, { width: CW, align: "right" });
  doc.y = metaY + 18;
  hLine(doc, ML, ML + CW, doc.y, C.border, 0.5);
  doc.y += 8;

  sectionHeader(doc, "Patient Information");
  infoTable(doc, [
    { label: "Name",            value: info.name || "N/A" },
    { label: "Age / Gender",    value: `${info.age || "N/A"} yrs  ·  ${(info.gender || "N/A").charAt(0).toUpperCase() + (info.gender || "").slice(1)}` },
    { label: "Contact",         value: patient.phone || "N/A" },
    ...(info.skinType       ? [{ label: "Skin Type",       value: info.skinType }] : []),
    ...(info.primaryConcern ? [{ label: "Primary Concern", value: info.primaryConcern }] : []),
  ]);

  if (assess.findings || assess.diagnosis || assess.baselineEvaluation || assess.contraindicationsCheck) {
    sectionHeader(doc, "Assessment");
    infoTable(doc, [
      ...(assess.findings               ? [{ label: "Clinical Findings",   value: assess.findings }] : []),
      ...(assess.diagnosis              ? [{ label: "Diagnosis",           value: assess.diagnosis }] : []),
      ...(assess.baselineEvaluation     ? [{ label: "Baseline Evaluation", value: assess.baselineEvaluation }] : []),
      ...(assess.contraindicationsCheck ? [{ label: "Contraindications",   value: assess.contraindicationsCheck }] : []),
    ]);
  }

  if (proc.name || proc.goals || proc.productsAndParameters || proc.immediateOutcome) {
    const sessionLabel = proc.sessionNumber
      ? `Session ${proc.sessionNumber}${proc.package ? ` · ${proc.package}` : ""}`
      : proc.package || "";
    sectionHeader(doc, sessionLabel ? `Procedure — ${sessionLabel}` : "Procedure");
    infoTable(doc, [
      ...(proc.name                  ? [{ label: "Procedure Name",        value: proc.name }] : []),
      ...(proc.goals                 ? [{ label: "Treatment Goals",       value: proc.goals }] : []),
      ...(proc.productsAndParameters ? [{ label: "Products & Parameters", value: proc.productsAndParameters }] : []),
      ...(proc.immediateOutcome      ? [{ label: "Immediate Outcome",     value: proc.immediateOutcome }] : []),
      ...(proc.basePrice != null && proc.basePrice > 0  ? [{ label: "Base Price",   value: `Rs. ${Number(proc.basePrice).toLocaleString("en-IN")}` }] : []),
      ...(proc.gstRate != null && proc.gstRate > 0      ? [{ label: "GST",          value: `${proc.gstRate}% (Rs. ${Number(proc.gstAmount || 0).toLocaleString("en-IN")})` }] : []),
      ...(proc.totalAmount != null && proc.totalAmount > 0 ? [{ label: "Total",     value: `Rs. ${Number(proc.totalAmount).toLocaleString("en-IN")}` }] : []),
    ]);
  }

  if (ac.instructions || ac.homeProducts || ac.followUpDate || ac.expectedResults) {
    sectionHeader(doc, "Aftercare & Follow-up");
    const rows: { label: string; value: string }[] = [
      ...(ac.instructions    ? [{ label: "Instructions",     value: ac.instructions }] : []),
      ...(ac.homeProducts    ? [{ label: "Home Products",    value: ac.homeProducts }] : []),
      ...(ac.expectedResults ? [{ label: "Expected Results", value: ac.expectedResults }] : []),
    ];
    if (ac.followUpDate) {
      rows.push({ label: "Follow-up Date", value: new Date(ac.followUpDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) });
    }
    if (rows.length > 0) infoTable(doc, rows);
  }

  if (consent.risksExplained || consent.consentConfirmed !== undefined) {
    sectionHeader(doc, "Consent & Risks");
    infoTable(doc, [
      ...(consent.risksExplained        ? [{ label: "Risks Explained",  value: consent.risksExplained }] : []),
      ...(consent.consentConfirmed !== undefined ? [{ label: "Consent Status", value: consent.consentConfirmed ? "Confirmed" : "Not confirmed" }] : []),
    ]);
  }

  if (includeExplanation && explanationText) {
    const label = summary.doctorEdited ? "Patient Explanation  (Doctor Reviewed)" : "Patient Explanation";
    sectionHeader(doc, label);
    textBlock(doc, explanationText);
  }

  if (includeExplanation && language && summary.translations) {
    const translatedText: string | undefined =
      language === "hindi"   ? summary.translations.hindi   :
      language === "kannada" ? summary.translations.kannada :
      undefined;
    if (translatedText) {
      const title = language === "hindi" ? "Patient Explanation (Hindi)" : "Patient Explanation (Kannada)";
      sectionHeader(doc, title);
      textBlock(doc, translatedText, C.navy, true);
    }
  }

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

// ── Route handler ──────────────────────────────────────────────────────────────
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

    const consultation = await ConsultationCosmetology.findById(consultationId).lean();
    if (!consultation) {
      return NextResponse.json({ success: false, message: "Consultation not found" }, { status: 404 });
    }

    await ConsultationCosmetology.populate(consultation, [
      { path: "patientId" },
      { path: "clinicId" },
    ]);

    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end",  () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      try {
        buildPdf(doc, consultation, includeExplanation, language);
        const footerText = "Confidential — For the named patient only. Follow your doctor's instructions.";
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          // Drop bottom margin so pdfkit doesn't auto-paginate while writing the footer
          (doc.page as any).margins.bottom = 0;
          hLine(doc, ML, ML + CW, PH - 45, C.border, 0.5);
          doc.fillColor(C.muted).font("Helvetica-Oblique").fontSize(7.5)
             .text(footerText, ML, PH - 36, { width: CW - 60, align: "left", lineBreak: false });
          doc.fillColor(C.muted).font("Helvetica").fontSize(7.5)
             .text(`Page ${i - range.start + 1} of ${range.count}`, ML, PH - 36, { width: CW, align: "right", lineBreak: false });
        }
        doc.flushPages();
      } catch (e) { reject(e); }
      doc.end();
    });

    const patientId = (consultation as any).patientId?.patientId || "unknown";
    const dateStr   = new Date().toISOString().split("T")[0];
    const fileName  = `Cosmetology_${patientId}_${dateStr}_${Date.now()}.pdf`;

    const uploadResult = await uploadToS3(pdfBuffer, "application/pdf", {
      folder: "REPORTS_PDF",
      customFileName: fileName,
    });

    if (!uploadResult.success || !uploadResult.key) {
      return NextResponse.json({ success: false, message: "Failed to upload PDF to storage" }, { status: 500 });
    }

    const SEVEN_DAYS = 7 * 24 * 60 * 60;
    const signedUrl = getSignedUrl(uploadResult.key, SEVEN_DAYS);

    return NextResponse.json({ success: true, url: signedUrl });
  } catch (error: any) {
    console.error("Cosmetology share PDF error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate shareable PDF", error: error.message },
      { status: 500 }
    );
  }
}
