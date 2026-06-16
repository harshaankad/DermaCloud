import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { isValidObjectId } from "@/lib/sanitize";
import { getSignedUrl } from "@/lib/aws";
import ConsentRecord from "@/models/ConsentRecord";

/** Returns a single consent record plus a short-lived signed URL for its PDF. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
    }

    await connectDB();

    const record = await ConsentRecord.findById(id).lean();
    if (!record || (record as any).clinicId?.toString() !== auth.clinicId) {
      return NextResponse.json({ success: false, message: "Consent not found" }, { status: 404 });
    }

    const pdfUrl = (record as any).pdfKey ? getSignedUrl((record as any).pdfKey, 3600) : null;

    return NextResponse.json({ success: true, data: { record, pdfUrl } });
  } catch (error) {
    console.error("Error fetching consent record:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
