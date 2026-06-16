"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ConsentRow {
  _id: string;
  templateTitle: string;
  isMinor: boolean;
  signedAt: string;
  patientSnapshot: {
    name: string;
    patientCode?: string;
    phone?: string;
    age?: number;
    gender?: string;
  };
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/clinic/dashboard" },
  { label: "Patients", href: "/clinic/patients" },
  { label: "Consultations", href: "/clinic/consultations" },
  { label: "Pharmacy", href: "/clinic/pharmacy" },
  { label: "Consent Forms", href: "/clinic/consent-forms", active: true },
  { label: "Templates", href: "/clinic/templates" },
  { label: "Analytics", href: "/clinic/analytics" },
  { label: "Frontdesk", href: "/clinic/settings/frontdesk" },
];

function fmtDate(d: string): string {
  try {
    const date = new Date(d);
    const time = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
    const dayKey = (x: Date) =>
      x.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    if (dayKey(date) === dayKey(now)) return `Today · ${time}`;
    if (dayKey(date) === dayKey(yesterday)) return `Yesterday · ${time}`;
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  } catch {
    return "—";
  }
}

export default function ConsentFormsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 300);
  };

  const fetchRecords = useCallback(
    async (pageNum: number) => {
      const isFirst = pageNum === 1;
      if (isFirst) setLoading(true);
      else setLoadingMore(true);
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/login");
          return;
        }
        const params = new URLSearchParams({ page: String(pageNum), limit: "20" });
        if (search) params.set("search", search);

        const res = await fetch(`/api/tier2/consent/records?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          const items: ConsentRow[] = data.data.records;
          setRecords((prev) => (isFirst ? items : [...prev, ...items]));
          setPage(pageNum);
          setHasMore(pageNum < data.data.pagination.totalPages);
          setTotal(data.data.pagination.total);
        } else {
          showToast("error", data.message || "Failed to load consent forms");
        }
      } catch {
        showToast("error", "Failed to load consent forms");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [router, search]
  );

  useEffect(() => {
    fetchRecords(1);
  }, [fetchRecords]);

  const openPdf = async (id: string) => {
    setOpening(id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/tier2/consent/records/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data.pdfUrl) {
        window.open(data.data.pdfUrl, "_blank", "noopener,noreferrer");
      } else {
        showToast("error", "Signed PDF not available");
      }
    } catch {
      showToast("error", "Failed to open PDF");
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Consent Forms</h1>
                <p className="text-sm text-gray-500 hidden sm:block">{total} signed</p>
              </div>
            </div>
            <Link
              href="/clinic/consent-forms/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-semibold text-sm hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              New Consent
            </Link>
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Search */}
        <div className="relative mb-6">
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by patient name, ID, phone or procedure..."
            className="w-full border border-gray-200 bg-white rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 outline-none shadow-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-teal-600" />
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center">
            <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-900 font-semibold mb-1">{search ? "No matching consent forms" : "No consent forms yet"}</p>
            <p className="text-sm text-gray-500 mb-5">{search ? "Try a different search." : "Create the first signed consent for a patient."}</p>
            {!search && (
              <Link
                href="/clinic/consent-forms/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                New Consent
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              {records.map((r, i) => (
                <button
                  key={r._id}
                  type="button"
                  onClick={() => openPdf(r._id)}
                  disabled={opening === r._id}
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                  className="group w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3.5 flex items-center gap-4 hover:border-teal-300 hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60 animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-bold shrink-0 shadow-sm">
                    {r.patientSnapshot.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm truncate">{r.patientSnapshot.name}</span>
                      {r.patientSnapshot.patientCode && (
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{r.patientSnapshot.patientCode}</span>
                      )}
                      {r.isMinor && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">MINOR</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 truncate mt-0.5">{r.templateTitle}</p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end text-right shrink-0">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Signed
                    </span>
                    <span className="text-xs text-gray-400 mt-0.5">{fmtDate(r.signedAt)}</span>
                  </div>
                  <div className="shrink-0 text-gray-300 group-hover:text-teal-500 transition-colors">
                    {opening === r._id ? (
                      <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {hasMore && (
              <div className="text-center mt-6">
                <button
                  onClick={() => fetchRecords(page + 1)}
                  disabled={loadingMore}
                  className="px-5 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border ${
              toast.type === "success" ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-red-200 text-red-700"
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
