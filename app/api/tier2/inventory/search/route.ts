import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import InventoryItem from "@/models/InventoryItem";

// GET - Lightweight medicine search for prescription autocomplete (accessible by doctors)
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    await connectDB();

    const items = await InventoryItem.find({
      clinicId: auth.clinicId,
      status: { $ne: "discontinued" },
      $or: [
        { name: { $regex: q, $options: "i" } },
        { genericName: { $regex: q, $options: "i" } },
      ],
    })
      .select("name genericName category currentStock unit sellingPrice manufacturer packing")
      .limit(10)
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    console.error("Inventory search error:", error);
    return NextResponse.json(
      { success: false, message: "Search failed" },
      { status: 500 }
    );
  }
}
