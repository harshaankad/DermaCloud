import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/AuditLog", () => ({
  default: { create: vi.fn() },
}));

import { auditLog } from "../../lib/audit";
import AuditLog from "@/models/AuditLog";
import { connectDB } from "@/lib/db/connection";

describe("auditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AuditLog.create as any).mockResolvedValue({ _id: "log1" });
  });

  it("creates an audit entry with all fields", async () => {
    await auditLog({
      clinicId: "c1",
      userId: "u1",
      userEmail: "doc@test.com",
      role: "doctor",
      action: "LOGIN",
      resourceType: "session",
      resourceId: "sess1",
      ipAddress: "1.2.3.4",
      details: { browser: "Chrome" },
    });

    expect(connectDB).toHaveBeenCalled();
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: "c1",
        userId: "u1",
        action: "LOGIN",
        resourceType: "session",
        success: true,
      })
    );
  });

  it("defaults success to true when not provided", async () => {
    await auditLog({
      userId: "u1",
      userEmail: "doc@test.com",
      role: "doctor",
      action: "CREATE",
      resourceType: "patient",
    });

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it("passes explicit success=false", async () => {
    await auditLog({
      userId: "u1",
      userEmail: "doc@test.com",
      role: "doctor",
      action: "LOGIN_FAILED",
      resourceType: "session",
      success: false,
    });

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it("scrubs sensitive fields from details", async () => {
    await auditLog({
      userId: "u1",
      userEmail: "doc@test.com",
      role: "doctor",
      action: "UPDATE",
      resourceType: "user",
      details: { password: "secret123", name: "Dr. Test" },
    });

    const call = (AuditLog.create as any).mock.calls[0][0];
    expect(call.details.password).toBe("[REDACTED]");
    expect(call.details.name).toBe("Dr. Test");
  });

  it("does not throw when AuditLog.create fails", async () => {
    (AuditLog.create as any).mockRejectedValue(new Error("DB down"));

    await expect(
      auditLog({
        userId: "u1",
        userEmail: "doc@test.com",
        role: "doctor",
        action: "TEST",
        resourceType: "test",
      })
    ).resolves.toBeUndefined();
  });

  it("passes undefined for details when not provided", async () => {
    await auditLog({
      userId: "u1",
      userEmail: "doc@test.com",
      role: "system",
      action: "CLEANUP",
      resourceType: "otp",
    });

    const call = (AuditLog.create as any).mock.calls[0][0];
    expect(call.details).toBeUndefined();
  });
});
