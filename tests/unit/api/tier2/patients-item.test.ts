import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, putRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

const mockPatient = {
  _id: "pat1",
  patientId: "P0001",
  name: "Ravi Kumar",
  age: 30,
  gender: "male",
  phone: "9876543210",
  email: "ravi@test.com",
  address: "Bangalore",
  medicalHistory: "",
  allergies: [],
  createdAt: new Date(),
  clinicId: { toString: () => MOCK_CLINIC_ID },
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/Patient", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("@/models/ConsultationDermatology", () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      _chainable: chainable,
    },
  };
});

vi.mock("@/models/ConsultationCosmetology", () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request } from "@/lib/auth/verify-request";
import Patient from "@/models/Patient";
import { GET, PUT } from "@/app/api/tier2/patients/[id]/route";

const params = Promise.resolve({ id: "pat1" });

describe("GET /api/tier2/patients/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (Patient.findById as any).mockResolvedValue(mockPatient);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/patients/pat1"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when patient not found", async () => {
    (Patient.findById as any).mockResolvedValue(null);
    const res = await GET(getRequest("/api/tier2/patients/pat1"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when patient belongs to another clinic", async () => {
    (Patient.findById as any).mockResolvedValue({
      ...mockPatient,
      clinicId: { toString: () => "other-clinic" },
    });
    const res = await GET(getRequest("/api/tier2/patients/pat1"), { params });
    expect(res.status).toBe(403);
  });

  it("returns patient with visit history", async () => {
    const res = await GET(getRequest("/api/tier2/patients/pat1"), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.patient.name).toBe("Ravi Kumar");
    expect(body.data.visits).toBeDefined();
  });
});

describe("PUT /api/tier2/patients/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (Patient.findById as any).mockResolvedValue({ ...mockPatient, save: vi.fn() });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await PUT(putRequest("/api/tier2/patients/pat1", { age: 31 }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 when frontdesk lacks patients permission", async () => {
    (verifyTier2Request as any).mockResolvedValue({
      ...mockFrontdeskAuth,
      permissions: { ...mockFrontdeskAuth.permissions, patients: false },
    });
    const res = await PUT(putRequest("/api/tier2/patients/pat1", { age: 31 }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid update data", async () => {
    const res = await PUT(putRequest("/api/tier2/patients/pat1", { age: -5 }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when patient not found", async () => {
    (Patient.findById as any).mockResolvedValue(null);
    const res = await PUT(putRequest("/api/tier2/patients/pat1", { age: 31 }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when patient belongs to another clinic", async () => {
    (Patient.findById as any).mockResolvedValue({
      ...mockPatient,
      clinicId: { toString: () => "other-clinic" },
      save: vi.fn(),
    });
    const res = await PUT(putRequest("/api/tier2/patients/pat1", { age: 31 }), { params });
    expect(res.status).toBe(403);
  });

  it("updates patient fields successfully", async () => {
    const patient = { ...mockPatient, save: vi.fn() };
    (Patient.findById as any).mockResolvedValue(patient);

    const res = await PUT(putRequest("/api/tier2/patients/pat1", {
      age: 31,
      allergies: ["Penicillin"],
      medicalHistory: "Diabetes",
    }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(patient.age).toBe(31);
    expect(patient.allergies).toEqual(["Penicillin"]);
    expect(patient.save).toHaveBeenCalled();
  });
});
