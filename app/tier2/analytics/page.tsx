"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface TrendDay {
  date: string;
  derm: number;
  cos: number;
}

interface AnalyticsData {
  quickStats: {
    totalConsultations: number;
    thisMonth: number;
    today: number;
    uniquePatients: number;
    returnRate: number;
    dermCount: number;
    cosCount: number;
  };
  trend: TrendDay[];
  specialtySplit: { derm: number; cos: number };
  topConditions: { condition: string; count: number }[];
  demographics: {
    gender: Record<string, number>;
    ageGroups: { label: string; count: number }[];
  };
  pharmacy: {
    thisMonth: { totalRevenue: number; collectedAmount: number; pendingAmount: number; salesCount: number };
    today: { count: number; amount: number };
    paymentMethods: { _id: string; count: number; amount: number }[];
    topItems: { _id: string; qty: number; revenue: number }[];
    inventory: { total: number; lowStock: number; outOfStock: number };
  } | null;
  aiUsage: {
    reports: number;
    translations: number;
    patientSummaries: number;
    cost: { reports: number; translations: number; patientSummaries: number; total: number };
    pricing: { report: number; translation: number; patientSummary: number };
  };
  range: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Dashboard",    href: "/tier2/dashboard" },
  { label: "Patients",     href: "/tier2/patients" },
  { label: "Consultations",href: "/tier2/consultations" },
  { label: "Pharmacy",     href: "/tier2/pharmacy" },
  { label: "Templates",    href: "/tier2/templates" },
  { label: "Analytics",    href: "/tier2/analytics", active: true },
  { label: "Frontdesk",    href: "/tier2/settings/frontdesk" },
];

