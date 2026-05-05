import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson } from "../_helpers";

process.env.JWT_SECRET = "test-jwt-secret-key";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

const mockDbUser = {
  _id: "user1",
  email: "doc@test.com",
  name: "Dr. Test",
  tier: "tier2",
  phone: "9876543210",
  clinicId: "clinic1",
  isVerified: true,
  createdAt: new Date("2025-01-01"),
};

vi.mock("@/models/User", () => ({
  default: {
    findById: vi.fn().mockReturnValue({ select: vi.fn() }),
  },
}));

import User from "@/models/User";
import { generateToken } from "@/lib/auth/jwt";
import { GET } from "@/app/api/auth/me/route";

describe("GET /api/auth/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when no token is provided", async () => {
    const res = await GET(getRequest("/api/auth/me"));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 401 for an invalid token", async () => {
    const res = await GET(getRequest("/api/auth/me", { Authorization: "Bearer bad-token" }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
  });

  it("returns user data for valid token", async () => {
    const token = generateToken({ userId: "user1", email: "doc@test.com", tier: "tier2" });
    (User.findById as any).mockReturnValue({ select: vi.fn().mockResolvedValue(mockDbUser) });

    const res = await GET(getRequest("/api/auth/me", { Authorization: `Bearer ${token}` }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe("doc@test.com");
    expect(body.data.user.name).toBe("Dr. Test");
  });

  it("returns 404 when user not found in DB", async () => {
    const token = generateToken({ userId: "user1", email: "doc@test.com", tier: "tier2" });
    (User.findById as any).mockReturnValue({ select: vi.fn().mockResolvedValue(null) });

    const res = await GET(getRequest("/api/auth/me", { Authorization: `Bearer ${token}` }));
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.message).toContain("User not found");
  });
});
