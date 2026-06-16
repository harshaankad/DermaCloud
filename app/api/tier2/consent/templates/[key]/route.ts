import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import ConsentTemplate from "@/models/ConsentTemplate";

/** Returns a single consent template with its full body + fields. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { key } = await params;

    await connectDB();

    const template = await ConsentTemplate.findOne({ key, isActive: true }).lean();
    if (!template) {
      return NextResponse.json({ success: false, message: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { template } });
  } catch (error) {
    console.error("Error fetching consent template:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
