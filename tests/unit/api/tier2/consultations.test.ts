import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_DOCTOR_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

function makeChainable(data: any[] = []) {
  return {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(data),
  };
}

vi.mock("@/models/ConsultationDermatology", () => {
  const chainable = makeChainable();
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      countDocuments: vi.fn().mockResolvedValue(0),
      _chainable: chainable,
    },
  };
});

vi.mock("@/models/ConsultationCosmetology", () => {
  const chainable = makeChainable();
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      countDocuments: vi.fn().mockResolvedValue(0),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request } from "@/lib/auth/verify-request";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import { GET } from "@/app/api/tier2/consultations/route";

describe("GET /api/tier2/consultations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (ConsultationDermatology as any)._chainable.lean.mockResolvedValue([]);
    (ConsultationCosmetology as any)._chainable.lean.mockResolvedValue([]);
    (ConsultationDermatology.countDocuments as any).mockResolvedValue(0);
    (ConsultationCosmetology.countDocuments as any).mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/consultations"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a doctor", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    const res = await GET(getRequest("/api/tier2/consultations"));
    expect(res.status).toBe(403);
  });

  it("returns combined consultations list when no type filter", async () => {
    const dermData = [{ _id: "d1", consultationDate: new Date("2025-06-15") }];
    const cosmoData = [{ _id: "c1", consultationDate: new Date("2025-06-14") }];
    (ConsultationDermatology as any)._chainable.lean.mockResolvedValue(dermData);
    (ConsultationCosmetology as any)._chainable.lean.mockResolvedValue(cosmoData);
    (ConsultationDermatology.countDocuments as any).mockResolvedValue(1);
    (ConsultationCosmetology.countDocuments as any).mockResolvedValue(1);

    const res = await GET(getRequest("/api/tier2/consultations"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.consultations).toHaveLength(2);
    expect(body.data.pagination.total).toBe(2);
  });

  it("returns only dermatology when type=dermatology", async () => {
    const dermData = [{ _id: "d1", consultationDate: new Date() }];
    (ConsultationDermatology as any)._chainable.lean.mockResolvedValue(dermData);
    (ConsultationDermatology.countDocuments as any).mockResolvedValue(1);

    const res = await GET(getRequest("/api/tier2/consultations?type=dermatology"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.consultations).toHaveLength(1);
    expect(body.data.consultations[0].type).toBe("dermatology");
  });

  it("returns only cosmetology when type=cosmetology", async () => {
    const cosmoData = [{ _id: "c1", consultationDate: new Date() }];
    (ConsultationCosmetology as any)._chainable.lean.mockResolvedValue(cosmoData);
    (ConsultationCosmetology.countDocuments as any).mockResolvedValue(1);

    const res = await GET(getRequest("/api/tier2/consultations?type=cosmetology"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.consultations[0].type).toBe("cosmetology");
  });

  it("scopes queries by doctorId", async () => {
    await GET(getRequest("/api/tier2/consultations"));

    expect(ConsultationDermatology.find).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: MOCK_DOCTOR_ID })
    );
  });

  it("filters by today", async () => {
    await GET(getRequest("/api/tier2/consultations?filter=today"));

    expect(ConsultationDermatology.find).toHaveBeenCalledWith(
      expect.objectContaining({
        consultationDate: expect.objectContaining({ $gte: expect.any(Date) }),
      })
    );
  });

  it("filters by week", async () => {
    await GET(getRequest("/api/tier2/consultations?filter=week"));

    expect(ConsultationDermatology.find).toHaveBeenCalledWith(
      expect.objectContaining({
        consultationDate: expect.objectContaining({ $gte: expect.any(Date) }),
      })
    );
  });

  it("filters by month", async () => {
    await GET(getRequest("/api/tier2/consultations?filter=month"));

    expect(ConsultationDermatology.find).toHaveBeenCalledWith(
      expect.objectContaining({
        consultationDate: expect.objectContaining({ $gte: expect.any(Date) }),
      })
    );
  });

  it("filters by status", async () => {
    await GET(getRequest("/api/tier2/consultations?status=completed"));

    expect(ConsultationDermatology.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" })
    );
  });

  it("filters by patientId", async () => {
    await GET(getRequest("/api/tier2/consultations?patientId=pat1"));

    expect(ConsultationDermatology.find).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: "pat1" })
    );
  });

  it("filters by search on patient name", async () => {
    await GET(getRequest("/api/tier2/consultations?search=Ravi"));

    expect(ConsultationDermatology.find).toHaveBeenCalledWith(
      expect.objectContaining({
        "patientInfo.name": expect.objectContaining({ $regex: "Ravi" }),
      })
    );
  });
});
