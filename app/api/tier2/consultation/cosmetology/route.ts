/**
 * Tier 2 Cosmetology Consultation API
 * Handles saving and retrieving cosmetology consultations
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { connectDB } from "@/lib/db/connection";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import Patient from "@/models/Patient";
import Clinic from "@/models/Clinic";
import Appointment from "@/models/Appointment";
import { getSignedUrl } from "@/lib/aws/signed-url";
import { isValidObjectId } from "@/lib/sanitize";
import { auditLog } from "@/lib/audit";

// Helper function to generate signed URLs for images
function generateSignedUrlsForImages(images: any[]): any[] {
  if (!images || images.length === 0) return images;

  return images.map((image: any) => {
    if (image.url) {
      try {
        // Extract S3 key from the URL
        // URL format: https://bucket-name.s3.region.amazonaws.com/path/to/file
        const urlObj = new URL(image.url);
        const s3Key = urlObj.pathname.startsWith("/")
          ? urlObj.pathname.substring(1)
          : urlObj.pathname;

        console.log("Generating signed URL for key:", s3Key);

        // Generate signed URL with 1 hour expiry
        const signedUrl = getSignedUrl(s3Key, 3600);

        return {
          ...image,
          url: signedUrl,
          originalUrl: image.url, // Keep original for debugging
        };
      } catch (urlError) {
        console.error("Error generating signed URL for image:", image.url, urlError);
        return image;
      }
    }
    return image;
  });
}

// Sign all image URLs in a consultation object (top-level images + multi-issue imageUrls)
function signConsultationUrls(consultation: any): any {
  let customFields = consultation.customFields;

  if (
    customFields?._multiIssue === true &&
    Array.isArray(customFields._issues)
  ) {
    customFields = {
      ...customFields,
      _issues: customFields._issues.map((issue: any, idx: number) => {
        if (idx === 0 || !Array.isArray(issue.imageUrls) || issue.imageUrls.length === 0) {
          return issue;
        }
        return {
          ...issue,
          imageUrls: issue.imageUrls.map((url: string) => {
            try {
              const urlObj = new URL(url);
              const s3Key = urlObj.pathname.startsWith("/")
                ? urlObj.pathname.substring(1)
                : urlObj.pathname;
              return getSignedUrl(s3Key, 3600);
            } catch {
              return url;
            }
          }),
        };
      }),
    };
  }

  return {
    ...consultation,
    images: generateSignedUrlsForImages(consultation.images),
    customFields,
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const {
      patientId,
      appointmentId, // Optional - links to frontdesk appointment
      formData,
      imageUrls, // Current visit photos (new approach)
      beforeImageUrls, // Legacy support
      afterImageUrls, // Legacy support
      consultationFee,
    } = body;

    if (!patientId) {
      return NextResponse.json(
        {
          success: false,
          message: "Patient ID is required",
        },
        { status: 400 }
      );
    }

    await connectDB();

    console.log("Creating cosmetology consultation for patient:", patientId);
    console.log("Form data:", formData);

    // Get patient info
    const patient = await Patient.findById(patientId);
    if (!patient) {
      console.log("Patient not found:", patientId);
      return NextResponse.json(
        {
          success: false,
          message: "Patient not found",
        },
        { status: 404 }
      );
    }

    console.log("Patient found:", patient.name);

    // Prepare images array - now stores visit photos without before/after distinction
    // Comparison is done across visits, not within a single visit
    const images: { url: string; uploadedAt: Date }[] = [];

    // New approach: imageUrls contains current visit photos
    if (imageUrls && imageUrls.length > 0) {
      imageUrls.forEach((url: string) => {
        images.push({
          url,
          uploadedAt: new Date(),
        });
      });
    }

    // Legacy support: if beforeImageUrls/afterImageUrls are provided, still handle them
    if (beforeImageUrls && beforeImageUrls.length > 0) {
      beforeImageUrls.forEach((url: string) => {
        images.push({
          url,
          uploadedAt: new Date(),
        });
      });
    }

    if (afterImageUrls && afterImageUrls.length > 0) {
      afterImageUrls.forEach((url: string) => {
        images.push({
          url,
          uploadedAt: new Date(),
        });
      });
    }

    console.log("Creating consultation document...");
    console.log("Images to save:", images);

    try {
      const consultation = await ConsultationCosmetology.create({
        clinicId: auth.clinicId,
        patientId: patient._id,
        doctorId: auth.userId,
        appointmentId: appointmentId || undefined, // Link to appointment if provided
        consultationDate: new Date(),
        patientInfo: {
          name: formData.patientName || patient.name,
          age: formData.patientAge || patient.age,
          gender: formData.patientGender || patient.gender,
          skinType: formData.skinType,
          primaryConcern: formData.primaryConcern,
        },
        assessment: {
          findings: formData.findings,
          diagnosis: formData.diagnosis,
          baselineEvaluation: formData.baselineEvaluation,
          contraindicationsCheck: formData.contraindicationsCheck,
        },
        procedure: {
          name: formData.procedureName || formData.name,
          goals: formData.goals,
          sessionNumber: formData.sessionNumber && !isNaN(parseInt(formData.sessionNumber))
            ? parseInt(formData.sessionNumber)
            : undefined,
          package: formData.package,
          productsAndParameters: formData.productsAndParameters,
          immediateOutcome: formData.immediateOutcome,
        },
        images,
        aftercare: {
          instructions: formData.instructions,
          homeProducts: formData.homeProducts,
          followUpDate: formData.followUpDate ? new Date(formData.followUpDate) : undefined,
          expectedResults: formData.expectedResults,
        },
        consent: {
          risksExplained: formData.risksExplained,
          consentConfirmed: formData.consentConfirmed === true || formData.consentConfirmed === "true",
        },
        customFields: formData,
        consultationFee: consultationFee != null ? Number(consultationFee) : undefined,
        status: "completed",
      });

      console.log("Cosmetology consultation created successfully with ID:", consultation._id);
      auditLog({ clinicId: auth.clinicId, userId: auth.userId, userEmail: auth.email, role: "doctor", action: "CONSULTATION_CREATE", resourceType: "consultation", resourceId: consultation._id.toString(), details: { patientId: patient._id.toString(), type: "cosmetology" } }).catch(() => {});

      // If this consultation is linked to an appointment, mark it as completed
      if (appointmentId) {
        try {
          const updatedAppointment = await Appointment.findByIdAndUpdate(
            appointmentId,
            {
              status: "completed",
              consultationId: consultation._id,
              completedAt: new Date(),
            },
            { new: true }
          );
          if (updatedAppointment) {
            console.log("Appointment marked as completed:", appointmentId);
          } else {
            console.log("Appointment not found for completion:", appointmentId);
          }
        } catch (appointmentError: any) {
          console.error("Error updating appointment status:", appointmentError.message);
          // Don't fail the whole request if appointment update fails
        }
      }

      return NextResponse.json({
        success: true,
        message: "Consultation saved successfully",
        data: {
          consultationId: consultation._id,
          patientId: patient._id,
          patientName: patient.name,
          appointmentCompleted: !!appointmentId,
        },
      });
    } catch (createError: any) {
      console.error("Error creating cosmetology consultation document:", createError);
      console.error("Error details:", createError.message);
      throw createError;
    }
  } catch (error: any) {
    console.error("Save cosmetology consultation error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to save consultation",
        error: error.message,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch consultation details
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const consultationId = searchParams.get("consultationId");
    const patientId = searchParams.get("patientId");

    await connectDB();

    // Ensure models are registered for populate to work
    // This is needed because Mongoose requires models to be referenced
    void Patient;
    void Clinic;

    // If consultationId is provided, fetch single consultation
    if (consultationId) {
      if (!isValidObjectId(consultationId)) {
        return NextResponse.json(
          { success: false, message: "Invalid consultation ID" },
          { status: 400 }
        );
      }
      console.log("Fetching cosmetology consultation with ID:", consultationId);

      const consultation = await ConsultationCosmetology.findById(consultationId)
        .populate("patientId", "name patientId age gender phone")
        .populate("clinicId", "clinicName address phone email");

      if (!consultation) {
        console.log("Consultation not found");
        return NextResponse.json(
          {
            success: false,
            message: "Consultation not found",
          },
          { status: 404 }
        );
      }

      console.log("Consultation found, images:", consultation.images);

      // Convert to plain object to allow modification
      const consultationObj = consultation.toObject();

      const signedObj = signConsultationUrls(consultationObj);

      return NextResponse.json({
        success: true,
        data: signedObj,
      });
    }

    // If patientId is provided, fetch all consultations for that patient
    if (patientId) {
      console.log("Fetching cosmetology consultations for patient:", patientId);

      const consultations = await ConsultationCosmetology.find({
        patientId,
        clinicId: auth.clinicId,
      })
        .sort({ consultationDate: -1 })
        .lean();

      const consultationsWithSignedUrls = consultations.map(signConsultationUrls);

      return NextResponse.json({
        success: true,
        data: consultationsWithSignedUrls,
      });
    }

    // Fetch all consultations for the clinic
    const consultations = await ConsultationCosmetology.find({
      clinicId: auth.clinicId,
    })
      .sort({ consultationDate: -1 })
      .limit(50)
      .populate("patientId", "name patientId")
      .lean();

    const consultationsWithSignedUrls = consultations.map(signConsultationUrls);

    return NextResponse.json({
      success: true,
      data: consultationsWithSignedUrls,
    });
  } catch (error: any) {
    console.error("Get cosmetology consultation error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch consultation",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
