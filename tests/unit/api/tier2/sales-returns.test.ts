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
        withTransaction: vi.fn().mockImplementation(async (fn: any) => fn()),
        endSession: vi.fn(),
      }),
    },
  };
});

vi.mock("@/models/SalesReturn", () => {
  const chainable = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      countDocuments: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue([{ _id: "sr1", partyName: "Test" }]),
      _chainable: chainable,
    },
  };
});

vi.mock("@/models/InventoryItem", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue(null) }),
  },
}));

vi.mock("@/models/InventoryTransaction", () => ({
  default: { create: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/models/Sale", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
  },
}));

vi.mock("@/models/Patient", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    }),
  },
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import SalesReturn from "@/models/SalesReturn";
import Sale from "@/models/Sale";
import Patient from "@/models/Patient";
import { GET, POST } from "@/app/api/tier2/sales-returns/route";

const VALID_SALE_ID = "507f1f77bcf86cd799439099";
const VALID_PATIENT_ID = "507f1f77bcf86cd799439088";

describe("GET /api/tier2/sales-returns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (SalesReturn as any)._chainable.lean.mockResolvedValue([]);
    (SalesReturn.countDocuments as any).mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/sales-returns"));
    expect(res.status).toBe(401);
  });

  it("returns paginated returns list", async () => {
    const mockReturns = [{ _id: "sr1", partyName: "Customer A" }];
    (SalesReturn as any)._chainable.lean.mockResolvedValue(mockReturns);
    (SalesReturn.countDocuments as any).mockResolvedValue(1);

    const res = await GET(getRequest("/api/tier2/sales-returns?page=1&limit=20"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.returns).toHaveLength(1);
    expect(body.data.pagination.total).toBe(1);
  });

  it("filters by date range", async () => {
    await GET(getRequest("/api/tier2/sales-returns?from=2025-01-01&to=2025-01-31"));

    expect(SalesReturn.find).toHaveBeenCalledWith(
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

describe("POST /api/tier2/sales-returns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (Sale.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    (Patient.findOne as any).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    (SalesReturn.create as any).mockResolvedValue([{ _id: "sr1", partyName: "Test" }]);
    (SalesReturn as any)._chainable.lean.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await POST(postRequest("/api/tier2/sales-returns", { partyName: "Test" }));
    expect(res.status).toBe(401);
  });

  it("creates a sales return successfully", async () => {
    const res = await POST(postRequest("/api/tier2/sales-returns", {
      partyName: "Customer A",
      invoiceNo: "INV-001",
      items: [{ itemName: "Cream", quantity: 2, unitPrice: 100, restock: false }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it("restocks inventory when restock=true", async () => {
    const InventoryItem = (await import("@/models/InventoryItem")).default;
    const InventoryTransaction = (await import("@/models/InventoryTransaction")).default;

    const mockInvItem = {
      _id: "item1",
      name: "Cream",
      currentStock: 10,
      status: "active",
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockReturnValue({
      session: vi.fn().mockResolvedValue(mockInvItem),
    });

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      partyName: "Customer B",
      invoiceNo: "SR-002",
      items: [{ itemId: "item1", itemName: "Cream", quantity: 5, unitPrice: 100, restock: true }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(mockInvItem.currentStock).toBe(15);
    expect(mockInvItem.save).toHaveBeenCalled();
    expect(InventoryTransaction.create).toHaveBeenCalled();
  });

  it("reactivates out-of-stock item on restock", async () => {
    const InventoryItem = (await import("@/models/InventoryItem")).default;

    const mockInvItem = {
      _id: "item2",
      name: "OOSItem",
      currentStock: 0,
      status: "out-of-stock",
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockReturnValue({
      session: vi.fn().mockResolvedValue(mockInvItem),
    });

    await POST(postRequest("/api/tier2/sales-returns", {
      partyName: "Customer C",
      items: [{ itemId: "item2", itemName: "OOSItem", quantity: 3, unitPrice: 50, restock: true }],
    }));

    expect(mockInvItem.currentStock).toBe(3);
    expect(mockInvItem.status).toBe("active");
  });

  it("skips restock when item not found in inventory", async () => {
    const InventoryItem = (await import("@/models/InventoryItem")).default;
    const InventoryTransaction = (await import("@/models/InventoryTransaction")).default;

    (InventoryItem.findOne as any).mockReturnValue({
      session: vi.fn().mockResolvedValue(null),
    });

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      partyName: "Customer D",
      items: [{ itemName: "NonExistent", quantity: 1, unitPrice: 100, restock: true }],
    }));

    expect(res.status).toBe(201);
    expect(InventoryTransaction.create).not.toHaveBeenCalled();
  });

  it("skips restock when quantity is zero", async () => {
    const InventoryTransaction = (await import("@/models/InventoryTransaction")).default;

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      partyName: "Customer E",
      items: [{ itemName: "Item", quantity: 0, unitPrice: 100, restock: true }],
    }));

    expect(res.status).toBe(201);
    expect(InventoryTransaction.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid originalSaleId", async () => {
    const res = await POST(postRequest("/api/tier2/sales-returns", {
      originalSaleId: "not-a-valid-id",
      partyName: "Customer",
      items: [],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Invalid originalSaleId");
  });

  it("returns 404 when the original sale is not found", async () => {
    (Sale.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      originalSaleId: VALID_SALE_ID,
      partyName: "Customer",
      items: [],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.message).toContain("Original sale not found");
  });

  it("returns 400 when a returned item was not part of the original sale", async () => {
    (Sale.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: VALID_SALE_ID,
        items: [{ itemName: "Cream", quantity: 5 }],
      }),
    });
    (SalesReturn as any)._chainable.lean.mockResolvedValue([]);

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      originalSaleId: VALID_SALE_ID,
      partyName: "Customer",
      items: [{ itemName: "Lotion", quantity: 1 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("was not part of the original sale");
  });

  it("returns 400 when over-returning an item beyond the sold quantity", async () => {
    (Sale.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: VALID_SALE_ID,
        items: [{ itemName: "Cream", quantity: 5 }],
      }),
    });
    (SalesReturn as any)._chainable.lean.mockResolvedValue([]);

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      originalSaleId: VALID_SALE_ID,
      partyName: "Customer",
      items: [{ itemName: "Cream", quantity: 10 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Cannot return");
  });

  it("allows a partial return that stays within the remaining returnable quantity", async () => {
    (Sale.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: VALID_SALE_ID,
        items: [{ itemId: "i1", itemName: "Cream", quantity: 5 }],
      }),
    });
    (SalesReturn as any)._chainable.lean.mockResolvedValue([
      { items: [{ itemId: "i1", itemName: "Cream", quantity: 2 }] },
    ]);

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      originalSaleId: VALID_SALE_ID,
      partyName: "Customer",
      items: [{ itemId: "i1", itemName: "Cream", quantity: 2 }],
    }));

    expect(res.status).toBe(201);
  });

  it("rejects a return when prior returns already exhausted the sold quantity", async () => {
    (Sale.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: VALID_SALE_ID,
        items: [{ itemId: "i1", itemName: "Cream", quantity: 5 }],
      }),
    });
    (SalesReturn as any)._chainable.lean.mockResolvedValue([
      { items: [{ itemId: "i1", itemName: "Cream", quantity: 4 }] },
    ]);

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      originalSaleId: VALID_SALE_ID,
      partyName: "Customer",
      items: [{ itemId: "i1", itemName: "Cream", quantity: 2 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("already returned: 4");
  });

  it("inherits patient details from the linked original sale", async () => {
    (Sale.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: VALID_SALE_ID,
        patientId: "pat1",
        patientCode: "P-001",
        patientPhone: "9876543210",
        patientName: "Ravi Kumar",
        items: [{ itemName: "Cream", quantity: 5 }],
      }),
    });
    (SalesReturn as any)._chainable.lean.mockResolvedValue([]);

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      originalSaleId: VALID_SALE_ID,
      partyName: "Walk-in",
      items: [{ itemName: "Cream", quantity: 2 }],
    }));

    expect(res.status).toBe(201);
    expect(SalesReturn.create).toHaveBeenCalledWith(
      [expect.objectContaining({
        patientId: "pat1",
        patientCode: "P-001",
        patientPhone: "9876543210",
        partyName: "Ravi Kumar",
      })],
      expect.anything()
    );
  });

  it("resolves patient from body.patientId for a standalone return", async () => {
    (Patient.findOne as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: VALID_PATIENT_ID,
          patientId: "P-009",
          name: "Asha Devi",
          phone: "9000000000",
        }),
      }),
    });

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      patientId: VALID_PATIENT_ID,
      partyName: "ignored",
      items: [{ itemName: "Cream", quantity: 1, restock: false }],
    }));

    expect(res.status).toBe(201);
    expect(SalesReturn.create).toHaveBeenCalledWith(
      [expect.objectContaining({
        patientId: VALID_PATIENT_ID,
        patientCode: "P-009",
        partyName: "Asha Devi",
      })],
      expect.anything()
    );
  });

  it("returns 500 when the return cannot be created", async () => {
    (Patient.findOne as any).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    (SalesReturn.create as any).mockRejectedValueOnce(new Error("write failed"));

    const res = await POST(postRequest("/api/tier2/sales-returns", {
      partyName: "Customer",
      items: [{ itemName: "Cream", quantity: 1 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.message).toBe("write failed");
  });
});
