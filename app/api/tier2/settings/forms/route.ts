import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import FormSettings from "@/models/FormSettings";
import {
  defaultDermatologyForm,
  defaultCosmetologyForm,
} from "@/lib/defaultFormConfig";

// GET: Fetch form settings
export async function GET(request: NextRequest) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        { success: false, message: "This endpoint is only for Tier 2 users" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const formType = searchParams.get("formType") as "dermatology" | "cosmetology";

    if (!formType || !["dermatology", "cosmetology"].includes(formType)) {
      return NextResponse.json(
        { success: false, message: "Invalid form type" },
        { status: 400 }
      );
    }

    await connectDB();

    // Try to find existing settings
    let formSettings = await FormSettings.findOne({
      userId: authUser.userId,
      formType,
    });

    // If not found, create with defaults
    if (!formSettings) {
      const defaultSections =
        formType === "dermatology"
          ? defaultDermatologyForm
          : defaultCosmetologyForm;

      formSettings = await FormSettings.create({
        userId: authUser.userId,
        formType,
        sections: defaultSections,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sections: formSettings.sections,
      },
    });
  } catch (error: any) {
    console.error("Get form settings error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch form settings",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// PUT: Update form settings
export async function PUT(request: NextRequest) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        { success: false, message: "This endpoint is only for Tier 2 users" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { formType, sections } = body;

    if (!formType || !["dermatology", "cosmetology"].includes(formType)) {
      return NextResponse.json(
        { success: false, message: "Invalid form type" },
        { status: 400 }
      );
    }

    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json(
        { success: false, message: "Invalid sections data" },
        { status: 400 }
      );
    }

    await connectDB();

    // Update or create form settings
    const formSettings = await FormSettings.findOneAndUpdate(
      {
        userId: authUser.userId,
        formType,
      },
      {
        sections,
        lastModified: new Date(),
      },
      {
        new: true,
        upsert: true,
      }
    );

    return NextResponse.json({
      success: true,
      message: "Form settings updated successfully",
      data: {
        sections: formSettings.sections,
      },
    });
  } catch (error: any) {
    console.error("Update form settings error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update form settings",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
