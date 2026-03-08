/**
 * API endpoint to save a translated patient explanation for cosmetology consultations
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";

export async function POST(request: NextRequest) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) return authResult;

    const { user: authUser } = authResult;
    if (authUser.tier !== "tier2") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { consultationId, language, text } = body;

    if (!consultationId || !language || !text) {
      return NextResponse.json(
        { success: false, message: "consultationId, language, and text are required" },
        { status: 400 }
      );
    }

    const supported = ["hindi", "kannada"];
    if (!supported.includes(language)) {
      return NextResponse.json(
        { success: false, message: "Supported languages: hindi, kannada" },
        { status: 400 }
      );
    }

    await connectDB();

    const trimmed = text.trim();
    if (!trimmed) {
      return NextResponse.json({ success: false, message: "Translation text is empty" }, { status: 400 });
    }

    const result = await ConsultationCosmetology.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(consultationId) },
      { $set: { [`patientSummary.translations.${language}`]: trimmed } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, message: "Consultation not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `${language} translation saved`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error: any) {
    console.error("Save cosmetology translation error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save translation", error: error.message },
      { status: 500 }
    );
  }
}
