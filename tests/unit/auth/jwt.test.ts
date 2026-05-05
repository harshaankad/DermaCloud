import { describe, it, expect } from "vitest";
import {
  generateToken,
  verifyToken,
  generateFrontdeskToken,
  verifyFrontdeskToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractTokenFromHeader,
} from "../../../lib/auth/jwt";

process.env.JWT_SECRET = "test-jwt-secret-key";

describe("generateToken / verifyToken", () => {
  it("round-trips a doctor payload", () => {
    const token = generateToken({ userId: "u1", email: "doc@test.com", tier: "tier2" });
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe("u1");
    expect(decoded!.email).toBe("doc@test.com");
    expect(decoded!.tier).toBe("tier2");
  });

  it("includes a unique jti for revocation", () => {
    const t1 = verifyToken(generateToken({ userId: "u1", email: "a@b.com", tier: "tier2" }));
    const t2 = verifyToken(generateToken({ userId: "u1", email: "a@b.com", tier: "tier2" }));
    expect(t1!.jti).toBeDefined();
    expect(t2!.jti).toBeDefined();
    expect(t1!.jti).not.toBe(t2!.jti);
  });

  it("returns null for a garbage token", () => {
    expect(verifyToken("not.a.valid.token")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(verifyToken("")).toBeNull();
  });
});

describe("generateFrontdeskToken / verifyFrontdeskToken", () => {
  it("round-trips a frontdesk payload", () => {
    const token = generateFrontdeskToken({
      staffId: "s1",
      email: "fd@test.com",
      role: "frontdesk",
      clinicId: "c1",
      doctorId: "d1",
    });
    const decoded = verifyFrontdeskToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.staffId).toBe("s1");
    expect(decoded!.role).toBe("frontdesk");
    expect(decoded!.clinicId).toBe("c1");
    expect(decoded!.doctorId).toBe("d1");
  });

  it("returns null when verifying a doctor token as frontdesk", () => {
    const doctorToken = generateToken({ userId: "u1", email: "doc@test.com", tier: "tier2" });
    expect(verifyFrontdeskToken(doctorToken)).toBeNull();
  });

  it("returns null for invalid token", () => {
    expect(verifyFrontdeskToken("garbage")).toBeNull();
  });
});

describe("generateRefreshToken / verifyRefreshToken", () => {
  it("round-trips a refresh payload", () => {
    const token = generateRefreshToken("u1", "doc@test.com", 0);
    const decoded = verifyRefreshToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe("u1");
    expect(decoded!.email).toBe("doc@test.com");
    expect(decoded!.type).toBe("refresh");
    expect(decoded!.version).toBe(0);
  });

  it("tracks rotation version", () => {
    const t1 = verifyRefreshToken(generateRefreshToken("u1", "a@b.com", 3));
    expect(t1!.version).toBe(3);
  });

  it("defaults version to 0", () => {
    const token = generateRefreshToken("u1", "a@b.com");
    const decoded = verifyRefreshToken(token);
    expect(decoded!.version).toBe(0);
  });

  it("returns null for an access token verified as refresh", () => {
    const accessToken = generateToken({ userId: "u1", email: "a@b.com", tier: "tier2" });
    expect(verifyRefreshToken(accessToken)).toBeNull();
  });

  it("returns null for invalid token", () => {
    expect(verifyRefreshToken("bad")).toBeNull();
  });
});

describe("extractTokenFromHeader", () => {
  it("extracts token from valid Bearer header", () => {
    expect(extractTokenFromHeader("Bearer abc123")).toBe("abc123");
  });

  it("returns null for null header", () => {
    expect(extractTokenFromHeader(null)).toBeNull();
  });

  it("returns null for non-Bearer scheme", () => {
    expect(extractTokenFromHeader("Basic abc123")).toBeNull();
  });

  it("returns null for Bearer with no token", () => {
    expect(extractTokenFromHeader("Bearer")).toBeNull();
  });

  it("returns null for too many parts", () => {
    expect(extractTokenFromHeader("Bearer abc 123")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractTokenFromHeader("")).toBeNull();
  });
});
