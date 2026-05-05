import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, putRequest, deleteRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("mongoose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mongoose")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      Types: actual.Types,
    },
  };
});

const mockAppointment = {
  _id: "apt1",
  clinicId: { toString: () => MOCK_CLINIC_ID },
  patientId: "pat1",
  status: "scheduled",
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/Appointment", () => {
  const populateChain = {
    populate: vi.fn().mockReturnThis(),
  };
  return {
    default: {
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue({ _id: "apt1", status: "checked-in" }),
      }),
    },
  };
});

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Appointment from "@/models/Appointment";
import { GET, PUT, DELETE } from "@/app/api/tier2/appointments/[id]/route";

const params = Promise.resolve({ id: "apt1" });

describe("GET /api/tier2/appointments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (Appointment.findById as any).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockAppointment),
      }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/appointments/apt1"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no appointments permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(false);
    const res = await GET(getRequest("/api/tier2/appointments/apt1"), { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when appointment not found", async () => {
    (Appointment.findById as any).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(null),
      }),
    });
    const res = await GET(getRequest("/api/tier2/appointments/apt1"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when appointment belongs to another clinic", async () => {
    (Appointment.findById as any).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue({
          ...mockAppointment,
          clinicId: { toString: () => "other-clinic" },
        }),
      }),
    });
    const res = await GET(getRequest("/api/tier2/appointments/apt1"), { params });
    expect(res.status).toBe(403);
  });

  it("returns appointment on success", async () => {
    const res = await GET(getRequest("/api/tier2/appointments/apt1"), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data._id).toBe("apt1");
  });
});

describe("PUT /api/tier2/appointments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (Appointment.findById as any).mockResolvedValue(mockAppointment);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await PUT(putRequest("/api/tier2/appointments/apt1", { status: "checked-in" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid time format", async () => {
    const res = await PUT(putRequest("/api/tier2/appointments/apt1", { appointmentTime: "25:00" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when appointment not found", async () => {
    (Appointment.findById as any).mockResolvedValue(null);
    const res = await PUT(putRequest("/api/tier2/appointments/apt1", { status: "checked-in" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when appointment belongs to another clinic", async () => {
    (Appointment.findById as any).mockResolvedValue({
      ...mockAppointment,
      clinicId: { toString: () => "other-clinic" },
    });
    const res = await PUT(putRequest("/api/tier2/appointments/apt1", { status: "checked-in" }), { params });
    expect(res.status).toBe(403);
  });

  it("updates status with timestamp on success", async () => {
    const res = await PUT(putRequest("/api/tier2/appointments/apt1", { status: "checked-in" }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Appointment.findByIdAndUpdate).toHaveBeenCalledWith(
      "apt1",
      { $set: expect.objectContaining({ status: "checked-in", checkedInAt: expect.any(Date) }) },
      { new: true }
    );
  });

  it("sets startedAt for in-progress status", async () => {
    await PUT(putRequest("/api/tier2/appointments/apt1", { status: "in-progress" }), { params });

    expect(Appointment.findByIdAndUpdate).toHaveBeenCalledWith(
      "apt1",
      { $set: expect.objectContaining({ status: "in-progress", startedAt: expect.any(Date) }) },
      { new: true }
    );
  });

  it("sets completedAt for completed status", async () => {
    await PUT(putRequest("/api/tier2/appointments/apt1", { status: "completed" }), { params });

    expect(Appointment.findByIdAndUpdate).toHaveBeenCalledWith(
      "apt1",
      { $set: expect.objectContaining({ status: "completed", completedAt: expect.any(Date) }) },
      { new: true }
    );
  });

  it("sets cancelledAt for cancelled status", async () => {
    await PUT(putRequest("/api/tier2/appointments/apt1", { status: "cancelled" }), { params });

    expect(Appointment.findByIdAndUpdate).toHaveBeenCalledWith(
      "apt1",
      { $set: expect.objectContaining({ status: "cancelled", cancelledAt: expect.any(Date) }) },
      { new: true }
    );
  });

  it("updates appointmentDate", async () => {
    await PUT(putRequest("/api/tier2/appointments/apt1", { appointmentDate: "2025-07-15" }), { params });

    expect(Appointment.findByIdAndUpdate).toHaveBeenCalledWith(
      "apt1",
      { $set: expect.objectContaining({ appointmentDate: expect.any(Date) }) },
      { new: true }
    );
  });

  it("links consultationId as ObjectId", async () => {
    await PUT(putRequest("/api/tier2/appointments/apt1", { consultationId: "507f1f77bcf86cd799439011" }), { params });

    expect(Appointment.findByIdAndUpdate).toHaveBeenCalledWith(
      "apt1",
      { $set: expect.objectContaining({ consultationId: expect.any(Object) }) },
      { new: true }
    );
  });
});

describe("DELETE /api/tier2/appointments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (Appointment.findById as any).mockResolvedValue({ ...mockAppointment, save: vi.fn() });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await DELETE(deleteRequest("/api/tier2/appointments/apt1"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when appointment not found", async () => {
    (Appointment.findById as any).mockResolvedValue(null);
    const res = await DELETE(deleteRequest("/api/tier2/appointments/apt1"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when appointment belongs to another clinic", async () => {
    (Appointment.findById as any).mockResolvedValue({
      ...mockAppointment,
      clinicId: { toString: () => "other-clinic" },
      save: vi.fn(),
    });
    const res = await DELETE(deleteRequest("/api/tier2/appointments/apt1"), { params });
    expect(res.status).toBe(403);
  });

  it("cancels appointment with cancelledAt timestamp", async () => {
    const apt = { ...mockAppointment, save: vi.fn() };
    (Appointment.findById as any).mockResolvedValue(apt);

    const res = await DELETE(deleteRequest("/api/tier2/appointments/apt1"), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.message).toContain("cancelled");
    expect(apt.status).toBe("cancelled");
    expect(apt.cancelledAt).toBeInstanceOf(Date);
    expect(apt.save).toHaveBeenCalled();
  });
});
