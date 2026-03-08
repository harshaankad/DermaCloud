/**
 * Tier 2 Consultation Templates API
 * Handles CRUD operations for consultation templates
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { connectDB } from "@/lib/db/connection";
import ConsultationTemplate from "@/models/ConsultationTemplate";
import { auditLog } from "@/lib/audit";

// GET - Fetch all templates for the clinic
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const templateType = searchParams.get("templateType"); // NEW: Filter by type
    const activeOnly = searchParams.get("activeOnly") !== "false";

    // Build query
    const query: any = { clinicId: auth.clinicId };
    if (activeOnly) {
      query.isActive = true;
    }
    if (category) {
      query.category = category;
    }
    if (templateType) {
      query.templateType = templateType;
    }

    const templates = await ConsultationTemplate.find(query)
      .sort({ templateType: 1, category: 1, name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    console.error("Get templates error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch templates", error: error.message },
      { status: 500 }
    );
  }
}

// POST - Create a new template
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, category, templateType, templateData } = body;

    if (!name || !templateData) {
      return NextResponse.json(
        { success: false, message: "Template name and data are required" },
        { status: 400 }
      );
    }

    await connectDB();

    const template = await ConsultationTemplate.create({
      clinicId: auth.clinicId,
      createdBy: auth.userId,
      name,
      description,
      category,
      templateType: templateType || "dermatology", // Default to dermatology
      templateData,
      isActive: true,
    });

    auditLog({ clinicId: auth.clinicId, userId: auth.userId, userEmail: auth.email, role: "doctor", action: "TEMPLATE_CREATE", resourceType: "template", resourceId: template._id.toString(), details: { name } }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Template created successfully",
      data: template,
    });
  } catch (error: any) {
    console.error("Create template error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create template", error: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update a template
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
    const { templateId, name, description, category, templateType, templateData, isActive } = body;

    if (!templateId) {
      return NextResponse.json(
        { success: false, message: "Template ID is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const template = await ConsultationTemplate.findOne({
      _id: templateId,
      clinicId: auth.clinicId,
    });

    if (!template) {
      return NextResponse.json(
        { success: false, message: "Template not found" },
        { status: 404 }
      );
    }

    // Update fields
    if (name !== undefined) template.name = name;
    if (description !== undefined) template.description = description;
    if (category !== undefined) template.category = category;
    if (templateType !== undefined) template.templateType = templateType;
    if (templateData !== undefined) template.templateData = templateData;
    if (isActive !== undefined) template.isActive = isActive;

    await template.save();

    return NextResponse.json({
      success: true,
      message: "Template updated successfully",
      data: template,
    });
  } catch (error: any) {
    console.error("Update template error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update template", error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete a template
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get("templateId");

    if (!templateId) {
      return NextResponse.json(
        { success: false, message: "Template ID is required" },
        { status: 400 }
      );
    }

    await connectDB();

    const result = await ConsultationTemplate.deleteOne({
      _id: templateId,
      clinicId: auth.clinicId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Template not found" },
        { status: 404 }
      );
    }

    auditLog({ clinicId: auth.clinicId, userId: auth.userId, userEmail: auth.email, role: "doctor", action: "TEMPLATE_DELETE", resourceType: "template", resourceId: templateId }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete template error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete template", error: error.message },
      { status: 500 }
    );
  }
}
