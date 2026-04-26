"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { printSaleBill } from "@/lib/printBill";
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
  category: string;
  type: string;
  currentStock: number;
  minStockLevel: number;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  manufacturer?: string;
  status: string;
  expiryDate?: string;
  location?: string;
  description?: string;
  batchNumber?: string;
}

interface Transaction {
  _id: string;
  transactionId: string;
  itemId: any;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  batchNumber?: string;
  performedBy: { name: string; role: string };
  createdAt: string;
  referenceType?: string;
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/clinic/dashboard" },
  { label: "Patients", href: "/clinic/patients" },
  { label: "Consultations", href: "/clinic/consultations" },
  { label: "Pharmacy", href: "/clinic/pharmacy", active: true },
  { label: "Templates", href: "/clinic/templates" },
  { label: "Analytics", href: "/clinic/analytics" },
  { label: "Frontdesk", href: "/clinic/settings/frontdesk" },
];

export default function DoctorPharmacyPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [invPage, setInvPage] = useState(1);
  const [invHasMore, setInvHasMore] = useState(false);
  const invLoaderRef = useRef<HTMLDivElement>(null);
  const invFetchingRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [stats, setStats] = useState<any>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [activeTab, setActiveTab] = useState<"inventory" | "activity" | "purchases" | "purchase-returns" | "sales" | "sales-returns">("inventory");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Item detail drawer
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [detailTransactions, setDetailTransactions] = useState<Transaction[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);


  // Purchases state
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [loadingMorePurchases, setLoadingMorePurchases] = useState(false);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseHasMore, setPurchaseHasMore] = useState(false);
  const purchaseLoaderRef = useRef<HTMLDivElement>(null);
  const purchaseFetchingRef = useRef(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [purchaseFrom, setPurchaseFrom] = useState("");
  const [purchaseTo, setPurchaseTo] = useState("");
  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(false);
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [invSuggestions, setInvSuggestions] = useState<any[]>([]);
  const EMPTY_PURCHASE_ITEM = { itemName: "", hsnCode: "", pack: "", manufacturer: "", batchNo: "", expiryDate: "", quantity: 1, freeQty: 0, mrp: 0, unitPrice: 0, discount: 0, gstRate: 0, total: 0 };
  const [purchaseForm, setPurchaseForm] = useState({
    supplierInvNo: "", gstnNo: "", invoiceDate: "", modeOfPayment: "credit",
    supplierName: "", city: "", grossValue: 0, discount: 0,
    cgst: 0, sgst: 0, igst: 0,
    adding: 0, less: 0, roundingAmount: 0, netAmount: 0,
    items: [{ itemName: "", hsnCode: "", pack: "", manufacturer: "", batchNo: "", expiryDate: "", quantity: 1, freeQty: 0, mrp: 0, unitPrice: 0, discount: 0, gstRate: 0, total: 0 }],
  });

  // Sales state
  const EMPTY_SALE_ITEM = { itemId: "", itemName: "", hsnCode: "", packing: "", manufacturer: "", batchNo: "", expiryDate: "", mrp: 0, qty: 1, discount: 0, gstRate: 0, total: 0 };
  const [sales, setSales] = useState<any[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [loadingMoreSales, setLoadingMoreSales] = useState(false);
  const [salesPage, setSalesPage] = useState(1);
  const [salesHasMore, setSalesHasMore] = useState(false);
  const salesLoaderRef = useRef<HTMLDivElement>(null);
  const salesFetchingRef = useRef(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [salesFrom, setSalesFrom] = useState("");
  const [salesTo, setSalesTo] = useState("");
  const [showAddSaleModal, setShowAddSaleModal] = useState(false);
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [saleForm, setSaleForm] = useState({
    patientName: "", patientPhone: "", doctorName: "", city: "",
    modeOfPayment: "cash", isInterstate: false, roundingAmount: 0,
    items: [{ itemId: "", itemName: "", hsnCode: "", packing: "", manufacturer: "", batchNo: "", expiryDate: "", mrp: 0, qty: 1, discount: 0, gstRate: 0, total: 0 }],
  });

  // Sales Returns state
  const [salesReturns, setSalesReturns] = useState<any[]>([]);
  const [loadingSalesReturns, setLoadingSalesReturns] = useState(false);
  const [loadingMoreSR, setLoadingMoreSR] = useState(false);
  const [srPage, setSrPage] = useState(1);
  const [srHasMore, setSrHasMore] = useState(false);
  const srLoaderRef = useRef<HTMLDivElement>(null);
  const srFetchingRef = useRef(false);
  const [srFrom, setSrFrom] = useState("");
  const [srTo, setSrTo] = useState("");
  const [showAddSrModal, setShowAddSrModal] = useState(false);
  const [srSubmitting, setSrSubmitting] = useState(false);
  const [selectedSalesReturn, setSelectedSalesReturn] = useState<any>(null);
  const EMPTY_SR_ITEM = { itemId: "", itemName: "", quantity: 1, unitPrice: 0, discount: 0, gstRate: 0, total: 0, restock: true };
  const [srForm, setSrForm] = useState({
    invoiceNo: "", invoiceDate: "", modeOfPayment: "cash", partyName: "", city: "",
    isInterstate: false,
    grossValue: 0, discount: 0, roundingAmount: 0, netAmount: 0, reason: "",
    items: [{ itemId: "", itemName: "", quantity: 1, unitPrice: 0, discount: 0, gstRate: 0, total: 0, restock: true }],
  });

  // Purchase Returns state
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [loadingPurchaseReturns, setLoadingPurchaseReturns] = useState(false);
  const [loadingMorePR, setLoadingMorePR] = useState(false);
  const [prPage, setPrPage] = useState(1);
  const [prHasMore, setPrHasMore] = useState(false);
  const prLoaderRef = useRef<HTMLDivElement>(null);
  const prFetchingRef = useRef(false);
  const [selectedPurchaseReturn, setSelectedPurchaseReturn] = useState<any>(null);
  const [prFrom, setPrFrom] = useState("");
  const [prTo, setPrTo] = useState("");
  const [showAddPrModal, setShowAddPrModal] = useState(false);
  const [prSubmitting, setPrSubmitting] = useState(false);
  const [prForm, setPrForm] = useState({
    supplierInvNo: "", gstnNo: "", invoiceDate: "", modeOfPayment: "credit",
    supplierName: "", city: "", grossValue: 0, discount: 0,
    cgst: 0, sgst: 0, igst: 0,
    adding: 0, less: 0, roundingAmount: 0, netAmount: 0, reason: "",
    items: [{ itemName: "", hsnCode: "", pack: "", manufacturer: "", batchNo: "", expiryDate: "", quantity: 1, freeQty: 0, mrp: 0, unitPrice: 0, discount: 0, gstRate: 0, total: 0 }],
  });

  const showToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const validateDateRange = (from: string, to: string, requireDates = false): boolean => {
    if (!from || !to) {
      if (requireDates) { showToast("error", "Please select a date range first"); return false; }
      return true;
    }
    const diffMs = new Date(to).getTime() - new Date(from).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 92) {
      showToast("error", "Date range cannot exceed 3 months");
      return false;
    }
    if (diffDays < 0) {
      showToast("error", "Start date must be before end date");
      return false;
    }
    return true;
  };

  const getToken = () => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return null; }
    return token;
  };

  const fetchInventory = useCallback(async (page = 1) => {
    if (page === 1) setLoading(true); else setLoadingMore(true);
    invFetchingRef.current = true;
    try {
      const token = localStorage.getItem("token");
      if (!token) { router.push("/login"); return; }
      let url = `/api/tier2/inventory?page=${page}&limit=50`;
      if (filter === "low-stock") url += "&lowStock=true";
      else if (filter === "out-of-stock") url += "&status=out-of-stock";
      else if (filter === "expiring") url += "&expiringSoon=true";
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (data.success) {
        setItems(prev => page === 1 ? (data.data.items || []) : [...prev, ...(data.data.items || [])]);
        setStats(data.data.stats);
        setInvPage(page);
        setInvHasMore(data.data.pagination.page < data.data.pagination.pages);
      }
    } catch {
      showToast("error", "Failed to load inventory");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      invFetchingRef.current = false;
    }
  }, [filter, searchQuery, router, showToast]);

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const response = await fetch("/api/tier2/inventory/transactions?limit=30", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) setTransactions(data.data || []);
    } catch {
      // silent
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  const fetchItemDetail = useCallback(async (itemId: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/tier2/inventory/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setDetailItem(data.data.item);
        setDetailTransactions(data.data.transactions || []);
      }
    } catch {
      showToast("error", "Failed to load item details");
    } finally {
      setLoadingDetail(false);
    }
  }, [showToast]);

  const fetchPurchases = useCallback(async (from?: string, to?: string, page = 1) => {
    const token = getToken(); if (!token) return;
    if (page === 1) setLoadingPurchases(true); else setLoadingMorePurchases(true);
    purchaseFetchingRef.current = true;
    try {
      let url = `/api/tier2/purchases?limit=50&page=${page}`;
      if (from) url += `&from=${from}`;
      if (to) url += `&to=${to}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        const items = data.data.purchases || [];
        setPurchases(prev => page === 1 ? items : [...prev, ...items]);
        setPurchasePage(page);
        setPurchaseHasMore(data.data.pagination.page < data.data.pagination.pages);
      }
    } catch { showToast("error", "Failed to load purchases"); }
    finally { setLoadingPurchases(false); setLoadingMorePurchases(false); purchaseFetchingRef.current = false; }
  }, [showToast]);

  const fetchPurchaseReturns = useCallback(async (from?: string, to?: string, page = 1) => {
    const token = getToken(); if (!token) return;
    if (page === 1) setLoadingPurchaseReturns(true); else setLoadingMorePR(true);
    prFetchingRef.current = true;
    try {
      let url = `/api/tier2/purchase-returns?limit=50&page=${page}`;
      if (from) url += `&from=${from}`;
      if (to) url += `&to=${to}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        const items = data.data.returns || [];
        setPurchaseReturns(prev => page === 1 ? items : [...prev, ...items]);
        setPrPage(page);
        setPrHasMore(data.data.pagination.page < data.data.pagination.pages);
      }
    } catch { showToast("error", "Failed to load purchase returns"); }
    finally { setLoadingPurchaseReturns(false); setLoadingMorePR(false); prFetchingRef.current = false; }
  }, [showToast]);

  const fetchSales = useCallback(async (from?: string, to?: string, page = 1) => {
    const token = getToken(); if (!token) return;
    if (page === 1) setLoadingSales(true); else setLoadingMoreSales(true);
    salesFetchingRef.current = true;
    try {
      let url = `/api/tier2/sales?limit=50&page=${page}`;
      if (from) url += `&startDate=${from}`;
      if (to) url += `&endDate=${to}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        const items = data.data.sales || [];
        setSales(prev => page === 1 ? items : [...prev, ...items]);
        setSalesPage(page);
        setSalesHasMore(data.data.pagination.page < data.data.pagination.pages);
      }
    } catch { showToast("error", "Failed to load sales"); }
    finally { setLoadingSales(false); setLoadingMoreSales(false); salesFetchingRef.current = false; }
  }, [showToast]);

  const fetchSalesReturns = useCallback(async (from?: string, to?: string, page = 1) => {
    const token = getToken(); if (!token) return;
    if (page === 1) setLoadingSalesReturns(true); else setLoadingMoreSR(true);
    srFetchingRef.current = true;
    try {
      let url = `/api/tier2/sales-returns?limit=50&page=${page}`;
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
    finally { setLoadingSalesReturns(false); setLoadingMoreSR(false); srFetchingRef.current = false; }
  }, [showToast]);

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
    const token = getToken(); if (!token) return;
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
        setSrForm({ invoiceNo: "", invoiceDate: "", modeOfPayment: "cash", partyName: "", city: "", isInterstate: false, grossValue: 0, discount: 0, roundingAmount: 0, netAmount: 0, reason: "", items: [{ ...EMPTY_SR_ITEM }] });
        fetchSalesReturns(srFrom, srTo);
      } else { showToast("error", data.message || "Failed"); }
    } catch (err: any) { showToast("error", err?.message || "Failed to save"); }
    finally { setSrSubmitting(false); }
  };

  const calcTotalGst = (cgst: number, sgst: number, igst: number) =>
    +((cgst || 0) + (sgst || 0) + (igst || 0)).toFixed(2);

  const fetchInvSuggestions = useCallback(async () => {
    const token = getToken(); if (!token) return;
    try {
      const res = await fetch("/api/tier2/inventory?limit=500", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setInvSuggestions(data.data?.items || []);
    } catch {}
  }, []);

  const downloadReport = async (url: string, filename: string) => {
    const token = getToken(); if (!token) return;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { showToast("error", "Failed to download report"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { showToast("error", "Download failed"); }
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken(); if (!token) return;
    setPurchaseSubmitting(true);
    try {
      const totalGst = calcTotalGst(purchaseForm.cgst, purchaseForm.sgst, purchaseForm.igst);
      const body = { ...purchaseForm, totalGst };
      const res = await fetch("/api/tier2/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Purchase recorded");
        setShowAddPurchaseModal(false);
        setPurchaseForm({ supplierInvNo: "", gstnNo: "", invoiceDate: "", modeOfPayment: "credit", supplierName: "", city: "", grossValue: 0, discount: 0, cgst: 0, sgst: 0, igst: 0, adding: 0, less: 0, roundingAmount: 0, netAmount: 0, items: [{ ...EMPTY_PURCHASE_ITEM }] });
        fetchPurchases(purchaseFrom, purchaseTo);
      } else { showToast("error", data.message || "Failed to save"); }
    } catch { showToast("error", "Failed to save purchase"); }
    finally { setPurchaseSubmitting(false); }
  };

  const handleAddPr = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken(); if (!token) return;
    setPrSubmitting(true);
    try {
      const totalGst = calcTotalGst(prForm.cgst, prForm.sgst, prForm.igst);
      const body = { ...prForm, totalGst };
      const res = await fetch("/api/tier2/purchase-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Purchase return recorded");
        setShowAddPrModal(false);
        setPrForm({ supplierInvNo: "", gstnNo: "", invoiceDate: "", modeOfPayment: "credit", supplierName: "", city: "", grossValue: 0, discount: 0, cgst: 0, sgst: 0, igst: 0, adding: 0, less: 0, roundingAmount: 0, netAmount: 0, reason: "", items: [{ ...EMPTY_PURCHASE_ITEM }] });
        fetchPurchaseReturns(prFrom, prTo);
      } else { showToast("error", data.message || "Failed to save"); }
    } catch { showToast("error", "Failed to save purchase return"); }
    finally { setPrSubmitting(false); }
  };

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken(); if (!token) return;
    setSaleSubmitting(true);
    try {
      const res = await fetch("/api/tier2/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(saleForm),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Sale recorded");
        setShowAddSaleModal(false);
        setLastSale(data.data);
        setSaleForm({ patientName: "", patientPhone: "", doctorName: "", city: "", modeOfPayment: "cash", isInterstate: false, roundingAmount: 0, items: [{ ...EMPTY_SALE_ITEM }] });
        fetchSales(salesFrom, salesTo);
        fetchInventory();
      } else { showToast("error", data.message || "Failed to save"); }
    } catch { showToast("error", "Failed to save sale"); }
    finally { setSaleSubmitting(false); }
  };

  useEffect(() => {
    const el = invLoaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && invHasMore && !invFetchingRef.current) {
          fetchInventory(invPage + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [invHasMore, invPage, fetchInventory]);

  useEffect(() => {
    const el = purchaseLoaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && purchaseHasMore && !purchaseFetchingRef.current) {
          fetchPurchases(purchaseFrom, purchaseTo, purchasePage + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [purchaseHasMore, purchasePage, fetchPurchases, purchaseFrom, purchaseTo]);

  useEffect(() => {
    const el = prLoaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && prHasMore && !prFetchingRef.current) {
          fetchPurchaseReturns(prFrom, prTo, prPage + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [prHasMore, prPage, fetchPurchaseReturns, prFrom, prTo]);

  useEffect(() => {
    const el = salesLoaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && salesHasMore && !salesFetchingRef.current) {
          fetchSales(salesFrom, salesTo, salesPage + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [salesHasMore, salesPage, fetchSales, salesFrom, salesTo]);

  useEffect(() => {
    const el = srLoaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && srHasMore && !srFetchingRef.current) {
          fetchSalesReturns(srFrom, srTo, srPage + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [srHasMore, srPage, fetchSalesReturns, srFrom, srTo]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    fetchInventory();
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(() => fetchInventory(), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (activeTab === "inventory") fetchInventory();
    if (activeTab === "activity") fetchTransactions();
    if (activeTab === "purchases") fetchPurchases();
    if (activeTab === "purchase-returns") fetchPurchaseReturns();
    if (activeTab === "sales") fetchSales();
    if (activeTab === "sales-returns") fetchSalesReturns();
  }, [activeTab, fetchInventory, fetchTransactions, fetchPurchases, fetchPurchaseReturns, fetchSales, fetchSalesReturns]);

  useEffect(() => {
    if (showAddPurchaseModal || showAddPrModal || showAddSaleModal || showAddSrModal) fetchInvSuggestions();
  }, [showAddPurchaseModal, showAddPrModal, showAddSaleModal, showAddSrModal, fetchInvSuggestions]);

  const openItemDetail = (item: InventoryItem) => {
    setDetailItem(item);
    setShowDetailDrawer(true);
    fetchItemDetail(item._id);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "medicine": return "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z";
      case "cream": case "lotion": return "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z";
      case "supplement": return "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z";
      case "equipment": return "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z";
      default: return "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "medicine": return "from-blue-400 to-blue-500";
      case "cream": return "from-pink-400 to-rose-500";
      case "lotion": return "from-purple-400 to-violet-500";
      case "supplement": return "from-emerald-400 to-green-500";
      case "equipment": return "from-amber-400 to-orange-500";
      case "consumable": return "from-cyan-400 to-teal-500";
      default: return "from-gray-400 to-gray-500";
    }
  };

  const getStockStatus = (item: InventoryItem) => {
    if (item.status === "discontinued") return { label: "Discontinued", color: "text-gray-600 bg-gray-50 border-gray-200 ring-gray-100", dot: "bg-gray-500" };
    if (item.currentStock === 0) return { label: "Out of Stock", color: "text-red-600 bg-red-50 border-red-200 ring-red-100", dot: "bg-red-500" };
    if (item.currentStock <= item.minStockLevel) return { label: "Low Stock", color: "text-amber-600 bg-amber-50 border-amber-200 ring-amber-100", dot: "bg-amber-500" };
    return { label: "In Stock", color: "text-emerald-600 bg-emerald-50 border-emerald-200 ring-emerald-100", dot: "bg-emerald-500" };
  };

  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
    if (daysLeft < 0) return { label: "Expired", color: "text-red-600" };
    if (daysLeft <= 90) return { label: `${daysLeft}d left`, color: "text-amber-600" };
    return null;
  };

  const getTransactionStyle = (type: string) => {
    switch (type) {
      case "stock-in": return { label: "Stock In", color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: "M12 6v6m0 0v6m0-6h6m-6 0H6", sign: "+" };
      case "stock-out": return { label: "Stock Out", color: "text-red-700 bg-red-50 border-red-200", icon: "M20 12H4", sign: "-" };
      case "adjustment": return { label: "Adjustment", color: "text-amber-700 bg-amber-50 border-amber-200", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15", sign: "" };
      case "return": return { label: "Return", color: "text-blue-700 bg-blue-50 border-blue-200", icon: "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6", sign: "+" };
      case "expired": return { label: "Expired", color: "text-gray-700 bg-gray-50 border-gray-200", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", sign: "-" };
      case "damaged": return { label: "Damaged", color: "text-rose-700 bg-rose-50 border-rose-200", icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636", sign: "-" };
      case "new-item": return { label: "New Item", color: "text-teal-700 bg-teal-50 border-teal-200", icon: "M12 6v6m0 0v6m0-6h6m-6 0H6", sign: "+" };
      default: return { label: type, color: "text-gray-700 bg-gray-50 border-gray-200", icon: "", sign: "" };
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (min < 1) return "Just now";
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const profitMargin = (item: InventoryItem) => {
    if (item.costPrice === 0) return 0;
    return Math.round(((item.sellingPrice - item.costPrice) / item.costPrice) * 100);
  };

  const filterCounts = {
    all: stats?.totalItems || 0,
    "low-stock": stats?.lowStockCount || 0,
    "out-of-stock": stats?.outOfStockCount || 0,
    expiring: stats?.expiringCount || 0,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notifications */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px] max-w-[420px] border ${
              toast.type === "success" ? "bg-white text-emerald-700 border-emerald-200" :
              toast.type === "error" ? "bg-white text-red-700 border-red-200" :
              "bg-white text-sky-700 border-sky-200"
            }`}
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
            <span className="font-medium text-sm flex-1">{toast.message}</span>
            <button onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))} className="p-1 hover:bg-gray-100 rounded-lg">
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
              <Link
                href="/clinic/dashboard"
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-teal-600 transition-colors"
                title="Back to Dashboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Pharmacy</h1>
                <p className="text-base text-gray-500 hidden sm:block">Manage inventory and stock levels</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {NAV_ITEMS.map((item) => (
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total Items", value: stats.totalItems, color: "teal", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", valueClass: "text-gray-900" },
              { label: "Stock Value", value: `₹${stats.totalValue?.toLocaleString()}`, color: "emerald", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", valueClass: "text-emerald-600" },
              { label: "Low Stock", value: stats.lowStockCount, color: "amber", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", valueClass: "text-amber-600" },
              { label: "Out of Stock", value: stats.outOfStockCount, color: "red", icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636", valueClass: "text-red-600" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 bg-gradient-to-br from-${s.color}-50 to-${s.color}-100 rounded-xl flex items-center justify-center border border-${s.color}-100`}>
                    <svg className={`w-5 h-5 text-${s.color}-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{s.label}</p>
                    <p className={`text-xl font-bold ${s.valueClass}`}>{s.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
          {([
            { key: "inventory", label: "Inventory" },
            { key: "sales", label: "Sales" },
            { key: "sales-returns", label: "Sales Returns" },
            { key: "purchases", label: "Purchases" },
            { key: "purchase-returns", label: "Purchase Returns" },
            { key: "activity", label: "Activity Log" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "inventory" ? (
          <>
            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, code, or generic name..."
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm text-gray-900 bg-white"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                    <svg className="w-4 h-4 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {([
                  { key: "all", label: "All" },
                  { key: "low-stock", label: "Low Stock" },
                  { key: "out-of-stock", label: "Out of Stock" },
                  { key: "expiring", label: "Expiring" },
                ] as const).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                      filter === f.key
                        ? "bg-teal-500 text-white shadow-md shadow-teal-500/20"
                        : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    }`}
                  >
                    {f.label}
                    {filter !== f.key && stats && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] bg-gray-100 text-gray-600">
                        {filterCounts[f.key] ?? 0}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Items List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {loading ? (
                <div className="divide-y divide-gray-50">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="px-5 py-4 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
                      <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gray-200 flex-shrink-0"></div>
                          <div className="space-y-2 flex-1">
                            <div className="h-4 bg-gray-200 rounded w-36"></div>
                            <div className="h-3 bg-gray-100 rounded w-20"></div>
                          </div>
                        </div>
                        <div className="col-span-2"><div className="h-6 bg-gray-100 rounded-lg w-20"></div></div>
                        <div className="col-span-2"><div className="h-4 bg-gray-100 rounded-lg w-16"></div></div>
                        <div className="col-span-2"><div className="h-4 bg-gray-100 rounded-lg w-14"></div></div>
                        <div className="col-span-2"><div className="h-6 bg-gray-100 rounded-lg w-20"></div></div>
                      </div>
                      <div className="md:hidden flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-200 flex-shrink-0"></div>
                        <div className="space-y-2 flex-1">
                          <div className="h-4 bg-gray-200 rounded w-32"></div>
                          <div className="h-3 bg-gray-100 rounded w-44"></div>
                        </div>
                        <div className="h-8 w-20 bg-gray-100 rounded-lg"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length > 0 ? (
                <>
                  <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <div className="col-span-4">Item</div>
                    <div className="col-span-2">Category</div>
                    <div className="col-span-2">Stock</div>
                    <div className="col-span-2">Price</div>
                    <div className="col-span-2">Status</div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map((item) => {
                      const stockStatus = getStockStatus(item);
                      const expiryStatus = getExpiryStatus(item.expiryDate);
                      return (
                        <div
                          key={item._id}
                          className="group px-5 py-4 hover:bg-gray-50/50 transition-all cursor-pointer"
                          onClick={() => openItemDetail(item)}
                        >
                          {/* Desktop */}
                          <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-4 flex items-center gap-3">
                              <div className={`w-10 h-10 bg-gradient-to-br ${getCategoryColor(item.category)} rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm`}>
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={getCategoryIcon(item.category)} />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{item.itemCode}{item.genericName ? ` · ${item.genericName}` : ""}</p>
                              </div>
                            </div>
                            <div className="col-span-2">
                              <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 capitalize">{item.category}</span>
                            </div>
                            <div className="col-span-2">
                              <p className={`font-bold text-sm ${item.currentStock === 0 ? "text-red-600" : item.currentStock <= item.minStockLevel ? "text-amber-600" : "text-gray-900"}`}>
                                {item.currentStock} <span className="text-xs font-normal text-gray-400">{item.unit}</span>
                              </p>
                              <p className="text-xs text-gray-400">Min: {item.minStockLevel}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="font-semibold text-gray-900 text-sm">₹{item.sellingPrice}</p>
                              {expiryStatus && <p className={`text-xs font-medium ${expiryStatus.color}`}>{expiryStatus.label}</p>}
                            </div>
                            <div className="col-span-2 flex items-center">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border ring-1 ${stockStatus.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${stockStatus.dot}`}></span>
                                {stockStatus.label}
                              </span>
                            </div>
                          </div>

                          {/* Mobile */}
                          <div className="md:hidden flex items-center gap-3">
                            <div className={`w-10 h-10 bg-gradient-to-br ${getCategoryColor(item.category)} rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm`}>
                              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={getCategoryIcon(item.category)} />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                              <p className="text-xs text-gray-400">{item.currentStock} {item.unit} · ₹{item.sellingPrice}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border ring-1 ${stockStatus.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${stockStatus.dot}`}></span>
                                {item.currentStock}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div ref={invLoaderRef} className="py-2">
                    {loadingMore && (
                      <div className="flex justify-center py-4">
                        <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
                    <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <p className="text-gray-700 font-semibold text-lg">
                    {searchQuery ? "No items found" : filter !== "all" ? `No ${filter.replace("-", " ")} items` : "No items in inventory"}
                  </p>
                  <p className="text-gray-400 text-sm mt-1">
                    {searchQuery ? `No results for "${searchQuery}"` : filter !== "all" ? "Try a different filter" : "Items are added automatically when you record a purchase"}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : activeTab === "purchases" ? (
          /* ── Purchases Tab ── */
          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <input type="date" value={purchaseFrom} onChange={(e) => setPurchaseFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={purchaseTo} onChange={(e) => setPurchaseTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <button onClick={() => validateDateRange(purchaseFrom, purchaseTo) && fetchPurchases(purchaseFrom, purchaseTo)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Filter</button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (!validateDateRange(purchaseFrom, purchaseTo, true)) return; const qs = `?from=${purchaseFrom}&to=${purchaseTo}`; downloadReport(`/api/tier2/purchases/report${qs}`, `PurchaseRegister.xlsx`); }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download Excel
                </button>
                <button onClick={() => setShowAddPurchaseModal(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add Purchase
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {loadingPurchases ? (
                <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
              ) : purchases.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-gray-100">
                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <p className="text-gray-500 font-medium">No purchases recorded yet</p>
                  <p className="text-sm text-gray-400 mt-1">Click &quot;Add Purchase&quot; to log a purchase bill</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["Sup. Inv. No", "Date", "Supplier", "City", "Mode", "Gross Value", "Discount", "Total GST", "Net Amount"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {purchases.map((p: any) => (
                        <tr key={p._id} className="hover:bg-teal-50/60 transition-colors cursor-pointer" onClick={() => setSelectedPurchase(p)}>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.supplierInvNo}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(p.invoiceDate).toLocaleDateString("en-IN")}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{p.supplierName}</td>
                          <td className="px-4 py-3 text-gray-500">{p.city || "—"}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium uppercase">{p.modeOfPayment}</span></td>
                          <td className="px-4 py-3 text-gray-700">₹{(p.grossValue || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-red-600">₹{(p.discount || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-blue-600">₹{(p.totalGst || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">₹{(p.netAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700">Totals</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">₹{purchases.reduce((s: number, p: any) => s + (p.grossValue || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-red-600">₹{purchases.reduce((s: number, p: any) => s + (p.discount || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-blue-600">₹{purchases.reduce((s: number, p: any) => s + (p.totalGst || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">₹{purchases.reduce((s: number, p: any) => s + (p.netAmount || 0), 0).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <div ref={purchaseLoaderRef} className="py-1">
                {loadingMorePurchases && (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === "purchase-returns" ? (
          /* ── Purchase Returns Tab ── */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <input type="date" value={prFrom} onChange={(e) => setPrFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={prTo} onChange={(e) => setPrTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <button onClick={() => validateDateRange(prFrom, prTo) && fetchPurchaseReturns(prFrom, prTo)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Filter</button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (!validateDateRange(prFrom, prTo, true)) return; const qs = `?from=${prFrom}&to=${prTo}`; downloadReport(`/api/tier2/purchase-returns/report${qs}`, `PurchaseReturnRegister.xlsx`); }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download Excel
                </button>
                <button onClick={() => setShowAddPrModal(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add Return
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {loadingPurchaseReturns ? (
                <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
              ) : purchaseReturns.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-gray-100">
                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                  </div>
                  <p className="text-gray-500 font-medium">No purchase returns yet</p>
                  <p className="text-sm text-gray-400 mt-1">Click &quot;Add Return&quot; to log a purchase return</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["Sup. Inv. No", "Date", "Supplier", "City", "Mode", "Gross Value", "Discount", "Total GST", "Net Amount", "Reason"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {purchaseReturns.map((p: any) => (
                        <tr key={p._id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelectedPurchaseReturn(p)}>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.supplierInvNo}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(p.invoiceDate).toLocaleDateString("en-IN")}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{p.supplierName}</td>
                          <td className="px-4 py-3 text-gray-500">{p.city || "—"}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium uppercase">{p.modeOfPayment}</span></td>
                          <td className="px-4 py-3 text-gray-700">₹{(p.grossValue || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-red-600">₹{(p.discount || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-blue-600">₹{(p.totalGst || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">₹{(p.netAmount || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{p.reason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700">Totals</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">₹{purchaseReturns.reduce((s: number, p: any) => s + (p.grossValue || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-red-600">₹{purchaseReturns.reduce((s: number, p: any) => s + (p.discount || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-blue-600">₹{purchaseReturns.reduce((s: number, p: any) => s + (p.totalGst || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">₹{purchaseReturns.reduce((s: number, p: any) => s + (p.netAmount || 0), 0).toFixed(2)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <div ref={prLoaderRef} className="py-1">
                {loadingMorePR && (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === "sales" ? (
          /* ── Sales Tab ── */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <input type="date" value={salesFrom} onChange={(e) => setSalesFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={salesTo} onChange={(e) => setSalesTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <button onClick={() => validateDateRange(salesFrom, salesTo) && fetchSales(salesFrom, salesTo)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Filter</button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (!validateDateRange(salesFrom, salesTo, true)) return; const qs = `?from=${salesFrom}&to=${salesTo}`; downloadReport(`/api/tier2/sales/report${qs}`, `SalesRegister.xlsx`); }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download Excel
                </button>
                <button onClick={() => setShowAddSaleModal(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  New Sale
                </button>
              </div>
            </div>
            {lastSale && (
              <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between">
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {loadingSales ? (
                <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
              ) : sales.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-gray-100">
                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                  <p className="text-gray-500 font-medium">No sales recorded yet</p>
                  <p className="text-sm text-gray-400 mt-1">Click &quot;New Sale&quot; to record a sale</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["Invoice No", "Date", "Party Name", "City", "Mode", "Items", "GST", "Net Amount"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sales.map((s: any) => (
                        <tr key={s._id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelectedSale(s)}>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{s.invoiceNumber || s.saleId || "—"}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString("en-IN")}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{s.patientName}</td>
                          <td className="px-4 py-3 text-gray-500">{s.city || "—"}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium uppercase">{s.paymentMethod}</span></td>
                          <td className="px-4 py-3 text-gray-500">{s.items?.length || 0} item{s.items?.length !== 1 ? "s" : ""}</td>
                          <td className="px-4 py-3 text-blue-600">₹{(s.totalGst || s.taxAmount || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">₹{(s.totalAmount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-gray-700">Totals</td>
                        <td className="px-4 py-3 font-semibold text-blue-600">₹{sales.reduce((s: number, x: any) => s + (x.totalGst || x.taxAmount || 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">₹{sales.reduce((s: number, x: any) => s + (x.totalAmount || 0), 0).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <div ref={salesLoaderRef} className="py-1">
                {loadingMoreSales && (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === "sales-returns" ? (
          /* ── Sales Returns Tab ── */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <input type="date" value={srFrom} onChange={(e) => setSrFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={srTo} onChange={(e) => setSrTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                <button onClick={() => validateDateRange(srFrom, srTo) && fetchSalesReturns(srFrom, srTo)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Filter</button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (!validateDateRange(srFrom, srTo, true)) return; const qs = `?from=${srFrom}&to=${srTo}`; downloadReport(`/api/tier2/sales-returns/report${qs}`, `SalesReturnRegister.xlsx`); }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download Excel
                </button>
                <button onClick={() => setShowAddSrModal(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add Return
                </button>
              </div>
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
                </div>
              )}
              <div ref={srLoaderRef} className="py-1">
                {loadingMoreSR && (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Activity Log */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Recent Activity</h3>
                <p className="text-sm text-gray-500">Stock movements and adjustments</p>
              </div>
              <button onClick={() => fetchTransactions()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600" title="Refresh">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            {loadingTransactions ? (
              <div className="divide-y divide-gray-50">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="px-5 py-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gray-100"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-48"></div>
                        <div className="h-3 bg-gray-100 rounded w-32"></div>
                      </div>
                      <div className="h-5 bg-gray-100 rounded w-16"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : transactions.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {transactions.map((txn) => {
                  const style = getTransactionStyle(txn.type);
                  return (
                    <div key={txn._id} className="px-5 py-3.5 hover:bg-gray-50/50 transition-all">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${style.color}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={style.icon} />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900 text-sm truncate">{txn.itemId?.name || "Unknown Item"}</p>
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${style.color}`}>{style.label}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{txn.reason} · by {txn.performedBy?.name || "Unknown"} · {formatTimeAgo(txn.createdAt)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`font-bold text-sm ${txn.type === "stock-in" || txn.type === "return" || txn.type === "new-item" ? "text-emerald-600" : "text-red-600"}`}>
                            {style.sign}{txn.quantity} {txn.itemId?.unit || "units"}
                          </p>
                          <p className="text-xs text-gray-400">{txn.previousStock} → {txn.newStock}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-gray-100">
                  <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">No activity yet</p>
                <p className="text-sm text-gray-400 mt-1">Stock movements will appear here</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Item Detail Drawer */}
      {showDetailDrawer && detailItem && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowDetailDrawer(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 bg-gradient-to-br ${getCategoryColor(detailItem.category)} rounded-xl flex items-center justify-center shadow-sm`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={getCategoryIcon(detailItem.category)} />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{detailItem.name}</h2>
                    <p className="text-xs text-gray-400 font-mono">{detailItem.itemCode}</p>
                  </div>
                </div>
                <button onClick={() => setShowDetailDrawer(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {loadingDetail ? (
              <div className="p-6 space-y-4 animate-pulse">
                {[1, 2, 3].map((i) => <div key={i} className="space-y-2"><div className="h-3 bg-gray-100 rounded w-20"></div><div className="h-5 bg-gray-200 rounded w-40"></div></div>)}
              </div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 font-medium">Current Stock</p>
                    <p className={`text-xl font-bold mt-1 ${detailItem.currentStock === 0 ? "text-red-600" : detailItem.currentStock <= detailItem.minStockLevel ? "text-amber-600" : "text-gray-900"}`}>
                      {detailItem.currentStock}
                    </p>
                    <p className="text-xs text-gray-400">{detailItem.unit}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 font-medium">Min Level</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{detailItem.minStockLevel}</p>
                    <p className="text-xs text-gray-400">{detailItem.unit}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 font-medium">Margin</p>
                    <p className={`text-xl font-bold mt-1 ${profitMargin(detailItem) > 0 ? "text-emerald-600" : "text-gray-900"}`}>
                      {profitMargin(detailItem)}%
                    </p>
                    <p className="text-xs text-gray-400">profit</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {detailItem.genericName && <div><p className="text-xs text-gray-400">Generic Name</p><p className="text-sm font-medium text-gray-900">{detailItem.genericName}</p></div>}
                    <div><p className="text-xs text-gray-400">Category</p><p className="text-sm font-medium text-gray-900 capitalize">{detailItem.category}</p></div>
                    <div><p className="text-xs text-gray-400">Type</p><p className="text-sm font-medium text-gray-900">{detailItem.type === "otc" ? "OTC" : "Prescription"}</p></div>
                    <div><p className="text-xs text-gray-400">Cost Price</p><p className="text-sm font-medium text-gray-900">₹{detailItem.costPrice}</p></div>
                    <div><p className="text-xs text-gray-400">Selling Price</p><p className="text-sm font-medium text-gray-900">₹{detailItem.sellingPrice}</p></div>
                    {detailItem.manufacturer && <div><p className="text-xs text-gray-400">Manufacturer</p><p className="text-sm font-medium text-gray-900">{detailItem.manufacturer}</p></div>}
                    {detailItem.batchNumber && <div><p className="text-xs text-gray-400">Batch Number</p><p className="text-sm font-medium text-gray-900 font-mono">{detailItem.batchNumber}</p></div>}
                    {detailItem.expiryDate && (
                      <div>
                        <p className="text-xs text-gray-400">Expiry Date</p>
                        <p className={`text-sm font-medium ${getExpiryStatus(detailItem.expiryDate)?.color || "text-gray-900"}`}>
                          {new Date(detailItem.expiryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    )}
                    {detailItem.location && <div><p className="text-xs text-gray-400">Location</p><p className="text-sm font-medium text-gray-900">{detailItem.location}</p></div>}
                  </div>
                  {detailItem.description && <div><p className="text-xs text-gray-400">Description</p><p className="text-sm text-gray-700 mt-0.5">{detailItem.description}</p></div>}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Stock History</h4>
                  {detailTransactions.length > 0 ? (
                    <div className="space-y-2">
                      {detailTransactions.map((txn) => {
                        const style = getTransactionStyle(txn.type);
                        return (
                          <div key={txn._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${style.color}`}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={style.icon} />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold ${txn.type === "stock-in" || txn.type === "return" || txn.type === "new-item" ? "text-emerald-600" : "text-red-600"}`}>
                                  {style.sign}{txn.quantity}
                                </span>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs text-gray-500">{txn.previousStock} → {txn.newStock}</span>
                              </div>
                              <p className="text-xs text-gray-400 truncate">{txn.reason}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs text-gray-400">{formatTimeAgo(txn.createdAt)}</p>
                              <p className="text-[10px] text-gray-300">{txn.performedBy?.name}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-center bg-gray-50 rounded-xl">
                      <p className="text-sm text-gray-400">No stock history yet</p>
                    </div>
                  )}
                </div>

                {/* Purchases Summary */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Purchase History</h4>
                  {(() => {
                    const purchaseTxns = detailTransactions.filter(t => t.referenceType === "purchase");
                    if (purchaseTxns.length === 0) return <div className="p-4 text-center bg-gray-50 rounded-xl"><p className="text-sm text-gray-400">No purchases recorded</p></div>;
                    const totalPurchased = purchaseTxns.reduce((s, t) => s + t.quantity, 0);
                    return (
                      <div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-emerald-50 rounded-xl p-3 text-center">
                            <p className="text-xs text-gray-500 font-medium">Total Purchased</p>
                            <p className="text-xl font-bold text-emerald-700 mt-1">{totalPurchased}</p>
                            <p className="text-xs text-gray-400">{detailItem.unit}</p>
                          </div>
                          <div className="bg-emerald-50 rounded-xl p-3 text-center">
                            <p className="text-xs text-gray-500 font-medium">No. of Orders</p>
                            <p className="text-xl font-bold text-emerald-700 mt-1">{purchaseTxns.length}</p>
                            <p className="text-xs text-gray-400">purchases</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {purchaseTxns.slice(0, 5).map((txn) => (
                            <div key={txn._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                              <div>
                                <p className="font-medium text-gray-900 text-xs">+{txn.quantity} {detailItem.unit}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5 truncate">{txn.reason}</p>
                              </div>
                              <p className="text-xs text-gray-400 flex-shrink-0">{formatTimeAgo(txn.createdAt)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Sales Summary */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Sales Summary</h4>
                  {(() => {
                    const saleTxns = detailTransactions.filter(t => t.referenceType === "sale");
                    if (saleTxns.length === 0) return <div className="p-4 text-center bg-gray-50 rounded-xl"><p className="text-sm text-gray-400">No sales recorded</p></div>;
                    const totalSold = saleTxns.reduce((s, t) => s + t.quantity, 0);
                    return (
                      <div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-blue-50 rounded-xl p-3 text-center">
                            <p className="text-xs text-gray-500 font-medium">Total Sold</p>
                            <p className="text-xl font-bold text-blue-700 mt-1">{totalSold}</p>
                            <p className="text-xs text-gray-400">{detailItem.unit}</p>
                          </div>
                          <div className="bg-blue-50 rounded-xl p-3 text-center">
                            <p className="text-xs text-gray-500 font-medium">No. of Sales</p>
                            <p className="text-xl font-bold text-blue-700 mt-1">{saleTxns.length}</p>
                            <p className="text-xs text-gray-400">transactions</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {saleTxns.slice(0, 5).map((txn) => (
                            <div key={txn._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                              <div>
                                <p className="font-medium text-gray-900 text-xs">−{txn.quantity} {detailItem.unit}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5 truncate">{txn.reason}</p>
                              </div>
                              <p className="text-xs text-gray-400 flex-shrink-0">{formatTimeAgo(txn.createdAt)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Purchase Detail Modal */}
      {selectedPurchase && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setSelectedPurchase(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl sm:rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Purchase Details</h2>
                <p className="text-xs text-gray-400 mt-0.5">Inv. {selectedPurchase.supplierInvNo}</p>
              </div>
              <button onClick={() => setSelectedPurchase(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors text-lg font-bold">×</button>
            </div>
            <div className="p-6 space-y-5">
              {/* Supplier Info */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Supplier", value: selectedPurchase.supplierName },
                  { label: "Inv. No", value: selectedPurchase.supplierInvNo },
                  { label: "Date", value: new Date(selectedPurchase.invoiceDate).toLocaleDateString("en-IN") },
                  { label: "Mode", value: selectedPurchase.modeOfPayment?.toUpperCase() || "—" },
                  { label: "GSTN", value: selectedPurchase.gstnNo || "—" },
                  { label: "City", value: selectedPurchase.city || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-sm font-medium text-gray-800">{value}</p>
                  </div>
                ))}
              </div>

              {/* Items */}
              {selectedPurchase.items && selectedPurchase.items.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Items</h3>
                  <div className="space-y-2">
                    {selectedPurchase.items.map((item: any, i: number) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-3 bg-white">
                        <p className="text-sm font-semibold text-gray-900 mb-2">{item.itemName || "—"}</p>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                          {[
                            { label: "HSN", value: item.hsnCode || "—" },
                            { label: "Pack", value: item.pack || "—" },
                            { label: "Batch", value: item.batchNo || "—" },
                            { label: "Expiry", value: item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("en-IN") : "—" },
                            { label: "Qty", value: item.quantity ?? "—" },
                            { label: "Free", value: item.freeQty ?? 0 },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                              <p className="text-xs text-gray-700">{value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center mt-2 pt-2 border-t border-gray-50">
                          {[
                            { label: "MRP ₹", value: `₹${(item.mrp || 0).toFixed(2)}` },
                            { label: "Rate ₹", value: `₹${(item.unitPrice || 0).toFixed(2)}` },
                            { label: "GST %", value: `${item.gstRate ?? 0}%` },
                            { label: "Total ₹", value: `₹${(item.total || 0).toFixed(2)}`, highlight: true },
                          ].map(({ label, value, highlight }) => (
                            <div key={label} className={highlight ? "bg-teal-50 rounded-lg p-1" : ""}>
                              <p className={`text-[9px] font-semibold uppercase tracking-wider ${highlight ? "text-teal-500" : "text-gray-400"}`}>{label}</p>
                              <p className={`text-xs font-semibold ${highlight ? "text-teal-700" : "text-gray-700"}`}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Financial Summary */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Financial Summary</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  {[
                    { label: "Gross Value", value: `₹${(selectedPurchase.grossValue || 0).toFixed(2)}` },
                    { label: "Discount", value: `−₹${(selectedPurchase.discount || 0).toFixed(2)}`, red: true },
                    { label: "CGST", value: `₹${(selectedPurchase.cgst || 0).toFixed(2)}` },
                    { label: "SGST", value: `₹${(selectedPurchase.sgst || 0).toFixed(2)}` },
                    { label: "IGST", value: `₹${(selectedPurchase.igst || 0).toFixed(2)}` },
                    { label: "Total GST", value: `₹${(selectedPurchase.totalGst || 0).toFixed(2)}` },
                    ...(selectedPurchase.adding ? [{ label: "Adding", value: `₹${selectedPurchase.adding.toFixed(2)}` }] : []),
                    ...(selectedPurchase.less ? [{ label: "Less", value: `−₹${selectedPurchase.less.toFixed(2)}`, red: true }] : []),
                    ...(selectedPurchase.roundingAmount ? [{ label: "Rounding", value: `₹${selectedPurchase.roundingAmount.toFixed(2)}` }] : []),
                  ].map(({ label, value, red }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className={red ? "text-red-600 font-medium" : "text-gray-700 font-medium"}>{value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
                    <span className="text-gray-900">Net Amount</span>
                    <span className="text-teal-700">₹{(selectedPurchase.netAmount || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Purchase Modal */}
      {showAddPurchaseModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl sm:rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-gray-900">New Purchase Bill</h3>
                <p className="text-xs text-gray-400 mt-0.5">Record a supplier invoice</p>
              </div>
              <button onClick={() => setShowAddPurchaseModal(false)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAddPurchase} className="p-6 space-y-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Supplier &amp; Bill</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Supplier Name <span className="text-red-400">*</span></label>
                    <input required value={purchaseForm.supplierName} onChange={(e) => setPurchaseForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="e.g. Cipla Ltd" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">City</label>
                    <input value={purchaseForm.city} onChange={(e) => setPurchaseForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Mumbai" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Supplier Inv. No <span className="text-red-400">*</span></label>
                    <input required value={purchaseForm.supplierInvNo} onChange={(e) => setPurchaseForm(f => ({ ...f, supplierInvNo: e.target.value }))} placeholder="e.g. INV-2024-001" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">GSTN No</label>
                    <input value={purchaseForm.gstnNo} onChange={(e) => setPurchaseForm(f => ({ ...f, gstnNo: e.target.value }))} placeholder="e.g. 29AAAAA0000A1Z5" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Invoice Date <span className="text-red-400">*</span></label>
                    <input required type="date" value={purchaseForm.invoiceDate} onChange={(e) => setPurchaseForm(f => ({ ...f, invoiceDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payment Mode <span className="text-red-400">*</span></label>
                    <select value={purchaseForm.modeOfPayment} onChange={(e) => setPurchaseForm(f => ({ ...f, modeOfPayment: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white">
                      <option value="credit">Credit</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="neft">NEFT</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Items <span className="text-red-400">*</span></p>
                  <button type="button" onClick={() => setPurchaseForm(f => ({ ...f, items: [...f.items, { ...EMPTY_PURCHASE_ITEM }] }))} className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    Add Row
                  </button>
                </div>
                <datalist id="purchase-inv-list">
                  {invSuggestions.map(inv => <option key={inv._id} value={inv.name} />)}
                </datalist>
                <div className="space-y-2">
                  {purchaseForm.items.map((item, i) => {
                    const isNewItem = item.itemName.length > 0 && !invSuggestions.some(inv => inv.name.toLowerCase() === item.itemName.toLowerCase());
                    const ic = "w-full border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none";
                    return (
                      <div key={i} className="border border-gray-200 rounded-xl p-3 bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Item {i + 1}</span>
                          {purchaseForm.items.length > 1 && <button type="button" onClick={() => { const items = purchaseForm.items.filter((_, j) => j !== i); const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPurchaseForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); }} className="w-5 h-5 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>}
                        </div>
                        <div className="mb-2">
                          <input list="purchase-inv-list" placeholder="Type medicine name to search..." required value={item.itemName} onChange={(e) => { const val = e.target.value; const items = [...purchaseForm.items]; items[i].itemName = val; const match = invSuggestions.find(inv => inv.name.toLowerCase() === val.toLowerCase()); if (match) { items[i].unitPrice = match.costPrice || 0; items[i].mrp = match.sellingPrice || 0; items[i].total = +(match.costPrice * items[i].quantity).toFixed(2); const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPurchaseForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); } else { setPurchaseForm(f => ({ ...f, items })); } }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                          {isNewItem && <p className="text-[10px] text-emerald-600 mt-0.5 px-0.5">+ Will be saved as a new item</p>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">HSN Code</label><input placeholder="HSN" value={item.hsnCode} onChange={(e) => { const items = [...purchaseForm.items]; items[i].hsnCode = e.target.value; setPurchaseForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Pack</label><input placeholder="e.g. 30GM" value={item.pack} onChange={(e) => { const items = [...purchaseForm.items]; items[i].pack = e.target.value; setPurchaseForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Manufacturer</label><input placeholder="Mfg name" value={item.manufacturer} onChange={(e) => { const items = [...purchaseForm.items]; items[i].manufacturer = e.target.value; setPurchaseForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Batch No</label><input placeholder="Batch" value={item.batchNo} onChange={(e) => { const items = [...purchaseForm.items]; items[i].batchNo = e.target.value; setPurchaseForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Expiry Date</label><input type="date" value={item.expiryDate} onChange={(e) => { const items = [...purchaseForm.items]; items[i].expiryDate = e.target.value; setPurchaseForm(f => ({ ...f, items })); }} className={ic} /></div>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Qty <span className="text-red-400">*</span></label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="1" required value={item.quantity || ""} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ""); const items = [...purchaseForm.items]; items[i].quantity = val === "" ? 0 : +val; items[i].total = +(items[i].unitPrice * items[i].quantity).toFixed(2); const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPurchaseForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Free</label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={item.freeQty || ""} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ""); const items = [...purchaseForm.items]; items[i].freeQty = val === "" ? 0 : +val; setPurchaseForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">MRP ₹</label><input type="number" placeholder="0.00" min={0} step="0.01" value={item.mrp || ""} onChange={(e) => { const items = [...purchaseForm.items]; items[i].mrp = +e.target.value; setPurchaseForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Rate ₹ <span className="text-red-400">*</span></label><input type="number" placeholder="0.00" min={0} step="0.01" required value={item.unitPrice || ""} onChange={(e) => { const items = [...purchaseForm.items]; items[i].unitPrice = +e.target.value; items[i].total = +(+e.target.value * items[i].quantity).toFixed(2); const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPurchaseForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">GST%</label><select value={item.gstRate} onChange={(e) => { const items = [...purchaseForm.items]; items[i].gstRate = +e.target.value; setPurchaseForm(f => ({ ...f, items })); }} className={ic}><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option></select></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Total ₹</label><input type="number" placeholder="0.00" min={0} step="0.01" value={item.total} onChange={(e) => { const items = [...purchaseForm.items]; items[i].total = +e.target.value; const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPurchaseForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); }} className="w-full border border-teal-200 bg-teal-50 rounded-lg px-2 py-1.5 text-xs font-semibold text-teal-700 focus:ring-1 focus:ring-teal-500/30 focus:border-teal-400 outline-none" /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center mt-3 px-1">
                  <span className="text-xs font-semibold text-gray-500">Items Total</span>
                  <span className="text-sm font-bold text-gray-900">₹{purchaseForm.items.reduce((s, it) => s + it.total, 0).toFixed(2)}</span>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Financial Summary</p>
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  {([
                    { label: "Gross Value", key: "grossValue", hint: "Auto-filled from items" },
                    { label: "Discount (−)", key: "discount" },
                    { label: "Adding (+)", key: "adding" },
                    { label: "Less (−)", key: "less" },
                    { label: "Rounding", key: "roundingAmount" },
                  ] as { label: string; key: keyof typeof purchaseForm; hint?: string }[]).map(({ label, key, hint }) => (
                    <div key={String(key)} className="flex items-center gap-4">
                      <div className="w-32 shrink-0">
                        <p className="text-sm text-gray-700 font-medium">{label}</p>
                        {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
                      </div>
                      <input type="number" min={0} step="0.01" value={purchaseForm[key] as number} onChange={(e) => setPurchaseForm(f => { const u = { ...f, [key]: +e.target.value }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; })} className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-3 space-y-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">GST (from bill)</p>
                    {([
                      { label: "CGST (₹)", key: "cgst" },
                      { label: "SGST (₹)", key: "sgst" },
                      { label: "IGST (₹)", key: "igst" },
                    ] as { label: string; key: keyof typeof purchaseForm }[]).map(({ label, key }) => (
                      <div key={String(key)} className="flex items-center gap-4">
                        <div className="w-32 shrink-0"><p className="text-sm text-gray-700 font-medium">{label}</p></div>
                        <input type="number" min={0} step="0.01" value={purchaseForm[key] as number} onChange={(e) => setPurchaseForm(f => ({ ...f, [key]: +e.target.value }))} className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                      </div>
                    ))}
                    <div className="flex items-center gap-4">
                      <div className="w-32 shrink-0"><p className="text-sm text-gray-500 font-medium">Total GST</p></div>
                      <div className="flex-1 bg-white border border-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700">₹{calcTotalGst(purchaseForm.cgst, purchaseForm.sgst, purchaseForm.igst).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-3 flex items-center gap-4">
                    <div className="w-32 shrink-0">
                      <p className="text-sm font-bold text-gray-900">Net Amount</p>
                      <p className="text-[10px] text-red-400">Required</p>
                    </div>
                    <input required type="number" min={0} step="0.01" value={purchaseForm.netAmount} onChange={(e) => setPurchaseForm(f => ({ ...f, netAmount: +e.target.value }))} className="flex-1 bg-white border-2 border-teal-500 rounded-xl px-3 py-2.5 text-base font-bold text-teal-700 focus:ring-2 focus:ring-teal-500/20 outline-none" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddPurchaseModal(false)} className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={purchaseSubmitting} className="flex-[2] px-8 py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 transition-colors">{purchaseSubmitting ? "Saving..." : "Save Purchase"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Return Detail Modal */}
      {selectedPurchaseReturn && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setSelectedPurchaseReturn(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl sm:rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Purchase Return Details</h2>
                <p className="text-xs text-gray-400 mt-0.5">Inv. {selectedPurchaseReturn.supplierInvNo}</p>
              </div>
              <button onClick={() => setSelectedPurchaseReturn(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors text-lg font-bold">×</button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Supplier", value: selectedPurchaseReturn.supplierName },
                  { label: "Inv. No", value: selectedPurchaseReturn.supplierInvNo },
                  { label: "Date", value: new Date(selectedPurchaseReturn.invoiceDate).toLocaleDateString("en-IN") },
                  { label: "Mode", value: selectedPurchaseReturn.modeOfPayment?.toUpperCase() || "—" },
                  { label: "GSTN", value: selectedPurchaseReturn.gstnNo || "—" },
                  { label: "City", value: selectedPurchaseReturn.city || "—" },
                  ...(selectedPurchaseReturn.reason ? [{ label: "Reason", value: selectedPurchaseReturn.reason }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-sm font-medium text-gray-800">{value}</p>
                  </div>
                ))}
              </div>

              {selectedPurchaseReturn.items && selectedPurchaseReturn.items.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Items Returned</h3>
                  <div className="space-y-2">
                    {selectedPurchaseReturn.items.map((item: any, i: number) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-3 bg-white">
                        <p className="text-sm font-semibold text-gray-900 mb-2">{item.itemName || "—"}</p>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                          {[
                            { label: "HSN", value: item.hsnCode || "—" },
                            { label: "Pack", value: item.pack || "—" },
                            { label: "Batch", value: item.batchNo || "—" },
                            { label: "Expiry", value: item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("en-IN") : "—" },
                            { label: "Qty", value: item.quantity ?? "—" },
                            { label: "Free", value: item.freeQty ?? 0 },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                              <p className="text-xs text-gray-700">{value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center mt-2 pt-2 border-t border-gray-50">
                          {[
                            { label: "MRP ₹", value: `₹${(item.mrp || 0).toFixed(2)}` },
                            { label: "Rate ₹", value: `₹${(item.unitPrice || 0).toFixed(2)}` },
                            { label: "GST %", value: `${item.gstRate ?? 0}%` },
                            { label: "Total ₹", value: `₹${(item.total || 0).toFixed(2)}`, highlight: true },
                          ].map(({ label, value, highlight }) => (
                            <div key={label} className={highlight ? "bg-orange-50 rounded-lg p-1" : ""}>
                              <p className={`text-[9px] font-semibold uppercase tracking-wider ${highlight ? "text-orange-500" : "text-gray-400"}`}>{label}</p>
                              <p className={`text-xs font-semibold ${highlight ? "text-orange-700" : "text-gray-700"}`}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Financial Summary</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  {[
                    { label: "Gross Value", value: `₹${(selectedPurchaseReturn.grossValue || 0).toFixed(2)}` },
                    { label: "Discount", value: `−₹${(selectedPurchaseReturn.discount || 0).toFixed(2)}`, red: true },
                    { label: "CGST", value: `₹${(selectedPurchaseReturn.cgst || 0).toFixed(2)}` },
                    { label: "SGST", value: `₹${(selectedPurchaseReturn.sgst || 0).toFixed(2)}` },
                    { label: "IGST", value: `₹${(selectedPurchaseReturn.igst || 0).toFixed(2)}` },
                    { label: "Total GST", value: `₹${(selectedPurchaseReturn.totalGst || 0).toFixed(2)}` },
                    ...(selectedPurchaseReturn.adding ? [{ label: "Adding", value: `₹${selectedPurchaseReturn.adding.toFixed(2)}` }] : []),
                    ...(selectedPurchaseReturn.less ? [{ label: "Less", value: `−₹${selectedPurchaseReturn.less.toFixed(2)}`, red: true }] : []),
                    ...(selectedPurchaseReturn.roundingAmount ? [{ label: "Rounding", value: `₹${selectedPurchaseReturn.roundingAmount.toFixed(2)}` }] : []),
                  ].map(({ label, value, red }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className={red ? "text-red-600 font-medium" : "text-gray-700 font-medium"}>{value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
                    <span className="text-gray-900">Net Amount</span>
                    <span className="text-orange-700">₹{(selectedPurchaseReturn.netAmount || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Purchase Return Modal */}
      {showAddPrModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl sm:rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-gray-900">New Purchase Return</h3>
                <p className="text-xs text-gray-400 mt-0.5">Record items returned to supplier</p>
              </div>
              <button onClick={() => setShowAddPrModal(false)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAddPr} className="p-6 space-y-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Supplier &amp; Bill</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Supplier Name <span className="text-red-400">*</span></label>
                    <input required value={prForm.supplierName} onChange={(e) => setPrForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="e.g. Cipla Ltd" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">City</label>
                    <input value={prForm.city} onChange={(e) => setPrForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Mumbai" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Supplier Inv. No <span className="text-red-400">*</span></label>
                    <input required value={prForm.supplierInvNo} onChange={(e) => setPrForm(f => ({ ...f, supplierInvNo: e.target.value }))} placeholder="e.g. INV-2024-001" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">GSTN No</label>
                    <input value={prForm.gstnNo} onChange={(e) => setPrForm(f => ({ ...f, gstnNo: e.target.value }))} placeholder="e.g. 29AAAAA0000A1Z5" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Invoice Date <span className="text-red-400">*</span></label>
                    <input required type="date" value={prForm.invoiceDate} onChange={(e) => setPrForm(f => ({ ...f, invoiceDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payment Mode <span className="text-red-400">*</span></label>
                    <select value={prForm.modeOfPayment} onChange={(e) => setPrForm(f => ({ ...f, modeOfPayment: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white">
                      <option value="credit">Credit</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="neft">NEFT</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason for Return</label>
                    <input value={prForm.reason} onChange={(e) => setPrForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Damaged goods, Wrong delivery, Near expiry" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Items <span className="text-red-400">*</span></p>
                  <button type="button" onClick={() => setPrForm(f => ({ ...f, items: [...f.items, { ...EMPTY_PURCHASE_ITEM }] }))} className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    Add Row
                  </button>
                </div>
                <datalist id="pr-inv-list">
                  {invSuggestions.map(inv => <option key={inv._id} value={inv.name} />)}
                </datalist>
                <div className="space-y-2">
                  {prForm.items.map((item, i) => {
                    const isNewItem = item.itemName.length > 0 && !invSuggestions.some(inv => inv.name.toLowerCase() === item.itemName.toLowerCase());
                    const ic = "w-full border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none";
                    return (
                      <div key={i} className="border border-gray-200 rounded-xl p-3 bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Item {i + 1}</span>
                          {prForm.items.length > 1 && <button type="button" onClick={() => { const items = prForm.items.filter((_, j) => j !== i); const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPrForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); }} className="w-5 h-5 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>}
                        </div>
                        <div className="mb-2">
                          <input list="pr-inv-list" placeholder="Type medicine name to search..." required value={item.itemName} onChange={(e) => { const val = e.target.value; const items = [...prForm.items]; items[i].itemName = val; const match = invSuggestions.find(inv => inv.name.toLowerCase() === val.toLowerCase()); if (match) { items[i].unitPrice = match.costPrice || 0; items[i].mrp = match.sellingPrice || 0; items[i].total = +(match.costPrice * items[i].quantity).toFixed(2); const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPrForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); } else { setPrForm(f => ({ ...f, items })); } }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                          {isNewItem && <p className="text-[10px] text-emerald-600 mt-0.5 px-0.5">+ Will be saved as a new item</p>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">HSN Code</label><input placeholder="HSN" value={item.hsnCode} onChange={(e) => { const items = [...prForm.items]; items[i].hsnCode = e.target.value; setPrForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Pack</label><input placeholder="e.g. 30GM" value={item.pack} onChange={(e) => { const items = [...prForm.items]; items[i].pack = e.target.value; setPrForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Manufacturer</label><input placeholder="Mfg name" value={item.manufacturer} onChange={(e) => { const items = [...prForm.items]; items[i].manufacturer = e.target.value; setPrForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Batch No</label><input placeholder="Batch" value={item.batchNo} onChange={(e) => { const items = [...prForm.items]; items[i].batchNo = e.target.value; setPrForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Expiry Date</label><input type="date" value={item.expiryDate} onChange={(e) => { const items = [...prForm.items]; items[i].expiryDate = e.target.value; setPrForm(f => ({ ...f, items })); }} className={ic} /></div>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Qty <span className="text-red-400">*</span></label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="1" required value={item.quantity || ""} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ""); const items = [...prForm.items]; items[i].quantity = val === "" ? 0 : +val; items[i].total = +(items[i].unitPrice * items[i].quantity).toFixed(2); const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPrForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Free</label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={item.freeQty || ""} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ""); const items = [...prForm.items]; items[i].freeQty = val === "" ? 0 : +val; setPrForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">MRP ₹</label><input type="number" placeholder="0.00" min={0} step="0.01" value={item.mrp || ""} onChange={(e) => { const items = [...prForm.items]; items[i].mrp = +e.target.value; setPrForm(f => ({ ...f, items })); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Rate ₹ <span className="text-red-400">*</span></label><input type="number" placeholder="0.00" min={0} step="0.01" required value={item.unitPrice || ""} onChange={(e) => { const items = [...prForm.items]; items[i].unitPrice = +e.target.value; items[i].total = +(+e.target.value * items[i].quantity).toFixed(2); const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPrForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); }} className={ic} /></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">GST%</label><select value={item.gstRate} onChange={(e) => { const items = [...prForm.items]; items[i].gstRate = +e.target.value; setPrForm(f => ({ ...f, items })); }} className={ic}><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option></select></div>
                          <div><label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Total ₹</label><input type="number" placeholder="0.00" min={0} step="0.01" value={item.total} onChange={(e) => { const items = [...prForm.items]; items[i].total = +e.target.value; const gross = +items.reduce((s, it) => s + it.total, 0).toFixed(2); setPrForm(f => { const u = { ...f, items, grossValue: gross }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; }); }} className="w-full border border-teal-200 bg-teal-50 rounded-lg px-2 py-1.5 text-xs font-semibold text-teal-700 focus:ring-1 focus:ring-teal-500/30 focus:border-teal-400 outline-none" /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center mt-3 px-1">
                  <span className="text-xs font-semibold text-gray-500">Items Total</span>
                  <span className="text-sm font-bold text-gray-900">₹{prForm.items.reduce((s, it) => s + it.total, 0).toFixed(2)}</span>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Financial Summary</p>
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  {([
                    { label: "Gross Value", key: "grossValue", hint: "Auto-filled from items" },
                    { label: "Discount (−)", key: "discount" },
                    { label: "Adding (+)", key: "adding" },
                    { label: "Less (−)", key: "less" },
                    { label: "Rounding", key: "roundingAmount" },
                  ] as { label: string; key: keyof typeof prForm; hint?: string }[]).map(({ label, key, hint }) => (
                    <div key={String(key)} className="flex items-center gap-4">
                      <div className="w-32 shrink-0">
                        <p className="text-sm text-gray-700 font-medium">{label}</p>
                        {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
                      </div>
                      <input type="number" min={0} step="0.01" value={prForm[key] as number} onChange={(e) => setPrForm(f => { const u = { ...f, [key]: +e.target.value }; u.netAmount = +(u.grossValue - u.discount + u.adding - u.less + u.roundingAmount).toFixed(2); return u; })} className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-3 space-y-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">GST (from bill)</p>
                    {([
                      { label: "CGST (₹)", key: "cgst" },
                      { label: "SGST (₹)", key: "sgst" },
                      { label: "IGST (₹)", key: "igst" },
                    ] as { label: string; key: keyof typeof prForm }[]).map(({ label, key }) => (
                      <div key={String(key)} className="flex items-center gap-4">
                        <div className="w-32 shrink-0"><p className="text-sm text-gray-700 font-medium">{label}</p></div>
                        <input type="number" min={0} step="0.01" value={prForm[key] as number} onChange={(e) => setPrForm(f => ({ ...f, [key]: +e.target.value }))} className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                      </div>
                    ))}
                    <div className="flex items-center gap-4">
                      <div className="w-32 shrink-0"><p className="text-sm text-gray-500 font-medium">Total GST</p></div>
                      <div className="flex-1 bg-white border border-gray-100 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700">₹{calcTotalGst(prForm.cgst, prForm.sgst, prForm.igst).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-3 flex items-center gap-4">
                    <div className="w-32 shrink-0">
                      <p className="text-sm font-bold text-gray-900">Net Amount</p>
                      <p className="text-[10px] text-red-400">Required</p>
                    </div>
                    <input required type="number" min={0} step="0.01" value={prForm.netAmount} onChange={(e) => setPrForm(f => ({ ...f, netAmount: +e.target.value }))} className="flex-1 bg-white border-2 border-teal-500 rounded-xl px-3 py-2.5 text-base font-bold text-teal-700 focus:ring-2 focus:ring-teal-500/20 outline-none" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddPrModal(false)} className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={prSubmitting} className="flex-[2] px-8 py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 transition-colors">{prSubmitting ? "Saving..." : "Save Return"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Sale Details</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedSale.invoiceNumber || selectedSale.saleId}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => printSaleBill(selectedSale)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  Print Bill
                </button>
                <button onClick={() => setSelectedSale(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Party", value: selectedSale.patientName },
                  { label: "Doctor", value: selectedSale.doctorName || "—" },
                  { label: "Phone", value: selectedSale.patientPhone || "—" },
                  { label: "City", value: selectedSale.city || "—" },
                  { label: "Invoice No", value: selectedSale.invoiceNumber || selectedSale.saleId || "—" },
                  { label: "Date", value: new Date(selectedSale.createdAt).toLocaleDateString("en-IN") },
                  { label: "Mode", value: selectedSale.paymentMethod?.toUpperCase() || "—" },
                  { label: "Type", value: selectedSale.isInterstate ? "Interstate (IGST)" : "Intrastate (CGST+SGST)" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{value}</p>
                  </div>
                ))}
              </div>
              {selectedSale.items?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Items</p>
                  <div className="space-y-2">
                    {selectedSale.items.map((item: any, i: number) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-gray-800 text-sm">{item.itemName}</p>
                          <span className="text-xs font-bold text-teal-700">₹{(item.total || 0).toFixed(2)}</span>
                        </div>
                        {(item.hsnCode || item.packing || item.manufacturer || item.batchNo) && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
                            {item.hsnCode && <div><p className="text-[10px] text-gray-400 font-medium">HSN</p><p className="font-medium text-gray-600">{item.hsnCode}</p></div>}
                            {item.packing && <div><p className="text-[10px] text-gray-400 font-medium">Packing</p><p className="font-medium text-gray-600">{item.packing}</p></div>}
                            {item.manufacturer && <div><p className="text-[10px] text-gray-400 font-medium">Mfg</p><p className="font-medium text-gray-600">{item.manufacturer}</p></div>}
                            {item.batchNo && <div><p className="text-[10px] text-gray-400 font-medium">Batch</p><p className="font-medium text-gray-600">{item.batchNo}</p></div>}
                          </div>
                        )}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                          {[
                            { label: "Qty", value: item.quantity },
                            { label: "MRP ₹", value: `₹${(item.unitPrice || 0).toFixed(2)}` },
                            { label: "Discount", value: `₹${(item.discount || 0).toFixed(2)}` },
                            { label: "GST%", value: `${item.gstRate || 0}%` },
                            ...(item.expiryDate ? [{ label: "Expiry", value: new Date(item.expiryDate).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" }) }] : []),
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
                  { label: "Gross Value", value: `₹${(selectedSale.grossValue || selectedSale.subtotal || 0).toFixed(2)}` },
                  { label: "CGST", value: `₹${((selectedSale.gst0?.cgst || 0) + (selectedSale.gst5?.cgst || 0) + (selectedSale.gst12?.cgst || 0) + (selectedSale.gst18?.cgst || 0) + (selectedSale.gst28?.cgst || 0)).toFixed(2)}` },
                  { label: "SGST", value: `₹${((selectedSale.gst0?.sgst || 0) + (selectedSale.gst5?.sgst || 0) + (selectedSale.gst12?.sgst || 0) + (selectedSale.gst18?.sgst || 0) + (selectedSale.gst28?.sgst || 0)).toFixed(2)}` },
                  { label: "Total GST", value: `₹${(selectedSale.totalGst || selectedSale.taxAmount || 0).toFixed(2)}` },
                  ...(selectedSale.roundingAmount ? [{ label: "Rounding", value: `₹${selectedSale.roundingAmount.toFixed(2)}` }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-700">{value}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="font-bold text-gray-900">Net Amount</span>
                  <span className="text-lg font-bold text-teal-700">₹{(selectedSale.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Add Sale Modal */}
      {showAddSaleModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">New Sale</h2>
                  <p className="text-xs text-gray-400">Record an OTC or prescription sale</p>
                </div>
              </div>
              <button onClick={() => setShowAddSaleModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAddSale} className="p-5 space-y-5">
              {/* Bill Header Info */}
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
                      <span className="text-sm text-gray-600">Interstate sale <span className="text-xs text-gray-400">(IGST instead of CGST+SGST)</span></span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Items</p>
                <datalist id="sale-inv-list">
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
                        {/* Product Name (autocomplete) */}
                        <div className="mb-2">
                          <label className="block text-[10px] text-gray-400 mb-0.5">Product Name <span className="text-red-400">*</span></label>
                          <input list="sale-inv-list" placeholder="Type to search inventory..." value={item.itemName}
                            onChange={(e) => {
                              const name = e.target.value;
                              const match = invSuggestions.find(inv => inv.name.toLowerCase() === name.toLowerCase());
                              setSaleForm(f => ({
                                ...f,
                                items: f.items.map((it, j) => j !== i ? it : {
                                  ...it,
                                  itemName: name,
                                  itemId: match?._id || "",
                                  mrp: match?.sellingPrice ?? it.mrp,
                                  gstRate: match?.gstRate ?? it.gstRate,
                                  manufacturer: match?.manufacturer || it.manufacturer,
                                  batchNo: match?.batchNumber || it.batchNo,
                                  expiryDate: match?.expiryDate ? new Date(match.expiryDate).toISOString().split("T")[0] : it.expiryDate,
                                  hsnCode: match?.hsnCode || it.hsnCode,
                                  packing: match?.packing || it.packing,
                                  total: +((it.qty * (match?.sellingPrice ?? it.mrp)) - it.discount).toFixed(2),
                                }),
                              }));
                            }}
                            className="w-full border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none"
                            required />
                          {item.itemName && !matchedInv && (
                            <p className="text-[10px] text-amber-600 mt-0.5 px-0.5">⚠ Item not found in inventory — will fail on save</p>
                          )}
                          {matchedInv && (
                            <p className="text-[10px] text-emerald-600 mt-0.5 px-0.5">✓ Stock: {matchedInv.currentStock} {matchedInv.unit}</p>
                          )}
                        </div>
                        {/* Row 1: HSN, Packing, Mfg */}
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">HSN Code</label>
                            <input type="text" placeholder="e.g. 30049099" value={item.hsnCode}
                              onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, hsnCode: e.target.value }) }))}
                              className={ic} />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">Packing</label>
                            <input type="text" placeholder="e.g. 10×10" value={item.packing}
                              onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, packing: e.target.value }) }))}
                              className={ic} />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">Manufacturer</label>
                            <input type="text" placeholder="Mfg name" value={item.manufacturer}
                              onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, manufacturer: e.target.value }) }))}
                              className={ic} />
                          </div>
                        </div>
                        {/* Row 2: Batch, Expiry, MRP, Qty, Discount, GST, Total */}
                        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">Batch No</label>
                            <input type="text" placeholder="Batch" value={item.batchNo}
                              onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, batchNo: e.target.value }) }))}
                              className={ic} />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">Expiry</label>
                            <input type="date" value={item.expiryDate}
                              onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, expiryDate: e.target.value }) }))}
                              className={ic} />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">MRP ₹ <span className="text-red-400">*</span></label>
                            <input type="number" min={0} step="0.01" value={item.mrp}
                              onChange={(e) => {
                                const mrp = Number(e.target.value) || 0;
                                setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, mrp, total: +(it.qty * mrp - it.discount).toFixed(2) }) }));
                              }}
                              className={ic} required />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">Qty <span className="text-red-400">*</span></label>
                            <input type="number" min={1} value={item.qty}
                              onChange={(e) => {
                                const qty = Number(e.target.value) || 0;
                                setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, qty, total: +(qty * it.mrp - it.discount).toFixed(2) }) }));
                              }}
                              className={ic} required />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">Disc ₹</label>
                            <input type="number" min={0} step="0.01" value={item.discount}
                              onChange={(e) => {
                                const discount = Number(e.target.value) || 0;
                                setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, discount, total: +(it.qty * it.mrp - discount).toFixed(2) }) }));
                              }}
                              className={ic} />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">GST%</label>
                            <select value={item.gstRate} onChange={(e) => setSaleForm(f => ({ ...f, items: f.items.map((it, j) => j !== i ? it : { ...it, gstRate: Number(e.target.value) }) }))}
                              className={ic}>
                              {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">Total ₹</label>
                            <input type="number" value={item.total} readOnly
                              className="w-full border border-teal-200 bg-teal-50 text-teal-700 rounded-lg px-2 py-1.5 text-xs font-bold outline-none cursor-default" />
                          </div>
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
                    if (r > 0) {
                      if (saleForm.isInterstate) igst += it.total * r / 100;
                      else { cgst += it.total * r / 200; sgst += it.total * r / 200; }
                    }
                  });
                  const totalGst = saleForm.isInterstate ? +igst.toFixed(2) : +(cgst + sgst).toFixed(2);
                  const net = +(gross + totalGst + saleForm.roundingAmount).toFixed(2);
                  return (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-medium">₹{gross.toFixed(2)}</span></div>
                      {saleForm.isInterstate
                        ? <div className="flex justify-between"><span className="text-gray-500">IGST</span><span className="font-medium text-blue-600">₹{igst.toFixed(2)}</span></div>
                        : <>
                            <div className="flex justify-between"><span className="text-gray-500">CGST</span><span className="font-medium text-blue-600">₹{cgst.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">SGST</span><span className="font-medium text-blue-600">₹{sgst.toFixed(2)}</span></div>
                          </>
                      }
                      <div className="flex justify-between"><span className="text-gray-500">Total GST</span><span className="font-medium text-blue-600">₹{totalGst.toFixed(2)}</span></div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Rounding</span>
                        <input type="number" step="0.01" value={saleForm.roundingAmount}
                          onChange={(e) => setSaleForm(f => ({ ...f, roundingAmount: Number(e.target.value) || 0 }))}
                          className="w-24 border border-gray-200 bg-white rounded-lg px-2 py-1 text-xs text-right outline-none focus:border-teal-400" />
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-base">
                        <span>Net Amount</span>
                        <span className="text-teal-700">₹{net.toFixed(2)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddSaleModal(false)} className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saleSubmitting} className="flex-[2] px-8 py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 transition-colors">{saleSubmitting ? "Saving..." : "Save Sale"}</button>
              </div>
            </form>
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

              <div>
                <datalist id="sr-inv-list-clinic">
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
                            <input list="sr-inv-list-clinic" placeholder="Type to search inventory..." required value={item.itemName}
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

              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
                <div className="col-span-3">
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
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddSrModal(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={srSubmitting} className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60">{srSubmitting ? "Saving..." : "Save Return"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
