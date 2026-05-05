import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, mockDoctorAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/models/InventoryItem", () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request } from "@/lib/auth/verify-request";
import InventoryItem from "@/models/InventoryItem";
import { GET } from "@/app/api/tier2/inventory/search/route";

describe("GET /api/tier2/inventory/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (InventoryItem as any)._chainable.lean.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/inventory/search?q=cream"));
    expect(res.status).toBe(401);
  });

  it("returns empty array when query is too short", async () => {
    const res = await GET(getRequest("/api/tier2/inventory/search?q=a"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(InventoryItem.find).not.toHaveBeenCalled();
  });

  it("returns empty array when query is missing", async () => {
    const res = await GET(getRequest("/api/tier2/inventory/search"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("searches by name and genericName when query >= 2 chars", async () => {
    const mockResults = [{ _id: "i1", name: "Cream X", currentStock: 10 }];
    (InventoryItem as any)._chainable.lean.mockResolvedValue(mockResults);

    const res = await GET(getRequest("/api/tier2/inventory/search?q=cre"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(InventoryItem.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        status: { $ne: "discontinued" },
        $or: expect.arrayContaining([
          expect.objectContaining({ name: expect.any(Object) }),
          expect.objectContaining({ genericName: expect.any(Object) }),
        ]),
      })
    );
  });
});
