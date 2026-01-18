import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import User from "@/models/User";
import Clinic from "@/models/Clinic";
import { verifyOTP } from "@/lib/auth/otp";
import { generateToken } from "@/lib/auth/jwt";
import { sendWelcomeEmail } from "@/lib/email/sender";
import { z } from "zod";

// Validation schema
const verifyOTPSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  clinicData: z
    .object({
      clinicName: z.string().min(2, "Clinic name is required"),
      address: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validationResult = verifyOTPSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Validation failed",
          errors: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { email, otp, clinicData } = validationResult.data;

    // Connect to database
    await connectDB();

    // Verify OTP
    const isValid = await verifyOTP(email, otp);
    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or expired OTP",
        },
        { status: 400 }
      );
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 404 }
      );
    }

    // Mark user as verified
    user.isVerified = true;
    await user.save();

    // If Tier 2, create clinic
    let clinicId;
    if (user.tier === "tier2" && clinicData) {
      const clinic = await Clinic.create({
        doctorId: user._id,
        clinicName: clinicData.clinicName,
        address: clinicData.address,
        phone: clinicData.phone,
        // Initialize with default settings
        dermatologyFieldSettings: {
          showChiefComplaints: true,
          showHistoryOfPresentIllness: true,
          showPastHistory: true,
          showFamilyHistory: true,
          showGeneralExamination: true,
          showSystemicExamination: true,
          showClinicalFindings: true,
          showDermoscopeFindings: true,
          showProvisionalDiagnosis: true,
          showDifferentialDiagnosis: true,
          showInvestigations: true,
          showTreatmentPlan: true,
          showFollowUp: true,
          showAdvice: true,
        },
        dermatologyCustomFields: [],
        cosmetologyFieldSettings: {
          showChiefComplaints: true,
          showHistoryOfPresentIllness: true,
          showPastHistory: true,
          showFamilyHistory: true,
          showGeneralExamination: true,
          showSystemicExamination: true,
          showClinicalFindings: true,
          showDermoscopeFindings: false, // Usually not needed for cosmetology
          showProvisionalDiagnosis: true,
          showDifferentialDiagnosis: true,
          showInvestigations: true,
          showTreatmentPlan: true,
          showFollowUp: true,
          showAdvice: true,
        },
        cosmetologyCustomFields: [],
      });

      clinicId = clinic._id;

      // Update user with clinicId
      user.clinicId = clinicId;
      await user.save();
    }

    // Generate JWT token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      tier: user.tier,
      clinicId: clinicId?.toString(),
    });

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user.email, user.name, user.tier).catch((error) =>
      console.error("Failed to send welcome email:", error)
    );

    return NextResponse.json(
      {
        success: true,
        message: "Email verified successfully!",
        data: {
          token,
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            tier: user.tier,
            clinicId: clinicId?.toString(),
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("OTP verification error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
