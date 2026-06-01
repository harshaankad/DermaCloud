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
  name: "Ravi Kumar",
  age: 30,
  gender: "male",
};

vi.mock("@/models/Patient", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("@/models/Clinic", () => ({
  default: {},
}));

vi.mock("@/models/ConsultationDermatology", () => {
  const chainable = {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
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
import ConsultationDermatology from "@/models/ConsultationDermatology";
import { GET, POST } from "@/app/api/tier2/consultation/dermatology/route";

describe("POST /api/tier2/consultation/dermatology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (Patient.findById as any).mockResolvedValue(mockPatient);
    (ConsultationDermatology.create as any).mockResolvedValue({ _id: "cons1" });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", { patientId: "pat1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a doctor", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", { patientId: "pat1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when patientId is missing", async () => {
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", { formData: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when patient not found", async () => {
    (Patient.findById as any).mockResolvedValue(null);
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", { patientId: "nonexistent", formData: {} }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when more than 2 issues", async () => {
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", {
      patientId: "pat1",
      formData: { _multiIssue: true, _issues: [{}, {}, {}] },
    }));
    expect(res.status).toBe(400);
  });

  it("creates consultation successfully", async () => {
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", {
      patientId: "pat1",
      formData: {
        complaint: "Itchy skin",
        provisional: "Eczema",
        topicals: "Steroid cream",
        severity: "mild",
      },
      consultationFee: 500,
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.consultationId).toBe("cons1");
    expect(ConsultationDermatology.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        doctorId: MOCK_USER_ID,
        status: "completed",
      })
    );
  });

  it("creates consultation with dermoscope and clinical images", async () => {
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", {
      patientId: "pat1",
      formData: { complaint: "Rash" },
      dermoscopeImageUrls: ["https://s3.amazonaws.com/bucket/derm1.jpg"],
      clinicalImageUrls: ["https://s3.amazonaws.com/bucket/clin1.jpg", "https://s3.amazonaws.com/bucket/clin2.jpg"],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const createCall = (ConsultationDermatology.create as any).mock.calls[0][0];
    expect(createCall.images).toHaveLength(3);
    expect(createCall.images[0].type).toBe("dermoscopic");
    expect(createCall.images[1].type).toBe("clinical");
  });

  it("creates consultation with AI analysis data", async () => {
    // Shape mirrors what /api/tier2/upload returns as finalResult and what the
    // dermatology page forwards verbatim: probability is a 0-1 fraction.
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", {
      patientId: "pat1",
      formData: { complaint: "Spots" },
      aiAnalysis: {
        predictions: [
          { condition: "nevus", probability: 0.8, confidence: "high" },
          { condition: "melanoma", probability: 0.15, confidence: "low" },
        ],
        topPrediction: { condition: "nevus", probability: 0.8, confidence: "high" },
      },
    }));

    expect(res.status).toBe(200);
    const createCall = (ConsultationDermatology.create as any).mock.calls[0][0];
    expect(createCall.dermoscopeFindings.aiResults).toBeDefined();
    expect(createCall.dermoscopeFindings.aiResults.topPrediction).toBe("nevus");
    expect(createCall.dermoscopeFindings.aiResults.confidence).toBe(0.8);
    expect(createCall.dermoscopeFindings.aiResults.predictions).toEqual([
      { condition: "nevus", probability: 0.8 },
      { condition: "melanoma", probability: 0.15 },
    ]);
  });

  it("drops predictions whose probability is NaN/null so Mongoose cast never fails", async () => {
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", {
      patientId: "pat1",
      formData: { complaint: "Spots" },
      aiAnalysis: {
        predictions: [
          { condition: "nevus", probability: 0.8 },
          { condition: "broken", probability: NaN },
          { condition: "alsoBroken", probability: null },
          { condition: "stringy", probability: "0.42" },
        ],
        topPrediction: { condition: "nevus", probability: 0.8 },
      },
    }));

    expect(res.status).toBe(200);
    const createCall = (ConsultationDermatology.create as any).mock.calls[0][0];
    const stored = createCall.dermoscopeFindings.aiResults.predictions;
    for (const p of stored) {
      expect(Number.isFinite(p.probability)).toBe(true);
    }
    expect(stored.map((p: any) => p.condition)).toEqual(["nevus", "stringy"]);
  });

  it("creates consultation with follow-up date", async () => {
    const res = await POST(postRequest("/api/tier2/consultation/dermatology", {
      patientId: "pat1",
      formData: {
        complaint: "Eczema",
        date: "2025-07-01",
        reason: "Follow-up check",
      },
    }));

    expect(res.status).toBe(200);
    const createCall = (ConsultationDermatology.create as any).mock.calls[0][0];
    expect(createCall.followUp).toBeDefined();
    expect(createCall.followUp.reason).toBe("Follow-up check");
  });

  it("splits differentials by comma", async () => {
    await POST(postRequest("/api/tier2/consultation/dermatology", {
      patientId: "pat1",
      formData: {
        complaint: "Rash",
        provisional: "Eczema",
        differentials: "Psoriasis, Dermatitis, Contact allergy",
      },
    }));

    const createCall = (ConsultationDermatology.create as any).mock.calls[0][0];
    expect(createCall.diagnosis.differentials).toEqual(["Psoriasis", "Dermatitis", "Contact allergy"]);
  });

  it("returns 500 when ConsultationDermatology.create throws", async () => {
    (ConsultationDermatology.create as any).mockRejectedValue(new Error("DB error"));

    const res = await POST(postRequest("/api/tier2/consultation/dermatology", {
      patientId: "pat1",
      formData: { complaint: "Test" },
    }));

    expect(res.status).toBe(500);
  });
});

