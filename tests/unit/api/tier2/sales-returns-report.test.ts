import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, mockDoctorAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/models/SalesReturn", () => ({
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
  SALES_RETURN_REGISTER_HEADERS: ["H1"],
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import SalesReturn from "@/models/SalesReturn";
import { buildExcelResponse } from "@/lib/excel/reportHelper";
import { GET } from "@/app/api/tier2/sales-returns/report/route";

describe("GET /api/tier2/sales-returns/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/sales-returns/report"));
    expect(res.status).toBe(401);
  });

  it("returns excel response", async () => {
    const res = await GET(getRequest("/api/tier2/sales-returns/report"));
    expect(res.status).toBe(200);
    expect(buildExcelResponse).toHaveBeenCalledWith([], expect.any(Array), "SalesReturnRegister", expect.any(String));
  });

  it("filters by date range", async () => {
    await GET(getRequest("/api/tier2/sales-returns/report?from=2025-01-01&to=2025-01-31"));

    expect(SalesReturn.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        invoiceDate: expect.objectContaining({ $gte: expect.any(Date), $lte: expect.any(Date) }),
      })
    );
  });

  it("builds rows from return items", async () => {
    (SalesReturn.find as any).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            invoiceNo: "SR-001",
            invoiceDate: new Date("2025-01-15"),
            modeOfPayment: "cash",
            partyName: "Ravi",
            city: "Bangalore",
            grossValue: 500,
            totalGst: 90,
            netAmount: 590,
            items: [
              { itemCode: "MED-1", itemName: "Cream", quantity: 2, unitPrice: 250, gstRate: 18, total: 500 },
            ],
          },
        ]),
      }),
    });

    await GET(getRequest("/api/tier2/sales-returns/report"));

    expect(buildExcelResponse).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Array)]),
      expect.any(Array),
      "SalesReturnRegister",
      expect.any(String)
    );
  });

  it("builds rows for returns with multiple items", async () => {
    (SalesReturn.find as any).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            invoiceNo: "SR-002",
            invoiceDate: new Date(),
            partyName: "Test",
            grossValue: 300,
            totalGst: 0,
            netAmount: 300,
            items: [
              { itemCode: "A", itemName: "Item1", quantity: 1, unitPrice: 100, total: 100 },
              { itemCode: "B", itemName: "Item2", quantity: 2, unitPrice: 100, total: 200 },
            ],
          },
        ]),
      }),
    });

    await GET(getRequest("/api/tier2/sales-returns/report"));

    const rows = (buildExcelResponse as any).mock.calls[0][0];
    expect(rows).toHaveLength(2);
  });

  it("handles returns with no items", async () => {
    (SalesReturn.find as any).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            invoiceNo: "SR-003",
            invoiceDate: new Date(),
            partyName: "Empty",
            grossValue: 0,
            totalGst: 0,
            netAmount: 0,
            items: [],
          },
        ]),
      }),
    });

    await GET(getRequest("/api/tier2/sales-returns/report"));

    const rows = (buildExcelResponse as any).mock.calls[0][0];
    expect(rows).toHaveLength(1);
  });
});
