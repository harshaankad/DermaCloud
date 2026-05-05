import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/email/sender", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockUser = {
  _id: "user1",
  email: "doc@test.com",
  name: "Dr. Test",
  authProvider: "local",
  passwordResetToken: undefined as string | undefined,
  passwordResetExpiry: undefined as Date | undefined,
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/User", () => ({
  default: { findOne: vi.fn() },
}));

import { rateLimit } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email/sender";
import User from "@/models/User";
import { POST } from "@/app/api/auth/forgot-password/route";

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (rateLimit as any).mockReturnValue({ success: true });
    (User.findOne as any).mockResolvedValue({ ...mockUser, save: vi.fn() });
  });

  it("returns 429 when rate limited", async () => {
    (rateLimit as any).mockReturnValue({ success: false });

    const res = await POST(postRequest("/api/auth/forgot-password", { email: "a@b.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(postRequest("/api/auth/forgot-password", {}));
    expect(res.status).toBe(400);
  });

  it("returns success even when user not found (prevents enumeration)", async () => {
    (User.findOne as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/auth/forgot-password", { email: "unknown@test.com" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns isGoogleAccount flag for Google users", async () => {
    (User.findOne as any).mockResolvedValue({ ...mockUser, authProvider: "google" });

    const res = await POST(postRequest("/api/auth/forgot-password", { email: "doc@test.com" }));
    const body = await parseJson(res);

    expect(body.isGoogleAccount).toBe(true);
  });

  it("generates reset token and sends email for local users", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    (User.findOne as any).mockResolvedValue({ ...mockUser, save: saveFn });

    const res = await POST(postRequest("/api/auth/forgot-password", { email: "doc@test.com" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(saveFn).toHaveBeenCalled();
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("doc@test.com", "Dr. Test", expect.stringContaining("reset-password?token="));
  });
});
