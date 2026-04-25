import { NextRequest } from "next/server";
import { verifyToken, verifyFrontdeskToken, extractTokenFromHeader, JWTPayload, FrontdeskJWTPayload } from "./jwt";
import { connectDB } from "@/lib/db/connection";
import Clinic from "@/models/Clinic";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import TokenBlacklist from "@/models/TokenBlacklist";

export interface AuthResult {
  success: boolean;
  error?: string;
  status?: number;
  userId?: string;
  email?: string;
  clinicId?: string;
  clinicName?: string;
  doctorId?: string;
  role?: "doctor" | "frontdesk";
  name?: string;
  permissions?: {
    appointments: boolean;
    patients: boolean;
    pharmacy: boolean;
    sales: boolean;
    reports: boolean;
  };
}

/**
 * Verify request from either doctor (tier2) or frontdesk staff
 * Returns clinicId and role information
 */
export async function verifyTier2Request(request: NextRequest): Promise<AuthResult> {
  const token = extractTokenFromHeader(request.headers.get("Authorization"));

  if (!token) {
    return {
      success: false,
      error: "Authorization token required",
      status: 401,
    };
  }

  await connectDB();

  // Decode once — both functions use the same secret but filter by different fields
  const doctorPayload = verifyToken(token);
  const frontdeskPayload = verifyFrontdeskToken(token);

  // Check token blacklist (logout revocation)
  const jtiToCheck = doctorPayload?.jti ?? frontdeskPayload?.jti;
  if (jtiToCheck) {
    const blacklisted = await TokenBlacklist.exists({ jti: jtiToCheck });
    if (blacklisted) {
      return { success: false, error: "Token has been revoked. Please log in again.", status: 401 };
    }
  }

  // Try to verify as doctor first
  if (doctorPayload && doctorPayload.tier === "tier2") {
    // Get clinic for the doctor
    const clinic = await Clinic.findOne({ doctorId: doctorPayload.userId });
    if (!clinic) {
      return {
        success: false,
        error: "Clinic not found",
        status: 404,
      };
    }

    return {
      success: true,
      userId: doctorPayload.userId,
      email: doctorPayload.email,
      clinicId: clinic._id.toString(),
      clinicName: clinic.clinicName,
      doctorId: doctorPayload.userId,
      role: "doctor",
      name: "Doctor", // Can be enhanced to fetch actual name
      permissions: {
        appointments: true,
        patients: true,
        pharmacy: true,
        sales: true,
        reports: true,
      },
    };
  }

  // Try to verify as frontdesk
  if (frontdeskPayload) {
    // Verify staff is still active
    const [staff, fdClinic] = await Promise.all([
      FrontdeskStaff.findById(frontdeskPayload.staffId),
      Clinic.findById(frontdeskPayload.clinicId, { clinicName: 1 }),
    ]);
    if (!staff || staff.status !== "active") {
      return {
        success: false,
        error: "Account deactivated or not found",
        status: 403,
      };
    }

    return {
      success: true,
      userId: frontdeskPayload.staffId,
      email: frontdeskPayload.email,
      clinicId: frontdeskPayload.clinicId,
      clinicName: fdClinic?.clinicName,
      doctorId: frontdeskPayload.doctorId,
      role: "frontdesk",
      name: staff.name,
      permissions: staff.permissions,
    };
  }

  return {
    success: false,
    error: "Invalid or expired token",
    status: 401,
  };
}

/**
 * Check if user has specific permission
 */
export function hasPermission(auth: AuthResult, permission: keyof NonNullable<AuthResult["permissions"]>): boolean {
  if (!auth.success || !auth.permissions) return false;
  return auth.permissions[permission] === true;
}
