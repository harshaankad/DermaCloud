import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson } from "../_helpers";

vi.mock("@/lib/auth/otp", () => ({
  verifyOTP: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true, remaining: 9, resetAt: Date.now() + 60000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { verifyOTP } from "@/lib/auth/otp";
import { rateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/auth/verify-otp/route";

describe("POST /api/auth/verify-otp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 on valid OTP", async () => {
    (verifyOTP as any).mockResolvedValue(true);

    const res = await POST(postRequest("/api/auth/verify-otp", { email: "doc@test.com", otp: "123456" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.emailVerified).toBe(true);
  });

  it("returns 400 on invalid OTP", async () => {
    (verifyOTP as any).mockResolvedValue(false);

    const res = await POST(postRequest("/api/auth/verify-otp", { email: "doc@test.com", otp: "000000" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Invalid or expired OTP");
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(postRequest("/api/auth/verify-otp", { email: "not-email", otp: "123456" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
  });

  it("returns 400 for OTP not exactly 6 digits", async () => {
    const res = await POST(postRequest("/api/auth/verify-otp", { email: "doc@test.com", otp: "12345" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    (rateLimit as any).mockReturnValueOnce({ success: false, remaining: 0, resetAt: Date.now() });

    const res = await POST(postRequest("/api/auth/verify-otp", { email: "doc@test.com", otp: "123456" }));
    const body = await parseJson(res);

    expect(res.status).toBe(429);
  });
});
