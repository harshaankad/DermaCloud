import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("@/models/InventoryTransaction", () => {
  const chainable = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    populate: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import InventoryTransaction from "@/models/InventoryTransaction";
import { GET } from "@/app/api/tier2/inventory/transactions/route";

describe("GET /api/tier2/inventory/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (InventoryTransaction as any)._chainable.populate.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/inventory/transactions"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when no pharmacy permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(false);
    const res = await GET(getRequest("/api/tier2/inventory/transactions"));
    expect(res.status).toBe(403);
  });

  it("returns transactions list", async () => {
    const mockTxs = [{ _id: "tx1", type: "stock-in", quantity: 10 }];
    (InventoryTransaction as any)._chainable.populate.mockResolvedValue(mockTxs);

    const res = await GET(getRequest("/api/tier2/inventory/transactions"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("filters by type when provided", async () => {
    await GET(getRequest("/api/tier2/inventory/transactions?type=stock-in"));

    expect(InventoryTransaction.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        type: "stock-in",
      })
    );
  });

  it("respects custom limit param", async () => {
    await GET(getRequest("/api/tier2/inventory/transactions?limit=5"));

    const chainable = (InventoryTransaction as any)._chainable;
    expect(chainable.limit).toHaveBeenCalledWith(5);
  });
});
