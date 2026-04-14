import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import CosmetologyProcedure from "@/models/CosmetologyProcedure";

// GET - List all procedures for the clinic
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const activeOnly = searchParams.get("active") !== "false";

    const query: any = { clinicId: auth.clinicId };
    if (activeOnly) query.isActive = true;
    if (search) query.name = { $regex: search, $options: "i" };

    const procedures = await CosmetologyProcedure.find(query).sort({ category: 1, name: 1 }).lean();

    return NextResponse.json({ success: true, data: procedures });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST - Create a new procedure
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });
    }

    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Only doctors can manage procedures" }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const { name, category, basePrice, gstRate, description } = body;

    if (!name || !category || basePrice == null) {
      return NextResponse.json({ success: false, message: "Name, category, and base price are required" }, { status: 400 });
    }

    const procedure = await CosmetologyProcedure.create({
      clinicId: auth.clinicId,
      name: name.trim(),
      category,
      basePrice,
      gstRate: gstRate || 0,
      description: description?.trim(),
    });

    return NextResponse.json({ success: true, data: procedure }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "A procedure with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PUT - Update a procedure
export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });
    }

    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Only doctors can manage procedures" }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const { _id, ...updates } = body;

    if (!_id) {
      return NextResponse.json({ success: false, message: "Procedure ID is required" }, { status: 400 });
    }

    const procedure = await CosmetologyProcedure.findOneAndUpdate(
      { _id, clinicId: auth.clinicId },
      { $set: updates },
      { new: true }
    );

    if (!procedure) {
      return NextResponse.json({ success: false, message: "Procedure not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: procedure });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "A procedure with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// DELETE - Soft delete (deactivate) a procedure
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });
    }

    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Only doctors can manage procedures" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "Procedure ID is required" }, { status: 400 });
    }

    const procedure = await CosmetologyProcedure.findOneAndUpdate(
      { _id: id, clinicId: auth.clinicId },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!procedure) {
      return NextResponse.json({ success: false, message: "Procedure not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Procedure deactivated" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
