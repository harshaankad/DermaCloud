import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

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
            startHour: 9, endHour: 12, slotDuration: 30,
            lunchStartHour: 13, lunchEndHour: 14, lunchEnabled: false,
          },
        }),
      }),
    }),
  },
}));

vi.mock("@/models/Appointment", () => ({
  default: {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue([]),
    }),
  },
}));

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Appointment from "@/models/Appointment";
import { GET } from "@/app/api/tier2/appointments/slots/route";

describe("GET /api/tier2/appointments/slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/appointments/slots?date=2025-12-01"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when no appointments permission", async () => {
    (hasPermission as any).mockReturnValue(false);
    const res = await GET(getRequest("/api/tier2/appointments/slots?date=2025-12-01"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when date is missing", async () => {
    const res = await GET(getRequest("/api/tier2/appointments/slots"));
    expect(res.status).toBe(400);
  });

  it("generates time slots based on clinic settings", async () => {
    const res = await GET(getRequest("/api/tier2/appointments/slots?date=2025-12-01"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.slots.length).toBeGreaterThan(0);
    expect(body.data.slots[0]).toHaveProperty("time");
    expect(body.data.slots[0]).toHaveProperty("available");
    expect(body.data.summary.total).toBeGreaterThan(0);
  });

  it("marks booked slots as unavailable", async () => {
    (Appointment.find as any).mockReturnValue({
      select: vi.fn().mockResolvedValue([
        { appointmentTime: "09:00" },
        { appointmentTime: "10:00" },
      ]),
    });

    const res = await GET(getRequest("/api/tier2/appointments/slots?date=2025-12-01"));
    const body = await parseJson(res);

    const slot0900 = body.data.slots.find((s: any) => s.time === "09:00");
    const slot1030 = body.data.slots.find((s: any) => s.time === "10:30");

    expect(slot0900.available).toBe(false);
    expect(slot1030.available).toBe(true);
  });

  it("returns settings alongside slots", async () => {
    const res = await GET(getRequest("/api/tier2/appointments/slots?date=2025-12-01"));
    const body = await parseJson(res);

    expect(body.data.settings.startHour).toBe(9);
    expect(body.data.settings.endHour).toBe(12);
    expect(body.data.settings.slotDuration).toBe(30);
  });
});
