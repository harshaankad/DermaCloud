import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/auth/otp", () => ({
  generateOTP: vi.fn().mockReturnValue("123456"),
  storeOTP: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/email/sender", () => ({
  sendOTPEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true, remaining: 4, resetAt: Date.now() + 60000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/models/User", () => ({
  default: { findOne: vi.fn() },
}));

import User from "@/models/User";
import { sendOTPEmail } from "@/lib/email/sender";
import { rateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/auth/signup/route";

const validBody = {
  email: "new@test.com",
  password: "Secure@123",
  name: "Dr. New",
  tier: "tier2",
  clinicName: "New Clinic",
};

describe("POST /api/auth/signup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and sends OTP for valid signup", async () => {
    (User.findOne as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/auth/signup", validBody));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("new@test.com");
    expect(sendOTPEmail).toHaveBeenCalledWith("new@test.com", "123456");
  });

  it("returns 400 for weak password", async () => {
    const res = await POST(postRequest("/api/auth/signup", { ...validBody, password: "weak" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(postRequest("/api/auth/signup", { ...validBody, email: "not-email" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
  });

  it("returns 400 when name is too short", async () => {
    const res = await POST(postRequest("/api/auth/signup", { ...validBody, name: "A" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
  });

  it("returns 409 when email already exists", async () => {
    (User.findOne as any).mockResolvedValue({ email: "new@test.com" });

    const res = await POST(postRequest("/api/auth/signup", validBody));
    const body = await parseJson(res);

    expect(res.status).toBe(409);
    expect(body.message).toContain("already exists");
  });

  it("returns 400 when tier2 has no clinicName", async () => {
    (User.findOne as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/auth/signup", { ...validBody, clinicName: undefined }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Clinic name is required");
  });

  it("returns 429 when rate limited", async () => {
    (rateLimit as any).mockReturnValueOnce({ success: false, remaining: 0, resetAt: Date.now() });

    const res = await POST(postRequest("/api/auth/signup", validBody));
    const body = await parseJson(res);

    expect(res.status).toBe(429);
  });

  it("returns 500 when email sending fails", async () => {
    (User.findOne as any).mockResolvedValue(null);
    (sendOTPEmail as any).mockRejectedValueOnce(new Error("SMTP error"));

    const res = await POST(postRequest("/api/auth/signup", validBody));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.message).toContain("Failed to send verification email");
  });
});
