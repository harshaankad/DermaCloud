import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, putRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

function patchRequest(url: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3000${url}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", Authorization: "Bearer valid-token" },
    body: JSON.stringify(body),
  }) as any;
}

function deleteRequest(url: string, body?: Record<string, unknown>) {
  return new Request(`http://localhost:3000${url}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", Authorization: "Bearer valid-token" },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/models/InventoryItem", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("@/models/InventoryTransaction", () => ({
  default: { create: vi.fn().mockResolvedValue(undefined) },
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

vi.mock("@/models/Clinic", () => ({
  default: {
    findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ clinicName: "TestClinic" }) }),
  },
}));

const mockSale = {
  _id: "sale1",
  clinicId: { toString: () => MOCK_CLINIC_ID },
  totalAmount: 1000,
  amountPaid: 500,
  amountDue: 500,
  paymentStatus: "partial",
  paymentMethod: "cash",
  notes: "",
  toObject: vi.fn().mockReturnValue({ _id: "sale1", clinicId: MOCK_CLINIC_ID }),
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/Sale", () => {
  const chainable = {
    populate: vi.fn().mockReturnThis(),
  };
  return {
    default: {
      findById: vi.fn(),
      deleteOne: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue(undefined) }),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Sale from "@/models/Sale";
import InventoryItem from "@/models/InventoryItem";
import InventoryTransaction from "@/models/InventoryTransaction";
import { GET, PUT, PATCH, DELETE } from "@/app/api/tier2/sales/[id]/route";

const params = Promise.resolve({ id: "sale1" });

describe("GET /api/tier2/sales/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    const populateChain = {
      populate: vi.fn().mockReturnThis(),
    };
    populateChain.populate.mockReturnValueOnce(populateChain).mockReturnValueOnce(populateChain).mockResolvedValue(mockSale);
    (Sale.findById as any).mockReturnValue(populateChain);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/sales/sale1"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no sales permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(false);
    const res = await GET(getRequest("/api/tier2/sales/sale1"), { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when sale not found", async () => {
    const populateChain = { populate: vi.fn().mockReturnThis() };
    populateChain.populate.mockReturnValueOnce(populateChain).mockReturnValueOnce(populateChain).mockResolvedValue(null);
    (Sale.findById as any).mockReturnValue(populateChain);

    const res = await GET(getRequest("/api/tier2/sales/sale1"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when sale belongs to another clinic", async () => {
    const otherSale = { ...mockSale, clinicId: { toString: () => "other-clinic" }, toObject: vi.fn() };
    const populateChain = { populate: vi.fn().mockReturnThis() };
    populateChain.populate.mockReturnValueOnce(populateChain).mockReturnValueOnce(populateChain).mockResolvedValue(otherSale);
    (Sale.findById as any).mockReturnValue(populateChain);

    const res = await GET(getRequest("/api/tier2/sales/sale1"), { params });
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/tier2/sales/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (Sale.findById as any).mockResolvedValue({
      ...mockSale,
      amountPaid: 0,
      amountDue: 1000,
      paymentStatus: "pending",
      save: vi.fn(),
    });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await PUT(putRequest("/api/tier2/sales/sale1", { amountPaid: 100 }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when sale not found", async () => {
    (Sale.findById as any).mockResolvedValue(null);
    const res = await PUT(putRequest("/api/tier2/sales/sale1", { amountPaid: 100 }), { params });
    expect(res.status).toBe(404);
  });

  it("updates payment and sets status to paid when fully paid", async () => {
    const sale = {
      _id: "sale1",
      clinicId: { toString: () => MOCK_CLINIC_ID },
      totalAmount: 1000,
      amountPaid: 0,
      amountDue: 1000,
      paymentStatus: "pending",
      save: vi.fn(),
    };
    (Sale.findById as any).mockResolvedValue(sale);

    const res = await PUT(putRequest("/api/tier2/sales/sale1", { amountPaid: 1000 }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(sale.paymentStatus).toBe("paid");
    expect(sale.amountDue).toBe(0);
  });

  it("sets status to partial for partial payment", async () => {
    const sale = {
      _id: "sale1",
      clinicId: { toString: () => MOCK_CLINIC_ID },
      totalAmount: 1000,
      amountPaid: 0,
      amountDue: 1000,
      paymentStatus: "pending",
      save: vi.fn(),
    };
    (Sale.findById as any).mockResolvedValue(sale);

    await PUT(putRequest("/api/tier2/sales/sale1", { amountPaid: 500 }), { params });

    expect(sale.paymentStatus).toBe("partial");
    expect(sale.amountPaid).toBe(500);
    expect(sale.amountDue).toBe(500);
  });

  it("returns 403 when sale belongs to another clinic", async () => {
    (Sale.findById as any).mockResolvedValue({
      _id: "sale1",
      clinicId: { toString: () => "other-clinic" },
      totalAmount: 100,
      amountPaid: 0,
      amountDue: 100,
    });

    const res = await PUT(putRequest("/api/tier2/sales/sale1", { amountPaid: 50 }), { params });
    expect(res.status).toBe(403);
  });

  it("updates paymentMethod", async () => {
    const sale = {
      _id: "sale1",
      clinicId: { toString: () => MOCK_CLINIC_ID },
      totalAmount: 1000,
      amountPaid: 1000,
      amountDue: 0,
      paymentStatus: "paid",
      paymentMethod: "cash",
      save: vi.fn(),
    };
    (Sale.findById as any).mockResolvedValue(sale);

    await PUT(putRequest("/api/tier2/sales/sale1", { paymentMethod: "upi" }), { params });

    expect(sale.paymentMethod).toBe("upi");
    expect(sale.save).toHaveBeenCalled();
  });

  it("updates notes", async () => {
    const sale = {
      _id: "sale1",
      clinicId: { toString: () => MOCK_CLINIC_ID },
      totalAmount: 1000,
      amountPaid: 0,
      amountDue: 1000,
      paymentStatus: "pending",
      notes: "",
      save: vi.fn(),
    };
    (Sale.findById as any).mockResolvedValue(sale);

    await PUT(putRequest("/api/tier2/sales/sale1", { notes: "Patient will pay next visit" }), { params });

    expect(sale.notes).toBe("Patient will pay next visit");
    expect(sale.save).toHaveBeenCalled();
  });

  it("keeps pending status when amountPaid remains 0", async () => {
    const sale = {
      _id: "sale1",
      clinicId: { toString: () => MOCK_CLINIC_ID },
      totalAmount: 1000,
      amountPaid: 500,
      amountDue: 500,
      paymentStatus: "partial",
      save: vi.fn(),
    };
    (Sale.findById as any).mockResolvedValue(sale);

    await PUT(putRequest("/api/tier2/sales/sale1", { amountPaid: -500 }), { params });

    expect(sale.amountPaid).toBe(0);
    expect(sale.paymentStatus).toBe("pending");
  });
});

function makeDraftSale(overrides: Record<string, unknown> = {}) {
  return {
    _id: "sale1",
    clinicId: { toString: () => MOCK_CLINIC_ID },
    status: "draft",
    invoiceNumber: undefined,
    saleId: "S-001",
    items: [],
    save: vi.fn().mockResolvedValue(undefined),
    toObject: vi.fn().mockReturnValue({ _id: "sale1" }),
    ...overrides,
  };
}

describe("PATCH /api/tier2/sales/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (Sale.findById as any).mockResolvedValue(makeDraftSale());
    (InventoryItem.findOne as any).mockResolvedValue({
      _id: "item1", itemCode: "MED-1", name: "Cream", currentStock: 50,
      hsnCode: "30049099", manufacturer: "Pharma", batchNumber: "B1",
      expiryDate: new Date("2027-01-01"), status: "active",
      save: vi.fn().mockResolvedValue(undefined),
    });
  });

  const validItem = { itemName: "Cream", qty: 2, mrp: 100, gstRate: 18, discount: 0, total: 200 };

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {}), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no sales permission", async () => {
    (hasPermission as any).mockReturnValue(false);
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {}), { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when sale not found", async () => {
    (Sale.findById as any).mockResolvedValue(null);
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {}), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when sale belongs to another clinic", async () => {
    (Sale.findById as any).mockResolvedValue(makeDraftSale({ clinicId: { toString: () => "other" } }));
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {}), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when sale is not a draft", async () => {
    (Sale.findById as any).mockResolvedValue(makeDraftSale({ status: "completed" }));
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {}), { params });
    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.message).toContain("Only draft sales can be edited");
  });

  it("returns 400 when party name is missing", async () => {
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", { patientName: "", items: [validItem] }), { params });
    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.message).toContain("Party name is required");
  });

  it("returns 400 when items list is empty", async () => {
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", { patientName: "Ravi", items: [] }), { params });
    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.message).toContain("At least one item");
  });

  it("returns 400 when quantity is zero", async () => {
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {
      patientName: "Ravi", items: [{ ...validItem, qty: 0 }],
    }), { params });
    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.message).toContain("Quantity must be greater than 0");
  });

  it("returns 400 when item is not found in inventory", async () => {
    (InventoryItem.findOne as any).mockResolvedValue(null);
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {
      patientName: "Ravi", items: [validItem],
    }), { params });
    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.message).toContain("Item not found");
  });

  it("returns 400 when completing with insufficient stock", async () => {
    (InventoryItem.findOne as any).mockResolvedValue({
      _id: "item1", name: "Cream", currentStock: 1, status: "active",
      save: vi.fn().mockResolvedValue(undefined),
    });
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {
      patientName: "Ravi", items: [validItem], status: "completed",
    }), { params });
    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.message).toContain("Insufficient stock");
  });

  it("updates a draft without completing it", async () => {
    const sale = makeDraftSale();
    (Sale.findById as any).mockResolvedValue(sale);

    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {
      patientName: "Ravi", items: [validItem],
    }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.message).toBe("Draft updated");
    expect(sale.status).toBe("draft");
    expect(sale.save).toHaveBeenCalled();
  });

  it("completes a draft and deducts inventory", async () => {
    const sale = makeDraftSale();
    (Sale.findById as any).mockResolvedValue(sale);
    const invItem = {
      _id: "item1", name: "Cream", currentStock: 5, status: "active",
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockResolvedValue(invItem);

    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {
      patientName: "Ravi", items: [{ ...validItem, qty: 5 }], status: "completed",
    }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.message).toBe("Sale completed");
    expect(sale.status).toBe("completed");
    expect(invItem.currentStock).toBe(0);
    expect(invItem.status).toBe("out-of-stock");
    expect(InventoryTransaction.create).toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    (Sale.findById as any).mockRejectedValue(new Error("db down"));
    const res = await PATCH(patchRequest("/api/tier2/sales/sale1", {}), { params });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/tier2/sales/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (Sale.findById as any).mockResolvedValue(makeDraftSale());
    (Sale.deleteOne as any).mockReturnValue({ session: vi.fn().mockResolvedValue(undefined) });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await DELETE(deleteRequest("/api/tier2/sales/sale1"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when sale not found", async () => {
    (Sale.findById as any).mockResolvedValue(null);
    const res = await DELETE(deleteRequest("/api/tier2/sales/sale1"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when sale belongs to another clinic", async () => {
    (Sale.findById as any).mockResolvedValue(makeDraftSale({ clinicId: { toString: () => "other" } }));
    const res = await DELETE(deleteRequest("/api/tier2/sales/sale1"), { params });
    expect(res.status).toBe(403);
  });

  it("returns 403 when a non-doctor deletes a completed sale", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (Sale.findById as any).mockResolvedValue(makeDraftSale({ status: "completed" }));
    const res = await DELETE(deleteRequest("/api/tier2/sales/sale1"), { params });
    const body = await parseJson(res);
    expect(res.status).toBe(403);
    expect(body.message).toContain("Only doctors can delete completed sales");
  });

  it("returns 403 when caller lacks sales permission", async () => {
    (hasPermission as any).mockReturnValue(false);
    const res = await DELETE(deleteRequest("/api/tier2/sales/sale1"), { params });
    expect(res.status).toBe(403);
  });

  it("deletes a draft sale", async () => {
    const res = await DELETE(deleteRequest("/api/tier2/sales/sale1"), { params });
    const body = await parseJson(res);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Sale.deleteOne).toHaveBeenCalled();
  });

  it("deletes a completed sale and restocks inventory", async () => {
    (Sale.findById as any).mockResolvedValue(makeDraftSale({
      status: "completed",
      invoiceNumber: "INV-001",
      items: [{ itemId: "item1", quantity: 3, unitPrice: 100 }],
    }));
    const invItem = {
      _id: "item1", currentStock: 0, status: "out-of-stock",
      save: vi.fn().mockResolvedValue(undefined),
    };
    (InventoryItem.findOne as any).mockReturnValue({
      session: vi.fn().mockResolvedValue(invItem),
    });

    const res = await DELETE(deleteRequest("/api/tier2/sales/sale1", { restock: true }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.message).toContain("restocked");
    expect(invItem.currentStock).toBe(3);
    expect(invItem.status).toBe("active");
    expect(InventoryTransaction.create).toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    (Sale.findById as any).mockRejectedValue(new Error("db down"));
    const res = await DELETE(deleteRequest("/api/tier2/sales/sale1"), { params });
    expect(res.status).toBe(500);
  });
});
