import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: {
    genSalt: vi.fn().mockResolvedValue("salt"),
    hash: vi.fn().mockResolvedValue("hashed-password"),
  },
}));

const mockUser = {
  _id: "user1",
  passwordResetToken: "stored-hash",
  passwordResetExpiry: new Date(Date.now() + 3600000),
  password: "old",
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/User", () => ({
  default: { findOne: vi.fn() },
}));

import User from "@/models/User";
import { POST } from "@/app/api/auth/reset-password/route";

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (User.findOne as any).mockResolvedValue({ ...mockUser, save: vi.fn() });
  });

  it("returns 400 when token or password is missing", async () => {
    const res = await POST(postRequest("/api/auth/reset-password", { token: "abc" }));
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.message).toContain("Token and new password are required");
  });

  it("returns 400 when password is too short", async () => {
    const res = await POST(postRequest("/api/auth/reset-password", { token: "abc", password: "12345" }));
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.message).toContain("at least 6 characters");
  });

  it("returns 400 when token is invalid or expired", async () => {
    (User.findOne as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/auth/reset-password", { token: "bad-token", password: "newpass123" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("invalid or has expired");
  });

  it("resets password and clears token on success", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const user = { ...mockUser, save: saveFn };
    (User.findOne as any).mockResolvedValue(user);

    const res = await POST(postRequest("/api/auth/reset-password", { token: "valid-token", password: "newpass123" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(user.password).toBe("hashed-password");
    expect(user.passwordResetToken).toBeUndefined();
    expect(user.passwordResetExpiry).toBeUndefined();
    expect(saveFn).toHaveBeenCalled();
  });
});
