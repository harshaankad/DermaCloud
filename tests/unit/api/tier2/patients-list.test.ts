import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockPatients = [
  { patientId: "P0001", name: "Ravi Kumar", age: 30, gender: "male", phone: "9876543210" },
  { patientId: "P0002", name: "Priya Sharma", age: 25, gender: "female", phone: "9876543211" },
];

vi.mock("@/models/Patient", () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      countDocuments: vi.fn(),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Patient from "@/models/Patient";
import { GET } from "@/app/api/tier2/patients/list/route";

describe("GET /api/tier2/patients/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (Patient as any)._chainable.limit.mockResolvedValue(mockPatients);
    (Patient.countDocuments as any).mockResolvedValue(2);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);

    const res = await GET(getRequest("/api/tier2/patients/list"));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
  });

  it("returns 403 when frontdesk lacks patients permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(false);

    const res = await GET(getRequest("/api/tier2/patients/list"));
    const body = await parseJson(res);

    expect(res.status).toBe(403);
  });

  it("returns paginated patient list", async () => {
    const res = await GET(getRequest("/api/tier2/patients/list?page=1&limit=20"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.patients).toHaveLength(2);
    expect(body.data.pagination.total).toBe(2);
    expect(body.data.pagination.page).toBe(1);
  });

  it("passes search query to filter", async () => {
    await GET(getRequest("/api/tier2/patients/list?search=Ravi"));

    expect(Patient.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ name: expect.any(Object) }),
        ]),
      })
    );
  });

  it("filters by clinicId to enforce data isolation", async () => {
    await GET(getRequest("/api/tier2/patients/list"));

    expect(Patient.find).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: mockDoctorAuth.clinicId })
    );
  });
});
