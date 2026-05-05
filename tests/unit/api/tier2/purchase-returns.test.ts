import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, postRequest, parseJson, mockDoctorAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/models/PurchaseReturn", () => {
  const chainable = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  };
  const MockPR = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data);
    this.save = vi.fn().mockResolvedValue(undefined);
  }) as any;
  MockPR.find = vi.fn().mockReturnValue(chainable);
  MockPR.countDocuments = vi.fn().mockResolvedValue(0);
  MockPR._chainable = chainable;
  return { default: MockPR };
});

vi.mock("@/models/InventoryItem", () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/models/InventoryTransaction", () => ({
  default: { create: vi.fn().mockResolvedValue(undefined) },
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import PurchaseReturn from "@/models/PurchaseReturn";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";
import { GET, POST } from "@/app/api/tier2/purchase-returns/route";

describe("GET /api/tier2/purchase-returns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (PurchaseReturn as any)._chainable.lean.mockResolvedValue([]);
    (PurchaseReturn.countDocuments as any).mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/purchase-returns"));
    expect(res.status).toBe(401);
  });

  it("returns paginated list", async () => {
    const mockReturns = [{ _id: "pr1", supplierName: "Supplier A" }];
    (PurchaseReturn as any)._chainable.lean.mockResolvedValue(mockReturns);
    (PurchaseReturn.countDocuments as any).mockResolvedValue(1);

    const res = await GET(getRequest("/api/tier2/purchase-returns?page=1&limit=20"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.returns).toHaveLength(1);
    expect(body.data.pagination.total).toBe(1);
  });

  it("filters by date range", async () => {
    await GET(getRequest("/api/tier2/purchase-returns?from=2025-01-01&to=2025-01-31"));

    expect(PurchaseReturn.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        invoiceDate: expect.objectContaining({
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        }),
      })
    );
  });
});

describe("POST /api/tier2/purchase-returns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (InventoryItem.findOne as any).mockResolvedValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await POST(postRequest("/api/tier2/purchase-returns", { supplierName: "X" }));
    expect(res.status).toBe(401);
  });

  it("creates purchase return and deducts stock when item found", async () => {
    const invItem = {
      _id: "inv1",
      name: "Cream",
      currentStock: 50,
      status: "active",
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockResolvedValue(invItem);

    const res = await POST(postRequest("/api/tier2/purchase-returns", {
      supplierName: "Supplier A",
      supplierInvNo: "SUP-001",
      items: [{ itemName: "Cream", quantity: 5, unitPrice: 80 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(invItem.currentStock).toBe(45);
    expect(invItem.save).toHaveBeenCalled();
    expect(InventoryTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stock-out", quantity: 5 })
    );
  });

  it("sets item to out-of-stock when stock reaches 0", async () => {
    const invItem = {
      _id: "inv1",
      name: "Cream",
      currentStock: 5,
      status: "active",
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockResolvedValue(invItem);

    await POST(postRequest("/api/tier2/purchase-returns", {
      supplierName: "Supplier A",
      items: [{ itemName: "Cream", quantity: 5, unitPrice: 80 }],
    }));

    expect(invItem.currentStock).toBe(0);
    expect(invItem.status).toBe("out-of-stock");
  });

  it("skips stock deduction when item not found in inventory", async () => {
    (InventoryItem.findOne as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/tier2/purchase-returns", {
      supplierName: "Supplier A",
      items: [{ itemName: "UnknownItem", quantity: 5, unitPrice: 80 }],
    }));

    expect(res.status).toBe(201);
    expect(InventoryTransaction.create).not.toHaveBeenCalled();
  });
});