const CHART_H = 140; // px

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, range: number): string {
  const d = new Date(dateStr + "T00:00:00");
  if (range <= 7) {
    return d.toLocaleDateString("en-IN", { weekday: "short" }) + " " + d.getDate();
  }
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-xl ${className ?? ""}`} />;
}

function SkeletonPage() {
  return (
    <div className="space-y-6">
      {/* welcome */}
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Pulse className="h-8 w-52" />
          <Pulse className="h-4 w-72" />
        </div>
        <Pulse className="h-10 w-52" />
      </div>

      {/* quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-lg p-5 border-l-4 border-gray-200">
            <Pulse className="h-3 w-28 mb-3 rounded" />
            <Pulse className="h-9 w-16 mb-1 rounded" />
            <Pulse className="h-3 w-36 rounded" />
          </div>
        ))}
      </div>

      {/* charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <Pulse className="h-5 w-40 mb-5 rounded" />
          <Pulse className="h-40 w-full rounded-xl" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <Pulse className="h-5 w-32 mb-6 rounded" />
          <Pulse className="h-40 w-40 rounded-full mx-auto mb-5" />
          <Pulse className="h-4 w-full rounded mb-2" />
          <Pulse className="h-4 w-3/4 rounded" />
        </div>
      </div>

      {/* bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            <Pulse className="h-5 w-36 rounded" />
            {[...Array(5)].map((_, j) => (
              <div key={j}>
                <Pulse className="h-3 w-full mb-1 rounded" />
                <Pulse className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* AI costs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <Pulse className="h-5 w-40 mb-5 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <Pulse key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter();
  const [user, setUser]             = useState<{ name: string; clinicName: string } | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData]             = useState<AnalyticsData | null>(null);
  const [range, setRange]           = useState<7 | 30 | 90 | 180>(30);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hoveredDay, setHoveredDay] = useState<TrendDay | null>(null);
  const [showPricingInfo, setShowPricingInfo] = useState(false);

  const fetchAnalytics = useCallback(async (r: number, isRefresh = false) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    try {
      const res  = await fetch(`/api/tier2/analytics?range=${r}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data as AnalyticsData);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("[Analytics] fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const token    = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (!token || !userData) { router.push("/login"); return; }
    const parsed = JSON.parse(userData);
    setUser(parsed);
    if (parsed.tier !== "tier2") { router.push("/dashboard"); return; }
    fetchAnalytics(range);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRangeChange = (r: 7 | 30 | 90 | 180) => {
    if (r === range || loading) return;
    setRange(r);
    setLoading(true);
    fetchAnalytics(r);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const thisPeriod = data ? data.trend.reduce((sum, d) => sum + d.derm + d.cos, 0) : 0;
  const maxTrend   = data ? Math.max(...data.trend.map(d => d.derm + d.cos), 1) : 1;
  const totalSpec  = data ? data.specialtySplit.derm + data.specialtySplit.cos : 0;
  const dermPct    = totalSpec > 0 ? (data!.specialtySplit.derm / totalSpec) * 100 : 50;
  const cosPct     = 100 - dermPct;
  const maxCond    = data ? Math.max(...data.topConditions.map(c => c.count), 1) : 1;
  const maxAge     = data ? Math.max(...data.demographics.ageGroups.map(g => g.count), 1) : 1;
  const totalGender = data ? Object.values(data.demographics.gender).reduce((a, b) => a + b, 0) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">

      {/* ── Header ── */}
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
                <h1 className="text-2xl font-bold text-gray-900">{user?.clinicName ?? "DermaCloud"}</h1>
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

      {/* ── Nav ── */}
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

      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <SkeletonPage />
        ) : (
          <>
            {/* ── Welcome Row ── */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Practice Analytics</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Dr. {user?.name}
                  {lastUpdated && (
                    <span className="text-gray-400 ml-2">
                      · Updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      <span className="ml-1 text-[11px]">(cached 10 min)</span>
                    </span>
                  )}
                </p>
              </div>

              {/* Range + Refresh */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
                  {([7, 30, 90, 180] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRangeChange(r)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        range === r
                          ? "bg-white text-teal-700 shadow-sm font-semibold"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {r === 180 ? "6M" : `${r}D`}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => fetchAnalytics(range, true)}
                  disabled={refreshing}
                  title="Refresh data"
                  className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-teal-600 hover:border-teal-300 transition-all disabled:opacity-40 shadow-sm"
                >
                  <svg
                    className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Block 1: Quick Stats ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-6">
              {/* Total */}
              <div className="bg-white rounded-xl shadow-lg p-5 border-l-4 border-teal-500">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wide">Total Consultations</h3>
                  <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{data!.quickStats.totalConsultations.toLocaleString()}</p>
                <p className="mt-1 text-xs text-gray-500">{data!.quickStats.dermCount} derm · {data!.quickStats.cosCount} cosm</p>
              </div>

              {/* This Period */}
              <div className="bg-white rounded-xl shadow-lg p-5 border-l-4 border-blue-500">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wide">
                    Last {range === 180 ? "6 Months" : `${range} Days`}
                  </h3>
                  <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{thisPeriod}</p>
                <p className="mt-1 text-xs text-gray-500">in selected period</p>
              </div>

              {/* Today */}
              <div className="bg-white rounded-xl shadow-lg p-5 border-l-4 border-purple-500">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wide">Today</h3>
                  <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{data!.quickStats.today}</p>
                <p className="mt-1 text-xs text-gray-500">consultations today</p>
              </div>

              {/* Unique Patients */}
              <div className="bg-white rounded-xl shadow-lg p-5 border-l-4 border-amber-500">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wide">Unique Patients</h3>
                  <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{data!.quickStats.uniquePatients.toLocaleString()}</p>
                <p className="mt-1 text-xs text-gray-500">{data!.quickStats.returnRate}% return rate</p>
              </div>
            </div>

            {/* ── Block 2+3: Trend Chart + Specialty Split ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">

              {/* Trend Chart */}
              <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Consultation Trend</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Last {range} days</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-[2px] bg-teal-500 inline-block" />
                      Dermatology
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-[2px] bg-purple-400 inline-block" />
                      Cosmetology
                    </span>
                  </div>
                </div>

                {data!.trend.every(d => d.derm === 0 && d.cos === 0) ? (
                  <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                    No consultations in this period
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      {/* Bars */}
                      <div
                        className="flex items-end gap-[2px]"
                        style={{
                          height: `${CHART_H}px`,
                          minWidth: `${Math.max(data!.trend.length * (range <= 7 ? 44 : range <= 30 ? 22 : 12), 300)}px`,
                        }}
                      >
                        {data!.trend.map((day) => {
                          const total    = day.derm + day.cos;
                          const barH     = maxTrend > 0 ? Math.round((total / maxTrend) * CHART_H) : 0;
                          const dermBarH = total > 0 ? Math.round((day.derm / total) * barH) : 0;
                          const cosBarH  = barH - dermBarH;
                          const isHovered = hoveredDay?.date === day.date;

                          return (
                            <div
                              key={day.date}
                              className="flex-1 flex flex-col justify-end items-center cursor-default"
                              style={{ height: `${CHART_H}px` }}
                              onMouseEnter={() => setHoveredDay(day)}
                              onMouseLeave={() => setHoveredDay(null)}
                            >
                              {/* Stacked bars */}
                              <div className={`w-full flex flex-col transition-opacity ${isHovered ? "opacity-60" : "opacity-100"}`}>
                                {cosBarH > 0 && (
                                  <div
                                    className="w-full bg-purple-400"
                                    style={{ height: `${cosBarH}px` }}
                                  />
                                )}
                                {dermBarH > 0 && (
                                  <div
                                    className="w-full bg-teal-500 rounded-t-[1px]"
                                    style={{ height: `${dermBarH}px` }}
                                  />
                                )}
                                {total === 0 && (
                                  <div className="w-full bg-gray-100 rounded" style={{ height: "2px" }} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* X-axis labels */}
                      <div
                        className="flex mt-2 gap-[2px]"
                        style={{ minWidth: `${Math.max(data!.trend.length * (range <= 7 ? 44 : range <= 30 ? 22 : 12), 300)}px` }}
                      >
                        {data!.trend.map((day, i) => {
                          const every = range <= 7 ? 1 : range <= 30 ? 5 : range <= 90 ? 10 : 21;
                          const show  = i % every === 0 || i === data!.trend.length - 1;
                          return (
                            <div key={day.date} className="flex-1 text-center">
                              {show && (
                                <span className="text-[9px] text-gray-400 leading-none">
                                  {formatDate(day.date, range)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Hover info bar — outside overflow-x-auto so it never clips */}
                    <div className="mt-3 h-8 flex items-center">
                      {hoveredDay ? (
                        <div className="flex items-center gap-4 text-xs">
                          <span className="font-semibold text-gray-700">{formatDate(hoveredDay.date, range)}</span>
                          <span className="flex items-center gap-1.5 text-teal-700">
                            <span className="w-2.5 h-2.5 bg-teal-500 rounded-[2px] inline-block" />
                            Derm: <strong>{hoveredDay.derm}</strong>
                          </span>
                          <span className="flex items-center gap-1.5 text-purple-700">
                            <span className="w-2.5 h-2.5 bg-purple-400 rounded-[2px] inline-block" />
                            Cosm: <strong>{hoveredDay.cos}</strong>
                          </span>
                          <span className="text-gray-500">
                            Total: <strong className="text-gray-700">{hoveredDay.derm + hoveredDay.cos}</strong>
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">Hover over a bar to see details</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Specialty Split */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
                <h3 className="text-base font-semibold text-gray-900 mb-0.5">Specialty Split</h3>
                <p className="text-xs text-gray-400 mb-5">All time</p>

                {totalSpec === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    No consultation data yet
                  </div>
                ) : (
                  <>
                    {/* Donut */}
                    <div className="relative w-40 h-40 mx-auto mb-5">
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: `conic-gradient(#14b8a6 0% ${dermPct}%, #a855f7 ${dermPct}% 100%)`,
                        }}
                      />
                      <div className="absolute inset-[20px] rounded-full bg-white flex flex-col items-center justify-center shadow-inner">
                        <p className="text-xl font-bold text-gray-900">{Math.round(dermPct)}%</p>
                        <p className="text-[10px] text-teal-600 font-medium">Derm</p>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="w-3 h-3 rounded-[2px] bg-teal-500 flex-shrink-0" />
                          Dermatology
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {data!.specialtySplit.derm} <span className="text-gray-400 font-normal">({Math.round(dermPct)}%)</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="w-3 h-3 rounded-[2px] bg-purple-400 flex-shrink-0" />
                          Cosmetology
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {data!.specialtySplit.cos} <span className="text-gray-400 font-normal">({Math.round(cosPct)}%)</span>
                        </span>
                      </div>
                    </div>

                    {/* Return rate */}
                    <div className="mt-5 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1.5">Patient Return Rate</p>
                      <div className="flex items-baseline gap-2 mb-2">
                        <p className="text-2xl font-bold text-gray-900">{data!.quickStats.returnRate}%</p>
                        <p className="text-xs text-gray-400">of patients revisit</p>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-400 to-teal-600 rounded-full transition-all duration-700"
                          style={{ width: `${data!.quickStats.returnRate}%` }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Block 4+5: Top Conditions + Demographics ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

              {/* Top Diagnoses */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-0.5">Top Diagnoses</h3>
                <p className="text-xs text-gray-400 mb-5">Dermatology · All time</p>

                {data!.topConditions.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                    No diagnosis data yet
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {data!.topConditions.map(({ condition, count }, i) => (
                      <div key={condition}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-700 font-medium truncate pr-2">
                            <span className="text-[11px] text-gray-400 mr-1.5 font-normal">#{i + 1}</span>
                            {condition}
                          </span>
                          <span className="text-[11px] font-semibold text-gray-500 flex-shrink-0 bg-gray-100 px-2 py-0.5 rounded-full">
                            {count}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${(count / maxCond) * 100}%`,
                              background: "linear-gradient(90deg, #14b8a6, #0891b2)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Demographics */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-0.5">Patient Demographics</h3>
                <p className="text-xs text-gray-400 mb-5">All consultations combined</p>

                {/* Gender */}
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Gender</p>
                <div className="grid grid-cols-3 gap-2.5 mb-6">
                  {[
                    { key: "male",   label: "Male",   color: "text-blue-700  bg-blue-50  border-blue-100"  },
                    { key: "female", label: "Female", color: "text-pink-700  bg-pink-50  border-pink-100"  },
                    { key: "other",  label: "Other",  color: "text-gray-600  bg-gray-50  border-gray-100"  },
                  ].map(({ key, label, color }) => {
                    const rawCount = key === "other"
                      ? Math.max(0, totalGender - (data!.demographics.gender.male ?? 0) - (data!.demographics.gender.female ?? 0))
                      : (data!.demographics.gender[key] ?? 0);
                    const pct = totalGender > 0 ? Math.round((rawCount / totalGender) * 100) : 0;
                    return (
                      <div key={key} className={`rounded-xl p-3 text-center border ${color}`}>
                        <p className="text-2xl font-bold">{rawCount}</p>
                        <p className="text-[10px] font-medium mt-0.5 opacity-80">{label}</p>
                        <p className="text-[10px] opacity-60 mt-0.5">{pct}%</p>
                      </div>
                    );
                  })}
                </div>

                {/* Age Groups */}
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Age Groups</p>
                <div className="space-y-2.5">
                  {data!.demographics.ageGroups.map(({ label, count }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-700 font-medium">{label}</span>
                        <span className="text-xs text-gray-500 font-semibold">{count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${maxAge > 0 ? (count / maxAge) * 100 : 0}%`,
                            background: "linear-gradient(90deg, #f59e0b, #f97316)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Block 6: AI Usage & Cost ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-900">AI Usage &amp; Cost</h3>
                    <button
                      onClick={() => setShowPricingInfo(true)}
                      className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 hover:bg-teal-100 hover:text-teal-600 text-xs font-bold flex items-center justify-center transition-colors flex-shrink-0"
                      title="How are prices calculated?"
                    >?</button>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Current month · Billed per use</p>
                </div>
                {data!.aiUsage.cost.total > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400 mb-0.5">This Month&apos;s Total</p>
                    <p className="text-2xl font-bold text-gray-900">{formatINR(data!.aiUsage.cost.total)}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                {/* AI Report Summary */}
                <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-white p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">AI Report Summary</p>
                      <p className="text-[10px] text-gray-400">{formatINR(data!.aiUsage.pricing.report)} / report</p>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{data!.aiUsage.reports}</p>
                  <p className="text-xs text-gray-500 mt-0.5">AI explanations generated</p>
                  <div className="mt-4 pt-3 border-t border-blue-100 flex items-baseline justify-between">
                    <p className="text-base font-bold text-blue-700">{formatINR(data!.aiUsage.cost.reports)}</p>
                    <p className="text-[10px] text-gray-400">total billed</p>
                  </div>
                </div>

                {/* Translations */}
                <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/60 to-white p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Translations</p>
                      <p className="text-[10px] text-gray-400">{formatINR(data!.aiUsage.pricing.translation)} / translation</p>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{data!.aiUsage.translations}</p>
                  <p className="text-xs text-gray-500 mt-0.5">translations done</p>
                  <div className="mt-4 pt-3 border-t border-amber-100 flex items-baseline justify-between">
                    <p className="text-base font-bold text-amber-700">{formatINR(data!.aiUsage.cost.translations)}</p>
                    <p className="text-[10px] text-gray-400">total billed</p>
                  </div>
                </div>

                {/* Patient AI Summary */}
                <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Patient AI Summary</p>
                      <p className="text-[10px] text-gray-400">{formatINR(data!.aiUsage.pricing.patientSummary)} / summary</p>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{data!.aiUsage.patientSummaries}</p>
                  <p className="text-xs text-gray-500 mt-0.5">patient briefings generated</p>
                  <div className="mt-4 pt-3 border-t border-emerald-100 flex items-baseline justify-between">
                    <p className="text-base font-bold text-emerald-700">{formatINR(data!.aiUsage.cost.patientSummaries)}</p>
                    <p className="text-[10px] text-gray-400">total billed</p>
                  </div>
                </div>
              </div>

              {data!.aiUsage.reports === 0 && data!.aiUsage.translations === 0 && data!.aiUsage.patientSummaries === 0 && (
                <p className="text-center text-sm text-gray-400 mt-5">No AI features used yet this month</p>
              )}
            </div>

            {/* ── Block 7: Pharmacy & Sales ── */}
            {data!.pharmacy ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Pharmacy &amp; Sales</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Current month</p>
                  </div>
                  <Link
                    href="/tier2/pharmacy"
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 transition-colors"
                  >
                    View Pharmacy
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>

                {/* Revenue stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="rounded-xl bg-gradient-to-br from-green-50 to-white border border-green-100 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">{formatINR(data!.pharmacy.thisMonth.totalRevenue)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{data!.pharmacy.thisMonth.salesCount} sale{data!.pharmacy.thisMonth.salesCount !== 1 ? "s" : ""} this month</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-teal-50 to-white border border-teal-100 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 mb-1">Collected</p>
                    <p className="text-2xl font-bold text-gray-900">{formatINR(data!.pharmacy.thisMonth.collectedAmount)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">amount received</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-red-50 to-white border border-red-100 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500 mb-1">Pending Due</p>
                    <p className="text-2xl font-bold text-gray-900">{formatINR(data!.pharmacy.thisMonth.pendingAmount)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">outstanding balance</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-purple-50 to-white border border-purple-100 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 mb-1">Today&apos;s Sales</p>
                    <p className="text-2xl font-bold text-gray-900">{formatINR(data!.pharmacy.today.amount)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{data!.pharmacy.today.count} transaction{data!.pharmacy.today.count !== 1 ? "s" : ""}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Items */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-4">Top Items (by qty sold)</p>
                    {data!.pharmacy.topItems.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">No sales this month</p>
                    ) : (
                      <div className="space-y-3">
                        {(() => {
                          const maxQty = Math.max(...data!.pharmacy!.topItems.map(t => t.qty), 1);
                          return data!.pharmacy!.topItems.map((item, i) => (
                            <div key={item._id}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-gray-700 font-medium truncate pr-3">
                                  <span className="text-[11px] text-gray-400 mr-1.5 font-normal">#{i + 1}</span>
                                  {item._id}
                                </span>
                                <span className="text-[11px] text-gray-500 flex-shrink-0 flex items-center gap-2">
                                  <span className="bg-gray-100 px-2 py-0.5 rounded-full font-semibold">{item.qty} units</span>
                                  <span className="text-green-600 font-semibold">{formatINR(item.revenue)}</span>
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${(item.qty / maxQty) * 100}%`,
                                    background: "linear-gradient(90deg, #10b981, #059669)",
                                  }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Payment Methods + Inventory */}
                  <div className="space-y-5">
                    {/* Payment Methods */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Payment Methods</p>
                      {data!.pharmacy.paymentMethods.length === 0 ? (
                        <p className="text-sm text-gray-400">No data</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {data!.pharmacy.paymentMethods.map((pm) => {
                            const methodLabel: Record<string, string> = {
                              cash: "Cash", card: "Card", upi: "UPI",
                              insurance: "Insurance", credit: "Credit",
                            };
                            const methodColor: Record<string, string> = {
                              cash: "bg-green-50 border-green-100 text-green-700",
                              card: "bg-blue-50 border-blue-100 text-blue-700",
                              upi: "bg-violet-50 border-violet-100 text-violet-700",
                              insurance: "bg-amber-50 border-amber-100 text-amber-700",
                              credit: "bg-red-50 border-red-100 text-red-700",
                            };
                            const colorClass = methodColor[pm._id] ?? "bg-gray-50 border-gray-100 text-gray-700";
                            return (
                              <div key={pm._id} className={`rounded-xl border p-3 ${colorClass}`}>
                                <p className="text-xs font-semibold capitalize">{methodLabel[pm._id] ?? pm._id}</p>
                                <p className="text-base font-bold mt-0.5">{formatINR(pm.amount)}</p>
                                <p className="text-[10px] opacity-70 mt-0.5">{pm.count} transaction{pm.count !== 1 ? "s" : ""}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Inventory snapshot */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Inventory Snapshot</p>
                      <div className="flex gap-3">
                        <div className="flex-1 rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                          <p className="text-xl font-bold text-gray-900">{data!.pharmacy.inventory.total}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">Active items</p>
                        </div>
                        <div className={`flex-1 rounded-xl border p-3 text-center ${data!.pharmacy.inventory.lowStock > 0 ? "bg-amber-50 border-amber-100" : "bg-gray-50 border-gray-100"}`}>
                          <p className={`text-xl font-bold ${data!.pharmacy.inventory.lowStock > 0 ? "text-amber-600" : "text-gray-900"}`}>
                            {data!.pharmacy.inventory.lowStock}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${data!.pharmacy.inventory.lowStock > 0 ? "text-amber-600" : "text-gray-500"}`}>
                            Low stock
                          </p>
                        </div>
                        <div className={`flex-1 rounded-xl border p-3 text-center ${data!.pharmacy.inventory.outOfStock > 0 ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
                          <p className={`text-xl font-bold ${data!.pharmacy.inventory.outOfStock > 0 ? "text-red-600" : "text-gray-900"}`}>
                            {data!.pharmacy.inventory.outOfStock}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${data!.pharmacy.inventory.outOfStock > 0 ? "text-red-600" : "text-gray-500"}`}>
                            Out of stock
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Footer note */}
            <p className="text-center text-xs text-gray-400 pb-4">
              Analytics refresh every 10 minutes · AI prices include service markup
            </p>
          </>
        )}
      </main>

      {/* ── Pricing Info Modal ── */}
      {showPricingInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowPricingInfo(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-base font-semibold text-gray-900">How AI Pricing Works</h4>
              <button
                onClick={() => setShowPricingInfo(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
              >✕</button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                <p className="font-semibold text-blue-800 mb-1">AI Report Summary — ₹8 / report</p>
                <p className="text-blue-700 text-xs leading-relaxed">
                  Charged each time an AI explanation is generated for a consultation report (the &quot;Generate AI Explanation&quot; button on a consultation).
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                <p className="font-semibold text-amber-800 mb-1">Translations — ₹18 / translation</p>
                <p className="text-amber-700 text-xs leading-relaxed">
                  Charged each time a consultation report is translated to Hindi or Kannada. Each language is counted separately — translating one report to both languages counts as 2 translations.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <p className="font-semibold text-emerald-800 mb-1">Patient AI Summary — ₹3 / click</p>
                <p className="text-emerald-700 text-xs leading-relaxed">
                  Charged each time you click "Generate AI Summary" on a patient&apos;s history page. This generates a personalised briefing of the patient&apos;s visit history to help you prepare before the consultation.
                </p>
              </div>

              <p className="text-xs text-gray-400 pt-1 border-t border-gray-100 leading-relaxed">
                ⚠️ All prices shown include a service markup. Prices are subject to change — you will be notified in advance of any updates.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
