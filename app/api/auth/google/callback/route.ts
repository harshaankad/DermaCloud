import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { generateToken, generateFrontdeskToken } from "@/lib/auth/jwt";
import User from "@/models/User";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import "@/models/Clinic"; // Ensure Clinic model is registered for populate

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
  : "http://localhost:3000/api/auth/google/callback";

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture: string;
  email_verified: boolean;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const role = request.nextUrl.searchParams.get("state") || "doctor";

  if (!code) {
    return NextResponse.redirect(
      new URL(`${role === "frontdesk" ? "/frontdesk" : ""}/login?error=no_code`, request.url)
    );
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData: GoogleTokenResponse = await tokenRes.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        new URL(`${role === "frontdesk" ? "/frontdesk" : ""}/login?error=token_failed`, request.url)
      );
    }

    // Get user info from Google
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleUser: GoogleUserInfo = await userRes.json();

    if (!googleUser.email) {
      return NextResponse.redirect(
        new URL(`${role === "frontdesk" ? "/frontdesk" : ""}/login?error=no_email`, request.url)
      );
    }

    await connectDB();

    if (role === "frontdesk") {
      return handleFrontdeskGoogleLogin(googleUser, request);
    }

    return handleDoctorGoogleLogin(googleUser, request);
  } catch (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(
      new URL(`${role === "frontdesk" ? "/frontdesk" : ""}/login?error=oauth_failed`, request.url)
    );
  }
}

async function handleDoctorGoogleLogin(googleUser: GoogleUserInfo, request: NextRequest) {
  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ googleId: googleUser.sub }, { email: googleUser.email }],
  });

  // Existing user with active subscription → normal login
  if (existingUser && existingUser.subscriptionStatus === "active") {
    // Link Google account if not already linked
    if (!existingUser.googleId) {
      existingUser.googleId = googleUser.sub;
      existingUser.authProvider = "google";
      await existingUser.save();
    }

    const token = generateToken({
      userId: existingUser._id.toString(),
      email: existingUser.email,
      tier: existingUser.tier,
      clinicId: existingUser.clinicId?.toString(),
    });

    const userData = JSON.stringify({
      id: existingUser._id,
      email: existingUser.email,
      name: existingUser.name,
      tier: existingUser.tier,
      clinicId: existingUser.clinicId?.toString(),
      phone: existingUser.phone,
    });

    const callbackUrl = new URL("/auth/google/callback", request.url);
    callbackUrl.searchParams.set("token", token);
    callbackUrl.searchParams.set("user", userData);
    callbackUrl.searchParams.set("role", "doctor");
    return NextResponse.redirect(callbackUrl);
  }

  // New user or no active subscription → redirect to login with error
  return NextResponse.redirect(
    new URL("/login?error=not_registered", request.url)
  );
}

async function handleFrontdeskGoogleLogin(googleUser: GoogleUserInfo, request: NextRequest) {
  // Frontdesk staff must already exist (created by doctor)
  const staff = await FrontdeskStaff.findOne({
    $or: [{ googleId: googleUser.sub }, { email: googleUser.email }],
  })
    .populate("clinicId", "clinicName")
    .populate("doctorId", "name email");

  if (!staff) {
    return NextResponse.redirect(
      new URL("/frontdesk/login?error=not_registered", request.url)
    );
  }

  if (staff.status !== "active") {
    return NextResponse.redirect(
      new URL("/frontdesk/login?error=inactive", request.url)
    );
  }

  // Link Google account if not already linked
  if (!staff.googleId) {
    staff.googleId = googleUser.sub;
    staff.authProvider = "google";
    await staff.save();
  }

  staff.lastLogin = new Date();
  await staff.save();

  const clinic = staff.clinicId as any;
  const doctor = staff.doctorId as any;

  const token = generateFrontdeskToken({
    staffId: staff._id.toString(),
    email: staff.email,
    role: "frontdesk",
    clinicId: clinic._id.toString(),
    doctorId: doctor._id.toString(),
  });

  const staffData = JSON.stringify({
    id: staff._id,
    staffId: staff.staffId,
    name: staff.name,
    email: staff.email,
    clinicId: clinic._id.toString(),
    clinicName: clinic.clinicName,
    doctorId: doctor._id.toString(),
    doctorName: doctor.name,
    permissions: staff.permissions,
  });

  const callbackUrl = new URL("/auth/google/callback", request.url);
  callbackUrl.searchParams.set("token", token);
  callbackUrl.searchParams.set("user", staffData);
  callbackUrl.searchParams.set("role", "frontdesk");

  return NextResponse.redirect(callbackUrl);
}
