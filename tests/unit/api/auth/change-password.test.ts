import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson } from "../_helpers";

process.env.JWT_SECRET = "test-jwt-secret-key";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

const mockUser = {
  _id: "user1",
  email: "doc@test.com",
  password: "$2a$10$hashed",
  authProvider: "local",
  save: vi.fn(),
};

vi.mock("@/models/User", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    genSalt: vi.fn().mockResolvedValue("salt"),
    hash: vi.fn().mockResolvedValue("$2a$10$newhashed"),
  },
}));

import User from "@/models/User";
import bcrypt from "bcryptjs";
import { generateToken } from "@/lib/auth/jwt";
import { POST } from "@/app/api/auth/change-password/route";

function authedReq(body: Record<string, unknown>) {
  const token = generateToken({ userId: "user1", email: "doc@test.com", tier: "tier2" });
  return postRequest("/api/auth/change-password", body, { Authorization: `Bearer ${token}` });
}

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.authProvider = "local";
  });

  it("returns 401 when not authenticated", async () => {
    const res = await POST(postRequest("/api/auth/change-password", { currentPassword: "a", newPassword: "b" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for weak new password", async () => {
    const res = await POST(authedReq({ currentPassword: "Old@1234", newPassword: "weak" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
  });

  it("returns 400 when new password matches current", async () => {
    (User.findById as any).mockResolvedValue({ ...mockUser });

    const res = await POST(authedReq({ currentPassword: "Same@1234", newPassword: "Same@1234" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("must be different");
  });

  it("returns 400 for Google accounts", async () => {
    (User.findById as any).mockResolvedValue({ ...mockUser, authProvider: "google" });

    const res = await POST(authedReq({ currentPassword: "Old@1234", newPassword: "New@12345" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Google accounts");
  });

  it("returns 401 when current password is incorrect", async () => {
    (User.findById as any).mockResolvedValue({ ...mockUser, save: vi.fn() });
    (bcrypt.compare as any).mockResolvedValue(false);

    const res = await POST(authedReq({ currentPassword: "Wrong@1234", newPassword: "New@12345" }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.message).toContain("Current password is incorrect");
  });

  it("changes password successfully", async () => {
    const saveFn = vi.fn();
    (User.findById as any).mockResolvedValue({ ...mockUser, save: saveFn });
    (bcrypt.compare as any).mockResolvedValue(true);

    const res = await POST(authedReq({ currentPassword: "Old@1234", newPassword: "New@12345" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("Password changed");
    expect(saveFn).toHaveBeenCalled();
  });

  it("returns 404 when user not found", async () => {
    (User.findById as any).mockResolvedValue(null);

    const res = await POST(authedReq({ currentPassword: "Old@1234", newPassword: "New@12345" }));
    const body = await parseJson(res);

    expect(res.status).toBe(404);
  });
});
