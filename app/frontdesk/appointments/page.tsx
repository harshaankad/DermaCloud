"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// Toast notification types
interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

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
  reason: string;
  notes?: string;
  checkedInAt?: string;
  startedAt?: string;
  completedAt?: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

function FrontdeskAppointmentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [showBookingModal, setShowBookingModal] = useState(action === "new");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [phoneQuery, setPhoneQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    appointmentDate: new Date().toISOString().split("T")[0],
    appointmentTime: "",
    type: "consultation",
    notes: "",
    consultationFee: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showDoubleBookConfirm, setShowDoubleBookConfirm] = useState(false);
  const [pendingTimeSlot, setPendingTimeSlot] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filter, setFilter] = useState<"all" | "checked-in" | "in-progress" | "scheduled" | "completed" | "cancelled">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [clinicSettings, setClinicSettings] = useState({
    startHour: 9,
    endHour: 22,
    slotDuration: 30,
    lunchStartHour: 13,
    lunchEndHour: 14,
    lunchEnabled: true,
  });
  const [editSettings, setEditSettings] = useState({ ...clinicSettings });
  const [openTimePicker, setOpenTimePicker] = useState<string | null>(null);
  const [canSell, setCanSell] = useState(false);

  const formatHour = (h: number) => {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  };

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    const staffData = localStorage.getItem("frontdeskStaff");
    const token = localStorage.getItem("frontdeskToken");
    if (!token || !staffData) {
      router.push("/frontdesk/login");
      return;
    }
    const staffInfo = JSON.parse(staffData);
    if (!staffInfo.permissions?.appointments) {
      router.push("/frontdesk/dashboard");
      return;
    }
    setCanSell(!!staffInfo.permissions?.sales);
    fetchAppointments(token);
  }, [selectedDate]);

  // Load settings once on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  // Fetch slots when booking modal opens
  useEffect(() => {
    if (showBookingModal) {
      fetchSlots(bookingForm.appointmentDate);
    }
  }, [showBookingModal]);

  const fetchSettings = async () => {
    const token = localStorage.getItem("frontdeskToken");
    try {
      const response = await fetch("/api/tier2/appointments/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setClinicSettings(data.data);
        setEditSettings(data.data);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const saveSettings = async () => {
    if (editSettings.startHour >= editSettings.endHour) {
      showToast("error", "Start time must be before end time");
      return;
    }
    if (editSettings.lunchEnabled && editSettings.lunchStartHour >= editSettings.lunchEndHour) {
      showToast("error", "Lunch start must be before lunch end");
      return;
    }
    if (editSettings.lunchEnabled && (editSettings.lunchStartHour < editSettings.startHour || editSettings.lunchEndHour > editSettings.endHour)) {
      showToast("error", "Lunch break must be within clinic hours");
      return;
    }

    setSavingSettings(true);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const response = await fetch("/api/tier2/appointments/settings", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editSettings),
      });
      const data = await response.json();
      if (data.success) {
        setClinicSettings({ ...editSettings });
        showToast("success", "Clinic timing updated successfully");
        setShowSettingsModal(false);
        fetchSlots(bookingForm.appointmentDate);
      } else {
        showToast("error", data.message || "Failed to save settings");
      }
    } catch (error) {
      showToast("error", "Error saving settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const fetchAppointments = async (token: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tier2/appointments?date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setAppointments(data.data.appointments || []);
      }
    } catch (error) {
      console.error("Error fetching appointments:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSlots = async (date: string) => {
    const token = localStorage.getItem("frontdeskToken");
    try {
      const response = await fetch(`/api/tier2/appointments/slots?date=${date}&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (data.success) {
        setSlots(data.data.slots || []);
      }
    } catch (error) {
      console.error("Error fetching slots:", error);
    }
  };

  const searchPatientsByPhone = async (phone: string) => {
    if (phone.length < 3) {
      setPatients([]);
      setHasSearched(false);
      return;
    }
    setSearchingPatients(true);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const response = await fetch(`/api/tier2/patients/list?search=${encodeURIComponent(phone)}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setPatients(data.data.patients || []);
      }
    } catch (error) {
      console.error("Error searching patients:", error);
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
    }, 400);
    return () => clearTimeout(timer);
  }, [phoneQuery, selectedPatient]);

  const handleTimeSlotClick = (slot: TimeSlot) => {
    if (!slot.available) {
      setPendingTimeSlot(slot.time);
      setShowDoubleBookConfirm(true);
    } else {
      setBookingForm({ ...bookingForm, appointmentTime: slot.time });
    }
  };

  const confirmDoubleBook = () => {
    setBookingForm({ ...bookingForm, appointmentTime: pendingTimeSlot });
    setShowDoubleBookConfirm(false);
    setPendingTimeSlot("");
  };

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !bookingForm.appointmentTime) {
      showToast("error", "Please select a patient and time slot");
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem("frontdeskToken");

    try {
      const feeToSend = bookingForm.consultationFee ? parseFloat(bookingForm.consultationFee) : undefined;
      console.log("[APT BOOK] sending consultationFee:", feeToSend, "raw value:", bookingForm.consultationFee);
      const response = await fetch("/api/tier2/appointments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId: selectedPatient._id,
          ...bookingForm,
          consultationFee: feeToSend,
        }),
      });

      const data = await response.json();
      console.log("[APT BOOK] response:", data.success, "stored fee:", data.data?.consultationFee);
      if (data.success) {
        const feeMsg = data.data?.consultationFee != null ? ` | Fee: ₹${data.data.consultationFee}` : "";
        showToast("success", `Appointment booked for ${selectedPatient.name} at ${bookingForm.appointmentTime}${feeMsg}`);
        setShowBookingModal(false);
        resetBookingForm();
        fetchAppointments(token!);
      } else {
        showToast("error", data.message || "Failed to book appointment");
      }
    } catch (error) {
      showToast("error", "Error booking appointment");
    } finally {
      setSubmitting(false);
    }
  };

  const resetBookingForm = () => {
    setSelectedPatient(null);
    setPhoneQuery("");
    setPatients([]);
    setHasSearched(false);
    setBookingForm({
      appointmentDate: new Date().toISOString().split("T")[0],
      appointmentTime: "",
      type: "consultation",
      notes: "",
      consultationFee: "",
    });
  };

  const updateAppointmentStatus = async (appointmentId: string, status: string) => {
    setUpdatingId(appointmentId);
    const token = localStorage.getItem("frontdeskToken");
    try {
      const response = await fetch(`/api/tier2/appointments/${appointmentId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();
      if (data.success) {
        const statusMessages: Record<string, string> = {
          "checked-in": "Patient checked in",
          "in-progress": "Consultation started",
          completed: "Consultation completed",
          cancelled: "Appointment cancelled",
          "no-show": "Marked as no-show",
        };
        showToast("success", statusMessages[status] || "Status updated");
        fetchAppointments(token!);
      } else {
        showToast("error", data.message || "Failed to update status");
      }
    } catch (error) {
      showToast("error", "Error updating status");
    } finally {
      setUpdatingId(null);
    }
  };

  const callNextPatient = () => {
    const waitingPatients = appointments
      .filter((a) => a.status === "checked-in")
      .sort((a, b) => {
        const aTime = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
        const bTime = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
        return aTime - bTime;
      });
    if (waitingPatients.length > 0) {
      updateAppointmentStatus(waitingPatients[0]._id, "in-progress");
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: "Scheduled",
      "checked-in": "Waiting",
      "in-progress": "In Consultation",
      completed: "Completed",
      cancelled: "Cancelled",
      "no-show": "No Show",
    };
    return labels[status] || status;
  };

  const getStatusStyle = (status: string) => {
    const styles: Record<string, string> = {
      scheduled: "bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/10",
      "checked-in": "bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10",
      "in-progress": "bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/10",
      completed: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10",
      cancelled: "bg-red-50 text-red-600 border-red-200 ring-red-500/10",
      "no-show": "bg-gray-50 text-gray-600 border-gray-200 ring-gray-500/10",
    };
    return styles[status] || "bg-gray-50 text-gray-600 border-gray-200";
  };

  const getStatusDot = (status: string) => {
    const dots: Record<string, string> = {
      scheduled: "bg-blue-500",
      "checked-in": "bg-amber-500",
      "in-progress": "bg-purple-500",
      completed: "bg-emerald-500",
      cancelled: "bg-red-400",
      "no-show": "bg-gray-400",
    };
    return dots[status] || "bg-gray-400";
  };

  const getTokenStyle = (status: string) => {
    const styles: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-700 border-blue-200",
      "checked-in": "bg-amber-100 text-amber-700 border-amber-300",
      "in-progress": "bg-purple-100 text-purple-700 border-purple-300",
      completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
      cancelled: "bg-gray-100 text-gray-400 border-gray-200",
      "no-show": "bg-gray-100 text-gray-400 border-gray-200",
    };
    return styles[status] || "bg-gray-100 text-gray-600 border-gray-200";
  };

  const getTypeStyle = (type: string) => {
    const styles: Record<string, string> = {
      consultation: "bg-teal-50 text-teal-700 border-teal-200",
      "follow-up": "bg-sky-50 text-sky-700 border-sky-200",
      dermatology: "bg-indigo-50 text-indigo-700 border-indigo-200",
      cosmetology: "bg-pink-50 text-pink-700 border-pink-200",
    };
    return styles[type] || "bg-gray-50 text-gray-700 border-gray-200";
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      consultation: "Consultation",
      "follow-up": "Follow-up",
      dermatology: "Dermatology",
      cosmetology: "Cosmetology",
    };
    return labels[type] || type;
  };

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  const filteredAppointments = appointments
    .filter((apt) => {
      if (filter === "all") return true;
      return apt.status === filter;
    })
    .sort((a, b) => {
      const priority: Record<string, number> = {
        "in-progress": 0,
        "checked-in": 1,
        "scheduled": 2,
        "confirmed": 2,
        "completed": 3,
        "no-show": 4,
        "cancelled": 4,
      };
      const aPri = priority[a.status] ?? 5;
      const bPri = priority[b.status] ?? 5;
      if (aPri !== bPri) return aPri - bPri;
      return a.appointmentTime.localeCompare(b.appointmentTime);
    });

  const counts = {
    all: appointments.length,
    scheduled: appointments.filter((a) => a.status === "scheduled").length,
    "checked-in": appointments.filter((a) => a.status === "checked-in").length,
    "in-progress": appointments.filter((a) => a.status === "in-progress").length,
    completed: appointments.filter((a) => a.status === "completed").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
  };

  const currentPatient = appointments.find((a) => a.status === "in-progress");
  const waitingCount = counts["checked-in"];
  const hasWaiting = waitingCount > 0;

  const formatDisplayDate = (dateStr: string) => {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ${diffMin % 60}m ago`;
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
              toast.type === "success"
                ? "bg-emerald-100"
                : toast.type === "error"
                ? "bg-red-100"
                : "bg-sky-100"
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
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            >
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
                href="/frontdesk/dashboard"
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-teal-600 transition-colors"
                title="Back to Dashboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
                <p className="text-base text-gray-500 hidden sm:block">Manage queue and schedule appointments</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditSettings({ ...clinicSettings });
                  setShowSettingsModal(true);
                }}
                className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 hover:text-teal-600 border border-gray-200"
                title="Clinic Timing Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setShowBookingModal(true);
                  fetchSlots(bookingForm.appointmentDate);
                }}
                className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20 flex items-center gap-2 font-medium text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="hidden sm:inline text-base">Book Appointment</span>
                <span className="sm:hidden text-base">Book</span>
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
              { label: "Dashboard", href: "/frontdesk/dashboard" },
              { label: "Appointments", href: "/frontdesk/appointments", active: true },
              { label: "Patients", href: "/frontdesk/patients" },
              { label: "Pharmacy", href: "/frontdesk/pharmacy" },
              { label: "Sales", href: "/frontdesk/sales" },
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
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base font-medium text-gray-900 bg-gray-50"
                />
              </div>
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
                {isToday && (
                  <span className="inline-flex w-2 h-2 rounded-full bg-teal-500 mr-1.5 animate-pulse"></span>
                )}
                {formatDisplayDate(selectedDate)}
              </span>
              <div className="h-5 w-px bg-gray-200 hidden sm:block"></div>
              <span className="text-base text-gray-500 hidden sm:block">
                {appointments.length} appointment{appointments.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Now Serving Banner */}
        {isToday && (
          <div className={`rounded-2xl shadow-sm border mb-6 overflow-hidden ${
            currentPatient
              ? "bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200"
              : hasWaiting
              ? "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200"
              : "bg-white border-gray-100"
          }`}>
            <div className="p-4 sm:p-5">
              {currentPatient ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/25 flex-shrink-0">
                      <span className="text-white font-black text-2xl">
                        {currentPatient.tokenNumber || "?"}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Now Serving</span>
                        <span className="inline-flex w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                      </div>
                      <p className="text-lg font-bold text-gray-900">
                        {currentPatient.patientId?.name || "Unknown Patient"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {getTypeLabel(currentPatient.type)} {"\u00B7"} Token T-{currentPatient.tokenNumber}
                        {currentPatient.startedAt && ` \u00B7 Started ${timeAgo(currentPatient.startedAt)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasWaiting && (
                      <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold border border-amber-200">
                        {waitingCount} waiting
                      </span>
                    )}
                    <button
                      onClick={() => updateAppointmentStatus(currentPatient._id, "completed")}
                      disabled={!!updatingId}
                      className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl hover:from-emerald-600 hover:to-green-700 transition-all font-semibold text-sm shadow-md shadow-emerald-500/20 disabled:opacity-40 flex items-center gap-2"
                    >
                      {updatingId === currentPatient._id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Completing...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Complete
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : hasWaiting ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/25 flex-shrink-0">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Queue Ready</span>
                      </div>
                      <p className="text-lg font-bold text-gray-900">
                        {waitingCount} patient{waitingCount > 1 ? "s" : ""} waiting
                      </p>
                      <p className="text-sm text-gray-500">No consultation in progress. Call next patient to begin.</p>
                    </div>
                  </div>
                  <button
                    onClick={callNextPatient}
                    disabled={!!updatingId}
                    className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl hover:from-purple-600 hover:to-indigo-700 transition-all font-semibold text-sm shadow-md shadow-purple-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    {updatingId ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Calling...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        Call Next Patient
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-400">No patients in queue</p>
                    <p className="text-sm text-gray-300">Check in patients when they arrive</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Queue Stats Cards */}
        {isToday && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{counts.scheduled}</p>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Scheduled</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{counts["checked-in"]}</p>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Waiting</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{counts["in-progress"]}</p>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">In Consultation</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{counts.completed}</p>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Completed</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {(["all", "checked-in", "in-progress", "scheduled", "completed", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                filter === f
                  ? f === "checked-in"
                    ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                    : f === "in-progress"
                    ? "bg-purple-500 text-white shadow-md shadow-purple-500/20"
                    : "bg-teal-500 text-white shadow-md shadow-teal-500/20"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              {f === "all" ? "All" : f === "checked-in" ? "Waiting" : f === "in-progress" ? "In Consultation" : getStatusLabel(f)}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] ${
                filter === f ? "bg-white/20" : "bg-gray-100"
              }`}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>

        {/* Appointments List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-4 sm:p-5 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-xl flex-shrink-0"></div>
                    <div className="min-w-[70px] flex-shrink-0">
                      <div className="w-[70px] h-[52px] bg-gradient-to-b from-teal-50 to-cyan-50 rounded-xl border border-teal-100/50"></div>
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-100 flex-shrink-0"></div>
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 rounded-lg w-36"></div>
                        <div className="h-3 bg-gray-100 rounded-lg w-48"></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="h-7 w-20 bg-gray-100 rounded-lg"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAppointments.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {filteredAppointments.map((apt) => (
                <div
                  key={apt._id}
                  className={`group p-4 sm:p-5 hover:bg-gray-50/50 transition-all ${
                    apt.status === "in-progress" ? "bg-purple-50/30" : apt.status === "checked-in" ? "bg-amber-50/30" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
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
                        <span className="text-sm font-bold text-teal-700 leading-tight">{apt.appointmentTime}</span>
                        <span className="text-[9px] text-teal-500 font-medium">
                          {parseInt(apt.appointmentTime) >= 12 ? "PM" : "AM"}
                        </span>
                      </div>
                    </div>

                    {/* Patient Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                          apt.status === "in-progress"
                            ? "bg-gradient-to-br from-purple-400 to-indigo-500"
                            : apt.status === "checked-in"
                            ? "bg-gradient-to-br from-amber-400 to-orange-500"
                            : "bg-gradient-to-br from-teal-400 to-cyan-500"
                        }`}>
                          <span className="text-white font-bold text-sm">
                            {apt.patientId?.name?.charAt(0)?.toUpperCase() || "?"}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-base truncate">
                            {apt.patientId?.name || "Unknown Patient"}
                          </p>
                          <p className="text-sm text-gray-400 truncate">
                            {apt.patientId?.phone || ""}
                            {apt.patientId?.patientId ? ` \u00B7 ${apt.patientId.patientId}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Tags & Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`hidden sm:inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold border ${getTypeStyle(apt.type)}`}>
                        {getTypeLabel(apt.type)}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ring-1 ${getStatusStyle(apt.status)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(apt.status)}`}></span>
                        {getStatusLabel(apt.status)}
                      </span>

                      {/* Action Buttons based on status */}
                      {updatingId === apt._id ? (
                        <div className="flex items-center gap-2 ml-1 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xs font-semibold text-gray-500">Updating...</span>
                        </div>
                      ) : (
                        <>
                          {apt.status === "scheduled" && (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => updateAppointmentStatus(apt._id, "checked-in")}
                                disabled={!!updatingId}
                                className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-40"
                                title="Check in patient"
                              >
                                Check In
                              </button>
                              <button
                                onClick={() => updateAppointmentStatus(apt._id, "cancelled")}
                                disabled={!!updatingId}
                                className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
                                title="Cancel appointment"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          )}
                          {apt.status === "checked-in" && (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => updateAppointmentStatus(apt._id, "in-progress")}
                                disabled={!!updatingId}
                                className="px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-semibold hover:bg-purple-600 transition-colors shadow-sm disabled:opacity-40"
                                title="Start consultation"
                              >
                                Start
                              </button>
                              <button
                                onClick={() => updateAppointmentStatus(apt._id, "no-show")}
                                disabled={!!updatingId}
                                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
                                title="Mark as no-show"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                                </svg>
                              </button>
                            </div>
                          )}
                          {apt.status === "in-progress" && (
                            <button
                              onClick={() => updateAppointmentStatus(apt._id, "completed")}
                              disabled={!!updatingId}
                              className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition-colors shadow-sm ml-1 disabled:opacity-40"
                              title="Complete consultation"
                            >
                              Complete
                            </button>
                          )}
                          {apt.status === "completed" && canSell && (
                            <button
                              onClick={() => router.push(`/frontdesk/sales?action=new&patientId=${apt.patientId?._id}&patientName=${encodeURIComponent(apt.patientId?.name || "")}&patientPhone=${encodeURIComponent(apt.patientId?.phone || "")}&aptDate=${selectedDate}`)}
                              className="px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs font-semibold hover:bg-teal-600 transition-colors shadow-sm ml-1 flex items-center gap-1"
                              title="Dispense medicines"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              Dispense
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
                <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-700 font-semibold text-lg">
                {filter !== "all" ? `No ${filter === "checked-in" ? "waiting" : filter === "in-progress" ? "in consultation" : getStatusLabel(filter).toLowerCase()} appointments` : "No appointments scheduled"}
              </p>
              <p className="text-gray-400 text-base mt-1">
                {filter !== "all" ? "Try a different filter or date" : "Book your first appointment for this date"}
              </p>
              {filter === "all" && (
                <button
                  onClick={() => {
                    setShowBookingModal(true);
                    fetchSlots(bookingForm.appointmentDate);
                  }}
                  className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl text-sm font-medium hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Book Appointment
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Book Appointment</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Search patient by phone number</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowBookingModal(false);
                    resetBookingForm();
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body - Scrollable */}
            <form onSubmit={handleBookAppointment} className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-5">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs">
                <div className={`flex items-center gap-1.5 ${selectedPatient ? "text-emerald-600" : "text-teal-600"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedPatient ? "bg-emerald-100" : "bg-teal-100"}`}>
                    {selectedPatient ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : "1"}
                  </span>
                  <span className="font-semibold">Patient</span>
                </div>
                <div className="flex-1 h-px bg-gray-200"></div>
                <div className={`flex items-center gap-1.5 ${bookingForm.appointmentTime ? "text-emerald-600" : selectedPatient ? "text-teal-600" : "text-gray-400"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${bookingForm.appointmentTime ? "bg-emerald-100" : selectedPatient ? "bg-teal-100" : "bg-gray-100"}`}>
                    {bookingForm.appointmentTime ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : "2"}
                  </span>
                  <span className="font-semibold">Schedule</span>
                </div>
                <div className="flex-1 h-px bg-gray-200"></div>
                <div className={`flex items-center gap-1.5 ${selectedPatient && bookingForm.appointmentTime ? "text-teal-600" : "text-gray-400"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedPatient && bookingForm.appointmentTime ? "bg-teal-100" : "bg-gray-100"}`}>3</span>
                  <span className="font-semibold">Confirm</span>
                </div>
              </div>

              {/* Patient Search by Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Patient
                </label>
                {!selectedPatient ? (
                  <>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <input
                        type="tel"
                        value={phoneQuery}
                        onChange={(e) => {
                          setPhoneQuery(e.target.value);
                          setHasSearched(false);
                        }}
                        placeholder="Search by phone number, name, or patient ID..."
                        className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base text-gray-900 bg-gray-50 placeholder:text-gray-400"
                        autoFocus
                      />
                      {searchingPatients && (
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                          <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>

                    {/* Patient Results */}
                    {patients.length > 0 && (
                      <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                        <div className="px-3 py-2 bg-gray-50 border-b text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                          {patients.length} patient{patients.length > 1 ? "s" : ""} found
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {patients.map((patient) => (
                            <button
                              key={patient._id}
                              type="button"
                              onClick={() => {
                                setSelectedPatient(patient);
                                setPatients([]);
                              }}
                              className="w-full p-3 text-left hover:bg-teal-50 transition-colors border-b border-gray-50 last:border-b-0 flex items-center gap-3"
                            >
                              <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-white font-bold text-xs">
                                  {patient.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-gray-900 text-base">{patient.name}</p>
                                <p className="text-sm text-gray-400">
                                  {patient.phone} &middot; {patient.age}y {patient.gender} &middot; {patient.patientId}
                                </p>
                              </div>
                              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          ))}
                        </div>
                        {/* Add New Patient */}
                        <Link
                          href="/frontdesk/patients?action=new"
                          className="flex items-center gap-2.5 px-3 py-2.5 border-t border-gray-200 bg-gray-50 hover:bg-teal-50 transition-colors text-teal-700"
                        >
                          <div className="w-9 h-9 border-2 border-dashed border-teal-300 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          </div>
                          <span className="text-sm font-semibold">Can&apos;t find patient? Add New</span>
                          <svg className="w-4 h-4 text-teal-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Link>
                      </div>
                    )}

                    {/* No Results */}
                    {hasSearched && patients.length === 0 && phoneQuery.length >= 3 && (
                      <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-base font-semibold text-amber-800">No patient found</p>
                            <p className="text-sm text-amber-600 mt-0.5">Register the patient first, then book an appointment.</p>
                            <Link
                              href="/frontdesk/patients?action=new"
                              className="inline-flex items-center gap-1.5 mt-2.5 px-3.5 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors shadow-sm"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                              </svg>
                              Add New Patient
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-3.5 bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full flex items-center justify-center shadow-sm">
                        <span className="text-white font-bold text-sm">
                          {selectedPatient.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-base">{selectedPatient.name}</p>
                        <p className="text-sm text-teal-600">
                          {selectedPatient.phone} &middot; {selectedPatient.age}y {selectedPatient.gender} &middot; {selectedPatient.patientId}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null);
                        setPhoneQuery("");
                        setHasSearched(false);
                      }}
                      className="px-3 py-1.5 text-teal-700 hover:bg-teal-100 rounded-lg text-xs font-semibold transition-colors"
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>

              {/* Date & Time Row */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={bookingForm.appointmentDate}
                    onChange={(e) => {
                      setBookingForm({ ...bookingForm, appointmentDate: e.target.value, appointmentTime: "" });
                      fetchSlots(e.target.value);
                    }}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                    required
                  />
                </div>
              </div>

              {/* Time Slots */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Time Slot
                  {bookingForm.appointmentTime && (
                    <span className="ml-2 text-teal-600 normal-case tracking-normal font-bold">
                      Selected: {bookingForm.appointmentTime}
                    </span>
                  )}
                </label>
                {slots.length > 0 ? (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                    {slots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => handleTimeSlotClick(slot)}
                        className={`relative py-2.5 px-1 rounded-xl text-sm font-semibold transition-all ${
                          bookingForm.appointmentTime === slot.time
                            ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/25 scale-[1.02]"
                            : slot.available
                            ? "bg-white hover:bg-teal-50 text-gray-700 border border-gray-200 hover:border-teal-300"
                            : "bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-50 hover:text-gray-500"
                        }`}
                      >
                        <span className={!slot.available && bookingForm.appointmentTime !== slot.time ? "line-through decoration-1" : ""}>{slot.time}</span>
                        {!slot.available && bookingForm.appointmentTime !== slot.time && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-gray-400 rounded-full border-2 border-white"></span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center bg-gray-50 rounded-xl border border-gray-200">
                    <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-xs text-gray-400 mt-2">Loading slots...</p>
                  </div>
                )}
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Appointment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "consultation", label: "New Consultation", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
                    { value: "follow-up", label: "Follow-up Visit", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setBookingForm({ ...bookingForm, type: t.value })}
                      className={`p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                        bookingForm.type === t.value
                          ? "border-teal-500 bg-teal-50 shadow-sm"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        bookingForm.type === t.value ? "bg-teal-500 text-white" : "bg-gray-100 text-gray-500"
                      }`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                        </svg>
                      </div>
                      <span className={`text-sm font-semibold ${
                        bookingForm.type === t.value ? "text-teal-700" : "text-gray-600"
                      }`}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Consultation Fee + Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Fee (₹) <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">₹</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={bookingForm.consultationFee}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^\d*\.?\d*$/.test(v))
                          setBookingForm({ ...bookingForm, consultationFee: v });
                      }}
                      placeholder="e.g. 500"
                      className="w-full pl-7 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm bg-gray-50 placeholder:text-gray-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Notes <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={bookingForm.notes}
                    onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                    rows={1}
                    placeholder="Any additional notes..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none resize-none text-sm bg-gray-50 placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowBookingModal(false);
                    resetBookingForm();
                  }}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedPatient || !bookingForm.appointmentTime}
                  className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-teal-500/20 disabled:shadow-none"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Booking...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Confirm Booking
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Double Booking Confirmation Modal */}
      {showDoubleBookConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 text-center">Slot Already Booked</h3>
            <p className="text-base text-gray-500 text-center mt-2">
              An appointment already exists at <span className="font-bold text-gray-700">{pendingTimeSlot}</span>. Do you still want to book at this time?
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowDoubleBookConfirm(false);
                  setPendingTimeSlot("");
                }}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base"
              >
                Pick Another
              </button>
              <button
                type="button"
                onClick={confirmDoubleBook}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-semibold text-base shadow-md shadow-amber-500/20"
              >
                Book Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clinic Timing Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Clinic Timing</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Configure appointment schedule</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-6" onClick={() => setOpenTimePicker(null)}>
              {/* Clinic Hours - Card style */}
              <div className="bg-gradient-to-br from-teal-50/50 to-cyan-50/50 rounded-2xl border border-teal-100 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 bg-teal-100 rounded-lg flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-teal-800">Clinic Hours</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Opens */}
                  <div className="flex-1 relative" onClick={(e) => e.stopPropagation()}>
                    <label className="block text-[10px] text-teal-600/70 mb-1 font-semibold uppercase tracking-wider">Opens</label>
                    <button
                      type="button"
                      onClick={() => setOpenTimePicker(openTimePicker === "start" ? null : "start")}
                      className={`w-full px-3 py-2.5 border rounded-xl text-sm font-bold text-gray-800 bg-white flex items-center justify-between transition-all ${
                        openTimePicker === "start" ? "border-teal-500 ring-2 ring-teal-500/20" : "border-teal-200 hover:border-teal-400"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatHour(editSettings.startHour)}
                      </div>
                      <svg className={`w-3.5 h-3.5 text-teal-400 transition-transform ${openTimePicker === "start" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openTimePicker === "start" && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-teal-200 rounded-xl shadow-xl shadow-teal-500/10 z-10 p-2 max-h-48 overflow-y-auto">
                        <div className="grid grid-cols-4 gap-1">
                          {Array.from({ length: 24 }, (_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => { setEditSettings({ ...editSettings, startHour: i }); setOpenTimePicker(null); }}
                              className={`py-1.5 px-1 rounded-lg text-xs font-semibold transition-all ${
                                editSettings.startHour === i
                                  ? "bg-teal-500 text-white shadow-sm"
                                  : "text-gray-600 hover:bg-teal-50 hover:text-teal-700"
                              }`}
                            >
                              {formatHour(i)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center pt-4">
                    <div className="w-6 h-px bg-teal-300"></div>
                    <span className="text-[10px] text-teal-400 font-semibold mt-0.5">to</span>
                  </div>
                  {/* Closes */}
                  <div className="flex-1 relative" onClick={(e) => e.stopPropagation()}>
                    <label className="block text-[10px] text-teal-600/70 mb-1 font-semibold uppercase tracking-wider">Closes</label>
                    <button
                      type="button"
                      onClick={() => setOpenTimePicker(openTimePicker === "end" ? null : "end")}
                      className={`w-full px-3 py-2.5 border rounded-xl text-sm font-bold text-gray-800 bg-white flex items-center justify-between transition-all ${
                        openTimePicker === "end" ? "border-teal-500 ring-2 ring-teal-500/20" : "border-teal-200 hover:border-teal-400"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatHour(editSettings.endHour)}
                      </div>
                      <svg className={`w-3.5 h-3.5 text-teal-400 transition-transform ${openTimePicker === "end" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openTimePicker === "end" && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-teal-200 rounded-xl shadow-xl shadow-teal-500/10 z-10 p-2 max-h-48 overflow-y-auto">
                        <div className="grid grid-cols-4 gap-1">
                          {Array.from({ length: 24 }, (_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => { setEditSettings({ ...editSettings, endHour: i }); setOpenTimePicker(null); }}
                              className={`py-1.5 px-1 rounded-lg text-xs font-semibold transition-all ${
                                editSettings.endHour === i
                                  ? "bg-teal-500 text-white shadow-sm"
                                  : i <= editSettings.startHour
                                  ? "text-gray-300 cursor-not-allowed"
                                  : "text-gray-600 hover:bg-teal-50 hover:text-teal-700"
                              }`}
                              disabled={i <= editSettings.startHour}
                            >
                              {formatHour(i)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Visual timeline */}
                <div className="mt-4">
                  <div className="bg-teal-100/50 rounded-full h-3 overflow-hidden relative">
                    <div
                      className="absolute top-0 h-full bg-gradient-to-r from-teal-400 to-cyan-400 rounded-full transition-all shadow-sm"
                      style={{
                        left: `${(editSettings.startHour / 24) * 100}%`,
                        width: `${Math.max(0, ((editSettings.endHour - editSettings.startHour) / 24) * 100)}%`,
                      }}
                    ></div>
                    {editSettings.lunchEnabled && (
                      <div
                        className="absolute top-0.5 h-2 bg-amber-400 rounded-full transition-all"
                        style={{
                          left: `${(editSettings.lunchStartHour / 24) * 100}%`,
                          width: `${Math.max(0, ((editSettings.lunchEndHour - editSettings.lunchStartHour) / 24) * 100)}%`,
                        }}
                      ></div>
                    )}
                  </div>
                  <div className="flex justify-between mt-1.5 px-0.5">
                    <span className="text-[9px] text-teal-500/60 font-medium">12 AM</span>
                    <span className="text-[9px] text-teal-500/60 font-medium">6 AM</span>
                    <span className="text-[9px] text-teal-500/60 font-medium">12 PM</span>
                    <span className="text-[9px] text-teal-500/60 font-medium">6 PM</span>
                    <span className="text-[9px] text-teal-500/60 font-medium">12 AM</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 justify-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-2 bg-gradient-to-r from-teal-400 to-cyan-400 rounded-full"></div>
                      <span className="text-[10px] text-gray-500 font-medium">Open</span>
                    </div>
                    {editSettings.lunchEnabled && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-2 bg-amber-400 rounded-full"></div>
                        <span className="text-[10px] text-gray-500 font-medium">Lunch</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Appointment Duration */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-gray-800">Appointment Duration</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[10, 15, 20, 30, 45].map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => setEditSettings({ ...editSettings, slotDuration: duration })}
                      className={`py-2.5 rounded-xl text-center transition-all border-2 ${
                        editSettings.slotDuration === duration
                          ? "border-teal-500 bg-teal-500 text-white shadow-md shadow-teal-500/25"
                          : "border-gray-200 bg-white text-gray-600 hover:border-teal-300 hover:bg-teal-50"
                      }`}
                    >
                      <span className="text-sm font-bold block">{duration}</span>
                      <span className={`text-[10px] ${editSettings.slotDuration === duration ? "text-teal-100" : "text-gray-400"}`}>min</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-xs text-gray-500 font-medium">Custom duration:</span>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={editSettings.slotDuration}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 5 && val <= 60) {
                        setEditSettings({ ...editSettings, slotDuration: val });
                      }
                    }}
                    className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white font-bold text-gray-800"
                  />
                  <span className="text-xs text-gray-400">min</span>
                </div>
              </div>

              {/* Lunch Break */}
              <div className={`rounded-2xl border p-4 transition-all ${editSettings.lunchEnabled ? "bg-amber-50/50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${editSettings.lunchEnabled ? "bg-amber-100" : "bg-gray-200"}`}>
                      <span className="text-sm">{editSettings.lunchEnabled ? "\u2615" : "\u23F8"}</span>
                    </div>
                    <div>
                      <span className={`text-sm font-bold ${editSettings.lunchEnabled ? "text-amber-800" : "text-gray-500"}`}>Lunch Break</span>
                      {!editSettings.lunchEnabled && <p className="text-[10px] text-gray-400 font-medium">No break scheduled</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditSettings({ ...editSettings, lunchEnabled: !editSettings.lunchEnabled })}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                      editSettings.lunchEnabled ? "bg-amber-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                        editSettings.lunchEnabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                {editSettings.lunchEnabled && (
                  <div className="flex items-center gap-3 mt-4">
                    {/* Lunch From */}
                    <div className="flex-1 relative" onClick={(e) => e.stopPropagation()}>
                      <label className="block text-[10px] text-amber-600/70 mb-1 font-semibold uppercase tracking-wider">From</label>
                      <button
                        type="button"
                        onClick={() => setOpenTimePicker(openTimePicker === "lunchStart" ? null : "lunchStart")}
                        className={`w-full px-3 py-2.5 border rounded-xl text-sm font-bold text-gray-800 bg-white flex items-center justify-between transition-all ${
                          openTimePicker === "lunchStart" ? "border-amber-500 ring-2 ring-amber-500/20" : "border-amber-200 hover:border-amber-400"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatHour(editSettings.lunchStartHour)}
                        </div>
                        <svg className={`w-3.5 h-3.5 text-amber-400 transition-transform ${openTimePicker === "lunchStart" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {openTimePicker === "lunchStart" && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-amber-200 rounded-xl shadow-xl shadow-amber-500/10 z-10 p-2 max-h-48 overflow-y-auto">
                          <div className="grid grid-cols-4 gap-1">
                            {Array.from({ length: 24 }, (_, i) => {
                              const disabled = i < editSettings.startHour || i >= editSettings.endHour;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => { if (!disabled) { setEditSettings({ ...editSettings, lunchStartHour: i }); setOpenTimePicker(null); }}}
                                  className={`py-1.5 px-1 rounded-lg text-xs font-semibold transition-all ${
                                    editSettings.lunchStartHour === i
                                      ? "bg-amber-500 text-white shadow-sm"
                                      : disabled
                                      ? "text-gray-300 cursor-not-allowed"
                                      : "text-gray-600 hover:bg-amber-50 hover:text-amber-700"
                                  }`}
                                  disabled={disabled}
                                >
                                  {formatHour(i)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-center pt-4">
                      <div className="w-6 h-px bg-amber-300"></div>
                      <span className="text-[10px] text-amber-400 font-semibold mt-0.5">to</span>
                    </div>
                    {/* Lunch Until */}
                    <div className="flex-1 relative" onClick={(e) => e.stopPropagation()}>
                      <label className="block text-[10px] text-amber-600/70 mb-1 font-semibold uppercase tracking-wider">Until</label>
                      <button
                        type="button"
                        onClick={() => setOpenTimePicker(openTimePicker === "lunchEnd" ? null : "lunchEnd")}
                        className={`w-full px-3 py-2.5 border rounded-xl text-sm font-bold text-gray-800 bg-white flex items-center justify-between transition-all ${
                          openTimePicker === "lunchEnd" ? "border-amber-500 ring-2 ring-amber-500/20" : "border-amber-200 hover:border-amber-400"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatHour(editSettings.lunchEndHour)}
                        </div>
                        <svg className={`w-3.5 h-3.5 text-amber-400 transition-transform ${openTimePicker === "lunchEnd" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {openTimePicker === "lunchEnd" && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-amber-200 rounded-xl shadow-xl shadow-amber-500/10 z-10 p-2 max-h-48 overflow-y-auto">
                          <div className="grid grid-cols-4 gap-1">
                            {Array.from({ length: 24 }, (_, i) => {
                              const disabled = i <= editSettings.lunchStartHour || i > editSettings.endHour;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => { if (!disabled) { setEditSettings({ ...editSettings, lunchEndHour: i }); setOpenTimePicker(null); }}}
                                  className={`py-1.5 px-1 rounded-lg text-xs font-semibold transition-all ${
                                    editSettings.lunchEndHour === i
                                      ? "bg-amber-500 text-white shadow-sm"
                                      : disabled
                                      ? "text-gray-300 cursor-not-allowed"
                                      : "text-gray-600 hover:bg-amber-50 hover:text-amber-700"
                                  }`}
                                  disabled={disabled}
                                >
                                  {formatHour(i)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Summary Card */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Summary</span>
                </div>
                <div className="divide-y divide-gray-50">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
                      <span className="text-sm text-gray-600">Working hours</span>
                    </div>
                    <span className="text-sm font-bold text-gray-800">
                      {formatHour(editSettings.startHour)} - {formatHour(editSettings.endHour)}
                      <span className="text-gray-400 font-normal ml-1.5">
                        ({(() => {
                          let totalHrs = editSettings.endHour - editSettings.startHour;
                          if (editSettings.lunchEnabled) totalHrs -= (editSettings.lunchEndHour - editSettings.lunchStartHour);
                          return `${Math.max(0, totalHrs)}h`;
                        })()})
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                      <span className="text-sm text-gray-600">Each appointment</span>
                    </div>
                    <span className="text-sm font-bold text-gray-800">{editSettings.slotDuration} min</span>
                  </div>
                  {editSettings.lunchEnabled && (
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                        <span className="text-sm text-gray-600">Lunch break</span>
                      </div>
                      <span className="text-sm font-bold text-amber-600">
                        {formatHour(editSettings.lunchStartHour)} - {formatHour(editSettings.lunchEndHour)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3 bg-teal-50/50">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-teal-600"></div>
                      <span className="text-sm font-semibold text-teal-700">Total slots per day</span>
                    </div>
                    <span className="text-lg font-black text-teal-600">
                      {(() => {
                        let totalMinutes = (editSettings.endHour - editSettings.startHour) * 60;
                        if (editSettings.lunchEnabled) {
                          totalMinutes -= (editSettings.lunchEndHour - editSettings.lunchStartHour) * 60;
                        }
                        return Math.max(0, Math.floor(totalMinutes / editSettings.slotDuration));
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 sm:p-6 border-t border-gray-100 flex-shrink-0">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={savingSettings}
                  className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-teal-500/20 disabled:shadow-none"
                >
                  {savingSettings ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Settings
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FrontdeskAppointmentsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <FrontdeskAppointmentsPageInner />
    </Suspense>
  );
}
