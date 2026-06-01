import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, mockDoctorAuth, mockFailedAuth } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

function findByIdChain(result: any) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(result) }) };
}

function findOneChain(result: any) {
  return {
    select: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

vi.mock("@/models/ConsultationDermatology", () => ({
  default: { findById: vi.fn(), findOne: vi.fn() },
}));

vi.mock("@/models/ConsultationCosmetology", () => ({
  default: { findById: vi.fn(), findOne: vi.fn() },
}));

vi.mock("@/models/Appointment", () => ({
  default: { findById: vi.fn() },
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import Appointment from "@/models/Appointment";
import { GET } from "@/app/api/tier2/sales/prescription/route";

describe("GET /api/tier2/sales/prescription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (ConsultationDermatology.findOne as any).mockReturnValue(findOneChain(null));
    (ConsultationCosmetology.findOne as any).mockReturnValue(findOneChain(null));
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when patientId is missing", async () => {
    const res = await GET(getRequest("/api/tier2/sales/prescription"));
    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.message).toContain("patientId is required");
  });

  it("returns dermatology consultation when found via appointmentId", async () => {
    (Appointment.findById as any).mockReturnValue(findByIdChain({ consultationId: "c1" }));
    (ConsultationDermatology.findById as any).mockReturnValue(findByIdChain({ _id: "c1", treatmentPlan: {} }));
    (ConsultationCosmetology.findById as any).mockReturnValue(findByIdChain(null));

    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1&appointmentId=a1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.type).toBe("dermatology");
    expect(body.data.consultation._id).toBe("c1");
  });

  it("returns cosmetology consultation when found via appointmentId", async () => {
    (Appointment.findById as any).mockReturnValue(findByIdChain({ consultationId: "c2" }));
    (ConsultationDermatology.findById as any).mockReturnValue(findByIdChain(null));
    (ConsultationCosmetology.findById as any).mockReturnValue(findByIdChain({ _id: "c2", procedure: {} }));

    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1&appointmentId=a1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.type).toBe("cosmetology");
  });

  it("falls through to date search when appointment has no linked consultation", async () => {
    (Appointment.findById as any).mockReturnValue(findByIdChain({ consultationId: null }));

    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1&appointmentId=a1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
  });

  it("returns null when no consultation exists for the patient", async () => {
    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it("prefers dermatology in same-day fallback when both exist", async () => {
    (ConsultationDermatology.findOne as any).mockReturnValue(
      findOneChain({ _id: "d1", consultationDate: "2026-05-10" })
    );
    (ConsultationCosmetology.findOne as any).mockReturnValue(
      findOneChain({ _id: "c1", consultationDate: "2026-05-10" })
    );

    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1&date=2026-05-10"));
    const body = await parseJson(res);

    expect(body.data.type).toBe("dermatology");
    expect(body.data.consultation._id).toBe("d1");
  });

  it("latest mode picks the cosmetology consultation when it is newer", async () => {
    (ConsultationDermatology.findOne as any).mockReturnValue(
      findOneChain({ _id: "d1", consultationDate: "2026-01-01" })
    );
    (ConsultationCosmetology.findOne as any).mockReturnValue(
      findOneChain({ _id: "c1", consultationDate: "2026-05-01" })
    );

    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1&latest=true"));
    const body = await parseJson(res);

    expect(body.data.type).toBe("cosmetology");
    expect(body.data.consultation._id).toBe("c1");
  });

  it("latest mode picks the dermatology consultation when it is newer", async () => {
    (ConsultationDermatology.findOne as any).mockReturnValue(
      findOneChain({ _id: "d1", consultationDate: "2026-05-01" })
    );
    (ConsultationCosmetology.findOne as any).mockReturnValue(
      findOneChain({ _id: "c1", consultationDate: "2026-01-01" })
    );

    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1&latest=true"));
    const body = await parseJson(res);

    expect(body.data.type).toBe("dermatology");
    expect(body.data.consultation._id).toBe("d1");
  });

  it("latest mode returns cosmetology when only cosmetology exists", async () => {
    (ConsultationCosmetology.findOne as any).mockReturnValue(
      findOneChain({ _id: "c1", consultationDate: "2026-05-01" })
    );

    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1&latest=true"));
    const body = await parseJson(res);

    expect(body.data.type).toBe("cosmetology");
  });

  it("returns 500 on database error", async () => {
    (ConsultationDermatology.findOne as any).mockImplementation(() => { throw new Error("db down"); });
    const res = await GET(getRequest("/api/tier2/sales/prescription?patientId=p1"));
    expect(res.status).toBe(500);
  });
});
