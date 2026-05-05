import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson } from "../_helpers";

process.env.JWT_SECRET = "test-jwt-secret-key";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email/sender", () => ({ sendAccountLockedEmail: vi.fn().mockResolvedValue(undefined) }));

const mockUser = {
  _id: { toString: () => "user1" },
  email: "doc@test.com",
  password: "$2a$10$hashedpassword",
  name: "Dr. Test",
  tier: "tier2",
  isVerified: true,
  loginAttempts: 0,
  lockedUntil: undefined,
  clinicId: { toString: () => "clinic1" },
  phone: "9876543210",
  refreshTokenVersion: 0,
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/User", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true, remaining: 9, resetAt: Date.now() + 60000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import User from "@/models/User";
import bcrypt from "bcryptjs";
import { rateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/auth/login/route";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.loginAttempts = 0;
    mockUser.lockedUntil = undefined;
    mockUser.isVerified = true;
  });

  it("returns 200 with tokens on successful login", async () => {
    (User.findOne as any).mockResolvedValue({ ...mockUser });
    (bcrypt.compare as any).mockResolvedValue(true);

    const req = postRequest("/api/auth/login", { email: "doc@test.com", password: "Secret@123" });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(body.data.user.email).toBe("doc@test.com");
  });

  it("returns 400 for invalid email format", async () => {
    const req = postRequest("/api/auth/login", { email: "not-an-email", password: "Secret@123" });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when password is missing", async () => {
    const req = postRequest("/api/auth/login", { email: "doc@test.com", password: "" });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 401 when user is not found", async () => {
    (User.findOne as any).mockResolvedValue(null);

    const req = postRequest("/api/auth/login", { email: "nobody@test.com", password: "Secret@123" });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.message).toContain("Invalid email or password");
  });

  it("returns 401 with remaining attempts on wrong password", async () => {
    const user = { ...mockUser, loginAttempts: 0, save: vi.fn() };
    (User.findOne as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(false);

    const req = postRequest("/api/auth/login", { email: "doc@test.com", password: "Wrong@123" });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.message).toContain("attempt(s) remaining");
    expect(user.save).toHaveBeenCalled();
  });

  it("returns 423 when account is locked", async () => {
    const user = { ...mockUser, lockedUntil: new Date(Date.now() + 30 * 60 * 1000) };
    (User.findOne as any).mockResolvedValue(user);

    const req = postRequest("/api/auth/login", { email: "doc@test.com", password: "Secret@123" });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(423);
    expect(body.message).toContain("Account locked");
  });

  it("locks account after 5 failed attempts", async () => {
    const user = { ...mockUser, loginAttempts: 4, save: vi.fn() };
    (User.findOne as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(false);

    const req = postRequest("/api/auth/login", { email: "doc@test.com", password: "Wrong@123" });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(423);
    expect(body.message).toContain("Too many failed attempts");
    expect(user.lockedUntil).toBeDefined();
  });

  it("returns 403 when user is not verified", async () => {
    const user = { ...mockUser, isVerified: false };
    (User.findOne as any).mockResolvedValue(user);

    const req = postRequest("/api/auth/login", { email: "doc@test.com", password: "Secret@123" });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.message).toContain("verify your email");
  });

  it("returns 429 when rate limited", async () => {
    (rateLimit as any).mockReturnValueOnce({ success: false, remaining: 0, resetAt: Date.now() + 60000 });

    const req = postRequest("/api/auth/login", { email: "doc@test.com", password: "Secret@123" });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.message).toContain("Too many login attempts");
  });

  it("resets login attempts on successful login", async () => {
    const user = { ...mockUser, loginAttempts: 3, save: vi.fn() };
    (User.findOne as any).mockResolvedValue(user);
    (bcrypt.compare as any).mockResolvedValue(true);

    const req = postRequest("/api/auth/login", { email: "doc@test.com", password: "Secret@123" });
    await POST(req);

    expect(user.loginAttempts).toBe(0);
    expect(user.lockedUntil).toBeUndefined();
    expect(user.save).toHaveBeenCalled();
  });
});
