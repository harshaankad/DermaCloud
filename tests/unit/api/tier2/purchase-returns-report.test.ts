import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, mockDoctorAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/models/PurchaseReturn", () => ({
  default: {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock("@/lib/excel/reportHelper", () => ({
  buildExcelResponse: vi.fn().mockReturnValue(new Response("excel", { status: 200 })),
  formatDate: vi.fn().mockReturnValue("01/01/2025"),
  sumGst: vi.fn().mockReturnValue(0),
  PURCHASE_RETURN_REGISTER_HEADERS: ["H1"],
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import PurchaseReturn from "@/models/PurchaseReturn";
import { buildExcelResponse } from "@/lib/excel/reportHelper";
import { GET } from "@/app/api/tier2/purchase-returns/report/route";

describe("GET /api/tier2/purchase-returns/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/purchase-returns/report"));
    expect(res.status).toBe(401);
  });

  it("returns excel response", async () => {
    const res = await GET(getRequest("/api/tier2/purchase-returns/report"));
    expect(res.status).toBe(200);
    expect(buildExcelResponse).toHaveBeenCalledWith([], expect.any(Array), "PurchaseReturnRegister", expect.any(String));
  });

  it("filters by date range", async () => {
    await GET(getRequest("/api/tier2/purchase-returns/report?from=2025-01-01&to=2025-01-31"));

    expect(PurchaseReturn.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        invoiceDate: expect.objectContaining({ $gte: expect.any(Date), $lte: expect.any(Date) }),
      })
    );
  });

  it("builds rows from return items", async () => {
    (PurchaseReturn.find as any).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            supplierInvNo: "PR-001",
            gstnNo: "GST123",
            invoiceDate: new Date("2025-01-10"),
            modeOfPayment: "bank",
            supplierName: "Pharma",
            city: "Mumbai",
            grossValue: 1000,
            totalGst: 180,
            netAmount: 1180,
            items: [
              { itemName: "Medicine", hsnCode: "3004", quantity: 5, unitPrice: 200, gstRate: 18, total: 1000 },
            ],
          },
        ]),
      }),
    });

    await GET(getRequest("/api/tier2/purchase-returns/report"));

    expect(buildExcelResponse).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Array)]),
      expect.any(Array),
      "PurchaseReturnRegister",
      expect.any(String)
    );
  });

  it("builds rows for returns with multiple items", async () => {
    (PurchaseReturn.find as any).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            supplierInvNo: "PR-002",
            invoiceDate: new Date(),
            supplierName: "Supplier",
            grossValue: 500,
            totalGst: 0,
            netAmount: 500,
            items: [
              { itemName: "A", quantity: 1, unitPrice: 100, total: 100 },
              { itemName: "B", quantity: 2, unitPrice: 200, total: 400 },
            ],
          },
        ]),
      }),
    });

    await GET(getRequest("/api/tier2/purchase-returns/report"));

    const rows = (buildExcelResponse as any).mock.calls[0][0];
    expect(rows).toHaveLength(2);
  });

  it("handles returns with no items", async () => {
    (PurchaseReturn.find as any).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            supplierInvNo: "PR-003",
            invoiceDate: new Date(),
            supplierName: "Empty",
            grossValue: 0,
            totalGst: 0,
            netAmount: 0,
            items: [],
          },
        ]),
      }),
    });

    await GET(getRequest("/api/tier2/purchase-returns/report"));

    const rows = (buildExcelResponse as any).mock.calls[0][0];
    expect(rows).toHaveLength(1);
  });
});
