import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, putRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/models/Clinic", () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import Clinic from "@/models/Clinic";
import { GET, PUT } from "@/app/api/tier2/clinic/gstin/route";

describe("GET /api/tier2/clinic/gstin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (Clinic.findById as any).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ gstin: "29ABCDE1234F1Z5" }) }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/clinic/gstin"));
    expect(res.status).toBe(401);
  });

  it("returns the clinic GSTIN", async () => {
    const res = await GET(getRequest("/api/tier2/clinic/gstin"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.gstin).toBe("29ABCDE1234F1Z5");
  });

  it("returns empty string when clinic has no GSTIN", async () => {
    (Clinic.findById as any).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });

    const res = await GET(getRequest("/api/tier2/clinic/gstin"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.gstin).toBe("");
  });

  it("returns 500 on database error", async () => {
    (Clinic.findById as any).mockImplementation(() => { throw new Error("db down"); });
    const res = await GET(getRequest("/api/tier2/clinic/gstin"));
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/tier2/clinic/gstin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (Clinic.findByIdAndUpdate as any).mockReturnValue({
      select: vi.fn().mockResolvedValue({ gstin: "29ABCDE1234F1Z5" }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await PUT(putRequest("/api/tier2/clinic/gstin", { gstin: "29ABCDE1234F1Z5" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not a doctor", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    const res = await PUT(putRequest("/api/tier2/clinic/gstin", { gstin: "29ABCDE1234F1Z5" }));
    expect(res.status).toBe(403);
  });

  it("updates GSTIN and uppercases the value", async () => {
    (Clinic.findByIdAndUpdate as any).mockReturnValue({
      select: vi.fn().mockResolvedValue({ gstin: "29ABCDE1234F1Z5" }),
    });

    const res = await PUT(putRequest("/api/tier2/clinic/gstin", { gstin: "29abcde1234f1z5" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.gstin).toBe("29ABCDE1234F1Z5");
    expect(Clinic.findByIdAndUpdate).toHaveBeenCalledWith(
      MOCK_CLINIC_ID,
      { $set: { gstin: "29ABCDE1234F1Z5" } },
      { new: true }
    );
  });

  it("allows clearing the GSTIN with an empty string", async () => {
    (Clinic.findByIdAndUpdate as any).mockReturnValue({
      select: vi.fn().mockResolvedValue({ gstin: "" }),
    });

    const res = await PUT(putRequest("/api/tier2/clinic/gstin", { gstin: "" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.gstin).toBe("");
  });

  it("treats a non-string gstin as empty", async () => {
    (Clinic.findByIdAndUpdate as any).mockReturnValue({
      select: vi.fn().mockResolvedValue({ gstin: "" }),
    });

    const res = await PUT(putRequest("/api/tier2/clinic/gstin", { gstin: 12345 }));
    expect(res.status).toBe(200);
    expect(Clinic.findByIdAndUpdate).toHaveBeenCalledWith(
      MOCK_CLINIC_ID,
      { $set: { gstin: "" } },
      { new: true }
    );
  });

  it("returns 400 when GSTIN exceeds the length limit", async () => {
    const res = await PUT(putRequest("/api/tier2/clinic/gstin", { gstin: "A".repeat(25) }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("too long");
  });

  it("returns 404 when the clinic is not found", async () => {
    (Clinic.findByIdAndUpdate as any).mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    });

    const res = await PUT(putRequest("/api/tier2/clinic/gstin", { gstin: "29ABCDE1234F1Z5" }));
    expect(res.status).toBe(404);
  });

  it("returns 500 on database error", async () => {
    (Clinic.findByIdAndUpdate as any).mockImplementation(() => { throw new Error("db down"); });
    const res = await PUT(putRequest("/api/tier2/clinic/gstin", { gstin: "29ABCDE1234F1Z5" }));
    expect(res.status).toBe(500);
  });
});
