import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, getRequest, parseJson, mockDoctorAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("@/models/Clinic", () => ({
  default: {
    findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ clinicName: "TestClinic" }) }),
  },
}));

vi.mock("@/models/Sale", () => {
  const chainable = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn(),
  };
  const MockSale = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data);
    this.save = vi.fn().mockResolvedValue(undefined);
    this.toObject = vi.fn().mockReturnValue({ _id: "sale1", ...data });
  }) as any;
  MockSale.find = vi.fn().mockReturnValue(chainable);
  MockSale.countDocuments = vi.fn();
  MockSale._chainable = chainable;
  return { default: MockSale };
});

vi.mock("@/models/InventoryItem", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("@/models/InventoryTransaction", () => ({
  default: { create: vi.fn() },
}));

vi.mock("@/models/Patient", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    }),
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  },
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

import { verifyTier2Request } from "@/lib/auth/verify-request";
import Sale from "@/models/Sale";
import InventoryItem from "@/models/InventoryItem";
import Patient from "@/models/Patient";
import { GET, POST } from "@/app/api/tier2/sales/route";

const VALID_PATIENT_ID = "507f1f77bcf86cd799439077";

describe("GET /api/tier2/sales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (Sale as any)._chainable.lean.mockResolvedValue([]);
    (Sale.countDocuments as any).mockResolvedValue(0);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);

    const res = await GET(getRequest("/api/tier2/sales"));
    expect(res.status).toBe(401);
  });

  it("returns paginated sales list", async () => {
    const mockSales = [{ _id: "s1", invoiceNumber: "INV-001", totalAmount: 500 }];
    (Sale as any)._chainable.lean.mockResolvedValue(mockSales);
    (Sale.countDocuments as any).mockResolvedValue(1);

    const res = await GET(getRequest("/api/tier2/sales?page=1&limit=50"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.sales).toHaveLength(1);
    expect(body.data.sales[0].clinicName).toBe("TestClinic");
  });

  it("filters by date range", async () => {
    (Sale as any)._chainable.lean.mockResolvedValue([]);
    (Sale.countDocuments as any).mockResolvedValue(0);

    await GET(getRequest("/api/tier2/sales?startDate=2025-01-01&endDate=2025-01-31"));

    expect(Sale.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        createdAt: expect.objectContaining({
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        }),
      })
    );
  });

  it("backfills patientCode from Patient records for sales missing it", async () => {
    (Sale as any)._chainable.lean.mockResolvedValue([{ _id: "s1", patientId: "p1" }]);
    (Sale.countDocuments as any).mockResolvedValue(1);
    (Patient.find as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: "p1", patientId: "P-100" }]),
    });

    const res = await GET(getRequest("/api/tier2/sales"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.sales[0].patientCode).toBe("P-100");
  });

  it("does not look up patients when sales already carry a patientCode", async () => {
    (Sale as any)._chainable.lean.mockResolvedValue([{ _id: "s1", patientId: "p1", patientCode: "P-EXISTING" }]);
    (Sale.countDocuments as any).mockResolvedValue(1);

    const res = await GET(getRequest("/api/tier2/sales"));
    const body = await parseJson(res);

    expect(body.data.sales[0].patientCode).toBe("P-EXISTING");
    expect(Patient.find).not.toHaveBeenCalled();
  });
});

