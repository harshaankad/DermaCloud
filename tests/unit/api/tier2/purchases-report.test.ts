import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, mockDoctorAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/models/Purchase", () => ({
  default: {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock("@/lib/excel/reportHelper", () => ({
  buildExcelResponse: vi.fn().mockReturnValue(new Response("excel-data", {
    status: 200,
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  })),
  formatDate: vi.fn().mockReturnValue("01/01/2025"),
  sumGst: vi.fn().mockReturnValue(0),
  PURCHASE_REGISTER_HEADERS: ["H1", "H2"],
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import Purchase from "@/models/Purchase";
import { buildExcelResponse } from "@/lib/excel/reportHelper";
import { GET } from "@/app/api/tier2/purchases/report/route";

describe("GET /api/tier2/purchases/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/purchases/report"));
    expect(res.status).toBe(401);
  });

  it("returns excel response", async () => {
    const res = await GET(getRequest("/api/tier2/purchases/report"));
    expect(res.status).toBe(200);
    expect(buildExcelResponse).toHaveBeenCalledWith([], expect.any(Array), "PurchaseRegister", expect.stringContaining("PurchaseRegister_"));
  });

  it("filters by date range", async () => {
    await GET(getRequest("/api/tier2/purchases/report?from=2025-01-01&to=2025-01-31"));

    expect(Purchase.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        invoiceDate: expect.objectContaining({ $gte: expect.any(Date), $lte: expect.any(Date) }),
      })
    );
  });

  it("builds rows from purchase items", async () => {
    (Purchase.find as any).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            supplierInvNo: "SUP-001",
            invoiceDate: new Date(),
            supplierName: "Pharma",
            items: [{ itemName: "Medicine", quantity: 10, unitPrice: 50, total: 500 }],
          },
        ]),
      }),
    });

    await GET(getRequest("/api/tier2/purchases/report"));

    expect(buildExcelResponse).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Array)]),
      expect.any(Array),
      "PurchaseRegister",
      expect.any(String)
    );
  });
});