describe("GET /api/tier2/consultation/dermatology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/consultation/dermatology?consultationId=cons1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no consultationId or patientId", async () => {
    const res = await GET(getRequest("/api/tier2/consultation/dermatology"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when consultation not found", async () => {
    (ConsultationDermatology.findById as any).mockResolvedValue(null);
    const res = await GET(getRequest("/api/tier2/consultation/dermatology?consultationId=nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns consultation with signed image URLs", async () => {
    const mockConsultation = {
      _id: "cons1",
      images: [{ url: "https://s3.amazonaws.com/bucket/img.jpg", type: "clinical" }],
      customFields: {},
      populate: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({
        _id: "cons1",
        images: [{ url: "https://s3.amazonaws.com/bucket/img.jpg", type: "clinical" }],
        customFields: {},
      }),
    };
    (ConsultationDermatology.findById as any).mockResolvedValue(mockConsultation);

    const res = await GET(getRequest("/api/tier2/consultation/dermatology?consultationId=cons1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.images[0].url).toContain("signed-url");
  });

  it("returns previous visits for a patientId", async () => {
    (ConsultationDermatology as any)._chainable.lean.mockResolvedValue([
      { _id: "c1", consultationDate: new Date(), images: [] },
    ]);

    const res = await GET(getRequest("/api/tier2/consultation/dermatology?patientId=pat1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("returns 400 for invalid consultationId format", async () => {
    const { isValidObjectId } = await import("@/lib/sanitize");
    (isValidObjectId as any).mockReturnValue(false);

    const res = await GET(getRequest("/api/tier2/consultation/dermatology?consultationId=bad-id"));
    expect(res.status).toBe(400);

    (isValidObjectId as any).mockReturnValue(true);
  });

  it("signs multi-issue image URLs for previous visits", async () => {
    (ConsultationDermatology as any)._chainable.lean.mockResolvedValue([
      {
        _id: "c1",
        consultationDate: new Date(),
        images: [{ url: "https://s3.amazonaws.com/bucket/img1.jpg" }],
        customFields: {
          _multiIssue: true,
          _issues: [
            {
              dermoscopeImageUrls: ["https://s3.amazonaws.com/bucket/derm1.jpg"],
              clinicalImageUrls: ["https://s3.amazonaws.com/bucket/clin1.jpg"],
            },
          ],
        },
      },
    ]);

    const res = await GET(getRequest("/api/tier2/consultation/dermatology?patientId=pat1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data[0].images[0].url).toContain("signed-url");
    expect(body.data[0].customFields._issues[0].dermoscopeImageUrls[0]).toContain("signed-url");
    expect(body.data[0].customFields._issues[0].clinicalImageUrls[0]).toContain("signed-url");
  });

  it("signs multi-issue URLs for single consultation GET", async () => {
    const mockConsultation = {
      _id: "cons2",
      images: [],
      customFields: {
        _multiIssue: true,
        _issues: [
          {
            dermoscopeImageUrls: ["https://s3.amazonaws.com/bucket/d1.jpg"],
            clinicalImageUrls: ["https://s3.amazonaws.com/bucket/c1.jpg"],
          },
        ],
      },
      populate: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({
        _id: "cons2",
        images: [],
        customFields: {
          _multiIssue: true,
          _issues: [
            {
              dermoscopeImageUrls: ["https://s3.amazonaws.com/bucket/d1.jpg"],
              clinicalImageUrls: ["https://s3.amazonaws.com/bucket/c1.jpg"],
            },
          ],
        },
      }),
    };
    (ConsultationDermatology.findById as any).mockResolvedValue(mockConsultation);

    const res = await GET(getRequest("/api/tier2/consultation/dermatology?consultationId=cons2"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.customFields._issues[0].dermoscopeImageUrls[0]).toContain("signed-url");
  });

  it("returns empty data array when previous visits query throws", async () => {
    (ConsultationDermatology as any)._chainable.lean.mockRejectedValue(new Error("DB error"));

    const res = await GET(getRequest("/api/tier2/consultation/dermatology?patientId=pat1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});
