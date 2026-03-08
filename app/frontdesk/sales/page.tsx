"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface InventoryItem {
  _id: string;
  itemCode: string;
  name: string;
  genericName?: string;
  currentStock: number;
  sellingPrice: number;
  unit: string;
  category?: string;
}

interface CartItem extends InventoryItem {
  quantity: number;
  discount: number;
}

interface SaleItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
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
  const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchingInventory, setSearchingInventory] = useState(false);
  const [saleForm, setSaleForm] = useState({
    patientName: "",
    patientPhone: "",
    paymentMethod: "cash",
    discountPercentage: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [todayStats, setTodayStats] = useState<any>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filter, setFilter] = useState<"all" | "paid" | "pending" | "partial">("all");
  const [searchSales, setSearchSales] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [loadingSaleDetail, setLoadingSaleDetail] = useState(false);
  const [collectingPayment, setCollectingPayment] = useState(false);
  const [collectAmount, setCollectAmount] = useState("");
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [prescription, setPrescription] = useState<PrescriptionData | null>(null);
  const [loadingPrescription, setLoadingPrescription] = useState(false);
  const [prescriptionChecked, setPrescriptionChecked] = useState(false);

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const fetchPrescription = async (patientId: string, date?: string) => {
    setLoadingPrescription(true);
    setPrescription(null);
    setPrescriptionChecked(false);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const url = `/api/tier2/sales/prescription?patientId=${patientId}${date ? `&date=${date}` : ""}`;
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
      setSaleForm((prev) => ({
        ...prev,
        patientName: pname,
        patientPhone: pphone,
      }));
      fetchPrescription(pid, aptDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSales = async (token: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tier2/sales?date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setSales(data.data.sales || []);
        setTodayStats(data.data.todayStats);
      }
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const searchInventory = async (query: string) => {
    if (query.length < 2) {
      setInventory([]);
      return;
    }
    setSearchingInventory(true);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const response = await fetch(`/api/tier2/inventory?search=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setInventory(data.data.items || []);
      }
    } catch (error) {
      console.error("Error searching inventory:", error);
    } finally {
      setSearchingInventory(false);
    }
  };

  // Debounced inventory search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchQuery.length >= 2) {
      searchTimerRef.current = setTimeout(() => {
        searchInventory(searchQuery);
      }, 400);
    } else {
      setInventory([]);
    }
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const addToCart = (item: InventoryItem) => {
    const existingIndex = cart.findIndex((c) => c._id === item._id);
    if (existingIndex >= 0) {
      const newCart = [...cart];
      if (newCart[existingIndex].quantity < item.currentStock) {
        newCart[existingIndex].quantity += 1;
        setCart(newCart);
      }
    } else {
      setCart([...cart, { ...item, quantity: 1, discount: 0 }]);
    }
    setSearchQuery("");
    setInventory([]);
  };

  const updateCartQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    const newQty = newCart[index].quantity + delta;
    if (newQty >= 1 && newQty <= newCart[index].currentStock) {
      newCart[index].quantity = newQty;
      setCart(newCart);
    }
  };

  const updateCartDiscount = (index: number, discount: number) => {
    const newCart = [...cart];
    newCart[index].discount = Math.max(0, discount);
    setCart(newCart);
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => {
      return sum + item.sellingPrice * item.quantity - item.discount;
    }, 0);
    const discountAmount = subtotal * (saleForm.discountPercentage / 100);
    const total = subtotal - discountAmount;
    return { subtotal, discountAmount, total };
  };

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      showToast("error", "Please add items to the cart");
      return;
    }
    if (!saleForm.patientName.trim()) {
      showToast("error", "Please enter customer name");
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem("frontdeskToken");
    const totals = calculateTotals();

    try {
      const response = await fetch("/api/tier2/sales", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientName: saleForm.patientName,
          patientPhone: saleForm.patientPhone,
          items: cart.map((item) => ({
            itemId: item._id,
            quantity: item.quantity,
            discount: item.discount,
          })),
          discountPercentage: saleForm.discountPercentage,
          paymentMethod: saleForm.paymentMethod,
          amountPaid: totals.total,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showToast("success", `Sale completed! Invoice: ${data.data.invoiceNumber || data.data.saleId}`);
        setShowNewSaleModal(false);
        resetSaleForm();
        fetchSales(token!);
      } else {
        showToast("error", data.message || "Failed to create sale");
      }
    } catch (error) {
      showToast("error", "Error creating sale");
    } finally {
      setSubmitting(false);
    }
  };

  const resetSaleForm = () => {
    setCart([]);
    setSearchQuery("");
    setInventory([]);
    setPrescription(null);
    setPrescriptionChecked(false);
    setSaleForm({
      patientName: "",
      patientPhone: "",
      paymentMethod: "cash",
      discountPercentage: 0,
    });
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

  const totals = calculateTotals();

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
            <button
              onClick={() => setShowNewSaleModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20 flex items-center gap-2 font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="hidden sm:inline text-base">New Sale</span>
              <span className="sm:hidden text-base">Sale</span>
            </button>
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
          <div className="flex gap-2 overflow-x-auto">
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
      </main>

      {/* Sale Detail Drawer */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedSale(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-white shadow-2xl flex flex-col animate-slide-in-right"
            style={{ height: "100vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="flex-none sticky top-0 bg-white border-b border-gray-100 px-5 py-4 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Invoice</p>
                  <p className="text-base font-bold text-gray-900 font-mono">{selectedSale.invoiceNumber || selectedSale.saleId}</p>
                </div>
                <button onClick={() => setSelectedSale(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {loadingSaleDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-7 h-7 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
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
          <form
            onSubmit={handleCreateSale}
            className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col ${
              (prescription || loadingPrescription || prescriptionChecked) ? "max-w-5xl" : "max-w-xl"
            }`}
            style={{ height: "90vh" }}
          >
            {/* ── Header ── */}
            <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">New Sale</h2>
                {saleForm.patientName && <p className="text-xs text-gray-400 mt-0.5">{saleForm.patientName}</p>}
              </div>
              <button
                type="button"
                onClick={() => { setShowNewSaleModal(false); resetSaleForm(); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* ── Body: left prescription pane + right actions pane ── */}
            {/*
                KEY APPROACH:
                - Body uses flex-1 to fill space between header and footer.
                - Left pane: fixed width + overflow-y-auto. Its height comes from
                  align-items:stretch (default flex), so it matches the body height.
                - Right pane: flex-1 flex-col. Cart section gets flex-1 min-h-0
                  overflow-y-auto. Payment section is flex-none (pinned).
                  This works because right pane height = body height = definite.
            */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* LEFT: Doctor's Prescription */}
              {(prescription || loadingPrescription || prescriptionChecked) && (
                <div className="w-64 flex-shrink-0 border-r border-gray-100 overflow-y-auto bg-amber-50/30">
                  <div className="p-4">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Prescription
                    </p>

                    {loadingPrescription && (
                      <div className="flex items-center gap-2 py-4 text-xs text-amber-700">
                        <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        Loading...
                      </div>
                    )}

                    {!loadingPrescription && prescriptionChecked && !prescription && (
                      <div className="text-center py-8 px-2">
                        <p className="text-xs text-gray-400 leading-relaxed">No consultation recorded for this date</p>
                      </div>
                    )}

                    {prescription && (() => {
                      const renderDermFields = (fd: Record<string, any>, structuredMeds?: { name: string; dosage: string; frequency: string; duration: string }[]) => {
                        const meds = structuredMeds ?? (Array.isArray(fd.medications) ? fd.medications : []);
                        return (
                          <div className="space-y-3">
                            {meds.length > 0 && (
                              <div>
                                <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1.5">Medications</p>
                                <ul className="space-y-1.5">
                                  {meds.map((med: any, i: number) => (
                                    <li key={i} className="bg-white rounded-lg p-2 border border-amber-100 text-xs">
                                      <p className="font-semibold text-gray-800">{med.name}</p>
                                      {(med.dosage || med.frequency || med.duration) && (
                                        <p className="text-gray-400 mt-0.5">{[med.dosage, med.frequency, med.duration].filter(Boolean).join(" · ")}</p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {fd.topicals && <div><p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Topical</p><p className="text-xs text-gray-700 bg-white rounded-lg p-2 border border-amber-100">{fd.topicals}</p></div>}
                            {fd.orals && <div><p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Oral</p><p className="text-xs text-gray-700 bg-white rounded-lg p-2 border border-amber-100">{fd.orals}</p></div>}
                            {fd.investigations && <div><p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Investigations</p><p className="text-xs text-gray-700 bg-white rounded-lg p-2 border border-amber-100">{fd.investigations}</p></div>}
                            {fd.lifestyleChanges && <div><p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Lifestyle</p><p className="text-xs text-gray-700 bg-white rounded-lg p-2 border border-amber-100">{fd.lifestyleChanges}</p></div>}
                            {meds.length === 0 && !fd.topicals && !fd.orals && !fd.investigations && !fd.lifestyleChanges && (
                              <p className="text-xs text-gray-400 italic">No treatment recorded</p>
                            )}
                          </div>
                        );
                      };

                      const renderCosmoFields = (fd: Record<string, any>, proc?: typeof prescription.consultation.procedure, ac?: typeof prescription.consultation.aftercare) => {
                        const name = proc?.name ?? fd.name;
                        const products = proc?.productsAndParameters ?? fd.productsAndParameters;
                        const homeProducts = ac?.homeProducts ?? fd.homeProducts;
                        const instructions = ac?.instructions ?? fd.instructions;
                        return (
                          <div className="space-y-3">
                            {name && <div><p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Procedure</p><p className="text-xs font-semibold text-gray-800 bg-white rounded-lg p-2 border border-amber-100">{name}</p></div>}
                            {products && <div><p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Products</p><p className="text-xs text-gray-700 bg-white rounded-lg p-2 border border-amber-100">{products}</p></div>}
                            {homeProducts && <div><p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Home Care</p><p className="text-xs text-gray-700 bg-white rounded-lg p-2 border border-amber-100">{homeProducts}</p></div>}
                            {instructions && <div><p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Aftercare</p><p className="text-xs text-gray-700 bg-white rounded-lg p-2 border border-amber-100">{instructions}</p></div>}
                            {!name && !products && !homeProducts && !instructions && (
                              <p className="text-xs text-gray-400 italic">No treatment recorded</p>
                            )}
                          </div>
                        );
                      };

                      const cf = prescription.consultation.customFields;
                      const isMulti = cf?._multiIssue === true && Array.isArray(cf._issues) && cf._issues.length > 1;

                      if (prescription.type === "dermatology") {
                        const tp = prescription.consultation.treatmentPlan;
                        if (isMulti) {
                          return cf._issues.map((issue: any, idx: number) => (
                            <div key={idx} className={idx > 0 ? "pt-3 mt-3 border-t border-amber-200" : ""}>
                              <p className="text-[10px] font-bold text-amber-700 mb-2">{issue.label || `Issue ${idx + 1}`}</p>
                              {renderDermFields(issue.formData || {}, idx === 0 ? tp?.medications : undefined)}
                            </div>
                          ));
                        }
                        return renderDermFields(
                          { topicals: tp?.topicals, orals: tp?.orals, investigations: tp?.investigations, lifestyleChanges: tp?.lifestyleChanges },
                          tp?.medications
                        );
                      }

                      // cosmetology
                      const proc = prescription.consultation.procedure;
                      const ac = prescription.consultation.aftercare;
                      if (isMulti) {
                        return cf._issues.map((issue: any, idx: number) => (
                          <div key={idx} className={idx > 0 ? "pt-3 mt-3 border-t border-amber-200" : ""}>
                            <p className="text-[10px] font-bold text-amber-700 mb-2">{issue.label || `Issue ${idx + 1}`}</p>
                            {renderCosmoFields(issue.formData || {}, idx === 0 ? proc : undefined, idx === 0 ? ac : undefined)}
                          </div>
                        ));
                      }
                      return renderCosmoFields({}, proc, ac);
                    })()}
                  </div>
                </div>
              )}

              {/* RIGHT: single scrollable column — everything stacks naturally */}
              <div className="flex-1 overflow-y-auto min-w-0 px-5 py-5 space-y-5">

                {/* Customer fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Customer Name *</label>
                    <input
                      type="text"
                      value={saleForm.patientName}
                      onChange={(e) => setSaleForm({ ...saleForm, patientName: e.target.value })}
                      placeholder="Enter name"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm text-gray-900 bg-gray-50"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone <span className="text-gray-300 font-normal normal-case">(optional)</span></label>
                    <input
                      type="tel"
                      value={saleForm.patientPhone}
                      onChange={(e) => setSaleForm({ ...saleForm, patientPhone: e.target.value })}
                      placeholder="Phone number"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm text-gray-900 bg-gray-50"
                    />
                  </div>
                </div>

                {/* Search — absolute dropdown so it floats over cart below */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Search & Add Items</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Type medicine name or code..."
                      className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm text-gray-900 bg-gray-50"
                    />
                    {searchingInventory && (
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {inventory.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="px-3 py-1.5 bg-gray-50 border-b text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                          {inventory.length} result{inventory.length !== 1 ? "s" : ""}
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {inventory.map((item) => (
                            <button
                              key={item._id}
                              type="button"
                              onClick={() => addToCart(item)}
                              disabled={item.currentStock === 0}
                              className="w-full px-4 py-2.5 text-left hover:bg-teal-50 transition-colors border-b border-gray-50 last:border-b-0 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between"
                            >
                              <div>
                                <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                                <p className="text-[11px] text-gray-400">
                                  {item.itemCode}
                                  {item.currentStock <= 5 && item.currentStock > 0 && <span className="ml-1.5 text-amber-600 font-semibold">· Low: {item.currentStock}</span>}
                                  {item.currentStock === 0 && <span className="ml-1.5 text-red-500 font-semibold">· Out of stock</span>}
                                </p>
                              </div>
                              <div className="text-right ml-3 flex-shrink-0">
                                <p className="font-bold text-gray-900 text-sm">₹{item.sellingPrice}</p>
                                <p className="text-[11px] text-gray-400">{item.currentStock} {item.unit}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cart items — grows naturally, no height cap */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Cart{cart.length > 0 ? ` · ${cart.length} item${cart.length !== 1 ? "s" : ""}` : ""}
                  </p>
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                      <svg className="w-8 h-8 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p className="text-sm text-gray-400">Cart is empty</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cart.map((item, index) => (
                        <div key={item._id} className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                            <p className="text-[11px] text-gray-400">₹{item.sellingPrice} / {item.unit}</p>
                          </div>
                          <input
                            type="number"
                            value={item.quantity === 0 ? "" : item.quantity}
                            min={0}
                            max={item.currentStock}
                            onChange={(e) => {
                              const newCart = [...cart];
                              newCart[index].quantity = e.target.value === "" ? 0 : parseInt(e.target.value) || 0;
                              setCart(newCart);
                            }}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              const clamped = Math.min(Math.max(val, 1), item.currentStock);
                              const newCart = [...cart];
                              newCart[index].quantity = clamped;
                              setCart(newCart);
                            }}
                            className="w-14 text-center font-bold text-sm border border-gray-200 rounded-lg py-1.5 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white flex-shrink-0"
                          />
                          <p className="font-bold text-gray-900 text-sm w-16 text-right flex-shrink-0">₹{(item.sellingPrice * item.quantity - item.discount).toLocaleString()}</p>
                          <button type="button" onClick={() => removeFromCart(index)}
                            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment summary */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium text-gray-800">₹{totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Discount %</span>
                    <input
                      type="number"
                      value={saleForm.discountPercentage}
                      onChange={(e) => setSaleForm({ ...saleForm, discountPercentage: parseFloat(e.target.value) || 0 })}
                      min={0} max={100}
                      className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white font-bold"
                    />
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Discount</span>
                      <span className="text-red-500 font-medium">-₹{totals.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
                    <span className="text-gray-800">Total</span>
                    <span className="text-teal-600">₹{totals.total.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {[{ value: "cash", label: "Cash" }, { value: "card", label: "Card" }, { value: "upi", label: "UPI" }].map((m) => (
                      <button key={m.value} type="button"
                        onClick={() => setSaleForm({ ...saleForm, paymentMethod: m.value })}
                        className={`flex-1 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
                          saleForm.paymentMethod === m.value
                            ? "border-teal-500 bg-teal-50 text-teal-700"
                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                        }`}
                      >{m.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="flex-none flex gap-3 px-6 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setShowNewSaleModal(false); resetSaleForm(); }}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || cart.length === 0 || !saleForm.patientName.trim()}
                className="flex-[2] py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-teal-500/20 disabled:shadow-none"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Complete Sale · ₹{totals.total.toFixed(2)}
                  </span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
