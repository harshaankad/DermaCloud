import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { sanitize, stripHtml, isValidObjectId } from "@/lib/sanitize";
import {
  uploadToS3,
  validateImage,
  getObjectBuffer,
  MAX_IMAGE_SIZE,
} from "@/lib/aws";
import { buildConsentPdf, ConsentPdfField } from "@/lib/pdf/consent";
import ConsentRecord from "@/models/ConsentRecord";
import ConsentTemplate from "@/models/ConsentTemplate";
import Patient from "@/models/Patient";
import Clinic from "@/models/Clinic";
import User from "@/models/User";

const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
};

/** Extract the S3 object key from a full S3 URL. */
function keyFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    return decodeURIComponent(pathname.replace(/^\/+/, "")) || null;
  } catch {
    return null;
  }
}

// ── List signed consent records (doctor only) ──────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, parseInt(searchParams.get("limit") || "20"));
    const skip = (page - 1) * limit;

    const query: any = { clinicId: auth.clinicId };
    if (search) {
      query.$or = [
        { "patientSnapshot.name": { $regex: search, $options: "i" } },
        { "patientSnapshot.phone": { $regex: search, $options: "i" } },
        { "patientSnapshot.patientCode": { $regex: search, $options: "i" } },
        { templateTitle: { $regex: search, $options: "i" } },
      ];
    }

    const [records, total] = await Promise.all([
      ConsentRecord.find(query)
        .select("patientSnapshot templateTitle isMinor signedAt createdAt")
        .sort({ signedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ConsentRecord.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        records,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error("Error listing consent records:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

// ── Create + sign a consent record (doctor only) ───────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const body = sanitize<{
      patientId?: unknown;
      templateKey?: unknown;
      fieldValues?: Record<string, unknown>;
      isMinor?: unknown;
      guardianName?: unknown;
      guardianRelation?: unknown;
      signatureImage?: unknown; // data URL (png)
      signatureMethod?: unknown;
    }>(await request.json());

    const patientId = typeof body.patientId === "string" ? body.patientId : "";
    const templateKey = typeof body.templateKey === "string" ? body.templateKey : "";
    const signatureImage = typeof body.signatureImage === "string" ? body.signatureImage : "";
    const signatureMethod = ["drawn", "thumb", "uploaded"].includes(body.signatureMethod as string)
      ? (body.signatureMethod as "drawn" | "thumb" | "uploaded")
      : "drawn";
    const isMinor = body.isMinor === true;
    const guardianName = isMinor && typeof body.guardianName === "string" ? stripHtml(body.guardianName).trim() : "";
    const guardianRelation = isMinor && typeof body.guardianRelation === "string" ? stripHtml(body.guardianRelation).trim() : "";

    if (!isValidObjectId(patientId)) {
      return NextResponse.json({ success: false, message: "Valid patientId is required" }, { status: 400 });
    }
    if (!templateKey) {
      return NextResponse.json({ success: false, message: "templateKey is required" }, { status: 400 });
    }
    if (!signatureImage.startsWith("data:image/")) {
      return NextResponse.json({ success: false, message: "A signature is required" }, { status: 400 });
    }
    if (isMinor && !guardianName) {
      return NextResponse.json(
        { success: false, message: "Guardian name is required for a minor" },
        { status: 400 }
      );
    }

    await connectDB();

    const [patient, template, clinic, doctor] = await Promise.all([
      Patient.findById(patientId).lean(),
      ConsentTemplate.findOne({ key: templateKey, isActive: true }).lean(),
      Clinic.findById(auth.clinicId).select("clinicName doctorSignature").lean(),
      User.findById(auth.userId).select("name").lean(),
    ]);

    if (!patient || (patient as any).clinicId?.toString() !== auth.clinicId) {
      return NextResponse.json({ success: false, message: "Patient not found" }, { status: 404 });
    }
    if (!template) {
      return NextResponse.json({ success: false, message: "Template not found" }, { status: 404 });
    }

    // Decode the signature data URL → buffer.
    const base64 = signatureImage.split(",")[1] || "";
    const sigBuffer = Buffer.from(base64, "base64");
    const sigValidation = await validateImage(sigBuffer, MAX_IMAGE_SIZE / (1024 * 1024));
    if (!sigValidation.valid) {
      return NextResponse.json({ success: false, message: sigValidation.error }, { status: 400 });
    }

    // Resolve the doctor's stored signature (best-effort) for stamping.
    let doctorSigBuffer: Buffer | null = null;
    const doctorSigUrl = (clinic as any)?.doctorSignature as string | undefined;
    const doctorSigKey = doctorSigUrl ? keyFromUrl(doctorSigUrl) : null;
    if (doctorSigKey) doctorSigBuffer = await getObjectBuffer(doctorSigKey);

    // Resolve template fields → labelled values for the PDF.
    const fieldValues: Record<string, string> = {};
    const pdfFields: ConsentPdfField[] = [];
    for (const f of (template as any).fields || []) {
      const raw = body.fieldValues?.[f.key];
      const val = typeof raw === "string" ? stripHtml(raw).trim() : "";
      if (val) {
        fieldValues[f.key] = val;
        pdfFields.push({ label: f.label, value: val });
      }
    }

    const now = new Date();
    const dateStr = new Intl.DateTimeFormat("en-IN", DATE_FMT).format(now);
    const doctorName = (doctor as any)?.name ? `Dr. ${(doctor as any).name}` : undefined;
    const recordId = crypto.randomUUID();

    // Build the PDF.
    const pdfBuffer = await buildConsentPdf({
      clinicName: (clinic as any)?.clinicName || auth.clinicName || "Clinic",
      title: (template as any).title,
      source: (template as any).source,
      patient: {
        name: (patient as any).name,
        code: (patient as any).patientId,
        age: (patient as any).age,
        gender: (patient as any).gender,
        phone: (patient as any).phone,
        address: (patient as any).address,
      },
      dateStr,
      fields: pdfFields,
      bodyMarkdown: (template as any).bodyMarkdown,
      isMinor,
      guardianName,
      guardianRelation,
      doctorName,
      doctorSignature: doctorSigBuffer,
      patientSignature: sigBuffer,
      signatureMethod,
      recordId,
    });

    // Upload signature + PDF to S3.
    const [sigUpload, pdfUpload] = await Promise.all([
      uploadToS3(sigBuffer, "image/png", { folder: "CONSENT_SIGNATURES", clinicId: auth.clinicId }),
      uploadToS3(pdfBuffer, "application/pdf", { folder: "CONSENT_PDF", clinicId: auth.clinicId }),
    ]);

    if (!sigUpload.success || !sigUpload.key) {
      return NextResponse.json({ success: false, message: "Failed to store signature" }, { status: 500 });
    }
    if (!pdfUpload.success || !pdfUpload.key) {
      return NextResponse.json({ success: false, message: "Failed to store consent PDF" }, { status: 500 });
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const record = await ConsentRecord.create({
      clinicId: auth.clinicId,
      patientId,
      createdById: auth.userId,
      templateKey: (template as any).key,
      templateTitle: (template as any).title,
      templateVersion: (template as any).version,
      patientSnapshot: {
        name: (patient as any).name,
        patientCode: (patient as any).patientId,
        age: (patient as any).age,
        gender: (patient as any).gender,
        phone: (patient as any).phone,
        address: (patient as any).address,
      },
      fieldValues,
      isMinor,
      guardianName: guardianName || undefined,
      guardianRelation: guardianRelation || undefined,
      doctorName,
      doctorSignatureKey: doctorSigKey || undefined,
      patientSignature: { key: sigUpload.key, method: signatureMethod },
      signedAt: now,
      audit: { ipAddress, userAgent },
      pdfKey: pdfUpload.key,
      status: "signed",
    });

    return NextResponse.json({ success: true, data: { id: record._id } });
  } catch (error) {
    console.error("Error creating consent record:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
