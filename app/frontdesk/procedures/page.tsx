"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Procedure {
  _id: string;
  name: string;
  category: string;
  basePrice: number;
  gstRate: number;
  description?: string;
  isActive: boolean;
}

const inr = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const CATEGORY_STYLES: Record<string, string> = {
  laser: "bg-violet-50 text-violet-700 border-violet-200",
  peel: "bg-pink-50 text-pink-700 border-pink-200",
  injectable: "bg-rose-50 text-rose-700 border-rose-200",
  facial: "bg-amber-50 text-amber-700 border-amber-200",
  body: "bg-sky-50 text-sky-700 border-sky-200",
  hair: "bg-indigo-50 text-indigo-700 border-indigo-200",
  skin: "bg-teal-50 text-teal-700 border-teal-200",
  other: "bg-gray-50 text-gray-700 border-gray-200",
};

export default function FrontdeskProceduresPage() {
  const router = useRouter();
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const handleLogout = () => {
    localStorage.removeItem("frontdeskToken");
    localStorage.removeItem("frontdeskStaff");
    router.push("/frontdesk/login");
  };

  const fetchProcedures = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("frontdeskToken");
    if (!token) return;
    try {
      const res = await fetch("/api/tier2/cosmetology-procedures?active=false", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) setProcedures(data.data || []);
    } catch (e) {
      console.error("Failed to load procedures:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("frontdeskToken");
    const staffData = localStorage.getItem("frontdeskStaff");
    if (!token || !staffData) {
      router.push("/frontdesk/login");
      return;
    }
    try {
      setStaff(JSON.parse(staffData));
    } catch {}
    fetchProcedures();
  }, [router, fetchProcedures]);

  // Derived
  const filtered = procedures
    .filter((p) => p.isActive)
    .filter((p) => (categoryFilter === "all" ? true : p.category === categoryFilter))
    .filter((p) =>
      search.trim()
        ? p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          (p.description || "").toLowerCase().includes(search.trim().toLowerCase())
        : true
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const categories = Array.from(new Set(procedures.filter((p) => p.isActive).map((p) => p.category))).sort();

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
                <h1 className="text-2xl font-bold text-gray-900">{staff?.clinicName || "Clinic"}</h1>
                <p className="text-base text-gray-500 hidden sm:block">Frontdesk · {staff?.name}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            <Link href="/frontdesk/dashboard" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">Dashboard</Link>
            {staff?.permissions?.appointments && (
              <Link href="/frontdesk/appointments" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">Appointments</Link>
            )}
            {staff?.permissions?.patients && (
              <Link href="/frontdesk/patients" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">Patients</Link>
            )}
            {staff?.permissions?.pharmacy && (
              <Link href="/frontdesk/pharmacy" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">Pharmacy</Link>
            )}
            {staff?.permissions?.sales && (
              <Link href="/frontdesk/sales" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">Sales</Link>
            )}
            <Link href="/frontdesk/procedures" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors relative text-teal-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-teal-600 after:rounded-full">
              Procedures
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Procedure Price List</h2>
            <p className="text-sm text-gray-500 mt-0.5">All cosmetology procedures offered at this clinic</p>
          </div>
          <span className="text-sm text-gray-500">{filtered.length} procedure{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Search + category filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or description…"
              className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
            />
            <svg className="w-4 h-4 text-gray-400 absolute top-1/2 left-3.5 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                categoryFilter === "all" ? "bg-teal-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors capitalize ${
                  categoryFilter === c ? "bg-teal-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
                <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-700 font-semibold text-lg">
                {search.trim() ? `No procedures match "${search}"` : "No procedures listed yet"}
              </p>
              <p className="text-gray-400 text-base mt-1">
                {search.trim() ? "Try a different search term" : "Ask your doctor to add procedures from the clinic side"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "100px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "140px" }} />
                </colgroup>
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Procedure</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Base Price</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">GST %</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">GST Amount</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((p) => {
                    const gstAmount = (p.basePrice * p.gstRate) / 100;
                    const total = p.basePrice + gstAmount;
                    return (
                      <tr key={p._id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-gray-900">{p.name}</p>
                          {p.description && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{p.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border capitalize ${CATEGORY_STYLES[p.category] || CATEGORY_STYLES.other}`}>
                            {p.category}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right text-gray-700">{inr(p.basePrice)}</td>
                        <td className="px-4 py-3.5 text-right text-gray-600">{p.gstRate}%</td>
                        <td className="px-4 py-3.5 text-right text-gray-600">{inr(gstAmount)}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-teal-700">{inr(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
