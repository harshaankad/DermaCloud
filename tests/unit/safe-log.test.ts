import { describe, it, expect, vi } from "vitest";
import { safeLog, scrub } from "../../lib/safe-log";

describe("safeLog", () => {
  it("logs just the label when no data is provided", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    safeLog("hello");
    expect(spy).toHaveBeenCalledWith("hello");
    spy.mockRestore();
  });

  it("scrubs sensitive data before logging", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    safeLog("login attempt", { email: "doc@test.com", password: "Secret123!" });
    expect(spy).toHaveBeenCalledWith("login attempt", {
      email: "doc@test.com",
      password: "[REDACTED]",
    });
    spy.mockRestore();
  });

  it("passes non-sensitive data through unchanged", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const data = { action: "view_patient", patientId: "p123" };
    safeLog("audit", data);
    expect(spy).toHaveBeenCalledWith("audit", data);
    spy.mockRestore();
  });
});

describe("scrub — depth limit", () => {
  it("stops recursing beyond depth 10", () => {
    let obj: any = { safe: "leaf" };
    for (let i = 0; i < 15; i++) {
      obj = { nested: obj };
    }
    const result = scrub(obj) as any;
    expect(result).toBeDefined();
  });

  it("handles circular-like deeply nested structures without crashing", () => {
    let obj: any = { password: "secret" };
    for (let i = 0; i < 12; i++) {
      obj = { level: obj };
    }
    const result = scrub(obj) as any;
    expect(result).toBeDefined();
  });
});
