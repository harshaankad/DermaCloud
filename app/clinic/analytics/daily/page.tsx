"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Row {
  _id: string;
  tokenNumber?: number;
  patientName: string;
  patientId?: string;
  appointmentTime?: string;
  status?: string;
  paymentMode?: string;
  fee: number;
}

interface ProcedureRow extends Row {
  basePrice: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
}

interface ProcedureGroup {
  procedureName: string;
  count: number;
  baseTotal: number;
  gstTotal: number;
  revenue: number;
  instances: ProcedureRow[];
}

interface DailyRevenue {
  date: string;
  consultations: { count: number; total: number; items: Row[] };
  followUps: { count: number; total: number; items: Row[] };
  procedures: { count: number; total: number; groups: ProcedureGroup[] };
  paymentTotals: Record<string, { count: number; total: number }>;
  grandTotal: number;
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/clinic/dashboard" },
  { label: "Patients", href: "/clinic/patients" },
  { label: "Consultations", href: "/clinic/consultations" },
  { label: "Pharmacy", href: "/clinic/pharmacy" },
  { label: "Consent Forms", href: "/clinic/consent-forms" },
  { label: "Templates", href: "/clinic/templates" },
  { label: "Analytics", href: "/clinic/analytics", active: true },
  { label: "Frontdesk", href: "/clinic/settings/frontdesk" },
];

const inr = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function DailyRevenuePage() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DailyRevenue | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    try {
      const u = localStorage.getItem("user");
      if (u) setUser(JSON.parse(u));
    } catch {}
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/auth/login");
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) { router.push("/auth/login"); return; }
    try {
      const res = await fetch(`/api/tier2/analytics/daily-revenue?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error("Daily revenue fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [date, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
              <Link href="/clinic/profile">
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

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Sub-header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Daily Revenue</h2>
            <p className="text-sm text-gray-500 mt-0.5">Per-patient breakdown of the day&apos;s earnings</p>
          </div>
          <Link href="/clinic/analytics" className="text-sm text-teal-600 hover:underline font-medium">← Back to Analytics</Link>
        </div>

        {/* Date picker + grand total */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white"
            />
            <button
              onClick={() => setDate(new Date().toISOString().split("T")[0])}
              className="px-3 py-2 text-sm text-teal-600 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 font-medium"
            >
              Today
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-teal-200 px-5 py-3 shadow-sm">
            <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">Grand Total</p>
            <p className="text-3xl font-black text-teal-700">{loading ? "…" : inr(data?.grandTotal || 0)}</p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-gray-400">
            Loading daily revenue…
          </div>
        ) : !data || data.grandTotal === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <p className="text-gray-700 font-semibold text-lg">No revenue recorded for this date</p>
            <p className="text-gray-400 text-base mt-1">Walk-ins registered by frontdesk will appear here</p>
          </div>
        ) : (
          <>
            {/* Payment-mode summary */}
            {data.paymentTotals && Object.keys(data.paymentTotals).length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-gray-50 to-gray-50/40">
                  <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-gray-400 to-gray-500" />
                  <h2 className="text-sm font-bold text-gray-800">By payment mode</h2>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {(["cash", "card", "upi", "insurance", "credit", "unspecified"] as const).map((m) => {
                    const v = data.paymentTotals[m];
                    if (!v) return null;
                    const label = m === "unspecified" ? "Unspecified" : m.charAt(0).toUpperCase() + m.slice(1);
                    return (
                      <div key={m} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                        <p className="text-lg font-black text-gray-900 mt-0.5">{inr(v.total)}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{v.count} visit{v.count !== 1 ? "s" : ""}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Consultations */}
            <SectionCard
              title="New Consultations"
              color="teal"
              count={data.consultations.count}
              total={data.consultations.total}
            >
              {data.consultations.items.length === 0 ? (
                <EmptyRow />
              ) : (
                <Table>
                  <colgroup>
                    <col style={{ width: "80px" }} />
                    <col style={{ width: "90px" }} />
                    <col />
                    <col style={{ width: "140px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "120px" }} />
                  </colgroup>
                  <THead cols={[
                    { label: "Token", align: "left" },
                    { label: "Time", align: "left" },
                    { label: "Patient", align: "left" },
                    { label: "Status", align: "left" },
                    { label: "Payment", align: "left" },
                    { label: "Fee", align: "right" },
                  ]} />
                  <tbody>
                    {data.consultations.items.map((r) => (
                      <tr key={r._id} className="border-t border-gray-100">
                        <Td>{r.tokenNumber ?? "—"}</Td>
                        <Td>{r.appointmentTime || "—"}</Td>
                        <Td className="font-medium text-gray-900">{r.patientName}</Td>
                        <Td><StatusPill s={r.status} /></Td>
                        <Td><PaymentPill mode={r.paymentMode} /></Td>
                        <Td align="right" className="font-semibold text-gray-900">{inr(r.fee)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </SectionCard>

            {/* Follow-ups */}
            <SectionCard
              title="Follow-ups"
              color="sky"
              count={data.followUps.count}
              total={data.followUps.total}
            >
              {data.followUps.items.length === 0 ? (
                <EmptyRow />
              ) : (
                <Table>
                  <colgroup>
                    <col style={{ width: "80px" }} />
                    <col style={{ width: "90px" }} />
                    <col />
                    <col style={{ width: "140px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "120px" }} />
                  </colgroup>
                  <THead cols={[
                    { label: "Token", align: "left" },
                    { label: "Time", align: "left" },
                    { label: "Patient", align: "left" },
                    { label: "Status", align: "left" },
                    { label: "Payment", align: "left" },
                    { label: "Fee", align: "right" },
                  ]} />
                  <tbody>
                    {data.followUps.items.map((r) => (
                      <tr key={r._id} className="border-t border-gray-100">
                        <Td>{r.tokenNumber ?? "—"}</Td>
                        <Td>{r.appointmentTime || "—"}</Td>
                        <Td className="font-medium text-gray-900">{r.patientName}</Td>
                        <Td><StatusPill s={r.status} /></Td>
                        <Td><PaymentPill mode={r.paymentMode} /></Td>
                        <Td align="right" className="font-semibold text-gray-900">{inr(r.fee)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </SectionCard>

            {/* Procedures */}
            <SectionCard
              title="Cosmetology Procedures"
              color="pink"
              count={data.procedures.count}
              total={data.procedures.total}
            >
              {data.procedures.groups.length === 0 ? (
                <EmptyRow />
              ) : (
                <div className="space-y-4">
                  {data.procedures.groups.map((g) => (
                    <div key={g.procedureName} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-pink-50/40 flex items-center justify-between border-b border-pink-100">
                        <div>
                          <p className="font-bold text-gray-900">{g.procedureName}</p>
                          <p className="text-xs text-gray-500">
                            {g.count} performed · Base {inr(g.baseTotal)} + GST {inr(g.gstTotal)}
                          </p>
                        </div>
                        <p className="text-lg font-black text-pink-700">{inr(g.revenue)}</p>
                      </div>
                      <Table>
                        <colgroup>
                          <col style={{ width: "80px" }} />
                          <col style={{ width: "90px" }} />
                          <col />
                          <col style={{ width: "110px" }} />
                          <col style={{ width: "120px" }} />
                          <col style={{ width: "80px" }} />
                          <col style={{ width: "120px" }} />
                        </colgroup>
                        <THead cols={[
                          { label: "Token", align: "left" },
                          { label: "Time", align: "left" },
                          { label: "Patient", align: "left" },
                          { label: "Payment", align: "left" },
                          { label: "Base", align: "right" },
                          { label: "GST", align: "right" },
                          { label: "Total", align: "right" },
                        ]} />
                        <tbody>
                          {g.instances.map((r) => (
                            <tr key={r._id} className="border-t border-gray-100">
                              <Td>{r.tokenNumber ?? "—"}</Td>
                              <Td>{r.appointmentTime || "—"}</Td>
                              <Td className="font-medium text-gray-900">{r.patientName}</Td>
                              <Td><PaymentPill mode={r.paymentMode} /></Td>
                              <Td align="right" className="text-gray-600">{inr(r.basePrice)}</Td>
                              <Td align="right" className="text-gray-600">{r.gstRate}%</Td>
                              <Td align="right" className="font-semibold text-pink-700">{inr(r.totalAmount)}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function SectionCard({
  title, color, count, total, children,
}: {
  title: string;
  color: "teal" | "sky" | "pink";
  count: number;
  total: number;
  children: React.ReactNode;
}) {
  const headerBg =
    color === "teal" ? "from-teal-50/40 to-cyan-50/40 border-teal-100" :
    color === "sky" ? "from-sky-50/40 to-blue-50/40 border-sky-100" :
    "from-pink-50/40 to-rose-50/40 border-pink-100";
  const bar =
    color === "teal" ? "from-teal-500 to-cyan-500" :
    color === "sky" ? "from-sky-500 to-blue-500" :
    "from-pink-500 to-rose-500";
  const pillBg =
    color === "teal" ? "bg-teal-100 text-teal-700" :
    color === "sky" ? "bg-sky-100 text-sky-700" :
    "bg-pink-100 text-pink-700";
  const totalColor =
    color === "teal" ? "text-teal-700" :
    color === "sky" ? "text-sky-700" :
    "text-pink-700";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className={`px-5 py-3.5 border-b bg-gradient-to-r ${headerBg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${bar}`} />
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pillBg}`}>{count}</span>
        </div>
        <p className={`text-base font-black ${totalColor}`}>{inr(total)}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm table-fixed">{children}</table>
    </div>
  );
}

