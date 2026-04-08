import { NextRequest, NextResponse } from "next/server";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { connectDB } from "@/lib/db/connection";
import FormSettings from "@/models/FormSettings";
import {
  defaultDermatologyForm,
  defaultCosmetologyForm,
} from "@/lib/defaultFormConfig";
import { IFormSection } from "@/models/FormSettings";

// Sync saved settings with defaults: add missing fields/sections, remove deprecated ones
function mergeWithDefaults(saved: any[], defaults: IFormSection[]): { merged: any[]; changed: boolean } {
  let changed = false;
  const merged = saved.map((section: any) => ({ ...section, fields: [...section.fields] }));

  for (const defaultSection of defaults) {
    const existingSection = merged.find((s: any) => s.sectionName === defaultSection.sectionName);
    if (!existingSection) {
      merged.push({ ...defaultSection });
      changed = true;
    } else {
      // Add missing fields
      for (const defaultField of defaultSection.fields) {
        const existingField = existingSection.fields.find(
          (f: any) => f.fieldName === defaultField.fieldName
        );
        if (!existingField) {
          existingSection.fields.push({ ...defaultField });
          changed = true;
        }
      }
      // Remove fields no longer in defaults (but keep custom user-added fields)
      const defaultFieldNames = defaultSection.fields.map((f) => f.fieldName);
      const before = existingSection.fields.length;
      existingSection.fields = existingSection.fields.filter(
        (f: any) => defaultFieldNames.includes(f.fieldName) || f.custom
      );
      if (existingSection.fields.length !== before) changed = true;
    }
  }

  return { merged, changed };
}

// GET: Fetch form settings
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
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

    const defaultSections =
      formType === "dermatology"
        ? defaultDermatologyForm
        : defaultCosmetologyForm;

    // Try to find existing settings
    let formSettings = await FormSettings.findOne({
      userId: auth.userId,
      formType,
    });

    // If not found, create with defaults
    if (!formSettings) {
      formSettings = await FormSettings.create({
        userId: auth.userId,
        formType,
        sections: defaultSections,
      });
    } else {
      // Merge any new default fields into saved settings
      const { merged, changed } = mergeWithDefaults(
        formSettings.toObject().sections,
        defaultSections
      );
      if (changed) {
        formSettings.sections = merged;
        await formSettings.save();
      }
    }

    const plain = formSettings.toObject();
    plain.sections = plain.sections.map((section: any) => ({
      ...section,
      fields: section.fields.map((field: any) =>
        field.fieldName === "severity" && field.type === "select"
          ? { ...field, type: "text", options: undefined, placeholder: "e.g. Mild, Moderate, Severe" }
          : field
      ),
    }));

    return NextResponse.json({
      success: true,
      data: { sections: plain.sections },
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
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
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
        userId: auth.userId,
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
