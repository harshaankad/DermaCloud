import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, putRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("@/models/Clinic", () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          appointmentSettings: {
            startHour: 9, endHour: 18, slotDuration: 30,
            lunchStartHour: 13, lunchEndHour: 14, lunchEnabled: true,
          },
        }),
      }),
    }),
    findByIdAndUpdate: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        appointmentSettings: { startHour: 10, endHour: 20, slotDuration: 15 },
      }),
    }),
  },
}));

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Clinic from "@/models/Clinic";
import { GET, PUT } from "@/app/api/tier2/appointments/settings/route";

describe("GET /api/tier2/appointments/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/appointments/settings"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when no appointments permission", async () => {
    (hasPermission as any).mockReturnValue(false);
    const res = await GET(getRequest("/api/tier2/appointments/settings"));
    expect(res.status).toBe(403);
  });

  it("returns appointment settings", async () => {
    const res = await GET(getRequest("/api/tier2/appointments/settings"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.startHour).toBe(9);
    expect(body.data.endHour).toBe(18);
    expect(body.data.slotDuration).toBe(30);
  });

  it("returns defaults when no clinic settings exist", async () => {
    (Clinic.findById as any).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });

    const res = await GET(getRequest("/api/tier2/appointments/settings"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.startHour).toBe(9);
    expect(body.data.endHour).toBe(22);
    expect(body.data.lunchEnabled).toBe(true);
  });
});

describe("PUT /api/tier2/appointments/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await PUT(putRequest("/api/tier2/appointments/settings", { startHour: 9 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when start >= end hour", async () => {
    const res = await PUT(putRequest("/api/tier2/appointments/settings", {
      startHour: 18, endHour: 9, slotDuration: 30,
      lunchStartHour: 13, lunchEndHour: 14, lunchEnabled: false,
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when slot duration out of range", async () => {
    const res = await PUT(putRequest("/api/tier2/appointments/settings", {
      startHour: 9, endHour: 18, slotDuration: 3,
      lunchStartHour: 13, lunchEndHour: 14, lunchEnabled: false,
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when lunch break outside clinic hours", async () => {
    const res = await PUT(putRequest("/api/tier2/appointments/settings", {
      startHour: 10, endHour: 18, slotDuration: 30,
      lunchStartHour: 8, lunchEndHour: 9, lunchEnabled: true,
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when lunch start >= lunch end", async () => {
    const res = await PUT(putRequest("/api/tier2/appointments/settings", {
      startHour: 9, endHour: 18, slotDuration: 30,
      lunchStartHour: 14, lunchEndHour: 13, lunchEnabled: true,
    }));
    expect(res.status).toBe(400);
  });

  it("updates settings successfully", async () => {
    const res = await PUT(putRequest("/api/tier2/appointments/settings", {
      startHour: 10, endHour: 20, slotDuration: 15,
      lunchStartHour: 13, lunchEndHour: 14, lunchEnabled: true,
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Clinic.findByIdAndUpdate).toHaveBeenCalledWith(
      MOCK_CLINIC_ID,
      expect.objectContaining({
        $set: expect.objectContaining({
          "appointmentSettings.startHour": 10,
          "appointmentSettings.endHour": 20,
        }),
      }),
      { new: true }
    );
  });
});
