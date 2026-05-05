import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson } from "../_helpers";

process.env.JWT_SECRET = "test-jwt-secret-key";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));
vi.mock("@/lib/email/sender", () => ({
  sendAccountLockedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Clinic", () => ({}));
vi.mock("@/models/User", () => ({}));

const mockStaff = {
  _id: { toString: () => "staff1" },
  staffId: "FD001",
  email: "fd@test.com",
  name: "Staff A",
  phone: "9876543210",
  password: "hashed-pw",
  status: "active",
  loginAttempts: 0,
  lockedUntil: undefined as Date | undefined,
  lastLogin: undefined as Date | undefined,
  refreshTokenVersion: 0,
  permissions: { appointments: true, patients: true, pharmacy: false, sales: false, reports: false },
  clinicId: { _id: { toString: () => "clinic1" }, clinicName: "TestClinic" },
  doctorId: { _id: { toString: () => "doc1" }, name: "Dr. Test", email: "doc@test.com" },
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/FrontdeskStaff", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn(),
      }),
    }),
  },
}));

import { rateLimit } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import { POST } from "@/app/api/auth/frontdesk/login/route";

function setupStaffMock(staff: any) {
  (FrontdeskStaff.findOne as any).mockReturnValue({
    populate: vi.fn().mockReturnValue({
      populate: vi.fn().mockResolvedValue(staff),
    }),
  });
}

describe("POST /api/auth/frontdesk/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (rateLimit as any).mockReturnValue({ success: true });
    (bcrypt.compare as any).mockResolvedValue(true);
    setupStaffMock({ ...mockStaff, save: vi.fn() });
  });

  it("returns 429 when rate limited", async () => {
    (rateLimit as any).mockReturnValue({ success: false });
    const res = await POST(postRequest("/api/auth/frontdesk/login", { email: "fd@test.com", password: "pass" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(postRequest("/api/auth/frontdesk/login", { email: "not-email", password: "pass" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is empty", async () => {
    const res = await POST(postRequest("/api/auth/frontdesk/login", { email: "fd@test.com", password: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when staff not found", async () => {
    setupStaffMock(null);
    const res = await POST(postRequest("/api/auth/frontdesk/login", { email: "unknown@test.com", password: "pass" }));
    expect(res.status).toBe(401);
  });

  it("returns 423 when account is locked", async () => {
    setupStaffMock({
      ...mockStaff,
      lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
      save: vi.fn(),
    });
    const res = await POST(postRequest("/api/auth/frontdesk/login", { email: "fd@test.com", password: "pass" }));
    expect(res.status).toBe(423);
  });

  it("returns 403 when account is deactivated", async () => {
    setupStaffMock({ ...mockStaff, status: "inactive", save: vi.fn() });
    const res = await POST(postRequest("/api/auth/frontdesk/login", { email: "fd@test.com", password: "pass" }));
    expect(res.status).toBe(403);
  });

  it("returns 401 and increments attempts on wrong password", async () => {
    (bcrypt.compare as any).mockResolvedValue(false);
    const saveFn = vi.fn();
    setupStaffMock({ ...mockStaff, loginAttempts: 0, save: saveFn });

    const res = await POST(postRequest("/api/auth/frontdesk/login", { email: "fd@test.com", password: "wrong" }));
    expect(res.status).toBe(401);
    expect(saveFn).toHaveBeenCalled();
  });

  it("locks account after 5 failed attempts", async () => {
    (bcrypt.compare as any).mockResolvedValue(false);
    const saveFn = vi.fn();
    const staff = { ...mockStaff, loginAttempts: 4, save: saveFn };
    setupStaffMock(staff);

    const res = await POST(postRequest("/api/auth/frontdesk/login", { email: "fd@test.com", password: "wrong" }));
    expect(res.status).toBe(423);
  });

  it("returns tokens on successful login", async () => {
    const saveFn = vi.fn();
    setupStaffMock({ ...mockStaff, save: saveFn });

    const res = await POST(postRequest("/api/auth/frontdesk/login", { email: "fd@test.com", password: "correct" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(body.data.staff.role).toBe("frontdesk");
    expect(saveFn).toHaveBeenCalled();
  });
});
