import { describe, it, expect } from "vitest";
import { scrub } from "../../lib/safe-log";

describe("scrub — sensitive data redaction", () => {
  it("redacts password field", () => {
    const result = scrub({ email: "a@b.com", password: "Secret123!" }) as any;
    expect(result.password).toBe("[REDACTED]");
    expect(result.email).toBe("a@b.com");
  });

  it("redacts token fields", () => {
    const result = scrub({ token: "abc.def.ghi", refreshToken: "xyz", data: "safe" }) as any;
    expect(result.token).toBe("[REDACTED]");
    expect(result.refreshToken).toBe("[REDACTED]");
    expect(result.data).toBe("safe");
  });

  it("redacts otp and secret", () => {
    const result = scrub({ otp: "123456", secret: "mysecret" }) as any;
    expect(result.otp).toBe("[REDACTED]");
    expect(result.secret).toBe("[REDACTED]");
  });

  it("redacts jti", () => {
    const result = scrub({ jti: "some-uuid-value", userId: "u1" }) as any;
    expect(result.jti).toBe("[REDACTED]");
    expect(result.userId).toBe("u1");
  });

  it("redacts nested sensitive fields recursively", () => {
    const result = scrub({ user: { password: "p@ss!", name: "John" } }) as any;
    expect(result.user.password).toBe("[REDACTED]");
    expect(result.user.name).toBe("John");
  });

  it("leaves non-sensitive fields untouched", () => {
    const input = { action: "LOGIN_SUCCESS", ipAddress: "1.2.3.4", role: "doctor" };
    const result = scrub(input) as any;
    expect(result).toEqual(input);
  });

  it("handles arrays — scrubs objects inside arrays", () => {
    const result = scrub([{ password: "secret", name: "Alice" }]) as any;
    expect(result[0].password).toBe("[REDACTED]");
    expect(result[0].name).toBe("Alice");
  });

  it("handles null and undefined safely", () => {
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
  });

  it("handles primitives unchanged", () => {
    expect(scrub("plain string")).toBe("plain string");
    expect(scrub(42)).toBe(42);
  });

  it("is case-insensitive for key matching", () => {
    // Keys are lowercased before matching
    const result = scrub({ Password: "Secret" }) as any;
    // Note: scrub lowercases the key for the check — the key itself stays as-is
    // but the value should be redacted
    expect(result.Password).toBe("[REDACTED]");
  });
});
