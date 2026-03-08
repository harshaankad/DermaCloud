import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Patient from "@/models/Patient";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status || 401 }
      );
    }

    // Check patients permission for frontdesk
    if (auth.role === "frontdesk" && !hasPermission(auth, "patients")) {
      return NextResponse.json(
        { success: false, message: "No permission to view patients" },
        { status: 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build query
    const query: any = { clinicId: auth.clinicId };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { patientId: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [patients, total] = await Promise.all([
      Patient.find(query)
        .select("patientId name age gender phone email createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Patient.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        patients,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching patients:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch patients" },
      { status: 500 }
    );
  }
}
