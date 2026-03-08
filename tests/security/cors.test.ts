import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Tests for CORS middleware logic.
 * We extract the core allow/deny logic so it can be tested without Next.js.
 */

const ALLOWED_ORIGIN = "https://dermacloud.in";

function isOriginAllowed(origin: string, nodeEnv = "production"): boolean {
  if (!origin) return true; // no origin = same-origin / server-to-server
  if (origin === ALLOWED_ORIGIN) return true;
  if (nodeEnv === "development" && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

describe("CORS — origin validation", () => {
  it("allows requests with no Origin header (same-origin / server-to-server)", () => {
    expect(isOriginAllowed("")).toBe(true);
  });

  it("allows the production domain", () => {
    expect(isOriginAllowed("https://dermacloud.in")).toBe(true);
  });

  it("blocks a random external origin in production", () => {
    expect(isOriginAllowed("https://evil.com")).toBe(false);
    expect(isOriginAllowed("https://dermacloud.in.evil.com")).toBe(false);
    expect(isOriginAllowed("http://dermacloud.in")).toBe(false); // http != https
  });

  it("allows localhost in development", () => {
    expect(isOriginAllowed("http://localhost:3000", "development")).toBe(true);
    expect(isOriginAllowed("http://localhost", "development")).toBe(true);
    expect(isOriginAllowed("https://localhost:3000", "development")).toBe(true);
  });

  it("blocks localhost in production", () => {
    expect(isOriginAllowed("http://localhost:3000", "production")).toBe(false);
  });

  it("blocks subdomain of allowed domain (not in allowlist)", () => {
    expect(isOriginAllowed("https://app.dermacloud.in")).toBe(false);
    expect(isOriginAllowed("https://api.dermacloud.in")).toBe(false);
  });
});
