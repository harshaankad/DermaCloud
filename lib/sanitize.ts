/**
 * Input sanitization utilities for NoSQL injection prevention.
 * Strips MongoDB operator keys (starting with $) from user-supplied objects.
 */

/**
 * Recursively remove any key starting with "$" to prevent NoSQL injection.
 * Also removes keys with "." to prevent dot-notation injection.
 */
export function sanitize<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map(sanitize) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith("$") || key.includes(".")) continue;
      cleaned[key] = sanitize(val);
    }
    return cleaned as unknown as T;
  }
  return value as T;
}

/**
 * Validate that a string is a valid MongoDB ObjectId (24-char hex).
 */
export function isValidObjectId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
}

/**
 * Sanitize a string to prevent XSS — strips HTML tags.
 * For full XSS protection, pair with a Content Security Policy header.
 */
export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}
