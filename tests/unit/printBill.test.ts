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

describe("printSaleBill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a new window with bill HTML", () => {
    printSaleBill({
      clinicName: "TestClinic",
      invoiceNumber: "INV-001",
      totalAmount: 500,
      items: [{ itemName: "Cream", quantity: 2, unitPrice: 200, discount: 0, total: 400, gstRate: 12 }],
    });
    expect(window.open).toHaveBeenCalledWith("", "_blank", "width=600,height=700");
    const popup = (window.open as any).mock.results[0].value;
    const html = popup.document.write.mock.calls[0][0] as string;
    expect(html).toContain("TestClinic");
    expect(html).toContain("INV-001");
    expect(html).toContain("Cream");
    expect(html).toContain("GST TAX INVOICE");
  });

  it("uses default clinic name when not provided", () => {
    printSaleBill({ items: [], totalAmount: 0 });
    const popup = (window.open as any).mock.results[0].value;
    const html = popup.document.write.mock.calls[0][0] as string;
    expect(html).toContain("PHARMACY");
  });

  it("displays patient name and doctor name", () => {
    printSaleBill({
      patientName: "Ravi Kumar",
      doctorName: "Dr. Sharma",
      items: [],
      totalAmount: 0,
    });
    const popup = (window.open as any).mock.results[0].value;
    const html = popup.document.write.mock.calls[0][0] as string;
    expect(html).toContain("Ravi Kumar");
    expect(html).toContain("Dr. Sharma");
  });

  it("formats date correctly in bill", () => {
    printSaleBill({
      invoiceDate: "2025-06-15T00:00:00.000Z",
      items: [],
      totalAmount: 0,
    });
    const popup = (window.open as any).mock.results[0].value;
    const html = popup.document.write.mock.calls[0][0] as string;
    expect(html).toContain("15/06/2025");
  });

  it("calculates item row totals correctly", () => {
    printSaleBill({
      items: [
        { itemName: "Ointment", quantity: 3, unitPrice: 150, discount: 0, total: 450, gstRate: 5 },
        { itemName: "Tablets", quantity: 1, unitPrice: 100, discount: 10, total: 90, gstRate: 12 },
      ],
      totalAmount: 540,
    });
    const popup = (window.open as any).mock.results[0].value;
    const html = popup.document.write.mock.calls[0][0] as string;
    expect(html).toContain("Ointment");
    expect(html).toContain("Tablets");
    expect(html).toContain("540.00");
  });

  it("shows alert when popup is blocked", () => {
    (window.open as any).mockReturnValueOnce(null);
    printSaleBill({ items: [], totalAmount: 0 });
    expect(alert).toHaveBeenCalledWith("Please allow pop-ups to print the bill.");
  });

  it("calls print after 600ms delay", () => {
    printSaleBill({ items: [], totalAmount: 0 });
    const popup = (window.open as any).mock.results[0].value;
    expect(popup.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(popup.print).toHaveBeenCalled();
  });

  it("displays payment method in uppercase", () => {
    printSaleBill({ paymentMethod: "upi", items: [], totalAmount: 0 });
    const popup = (window.open as any).mock.results[0].value;
    const html = popup.document.write.mock.calls[0][0] as string;
    expect(html).toContain("UPI");
  });

  it("defaults payment method to CASH", () => {
    printSaleBill({ items: [], totalAmount: 0 });
    const popup = (window.open as any).mock.results[0].value;
    const html = popup.document.write.mock.calls[0][0] as string;
    expect(html).toContain("CASH");
  });

  it("includes clinic address and phone when provided", () => {
    printSaleBill({
      clinicName: "DermaClinic",
      clinicAddress: "123 MG Road, Bangalore",
      clinicPhone: "9876543210",
      items: [],
      totalAmount: 0,
    });
    const popup = (window.open as any).mock.results[0].value;
    const html = popup.document.write.mock.calls[0][0] as string;
    expect(html).toContain("123 MG Road, Bangalore");
    expect(html).toContain("9876543210");
  });
});
