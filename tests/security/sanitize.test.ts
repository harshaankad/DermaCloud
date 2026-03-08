import { describe, it, expect } from "vitest";
import { sanitize, isValidObjectId, stripHtml } from "../../lib/sanitize";

describe("sanitize — NoSQL injection protection", () => {
  it("strips top-level $ keys from object", () => {
    const input = { email: "test@test.com", $where: "1==1" };
    const result = sanitize<any>(input);
    expect(result.$where).toBeUndefined();
    expect(result.email).toBe("test@test.com");
  });

  it("strips nested $ keys recursively", () => {
    const input = { user: { $gt: "", name: "John" } };
    const result = sanitize<any>(input);
    expect(result.user.$gt).toBeUndefined();
    expect(result.user.name).toBe("John");
  });

  it("strips keys starting with . (dot operator injection)", () => {
    const input = { ".password": "hack", name: "test" };
    const result = sanitize<any>(input);
    expect((result as any)[".password"]).toBeUndefined();
    expect(result.name).toBe("test");
  });

  it("handles arrays safely", () => {
    const input = [{ $gt: "x", valid: "yes" }];
    const result = sanitize<any>(input);
    expect(result[0].$gt).toBeUndefined();
    expect(result[0].valid).toBe("yes");
  });

  it("leaves clean input untouched", () => {
    const input = { email: "doc@clinic.com", password: "Secret123!" };
    const result = sanitize<any>(input);
    expect(result).toEqual(input);
  });

  it("handles null and undefined safely", () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
  });

  it("handles primitives unchanged", () => {
    expect(sanitize("hello")).toBe("hello");
    expect(sanitize(42)).toBe(42);
    expect(sanitize(true)).toBe(true);
  });
});

describe("isValidObjectId", () => {
  it("accepts valid 24-char hex strings", () => {
    expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
    expect(isValidObjectId("AABBCCDDEEFF001122334455")).toBe(true);
  });

  it("rejects strings that are too short", () => {
    expect(isValidObjectId("507f1f77bcf86cd79943901")).toBe(false); // 23 chars
  });

  it("rejects strings that are too long", () => {
    expect(isValidObjectId("507f1f77bcf86cd7994390110")).toBe(false); // 25 chars
  });

  it("rejects strings with non-hex characters", () => {
    expect(isValidObjectId("507f1f77bcf86cd79943901g")).toBe(false);
    expect(isValidObjectId("$or: [{id: 1}]          ")).toBe(false);
  });

  it("rejects null, undefined, numbers, objects", () => {
    expect(isValidObjectId(null)).toBe(false);
    expect(isValidObjectId(undefined)).toBe(false);
    expect(isValidObjectId(12345)).toBe(false);
    expect(isValidObjectId({ $gt: "" })).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidObjectId("")).toBe(false);
  });
});

describe("stripHtml", () => {
  it("removes HTML tags from a string", () => {
    expect(stripHtml("<script>alert(1)</script>")).toBe("alert(1)");
    expect(stripHtml("<b>bold</b>")).toBe("bold");
  });

  it("removes nested tags", () => {
    expect(stripHtml("<div><p>text</p></div>")).toBe("text");
  });

  it("leaves plain text unchanged", () => {
    expect(stripHtml("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });
});
