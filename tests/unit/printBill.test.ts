import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("window", {
  open: vi.fn(() => ({
    document: {
      write: vi.fn(),
      close: vi.fn(),
    },
    focus: vi.fn(),
    print: vi.fn(),
  })),
});
vi.stubGlobal("alert", vi.fn());
vi.useFakeTimers();

import { printSaleBill } from "../../lib/printBill";

function renderedHtml(): string {
  const popup = (window.open as any).mock.results[0].value;
  return popup.document.write.mock.calls[0][0] as string;
}

describe("printSaleBill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a print window sized for the A4 cash receipt", () => {
    printSaleBill({
      clinicName: "TestClinic",
      invoiceNumber: "INV-001",
      totalAmount: 500,
      items: [{ itemName: "Cream", quantity: 2, unitPrice: 200, total: 400, gstRate: 12 }],
    });

    expect(window.open).toHaveBeenCalledWith("", "_blank", "width=800,height=900");
    const html = renderedHtml();
    expect(html).toContain("TestClinic");
    expect(html).toContain("INV-001");
    expect(html).toContain("Cream");
    expect(html).toContain("Cash Receipt");
  });

  it("uses default clinic name when not provided", () => {
    printSaleBill({ items: [], totalAmount: 0 });
    expect(renderedHtml()).toContain("PHARMACY");
  });

  it("renders the clinic GSTIN when provided", () => {
    printSaleBill({ clinicGstin: "29ABCDE1234F1Z5", items: [], totalAmount: 0 });
    expect(renderedHtml()).toContain("GSTIN: 29ABCDE1234F1Z5");
  });

  it("omits the GSTIN line when not provided", () => {
    printSaleBill({ items: [], totalAmount: 0 });
    expect(renderedHtml()).not.toContain("GSTIN:");
  });

  it("displays patient name, phone and patient code", () => {
    printSaleBill({
      patientName: "Ravi Kumar",
      patientPhone: "9876543210",
      patientCode: "P-100",
      items: [],
      totalAmount: 0,
    });
    const html = renderedHtml();
    expect(html).toContain("Ravi Kumar");
    expect(html).toContain("9876543210");
    expect(html).toContain("P-100");
  });

  it("formats the bill date as DD-Mon-YYYY", () => {
    printSaleBill({
      invoiceDate: "2025-06-15T12:00:00.000Z",
      items: [],
      totalAmount: 0,
    });
    expect(renderedHtml()).toContain("-Jun-2025");
  });

  it("renders item rows with batch, HSN and expiry", () => {
    printSaleBill({
      items: [
        { itemName: "Ointment", batchNo: "B-1", hsnCode: "30049099", expiryDate: "2027-03-01T00:00:00.000Z", quantity: 3, unitPrice: 150, total: 450 },
      ],
      grossValue: 450,
      totalAmount: 450,
    });
    const html = renderedHtml();
    expect(html).toContain("Ointment");
    expect(html).toContain("B-1");
    expect(html).toContain("30049099");
  });

  it("shows total bill and total payable amounts", () => {
    printSaleBill({
      items: [{ itemName: "Tablets", quantity: 1, unitPrice: 540, total: 540 }],
      grossValue: 540,
      totalAmount: 540,
    });
    const html = renderedHtml();
    expect(html).toContain("Total Bill Amount");
    expect(html).toContain("Total Payable Amount");
    expect(html).toContain("540.00");
  });

  it("shows CGST and SGST for an intrastate sale", () => {
    printSaleBill({
      items: [],
      grossValue: 100,
      totalAmount: 100,
      gst12: { cgst: 6, sgst: 6 },
    });
    const html = renderedHtml();
    expect(html).toContain("CGST");
    expect(html).toContain("SGST");
    expect(html).not.toContain(">IGST<");
  });

  it("shows IGST for an interstate sale", () => {
    printSaleBill({
      items: [],
      grossValue: 100,
      totalAmount: 100,
      igst: 12,
    });
    const html = renderedHtml();
    expect(html).toContain("IGST");
    expect(html).not.toContain(">CGST<");
  });

  it("renders a discount line with the discount percentage", () => {
    printSaleBill({
      items: [],
      grossValue: 142.5,
      discountAmount: 7.5,
      totalAmount: 142.5,
    });
    const html = renderedHtml();
    expect(html).toContain("Discount (5%)");
    expect(html).toContain("7.50");
  });

  it("renders a round off line when rounding is applied", () => {
    printSaleBill({
      items: [],
      grossValue: 100,
      roundingAmount: 0.5,
      totalAmount: 100.5,
    });
    expect(renderedHtml()).toContain("Round Off");
  });

  it("shows UNPAID status for a pending sale", () => {
    printSaleBill({ items: [], totalAmount: 0, paymentStatus: "pending" });
    expect(renderedHtml()).toContain("UNPAID");
  });

  it("shows PARTIAL status for a partially paid sale", () => {
    printSaleBill({ items: [], totalAmount: 0, paymentStatus: "partial" });
    expect(renderedHtml()).toContain("PARTIAL");
  });

  it("shows no status label for a fully paid sale", () => {
    printSaleBill({ items: [], totalAmount: 0, paymentStatus: "paid" });
    expect(renderedHtml()).not.toContain("Status");
  });

  it("shows an alert when the popup is blocked", () => {
    (window.open as any).mockReturnValueOnce(null);
    printSaleBill({ items: [], totalAmount: 0 });
    expect(alert).toHaveBeenCalledWith("Please allow pop-ups to print the bill.");
  });

  it("calls print after a 600ms delay", () => {
    printSaleBill({ items: [], totalAmount: 0 });
    const popup = (window.open as any).mock.results[0].value;
    expect(popup.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(popup.print).toHaveBeenCalled();
  });
});
