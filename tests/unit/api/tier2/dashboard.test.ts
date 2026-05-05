import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
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

function makeChainable(data: any[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(data),
    populate: vi.fn().mockReturnThis(),
  };
}

vi.mock("@/models/ConsultationDermatology", () => {
  const chainable = makeChainable();
  return {
    default: {
      countDocuments: vi.fn().mockResolvedValue(0),
      find: vi.fn().mockReturnValue(chainable),
      _chainable: chainable,
    },
  };
});

vi.mock("@/models/ConsultationCosmetology", () => {
  const chainable = makeChainable();
  return {
    default: {
      countDocuments: vi.fn().mockResolvedValue(0),
      find: vi.fn().mockReturnValue(chainable),
      _chainable: chainable,
    },
  };
});

vi.mock("@/models/Appointment", () => {
  const chainable = makeChainable();
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      aggregate: vi.fn().mockResolvedValue([]),
      _chainable: chainable,
    },
  };
});

vi.mock("@/models/Sale", () => ({
  default: { aggregate: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/models/Patient", () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(0) },
}));

vi.mock("@/models/InventoryItem", () => {
  const chainable = makeChainable();
  return {
    default: {
      aggregate: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockReturnValue(chainable),
      countDocuments: vi.fn().mockResolvedValue(0),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request } from "@/lib/auth/verify-request";
import { GET } from "@/app/api/tier2/dashboard/route";

describe("GET /api/tier2/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/dashboard"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a doctor", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    const res = await GET(getRequest("/api/tier2/dashboard"));
    expect(res.status).toBe(403);
  });

  it("returns dashboard data with all sections", async () => {
    const res = await GET(getRequest("/api/tier2/dashboard"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.usage).toBeDefined();
    expect(body.data.todayVisits).toBeDefined();
    expect(body.data.appointments).toBeDefined();
    expect(body.data.pharmacy).toBeDefined();
    expect(body.data.sales).toBeDefined();
  });

  it("skips heavy queries in lite mode", async () => {
    const res = await GET(getRequest("/api/tier2/dashboard?lite=true"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.usage.totalPatients).toBe(0);
    expect(body.data.pharmacy.totalItems).toBe(0);
  });

  it("returns default sales stats when no sales today", async () => {
    const res = await GET(getRequest("/api/tier2/dashboard"));
    const body = await parseJson(res);

    expect(body.data.sales).toEqual({
      totalSales: 0,
      totalRevenue: 0,
      totalPaid: 0,
      totalDue: 0,
      paidCount: 0,
      pendingCount: 0,
    });
  });
});
