import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, parseJson, mockDoctorAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/models/Sale", () => ({
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
  gstRowValues: vi.fn().mockReturnValue(new Array(20).fill(0)),
  SALES_REGISTER_HEADERS: ["H1", "H2"],
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import Sale from "@/models/Sale";
import { buildExcelResponse } from "@/lib/excel/reportHelper";
import { GET } from "@/app/api/tier2/sales/report/route";

describe("GET /api/tier2/sales/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/sales/report"));
    expect(res.status).toBe(401);
  });

  it("returns excel response for empty data", async () => {
    const res = await GET(getRequest("/api/tier2/sales/report"));
    expect(res.status).toBe(200);
    expect(buildExcelResponse).toHaveBeenCalledWith([], expect.any(Array), "SalesRegister", expect.stringContaining("SalesRegister_"));
  });

  it("filters by date range", async () => {
    await GET(getRequest("/api/tier2/sales/report?from=2025-01-01&to=2025-01-31"));

    expect(Sale.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        createdAt: expect.objectContaining({ $gte: expect.any(Date), $lte: expect.any(Date) }),
      })
    );
  });

  it("builds rows from sale items", async () => {
    (Sale.find as any).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            invoiceNumber: "INV-001",
            createdAt: new Date(),
            paymentMethod: "cash",
            patientName: "Test",
            totalAmount: 500,
            items: [{ itemName: "Cream", quantity: 2, unitPrice: 100, total: 200 }],
          },
        ]),
      }),
    });

    await GET(getRequest("/api/tier2/sales/report"));

    expect(buildExcelResponse).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Array)]),
      expect.any(Array),
      "SalesRegister",
      expect.any(String)
    );
  });
});
