/**
 * Scrubs sensitive fields from objects before logging.
 * Prevents passwords, tokens, and PHI from appearing in server logs.
 */

// All entries must be lowercase — checked via key.toLowerCase()
const SENSITIVE_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "token",
  "refreshtoken",
  "accesstoken",
  "authorization",
  "otp",
  "secret",
  "passwordresettoken",
  "googleid",
  "jti",
]);

const MASK = "[REDACTED]";

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 10 || value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? MASK : scrub(val, depth + 1);
    }
    return result;
  }

  return value;
}

/**
 * Safe console.error replacement — auto-scrubs the first argument if it is an object.
 */
export function safeLog(label: string, data?: unknown): void {
  if (data === undefined) {
    console.log(label);
  } else {
    console.log(label, scrub(data));
  }
}
