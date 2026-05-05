import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/jwt", () => ({
  verifyToken: vi.fn(),
  verifyFrontdeskToken: vi.fn(),
  extractTokenFromHeader: vi.fn(),
}));

vi.mock("@/models/Clinic", () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("@/models/FrontdeskStaff", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("@/models/TokenBlacklist", () => ({
  default: { exists: vi.fn() },
}));

import { verifyTier2Request, hasPermission, AuthResult } from "../../../lib/auth/verify-request";
import { verifyToken, verifyFrontdeskToken, extractTokenFromHeader } from "@/lib/auth/jwt";
import Clinic from "@/models/Clinic";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import TokenBlacklist from "@/models/TokenBlacklist";
import { NextRequest } from "next/server";

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("Authorization", authHeader);
  return new NextRequest("http://localhost:3000/api/test", { headers });
}

describe("verifyTier2Request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (TokenBlacklist.exists as any).mockResolvedValue(null);
  });

  it("returns 401 when no token in header", async () => {
    (extractTokenFromHeader as any).mockReturnValue(null);

    const result = await verifyTier2Request(makeRequest());
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toContain("Authorization token required");
  });

  it("returns 401 when token is blacklisted (revoked)", async () => {
    (extractTokenFromHeader as any).mockReturnValue("token123");
    (verifyToken as any).mockReturnValue({ userId: "u1", tier: "tier2", jti: "jti-1" });
    (verifyFrontdeskToken as any).mockReturnValue(null);
    (TokenBlacklist.exists as any).mockResolvedValue({ _id: "bl1" });

    const result = await verifyTier2Request(makeRequest("Bearer token123"));
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toContain("revoked");
  });

  it("returns success for valid doctor token", async () => {
    (extractTokenFromHeader as any).mockReturnValue("doc-token");
    (verifyToken as any).mockReturnValue({ userId: "u1", email: "doc@test.com", tier: "tier2", jti: "jti-2" });
    (verifyFrontdeskToken as any).mockReturnValue(null);
    (Clinic.findOne as any).mockResolvedValue({ _id: "c1", clinicName: "MyClinic", doctorId: "u1" });

    const result = await verifyTier2Request(makeRequest("Bearer doc-token"));
    expect(result.success).toBe(true);
    expect(result.role).toBe("doctor");
    expect(result.userId).toBe("u1");
    expect(result.clinicId).toBe("c1");
    expect(result.clinicName).toBe("MyClinic");
    expect(result.permissions!.appointments).toBe(true);
  });

  it("returns 404 when doctor has no clinic", async () => {
    (extractTokenFromHeader as any).mockReturnValue("doc-token");
    (verifyToken as any).mockReturnValue({ userId: "u1", tier: "tier2", jti: "jti-3" });
    (verifyFrontdeskToken as any).mockReturnValue(null);
    (Clinic.findOne as any).mockResolvedValue(null);

    const result = await verifyTier2Request(makeRequest("Bearer doc-token"));
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toContain("Clinic not found");
  });

  it("returns success for valid frontdesk token", async () => {
    (extractTokenFromHeader as any).mockReturnValue("fd-token");
    (verifyToken as any).mockReturnValue(null);
    (verifyFrontdeskToken as any).mockReturnValue({
      staffId: "s1",
      email: "fd@test.com",
      role: "frontdesk",
      clinicId: "c1",
      doctorId: "d1",
      jti: "jti-4",
    });
    (FrontdeskStaff.findById as any).mockResolvedValue({
      _id: "s1",
      name: "FD Staff",
      status: "active",
      permissions: { appointments: true, patients: true, pharmacy: false, sales: false, reports: false },
    });
    (Clinic.findById as any).mockResolvedValue({ clinicName: "ClinicX" });

    const result = await verifyTier2Request(makeRequest("Bearer fd-token"));
    expect(result.success).toBe(true);
    expect(result.role).toBe("frontdesk");
    expect(result.userId).toBe("s1");
    expect(result.name).toBe("FD Staff");
    expect(result.permissions!.pharmacy).toBe(false);
  });

  it("returns 403 when frontdesk staff is inactive", async () => {
    (extractTokenFromHeader as any).mockReturnValue("fd-token");
    (verifyToken as any).mockReturnValue(null);
    (verifyFrontdeskToken as any).mockReturnValue({
      staffId: "s1",
      email: "fd@test.com",
      role: "frontdesk",
      clinicId: "c1",
      doctorId: "d1",
      jti: "jti-5",
    });
    (FrontdeskStaff.findById as any).mockResolvedValue({ _id: "s1", status: "inactive" });
    (Clinic.findById as any).mockResolvedValue({ clinicName: "ClinicX" });

    const result = await verifyTier2Request(makeRequest("Bearer fd-token"));
    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain("deactivated");
  });

  it("returns 403 when frontdesk staff not found", async () => {
    (extractTokenFromHeader as any).mockReturnValue("fd-token");
    (verifyToken as any).mockReturnValue(null);
    (verifyFrontdeskToken as any).mockReturnValue({
      staffId: "s1",
      email: "fd@test.com",
      role: "frontdesk",
      clinicId: "c1",
      doctorId: "d1",
      jti: "jti-6",
    });
    (FrontdeskStaff.findById as any).mockResolvedValue(null);
    (Clinic.findById as any).mockResolvedValue({ clinicName: "ClinicX" });

    const result = await verifyTier2Request(makeRequest("Bearer fd-token"));
    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
  });

  it("returns 401 when both doctor and frontdesk verification fail", async () => {
    (extractTokenFromHeader as any).mockReturnValue("bad-token");
    (verifyToken as any).mockReturnValue(null);
    (verifyFrontdeskToken as any).mockReturnValue(null);

    const result = await verifyTier2Request(makeRequest("Bearer bad-token"));
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toContain("Invalid or expired token");
  });

  it("skips blacklist check when no jti present", async () => {
    (extractTokenFromHeader as any).mockReturnValue("no-jti-token");
    (verifyToken as any).mockReturnValue(null);
    (verifyFrontdeskToken as any).mockReturnValue(null);

    await verifyTier2Request(makeRequest("Bearer no-jti-token"));
    expect(TokenBlacklist.exists).not.toHaveBeenCalled();
  });
});

