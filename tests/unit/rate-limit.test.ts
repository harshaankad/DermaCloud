import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, getClientIp } from "../../lib/rate-limit";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/test", {
    headers: new Headers(headers),
  });
}

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.50" });
    expect(getClientIp(req)).toBe("203.0.113.50");
  });

  it("takes the first IP when x-forwarded-for has multiple entries", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.50, 70.41.3.18, 150.172.238.178" });
    expect(getClientIp(req)).toBe("203.0.113.50");
  });

  it("trims whitespace from forwarded IP", () => {
    const req = makeRequest({ "x-forwarded-for": "  203.0.113.50  , 70.41.3.18" });
    expect(getClientIp(req)).toBe("203.0.113.50");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeRequest({ "x-real-ip": "10.0.0.1" });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("unknown");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = makeRequest({
      "x-forwarded-for": "203.0.113.50",
      "x-real-ip": "10.0.0.1",
    });
    expect(getClientIp(req)).toBe("203.0.113.50");
  });
});

describe("rateLimit", () => {
  const opts = { limit: 3, windowMs: 60_000 };

  it("allows the first request and returns remaining count", () => {
    const result = rateLimit("rl-test-1", opts);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
  });

  it("decrements remaining on each call", () => {
    rateLimit("rl-test-2", opts);
    const second = rateLimit("rl-test-2", opts);
    expect(second.success).toBe(true);
    expect(second.remaining).toBe(1);

    const third = rateLimit("rl-test-2", opts);
    expect(third.success).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("blocks once limit is reached", () => {
    rateLimit("rl-test-3", opts);
    rateLimit("rl-test-3", opts);
    rateLimit("rl-test-3", opts);

    const blocked = rateLimit("rl-test-3", opts);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("uses separate counters for different keys", () => {
    rateLimit("rl-key-a", opts);
    rateLimit("rl-key-a", opts);
    rateLimit("rl-key-a", opts);

    const otherKey = rateLimit("rl-key-b", opts);
    expect(otherKey.success).toBe(true);
    expect(otherKey.remaining).toBe(2);
  });

  it("resets after window expires", () => {
    const shortWindow = { limit: 1, windowMs: 1 };
    rateLimit("rl-test-expire", shortWindow);

    // Wait for window to expire
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }

    const result = rateLimit("rl-test-expire", shortWindow);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);
  });
});
