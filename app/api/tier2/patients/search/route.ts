import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import Patient from "@/models/Patient";

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    // Verify user is Tier 2
    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        {
          success: false,
          message: "This endpoint is only for Tier 2 users",
        },
        { status: 403 }
      );
    }

    // Get clinic ID
    const clinicId = authUser.clinicId;
    if (!clinicId) {
      return NextResponse.json(
        {
          success: false,
          message: "Clinic not found for this user",
        },
        { status: 400 }
      );
    }

    // Get search query
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          message: "Search query is required",
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Search patients by name, phone, or patient ID
    // Using $or to search across multiple fields
    const patients = await Patient.find({
      clinicId: clinicId,
      $or: [
        { name: { $regex: query, $options: "i" } }, // Case-insensitive name search
        { phone: { $regex: query, $options: "i" } }, // Phone search
        { patientId: { $regex: query, $options: "i" } }, // Patient ID search
      ],
    })
      .select("patientId name age gender phone email createdAt")
      .sort({ createdAt: -1 })
      .limit(20); // Limit to 20 results

    return NextResponse.json({
      success: true,
      data: {
        patients,
        count: patients.length,
      },
    });
  } catch (error: any) {
    console.error("Patient search error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to search patients",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
