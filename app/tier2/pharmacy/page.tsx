"use client";

import { useEffect, useState, useCallback } from "react";
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
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/tier2/dashboard" },
  { label: "Patients", href: "/tier2/patients" },
  { label: "Consultations", href: "/tier2/consultations" },
  { label: "Pharmacy", href: "/tier2/pharmacy", active: true },
  { label: "Templates", href: "/tier2/templates" },
  { label: "Analytics", href: "/tier2/analytics" },
  { label: "Frontdesk", href: "/tier2/settings/frontdesk" },
];

export default function DoctorPharmacyPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [stats, setStats] = useState<any>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [activeTab, setActiveTab] = useState<"inventory" | "activity">("inventory");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Item detail drawer
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [detailTransactions, setDetailTransactions] = useState<Transaction[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Stock modal
  const [showStockModal, setShowStockModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [stockForm, setStockForm] = useState({
    type: "stock-in",
    quantity: 1,
    reason: "",
    batchNumber: "",
    expiryDate: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Add item modal
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [addItemForm, setAddItemForm] = useState({
    name: "",
    genericName: "",
    category: "medicine",
    type: "otc",
    currentStock: 0,
    minStockLevel: 10,
    unit: "units",
    costPrice: 0,
    sellingPrice: 0,
    manufacturer: "",
    description: "",
    batchNumber: "",
    expiryDate: "",
    location: "",
  });
  const [addItemSubmitting, setAddItemSubmitting] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const getToken = () => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return null; }
    return token;
  };

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) { router.push("/login"); return; }
      let url = "/api/tier2/inventory?";
      if (filter === "low-stock") url += "lowStock=true";
      else if (filter === "out-of-stock") url += "status=out-of-stock";
      else if (filter === "expiring") url += "expiringSoon=true";
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (data.success) {
        setItems(data.data.items || []);
        setStats(data.data.stats);
      }
    } catch {
      showToast("error", "Failed to load inventory");
    } finally {
      setLoading(false);
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
    if (activeTab === "activity") fetchTransactions();
  }, [activeTab, fetchTransactions]);

  useEffect(() => {
    if (showStockModal) {
      setStockForm({ type: "stock-in", quantity: 1, reason: "", batchNumber: "", expiryDate: "" });
    }
  }, [showStockModal]);

  const openItemDetail = (item: InventoryItem) => {
    setDetailItem(item);
    setShowDetailDrawer(true);
    fetchItemDetail(item._id);
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setSubmitting(true);
    const token = getToken();
    if (!token) { setSubmitting(false); return; }
    try {
      const response = await fetch(`/api/tier2/inventory/${selectedItem._id}/stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(stockForm),
      });
      const data = await response.json();
      if (data.success) {
        showToast("success", `Stock updated for ${selectedItem.name}`);
        setShowStockModal(false);
        setStockForm({ type: "stock-in", quantity: 1, reason: "", batchNumber: "", expiryDate: "" });
        fetchInventory();
        if (showDetailDrawer && detailItem?._id === selectedItem._id) fetchItemDetail(selectedItem._id);
      } else {
        showToast("error", data.message || "Failed to update stock");
      }
    } catch {
      showToast("error", "Error updating stock");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddItemSubmitting(true);
    const token = getToken();
    if (!token) { setAddItemSubmitting(false); return; }
    try {
      const payload: any = {
        name: addItemForm.name,
        category: addItemForm.category,
        type: addItemForm.type,
        currentStock: addItemForm.currentStock,
        minStockLevel: addItemForm.minStockLevel,
        unit: addItemForm.unit,
        costPrice: addItemForm.costPrice,
        sellingPrice: addItemForm.sellingPrice,
      };
      if (addItemForm.genericName) payload.genericName = addItemForm.genericName;
      if (addItemForm.manufacturer) payload.manufacturer = addItemForm.manufacturer;
      if (addItemForm.description) payload.description = addItemForm.description;
      if (addItemForm.batchNumber) payload.batchNumber = addItemForm.batchNumber;
      if (addItemForm.expiryDate) payload.expiryDate = addItemForm.expiryDate;
      if (addItemForm.location) payload.location = addItemForm.location;

      const response = await fetch("/api/tier2/inventory", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.success) {
        showToast("success", `${addItemForm.name} added to inventory`);
        setShowAddItemModal(false);
        setAddItemForm({
          name: "", genericName: "", category: "medicine", type: "otc",
          currentStock: 0, minStockLevel: 10, unit: "units",
          costPrice: 0, sellingPrice: 0, manufacturer: "", description: "",
          batchNumber: "", expiryDate: "", location: "",
        });
        fetchInventory();
      } else {
        showToast("error", data.message || "Failed to add item");
      }
    } catch {
      showToast("error", "An error occurred. Please try again.");
    } finally {
      setAddItemSubmitting(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;
    setEditSubmitting(true);
    const token = getToken();
    if (!token) { setEditSubmitting(false); return; }
    try {
      const response = await fetch(`/api/tier2/inventory/${editForm._id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name, genericName: editForm.genericName,
          category: editForm.category, type: editForm.type,
          minStockLevel: editForm.minStockLevel, unit: editForm.unit,
          costPrice: editForm.costPrice, sellingPrice: editForm.sellingPrice,
          manufacturer: editForm.manufacturer, location: editForm.location,
          description: editForm.description,
        }),
      });
      const data = await response.json();
      if (data.success) {
        showToast("success", `${editForm.name} updated successfully`);
        setShowEditModal(false);
        setEditForm(null);
        fetchInventory();
        if (showDetailDrawer && detailItem?._id === editForm._id) fetchItemDetail(editForm._id);
      } else {
        showToast("error", data.message || "Failed to update item");
      }
    } catch {
      showToast("error", "Error updating item");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItem) return;
    setDeleteSubmitting(true);
    const token = getToken();
    if (!token) { setDeleteSubmitting(false); return; }
    try {
      const response = await fetch(`/api/tier2/inventory/${deleteItem._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        showToast("success", `${deleteItem.name} discontinued`);
        setShowDeleteConfirm(false);
        setDeleteItem(null);
        if (showDetailDrawer && detailItem?._id === deleteItem._id) setShowDetailDrawer(false);
        fetchInventory();
      } else {
        showToast("error", data.message || "Failed to discontinue item");
      }
    } catch {
      showToast("error", "Error discontinuing item");
    } finally {
      setDeleteSubmitting(false);
    }
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

  const CATEGORIES = [
    { value: "medicine", label: "Medicine", gradient: "from-blue-400 to-blue-500", bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700" },
    { value: "cream", label: "Cream", gradient: "from-pink-400 to-rose-500", bg: "bg-pink-50", border: "border-pink-300", text: "text-pink-700" },
    { value: "lotion", label: "Lotion", gradient: "from-purple-400 to-violet-500", bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-700" },
    { value: "supplement", label: "Supplement", gradient: "from-emerald-400 to-green-500", bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700" },
    { value: "equipment", label: "Equipment", gradient: "from-amber-400 to-orange-500", bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700" },
    { value: "consumable", label: "Consumable", gradient: "from-cyan-400 to-teal-500", bg: "bg-cyan-50", border: "border-cyan-300", text: "text-cyan-700" },
    { value: "other", label: "Other", gradient: "from-gray-400 to-gray-500", bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-700" },
  ];

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
                href="/tier2/dashboard"
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
            <button
              onClick={() => setShowAddItemModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20 flex items-center gap-2 font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="hidden sm:inline text-base">Add Item</span>
              <span className="sm:hidden text-base">Add</span>
            </button>
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
        <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
          {(["inventory", "activity"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "activity" ? "Activity Log" : "Inventory"}
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
                    <div className="col-span-2">Actions</div>
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
                            <div className="col-span-2 flex items-center gap-1.5">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border ring-1 ${stockStatus.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${stockStatus.dot}`}></span>
                                {stockStatus.label}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setShowStockModal(true); }}
                                className="p-1.5 text-teal-500 hover:bg-teal-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="Update Stock"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditForm({ ...item }); setShowEditModal(true); }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="Edit Item"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
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
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setShowStockModal(true); }}
                                className="p-1.5 text-teal-500 hover:bg-teal-50 rounded-lg transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                    {searchQuery ? `No results for "${searchQuery}"` : filter !== "all" ? "Try a different filter" : "Add your first item to get started"}
                  </p>
                  {!searchQuery && filter === "all" && (
                    <button
                      onClick={() => setShowAddItemModal(true)}
                      className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl text-sm font-medium hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add First Item
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
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
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setSelectedItem(detailItem); setShowStockModal(true); }}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl text-sm font-semibold hover:from-teal-600 hover:to-cyan-700 transition-all"
                >
                  Update Stock
                </button>
                <button
                  onClick={() => { setEditForm({ ...detailItem }); setShowEditModal(true); }}
                  className="px-3 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => { setDeleteItem(detailItem); setShowDeleteConfirm(true); }}
                  className="px-3 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50"
                >
                  Discontinue
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add New Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Add New Item</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Add a product to your pharmacy inventory</p>
                </div>
              </div>
              <button onClick={() => setShowAddItemModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddNewItem} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Item Name <span className="text-red-400 normal-case">*</span></label>
                <input type="text" value={addItemForm.name} onChange={(e) => setAddItemForm({ ...addItemForm, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50"
                  placeholder="e.g., Betnovate-C Cream" required autoFocus />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Generic Name <span className="text-gray-400 font-normal normal-case">(Optional)</span></label>
                <input type="text" value={addItemForm.genericName} onChange={(e) => setAddItemForm({ ...addItemForm, genericName: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50"
                  placeholder="e.g., Betamethasone + Clioquinol" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Category <span className="text-red-400 normal-case">*</span></label>
                <div className="grid grid-cols-4 gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button key={cat.value} type="button" onClick={() => setAddItemForm({ ...addItemForm, category: cat.value })}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center transition-all border-2 ${
                        addItemForm.category === cat.value ? `${cat.bg} ${cat.border} ${cat.text} shadow-sm` : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${addItemForm.category === cat.value ? `bg-gradient-to-br ${cat.gradient} shadow-sm` : "bg-gray-200"}`}>
                        <svg className={`w-3.5 h-3.5 ${addItemForm.category === cat.value ? "text-white" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={getCategoryIcon(cat.value)} />
                        </svg>
                      </div>
                      <span className="text-[10px] font-semibold leading-tight">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: "otc", label: "OTC", desc: "Over the counter" }, { value: "prescription", label: "Rx", desc: "Prescription only" }].map((t) => (
                    <button key={t.value} type="button" onClick={() => setAddItemForm({ ...addItemForm, type: t.value })}
                      className={`py-2.5 px-3 rounded-xl text-left transition-all border-2 flex items-center gap-2.5 ${
                        addItemForm.type === t.value ? "bg-teal-50 text-teal-700 border-teal-400 shadow-sm" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${addItemForm.type === t.value ? "bg-teal-500 text-white" : "bg-gray-200 text-gray-500"}`}>{t.label}</div>
                      <span className="text-xs font-semibold">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Unit</label>
                <div className="flex flex-wrap gap-1.5">
                  {["units", "tablets", "capsules", "tubes", "bottles", "ml", "grams", "pieces"].map((u) => (
                    <button key={u} type="button" onClick={() => setAddItemForm({ ...addItemForm, unit: u })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        addItemForm.unit === u ? "bg-teal-500 text-white border-teal-500 shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50"
                      }`}
                    >
                      {u.charAt(0).toUpperCase() + u.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Initial Stock</label>
                  <input type="number" value={addItemForm.currentStock} onChange={(e) => setAddItemForm({ ...addItemForm, currentStock: parseInt(e.target.value) || 0 })}
                    min={0} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Min Level</label>
                  <input type="number" value={addItemForm.minStockLevel} onChange={(e) => setAddItemForm({ ...addItemForm, minStockLevel: parseInt(e.target.value) || 0 })}
                    min={0} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Cost Price (₹) <span className="text-red-400 normal-case">*</span></label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 font-medium text-sm">₹</span>
                    <input type="number" value={addItemForm.costPrice} onChange={(e) => setAddItemForm({ ...addItemForm, costPrice: parseFloat(e.target.value) || 0 })}
                      min={0} step="0.01" className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" required />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Selling Price (₹) <span className="text-red-400 normal-case">*</span></label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 font-medium text-sm">₹</span>
                    <input type="number" value={addItemForm.sellingPrice} onChange={(e) => setAddItemForm({ ...addItemForm, sellingPrice: parseFloat(e.target.value) || 0 })}
                      min={0} step="0.01" className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" required />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Manufacturer</label>
                  <input type="text" value={addItemForm.manufacturer} onChange={(e) => setAddItemForm({ ...addItemForm, manufacturer: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" placeholder="e.g., GSK" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Location</label>
                  <input type="text" value={addItemForm.location} onChange={(e) => setAddItemForm({ ...addItemForm, location: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" placeholder="e.g., Shelf A2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Batch Number</label>
                  <input type="text" value={addItemForm.batchNumber} onChange={(e) => setAddItemForm({ ...addItemForm, batchNumber: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Expiry Date</label>
                  <input type="date" value={addItemForm.expiryDate} onChange={(e) => setAddItemForm({ ...addItemForm, expiryDate: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddItemModal(false)} className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={addItemSubmitting}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-semibold hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md disabled:opacity-60 text-sm"
                >
                  {addItemSubmitting ? "Adding..." : "Add Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditModal && editForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Edit Item</h2>
                <p className="text-sm text-gray-500 mt-0.5">{editForm.name}</p>
              </div>
              <button onClick={() => { setShowEditModal(false); setEditForm(null); }} className="p-2 hover:bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEditItem} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Item Name</label>
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Generic Name</label>
                  <input type="text" value={editForm.genericName || ""} onChange={(e) => setEditForm({ ...editForm, genericName: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Cost Price (₹)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 text-sm">₹</span>
                    <input type="number" value={editForm.costPrice} onChange={(e) => setEditForm({ ...editForm, costPrice: parseFloat(e.target.value) || 0 })}
                      min={0} step="0.01" className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Selling Price (₹)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 text-sm">₹</span>
                    <input type="number" value={editForm.sellingPrice} onChange={(e) => setEditForm({ ...editForm, sellingPrice: parseFloat(e.target.value) || 0 })}
                      min={0} step="0.01" className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Min Stock Level</label>
                  <input type="number" value={editForm.minStockLevel} onChange={(e) => setEditForm({ ...editForm, minStockLevel: parseInt(e.target.value) || 0 })}
                    min={0} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Manufacturer</label>
                  <input type="text" value={editForm.manufacturer || ""} onChange={(e) => setEditForm({ ...editForm, manufacturer: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Location</label>
                <input type="text" value={editForm.location || ""} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50" placeholder="e.g., Shelf A2" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowEditModal(false); setEditForm(null); }} className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={editSubmitting}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-semibold hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md disabled:opacity-60 text-sm"
                >
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Update Modal */}
      {showStockModal && selectedItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 bg-gradient-to-br ${getCategoryColor(selectedItem.category)} rounded-xl flex items-center justify-center shadow-sm`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={getCategoryIcon(selectedItem.category)} />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Update Stock</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{selectedItem.name} &middot; {selectedItem.currentStock} {selectedItem.unit}</p>
                  </div>
                </div>
                <button onClick={() => { setShowStockModal(false); setSelectedItem(null); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              </div>
            </div>

            <form onSubmit={handleAddStock} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Transaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "stock-in", label: "Stock In", icon: "M12 6v6m0 0v6m0-6h6m-6 0H6" },
                    { value: "stock-out", label: "Stock Out", icon: "M20 12H4" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setStockForm({ ...stockForm, type: t.value })}
                      className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all border flex flex-col items-center gap-1.5 ${
                        stockForm.type === t.value
                          ? t.value === "stock-in" ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : "bg-red-50 text-red-700 border-red-300"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                      </svg>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Quantity</label>
                <input
                  type="number"
                  value={stockForm.quantity}
                  onChange={(e) => setStockForm({ ...stockForm, quantity: parseInt(e.target.value) || 0 })}
                  min={1}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                  required
                />
                <p className="text-sm text-gray-400 mt-1.5">
                  New stock will be: <span className="font-semibold text-gray-600">
                    {stockForm.type === "stock-in"
                      ? selectedItem.currentStock + (stockForm.quantity || 0)
                      : Math.max(0, selectedItem.currentStock - (stockForm.quantity || 0))
                    } {selectedItem.unit}
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Reason <span className="text-red-400 normal-case">*</span>
                </label>
                <input
                  type="text"
                  value={stockForm.reason}
                  onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })}
                  placeholder={stockForm.type === "stock-in" ? "e.g., New purchase from supplier" : "e.g., Dispensed to patient"}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50 placeholder:text-gray-400"
                  required
                />
              </div>

              {stockForm.type === "stock-in" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      Batch No. <span className="text-gray-400 font-normal normal-case tracking-normal">(Opt.)</span>
                    </label>
                    <input
                      type="text"
                      value={stockForm.batchNumber}
                      onChange={(e) => setStockForm({ ...stockForm, batchNumber: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      Expiry <span className="text-gray-400 font-normal normal-case tracking-normal">(Opt.)</span>
                    </label>
                    <input
                      type="date"
                      value={stockForm.expiryDate}
                      onChange={(e) => setStockForm({ ...stockForm, expiryDate: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowStockModal(false); setSelectedItem(null); }}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`flex-[2] py-3 text-white rounded-xl transition-all font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-md disabled:shadow-none ${
                    stockForm.type === "stock-in"
                      ? "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-emerald-500/20"
                      : "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-red-500/20"
                  }`}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Updating...
                    </span>
                  ) : (
                    stockForm.type === "stock-in" ? "Add Stock" : "Remove Stock"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && deleteItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
              <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center">Discontinue Item?</h3>
            <p className="text-sm text-gray-500 text-center mt-2">
              <span className="font-semibold text-gray-700">{deleteItem.name}</span> will be marked as discontinued. This action can be reversed by contacting support.
            </p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteItem(null); }} className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 text-sm">
                Cancel
              </button>
              <button onClick={handleDeleteItem} disabled={deleteSubmitting} className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-all disabled:opacity-60 text-sm">
                {deleteSubmitting ? "Processing..." : "Discontinue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
