import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, putRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

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
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import Sale from "@/models/Sale";
import { GET, PUT } from "@/app/api/tier2/sales/[id]/route";

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
