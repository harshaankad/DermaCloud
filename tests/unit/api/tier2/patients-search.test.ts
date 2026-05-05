import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, MOCK_CLINIC_ID } from "../_helpers";
import { NextResponse } from "next/server";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/middleware", () => ({
  authMiddleware: vi.fn(),
}));

vi.mock("@/models/Patient", () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      _chainable: chainable,
    },
  };
});

import { authMiddleware } from "@/lib/auth/middleware";
import Patient from "@/models/Patient";
import { GET } from "@/app/api/tier2/patients/search/route";

const mockUser = { userId: "user1", email: "doc@test.com", tier: "tier2" as const, clinicId: MOCK_CLINIC_ID, jti: "x" };

describe("GET /api/tier2/patients/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authMiddleware as any).mockResolvedValue({ user: mockUser });
    (Patient as any)._chainable.limit.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    (authMiddleware as any).mockResolvedValue(
      NextResponse.json({ success: false, message: "No token" }, { status: 401 })
    );
    const res = await GET(getRequest("/api/tier2/patients/search?q=ravi"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not tier2", async () => {
    (authMiddleware as any).mockResolvedValue({ user: { ...mockUser, tier: "tier1" } });
    const res = await GET(getRequest("/api/tier2/patients/search?q=ravi"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when no clinicId", async () => {
    (authMiddleware as any).mockResolvedValue({ user: { ...mockUser, clinicId: undefined } });
    const res = await GET(getRequest("/api/tier2/patients/search?q=ravi"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when search query is missing", async () => {
    const res = await GET(getRequest("/api/tier2/patients/search"));
    expect(res.status).toBe(400);
  });

  it("searches by name, phone, and patientId", async () => {
    const mockResults = [{ _id: "p1", name: "Ravi", patientId: "P001" }];
    (Patient as any)._chainable.limit.mockResolvedValue(mockResults);

    const res = await GET(getRequest("/api/tier2/patients/search?q=Ravi"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.patients).toHaveLength(1);
    expect(body.data.count).toBe(1);

    expect(Patient.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        $or: expect.arrayContaining([
          expect.objectContaining({ name: expect.any(Object) }),
          expect.objectContaining({ phone: expect.any(Object) }),
          expect.objectContaining({ patientId: expect.any(Object) }),
        ]),
      })
    );
  });
});
