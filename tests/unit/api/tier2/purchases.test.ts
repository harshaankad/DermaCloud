import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, postRequest, parseJson, mockDoctorAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

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
      startSession: vi.fn().mockResolvedValue({
        startTransaction: vi.fn(),
        commitTransaction: vi.fn().mockResolvedValue(undefined),
        abortTransaction: vi.fn().mockResolvedValue(undefined),
        endSession: vi.fn(),
      }),
    },
  };
});

vi.mock("@/models/Purchase", () => {
  const chainable = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  };
  const MockPurchase = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data);
    this.save = vi.fn().mockResolvedValue(undefined);
  }) as any;
  MockPurchase.find = vi.fn().mockReturnValue(chainable);
  MockPurchase.countDocuments = vi.fn().mockResolvedValue(0);
  MockPurchase._chainable = chainable;
  return { default: MockPurchase };
});

vi.mock("@/models/InventoryItem", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue(null) }),
    create: vi.fn().mockResolvedValue([{ _id: "new-item-1" }]),
  },
}));

vi.mock("@/models/InventoryTransaction", () => ({
  default: { create: vi.fn().mockResolvedValue(undefined) },
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import Purchase from "@/models/Purchase";
import { GET, POST } from "@/app/api/tier2/purchases/route";

describe("GET /api/tier2/purchases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (Purchase as any)._chainable.lean.mockResolvedValue([]);
    (Purchase.countDocuments as any).mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/purchases"));
    expect(res.status).toBe(401);
  });

  it("returns paginated purchases list", async () => {
    const mockPurchases = [{ _id: "p1", supplierName: "Supplier A" }];
    (Purchase as any)._chainable.lean.mockResolvedValue(mockPurchases);
    (Purchase.countDocuments as any).mockResolvedValue(1);

    const res = await GET(getRequest("/api/tier2/purchases?page=1&limit=20"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.purchases).toHaveLength(1);
    expect(body.data.pagination.total).toBe(1);
  });

  it("filters by date range and supplier", async () => {
    await GET(getRequest("/api/tier2/purchases?from=2025-01-01&to=2025-01-31&supplier=Pharma"));

    expect(Purchase.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        invoiceDate: expect.objectContaining({ $gte: expect.any(Date), $lte: expect.any(Date) }),
        supplierName: expect.objectContaining({ $regex: "Pharma" }),
      })
    );
  });
});

describe("POST /api/tier2/purchases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await POST(postRequest("/api/tier2/purchases", { supplierName: "X" }));
    expect(res.status).toBe(401);
  });

  it("creates purchase successfully with empty items", async () => {
    const res = await POST(postRequest("/api/tier2/purchases", {
      supplierName: "Pharma Corp",
      supplierInvNo: "INV-100",
      items: [],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it("creates new inventory item when item not found", async () => {
    const InventoryItem = (await import("@/models/InventoryItem")).default;
    const InventoryTransaction = (await import("@/models/InventoryTransaction")).default;

    (InventoryItem.findOne as any).mockReturnValue({ session: vi.fn().mockResolvedValue(null) });
    (InventoryItem.create as any).mockResolvedValue([{ _id: "new-item-1" }]);

    const res = await POST(postRequest("/api/tier2/purchases", {
      supplierName: "MedSupply",
      supplierInvNo: "SUP-001",
      items: [{ itemName: "NewDrug", quantity: 20, unitPrice: 50, mrp: 80, gstRate: 12 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(InventoryItem.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "NewDrug",
          clinicId: MOCK_CLINIC_ID,
          currentStock: 20,
        }),
      ]),
      expect.objectContaining({ session: expect.anything() })
    );
    expect(InventoryTransaction.create).toHaveBeenCalled();
  });

  it("updates existing inventory item stock on purchase", async () => {
    const InventoryItem = (await import("@/models/InventoryItem")).default;

    const existingItem = {
      _id: "existing-1",
      name: "OldDrug",
      currentStock: 30,
      costPrice: 40,
      sellingPrice: 70,
      status: "active",
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockReturnValue({ session: vi.fn().mockResolvedValue(existingItem) });

    const res = await POST(postRequest("/api/tier2/purchases", {
      supplierName: "MedSupply",
      supplierInvNo: "SUP-002",
      items: [{ itemName: "OldDrug", quantity: 10, unitPrice: 45, mrp: 75 }],
    }));

    expect(res.status).toBe(201);
    expect(existingItem.currentStock).toBe(40);
    expect(existingItem.costPrice).toBe(45);
    expect(existingItem.sellingPrice).toBe(75);
    expect(existingItem.save).toHaveBeenCalled();
  });

  it("reactivates out-of-stock item when restocked", async () => {
    const InventoryItem = (await import("@/models/InventoryItem")).default;

    const existingItem = {
      _id: "existing-2",
      name: "OutItem",
      currentStock: 0,
      costPrice: 30,
      status: "out-of-stock",
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockReturnValue({ session: vi.fn().mockResolvedValue(existingItem) });

    await POST(postRequest("/api/tier2/purchases", {
      supplierName: "MedSupply",
      items: [{ itemName: "OutItem", quantity: 5, unitPrice: 30 }],
    }));

    expect(existingItem.currentStock).toBe(5);
    expect(existingItem.status).toBe("active");
  });

  it("skips items with empty itemName", async () => {
    const InventoryItem = (await import("@/models/InventoryItem")).default;

    const res = await POST(postRequest("/api/tier2/purchases", {
      supplierName: "MedSupply",
      items: [{ itemName: "", quantity: 10 }],
    }));

    expect(res.status).toBe(201);
    expect(InventoryItem.findOne).not.toHaveBeenCalled();
  });
});
