import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, getRequest, parseJson, MOCK_CLINIC_ID, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockCreatedPatient = {
  _id: "pat1",
  patientId: "P0001",
  name: "Ravi Kumar",
  age: 30,
  gender: "male",
  phone: "9876543210",
  email: undefined,
  createdAt: new Date(),
};

vi.mock("@/models/Patient", () => ({
  default: {
    create: vi.fn(),
    countDocuments: vi.fn(),
    find: vi.fn(),
  },
}));

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Patient from "@/models/Patient";
import { POST } from "@/app/api/tier2/patients/route";

describe("POST /api/tier2/patients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);

    const res = await POST(postRequest("/api/tier2/patients", { name: "Test" }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 403 when frontdesk lacks patients permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(false);

    const res = await POST(postRequest("/api/tier2/patients", {
      name: "Test", age: 25, gender: "male", phone: "9876543210",
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.message).toContain("No permission");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(postRequest("/api/tier2/patients", { name: "Test" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Missing required fields");
  });

  it("creates a patient successfully as doctor", async () => {
    (Patient.countDocuments as any).mockResolvedValue(0);
    (Patient.create as any).mockResolvedValue(mockCreatedPatient);

    const res = await POST(postRequest("/api/tier2/patients", {
      name: "Ravi Kumar",
      age: 30,
      gender: "male",
      phone: "9876543210",
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.patient.name).toBe("Ravi Kumar");
  });

  it("auto-generates patient ID based on count", async () => {
    (Patient.countDocuments as any).mockResolvedValue(42);
    (Patient.create as any).mockImplementation(async (data: any) => ({
      ...mockCreatedPatient,
      patientId: data.patientId,
    }));

    const res = await POST(postRequest("/api/tier2/patients", {
      name: "Test Patient",
      age: 25,
      gender: "female",
      phone: "9876543211",
    }));

    expect(Patient.create).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: "P0043" })
    );
  });

  it("creates patient with optional fields", async () => {
    (Patient.countDocuments as any).mockResolvedValue(0);
    (Patient.create as any).mockResolvedValue({ ...mockCreatedPatient, email: "ravi@test.com", allergies: ["Penicillin"] });

    const res = await POST(postRequest("/api/tier2/patients", {
      name: "Ravi Kumar",
      age: 30,
      gender: "male",
      phone: "9876543210",
      email: "ravi@test.com",
      allergies: ["Penicillin"],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("creates patient as frontdesk with patients permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(true);
    (Patient.countDocuments as any).mockResolvedValue(0);
    (Patient.create as any).mockResolvedValue(mockCreatedPatient);

    const res = await POST(postRequest("/api/tier2/patients", {
      name: "Ravi Kumar",
      age: 30,
      gender: "male",
      phone: "9876543210",
    }));

    expect(res.status).toBe(200);
  });

  it("returns 400 for mongoose ValidationError", async () => {
    (Patient.countDocuments as any).mockResolvedValue(0);
    const err = new Error("Validation failed") as any;
    err.name = "ValidationError";
    (Patient.create as any).mockRejectedValue(err);

    const res = await POST(postRequest("/api/tier2/patients", {
      name: "Test", age: 25, gender: "male", phone: "9876543210",
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Validation error");
  });

  it("returns 409 for duplicate key error", async () => {
    (Patient.countDocuments as any).mockResolvedValue(0);
    const err = new Error("Duplicate") as any;
    err.code = 11000;
    (Patient.create as any).mockRejectedValue(err);

    const res = await POST(postRequest("/api/tier2/patients", {
      name: "Test", age: 25, gender: "male", phone: "9876543210",
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(409);
    expect(body.message).toContain("already exists");
  });

  it("returns 500 for generic errors", async () => {
    (Patient.countDocuments as any).mockResolvedValue(0);
    (Patient.create as any).mockRejectedValue(new Error("DB crashed"));

    const res = await POST(postRequest("/api/tier2/patients", {
      name: "Test", age: 25, gender: "male", phone: "9876543210",
    }));

    expect(res.status).toBe(500);
  });
});
