import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status || 401 }
      );
    }

    if (auth.role !== "doctor") {
      return NextResponse.json(
        { success: false, message: "Only doctors can access consultations" },
        { status: 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const type = searchParams.get("type"); // dermatology, cosmetology, or null for both
    const status = searchParams.get("status"); // draft, completed
    const filter = searchParams.get("filter"); // today, week, month
    const search = searchParams.get("search");
    const patientId = searchParams.get("patientId");

    const doctorId = auth.doctorId;

    // Build date filter
    let dateFilter: any = {};
    const now = new Date();

    if (filter === "today") {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      dateFilter = { $gte: startOfDay };
    } else if (filter === "week") {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);
      dateFilter = { $gte: startOfWeek };
    } else if (filter === "month") {
      const startOfMonth = new Date(now);
      startOfMonth.setDate(now.getDate() - 30);
      dateFilter = { $gte: startOfMonth };
    }

    // Build query
    const buildQuery = (additionalFilter?: any) => {
      const query: any = { doctorId };

      if (Object.keys(dateFilter).length > 0) {
        query.consultationDate = dateFilter;
      }

      if (status) {
        query.status = status;
      }

      if (patientId) {
        query.patientId = patientId;
      }

      if (search) {
        query["patientInfo.name"] = { $regex: search, $options: "i" };
      }

      return { ...query, ...additionalFilter };
    };

    let consultations: any[] = [];
    let total = 0;

    if (!type) {
      // Fetch both collections in parallel
      const dermQuery = buildQuery();
      const cosmoQuery = buildQuery();

      const [dermConsultations, cosmoConsultations, dermCount, cosmoCount] = await Promise.all([
        ConsultationDermatology.find(dermQuery)
          .populate("patientId", "name patientId phone age gender")
          .sort({ consultationDate: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ConsultationCosmetology.find(cosmoQuery)
          .populate("patientId", "name patientId phone age gender")
          .sort({ consultationDate: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ConsultationDermatology.countDocuments(dermQuery),
        ConsultationCosmetology.countDocuments(cosmoQuery),
      ]);

      consultations = [
        ...dermConsultations.map((c: any) => ({ ...c, type: "dermatology" })),
        ...cosmoConsultations.map((c: any) => ({ ...c, type: "cosmetology" })),
      ]
        .sort((a, b) => new Date(b.consultationDate).getTime() - new Date(a.consultationDate).getTime())
        .slice(0, limit);

      total = dermCount + cosmoCount;
    } else if (type === "dermatology") {
      const dermQuery = buildQuery();
      const [dermConsultations, dermCount] = await Promise.all([
        ConsultationDermatology.find(dermQuery)
          .populate("patientId", "name patientId phone age gender")
          .sort({ consultationDate: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ConsultationDermatology.countDocuments(dermQuery),
      ]);
      consultations = dermConsultations.map((c: any) => ({ ...c, type: "dermatology" }));
      total = dermCount;
    } else if (type === "cosmetology") {
      const cosmoQuery = buildQuery();
      const [cosmoConsultations, cosmoCount] = await Promise.all([
        ConsultationCosmetology.find(cosmoQuery)
          .populate("patientId", "name patientId phone age gender")
          .sort({ consultationDate: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ConsultationCosmetology.countDocuments(cosmoQuery),
      ]);
      consultations = cosmoConsultations.map((c: any) => ({ ...c, type: "cosmetology" }));
      total = cosmoCount;
    }

    return NextResponse.json({
      success: true,
      data: {
        consultations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    console.error("Consultations list error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch consultations" },
      { status: 500 }
    );
  }
}
