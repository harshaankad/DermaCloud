import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson } from "../_helpers";

process.env.JWT_SECRET = "test-jwt-secret-key";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-key";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

const mockUser = {
  _id: { toString: () => "user1" },
  email: "doc@test.com",
  tier: "tier2",
  isVerified: true,
  refreshTokenVersion: 0,
  clinicId: { toString: () => "clinic1" },
  save: vi.fn(),
};

vi.mock("@/models/User", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("@/models/FrontdeskStaff", () => ({
  default: { findById: vi.fn() },
}));

import User from "@/models/User";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import { generateRefreshToken } from "@/lib/auth/jwt";
import { POST } from "@/app/api/auth/refresh/route";

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.refreshTokenVersion = 0;
  });

  it("returns 401 when no refresh token provided", async () => {
    const res = await POST(postRequest("/api/auth/refresh", {}));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.message).toContain("Refresh token required");
  });

  it("returns 401 for an invalid refresh token", async () => {
    const res = await POST(postRequest("/api/auth/refresh", { refreshToken: "invalid.token" }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.message).toContain("Invalid or expired");
  });

  it("returns new tokens on valid refresh", async () => {
    const refreshToken = generateRefreshToken("user1", "doc@test.com", 0);
    (User.findById as any).mockResolvedValue({ ...mockUser, save: vi.fn() });

    const res = await POST(postRequest("/api/auth/refresh", { refreshToken }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
  });

  it("returns 401 when token version doesn't match (replay attack)", async () => {
    const refreshToken = generateRefreshToken("user1", "doc@test.com", 0);
    (User.findById as any).mockResolvedValue({ ...mockUser, refreshTokenVersion: 1, save: vi.fn() });

    const res = await POST(postRequest("/api/auth/refresh", { refreshToken }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.message).toContain("already used");
  });

  it("returns 401 when user is not found", async () => {
    const refreshToken = generateRefreshToken("user1", "doc@test.com", 0);
    (User.findById as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/auth/refresh", { refreshToken }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.message).toContain("User not found");
  });

  it("returns 401 when user is not verified", async () => {
    const refreshToken = generateRefreshToken("user1", "doc@test.com", 0);
    (User.findById as any).mockResolvedValue({ ...mockUser, isVerified: false });

    const res = await POST(postRequest("/api/auth/refresh", { refreshToken }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
  });

  it("increments refreshTokenVersion after successful refresh", async () => {
    const refreshToken = generateRefreshToken("user1", "doc@test.com", 0);
    const saveFn = vi.fn();
    const user = { ...mockUser, refreshTokenVersion: 0, save: saveFn };
    (User.findById as any).mockResolvedValue(user);

    await POST(postRequest("/api/auth/refresh", { refreshToken }));

    expect(user.refreshTokenVersion).toBe(1);
    expect(saveFn).toHaveBeenCalled();
  });

  it("refreshes frontdesk token successfully", async () => {
    const refreshToken = generateRefreshToken("staff1", "fd@test.com", 0);
    const saveFn = vi.fn();
    const staff = {
      _id: { toString: () => "staff1" },
      email: "fd@test.com",
      status: "active",
      refreshTokenVersion: 0,
      clinicId: { toString: () => "clinic1" },
      doctorId: { toString: () => "doc1" },
      save: saveFn,
    };
    (FrontdeskStaff.findById as any).mockResolvedValue(staff);

    const res = await POST(postRequest("/api/auth/refresh", { refreshToken, role: "frontdesk" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(staff.refreshTokenVersion).toBe(1);
  });

  it("returns 401 when frontdesk staff is deactivated", async () => {
    const refreshToken = generateRefreshToken("staff1", "fd@test.com", 0);
    (FrontdeskStaff.findById as any).mockResolvedValue({ status: "inactive" });

    const res = await POST(postRequest("/api/auth/refresh", { refreshToken, role: "frontdesk" }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.message).toContain("not found or deactivated");
  });

  it("returns 401 for frontdesk token version mismatch", async () => {
    const refreshToken = generateRefreshToken("staff1", "fd@test.com", 0);
    (FrontdeskStaff.findById as any).mockResolvedValue({
      _id: { toString: () => "staff1" },
      status: "active",
      refreshTokenVersion: 5,
    });

    const res = await POST(postRequest("/api/auth/refresh", { refreshToken, role: "frontdesk" }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.message).toContain("already used");
  });

  it("returns 401 when frontdesk staff not found", async () => {
    const refreshToken = generateRefreshToken("staff1", "fd@test.com", 0);
    (FrontdeskStaff.findById as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/auth/refresh", { refreshToken, role: "frontdesk" }));
    expect(res.status).toBe(401);
  });
});
