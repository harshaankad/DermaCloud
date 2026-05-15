import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { sanitize, stripHtml } from "@/lib/sanitize";
import Clinic from "@/models/Clinic";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    await connectDB();

    const clinic = await Clinic.findById(auth.clinicId).select("gstin").lean();

    return NextResponse.json({
      success: true,
      data: { gstin: clinic?.gstin ?? "" },
    });
  } catch (error) {
    console.error("Error fetching clinic GSTIN:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    if (auth.role !== "doctor") {
      return NextResponse.json(
        { success: false, message: "Only the doctor can update clinic GSTIN" },
        { status: 403 }
      );
    }

    const body = sanitize<{ gstin?: unknown }>(await request.json());
    const raw = typeof body.gstin === "string" ? stripHtml(body.gstin).trim() : "";
    const gstin = raw.toUpperCase();

    if (gstin.length > 0 && gstin.length > 20) {
      return NextResponse.json(
        { success: false, message: "GSTIN is too long" },
        { status: 400 }
      );
    }

    await connectDB();

    const clinic = await Clinic.findByIdAndUpdate(
      auth.clinicId,
      { $set: { gstin } },
      { new: true }
    ).select("gstin");

    if (!clinic) {
      return NextResponse.json(
        { success: false, message: "Clinic not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "GSTIN updated successfully",
      data: { gstin: clinic.gstin ?? "" },
    });
  } catch (error) {
    console.error("Error updating clinic GSTIN:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
