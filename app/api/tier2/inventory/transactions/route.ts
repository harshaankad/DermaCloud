import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import InventoryTransaction from "@/models/InventoryTransaction";

// GET - List recent transactions across all inventory items
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    if (!hasPermission(auth, "pharmacy")) {
      return NextResponse.json(
        { success: false, message: "You don't have permission to view transactions" },
        { status: 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const type = searchParams.get("type"); // stock-in, stock-out, etc.

    const query: any = { clinicId: auth.clinicId };
    if (type) {
      query.type = type;
    }

    const transactions = await InventoryTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("itemId", "name itemCode category unit");

    return NextResponse.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
