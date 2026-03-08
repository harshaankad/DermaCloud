import { describe, it, expect } from "vitest";
import {
  generateToken,
  verifyToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateFrontdeskToken,
  verifyFrontdeskToken,
  extractTokenFromHeader,
} from "../../lib/auth/jwt";

// Set a test secret so we don't depend on env
process.env.JWT_SECRET = "test-jwt-secret-key";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-key";

describe("JWT — generateToken / verifyToken", () => {
  it("generates a valid token that can be verified", () => {
    const token = generateToken({ userId: "user1", email: "doc@test.com", tier: "tier2" });
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("user1");
    expect(payload?.email).toBe("doc@test.com");
    expect(payload?.tier).toBe("tier2");
  });

  it("includes a jti (unique token ID) for revocation", () => {
    const t1 = generateToken({ userId: "u1", email: "a@b.com", tier: "tier2" });
    const t2 = generateToken({ userId: "u1", email: "a@b.com", tier: "tier2" });
    const p1 = verifyToken(t1);
    const p2 = verifyToken(t2);
    expect(p1?.jti).toBeTruthy();
    expect(p2?.jti).toBeTruthy();
    // Each token must have a unique jti
    expect(p1?.jti).not.toBe(p2?.jti);
  });

  it("returns null for a tampered token", () => {
    const token = generateToken({ userId: "u1", email: "a@b.com", tier: "tier2" });
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(verifyToken(tampered)).toBeNull();
  });

  it("returns null for a token signed with wrong secret", () => {
    // Sign with a different secret manually
    const jwt = require("jsonwebtoken");
    const bad = jwt.sign({ userId: "u1", email: "a@b.com", tier: "tier2" }, "wrong-secret");
    expect(verifyToken(bad)).toBeNull();
  });
});

describe("JWT — generateRefreshToken / verifyRefreshToken", () => {
  it("generates a verifiable refresh token with correct version", () => {
    const token = generateRefreshToken("user1", "doc@test.com", 3);
    const payload = verifyRefreshToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("user1");
    expect(payload?.email).toBe("doc@test.com");
    expect(payload?.type).toBe("refresh");
    expect(payload?.version).toBe(3);
  });

  it("defaults version to 0 when not provided", () => {
    const token = generateRefreshToken("user1", "doc@test.com");
    const payload = verifyRefreshToken(token);
    expect(payload?.version).toBe(0);
  });

  it("cannot be used as an access token (type check)", () => {
    const refreshToken = generateRefreshToken("user1", "doc@test.com", 0);
    // verifyToken decodes it but it won't have tier=tier2 so access is denied
    const asAccess = verifyToken(refreshToken);
    // It decodes (same secret), but tier will be undefined — not tier2
    expect(asAccess?.tier).not.toBe("tier2");
  });

  it("returns null for tampered refresh token", () => {
    const token = generateRefreshToken("user1", "doc@test.com", 0);
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(verifyRefreshToken(tampered)).toBeNull();
  });
});

describe("JWT — generateFrontdeskToken / verifyFrontdeskToken", () => {
  it("generates a valid frontdesk token", () => {
    const token = generateFrontdeskToken({
      staffId: "staff1",
      email: "fd@test.com",
      role: "frontdesk",
      clinicId: "clinic1",
      doctorId: "doctor1",
    });
    const payload = verifyFrontdeskToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.staffId).toBe("staff1");
    expect(payload?.role).toBe("frontdesk");
    expect(payload?.clinicId).toBe("clinic1");
  });

  it("includes a unique jti", () => {
    const base = { staffId: "s1", email: "fd@test.com", role: "frontdesk" as const, clinicId: "c1", doctorId: "d1" };
    const t1 = generateFrontdeskToken(base);
    const t2 = generateFrontdeskToken(base);
    expect(verifyFrontdeskToken(t1)?.jti).not.toBe(verifyFrontdeskToken(t2)?.jti);
  });

  it("rejects a doctor token as frontdesk token (role check)", () => {
    const doctorToken = generateToken({ userId: "u1", email: "a@b.com", tier: "tier2" });
    // verifyFrontdeskToken checks role !== "frontdesk"
    expect(verifyFrontdeskToken(doctorToken)).toBeNull();
  });
});

describe("JWT — extractTokenFromHeader", () => {
  it("extracts token from valid Bearer header", () => {
    expect(extractTokenFromHeader("Bearer abc123")).toBe("abc123");
  });

  it("returns null for missing header", () => {
    expect(extractTokenFromHeader(null)).toBeNull();
  });

  it("returns null for malformed header (no Bearer prefix)", () => {
    expect(extractTokenFromHeader("abc123")).toBeNull();
    expect(extractTokenFromHeader("Token abc123")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractTokenFromHeader("")).toBeNull();
  });
});
