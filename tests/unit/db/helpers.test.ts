import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/models", () => ({
  UsageTracking: {
    findOne: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn(),
  },
  Patient: {
    countDocuments: vi.fn(),
  },
}));

import {
  checkDailyLimit,
  checkMonthlyLimit,
  incrementScanCount,
  getUserUsageStats,
  generatePatientId,
  validateCustomFields,
} from "../../../lib/db/helpers";
import { UsageTracking, Patient } from "@/models";

describe("checkDailyLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows when no usage record exists", async () => {
    (UsageTracking.findOne as any).mockResolvedValue(null);
    const result = await checkDailyLimit("u1", 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
    expect(result.scansToday).toBe(0);
  });

  it("allows when under daily limit", async () => {
    (UsageTracking.findOne as any).mockResolvedValue({ dailyScans: 3 });
    const result = await checkDailyLimit("u1", 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("blocks when at daily limit", async () => {
    (UsageTracking.findOne as any).mockResolvedValue({ dailyScans: 5 });
    const result = await checkDailyLimit("u1", 5);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("blocks when over daily limit", async () => {
    (UsageTracking.findOne as any).mockResolvedValue({ dailyScans: 10 });
    const result = await checkDailyLimit("u1", 5);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("checkMonthlyLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows when no usage records exist", async () => {
    (UsageTracking.find as any).mockResolvedValue([]);
    const result = await checkMonthlyLimit("u1", 120);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(120);
    expect(result.scansThisMonth).toBe(0);
  });

  it("sums daily scans across the month", async () => {
    (UsageTracking.find as any).mockResolvedValue([
      { dailyScans: 10 },
      { dailyScans: 20 },
      { dailyScans: 30 },
    ]);
    const result = await checkMonthlyLimit("u1", 120);
    expect(result.allowed).toBe(true);
    expect(result.scansThisMonth).toBe(60);
    expect(result.remaining).toBe(60);
  });

  it("blocks when at monthly limit", async () => {
    (UsageTracking.find as any).mockResolvedValue([{ dailyScans: 120 }]);
    const result = await checkMonthlyLimit("u1", 120);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("incrementScanCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts daily record and updates monthly", async () => {
    (UsageTracking.findOneAndUpdate as any).mockResolvedValue({});
    (UsageTracking.updateMany as any).mockResolvedValue({});

    await incrementScanCount("u1");

    expect(UsageTracking.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1" }),
      expect.objectContaining({
        $inc: { dailyScans: 1 },
        $set: { lastScanAt: expect.any(Date) },
      }),
      { upsert: true, new: true }
    );
    expect(UsageTracking.updateMany).toHaveBeenCalled();
  });
});

describe("getUserUsageStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns today, month, and all-time stats", async () => {
    (UsageTracking.findOne as any).mockResolvedValue({ dailyScans: 3 });
    (UsageTracking.find as any)
      .mockResolvedValueOnce([{ dailyScans: 3 }, { dailyScans: 7 }])
      .mockResolvedValueOnce([{ dailyScans: 3 }, { dailyScans: 7 }, { dailyScans: 15 }]);

    const result = await getUserUsageStats("u1");
    expect(result.today).toBe(3);
    expect(result.thisMonth).toBe(10);
    expect(result.totalAllTime).toBe(25);
  });

  it("returns zeros when no usage exists", async () => {
    (UsageTracking.findOne as any).mockResolvedValue(null);
    (UsageTracking.find as any).mockResolvedValue([]);

    const result = await getUserUsageStats("u1");
    expect(result.today).toBe(0);
    expect(result.thisMonth).toBe(0);
    expect(result.totalAllTime).toBe(0);
  });
});

describe("generatePatientId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates PAT00001 for first patient", async () => {
    (Patient.countDocuments as any).mockResolvedValue(0);
    const id = await generatePatientId("clinic1");
    expect(id).toBe("PAT00001");
  });

  it("generates zero-padded ID based on count", async () => {
    (Patient.countDocuments as any).mockResolvedValue(99);
    const id = await generatePatientId("clinic1");
    expect(id).toBe("PAT00100");
  });

  it("scopes count to the given clinicId", async () => {
    (Patient.countDocuments as any).mockResolvedValue(5);
    await generatePatientId("my-clinic");
    expect(Patient.countDocuments).toHaveBeenCalledWith({ clinicId: "my-clinic" });
  });
});

describe("validateCustomFields", () => {
  it("passes when all required fields are present", () => {
    const data = { name: "John", age: "25" };
    const defs = [
      { fieldName: "name", fieldType: "text", required: true },
      { fieldName: "age", fieldType: "number", required: true },
    ];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when a required field is missing", () => {
    const data = { age: "25" };
    const defs = [
      { fieldName: "name", fieldType: "text", required: true },
      { fieldName: "age", fieldType: "number", required: false },
    ];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("name is required");
  });

  it("fails when a required field is empty string", () => {
    const data = { name: "" };
    const defs = [{ fieldName: "name", fieldType: "text", required: true }];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("name is required");
  });

  it("validates number type — rejects non-numeric value", () => {
    const data = { age: "not-a-number" };
    const defs = [{ fieldName: "age", fieldType: "number", required: false }];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("age must be a number");
  });

  it("validates number type — accepts numeric string", () => {
    const data = { age: "42" };
    const defs = [{ fieldName: "age", fieldType: "number", required: false }];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(true);
  });

  it("validates select type — rejects value not in options", () => {
    const data = { severity: "Critical" };
    const defs = [
      { fieldName: "severity", fieldType: "select", required: false, options: ["Mild", "Moderate", "Severe"] },
    ];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("severity must be one of");
  });

  it("validates select type — accepts valid option", () => {
    const data = { severity: "Mild" };
    const defs = [
      { fieldName: "severity", fieldType: "select", required: false, options: ["Mild", "Moderate", "Severe"] },
    ];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(true);
  });

  it("validates date type — rejects invalid date", () => {
    const data = { followUp: "not-a-date" };
    const defs = [{ fieldName: "followUp", fieldType: "date", required: false }];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("followUp must be a valid date");
  });

  it("validates date type — accepts valid ISO date", () => {
    const data = { followUp: "2025-06-15" };
    const defs = [{ fieldName: "followUp", fieldType: "date", required: false }];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(true);
  });

  it("skips type validation when value is missing and field is not required", () => {
    const data = {};
    const defs = [{ fieldName: "notes", fieldType: "text", required: false }];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(true);
  });

  it("collects multiple errors at once", () => {
    const data = { age: "abc" };
    const defs = [
      { fieldName: "name", fieldType: "text", required: true },
      { fieldName: "age", fieldType: "number", required: false },
    ];
    const result = validateCustomFields(data, defs);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  it("handles empty definitions array", () => {
    const result = validateCustomFields({ anything: "value" }, []);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