type Col = { label: string; align?: "left" | "right" | "center" };

function THead({ cols }: { cols: Col[] }) {
  return (
    <thead className="bg-gray-50">
      <tr>
        {cols.map((c) => {
          const alignCls = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
          return (
            <th key={c.label} className={`px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider ${alignCls}`}>
              {c.label}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function Td({ children, className = "", align }: { children: React.ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return <td className={`px-3 py-2.5 text-sm text-gray-700 ${alignCls} ${className}`}>{children}</td>;
}

function StatusPill({ s }: { s?: string }) {
  const styles: Record<string, string> = {
    "checked-in": "bg-amber-50 text-amber-700 border-amber-200",
    "in-progress": "bg-purple-50 text-purple-700 border-purple-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "no-show": "bg-gray-50 text-gray-600 border-gray-200",
  };
  const labels: Record<string, string> = {
    "checked-in": "Waiting",
    "in-progress": "In Progress",
    completed: "Completed",
    "no-show": "No Show",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border ${styles[s || ""] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {labels[s || ""] || s || "—"}
    </span>
  );
}

function PaymentPill({ mode }: { mode?: string }) {
  if (!mode) return <span className="text-xs text-gray-300">—</span>;
  const styles: Record<string, string> = {
    cash: "bg-emerald-50 text-emerald-700 border-emerald-200",
    card: "bg-indigo-50 text-indigo-700 border-indigo-200",
    upi: "bg-violet-50 text-violet-700 border-violet-200",
    insurance: "bg-blue-50 text-blue-700 border-blue-200",
    credit: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border capitalize ${styles[mode] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {mode}
    </span>
  );
}

function EmptyRow() {
  return <p className="text-sm text-gray-400 text-center py-4">No entries.</p>;
}
