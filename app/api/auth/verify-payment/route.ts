import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import Subscription from "@/models/Subscription";
import User from "@/models/User";
import Clinic from "@/models/Clinic";
import { generateToken } from "@/lib/auth/jwt";
import { sendWelcomeEmail } from "@/lib/email/sender";
import { z } from "zod";

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
  plan: z.enum(["monthly", "yearly"]),
  // User data — user is created here after payment
  userData: z.object({
    email: z.string().email(),
    name: z.string().min(2),
    password: z.string().min(8).optional(), // Optional for Google signup
    phone: z.string().optional(),
    clinicName: z.string().min(2),
    googleId: z.string().optional(), // For Google signup
  }),
});

const PLANS = {
  monthly: { amount: 2500 },
  yearly: { amount: 25000 },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationResult = verifyPaymentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, message: "Validation failed", errors: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, plan, userData } =
      validationResult.data;

    await connectDB();

    // Verify Razorpay signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return NextResponse.json(
        { success: false, message: "Payment verification failed. Invalid signature." },
        { status: 400 }
      );
    }

    // Check if user already exists (prevent duplicate creation)
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      return NextResponse.json(
        { success: false, message: "User with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password if provided (email signup)
    let hashedPassword;
    if (userData.password) {
      hashedPassword = await bcrypt.hash(userData.password, 10);
    }

    // Create user
    const user = await User.create({
      email: userData.email,
      name: userData.name,
      password: hashedPassword,
      phone: userData.phone,
      tier: "tier2",
      isVerified: true,
      googleId: userData.googleId,
      authProvider: userData.googleId ? "google" : "local",
      subscriptionStatus: "active",
    });

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    if (plan === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // Create subscription
    const subscription = await Subscription.create({
      userId: user._id,
      plan,
      amount: PLANS[plan].amount,
      status: "active",
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      startDate,
      endDate,
    });

    // Update user with subscription reference
    user.subscriptionId = subscription._id as any;
    await user.save();

    // Create clinic
    const clinic = await Clinic.create({
      doctorId: user._id,
      clinicName: userData.clinicName,
      phone: userData.phone,
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
        showDermoscopeFindings: false,
        showProvisionalDiagnosis: true,
        showDifferentialDiagnosis: true,
        showInvestigations: true,
        showTreatmentPlan: true,
        showFollowUp: true,
        showAdvice: true,
      },
      cosmetologyCustomFields: [],
    });

    user.clinicId = clinic._id as any;
    await user.save();

    // Generate JWT token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      tier: user.tier,
      clinicId: clinic._id.toString(),
    });

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user.email, user.name, user.tier).catch((error) =>
      console.error("Failed to send welcome email:", error)
    );

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully!",
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          tier: user.tier,
          clinicId: clinic._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return NextResponse.json(
      { success: false, message: "Payment verification failed" },
      { status: 500 }
    );
  }
}
