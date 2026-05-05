import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson } from "../_helpers";

process.env.JWT_SECRET = "test-jwt-secret-key";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/TokenBlacklist", () => ({
  default: { findOneAndUpdate: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/models/User", () => ({
  default: { findByIdAndUpdate: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/models/FrontdeskStaff", () => ({
  default: { findByIdAndUpdate: vi.fn().mockResolvedValue(undefined) },
}));

import { generateToken, generateFrontdeskToken } from "@/lib/auth/jwt";
import TokenBlacklist from "@/models/TokenBlacklist";
import User from "@/models/User";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import { POST } from "@/app/api/auth/logout/route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when no token is provided", async () => {
    const res = await POST(postRequest("/api/auth/logout", {}));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("No token provided");
  });

  it("blacklists a valid doctor token and increments refresh version", async () => {
    const token = generateToken({ userId: "user1", email: "doc@test.com", tier: "tier2" });

    const res = await POST(postRequest("/api/auth/logout", {}, { Authorization: `Bearer ${token}` }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(TokenBlacklist.findOneAndUpdate).toHaveBeenCalled();
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("user1", { $inc: { refreshTokenVersion: 1 } });
  });

  it("blacklists a valid frontdesk token and returns success", async () => {
    const token = generateFrontdeskToken({
      staffId: "staff1",
      email: "fd@test.com",
      role: "frontdesk",
      clinicId: "clinic1",
      doctorId: "doc1",
    });

    const res = await POST(postRequest("/api/auth/logout", {}, { Authorization: `Bearer ${token}` }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(TokenBlacklist.findOneAndUpdate).toHaveBeenCalled();
  });

  it("returns success even for an invalid/expired token", async () => {
    const res = await POST(postRequest("/api/auth/logout", {}, { Authorization: "Bearer expired.token.here" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
