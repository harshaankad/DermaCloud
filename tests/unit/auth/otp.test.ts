import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/models/OTP", () => ({
  default: {
    deleteMany: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ _id: "otp1" }),
    findOne: vi.fn(),
    deleteOne: vi.fn().mockResolvedValue(undefined),
  },
}));

import { generateOTP, storeOTP, verifyOTP, cleanupExpiredOTPs } from "../../../lib/auth/otp";
import OTP from "@/models/OTP";

describe("generateOTP", () => {
  it("returns a 6-digit string", () => {
    const otp = generateOTP();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it("never returns a number below 100000", () => {
    for (let i = 0; i < 200; i++) {
      const otp = generateOTP();
      expect(Number(otp)).toBeGreaterThanOrEqual(100000);
      expect(Number(otp)).toBeLessThanOrEqual(999999);
    }
  });

  it("generates different OTPs across calls (not constant)", () => {
    const otps = new Set(Array.from({ length: 50 }, () => generateOTP()));
    expect(otps.size).toBeGreaterThan(1);
  });
});

describe("storeOTP", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes existing OTPs for the email before creating a new one", async () => {
    await storeOTP("user@test.com", "123456");

    expect(OTP.deleteMany).toHaveBeenCalledWith({ email: "user@test.com" });
    expect(OTP.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@test.com",
        otp: "123456",
        expiresAt: expect.any(Date),
      })
    );
  });

  it("sets expiry ~10 minutes in the future", async () => {
    await storeOTP("user@test.com", "654321");

    const call = (OTP.create as any).mock.calls[0][0];
    const expiresAt = call.expiresAt.getTime();
    const now = Date.now();
    const diffMs = expiresAt - now;
    expect(diffMs).toBeGreaterThan(8 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(11 * 60 * 1000);
  });
});

describe("verifyOTP", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true and deletes OTP when valid and not expired", async () => {
    const futureDate = new Date(Date.now() + 5 * 60 * 1000);
    (OTP.findOne as any).mockResolvedValue({
      _id: "otp1",
      email: "user@test.com",
      otp: "123456",
      expiresAt: futureDate,
    });

    const result = await verifyOTP("user@test.com", "123456");

    expect(result).toBe(true);
    expect(OTP.deleteOne).toHaveBeenCalledWith({ _id: "otp1" });
  });

  it("returns false when OTP not found", async () => {
    (OTP.findOne as any).mockResolvedValue(null);

    const result = await verifyOTP("user@test.com", "000000");
    expect(result).toBe(false);
  });

  it("returns false and deletes expired OTP", async () => {
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    (OTP.findOne as any).mockResolvedValue({
      _id: "otp2",
      email: "user@test.com",
      otp: "123456",
      expiresAt: pastDate,
    });

    const result = await verifyOTP("user@test.com", "123456");

    expect(result).toBe(false);
    expect(OTP.deleteOne).toHaveBeenCalledWith({ _id: "otp2" });
  });
});

describe("cleanupExpiredOTPs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes all OTPs with past expiresAt", async () => {
    await cleanupExpiredOTPs();

    expect(OTP.deleteMany).toHaveBeenCalledWith({
      expiresAt: { $lt: expect.any(Date) },
    });
  });
});
