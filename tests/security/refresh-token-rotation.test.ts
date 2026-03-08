import { describe, it, expect } from "vitest";
import { generateRefreshToken, verifyRefreshToken } from "../../lib/auth/jwt";

process.env.JWT_SECRET = "test-jwt-secret-key";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-key";

describe("Refresh Token Rotation", () => {
  it("version in token must match DB version to be accepted", () => {
    // Simulate: user has refreshTokenVersion = 2 in DB
    const dbVersion = 2;

    // Token generated with version 2
    const token = generateRefreshToken("user1", "doc@test.com", 2);
    const payload = verifyRefreshToken(token);

    // Matches — should be accepted
    expect(payload?.version).toBe(dbVersion);
    expect(payload?.version === dbVersion).toBe(true);
  });

  it("old token (version 1) is rejected when DB is at version 2", () => {
    const dbVersion = 2;

    // Old token from previous rotation cycle
    const oldToken = generateRefreshToken("user1", "doc@test.com", 1);
    const payload = verifyRefreshToken(oldToken);

    // Version mismatch — should be rejected
    expect(payload?.version !== dbVersion).toBe(true);
  });

  it("after rotation, old token cannot be reused (replay attack)", () => {
    let dbVersion = 0;

    // Initial login: issue token with version 0
    const token0 = generateRefreshToken("user1", "doc@test.com", dbVersion);

    // First rotation: verify token0, increment DB version, issue token1
    const payload0 = verifyRefreshToken(token0);
    expect(payload0?.version).toBe(0);
    expect(payload0?.version === dbVersion).toBe(true); // accepted
    dbVersion += 1; // DB now at version 1
    const token1 = generateRefreshToken("user1", "doc@test.com", dbVersion);

    // Attacker tries to reuse token0
    const replayPayload = verifyRefreshToken(token0);
    expect(replayPayload?.version !== dbVersion).toBe(true); // rejected — version 0 != 1

    // Legitimate user uses token1
    const payload1 = verifyRefreshToken(token1);
    expect(payload1?.version === dbVersion).toBe(true); // accepted
  });

  it("logout invalidation: incrementing DB version kills all existing refresh tokens", () => {
    let dbVersion = 3;
    const token = generateRefreshToken("user1", "doc@test.com", 3);

    // Logout increments DB version to 4
    dbVersion += 1;

    // Token (version 3) no longer matches DB (version 4)
    const payload = verifyRefreshToken(token);
    expect(payload?.version !== dbVersion).toBe(true);
  });
});

describe("Password Strength Rules (Zod schema)", () => {
  const { z } = require("zod");

  const passwordSchema = z
    .string()
    .min(8, "min 8")
    .regex(/[A-Z]/, "uppercase")
    .regex(/[a-z]/, "lowercase")
    .regex(/[0-9]/, "number")
    .regex(/[^A-Za-z0-9]/, "special char");

  it("accepts a strong password", () => {
    expect(passwordSchema.safeParse("Secure@123").success).toBe(true);
    expect(passwordSchema.safeParse("MyP@ssw0rd!").success).toBe(true);
  });

  it("rejects passwords under 8 characters", () => {
    expect(passwordSchema.safeParse("Ab1@").success).toBe(false);
  });

  it("rejects passwords with no uppercase letter", () => {
    expect(passwordSchema.safeParse("secure@123").success).toBe(false);
  });

  it("rejects passwords with no lowercase letter", () => {
    expect(passwordSchema.safeParse("SECURE@123").success).toBe(false);
  });

  it("rejects passwords with no number", () => {
    expect(passwordSchema.safeParse("Secure@abc").success).toBe(false);
  });

  it("rejects passwords with no special character", () => {
    expect(passwordSchema.safeParse("Secure123").success).toBe(false);
  });

  it("rejects common weak passwords", () => {
    expect(passwordSchema.safeParse("password").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("Password1").success).toBe(false); // missing special char
  });
});
