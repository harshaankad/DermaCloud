import { describe, it, expect } from "vitest";
import {
  buildExcelResponse,
  gstRowValues,
  formatDate,
  sumGst,
  GST_RATES,
  GST_COLUMNS,
  SALES_REGISTER_HEADERS,
  PURCHASE_REGISTER_HEADERS,
  SALES_RETURN_REGISTER_HEADERS,
  PURCHASE_RETURN_REGISTER_HEADERS,
} from "../../../lib/excel/reportHelper";

describe("gstRowValues", () => {
  it("returns 20-element array with all values", () => {
    const gst0 = { taxable: 100, cgst: 0, sgst: 0, igst: 0 };
    const gst5 = { taxable: 200, cgst: 5, sgst: 5, igst: 0 };
    const gst12 = { taxable: 300, cgst: 18, sgst: 18, igst: 0 };
    const gst18 = { taxable: 400, cgst: 36, sgst: 36, igst: 0 };
    const gst28 = { taxable: 500, cgst: 70, sgst: 70, igst: 0 };

    const result = gstRowValues(gst0, gst5, gst12, gst18, gst28);
    expect(result).toHaveLength(20);
    expect(result[0]).toBe(100); // gst0 taxable
    expect(result[4]).toBe(200); // gst5 taxable
    expect(result[5]).toBe(5);   // gst5 cgst
  });

  it("defaults to 0 for null/undefined GST buckets", () => {
    const result = gstRowValues(null, null, null, null, null);
    expect(result).toHaveLength(20);
    expect(result.every((v: number) => v === 0)).toBe(true);
  });

  it("defaults to 0 for missing fields within a bucket", () => {
    const partial = { taxable: 50 };
    const result = gstRowValues(partial, null, null, null, null);
    expect(result[0]).toBe(50);
    expect(result[1]).toBe(0); // cgst missing
    expect(result[2]).toBe(0); // sgst missing
    expect(result[3]).toBe(0); // igst missing
  });
});

describe("formatDate", () => {
  it("formats a Date object to DD/MM/YYYY", () => {
    const result = formatDate(new Date(2025, 0, 5)); // Jan 5, 2025
    expect(result).toBe("05/01/2025");
  });

  it("formats an ISO string to DD/MM/YYYY", () => {
    expect(formatDate("2025-12-25T00:00:00.000Z")).toBe("25/12/2025");
  });

  it("pads single-digit day and month", () => {
    const result = formatDate(new Date(2025, 2, 3)); // Mar 3, 2025
    expect(result).toBe("03/03/2025");
  });
});

describe("sumGst", () => {
  it("sums cgst across all rate buckets", () => {
    const gst0 = { cgst: 0, sgst: 0, igst: 0 };
    const gst5 = { cgst: 2.5, sgst: 2.5, igst: 0 };
    const gst12 = { cgst: 6, sgst: 6, igst: 0 };
    const gst18 = { cgst: 9, sgst: 9, igst: 0 };
    const gst28 = { cgst: 14, sgst: 14, igst: 0 };
    expect(sumGst("cgst", gst0, gst5, gst12, gst18, gst28)).toBe(31.5);
  });

  it("sums igst across all rate buckets", () => {
    const gst0 = { cgst: 0, sgst: 0, igst: 10 };
    const gst5 = { cgst: 0, sgst: 0, igst: 20 };
    expect(sumGst("igst", gst0, gst5, null, null, null)).toBe(30);
  });

  it("handles all null buckets gracefully", () => {
    expect(sumGst("cgst", null, null, null, null, null)).toBe(0);
    expect(sumGst("sgst", null, null, null, null, null)).toBe(0);
    expect(sumGst("igst", null, null, null, null, null)).toBe(0);
  });
});

describe("buildExcelResponse", () => {
  it("returns a Response with xlsx content type", () => {
    const headers = ["Name", "Age"];
    const rows = [["Alice", 30], ["Bob", 25]];
    const res = buildExcelResponse(rows, headers, "TestSheet", "test.xlsx");

    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("sets correct Content-Disposition filename", () => {
    const res = buildExcelResponse([], ["H1"], "Sheet1", "report_2025.xlsx");
    expect(res.headers.get("Content-Disposition")).toContain("report_2025.xlsx");
  });

  it("handles empty rows without error", () => {
    const res = buildExcelResponse([], ["Col1", "Col2"], "Empty", "empty.xlsx");
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a non-empty body", async () => {
    const res = buildExcelResponse([["val"]], ["Header"], "Sheet", "out.xlsx");
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("handles cells with null values", () => {
    const rows = [[null, "text", 42]];
    const res = buildExcelResponse(rows, ["A", "B", "C"], "Sheet", "out.xlsx");
    expect(res).toBeInstanceOf(Response);
  });
});

describe("constants", () => {
  it("GST_RATES contains exactly [0, 5, 12, 18, 28]", () => {
    expect([...GST_RATES]).toEqual([0, 5, 12, 18, 28]);
  });

  it("GST_COLUMNS has 20 entries (4 per rate x 5 rates)", () => {
    expect(GST_COLUMNS).toHaveLength(20);
  });

  it("SALES_REGISTER_HEADERS includes Invoice No and Net Amount", () => {
    expect(SALES_REGISTER_HEADERS[0]).toBe("Invoice No");
    expect(SALES_REGISTER_HEADERS[SALES_REGISTER_HEADERS.length - 1]).toBe("Net Amount");
  });

  it("PURCHASE_REGISTER_HEADERS includes Supplier Name", () => {
    expect(PURCHASE_REGISTER_HEADERS).toContain("Supplier Name");
  });

  it("SALES_RETURN_REGISTER_HEADERS includes Party Name", () => {
    expect(SALES_RETURN_REGISTER_HEADERS).toContain("Party Name");
  });

  it("PURCHASE_RETURN_REGISTER_HEADERS includes GSTN No", () => {
    expect(PURCHASE_RETURN_REGISTER_HEADERS).toContain("GSTN No");
  });
});
