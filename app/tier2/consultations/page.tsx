"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Consultation {
  _id: string;
  type: "dermatology" | "cosmetology";
  consultationDate: string;
  status: string;
  patientInfo: {
    name: string;
    age: number;
    gender: string;
    complaint?: string;       // dermatology
    primaryConcern?: string;  // cosmetology
  };
  patientId?: {
    _id: string;
    patientId: string;
    name: string;
    phone: string;
  };
  diagnosis?: {
    provisional?: string;
  };
}

type FilterType = "all" | "today" | "week" | "month";
type TypeFilter = "all" | "dermatology" | "cosmetology";
type StatusFilter = "all" | "draft" | "completed";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/tier2/dashboard" },
  { label: "Patients", href: "/tier2/patients" },
  { label: "Consultations", href: "/tier2/consultations", active: true },
  { label: "Pharmacy", href: "/tier2/pharmacy" },
  { label: "Templates", href: "/tier2/templates" },
  { label: "Analytics", href: "/tier2/analytics" },
  { label: "Frontdesk", href: "/tier2/settings/frontdesk" },
];

function ConsultationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("filter") as FilterType) || "all";

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(value), 300);
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConsultations = useCallback(async (pageNum: number) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    const isFirst = pageNum === 1;
    if (isFirst) { setLoading(true); setPage(1); }
    else setLoadingMore(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) { router.push("/login"); return; }

      const params = new URLSearchParams();
      params.set("page", pageNum.toString());
      params.set("limit", "20");
      if (filter !== "all") params.set("filter", filter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);

      const response = await fetch(`/api/tier2/consultations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        const newItems = data.data.consultations;
        if (isFirst) {
          setConsultations(newItems);
        } else {
          setConsultations((prev) => [...prev, ...newItems]);
          setPage(pageNum);
        }
        setHasMore(pageNum < data.data.pagination.pages);
        setTotal(data.data.pagination.total);
      } else {
        showToast("error", data.message || "Failed to load consultations");
      }
    } catch {
      showToast("error", "Failed to load consultations");
    } finally {
      if (isFirst) setLoading(false);
      else setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [filter, typeFilter, statusFilter, search, router]);

  useEffect(() => {
    fetchConsultations(1);
  }, [fetchConsultations]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isFetchingRef.current) {
          fetchConsultations(page + 1);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, page, fetchConsultations]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Completed
          </span>
        );
      case "draft":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Draft
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            {status}
          </span>
        );
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "dermatology":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-teal-50 text-teal-700">Dermatology</span>;
      case "cosmetology":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">Cosmetology</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-600">{type}</span>;
    }
  };

  const getConsultationLink = (consultation: Consultation) => {
    if (consultation.type === "cosmetology") {
      return `/tier2/consultation/cosmetology/${consultation._id}`;
    }
    return `/tier2/consultation/${consultation._id}`;
  };

  const getInitials = (name?: string) =>
    name?.charAt(0)?.toUpperCase() || "?";

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };
  };

  const activeFiltersCount = (filter !== "all" ? 1 : 0) + (typeFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Consultations</h1>
                <p className="text-sm text-gray-500 hidden sm:block">{total} total records</p>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by patient name..."
              className="w-full pl-12 pr-10 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white text-gray-900 text-sm shadow-sm"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(""); setSearch(""); }}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Time Filter */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {(["all", "today", "week", "month"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    filter === f ? "bg-white shadow text-teal-600" : "text-gray-500 hover:bg-white/60"
                  }`}
                >
                  {f === "all" ? "All Time" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Type Filter */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {([
                { value: "all", label: "All Types" },
                { value: "dermatology", label: "Derm" },
                { value: "cosmetology", label: "Cosmo" },
              ] as { value: TypeFilter; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setTypeFilter(opt.value); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    typeFilter === opt.value
                      ? "bg-white shadow text-teal-600"
                      : "text-gray-500 hover:bg-white/60"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {([
                { value: "all", label: "All" },
                { value: "draft", label: "Draft" },
                { value: "completed", label: "Done" },
              ] as { value: StatusFilter; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    statusFilter === opt.value
                      ? "bg-white shadow text-teal-600"
                      : "text-gray-500 hover:bg-white/60"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Clear filters */}
            {activeFiltersCount > 0 && (
              <button
                onClick={() => { setFilter("all"); setTypeFilter("all"); setStatusFilter("all"); }}
                className="px-3 py-2.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-gray-200 bg-white flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear ({activeFiltersCount})
              </button>
            )}
          </div>
        </div>

        {/* Consultations List */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mx-auto mb-3"></div>
                <p className="text-sm text-gray-500">Loading consultations...</p>
              </div>
            </div>
          ) : consultations.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-700 font-semibold text-base">No consultations found</p>
              <p className="text-sm text-gray-400 mt-1">
                {searchInput || activeFiltersCount > 0
                  ? "Try adjusting your search or filters"
                  : "Start a new consultation from a patient's profile"}
              </p>
              {(searchInput || activeFiltersCount > 0) && (
                <button
                  onClick={() => { setSearchInput(""); setSearch(""); setFilter("all"); setTypeFilter("all"); setStatusFilter("all"); }}
                  className="mt-4 px-4 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="hidden md:grid md:grid-cols-12 gap-4 px-5 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <div className="col-span-3">Patient</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-3">Complaint</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-2 text-center">Status</div>
              </div>

              {/* Consultation Rows */}
              <div className="divide-y divide-gray-100">
                {consultations.map((consultation) => {
                  const { date, time } = formatDate(consultation.consultationDate);
                  return (
                    <Link
                      key={consultation._id}
                      href={getConsultationLink(consultation)}
                      className="group flex items-start gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors md:grid md:grid-cols-12 md:items-center md:gap-4 cursor-pointer"
                    >
                      {/* Patient */}
                      <div className="flex items-center gap-3 flex-1 min-w-0 md:col-span-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">
                            {getInitials(consultation.patientInfo?.name)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-teal-700 transition-colors">
                            {consultation.patientInfo?.name}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {consultation.patientInfo?.age} yrs, {consultation.patientInfo?.gender}
                            {consultation.patientId?.patientId && ` · ${consultation.patientId.patientId}`}
                          </p>
                        </div>
                      </div>

                      {/* Type */}
                      <div className="hidden md:block md:col-span-2">
                        {getTypeBadge(consultation.type)}
                      </div>

                      {/* Complaint */}
                      <div className="hidden md:block md:col-span-3">
                        <p className="text-sm text-gray-600 truncate max-w-[220px]">
                          {consultation.patientInfo?.complaint || consultation.patientInfo?.primaryConcern || (
                            <span className="text-gray-300 italic">No complaint noted</span>
                          )}
                        </p>
                        {consultation.diagnosis?.provisional && (
                          <p className="text-xs text-gray-400 truncate max-w-[220px] mt-0.5">
                            Dx: {consultation.diagnosis.provisional}
                          </p>
                        )}
                      </div>

                      {/* Date */}
                      <div className="hidden md:block md:col-span-2">
                        <p className="text-sm text-gray-700">{date}</p>
                        <p className="text-xs text-gray-400">{time}</p>
                      </div>

                      {/* Status */}
                      <div className="hidden md:flex md:col-span-2 justify-center">
                        {getStatusBadge(consultation.status)}
                      </div>

                      {/* Mobile: type + status badges */}
                      <div className="flex items-center gap-2 md:hidden flex-wrap">
                        {getTypeBadge(consultation.type)}
                        {getStatusBadge(consultation.status)}
                        <span className="text-xs text-gray-400 ml-auto">{date}</span>
                      </div>

                      {/* Mobile arrow */}
                      <div className="flex-shrink-0 md:hidden">
                        <svg className="w-5 h-5 text-gray-300 group-hover:text-teal-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="px-5 py-3 border-t bg-gray-50 flex items-center justify-center min-h-[48px]">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600" />
                    Loading more...
                  </div>
                ) : hasMore ? null : consultations.length > 0 ? (
                  <p className="text-xs text-gray-400">{total} consultations total</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border ${
            toast.type === "success" ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-red-200 text-red-700"
          }`}>
            {toast.type === "success" ? (
              <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConsultationsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <ConsultationsPageInner />
    </Suspense>
  );
}
