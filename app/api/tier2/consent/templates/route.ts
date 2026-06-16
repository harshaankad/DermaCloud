import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import ConsentTemplate from "@/models/ConsentTemplate";

/**
 * Lists the global consent form templates for the picker.
 * Returns lightweight metadata only (no body) — the body is fetched per template.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    await connectDB();

    const templates = await ConsentTemplate.find({ isActive: true })
      .select("key title source category version sortOrder")
      .sort({ sortOrder: 1, title: 1 })
      .lean();

    return NextResponse.json({ success: true, data: { templates } });
  } catch (error) {
    console.error("Error listing consent templates:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
