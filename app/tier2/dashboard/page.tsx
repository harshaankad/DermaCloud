"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface UsageStats {
  dailyUsed: number;
  dailyLimit: number;
  dailyRemaining: number;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  totalConsultations: number;
  totalPatients: number;
}

interface AppointmentData {
  _id: string;
  appointmentTime: string;
  type: string;
  status: string;
  reason: string;
  tokenNumber?: number;
  patientId: {
    _id: string;
    name: string;
    patientId: string;
    phone: string;
    age: number;
    gender: string;
  };
}

interface AppointmentsInfo {
  list: AppointmentData[];
  stats: {
    total: number;
    scheduled: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    "checked-in": number;
    "in-progress": number;
    "no-show": number;
  };
}

interface SalesInfo {
  totalSales: number;
  totalRevenue: number;
  totalPaid: number;
  totalDue: number;
}

interface DashboardData {
  usage: UsageStats;
  appointments: AppointmentsInfo;
  sales: SalesInfo;
}

const POLL_INTERVAL = 30000; // 30 seconds

export default function Tier2Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [appointments, setAppointments] = useState<AppointmentsInfo | null>(null);
  const [sales, setSales] = useState<SalesInfo | null>(null);
  const [pharmacy, setPharmacy] = useState<{ lowStockCount: number; outOfStockCount: number; expiringCount: number } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDashboard = useCallback(async (showLoader = false) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const response = await fetch("/api/tier2/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setUsageStats(data.data.usage);
        setAppointments(data.data.appointments || null);
        setSales(data.data.sales || null);
        setPharmacy(data.data.pharmacy || null);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    }

    if (showLoader) setLoading(false);
  }, []);

  // Initial load + auth check
  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");

    if (!token || !userData) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);

    if (parsedUser.tier !== "tier2") {
      router.push("/dashboard");
      return;
    }

    fetchDashboard(true);
  }, [router, fetchDashboard]);

  // Auto-polling every 30 seconds
  useEffect(() => {
    pollRef.current = setInterval(() => fetchDashboard(), POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchDashboard]);

  // Refresh on tab focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchDashboard();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchDashboard]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "scheduled":
        return { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", label: "Scheduled" };
      case "confirmed":
        return { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", label: "Confirmed" };
      case "checked-in":
        return { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Waiting" };
      case "in-progress":
        return { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500", label: "In Consultation" };
      case "completed":
        return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Completed" };
      case "cancelled":
        return { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400", label: "Cancelled" };
      case "no-show":
        return { bg: "bg-gray-50", text: "text-gray-600", dot: "bg-gray-400", label: "No Show" };
      default:
        return { bg: "bg-gray-50", text: "text-gray-600", dot: "bg-gray-400", label: status };
    }
  };

  const getTokenStyle = (status: string) => {
    const styles: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-700 border-blue-200",
      "checked-in": "bg-amber-100 text-amber-700 border-amber-300",
      "in-progress": "bg-purple-100 text-purple-700 border-purple-300",
      completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
      cancelled: "bg-red-50 text-red-400 border-red-200",
      "no-show": "bg-gray-100 text-gray-400 border-gray-200",
    };
    return styles[status] || "bg-gray-100 text-gray-500 border-gray-200";
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "dermatology":
        return "bg-blue-50 text-blue-600";
      case "cosmetology":
        return "bg-purple-50 text-purple-600";
      case "follow-up":
        return "bg-amber-50 text-amber-600";
      case "consultation":
        return "bg-teal-50 text-teal-600";
      default:
        return "bg-gray-50 text-gray-600";
    }
  };

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Morning";
    if (hour < 17) return "Afternoon";
    return "Evening";
  }

  function getTimeAgo(date: Date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 10) return "Just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  // Update the "time ago" text every 10 seconds
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);


  // Sort: in-progress first, then checked-in (waiting), then scheduled, then rest
  const statusPriority: Record<string, number> = {
    "in-progress": 0,
    "checked-in": 1,
    "scheduled": 2,
    "confirmed": 3,
    "completed": 4,
    "no-show": 5,
    "cancelled": 6,
  };
  const sortedAppointments = [...(appointments?.list || [])].sort((a, b) => {
    const pa = statusPriority[a.status] ?? 99;
    const pb = statusPriority[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.appointmentTime || "").localeCompare(b.appointmentTime || "");
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{user?.clinicName || "DermaCloud"}</h1>
                <p className="text-base text-gray-500 hidden sm:block">Dr. {user?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/tier2/profile">
                <span className="text-sm text-gray-600 hover:text-teal-600 cursor-pointer font-medium hidden sm:block transition-colors">
                  Profile
                </span>
              </Link>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {[
              { label: "Dashboard", href: "/tier2/dashboard", active: true },
              { label: "Patients", href: "/tier2/patients" },
              { label: "Consultations", href: "/tier2/consultations" },
              { label: "Pharmacy", href: "/tier2/pharmacy" },
              { label: "Templates", href: "/tier2/templates" },
              { label: "Analytics", href: "/tier2/analytics" },
              { label: "Frontdesk", href: "/tier2/settings/frontdesk" },
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
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-teal-600 mx-auto mb-4" />
              <p className="text-gray-600 font-semibold">Loading dashboard...</p>
            </div>
          </div>
        ) : <>
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Good {getGreeting()}, Dr. {user?.name}!</h2>
          <p className="text-gray-600">Here&apos;s what&apos;s happening today at your clinic.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
          {/* Today's Appointments */}
          <div className="bg-white rounded-xl shadow-lg p-5 border-l-4 border-teal-500">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wide">Appointments</h3>
              <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{appointments?.stats.total || 0}</p>
            <p className="mt-1 text-xs text-gray-500">
              {appointments?.stats.scheduled || 0} scheduled, {appointments?.stats.completed || 0} done
            </p>
          </div>

          {/* Waiting Patients */}
          <div className="bg-white rounded-xl shadow-lg p-5 border-l-4 border-amber-500">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wide">Waiting</h3>
              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{appointments?.stats["checked-in"] || 0}</p>
            <p className="mt-1 text-xs text-gray-500">
              {(appointments?.stats["in-progress"] || 0) > 0
                ? `${appointments?.stats["in-progress"]} in consultation`
                : "Checked in & waiting"}
            </p>
          </div>

          {/* Inventory Alerts */}
          <div className="bg-white rounded-xl shadow-lg p-5 border-l-4 border-red-500">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wide">Inventory</h3>
              <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{(pharmacy?.lowStockCount || 0) + (pharmacy?.outOfStockCount || 0)}</p>
            <p className="mt-1 text-xs text-gray-500">
              {pharmacy?.lowStockCount || 0} low, {pharmacy?.outOfStockCount || 0} out
            </p>
          </div>

          {/* Today's Revenue */}
          <div className="bg-white rounded-xl shadow-lg p-5 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wide">Revenue</h3>
              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(sales?.totalRevenue || 0)}</p>
            <p className="mt-1 text-xs text-gray-500">{sales?.totalSales || 0} transactions</p>
          </div>
        </div>

        {/* Quick Actions & Today's Appointments */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-1 order-2 lg:order-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Link
                  href="/tier2/patients"
                  className="flex items-center p-3 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <span className="font-medium text-teal-700">Add / Search Patient</span>
                </Link>
                <Link
                  href="/tier2/consultations?filter=today"
                  className="flex items-center p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className="font-medium text-blue-700">View Consultations</span>
                </Link>
                <Link
                  href="/tier2/pharmacy"
                  className="flex items-center p-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </div>
                  <span className="font-medium text-purple-700">Manage Pharmacy</span>
                </Link>
                <Link
                  href="/tier2/templates"
                  className="flex items-center p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                    </svg>
                  </div>
                  <span className="font-medium text-green-700">Edit Templates</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Today's Appointments */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold text-gray-900">Today&apos;s Appointments</h3>
                  {/* Live indicator */}
                  <span className="flex items-center space-x-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <span>Live</span>
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  {lastUpdated && (
                    <span className="text-xs text-gray-400">Updated {getTimeAgo(lastUpdated)}</span>
                  )}
                  <span className="text-sm text-gray-500">{appointments?.stats.total || 0} total</span>
                </div>
              </div>

              {sortedAppointments.length > 0 ? (
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {sortedAppointments.map((apt) => {
                    const ss = getStatusStyle(apt.status);
                    const isActive = apt.status === "in-progress";
                    const isWaiting = apt.status === "checked-in";

                    return (
                      <div
                        key={apt._id}
                        className={`p-4 flex items-center gap-4 transition-colors ${
                          isActive
                            ? "bg-purple-50/60 border-l-4 border-purple-500"
                            : isWaiting
                            ? "bg-amber-50/40 border-l-4 border-amber-400"
                            : "hover:bg-gray-50 border-l-4 border-transparent"
                        }`}
                      >
                        {/* Token Number */}
                        <div className="flex-shrink-0">
                          <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center border-2 ${getTokenStyle(apt.status)} ${
                            apt.status === "in-progress" ? "ring-2 ring-purple-300 ring-offset-1" : ""
                          }`}>
                            <span className="text-lg font-black leading-none">
                              {apt.tokenNumber || "-"}
                            </span>
                            <span className="text-[9px] font-bold opacity-60 uppercase">Token</span>
                          </div>
                        </div>

                        {/* Time */}
                        <div className="min-w-[60px] text-center flex-shrink-0">
                          <div className="inline-flex flex-col items-center px-2.5 py-1.5 bg-gradient-to-b from-teal-50 to-cyan-50 rounded-xl border border-teal-100">
                            <span className="text-sm font-bold text-teal-700 leading-tight">{apt.appointmentTime || "—"}</span>
                            <span className="text-[9px] text-teal-500 font-medium">
                              {apt.appointmentTime && parseInt(apt.appointmentTime) >= 12 ? "PM" : "AM"}
                            </span>
                          </div>
                        </div>

                        {/* Patient Info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">
                              {apt.patientId?.name?.charAt(0) || "?"}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{apt.patientId?.name || "Unknown"}</p>
                            <p className="text-xs text-gray-400 truncate">{apt.patientId?.phone || ""}</p>
                          </div>
                        </div>

                        {/* Type Badge */}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium hidden sm:inline-block ${getTypeColor(apt.type)}`}>
                          {apt.type}
                        </span>

                        {/* Status Badge */}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${ss.bg} ${ss.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ss.dot}`}></span>
                          {ss.label}
                        </span>

                        {/* Action Button */}
                        <div className="flex-shrink-0">
                          {isActive && apt.patientId?._id && (
                            <Link
                              href={`/tier2/patients/${apt.patientId._id}?appointmentId=${apt._id}`}
                              className="px-3 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <span>Start Visit</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p>No appointments scheduled for today</p>
                  <p className="text-sm text-gray-400 mt-1">Appointments booked by frontdesk will appear here automatically</p>
                </div>
              )}
            </div>
          </div>
        </div>
        </>}
      </main>
    </div>
  );
}