describe("POST /api/tier2/sales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);

    const res = await POST(postRequest("/api/tier2/sales", { patientName: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when party name is empty", async () => {
    const res = await POST(postRequest("/api/tier2/sales", { patientName: "", items: [] }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Party name is required");
  });

  it("returns 400 when items array is empty", async () => {
    const res = await POST(postRequest("/api/tier2/sales", { patientName: "Test", items: [] }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("At least one item");
  });

  it("returns 400 when item is not found in inventory", async () => {
    (InventoryItem.findOne as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/tier2/sales", {
      patientName: "Test",
      items: [{ itemName: "NonExistent", qty: 1, mrp: 100, gstRate: 0, total: 100 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Item not found");
  });

  it("returns 400 when insufficient stock", async () => {
    (InventoryItem.findOne as any)
      .mockResolvedValueOnce({ _id: "item1", name: "Cream", currentStock: 2, clinicId: MOCK_CLINIC_ID });

    const res = await POST(postRequest("/api/tier2/sales", {
      patientName: "Test",
      items: [{ itemName: "Cream", qty: 5, mrp: 100, gstRate: 0, total: 500 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Insufficient stock");
  });

  it("returns 400 when quantity is zero", async () => {
    (InventoryItem.findOne as any).mockResolvedValue({
      _id: "item1", name: "Cream", currentStock: 10, clinicId: MOCK_CLINIC_ID,
    });

    const res = await POST(postRequest("/api/tier2/sales", {
      patientName: "Test",
      items: [{ itemName: "Cream", qty: 0, mrp: 100, gstRate: 0, total: 0 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Quantity must be greater than 0");
  });

  it("creates sale successfully with transaction", async () => {
    const mockInvItem = {
      _id: "item1",
      itemCode: "MED-001",
      name: "Paracetamol",
      currentStock: 50,
      hsnCode: "30049099",
      manufacturer: "Pharma Co",
      batchNumber: "B001",
      expiryDate: new Date("2026-01-01"),
      status: "active",
      clinicId: MOCK_CLINIC_ID,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockResolvedValue(mockInvItem);

    const mockSaleInstance = {
      _id: "sale1",
      invoiceNumber: "INV-001",
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({
        _id: "sale1",
        invoiceNumber: "INV-001",
        totalAmount: 118,
        items: [{ itemName: "Paracetamol", quantity: 10 }],
      }),
    };

    const SaleModule = await import("@/models/Sale");
    const SaleDefault = SaleModule.default as any;
    SaleDefault.mockImplementation(function (this: any, data: any) {
      Object.assign(this, data, mockSaleInstance);
      return this;
    });

    const res = await POST(postRequest("/api/tier2/sales", {
      patientName: "Ravi Kumar",
      patientPhone: "9876543210",
      modeOfPayment: "upi",
      items: [{ itemName: "Paracetamol", qty: 10, mrp: 10, gstRate: 18, discount: 0, total: 100 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockInvItem.save).toHaveBeenCalled();
    expect(mockInvItem.currentStock).toBe(40);
  });

  it("links the sale to a patient when a valid patientId is provided", async () => {
    (InventoryItem.findOne as any).mockResolvedValue({
      _id: "item1", name: "Cream", currentStock: 50, status: "active",
      clinicId: MOCK_CLINIC_ID, save: vi.fn().mockResolvedValue(undefined),
    });
    (Patient.findOne as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: VALID_PATIENT_ID, patientId: "P-200", name: "Asha Devi", phone: "9000000000",
        }),
      }),
    });

    const mockSaleInstance = {
      _id: "sale1",
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ _id: "sale1", patientCode: "P-200", patientName: "Asha Devi" }),
    };
    const SaleDefault = (await import("@/models/Sale")).default as any;
    SaleDefault.mockImplementation(function (this: any, data: any) {
      Object.assign(this, data, mockSaleInstance);
      return this;
    });

    const res = await POST(postRequest("/api/tier2/sales", {
      patientId: VALID_PATIENT_ID,
      patientName: "fallback name",
      items: [{ itemName: "Cream", qty: 1, mrp: 100, gstRate: 0, total: 100 }],
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(Patient.findOne).toHaveBeenCalled();
    expect(body.data.patientName).toBe("Asha Devi");
  });

  it("ignores an invalid patientId and uses the supplied party name", async () => {
    (InventoryItem.findOne as any).mockResolvedValue({
      _id: "item1", name: "Cream", currentStock: 50, status: "active",
      clinicId: MOCK_CLINIC_ID, save: vi.fn().mockResolvedValue(undefined),
    });

    const mockSaleInstance = {
      _id: "sale2",
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ _id: "sale2" }),
    };
    const SaleDefault = (await import("@/models/Sale")).default as any;
    SaleDefault.mockImplementation(function (this: any, data: any) {
      Object.assign(this, data, mockSaleInstance);
      return this;
    });

    const res = await POST(postRequest("/api/tier2/sales", {
      patientId: "not-an-object-id",
      patientName: "Walk-in",
      items: [{ itemName: "Cream", qty: 1, mrp: 100, gstRate: 0, total: 100 }],
    }));

    expect(res.status).toBe(201);
    expect(Patient.findOne).not.toHaveBeenCalled();
  });

  it("sets item to out-of-stock when stock reaches zero", async () => {
    const mockInvItem = {
      _id: "item1",
      itemCode: "MED-002",
      name: "Cream",
      currentStock: 5,
      status: "active",
      clinicId: MOCK_CLINIC_ID,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockResolvedValue(mockInvItem);

    const mockSaleInstance = {
      _id: "sale2",
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ _id: "sale2" }),
    };
    const SaleModule = await import("@/models/Sale");
    const SaleDefault = SaleModule.default as any;
    SaleDefault.mockImplementation(function (this: any, data: any) {
      Object.assign(this, data, mockSaleInstance);
      return this;
    });

    await POST(postRequest("/api/tier2/sales", {
      patientName: "Test",
      items: [{ itemName: "Cream", qty: 5, mrp: 100, gstRate: 0, total: 500 }],
    }));

    expect(mockInvItem.currentStock).toBe(0);
    expect(mockInvItem.status).toBe("out-of-stock");
  });
});
