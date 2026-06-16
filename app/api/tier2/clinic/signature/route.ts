import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import {
  uploadToS3,
  deleteFromS3,
  processImage,
  validateImage,
  getSignedUrl,
  MAX_IMAGE_SIZE,
} from "@/lib/aws";
import Clinic from "@/models/Clinic";

/**
 * Doctor signature image, stored on the clinic record alongside the seal/logo.
 * Used to stamp the "operating doctor" signature onto generated consent forms.
 * Only the doctor (not frontdesk) can manage it.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    await connectDB();

    const clinic = await Clinic.findById(auth.clinicId).select("doctorSignature").lean();

    // The bucket is private — return a short-lived signed URL for display.
    const stored = clinic?.doctorSignature;
    const key = stored ? keyFromUrl(stored) : null;
    const signatureUrl = key ? getSignedUrl(key, 3600) : "";

    return NextResponse.json({
      success: true,
      data: { signatureUrl },
    });
  } catch (error) {
    console.error("Error fetching doctor signature:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    if (auth.role !== "doctor") {
      return NextResponse.json(
        { success: false, message: "Only the doctor can update the signature" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const validation = await validateImage(buffer, MAX_IMAGE_SIZE / (1024 * 1024));
    if (!validation.valid) {
      return NextResponse.json({ success: false, message: validation.error }, { status: 400 });
    }

    // Normalise to a compact PNG so it stamps cleanly onto the consent PDF.
    const processed = await processImage(buffer, {
      maxWidth: 800,
      maxHeight: 400,
      format: "png",
    });

    await connectDB();

    const clinic = await Clinic.findById(auth.clinicId).select("doctorSignature");
    if (!clinic) {
      return NextResponse.json({ success: false, message: "Clinic not found" }, { status: 404 });
    }

    const uploadResult = await uploadToS3(processed.buffer, processed.contentType, {
      folder: "DOCTOR_SIGNATURES",
      clinicId: auth.clinicId,
    });

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json(
        { success: false, message: uploadResult.error || "Upload failed" },
        { status: 500 }
      );
    }

    const previousUrl = clinic.doctorSignature;

    clinic.doctorSignature = uploadResult.url;
    await clinic.save();

    // Best-effort cleanup of the old signature file.
    if (previousUrl) {
      const previousKey = keyFromUrl(previousUrl);
      if (previousKey) await deleteFromS3(previousKey).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: "Signature saved",
      data: { signatureUrl: getSignedUrl(uploadResult.key!, 3600) },
    });
  } catch (error) {
    console.error("Error saving doctor signature:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    if (auth.role !== "doctor") {
      return NextResponse.json(
        { success: false, message: "Only the doctor can update the signature" },
        { status: 403 }
      );
    }

    await connectDB();

    const clinic = await Clinic.findById(auth.clinicId).select("doctorSignature");
    if (!clinic) {
      return NextResponse.json({ success: false, message: "Clinic not found" }, { status: 404 });
    }

    const previousUrl = clinic.doctorSignature;
    clinic.doctorSignature = undefined;
    await clinic.save();

    if (previousUrl) {
      const previousKey = keyFromUrl(previousUrl);
      if (previousKey) await deleteFromS3(previousKey).catch(() => {});
    }

    return NextResponse.json({ success: true, message: "Signature removed" });
  } catch (error) {
    console.error("Error removing doctor signature:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

/** Extract the S3 object key from a full S3 URL. */
function keyFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    return decodeURIComponent(pathname.replace(/^\/+/, "")) || null;
  } catch {
    return null;
  }
}
