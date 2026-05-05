import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, postRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID, MOCK_USER_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/aws/signed-url", () => ({
  getSignedUrl: vi.fn().mockReturnValue("https://signed-url.example.com/image.jpg"),
}));

vi.mock("@/lib/sanitize", () => ({
  isValidObjectId: vi.fn().mockReturnValue(true),
}));

const mockPatient = {
  _id: "pat1",
  name: "Priya Sharma",
  age: 28,
  gender: "female",
};

vi.mock("@/models/Patient", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("@/models/Clinic", () => ({
  default: {},
}));

vi.mock("@/models/Appointment", () => ({
  default: { findByIdAndUpdate: vi.fn().mockResolvedValue({ _id: "apt1" }) },
}));

vi.mock("@/models/ConsultationCosmetology", () => {
  const chainable = {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      create: vi.fn(),
      findById: vi.fn(),
      find: vi.fn().mockReturnValue(chainable),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request } from "@/lib/auth/verify-request";
import Patient from "@/models/Patient";
import Appointment from "@/models/Appointment";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import { GET, POST } from "@/app/api/tier2/consultation/cosmetology/route";

describe("POST /api/tier2/consultation/cosmetology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (Patient.findById as any).mockResolvedValue(mockPatient);
    (ConsultationCosmetology.create as any).mockResolvedValue({ _id: "cosmo1" });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await POST(postRequest("/api/tier2/consultation/cosmetology", { patientId: "pat1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a doctor", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    const res = await POST(postRequest("/api/tier2/consultation/cosmetology", { patientId: "pat1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when patientId is missing", async () => {
    const res = await POST(postRequest("/api/tier2/consultation/cosmetology", { formData: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when patient not found", async () => {
    (Patient.findById as any).mockResolvedValue(null);
    const res = await POST(postRequest("/api/tier2/consultation/cosmetology", { patientId: "nonexistent", formData: {} }));
    expect(res.status).toBe(404);
  });

  it("creates consultation successfully", async () => {
    const res = await POST(postRequest("/api/tier2/consultation/cosmetology", {
      patientId: "pat1",
      formData: {
        skinType: "Type III",
        primaryConcern: "Pigmentation",
        procedureName: "Chemical Peel",
        basePrice: 2000,
        gstRate: 18,
      },
      consultationFee: 500,
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.consultationId).toBe("cosmo1");
    expect(ConsultationCosmetology.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        doctorId: MOCK_USER_ID,
        status: "completed",
      })
    );
  });

  it("marks linked appointment as completed", async () => {
    const res = await POST(postRequest("/api/tier2/consultation/cosmetology", {
      patientId: "pat1",
      appointmentId: "apt1",
      formData: { procedureName: "Laser" },
    }));
    const body = await parseJson(res);

    expect(body.data.appointmentCompleted).toBe(true);
    expect(Appointment.findByIdAndUpdate).toHaveBeenCalledWith(
      "apt1",
      expect.objectContaining({ status: "completed" }),
      { new: true }
    );
  });
});

describe("GET /api/tier2/consultation/cosmetology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/consultation/cosmetology?consultationId=c1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid consultationId", async () => {
    const { isValidObjectId } = await import("@/lib/sanitize");
    (isValidObjectId as any).mockReturnValue(false);

    const res = await GET(getRequest("/api/tier2/consultation/cosmetology?consultationId=bad-id"));
    expect(res.status).toBe(400);

    (isValidObjectId as any).mockReturnValue(true);
  });

  it("returns 404 when consultation not found", async () => {
    (ConsultationCosmetology.findById as any).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(null),
      }),
    });
    const res = await GET(getRequest("/api/tier2/consultation/cosmetology?consultationId=nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns consultation with signed URLs", async () => {
    const mockConsultation = {
      _id: "cosmo1",
      images: [{ url: "https://s3.amazonaws.com/bucket/img.jpg" }],
      customFields: {},
      toObject: vi.fn().mockReturnValue({
        _id: "cosmo1",
        images: [{ url: "https://s3.amazonaws.com/bucket/img.jpg" }],
        customFields: {},
      }),
    };
    (ConsultationCosmetology.findById as any).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockConsultation),
      }),
    });

    const res = await GET(getRequest("/api/tier2/consultation/cosmetology?consultationId=cosmo1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.images[0].url).toContain("signed-url");
  });

  it("returns patient consultations when patientId provided", async () => {
    (ConsultationCosmetology as any)._chainable.lean.mockResolvedValue([
      { _id: "c1", images: [], customFields: {} },
    ]);

    const res = await GET(getRequest("/api/tier2/consultation/cosmetology?patientId=pat1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("returns all clinic consultations when no params", async () => {
    (ConsultationCosmetology as any)._chainable.lean.mockResolvedValue([]);

    const res = await GET(getRequest("/api/tier2/consultation/cosmetology"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toBeDefined();
  });
});
