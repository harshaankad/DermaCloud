import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, getRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("@/lib/whatsapp/sender", () => ({
  sendAppointmentConfirmation: vi.fn().mockResolvedValue(undefined),
  formatAppointmentDate: vi.fn().mockReturnValue("15 Jun 2025"),
  formatAppointmentTime: vi.fn().mockReturnValue("10:00 AM"),
}));

const mockPatient = {
  _id: "pat1",
  name: "Ravi Kumar",
  phone: "9876543210",
  clinicId: { toString: () => MOCK_CLINIC_ID },
};

const mockSavedAppointment = {
  _id: "apt1",
  patientId: "pat1",
  clinicId: MOCK_CLINIC_ID,
  appointmentDate: new Date("2025-06-15"),
  appointmentTime: "10:00",
  type: "dermatology",
  tokenNumber: 1,
  consultationFee: 500,
  save: vi.fn().mockResolvedValue(undefined),
  populate: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/Patient", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("@/models/Appointment", () => {
  const chainable = {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };
  const MockAppointment = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data, {
      _id: "apt1",
      save: vi.fn().mockResolvedValue(undefined),
      populate: vi.fn().mockResolvedValue(undefined),
    });
  }) as any;
  MockAppointment.find = vi.fn().mockReturnValue(chainable);
  MockAppointment.findOne = vi.fn().mockResolvedValue(null);
  MockAppointment.countDocuments = vi.fn().mockResolvedValue(0);
  MockAppointment.aggregate = vi.fn().mockResolvedValue([]);
  MockAppointment._chainable = chainable;
  return { default: MockAppointment };
});

vi.mock("@/models/Sale", () => ({
  default: {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  },
}));

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Patient from "@/models/Patient";
import Appointment from "@/models/Appointment";
import { GET, POST } from "@/app/api/tier2/appointments/route";

describe("GET /api/tier2/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (Appointment as any)._chainable.limit.mockResolvedValue([]);
    (Appointment.countDocuments as any).mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);

    const res = await GET(getRequest("/api/tier2/appointments"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when no appointments permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(false);

    const res = await GET(getRequest("/api/tier2/appointments"));
    const body = await parseJson(res);

    expect(res.status).toBe(403);
  });

  it("returns appointment list with today stats", async () => {
    const mockApts = [
      { _id: "apt1", toObject: () => ({ _id: "apt1", status: "scheduled" }) },
    ];
    (Appointment as any)._chainable.limit.mockResolvedValue(mockApts);
    (Appointment.countDocuments as any).mockResolvedValue(1);
    (Appointment.aggregate as any).mockResolvedValue([{ _id: "scheduled", count: 1 }]);

    const res = await GET(getRequest("/api/tier2/appointments"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.appointments).toHaveLength(1);
  });

  it("filters by date when provided", async () => {
    await GET(getRequest("/api/tier2/appointments?date=2025-06-15"));

    expect(Appointment.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        appointmentDate: expect.objectContaining({
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        }),
      })
    );
  });
});

describe("POST /api/tier2/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (Patient.findById as any).mockResolvedValue(mockPatient);
    (Appointment.findOne as any).mockResolvedValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);

    const res = await POST(postRequest("/api/tier2/appointments", {}));
    expect(res.status).toBe(401);
  });

  it("returns 403 when no appointments permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(false);

    const res = await POST(postRequest("/api/tier2/appointments", {}));
    const body = await parseJson(res);

    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid data", async () => {
    const res = await POST(postRequest("/api/tier2/appointments", {}));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Validation failed");
  });

  it("returns 400 for invalid time format", async () => {
    const res = await POST(postRequest("/api/tier2/appointments", {
      patientId: "pat1",
      appointmentDate: "2025-06-15",
      appointmentTime: "25:00",
      type: "dermatology",
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
  });

  it("returns 404 when patient is not found", async () => {
    (Patient.findById as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/tier2/appointments", {
      patientId: "nonexistent",
      appointmentDate: "2025-06-15",
      appointmentTime: "10:00",
      type: "dermatology",
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.message).toContain("Patient not found");
  });

  it("returns 403 when patient belongs to another clinic", async () => {
    (Patient.findById as any).mockResolvedValue({
      ...mockPatient,
      clinicId: { toString: () => "different-clinic-id" },
    });

    const res = await POST(postRequest("/api/tier2/appointments", {
      patientId: "pat1",
      appointmentDate: "2025-06-15",
      appointmentTime: "10:00",
      type: "dermatology",
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.message).toContain("does not belong to this clinic");
  });

  it("creates appointment with auto-assigned token number", async () => {
    const res = await POST(postRequest("/api/tier2/appointments", {
      patientId: "pat1",
      appointmentDate: "2025-06-15",
      appointmentTime: "10:00",
      type: "dermatology",
      consultationFee: 500,
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });
});
