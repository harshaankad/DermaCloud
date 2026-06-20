/**
 * Per-clinic digital letterhead for generated consultation PDFs.
 *
 * Most clinics print reports on pre-printed stationery, so the PDF generators
 * leave the top 130pt of every page blank. A few clinics have no pre-printed
 * letterhead — for those (gated strictly by clinic ID) we paint a branded
 * header into that reserved strip and a footer band into the bottom margin.
 *
 * Stamping happens AFTER the report body is built, on every page via
 * switchToPage — so the report content is never shifted or altered.
 *
 * Logo/QR images are optional: if the files are absent the text-only header
 * and footer still render cleanly.
 */

import path from "path";
import fs from "fs";

// ── A4 page geometry (must match the consultation PDF generators) ─────────────
const PW = 595.28;
const PH = 841.89;
const MT = 130;   // top — reserved strip the branded header paints into
const ML = 50;
const MR = 50;
const MB = 50;    // bottom — reserved strip the footer band paints into
const CW = PW - ML - MR;

const BLACK        = "#000000";
const BORDER       = "#999999";
const BRAND_ORANGE = "#C2761A";

// Clinics that should render the branded letterhead. Anything not listed here
// keeps the default print-on-pre-printed-letterhead behaviour, untouched.
//   6a1d8b72c3e5d57ff5867e1d → Dr Manjula's Skin Care Center (production)
//   69d26c237aa4278d1760d4a4 → Ankad Cutiscience (testing)
export const BRANDED_CLINIC_IDS = new Set<string>([
  "6a1d8b72c3e5d57ff5867e1d",
  "69d26c237aa4278d1760d4a4",
]);

const LOGO_PATH = path.join(process.cwd(), "public", "clinic-branding", "manjula-logo.png");
const QR_PATH   = path.join(process.cwd(), "public", "clinic-branding", "manjula-qr.png");

const BRANDING = {
  clinicName:     "Dr. Manjula's Skin Care Center",
  doctorName:     "Dr. MANJULA. R,",
  qualifications: "M.B.B.S., M.D DVL, FRGUHS DERMATOPATHOLOGY",
  title:          "Consultant Dermatologist | Dermatopathologist",
  regNo:          "KMC Reg No: 112048",
  facilities:     "Facilities Available:  Radio Frequency & electrocautery ablation, Electrolysis, Chemical Peels, Dermaroller, Platelet Rich Plasma therapy, Growth Factor Concentrate therapy, Laser Hair reduction, Vitiligo Surgeries, Hair Transplantation.",
  footerLeft:     "Please bring this prescription for follow up",
  footerRight:    "Get well soon",
};

function hLine(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number, color = BLACK, lw = 0.5) {
  doc.save().moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(lw).stroke().restore();
}

// Branded header: logo (top-left) + centered clinic name & doctor credentials,
// painted into the reserved top strip, with a divider just above the body. The
// clinic and doctor names use a bold serif to match the printed letterhead.
function stampHeader(doc: PDFKit.PDFDocument) {
  const top = 26;
  if (fs.existsSync(LOGO_PATH)) {
    try { doc.image(LOGO_PATH, ML, top + 2, { fit: [74, 74] }); }
    catch { /* unreadable logo — fall back to text-only header */ }
  }
  // Google review QR at the top-right, balancing the logo on the left.
  if (fs.existsSync(QR_PATH)) {
    const qrSize = 58;
    try { doc.image(QR_PATH, ML + CW - qrSize, top + 6, { fit: [qrSize, qrSize] }); }
    catch { /* unreadable QR — skip it */ }
  }
  // Centered across the full content width; the logo and QR flank it.
  doc.fillColor(BRAND_ORANGE).font("Times-Bold").fontSize(25)
     .text(BRANDING.clinicName, ML, top, { width: CW, align: "center", lineBreak: false });
  doc.fillColor(BLACK).font("Times-Bold").fontSize(15)
     .text(BRANDING.doctorName, ML, top + 33, { width: CW, align: "center", lineBreak: false });
  doc.fillColor(BLACK).font("Helvetica").fontSize(7)
     .text(BRANDING.qualifications, ML, top + 52, { width: CW, align: "center", lineBreak: false });
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(10.5)
     .text(BRANDING.title, ML, top + 62, { width: CW, align: "center", lineBreak: false });
  doc.fillColor(BLACK).font("Helvetica").fontSize(9)
     .text(BRANDING.regNo, ML, top + 77, { width: CW, align: "center", lineBreak: false });
  hLine(doc, ML, ML + CW, MT - 10, BORDER, 0.8);
}

// Footer band: facilities line + sign-off, painted into the reserved bottom
// strip. The bottom margin is temporarily set to 0 so pdfkit does not spill the
// footer onto a new page when it draws below the margin.
function stampFooter(doc: PDFKit.PDFDocument) {
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  try {
    const topY = PH - MB + 2;
    hLine(doc, ML, ML + CW, topY, BORDER, 0.6);

    doc.fillColor("#555555").font("Helvetica").fontSize(6.3)
       .text(BRANDING.facilities, ML, topY + 5, { width: CW, align: "left", lineGap: 1 });

    const bottomY = PH - 18;
    doc.fillColor(BLACK).font("Helvetica").fontSize(8)
       .text(BRANDING.footerLeft, ML, bottomY, { width: CW, align: "left", lineBreak: false });
    doc.fillColor(BLACK).font("Helvetica").fontSize(8)
       .text(BRANDING.footerRight, ML, bottomY, { width: CW, align: "right", lineBreak: false });
  } finally {
    doc.page.margins.bottom = savedBottom;
  }
}

/**
 * If `clinicId` is a branded clinic, stamp the header + footer onto every page
 * of `doc`. No-op for all other clinics. Call after the body is built and the
 * document was created with `bufferPages: true`.
 */
export function applyClinicBranding(doc: PDFKit.PDFDocument, clinicId: string) {
  if (!BRANDED_CLINIC_IDS.has(clinicId)) return;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    stampHeader(doc);
    stampFooter(doc);
  }
}
