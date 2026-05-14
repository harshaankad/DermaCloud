"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

interface Patient {
  _id: string;
  patientId: string;
  name: string;
  phone: string;
  age: number;
  gender: string;
}

interface Appointment {
  _id: string;
  appointmentId: string;
  tokenNumber?: number;
  patientId: Patient;
  appointmentDate: string;
  appointmentTime: string;
  type: string;
  status: string;
  reason?: string;
  notes?: string;
  consultationFee?: number;
  procedureId?: string;
  procedureName?: string;
  basePrice?: number;
  gstRate?: number;
  gstAmount?: number;
  totalAmount?: number;
  checkedInAt?: string;
  startedAt?: string;
  completedAt?: string;
  walkIn?: boolean;
  dispensed?: boolean;
}

interface CosmetologyProcedure {
  _id: string;
  name: string;
  category: string;
  basePrice: number;
  gstRate: number;
}

function FrontdeskAppointmentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [canSell, setCanSell] = useState(false);
  const [staff, setStaff] = useState<any>(null);
  const [activeQueue, setActiveQueue] = useState<"consultation" | "procedure">("consultation");

  const handleLogout = () => {
    localStorage.removeItem("frontdeskToken");
    localStorage.removeItem("frontdeskStaff");
    router.push("/frontdesk/login");
  };

  // Walk-In modal
  const [showWalkInModal, setShowWalkInModal] = useState(action === "new");
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);

  // Shared patient search state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [phoneQuery, setPhoneQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Walk-In reason/pricing
  const [walkInReason, setWalkInReason] = useState<"consultation" | "follow-up" | "cosmetology" | null>(null);
  const [walkInFee, setWalkInFee] = useState<string>("");
  const [walkInPaymentMode, setWalkInPaymentMode] = useState<"" | "cash" | "card" | "upi" | "insurance" | "credit">("");
  const [procedureQuery, setProcedureQuery] = useState("");
  const [procedureResults, setProcedureResults] = useState<CosmetologyProcedure[]>([]);
  const [selectedProcedure, setSelectedProcedure] = useState<CosmetologyProcedure | null>(null);
  const [searchingProcedures, setSearchingProcedures] = useState(false);
  const procSearchTimer = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ─── Fetch appointments ──────────────────────────────────────────────────
  const fetchAppointments = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tier2/appointments?date=${selectedDate}&limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (data.success) {
        // Show only walk-ins (the new model). Legacy scheduled rows are intentionally hidden.
        const walkIns = (data.data.appointments || []).filter((a: Appointment) => a.walkIn === true);
        setAppointments(walkIns);
      }
    } catch (error) {
      console.error("Error fetching appointments:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    const token = localStorage.getItem("frontdeskToken");
    const staffData = localStorage.getItem("frontdeskStaff");
    if (!token || !staffData) {
      router.push("/frontdesk/login");
      return;
    }
    try {
      const staffInfo = JSON.parse(staffData);
      if (!staffInfo.permissions?.appointments) {
        router.push("/frontdesk/dashboard");
        return;
      }
      setStaff(staffInfo);
      setCanSell(!!staffInfo.permissions?.sales);
    } catch {}
    fetchAppointments(token);
  }, [fetchAppointments, router]);

  // ─── Patient search ──────────────────────────────────────────────────────
  const searchPatientsByPhone = async (q: string) => {
    if (q.length < 3) {
      setPatients([]);
      setHasSearched(false);
      return;
    }
    setSearchingPatients(true);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const res = await fetch(`/api/tier2/patients/list?search=${encodeURIComponent(q)}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPatients(data.data?.patients || []);
    } catch {
      setPatients([]);
    } finally {
      setSearchingPatients(false);
      setHasSearched(true);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (phoneQuery && !selectedPatient) {
        searchPatientsByPhone(phoneQuery);
      }
    }, 250);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneQuery, selectedPatient]);

  // ─── Procedure search ────────────────────────────────────────────────────
  const searchProcedures = (q: string) => {
    setProcedureQuery(q);
    if (procSearchTimer.current) clearTimeout(procSearchTimer.current);
    if (q.length < 1) {
      setProcedureResults([]);
      return;
    }
    setSearchingProcedures(true);
    procSearchTimer.current = setTimeout(async () => {
      const token = localStorage.getItem("frontdeskToken");
      try {
        const res = await fetch(`/api/tier2/cosmetology-procedures?search=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) setProcedureResults(data.data || []);
      } catch {
        setProcedureResults([]);
      } finally {
        setSearchingProcedures(false);
      }
    }, 250);
  };

  const resetWalkInForm = () => {
    setSelectedPatient(null);
    setPatients([]);
    setPhoneQuery("");
    setHasSearched(false);
    setWalkInReason(null);
    setWalkInFee("");
    setWalkInPaymentMode("");
    setProcedureQuery("");
    setProcedureResults([]);
    setSelectedProcedure(null);
  };

  // ─── Register Walk-In ───────────────────────────────────────────────────
  const handleRegisterWalkIn = async () => {
    if (!selectedPatient) {
      showToast("error", "Please select a patient");
      return;
    }
    if (!walkInReason) {
      showToast("error", "Please choose a reason");
      return;
    }
    if ((walkInReason === "consultation" || walkInReason === "follow-up") && (!walkInFee || Number(walkInFee) <= 0)) {
      showToast("error", "Please enter a valid fee");
      return;
    }
    if (walkInReason === "cosmetology" && !selectedProcedure) {
      showToast("error", "Please select a procedure");
      return;
    }

    setWalkInSubmitting(true);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const body: any = {
        patientId: selectedPatient._id,
        reason: walkInReason,
      };
      if (walkInReason === "consultation" || walkInReason === "follow-up") {
        body.consultationFee = Number(walkInFee);
      } else if (walkInReason === "cosmetology") {
        body.procedureId = selectedProcedure!._id;
      }
      if (walkInPaymentMode) body.paymentMode = walkInPaymentMode;
      const res = await fetch("/api/tier2/appointments/walk-in", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Walk-in registered: Token ${data.data?.tokenNumber || "—"}`);
        setShowWalkInModal(false);
        resetWalkInForm();
        fetchAppointments(token!);
      } else {
        showToast("error", data.message || "Failed to register walk-in");
      }
    } catch {
      showToast("error", "Error registering walk-in");
    } finally {
      setWalkInSubmitting(false);
    }
  };

  // ─── Status transitions ──────────────────────────────────────────────────
  const updateAppointmentStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const response = await fetch(`/api/tier2/appointments/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (data.success) {
        const msgs: Record<string, string> = {
          "in-progress": "Patient sent in",
          completed: "Consultation completed",
          cancelled: "Walk-in cancelled",
          "no-show": "Marked as no-show",
        };
        showToast("success", msgs[status] || "Status updated");
        fetchAppointments(token!);
      } else {
        showToast("error", data.message || "Failed to update");
      }
    } catch {
      showToast("error", "Error updating status");
    } finally {
      setUpdatingId(null);
    }
  };

  // ─── Derived (filtered by the active queue) ──────────────────────────────
  // Consultation queue = type in {consultation, follow-up}. Procedure queue = cosmetology.
  const inQueue = (a: Appointment) =>
    activeQueue === "procedure"
      ? a.type === "cosmetology"
      : a.type === "consultation" || a.type === "follow-up";
  const queueAppointments = appointments.filter(inQueue);

  // Counts across BOTH queues so the toggle can show a number badge.
  const counts = {
    consultation: appointments.filter((a) => a.type === "consultation" || a.type === "follow-up").length,
    procedure: appointments.filter((a) => a.type === "cosmetology").length,
  };

  const waiting = queueAppointments
    .filter((a) => a.status === "checked-in")
    .sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0));
  const inProgress = queueAppointments
    .filter((a) => a.status === "in-progress")
    .sort((a, b) => new Date(a.startedAt || 0).getTime() - new Date(b.startedAt || 0).getTime());
  const completed = queueAppointments
    .filter((a) => a.status === "completed")
    .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());

  const sortedAppointments = [...inProgress, ...waiting, ...completed,
    ...queueAppointments.filter((a) => !["checked-in", "in-progress", "completed"].includes(a.status))];

  const nextWaiting = waiting[0];
  const oldestInProgress = inProgress[0];

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  // ─── UI helpers ──────────────────────────────────────────────────────────
  const getStatusLabel = (s: string) =>
    ({ "checked-in": "Waiting", "in-progress": "In Consultation", completed: "Completed", cancelled: "Cancelled", "no-show": "No Show" } as Record<string, string>)[s] || s;
  const getStatusStyle = (s: string) =>
    ({
      "checked-in": "bg-amber-50 text-amber-700 border-amber-200",
      "in-progress": "bg-purple-50 text-purple-700 border-purple-200",
      completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
      cancelled: "bg-red-50 text-red-600 border-red-200",
      "no-show": "bg-gray-50 text-gray-600 border-gray-200",
    } as Record<string, string>)[s] || "bg-gray-50 text-gray-600 border-gray-200";
  const getStatusDot = (s: string) =>
    ({ "checked-in": "bg-amber-500", "in-progress": "bg-purple-500", completed: "bg-emerald-500", cancelled: "bg-red-400", "no-show": "bg-gray-400" } as Record<string, string>)[s] || "bg-gray-400";
  const getTokenStyle = (s: string) =>
    ({
      "checked-in": "bg-amber-100 text-amber-700 border-amber-300",
      "in-progress": "bg-purple-100 text-purple-700 border-purple-300",
      completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
      cancelled: "bg-gray-100 text-gray-400 border-gray-200",
      "no-show": "bg-gray-100 text-gray-400 border-gray-200",
    } as Record<string, string>)[s] || "bg-gray-100 text-gray-600 border-gray-200";
  const getReasonLabel = (apt: Appointment) => {
    if (apt.procedureName) return apt.procedureName;
    if (apt.type === "follow-up") return "Follow-up";
    return "New Consultation";
  };
  const getReasonStyle = (apt: Appointment) => {
    if (apt.procedureName) return "bg-pink-50 text-pink-700 border-pink-200";
    if (apt.type === "follow-up") return "bg-sky-50 text-sky-700 border-sky-200";
    return "bg-teal-50 text-teal-700 border-teal-200";
  };
  const getFeeText = (apt: Appointment) => {
    if (apt.totalAmount) return `₹${apt.totalAmount.toLocaleString("en-IN")}`;
    if (apt.consultationFee) return `₹${apt.consultationFee.toLocaleString("en-IN")}`;
    return "—";
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      {/* Toasts */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[260px] border ${
              toast.type === "success"
                ? "bg-white text-emerald-700 border-emerald-200"
                : toast.type === "error"
                ? "bg-white text-red-700 border-red-200"
                : "bg-white text-sky-700 border-sky-200"
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

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
            <div className="flex items-center gap-3">
              <button
                onClick={() => { resetWalkInForm(); setShowWalkInModal(true); }}
                className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md flex items-center gap-2 font-medium text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-base">Walk-In</span>
              </button>
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
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            <Link href="/frontdesk/dashboard" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">
              Dashboard
            </Link>
            {staff?.permissions?.appointments && (
              <Link href="/frontdesk/appointments" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors relative text-teal-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-teal-600 after:rounded-full">
                Appointments
              </Link>
            )}
            {staff?.permissions?.patients && (
              <Link href="/frontdesk/patients" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">
                Patients
              </Link>
            )}
            {staff?.permissions?.pharmacy && (
              <Link href="/frontdesk/pharmacy" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">
                Pharmacy
              </Link>
            )}
            {staff?.permissions?.sales && (
              <Link href="/frontdesk/sales" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">
                Sales
              </Link>
            )}
            <Link href="/frontdesk/procedures" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">
              Procedures
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Date picker + Queue toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white"
            />
            <span className="text-sm text-gray-500">
              {appointments.length} walk-in{appointments.length !== 1 ? "s" : ""} {isToday ? "today" : ""}
            </span>
          </div>

          {/* Queue toggle */}
          <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-0.5">
            <button
              onClick={() => setActiveQueue("consultation")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeQueue === "consultation"
                  ? "bg-white text-teal-700 shadow-sm font-semibold"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Consultations
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                activeQueue === "consultation" ? "bg-teal-100 text-teal-700" : "bg-gray-200 text-gray-600"
              }`}>{counts.consultation}</span>
            </button>
            <button
              onClick={() => setActiveQueue("procedure")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeQueue === "procedure"
                  ? "bg-white text-pink-700 shadow-sm font-semibold"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Procedures
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                activeQueue === "procedure" ? "bg-pink-100 text-pink-700" : "bg-gray-200 text-gray-600"
              }`}>{counts.procedure}</span>
            </button>
          </div>
        </div>

        {/* Now Serving / Send Next banner — only on today, only when relevant */}
        {isToday && (oldestInProgress || nextWaiting) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {/* Complete Current */}
            {oldestInProgress ? (
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-black text-lg">{oldestInProgress.tokenNumber || "—"}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Now in consultation</p>
                    <p className="text-base font-bold text-gray-900 truncate">{oldestInProgress.patientId?.name || "—"}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {getReasonLabel(oldestInProgress)} · {getFeeText(oldestInProgress)}
                      {inProgress.length > 1 && ` · +${inProgress.length - 1} more in progress`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => updateAppointmentStatus(oldestInProgress._id, "completed")}
                  disabled={updatingId === oldestInProgress._id}
                  className="px-4 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 font-semibold text-sm shadow-md disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                >
                  {updatingId === oldestInProgress._id ? "Completing…" : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Complete Current
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 border-dashed rounded-2xl p-4 flex items-center gap-3 text-gray-400 text-sm">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider">No active consultation</p>
                  <p className="text-sm text-gray-500">Send the next patient in →</p>
                </div>
              </div>
            )}

            {/* Send Next */}
            {nextWaiting ? (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-black text-lg">{nextWaiting.tokenNumber || "—"}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Next in queue</p>
                    <p className="text-base font-bold text-gray-900 truncate">{nextWaiting.patientId?.name || "—"}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {getReasonLabel(nextWaiting)} · {getFeeText(nextWaiting)}
                      {waiting.length > 1 && ` · ${waiting.length - 1} more waiting`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => updateAppointmentStatus(nextWaiting._id, "in-progress")}
                  disabled={updatingId === nextWaiting._id}
                  className="px-4 py-2.5 bg-purple-500 text-white rounded-xl hover:bg-purple-600 font-semibold text-sm shadow-md disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                >
                  {updatingId === nextWaiting._id ? "Sending…" : (
                    <>
                      Send Next
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 border-dashed rounded-2xl p-4 flex items-center gap-3 text-gray-400 text-sm">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M9 20H4v-2a3 3 0 015.356-1.857M9 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider">Queue empty</p>
                  <p className="text-sm text-gray-500">No patients waiting</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Appointments list */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-teal-50/40 to-cyan-50/40">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-teal-500 to-cyan-500" />
              <h2 className="text-sm font-bold text-gray-800">{activeQueue === "procedure" ? "Procedure Queue" : "Consultation Queue"}</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span><span className="font-bold text-amber-600">{waiting.length}</span> waiting</span>
              <span><span className="font-bold text-purple-600">{inProgress.length}</span> in consult</span>
              <span><span className="font-bold text-emerald-600">{completed.length}</span> done</span>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
          ) : sortedAppointments.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
                <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-gray-700 font-semibold text-lg">No walk-ins yet</p>
              <p className="text-gray-400 text-base mt-1">{isToday ? "Click \"Walk-In\" to register a patient" : "No activity on this date"}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {sortedAppointments.map((apt) => {
                const isWaiting = apt.status === "checked-in";
                const isInProgress = apt.status === "in-progress";
                const isCompleted = apt.status === "completed";
                const isLoadingRow = updatingId === apt._id;
                const isClickable = isWaiting && !isLoadingRow;
                return (
                  <div
                    key={apt._id}
                    onClick={() => { if (isClickable) updateAppointmentStatus(apt._id, "in-progress"); }}
                    className={`group p-4 sm:p-5 transition-all ${
                      isInProgress ? "bg-purple-50/30" :
                      isWaiting ? "bg-amber-50/30 hover:bg-amber-50/60 cursor-pointer" :
                      "hover:bg-gray-50/50"
                    }`}
                    title={isClickable ? "Click to send this patient in" : undefined}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* Token */}
                      <div className="flex-shrink-0">
                        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center border-2 ${getTokenStyle(apt.status)}`}>
                          <span className="text-lg font-black leading-none">{apt.tokenNumber || "—"}</span>
                          <span className="text-[9px] font-bold opacity-60 uppercase">Token</span>
                        </div>
                      </div>

                      {/* Time */}
                      <div className="min-w-[60px] text-center flex-shrink-0">
                        <div className="inline-flex flex-col items-center px-2.5 py-1.5 bg-gradient-to-b from-teal-50 to-cyan-50 rounded-xl border border-teal-100">
                          <span className="text-sm font-bold text-teal-700 leading-tight">{apt.appointmentTime}</span>
                          <span className="text-[9px] text-teal-500 font-medium">{parseInt(apt.appointmentTime) >= 12 ? "PM" : "AM"}</span>
                        </div>
                      </div>

                      {/* Patient + reason */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                            isInProgress ? "bg-gradient-to-br from-purple-400 to-indigo-500" :
                            isWaiting ? "bg-gradient-to-br from-amber-400 to-orange-500" :
                            "bg-gradient-to-br from-teal-400 to-cyan-500"
                          }`}>
                            <span className="text-white font-bold text-sm">{apt.patientId?.name?.charAt(0)?.toUpperCase() || "?"}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-base truncate">{apt.patientId?.name || "Unknown"}</p>
                            <p className="text-sm text-gray-400 truncate">
                              {apt.patientId?.phone || ""}
                              {apt.patientId?.patientId ? ` · ${apt.patientId.patientId}` : ""}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Reason */}
                      <div className="hidden sm:flex items-center flex-shrink-0">
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold border ${getReasonStyle(apt)}`}>
                          {getReasonLabel(apt)}
                        </span>
                      </div>

                      {/* Status + Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getStatusStyle(apt.status)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(apt.status)}`}></span>
                          {getStatusLabel(apt.status)}
                        </span>

                        {isLoadingRow ? (
                          <div className="flex items-center gap-2 ml-1 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs text-gray-500">Updating…</span>
                          </div>
                        ) : (
                          <>
                            {isInProgress && (
                              <button
                                onClick={(e) => { e.stopPropagation(); updateAppointmentStatus(apt._id, "completed"); }}
                                className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 shadow-sm ml-1"
                                title="Mark this consultation completed"
                              >
                                Complete
                              </button>
                            )}
                            {isCompleted && canSell && (
                              apt.dispensed ? (
                                <span className="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-lg text-xs font-semibold ml-1 flex items-center gap-1 cursor-not-allowed select-none opacity-60" title="Already dispensed">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Dispensed
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); router.push(`/frontdesk/sales?action=new&patientId=${apt.patientId?._id}&patientName=${encodeURIComponent(apt.patientId?.name || "")}&patientPhone=${encodeURIComponent(apt.patientId?.phone || "")}&aptDate=${selectedDate}&appointmentId=${apt._id}`); }}
                                  className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs font-semibold hover:bg-teal-600 shadow-sm ml-1 flex items-center gap-1"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                  </svg>
                                  Dispense
                                </button>
                              )
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Walk-In Modal */}
      {showWalkInModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Register Walk-In</h2>
                  <p className="text-sm text-gray-500">Search patient, then choose reason</p>
                </div>
              </div>
              <button
                onClick={() => { setShowWalkInModal(false); resetWalkInForm(); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Patient search */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Patient</label>
                {!selectedPatient ? (
                  <>
                    <div className="relative">
                      <input
                        type="tel"
                        value={phoneQuery}
                        onChange={(e) => { setPhoneQuery(e.target.value); setHasSearched(false); }}
                        placeholder="Search by phone, name, or patient ID…"
                        className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                        autoFocus
                      />
                      <svg className="w-4 h-4 text-gray-400 absolute top-1/2 left-3.5 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {searchingPatients && (
                        <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin absolute top-1/2 right-3.5 -translate-y-1/2" />
                      )}
                    </div>
                    {patients.length > 0 && (
                      <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-3 py-2 bg-gray-50 border-b text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                          {patients.length} patient{patients.length > 1 ? "s" : ""} found
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {patients.map((patient) => (
                            <button
                              key={patient._id}
                              type="button"
                              onClick={() => { setSelectedPatient(patient); setPatients([]); }}
                              className="w-full p-3 text-left hover:bg-teal-50 border-b border-gray-50 last:border-b-0 flex items-center gap-3"
                            >
                              <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-white font-bold text-xs">{patient.name.charAt(0).toUpperCase()}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-gray-900">{patient.name}</p>
                                <p className="text-sm text-gray-400">{patient.phone} · {patient.age}y {patient.gender} · {patient.patientId}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                        <Link href="/frontdesk/patients?action=new" className="flex items-center gap-2.5 px-3 py-2.5 border-t border-gray-200 bg-gray-50 hover:bg-teal-50 text-teal-700">
                          <div className="w-9 h-9 border-2 border-dashed border-teal-300 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                          </div>
                          <span className="text-sm font-semibold">Can&apos;t find patient? Add New</span>
                        </Link>
                      </div>
                    )}
                    {hasSearched && patients.length === 0 && phoneQuery.length >= 3 && (
                      <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-base font-semibold text-amber-800">No patient found</p>
                        <p className="text-sm text-amber-600 mt-0.5">Register the patient first, then come back here.</p>
                        <Link href="/frontdesk/patients?action=new" className="inline-flex items-center gap-1.5 mt-2.5 px-3.5 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700">
                          Add New Patient
                        </Link>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-3.5 bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{selectedPatient.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{selectedPatient.name}</p>
                        <p className="text-sm text-gray-500">{selectedPatient.phone} · {selectedPatient.age}y {selectedPatient.gender}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setSelectedPatient(null); setPhoneQuery(""); }} className="p-1.5 hover:bg-white/60 rounded-lg" title="Change patient">
                      <svg className="w-4 h-4 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Reason picker */}
              {selectedPatient && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Reason for visit</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "consultation", label: "New Consultation", color: "teal" },
                      { key: "follow-up", label: "Follow-up", color: "sky" },
                      { key: "cosmetology", label: "Cosmetology", color: "pink" },
                    ].map((r) => {
                      const active = walkInReason === r.key;
                      return (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => {
                            setWalkInReason(r.key as any);
                            if (r.key === "cosmetology") { setWalkInFee(""); }
                            else { setSelectedProcedure(null); setProcedureQuery(""); setProcedureResults([]); }
                          }}
                          className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                            active
                              ? r.color === "teal" ? "border-teal-500 bg-teal-50 text-teal-700"
                              : r.color === "sky" ? "border-sky-500 bg-sky-50 text-sky-700"
                              : "border-pink-500 bg-pink-50 text-pink-700"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Consultation/Follow-up fee */}
              {selectedPatient && (walkInReason === "consultation" || walkInReason === "follow-up") && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Consultation fee (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={walkInFee}
                    onChange={(e) => setWalkInFee(e.target.value)}
                    placeholder="e.g. 350"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                    autoFocus
                  />
                </div>
              )}

              {/* Cosmetology procedure search */}
              {selectedPatient && walkInReason === "cosmetology" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Procedure</label>
                  {!selectedProcedure ? (
                    <div className="relative">
                      <input
                        type="text"
                        value={procedureQuery}
                        onChange={(e) => searchProcedures(e.target.value)}
                        placeholder="Search procedure… (e.g. chemical peel)"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none text-base bg-gray-50"
                        autoFocus
                      />
                      {procedureResults.length > 0 && (
                        <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-60 overflow-y-auto bg-white">
                          {procedureResults.map((p) => {
                            const gstAmt = (p.basePrice * p.gstRate) / 100;
                            const total = p.basePrice + gstAmt;
                            return (
                              <button
                                key={p._id}
                                type="button"
                                onClick={() => { setSelectedProcedure(p); setProcedureResults([]); setProcedureQuery(""); }}
                                className="w-full text-left p-3 hover:bg-pink-50 border-b border-gray-50 last:border-b-0"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-gray-900">{p.name}</span>
                                  <span className="text-sm font-bold text-pink-700">₹{total.toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                                  <span className="capitalize">{p.category}</span>
                                  <span>·</span>
                                  <span>Base ₹{p.basePrice.toLocaleString("en-IN")} + {p.gstRate}% GST</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {searchingProcedures && (
                        <p className="text-xs text-gray-400 mt-1">Searching…</p>
                      )}
                    </div>
                  ) : (
                    <div className="p-3.5 bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-gray-900">{selectedProcedure.name}</p>
                        <button type="button" onClick={() => { setSelectedProcedure(null); }} className="p-1.5 hover:bg-white/60 rounded-lg">
                          <svg className="w-4 h-4 text-pink-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-white rounded-lg p-2 border border-pink-100">
                          <p className="text-[10px] text-gray-400 uppercase">Base</p>
                          <p className="font-bold text-gray-900">₹{selectedProcedure.basePrice.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 border border-pink-100">
                          <p className="text-[10px] text-gray-400 uppercase">GST ({selectedProcedure.gstRate}%)</p>
                          <p className="font-bold text-gray-900">₹{((selectedProcedure.basePrice * selectedProcedure.gstRate) / 100).toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-2 border border-pink-200">
                          <p className="text-[10px] text-pink-500 uppercase font-bold">Total</p>
                          <p className="font-bold text-pink-700">₹{(selectedProcedure.basePrice * (1 + selectedProcedure.gstRate / 100)).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Payment mode (optional) — shown once a reason is picked */}
              {selectedPatient && walkInReason && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Payment mode <span className="text-gray-400 font-normal normal-case text-xs">(optional)</span>
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["cash", "card", "upi", "insurance", "credit"] as const).map((m) => {
                      const active = walkInPaymentMode === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setWalkInPaymentMode(active ? "" : m)}
                          className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-all capitalize ${
                            active
                              ? "border-teal-500 bg-teal-50 text-teal-700"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 flex-shrink-0 flex gap-3">
              <button
                type="button"
                onClick={() => { setShowWalkInModal(false); resetWalkInForm(); }}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRegisterWalkIn}
                disabled={walkInSubmitting || !selectedPatient || !walkInReason ||
                  ((walkInReason === "consultation" || walkInReason === "follow-up") && (!walkInFee || Number(walkInFee) <= 0)) ||
                  (walkInReason === "cosmetology" && !selectedProcedure)}
                className="flex-[2] px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-semibold text-sm hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {walkInSubmitting ? "Registering…" : "Register Walk-In"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FrontdeskAppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <FrontdeskAppointmentsPageInner />
    </Suspense>
  );
}
