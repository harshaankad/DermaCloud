"use client";

import { useEffect, useState, useCallback } from "react";
import { printSaleBill } from "@/lib/printBill";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface SaleItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  total: number;
}

interface PrescriptionData {
  type: "dermatology" | "cosmetology";
  consultation: {
    treatmentPlan?: {
      medications?: { name: string; dosage: string; frequency: string; duration: string }[];
      topicals?: string;
      orals?: string;
      lifestyleChanges?: string;
      investigations?: string;
    };
    procedure?: {
      name?: string;
      productsAndParameters?: string;
    };
    aftercare?: {
      homeProducts?: string;
      instructions?: string;
    };
    customFields?: Record<string, any>;
  };
}

interface Sale {
  _id: string;
  saleId: string;
  invoiceNumber?: string;
  patientName: string;
  patientPhone?: string;
  totalAmount: number;
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
  amountPaid: number;
  amountDue: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  items: SaleItem[];
  notes?: string;
  soldBy?: { name: string; role: string };
}

export default function FrontdeskSalesPage() {
  const router = useRouter();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const EMPTY_SALE_ITEM = { itemId: "", itemName: "", hsnCode: "", packing: "", manufacturer: "", batchNo: "", expiryDate: "", mrp: 0, qty: 1, discount: 0, gstRate: 0, total: 0 };
  const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [invSuggestions, setInvSuggestions] = useState<any[]>([]);
  const [saleForm, setSaleForm] = useState({
    patientName: "", patientPhone: "", doctorName: "", city: "",
    modeOfPayment: "cash", isInterstate: false, roundingAmount: 0,
    items: [{ itemId: "", itemName: "", hsnCode: "", packing: "", manufacturer: "", batchNo: "", expiryDate: "", mrp: 0, qty: 1, discount: 0, gstRate: 0, total: 0 }],
  });
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [todayStats, setTodayStats] = useState<any>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filter, setFilter] = useState<"all" | "paid" | "pending" | "partial">("all");
  const [searchSales, setSearchSales] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [loadingSaleDetail, setLoadingSaleDetail] = useState(false);
  const [collectingPayment, setCollectingPayment] = useState(false);
  const [collectAmount, setCollectAmount] = useState("");

  const [prescription, setPrescription] = useState<PrescriptionData | null>(null);
  const [loadingPrescription, setLoadingPrescription] = useState(false);
  const [prescriptionChecked, setPrescriptionChecked] = useState(false);
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | undefined>(undefined);
  const [salesTab, setSalesTab] = useState<"sales" | "returns">("sales");
  const [salesReturns, setSalesReturns] = useState<any[]>([]);
  const [loadingSalesReturns, setLoadingSalesReturns] = useState(false);
  const [loadingMoreSR, setLoadingMoreSR] = useState(false);
  const [srPage, setSrPage] = useState(1);
  const [srHasMore, setSrHasMore] = useState(false);
  const [srFrom, setSrFrom] = useState("");
  const [srTo, setSrTo] = useState("");
  const [selectedSalesReturn, setSelectedSalesReturn] = useState<any>(null);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [showAddSrModal, setShowAddSrModal] = useState(false);
  const [srSubmitting, setSrSubmitting] = useState(false);
  const EMPTY_SR_ITEM = { itemId: "", itemName: "", quantity: 1, unitPrice: 0, discount: 0, gstRate: 0, total: 0, restock: true };
  const [srForm, setSrForm] = useState({
    invoiceNo: "", invoiceDate: "", modeOfPayment: "cash", partyName: "", city: "",
    isInterstate: false,
    grossValue: 0, discount: 0, roundingAmount: 0, netAmount: 0, reason: "",
    items: [{ itemId: "", itemName: "", quantity: 1, unitPrice: 0, discount: 0, gstRate: 0, total: 0, restock: true }],
  });

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const getFrontdeskToken = () => localStorage.getItem("frontdeskToken");

  const fetchSalesReturns = useCallback(async (from?: string, to?: string, page = 1) => {
    const token = getFrontdeskToken(); if (!token) return;
    if (page === 1) setLoadingSalesReturns(true); else setLoadingMoreSR(true);
    try {
      let url = `/api/tier2/sales-returns?limit=20&page=${page}`;
      if (from) url += `&from=${from}`;
      if (to) url += `&to=${to}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        const items = data.data.returns || [];
        setSalesReturns(prev => page === 1 ? items : [...prev, ...items]);
        setSrPage(page);
        setSrHasMore(data.data.pagination.page < data.data.pagination.pages);
      }
    } catch { showToast("error", "Failed to load sales returns"); }
    finally { setLoadingSalesReturns(false); setLoadingMoreSR(false); }
  }, [showToast]);

  const downloadReport = async (url: string, filename: string) => {
    const token = getFrontdeskToken(); if (!token) return;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { showToast("error", "Failed to download"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { showToast("error", "Download failed"); }
  };

  const computeGstBreakdowns = (items: any[]) => {
    const empty = () => ({ taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    const gst: Record<number, any> = { 0: empty(), 5: empty(), 12: empty(), 18: empty(), 28: empty() };
    for (const item of items) {
      const rate = item.gstRate || 0;
      const taxable = item.total || 0;
      const half = parseFloat(((taxable * rate) / 200).toFixed(2));
      if (!gst[rate]) gst[rate] = empty();
      gst[rate].taxable += taxable; gst[rate].cgst += half; gst[rate].sgst += half;
    }
    const totalGst = Object.values(gst).reduce((s: number, g: any) => s + g.cgst + g.sgst + g.igst, 0);
    return { gst0: gst[0], gst5: gst[5], gst12: gst[12], gst18: gst[18], gst28: gst[28], totalGst };
  };

  const recomputeSrTotals = (items: typeof srForm.items, discount: number, roundingAmount: number) => {
    const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2);
    const totalGst = +items.reduce((s, it) => s + it.total * (it.gstRate || 0) / 100, 0).toFixed(2);
    const net = +(gross + totalGst - discount + roundingAmount).toFixed(2);
    return { grossValue: gross, netAmount: net };
  };

  const handleAddSalesReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (srSubmitting) return;
    const token = getFrontdeskToken(); if (!token) return;
    setSrSubmitting(true);
    try {
      const { gst0, gst5, gst12, gst18, gst28, totalGst } = computeGstBreakdowns(srForm.items);
      const body = { ...srForm, gst0, gst5, gst12, gst18, gst28, totalGst };
      const res = await fetch("/api/tier2/sales-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { showToast("error", `Server error (${res.status}): ${text.slice(0, 200)}`); return; }
      if (data.success) {
        showToast("success", "Sales return recorded");
        setShowAddSrModal(false);
        setSrForm({ invoiceNo: "", invoiceDate: "", modeOfPayment: "cash", partyName: "", city: "", isInterstate: false, grossValue: 0, discount: 0, roundingAmount: 0, netAmount: 0, reason: "", items: [{ itemId: "", itemName: "", quantity: 1, unitPrice: 0, discount: 0, gstRate: 0, total: 0, restock: true }] });
        fetchSalesReturns(srFrom, srTo);
      } else { showToast("error", data.message || "Failed"); }
    } catch (err: any) { showToast("error", err?.message || "Failed to save"); }
    finally { setSrSubmitting(false); }
  };

  const fetchPrescription = async (patientId: string, date?: string, appointmentId?: string) => {
    setLoadingPrescription(true);
    setPrescription(null);
    setPrescriptionChecked(false);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const url = `/api/tier2/sales/prescription?patientId=${patientId}${date ? `&date=${date}` : ""}${appointmentId ? `&appointmentId=${appointmentId}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success && data.data) {
        setPrescription(data.data);
      }
    } catch (error) {
      console.error("[Prescription] Fetch error:", error);
    } finally {
      setLoadingPrescription(false);
      setPrescriptionChecked(true);
    }
  };

  useEffect(() => {
    const staffData = localStorage.getItem("frontdeskStaff");
    const token = localStorage.getItem("frontdeskToken");
    if (!token || !staffData) {
      router.push("/frontdesk/login");
      return;
    }
    const staffInfo = JSON.parse(staffData);
    if (!staffInfo.permissions?.sales) {
      router.push("/frontdesk/dashboard");
      return;
    }
    fetchSales(token);
  }, [selectedDate]);

  // On mount: handle ?action=new&patientId=... from Dispense button on Appointments page
  // Using window.location.search directly avoids useSearchParams() hydration timing issues
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const pid = params.get("patientId");

    if (action === "new") {
      setShowNewSaleModal(true);
    }

    if (pid) {
      const pname = params.get("patientName") || "";
      const pphone = params.get("patientPhone") || "";
      const aptDate = params.get("aptDate") || undefined;
      const aptId = params.get("appointmentId") || undefined;
      if (aptId) setLinkedAppointmentId(aptId);
      setSaleForm((prev) => ({
        ...prev,
        patientName: pname,
        patientPhone: pphone,
      }));
      fetchPrescription(pid, aptDate, aptId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSales = async (token: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tier2/sales?startDate=${selectedDate}&endDate=${selectedDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        const salesList = data.data.sales || [];
        setSales(salesList);
        setTodayStats({
          totalSales: salesList.length,
          totalRevenue: salesList.reduce((s: number, sale: any) => s + (sale.totalAmount || 0), 0),
        });
      }
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (salesTab === "returns") fetchSalesReturns();
  }, [salesTab, fetchSalesReturns]);

  const fetchInvSuggestions = useCallback(async () => {
    const token = localStorage.getItem("frontdeskToken"); if (!token) return;
    try {
      const res = await fetch("/api/tier2/inventory?limit=500", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setInvSuggestions(data.data.items || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (showNewSaleModal || showAddSrModal) fetchInvSuggestions();
  }, [showNewSaleModal, showAddSrModal, fetchInvSuggestions]);

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("frontdeskToken"); if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tier2/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...saleForm, ...(linkedAppointmentId && { appointmentId: linkedAppointmentId }) }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Sale saved — ${data.data.invoiceNumber || data.data.saleId}`);
        setShowNewSaleModal(false);
        setLastSale(data.data);
        resetSaleForm();
        fetchSales(token);
      } else {
        showToast("error", data.message || "Failed to save sale");
      }
    } catch {
      showToast("error", "Error saving sale");
    } finally {
      setSubmitting(false);
    }
  };

  const resetSaleForm = () => {
    setPrescription(null);
    setPrescriptionChecked(false);
    setSaleForm({ patientName: "", patientPhone: "", doctorName: "", city: "", modeOfPayment: "cash", isInterstate: false, roundingAmount: 0, items: [{ ...EMPTY_SALE_ITEM }] });
  };

  const openSaleDetail = async (sale: Sale) => {
    setSelectedSale(sale);
    setCollectAmount("");
    // Fetch full detail if items don't have full info
    if (sale.items.length > 0 && sale.items[0].itemName) return;
    setLoadingSaleDetail(true);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const response = await fetch(`/api/tier2/sales/${sale._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setSelectedSale(data.data);
      }
    } catch (error) {
      console.error("Error fetching sale detail:", error);
    } finally {
      setLoadingSaleDetail(false);
    }
  };

  const handleCollectPayment = async () => {
    if (!selectedSale || !collectAmount) return;
    const amount = parseFloat(collectAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast("error", "Please enter a valid amount");
      return;
    }

    setCollectingPayment(true);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const response = await fetch(`/api/tier2/sales/${selectedSale._id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amountPaid: amount }),
      });
      const data = await response.json();
      if (data.success) {
        showToast("success", `Collected \u20B9${amount.toLocaleString()}`);
        setSelectedSale(data.data);
        setCollectAmount("");
        fetchSales(token!);
      } else {
        showToast("error", data.message || "Failed to collect payment");
      }
    } catch (error) {
      showToast("error", "Error collecting payment");
    } finally {
      setCollectingPayment(false);
    }
  };

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  const filteredSales = sales
    .filter((s) => {
      if (filter !== "all" && s.paymentStatus !== filter) return false;
      if (searchSales) {
        const q = searchSales.toLowerCase();
        return (
          s.patientName.toLowerCase().includes(q) ||
          s.saleId.toLowerCase().includes(q) ||
          (s.invoiceNumber && s.invoiceNumber.toLowerCase().includes(q))
        );
      }
      return true;
    });

  const counts = {
    all: sales.length,
    paid: sales.filter((s) => s.paymentStatus === "paid").length,
    pending: sales.filter((s) => s.paymentStatus === "pending").length,
    partial: sales.filter((s) => s.paymentStatus === "partial").length,
  };

  const formatDisplayDate = (dateStr: string) => {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getPaymentStatusStyle = (status: string) => {
    const styles: Record<string, string> = {
      paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
      pending: "bg-red-50 text-red-600 border-red-200",
      partial: "bg-amber-50 text-amber-700 border-amber-200",
      refunded: "bg-gray-50 text-gray-600 border-gray-200",
    };
    return styles[status] || "bg-gray-50 text-gray-600 border-gray-200";
  };

  const getPaymentMethodStyle = (method: string) => {
    const styles: Record<string, string> = {
      cash: "bg-green-50 text-green-700 border-green-200",
      card: "bg-blue-50 text-blue-700 border-blue-200",
      upi: "bg-purple-50 text-purple-700 border-purple-200",
      insurance: "bg-indigo-50 text-indigo-700 border-indigo-200",
      credit: "bg-orange-50 text-orange-700 border-orange-200",
    };
    return styles[method] || "bg-gray-50 text-gray-600 border-gray-200";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notifications - Bottom Center */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px] max-w-[420px] border ${
              toast.type === "success"
                ? "bg-white text-emerald-700 border-emerald-200 shadow-emerald-500/10"
                : toast.type === "error"
                ? "bg-white text-red-700 border-red-200 shadow-red-500/10"
                : "bg-white text-sky-700 border-sky-200 shadow-sky-500/10"
            }`}
            style={{ animation: "slideUp 0.3s ease-out" }}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              toast.type === "success" ? "bg-emerald-100" : toast.type === "error" ? "bg-red-100" : "bg-sky-100"
            }`}>
              {toast.type === "success" ? (
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : toast.type === "error" ? (
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <span className="font-medium text-base flex-1">{toast.message}</span>
            <button onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))} className="p-1 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/frontdesk/dashboard" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-teal-600 transition-colors" title="Back to Dashboard">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
                <p className="text-base text-gray-500 hidden sm:block">Manage transactions and billing</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {[
              { label: "Dashboard", href: "/frontdesk/dashboard" },
              { label: "Appointments", href: "/frontdesk/appointments" },
              { label: "Patients", href: "/frontdesk/patients" },
              { label: "Pharmacy", href: "/frontdesk/pharmacy" },
              { label: "Sales", href: "/frontdesk/sales", active: true },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-3 text-base font-medium whitespace-nowrap transition-colors relative ${
                  item.active
                    ? "text-teal-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-teal-600 after:rounded-full"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Date Selector */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const date = new Date(selectedDate);
                  date.setDate(date.getDate() - 1);
                  setSelectedDate(date.toISOString().split("T")[0]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base font-medium text-gray-900 bg-gray-50"
              />
              <button
                onClick={() => {
                  const date = new Date(selectedDate);
                  date.setDate(date.getDate() + 1);
                  setSelectedDate(date.toISOString().split("T")[0]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
                  className="px-3 py-1.5 text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg font-semibold transition-colors border border-teal-200"
                >
                  Today
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-base font-medium ${isToday ? "text-teal-600" : "text-gray-600"}`}>
                {isToday && <span className="inline-flex w-2 h-2 rounded-full bg-teal-500 mr-1.5 animate-pulse"></span>}
                {formatDisplayDate(selectedDate)}
              </span>
              <div className="h-5 w-px bg-gray-200 hidden sm:block"></div>
              <span className="text-base text-gray-500 hidden sm:block">
                {sales.length} transaction{sales.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">{todayStats?.totalSales || 0}</p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sales</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">₹{(todayStats?.totalRevenue || 0).toLocaleString()}</p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Revenue</p>
              </div>
            </div>
          </div>
        </div>

        {/* Reports Download */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Download Reports</p>
          <div className="flex flex-wrap items-center gap-3">
            <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            <button
              onClick={() => { const qs = reportFrom && reportTo ? `?from=${reportFrom}&to=${reportTo}` : ""; downloadReport(`/api/tier2/sales/report${qs}`, "SalesRegister.xlsx"); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Sales Register
            </button>
            <button
              onClick={() => { const qs = reportFrom && reportTo ? `?from=${reportFrom}&to=${reportTo}` : ""; downloadReport(`/api/tier2/sales-returns/report${qs}`, "SalesReturnRegister.xlsx"); }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Sales Return Register
            </button>
          </div>
        </div>

        {/* Print Bill Banner */}
        {lastSale && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-teal-800">Sale saved — <span className="font-semibold">{lastSale.invoiceNumber || lastSale.saleId}</span> for {lastSale.patientName}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => printSaleBill(lastSale)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Print Bill
              </button>
              <button onClick={() => setLastSale(null)} className="text-teal-500 hover:text-teal-700 text-lg leading-none px-1">×</button>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
          {([{ key: "sales", label: "Sales" }, { key: "returns", label: "Sales Returns" }] as const).map((tab) => (
            <button key={tab.key} onClick={() => setSalesTab(tab.key)} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${salesTab === tab.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{tab.label}</button>
          ))}
        </div>

        {salesTab === "returns" ? (
          /* ── Sales Returns Tab ── */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <input type="date" value={srFrom} onChange={(e) => setSrFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={srTo} onChange={(e) => setSrTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <button onClick={() => fetchSalesReturns(srFrom, srTo)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Filter</button>
              </div>
              <button onClick={() => setShowAddSrModal(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Return
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {loadingSalesReturns ? (
                <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
              ) : salesReturns.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-gray-100">
                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                  </div>
                  <p className="text-gray-500 font-medium">No sales returns yet</p>
                  <p className="text-sm text-gray-400 mt-1">Click &quot;Add Return&quot; to log a sales return</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>{["Invoice No", "Date", "Party Name", "City", "Mode", "Gross Value", "Discount", "Total GST", "Net Amount", "Reason"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {salesReturns.map((s: any) => (
                        <tr key={s._id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelectedSalesReturn(s)}>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{s.invoiceNo}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(s.invoiceDate).toLocaleDateString("en-IN")}</td>
                          <td className="px-4 py-3 text-gray-700">{s.partyName}</td>
                          <td className="px-4 py-3 text-gray-500">{s.city || "—"}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium uppercase">{s.modeOfPayment}</span></td>
                          <td className="px-4 py-3 text-gray-700">₹{(s.grossValue || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-red-600">₹{(s.discount || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-blue-600">₹{(s.totalGst || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">₹{(s.netAmount || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{s.reason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700">Totals</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">₹{salesReturns.reduce((s: number, r: any) => s + (r.grossValue || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-red-600">₹{salesReturns.reduce((s: number, r: any) => s + (r.discount || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-blue-600">₹{salesReturns.reduce((s: number, r: any) => s + (r.totalGst || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">₹{salesReturns.reduce((s: number, r: any) => s + (r.netAmount || 0), 0).toFixed(2)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                  {srHasMore && (
                    <div className="px-5 py-4 text-center border-t border-gray-100">
                      <button onClick={() => fetchSalesReturns(srFrom, srTo, srPage + 1)} disabled={loadingMoreSR} className="text-sm font-semibold text-teal-600 hover:text-teal-700 transition-colors disabled:opacity-40">
                        {loadingMoreSR ? "Loading..." : "Load more"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (<>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchSales}
              onChange={(e) => setSearchSales(e.target.value)}
              placeholder="Search by customer name or invoice..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm text-gray-900 bg-white placeholder:text-gray-400"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {(["all", "paid", "pending", "partial"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  filter === f
                    ? f === "paid"
                      ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                      : f === "pending"
                      ? "bg-red-500 text-white shadow-md shadow-red-500/20"
                      : f === "partial"
                      ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                      : "bg-teal-500 text-white shadow-md shadow-teal-500/20"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] ${filter === f ? "bg-white/20" : "bg-gray-100"}`}>
                  {counts[f]}
                </span>
              </button>
            ))}
            <button
              onClick={() => setShowNewSaleModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors whitespace-nowrap ml-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Sale
            </button>
          </div>
        </div>

        {/* Sales List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-4 sm:p-5 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded-lg w-36"></div>
                      <div className="h-3 bg-gray-100 rounded-lg w-48"></div>
                    </div>
                    <div className="h-6 w-20 bg-gray-100 rounded-lg"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredSales.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {filteredSales.map((sale) => {
                const statusAccent =
                  sale.paymentStatus === "paid" ? "border-l-emerald-400" :
                  sale.paymentStatus === "pending" ? "border-l-red-400" : "border-l-amber-400";
                return (
                  <div
                    key={sale._id}
                    onClick={() => openSaleDetail(sale)}
                    className={`group px-5 py-4 hover:bg-gray-50 transition-all cursor-pointer border-l-4 ${statusAccent}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-white font-bold text-sm">{sale.patientName?.charAt(0)?.toUpperCase() || "?"}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 text-sm truncate">{sale.patientName}</p>
                          {sale.patientPhone && <p className="text-xs text-gray-400 hidden sm:block">{sale.patientPhone}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400">
                          <span className="font-mono">{sale.invoiceNumber || sale.saleId}</span>
                          <span>·</span>
                          <span>{new Date(sale.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                          <span>·</span>
                          <span>{sale.items.length} item{sale.items.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>

                      {/* Amount + badges */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-base font-bold text-gray-900">₹{sale.totalAmount.toLocaleString()}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getPaymentMethodStyle(sale.paymentMethod)}`}>
                            {sale.paymentMethod.toUpperCase()}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getPaymentStatusStyle(sale.paymentStatus)}`}>
                            {sale.paymentStatus.charAt(0).toUpperCase() + sale.paymentStatus.slice(1)}
                          </span>
                        </div>
                      </div>

                      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
                <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-gray-700 font-semibold text-lg">
                {searchSales ? "No matching sales found" : filter !== "all" ? `No ${filter} sales` : "No sales yet"}
              </p>
              <p className="text-gray-400 text-base mt-1">
                {searchSales ? "Try a different search term" : filter !== "all" ? "Try a different filter" : "Create your first sale for this date"}
              </p>
              {filter === "all" && !searchSales && (
                <button
                  onClick={() => setShowNewSaleModal(true)}
                  className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl text-sm font-medium hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  New Sale
                </button>
              )}
            </div>
          )}
        </div>
        </>)}
      </main>

      {/* Sales Return Detail Modal */}
      {selectedSalesReturn && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Sales Return Details</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedSalesReturn.invoiceNo}</p>
              </div>
              <button onClick={() => setSelectedSalesReturn(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Invoice No", value: selectedSalesReturn.invoiceNo || "—" },
                  { label: "Date", value: selectedSalesReturn.invoiceDate ? new Date(selectedSalesReturn.invoiceDate).toLocaleDateString("en-IN") : "—" },
                  { label: "Party Name", value: selectedSalesReturn.partyName || "—" },
                  { label: "City", value: selectedSalesReturn.city || "—" },
                  { label: "Mode", value: (selectedSalesReturn.modeOfPayment || "—").toUpperCase() },
                  { label: "Reason", value: selectedSalesReturn.reason || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{value}</p>
                  </div>
                ))}
              </div>

              {selectedSalesReturn.items?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Items</p>
                  <div className="space-y-2">
                    {selectedSalesReturn.items.map((item: any, i: number) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-gray-800 text-sm">{item.itemName}</p>
                          <span className="text-xs font-bold text-orange-700">₹{(item.total || 0).toFixed(2)}</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
                          {[
                            { label: "Qty", value: item.quantity },
                            { label: "Unit Price", value: `₹${(item.unitPrice || 0).toFixed(2)}` },
                            { label: "Discount", value: `₹${(item.discount || 0).toFixed(2)}` },
                            { label: "GST%", value: `${item.gstRate || 0}%` },
                            { label: "Restock", value: item.restock ? "Yes" : "No" },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[10px] text-gray-400 font-medium">{label}</p>
                              <p className="font-semibold text-gray-700">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                {[
                  { label: "Gross Value", value: `₹${(selectedSalesReturn.grossValue || 0).toFixed(2)}` },
                  { label: "Discount", value: `−₹${(selectedSalesReturn.discount || 0).toFixed(2)}`, red: true },
                  { label: "CGST", value: `₹${((selectedSalesReturn.gst0?.cgst || 0) + (selectedSalesReturn.gst5?.cgst || 0) + (selectedSalesReturn.gst12?.cgst || 0) + (selectedSalesReturn.gst18?.cgst || 0) + (selectedSalesReturn.gst28?.cgst || 0)).toFixed(2)}` },
                  { label: "SGST", value: `₹${((selectedSalesReturn.gst0?.sgst || 0) + (selectedSalesReturn.gst5?.sgst || 0) + (selectedSalesReturn.gst12?.sgst || 0) + (selectedSalesReturn.gst18?.sgst || 0) + (selectedSalesReturn.gst28?.sgst || 0)).toFixed(2)}` },
                  { label: "IGST", value: `₹${((selectedSalesReturn.gst0?.igst || 0) + (selectedSalesReturn.gst5?.igst || 0) + (selectedSalesReturn.gst12?.igst || 0) + (selectedSalesReturn.gst18?.igst || 0) + (selectedSalesReturn.gst28?.igst || 0)).toFixed(2)}` },
                  { label: "Total GST", value: `₹${(selectedSalesReturn.totalGst || 0).toFixed(2)}` },
                  ...(selectedSalesReturn.roundingAmount ? [{ label: "Rounding", value: `₹${selectedSalesReturn.roundingAmount.toFixed(2)}` }] : []),
                ].map(({ label, value, red }: any) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label}</span>
                    <span className={`font-medium ${red ? "text-red-600" : "text-gray-700"}`}>{value}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="font-bold text-gray-900">Net Amount</span>
                  <span className="text-lg font-bold text-orange-700">₹{(selectedSalesReturn.netAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Sales Return Modal */}
      {showAddSrModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex-none px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Sales Return</h3>
              <button onClick={() => setShowAddSrModal(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleAddSalesReturn} className="flex-1 overflow-y-auto min-h-0 p-6 space-y-5">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Invoice No <span className="text-red-400">*</span></label><input required value={srForm.invoiceNo} onChange={(e) => setSrForm(f => ({ ...f, invoiceNo: e.target.value }))} placeholder="Original sale invoice no" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Invoice Date <span className="text-red-400">*</span></label><input required type="date" value={srForm.invoiceDate} onChange={(e) => setSrForm(f => ({ ...f, invoiceDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Party Name <span className="text-red-400">*</span></label><input required value={srForm.partyName} onChange={(e) => setSrForm(f => ({ ...f, partyName: e.target.value }))} placeholder="Customer name" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">City</label><input value={srForm.city} onChange={(e) => setSrForm(f => ({ ...f, city: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Mode of Payment <span className="text-red-400">*</span></label><select value={srForm.modeOfPayment} onChange={(e) => setSrForm(f => ({ ...f, modeOfPayment: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white"><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="credit">Credit</option></select></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Reason</label><input value={srForm.reason} onChange={(e) => setSrForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Wrong item, Damaged" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" /></div>
                <div className="col-span-2 flex items-center gap-3 pt-1">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={srForm.isInterstate} onChange={(e) => setSrForm(f => ({ ...f, isInterstate: e.target.checked }))} className="sr-only peer" />
                    <div className="w-8 h-4 bg-gray-200 rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-teal-500"></div>
                  </label>
                  <span className="text-xs font-semibold text-gray-600">Interstate (IGST)</span>
                </div>
              </div>

              {/* Items */}
              <div>
                <datalist id="sr-inv-list">
                  {invSuggestions.map((inv) => <option key={inv._id} value={inv.name} />)}
                </datalist>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Items <span className="text-red-400">*</span></p>
                  <button type="button" onClick={() => setSrForm(f => ({ ...f, items: [...f.items, { ...EMPTY_SR_ITEM }] }))} className="text-xs text-teal-600 font-semibold hover:text-teal-700">+ Add Item</button>
                </div>
                <div className="space-y-3">
                  {srForm.items.map((item, i) => {
                    const ic = "w-full border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none";
                    const matchedInv = invSuggestions.find(inv => inv.name.toLowerCase() === item.itemName.toLowerCase());
                    return (
                      <div key={i} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex-1">
                            <label className="block text-[10px] text-gray-400 mb-0.5">Product Name <span className="text-red-400">*</span></label>
                            <input list="sr-inv-list" placeholder="Type to search inventory..." required value={item.itemName}
                              onChange={(e) => {
                                const name = e.target.value;
                                const match = invSuggestions.find(inv => inv.name.toLowerCase() === name.toLowerCase());
                                const items = [...srForm.items];
                                items[i] = { ...items[i], itemName: name, itemId: match?._id || "", unitPrice: match?.sellingPrice ?? items[i].unitPrice, gstRate: match?.gstRate ?? items[i].gstRate };
                                items[i].total = +(items[i].unitPrice * items[i].quantity - items[i].discount).toFixed(2);
                                setSrForm(f => ({ ...f, items, ...recomputeSrTotals(items, f.discount, f.roundingAmount) }));
                              }}
                              className="w-full border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none"
                            />
                            {matchedInv && <p className="text-[10px] text-emerald-600 mt-0.5">✓ Stock: {matchedInv.currentStock} {matchedInv.unit}</p>}
                          </div>
                          {srForm.items.length > 1 && (
                            <button type="button" onClick={() => { const items = srForm.items.filter((_, j) => j !== i); setSrForm(f => ({ ...f, items, ...recomputeSrTotals(items, f.discount, f.roundingAmount) })); }} className="mt-4 text-red-400 hover:text-red-600 p-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                          <div><label className="block text-[10px] text-gray-400 mb-0.5">Qty <span className="text-red-400">*</span></label><input type="number" min={1} required value={item.quantity} onChange={(e) => { const items = [...srForm.items]; items[i].quantity = +e.target.value; items[i].total = +(items[i].unitPrice * +e.target.value - items[i].discount).toFixed(2); setSrForm(f => ({ ...f, items, ...recomputeSrTotals(items, f.discount, f.roundingAmount) })); }} className={ic} /></div>
                          <div><label className="block text-[10px] text-gray-400 mb-0.5">MRP ₹ <span className="text-red-400">*</span></label><input type="number" min={0} step="0.01" required value={item.unitPrice} onChange={(e) => { const items = [...srForm.items]; items[i].unitPrice = +e.target.value; items[i].total = +(+e.target.value * items[i].quantity - items[i].discount).toFixed(2); setSrForm(f => ({ ...f, items, ...recomputeSrTotals(items, f.discount, f.roundingAmount) })); }} className={ic} /></div>
                          <div><label className="block text-[10px] text-gray-400 mb-0.5">Disc ₹</label><input type="number" min={0} step="0.01" value={item.discount} onChange={(e) => { const items = [...srForm.items]; items[i].discount = +e.target.value; items[i].total = +(items[i].unitPrice * items[i].quantity - +e.target.value).toFixed(2); setSrForm(f => ({ ...f, items, ...recomputeSrTotals(items, f.discount, f.roundingAmount) })); }} className={ic} /></div>
                          <div><label className="block text-[10px] text-gray-400 mb-0.5">GST%</label><input type="number" min={0} max={100} step="0.01" value={item.gstRate} onChange={(e) => { const items = [...srForm.items]; items[i].gstRate = +e.target.value || 0; setSrForm(f => ({ ...f, items, ...recomputeSrTotals(items, f.discount, f.roundingAmount) })); }} className={ic} /></div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" checked={item.restock} onChange={(e) => { const items = [...srForm.items]; items[i].restock = e.target.checked; setSrForm(f => ({ ...f, items })); }} className="sr-only peer" />
                              <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-teal-500"></div>
                            </label>
                            <span className="text-xs text-gray-600">{item.restock ? <span className="text-teal-600 font-semibold">Restock inventory</span> : <span className="text-gray-400">Do not restock</span>}</span>
                          </div>
                          <div className="text-sm font-bold text-teal-700">₹{item.total.toFixed(2)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                {(() => {
                  let cgst = 0, sgst = 0, igst = 0;
                  srForm.items.forEach(it => {
                    const r = it.gstRate || 0;
                    if (r > 0) {
                      if (srForm.isInterstate) igst += it.total * r / 100;
                      else { cgst += it.total * r / 200; sgst += it.total * r / 200; }
                    }
                  });
                  const totalGst = srForm.isInterstate ? +igst.toFixed(2) : +(cgst + sgst).toFixed(2);
                  return <>
                    <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-medium">₹{srForm.grossValue.toFixed(2)}</span></div>
                    {srForm.isInterstate
                      ? <div className="flex justify-between"><span className="text-gray-500">IGST</span><span className="font-medium text-blue-600">₹{igst.toFixed(2)}</span></div>
                      : <><div className="flex justify-between"><span className="text-gray-500">CGST</span><span className="font-medium text-blue-600">₹{cgst.toFixed(2)}</span></div><div className="flex justify-between"><span className="text-gray-500">SGST</span><span className="font-medium text-blue-600">₹{sgst.toFixed(2)}</span></div></>
                    }
                    <div className="flex justify-between"><span className="text-gray-500">Total GST</span><span className="font-medium text-blue-600">₹{totalGst.toFixed(2)}</span></div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Discount</span>
                      <input type="number" min={0} step="0.01" value={srForm.discount} onChange={(e) => setSrForm(f => { const discount = +e.target.value; return { ...f, discount, ...recomputeSrTotals(f.items, discount, f.roundingAmount) }; })} className="w-24 border border-gray-200 bg-white rounded-lg px-2 py-1 text-xs text-right outline-none focus:border-teal-400" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Rounding</span>
                      <input type="number" step="0.01" value={srForm.roundingAmount} onChange={(e) => setSrForm(f => { const roundingAmount = +e.target.value; return { ...f, roundingAmount, ...recomputeSrTotals(f.items, f.discount, roundingAmount) }; })} className="w-24 border border-gray-200 bg-white rounded-lg px-2 py-1 text-xs text-right outline-none focus:border-teal-400" />
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-base">
                      <span>Net Amount</span><span className="text-teal-700">₹{srForm.netAmount.toFixed(2)}</span>
                    </div>
                  </>;
                })()}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddSrModal(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={srSubmitting} className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60">{srSubmitting ? "Saving..." : "Save Return"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedSale(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-none bg-white border-b border-gray-100 px-5 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Invoice</p>
                  <p className="text-base font-bold text-gray-900 font-mono">{selectedSale.invoiceNumber || selectedSale.saleId}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => printSaleBill(selectedSale)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Print
                  </button>
                  <button onClick={() => setSelectedSale(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {loadingSaleDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-7 h-7 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* Customer hero */}
                <div className="px-5 py-5 border-b border-gray-100 flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl flex items-center justify-center shadow-md shadow-teal-500/20 flex-shrink-0">
                    <span className="text-white font-bold text-lg">{selectedSale.patientName?.charAt(0)?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-base truncate">{selectedSale.patientName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selectedSale.patientPhone || "No phone on record"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(selectedSale.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <div className="ml-auto flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getPaymentStatusStyle(selectedSale.paymentStatus)}`}>
                      {selectedSale.paymentStatus.charAt(0).toUpperCase() + selectedSale.paymentStatus.slice(1)}
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getPaymentMethodStyle(selectedSale.paymentMethod)}`}>
                      {selectedSale.paymentMethod.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Items */}
                <div className="px-5 pt-5 pb-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                    Items · {selectedSale.items.length}
                  </p>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Item</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center">Qty</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-right">Amount</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {selectedSale.items.map((item, i) => (
                        <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{item.itemName}</p>
                            <p className="text-[11px] text-gray-400">₹{item.unitPrice} each{item.discount > 0 ? ` · -₹${item.discount} off` : ""}</p>
                          </div>
                          <p className="text-sm font-semibold text-gray-600 text-center">{item.quantity}</p>
                          <p className="text-sm font-bold text-gray-900 text-right">₹{item.total.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Payment summary */}
                <div className="px-5 py-4">
                  <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                    <div className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-medium text-gray-800">₹{(selectedSale.subtotal || 0).toLocaleString()}</span>
                    </div>
                    {(() => {
                      const gstAmount = selectedSale.items.reduce((sum, it) => sum + (it.total * (it.gstRate || 0) / 100), 0);
                      return gstAmount > 0 ? (
                        <div className="flex justify-between items-center px-4 py-3 text-sm">
                          <span className="text-gray-500">GST</span>
                          <span className="font-medium text-blue-600">₹{Math.round(gstAmount).toLocaleString()}</span>
                        </div>
                      ) : null;
                    })()}
                    {selectedSale.discountAmount > 0 && (
                      <div className="flex justify-between items-center px-4 py-3 text-sm">
                        <span className="text-gray-500">Discount ({selectedSale.discountPercentage}%)</span>
                        <span className="font-medium text-red-500">-₹{selectedSale.discountAmount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center px-4 py-3">
                      <span className="font-bold text-gray-900">Total</span>
                      <span className="text-lg font-black text-gray-900">₹{selectedSale.totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-3 text-sm">
                      <span className="text-gray-500">Paid</span>
                      <span className="font-semibold text-emerald-600">₹{selectedSale.amountPaid.toLocaleString()}</span>
                    </div>
                    {selectedSale.amountDue > 0 && (
                      <div className="flex justify-between items-center px-4 py-3 text-sm bg-red-50/60">
                        <span className="font-semibold text-red-600">Due</span>
                        <span className="font-bold text-red-600">₹{selectedSale.amountDue.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Collect Payment */}
                {selectedSale.amountDue > 0 && (
                  <div className="px-5 pb-5">
                    <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                      <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3">Collect Payment</p>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={collectAmount}
                          onChange={(e) => setCollectAmount(e.target.value)}
                          placeholder={`Up to ₹${selectedSale.amountDue}`}
                          max={selectedSale.amountDue}
                          min={1}
                          className="flex-1 px-3 py-2.5 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm bg-white"
                        />
                        <button
                          onClick={handleCollectPayment}
                          disabled={collectingPayment || !collectAmount}
                          className="px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-bold text-sm disabled:opacity-40 flex items-center gap-2"
                        >
                          {collectingPayment ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Collect"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selectedSale.notes && (
                  <div className="px-5 pb-5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Notes</p>
                    <p className="text-sm text-gray-600">{selectedSale.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Sale Modal */}
      {showNewSaleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-w-5xl" style={{ maxHeight: "92vh" }}>

            {/* TOP: Prescription pane — fixed */}
            {(prescription || loadingPrescription || prescriptionChecked) && (
              <div className="flex-shrink-0 border-b border-gray-200 bg-amber-50/30 max-h-[40vh] overflow-y-auto">
                <div className="px-5 py-3">
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Prescription
                  </p>
                  {loadingPrescription && (
                    <div className="flex items-center gap-2 py-3 text-xs text-amber-700">
                      <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />Loading...
                    </div>
                  )}
                  {!loadingPrescription && prescriptionChecked && !prescription && (
                    <p className="text-xs text-gray-400 text-center py-3">No consultation recorded for this date</p>
                  )}
                  {prescription && (() => {
                    const cf = prescription.consultation.customFields;
                    const isMulti = cf?._multiIssue === true && Array.isArray(cf._issues) && cf._issues.length > 0;
                    const fd = isMulti ? (cf._issues[0]?.formData || {}) : (cf?._issues?.[0]?.formData || cf || {});

                    // Collect prescription meds
                    const allRx: { label?: string; meds: any[] }[] = [];
                    if (isMulti) {
                      cf._issues.forEach((issue: any, idx: number) => {
                        const rx = issue.formData?.prescription;
                        if (Array.isArray(rx) && rx.some((m: any) => m.name?.trim())) {
                          allRx.push({ label: issue.label || `Issue ${idx + 1}`, meds: rx.filter((m: any) => m.name?.trim()) });
                        }
                      });
                    } else {
                      const rx = cf?._issues?.[0]?.formData?.prescription || cf?.prescription;
                      if (Array.isArray(rx) && rx.some((m: any) => m.name?.trim())) {
                        allRx.push({ meds: rx.filter((m: any) => m.name?.trim()) });
                      }
                    }

                    // Lifestyle & Investigations from customFields or treatmentPlan
                    const tp = prescription.consultation.treatmentPlan;
                    const lifestyle = fd.lifestyleChanges || tp?.lifestyleChanges;
                    const investigations = fd.investigations || tp?.investigations;

                    // Legacy fields
                    const legacyTopicals = tp?.topicals;
                    const legacyOrals = tp?.orals;

                    // Cosmetology fields
                    const proc = prescription.consultation.procedure;
                    const ac = prescription.consultation.aftercare;
                    const cosmoFields: { label: string; value: string; color: string; bg: string; border: string }[] = [];
                    if (proc?.name) cosmoFields.push({ label: "Procedure", value: proc.name, color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100" });
                    if (proc?.productsAndParameters) cosmoFields.push({ label: "Products", value: proc.productsAndParameters, color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100" });
                    if (ac?.homeProducts) cosmoFields.push({ label: "Home Care", value: ac.homeProducts, color: "text-pink-600", bg: "bg-pink-50", border: "border-pink-100" });
                    if (ac?.instructions) cosmoFields.push({ label: "Aftercare", value: ac.instructions, color: "text-pink-600", bg: "bg-pink-50", border: "border-pink-100" });

                    const hasAnything = allRx.length > 0 || lifestyle || investigations || legacyTopicals || legacyOrals || cosmoFields.length > 0;
                    if (!hasAnything) {
                      return <p className="text-xs text-gray-400 text-center py-4">No prescription data found</p>;
                    }

                    return (
                      <div className="space-y-4">
                        {/* Prescription table — teal */}
                        {allRx.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                              Prescription
                            </p>
                            {allRx.map((group, gi) => (
                              <div key={gi} className={gi > 0 ? "mt-2" : ""}>
                                {group.label && <p className="text-[10px] font-semibold text-teal-600 mb-1">{group.label}</p>}
                                <div className="overflow-x-auto rounded-lg border border-teal-100">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-teal-50">
                                        <th className="px-2.5 py-1.5 text-left text-[9px] font-bold text-teal-600 uppercase">#</th>
                                        <th className="px-2.5 py-1.5 text-left text-[9px] font-bold text-teal-600 uppercase">Medicine</th>
                                        <th className="px-2.5 py-1.5 text-left text-[9px] font-bold text-teal-600 uppercase">Dosage</th>
                                        <th className="px-2.5 py-1.5 text-left text-[9px] font-bold text-teal-600 uppercase">Route</th>
                                        <th className="px-2.5 py-1.5 text-left text-[9px] font-bold text-teal-600 uppercase">Freq</th>
                                        <th className="px-2.5 py-1.5 text-left text-[9px] font-bold text-teal-600 uppercase">Duration</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.meds.map((med: any, mi: number) => (
                                        <tr key={mi} className="border-t border-teal-50 bg-white">
                                          <td className="px-2.5 py-1.5 text-teal-600 font-bold">{mi + 1}</td>
                                          <td className="px-2.5 py-1.5 font-semibold text-gray-800">{med.name}</td>
                                          <td className="px-2.5 py-1.5 text-gray-600">{med.dosage || "—"}</td>
                                          <td className="px-2.5 py-1.5 text-gray-600">{med.route || "—"}</td>
                                          <td className="px-2.5 py-1.5 text-gray-600">{med.frequency || "—"}</td>
                                          <td className="px-2.5 py-1.5 text-gray-600">{med.duration || "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Legacy topicals/orals — blue */}
                        {(legacyTopicals || legacyOrals) && (
                          <div>
                            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              Medications
                            </p>
                            <div className="space-y-1.5">
                              {legacyTopicals && <p className="text-xs text-gray-700 bg-blue-50 rounded-lg p-2 border border-blue-100"><span className="font-semibold text-blue-700">Topicals:</span> {legacyTopicals}</p>}
                              {legacyOrals && <p className="text-xs text-gray-700 bg-blue-50 rounded-lg p-2 border border-blue-100"><span className="font-semibold text-blue-700">Orals:</span> {legacyOrals}</p>}
                            </div>
                          </div>
                        )}

                        {/* Lifestyle — orange */}
                        {lifestyle && (
                          <div>
                            <p className="text-[10px] font-bold text-orange-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                              Lifestyle Changes
                            </p>
                            <p className="text-xs text-gray-700 bg-orange-50 rounded-lg p-2 border border-orange-100">{lifestyle}</p>
                          </div>
                        )}

                        {/* Investigations — purple */}
                        {investigations && (
                          <div>
                            <p className="text-[10px] font-bold text-purple-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                              Investigations
                            </p>
                            <p className="text-xs text-gray-700 bg-purple-50 rounded-lg p-2 border border-purple-100">{investigations}</p>
                          </div>
                        )}

                        {/* Cosmetology fields — violet/pink */}
                        {cosmoFields.map((f, i) => (
                          <div key={i}>
                            <p className={`text-[10px] font-bold ${f.color} uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${f.bg.replace("bg-", "bg-").replace("/50", "-500")}`}></span>
                              {f.label}
                            </p>
                            <p className={`text-xs text-gray-700 ${f.bg} rounded-lg p-2 border ${f.border}`}>{f.value}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* BELOW: New Bill Form — scrollable */}
            <form onSubmit={handleCreateSale} className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">New Sale</h2>
                    <p className="text-xs text-gray-400">Record a prescription or OTC sale</p>
                  </div>
                </div>
                <button type="button" onClick={() => { setShowNewSaleModal(false); resetSaleForm(); }} className="p-2 hover:bg-gray-100 rounded-lg">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Bill Info */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Bill Info</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Patient Name <span className="text-red-400">*</span></label>
                      <input type="text" required placeholder="Patient / customer name" value={saleForm.patientName}
                        onChange={(e) => setSaleForm(f => ({ ...f, patientName: e.target.value }))}
                        className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Doctor Name</label>
                      <input type="text" placeholder="Optional" value={saleForm.doctorName}
                        onChange={(e) => setSaleForm(f => ({ ...f, doctorName: e.target.value }))}
                        className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                      <input type="tel" placeholder="Optional" value={saleForm.patientPhone}
                        onChange={(e) => setSaleForm(f => ({ ...f, patientPhone: e.target.value }))}
                        className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">City</label>
                      <input type="text" placeholder="City" value={saleForm.city}
                        onChange={(e) => setSaleForm(f => ({ ...f, city: e.target.value }))}
                        className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Payment Mode <span className="text-red-400">*</span></label>
                      <select required value={saleForm.modeOfPayment} onChange={(e) => setSaleForm(f => ({ ...f, modeOfPayment: e.target.value }))}
                        className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none">
                        {["cash", "card", "upi", "credit"].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={saleForm.isInterstate} onChange={(e) => setSaleForm(f => ({ ...f, isInterstate: e.target.checked }))}
                          className="w-4 h-4 rounded accent-teal-600" />
                        <span className="text-sm text-gray-600">Interstate <span className="text-xs text-gray-400">(IGST)</span></span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Items</p>
                  <datalist id="sale-inv-list-fds">
                    {invSuggestions.map((inv) => <option key={inv._id} value={inv.name} />)}
                  </datalist>
                  <div className="space-y-3">
                    {saleForm.items.map((item, i) => {
                      const ic = "w-full border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none";
                      const matchedInv = invSuggestions.find(inv => inv.name.toLowerCase() === item.itemName.toLowerCase());
                      return (
                        <div key={i} className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Item {i + 1}</span>
                            {saleForm.items.length > 1 && (
                              <button type="button" onClick={() => setSaleForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                                className="w-5 h-5 rounded-full bg-red-100 text-red-500 hover:bg-red-200 text-xs flex items-center justify-center font-bold transition-colors">×</button>
                            )}
                          </div>
                          <div className="mb-2">
                            <label className="block text-[10px] text-gray-400 mb-0.5">Product Name <span className="text-red-400">*</span></label>
                            <input list="sale-inv-list-fds" placeholder="Type to search inventory..." value={item.itemName}
                              onChange={(e) => {
                                const name = e.target.value;
                                const match = invSuggestions.find(inv => inv.name.toLowerCase() === name.toLowerCase());
                                setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : {
                                  ...it, itemName: name, itemId: match?._id || "",
                                  mrp: match?.sellingPrice ?? it.mrp, gstRate: match?.gstRate ?? it.gstRate,
                                  manufacturer: match?.manufacturer || it.manufacturer,
                                  batchNo: match?.batchNumber || it.batchNo,
                                  expiryDate: match?.expiryDate ? new Date(match.expiryDate).toISOString().split("T")[0] : it.expiryDate,
                                  hsnCode: match?.hsnCode || it.hsnCode,
                                  packing: match?.packing || it.packing,
                                  total: +((it.qty * (match?.sellingPrice ?? it.mrp)) - it.discount).toFixed(2),
                                })}));
                              }}
                              className="w-full border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none"
                              required />
                            {item.itemName && !matchedInv && <p className="text-[10px] text-amber-600 mt-0.5 px-0.5">⚠ Item not found in inventory — will fail on save</p>}
                            {matchedInv && <p className="text-[10px] text-emerald-600 mt-0.5 px-0.5">✓ Stock: {matchedInv.currentStock} {matchedInv.unit}</p>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">HSN</label><input type="text" placeholder="e.g. 30049099" value={item.hsnCode} onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, hsnCode: e.target.value }) }))} className={ic} /></div>
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">Packing</label><input type="text" placeholder="e.g. 10×10" value={item.packing} onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, packing: e.target.value }) }))} className={ic} /></div>
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">Manufacturer</label><input type="text" placeholder="Mfg" value={item.manufacturer} onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, manufacturer: e.target.value }) }))} className={ic} /></div>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">Batch</label><input type="text" value={item.batchNo} onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, batchNo: e.target.value }) }))} className={ic} /></div>
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">Expiry</label><input type="date" value={item.expiryDate} onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, expiryDate: e.target.value }) }))} className={ic} /></div>
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">MRP ₹ <span className="text-red-400">*</span></label><input type="number" min={0} step="0.01" value={item.mrp} onChange={(e) => { const mrp = Number(e.target.value) || 0; setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, mrp, total: +(it.qty * mrp - it.discount).toFixed(2) }) })); }} className={ic} required /></div>
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">Qty <span className="text-red-400">*</span></label><input type="number" min={1} value={item.qty} onChange={(e) => { const qty = Number(e.target.value) || 0; setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, qty, total: +(qty * it.mrp - it.discount).toFixed(2) }) })); }} className={ic} required /></div>
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">Disc ₹</label><input type="number" min={0} step="0.01" value={item.discount} onChange={(e) => { const discount = Number(e.target.value) || 0; setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, discount, total: +(it.qty * it.mrp - discount).toFixed(2) }) })); }} className={ic} /></div>
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">GST%</label><input type="number" min={0} max={100} step="0.01" value={item.gstRate} onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, gstRate: Number(e.target.value) || 0 }) }))} className={ic} /></div>
                            <div><label className="block text-[10px] text-gray-400 mb-0.5">Total ₹</label><input type="number" value={item.total} readOnly className="w-full border border-teal-200 bg-teal-50 text-teal-700 rounded-lg px-2 py-1.5 text-xs font-bold outline-none cursor-default" /></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => setSaleForm(f => ({ ...f, items: [...f.items, { ...EMPTY_SALE_ITEM }] }))}
                    className="mt-2 w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 rounded-xl text-xs font-semibold hover:border-teal-300 hover:text-teal-500 transition-colors">
                    + Add Another Item
                  </button>
                </div>

                {/* GST Summary */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  {(() => {
                    const gross = saleForm.items.reduce((s, it) => s + it.total, 0);
                    let cgst = 0, sgst = 0, igst = 0;
                    saleForm.items.forEach(it => {
                      const r = it.gstRate;
                      if (r > 0) { if (saleForm.isInterstate) igst += it.total * r / 100; else { cgst += it.total * r / 200; sgst += it.total * r / 200; } }
                    });
                    const totalGst = saleForm.isInterstate ? +igst.toFixed(2) : +(cgst + sgst).toFixed(2);
                    const net = +(gross + totalGst + saleForm.roundingAmount).toFixed(2);
                    return <>
                      <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-medium">₹{gross.toFixed(2)}</span></div>
                      {saleForm.isInterstate
                        ? <div className="flex justify-between"><span className="text-gray-500">IGST</span><span className="font-medium text-blue-600">₹{igst.toFixed(2)}</span></div>
                        : <><div className="flex justify-between"><span className="text-gray-500">CGST</span><span className="font-medium text-blue-600">₹{cgst.toFixed(2)}</span></div><div className="flex justify-between"><span className="text-gray-500">SGST</span><span className="font-medium text-blue-600">₹{sgst.toFixed(2)}</span></div></>
                      }
                      <div className="flex justify-between"><span className="text-gray-500">Total GST</span><span className="font-medium text-blue-600">₹{totalGst.toFixed(2)}</span></div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Rounding</span>
                        <input type="number" step="0.01" value={saleForm.roundingAmount} onChange={(e) => setSaleForm(f => ({ ...f, roundingAmount: Number(e.target.value) || 0 }))}
                          className="w-24 border border-gray-200 bg-white rounded-lg px-2 py-1 text-xs text-right outline-none focus:border-teal-400" />
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-base">
                        <span>Net Amount</span><span className="text-teal-700">₹{net.toFixed(2)}</span>
                      </div>
                    </>;
                  })()}
                </div>
              </div>

              <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
                <button type="button" onClick={() => { setShowNewSaleModal(false); resetSaleForm(); }} className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-[2] px-8 py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 transition-colors">{submitting ? "Saving..." : "Save Sale"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
