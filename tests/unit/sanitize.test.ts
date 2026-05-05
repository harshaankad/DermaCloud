import { describe, it, expect } from "vitest";
import { sanitize, isValidObjectId, stripHtml } from "../../lib/sanitize";

describe("sanitize", () => {
  it("removes keys starting with $ (NoSQL injection)", () => {
    const input = { name: "Alice", $gt: "", $ne: null };
    const result = sanitize<Record<string, unknown>>(input);
    expect(result).toEqual({ name: "Alice" });
    expect(result).not.toHaveProperty("$gt");
    expect(result).not.toHaveProperty("$ne");
  });

  it("removes keys containing dots (dot-notation injection)", () => {
    const input = { "role": "user", "admin.flag": true };
    const result = sanitize<Record<string, unknown>>(input);
    expect(result).toEqual({ role: "user" });
  });

  it("sanitizes nested objects recursively", () => {
    const input = { query: { name: "Bob", $regex: ".*" } };
    const result = sanitize<any>(input);
    expect(result.query).toEqual({ name: "Bob" });
  });

  it("sanitizes arrays", () => {
    const input = [{ $gt: 1, val: 2 }, { $ne: null, val: 3 }];
    const result = sanitize<any[]>(input);
    expect(result).toEqual([{ val: 2 }, { val: 3 }]);
  });

  it("passes through primitive values unchanged", () => {
    expect(sanitize<string>("hello")).toBe("hello");
    expect(sanitize<number>(42)).toBe(42);
    expect(sanitize<boolean>(true)).toBe(true);
    expect(sanitize<null>(null)).toBeNull();
  });

  it("handles deeply nested structures", () => {
    const input = { a: { b: { c: { $where: "1==1", safe: "ok" } } } };
    const result = sanitize<any>(input);
    expect(result.a.b.c).toEqual({ safe: "ok" });
  });
});

describe("isValidObjectId", () => {
  it("returns true for valid 24-char hex string", () => {
    expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
  });

  it("returns true for uppercase hex", () => {
    expect(isValidObjectId("507F1F77BCF86CD799439011")).toBe(true);
  });

  it("returns false for too short", () => {
    expect(isValidObjectId("507f1f77bcf86c")).toBe(false);
  });

  it("returns false for too long", () => {
    expect(isValidObjectId("507f1f77bcf86cd7994390110")).toBe(false);
  });

  it("returns false for non-hex characters", () => {
    expect(isValidObjectId("507f1f77bcf86cd79943901g")).toBe(false);
  });

  it("returns false for non-string types", () => {
    expect(isValidObjectId(123)).toBe(false);
    expect(isValidObjectId(null)).toBe(false);
    expect(isValidObjectId(undefined)).toBe(false);
    expect(isValidObjectId({})).toBe(false);
  });
});

describe("stripHtml", () => {
  it("removes HTML tags from string", () => {
    expect(stripHtml("<b>bold</b>")).toBe("bold");
  });

  it("removes script tags", () => {
    expect(stripHtml('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it("removes nested tags", () => {
    expect(stripHtml("<div><p>hello</p></div>")).toBe("hello");
  });

  it("leaves plain text unchanged", () => {
    expect(stripHtml("no tags here")).toBe("no tags here");
  });

  it("handles self-closing tags", () => {
    expect(stripHtml("line<br/>break")).toBe("linebreak");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });
});
