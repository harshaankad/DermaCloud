import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { authMiddleware, requireTier, requireClinic } from "../../../lib/auth/middleware";
import { generateToken } from "../../../lib/auth/jwt";

process.env.JWT_SECRET = "test-jwt-secret-key";

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest("http://localhost:3000/api/test", { headers });
}

describe("authMiddleware", () => {
  it("returns user payload for a valid token", async () => {
    const token = generateToken({ userId: "u1", email: "doc@test.com", tier: "tier2", clinicId: "c1" });
    const result = await authMiddleware(makeRequest(`Bearer ${token}`));
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.userId).toBe("u1");
      expect(result.user.email).toBe("doc@test.com");
    }
  });

  it("returns 401 when no authorization header is present", async () => {
    const result = await authMiddleware(makeRequest());
    expect(result).toHaveProperty("status", 401);
  });

  it("returns 401 for an invalid token", async () => {
    const result = await authMiddleware(makeRequest("Bearer invalid.token.here"));
    expect(result).toHaveProperty("status", 401);
  });

  it("returns 401 for malformed authorization header", async () => {
    const result = await authMiddleware(makeRequest("NotBearer abc123"));
    expect(result).toHaveProperty("status", 401);
  });
});

describe("requireTier", () => {
  it("returns user when token has the required tier", async () => {
    const token = generateToken({ userId: "u1", email: "doc@test.com", tier: "tier2", clinicId: "c1" });
    const result = await requireTier(makeRequest(`Bearer ${token}`), "tier2");
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.tier).toBe("tier2");
    }
  });

  it("returns 401 when no token is provided", async () => {
    const result = await requireTier(makeRequest(), "tier2");
    expect(result).toHaveProperty("status", 401);
  });
});

describe("requireClinic", () => {
  it("returns user when token has tier2 and clinicId", async () => {
    const token = generateToken({ userId: "u1", email: "doc@test.com", tier: "tier2", clinicId: "c1" });
    const result = await requireClinic(makeRequest(`Bearer ${token}`));
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.clinicId).toBe("c1");
    }
  });

  it("returns 403 when token has tier2 but no clinicId", async () => {
    const token = generateToken({ userId: "u1", email: "doc@test.com", tier: "tier2" });
    const result = await requireClinic(makeRequest(`Bearer ${token}`));
    expect(result).toHaveProperty("status", 403);
  });

  it("returns 401 when no token is provided", async () => {
    const result = await requireClinic(makeRequest());
    expect(result).toHaveProperty("status", 401);
  });
});