describe("hasPermission", () => {
  const fullAccess: AuthResult = {
    success: true,
    userId: "u1",
    email: "doc@test.com",
    clinicId: "c1",
    role: "doctor",
    permissions: {
      appointments: true,
      patients: true,
      pharmacy: true,
      sales: true,
      reports: true,
    },
  };

  const limitedAccess: AuthResult = {
    success: true,
    userId: "s1",
    email: "fd@test.com",
    clinicId: "c1",
    role: "frontdesk",
    permissions: {
      appointments: true,
      patients: true,
      pharmacy: false,
      sales: false,
      reports: false,
    },
  };

  it("returns true when user has the requested permission", () => {
    expect(hasPermission(fullAccess, "appointments")).toBe(true);
    expect(hasPermission(fullAccess, "pharmacy")).toBe(true);
    expect(hasPermission(fullAccess, "reports")).toBe(true);
  });

  it("returns false when user lacks the requested permission", () => {
    expect(hasPermission(limitedAccess, "pharmacy")).toBe(false);
    expect(hasPermission(limitedAccess, "sales")).toBe(false);
    expect(hasPermission(limitedAccess, "reports")).toBe(false);
  });

  it("returns true for permissions the limited user does have", () => {
    expect(hasPermission(limitedAccess, "appointments")).toBe(true);
    expect(hasPermission(limitedAccess, "patients")).toBe(true);
  });

  it("returns false when auth was unsuccessful", () => {
    const failed: AuthResult = { success: false, error: "Invalid token", status: 401 };
    expect(hasPermission(failed, "appointments")).toBe(false);
  });

  it("returns false when permissions object is missing", () => {
    const noPerms: AuthResult = { success: true, userId: "u1", email: "a@b.com" };
    expect(hasPermission(noPerms, "appointments")).toBe(false);
  });
});
