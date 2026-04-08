"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface StaffInfo {
  id: string;
  staffId: string;
  name: string;
  email: string;
  clinicName: string;
  doctorName: string;
  permissions: {
    appointments: boolean;
    patients: boolean;
    pharmacy: boolean;
    sales: boolean;
    reports: boolean;
  };
}

interface Patient {
  _id: string;
  patientId: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  email?: string;
  address?: string;
  medicalHistory?: string;
  allergies?: string[];
  createdAt: string;
}

const PATIENTS_PER_PAGE = 20;

function FrontdeskPatientsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");

  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [token, setToken] = useState<string>("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showAddModal, setShowAddModal] = useState(action === "new");
  const [addLoading, setAddLoading] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: "",
    age: "",
    gender: "male",
    phone: "",
    email: "",
    address: "",
    medicalHistory: "",
  });

  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [editForm, setEditForm] = useState({ allergies: "", medicalHistory: "", age: "", address: "", email: "" });
  const [editLoading, setEditLoading] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const loaderRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Fetch patients — page 1 replaces, page 2+ appends
  const fetchPatients = useCallback(async (authToken: string, searchQuery: string, pageNum: number) => {
    if (pageNum === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      params.set("page", pageNum.toString());
      params.set("limit", PATIENTS_PER_PAGE.toString());

      const res = await fetch(`/api/tier2/patients/list?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const data = await res.json();
      if (data.success) {
        const newPatients = data.data.patients;
        const totalCount = data.data.pagination.total;
        const totalPages = data.data.pagination.totalPages;

        if (pageNum === 1) {
          setPatients(newPatients);
        } else {
          setPatients((prev) => [...prev, ...newPatients]);
        }

        setTotal(totalCount);
        setHasMore(pageNum < totalPages);
      }
    } catch (error) {
      console.error("Error fetching patients:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Load more patients
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !token) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPatients(token, search, nextPage);
  }, [loadingMore, hasMore, token, page, search, fetchPatients]);

  // Initial load
  useEffect(() => {
    const staffData = localStorage.getItem("frontdeskStaff");
    const savedToken = localStorage.getItem("frontdeskToken");

    if (!staffData || !savedToken) {
      router.push("/frontdesk/login");
      return;
    }

    const parsedStaff = JSON.parse(staffData);
    if (!parsedStaff.permissions?.patients) {
      router.push("/frontdesk/dashboard");
      return;
    }

    setStaff(parsedStaff);
    setToken(savedToken);
    fetchPatients(savedToken, "", 1);
  }, []);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  // Live search with debounce — resets to page 1
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      setPage(1);
      setHasMore(true);
      fetchPatients(token, search, 1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const resetForm = () => {
    setNewPatient({
      name: "",
      age: "",
      gender: "male",
      phone: "",
      email: "",
      address: "",
      medicalHistory: "",
    });
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);

    try {
      const res = await fetch("/api/tier2/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newPatient,
          age: parseInt(newPatient.age),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        resetForm();
        showToast("success", `Patient "${newPatient.name}" added successfully`);
        // Reset and reload from page 1
        setPage(1);
        setHasMore(true);
        fetchPatients(token, search, 1);
      } else {
        showToast("error", data.message || "Failed to add patient");
      }
    } catch (error) {
      showToast("error", "An error occurred. Please try again.");
    } finally {
      setAddLoading(false);
    }
  };

  const getGenderColor = (gender: string) => {
    if (gender === "male") return "from-blue-400 to-indigo-500";
    if (gender === "female") return "from-pink-400 to-rose-500";
    return "from-purple-400 to-violet-500";
  };

  const openEditDrawer = (patient: Patient) => {
    setEditForm({
      allergies: patient.allergies?.join(", ") || "",
      medicalHistory: patient.medicalHistory || "",
      age: patient.age?.toString() || "",
      address: patient.address || "",
      email: patient.email || "",
    });
    setEditingPatient(patient);
  };

  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPatient) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/tier2/patients/${editingPatient._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          allergies: editForm.allergies
            ? editForm.allergies.split(",").map((a) => a.trim()).filter(Boolean)
            : [],
          medicalHistory: editForm.medicalHistory,
          age: editForm.age ? parseInt(editForm.age) : undefined,
          address: editForm.address,
          email: editForm.email,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `${editingPatient.name}'s info updated`);
        setEditingPatient(null);
        setPage(1);
        setHasMore(true);
        fetchPatients(token, search, 1);
      } else {
        showToast("error", data.message || "Failed to update patient");
      }
    } catch {
      showToast("error", "Failed to update patient");
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notifications */}
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
                <p className="text-base text-gray-500 hidden sm:block">Manage patient records</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20 flex items-center gap-2 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="hidden sm:inline text-base">Add Patient</span>
              <span className="sm:hidden text-base">Add</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {[
              { label: "Dashboard", href: "/frontdesk/dashboard" },
              { label: "Appointments", href: "/frontdesk/appointments" },
              { label: "Patients", href: "/frontdesk/patients", active: true },
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
        {/* Search & Stats Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 w-full relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone, patient ID, or email..."
                className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base text-gray-900 bg-gray-50 placeholder:text-gray-400"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 rounded-xl border border-teal-200">
                <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-semibold text-teal-700">{total} patients</span>
              </div>
            </div>
          </div>
        </div>

        {/* Patients List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <>
              {/* Table Header Skeleton - Desktop */}
              <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={i === 1 ? "col-span-4" : "col-span-2"}>
                    <div className="h-3 bg-gray-200 rounded w-16 animate-pulse"></div>
                  </div>
                ))}
              </div>
              {/* Row Skeletons */}
              <div className="divide-y divide-gray-50">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="px-5 py-4 animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-100 flex-shrink-0"></div>
                        <div className="space-y-2 flex-1">
                          <div className="h-4 bg-gray-200 rounded-lg w-32"></div>
                          <div className="h-3 bg-gray-100 rounded w-20"></div>
                        </div>
                      </div>
                      <div className="col-span-2"><div className="h-4 bg-gray-100 rounded-lg w-16"></div></div>
                      <div className="col-span-2"><div className="h-4 bg-gray-100 rounded-lg w-24"></div></div>
                      <div className="col-span-2"><div className="h-4 bg-gray-100 rounded-lg w-28"></div></div>
                      <div className="col-span-2"><div className="h-4 bg-gray-100 rounded-lg w-20"></div></div>
                    </div>
                    <div className="md:hidden flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-100 flex-shrink-0"></div>
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 rounded-lg w-32"></div>
                        <div className="h-3 bg-gray-100 rounded-lg w-44"></div>
                      </div>
                      <div className="h-8 w-16 bg-gray-100 rounded-lg"></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : patients.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
                <svg className="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-gray-700 font-semibold text-lg">
                {search ? "No patients found" : "No patients registered yet"}
              </p>
              <p className="text-gray-400 text-base mt-1">
                {search ? `No results for "${search}"` : "Add your first patient to get started"}
              </p>
              {search ? (
                <button
                  onClick={() => setSearch("")}
                  className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-base font-medium hover:bg-gray-200 transition-all"
                >
                  Clear Search
                </button>
              ) : (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl text-base font-medium hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add First Patient
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Table Header - Desktop */}
              <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-4">Patient</div>
                <div className="col-span-2">Age / Gender</div>
                <div className="col-span-2">Phone</div>
                <div className="col-span-2">Email</div>
                <div className="col-span-2">Registered</div>
              </div>

              {/* Patient Rows */}
              <div className="divide-y divide-gray-50">
                {patients.map((patient) => (
                  <div
                    key={patient._id}
                    className="group px-5 py-4 hover:bg-gray-50/50 transition-all"
                  >
                    {/* Desktop View */}
                    <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-4 flex items-center gap-3">
                        <div className={`w-10 h-10 bg-gradient-to-br ${getGenderColor(patient.gender)} rounded-full flex items-center justify-center flex-shrink-0 shadow-sm`}>
                          <span className="text-white font-bold text-sm">
                            {patient.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-base truncate">{patient.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{patient.patientId}</p>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-base text-gray-700">{patient.age}y</span>
                        <span className="text-gray-300 mx-1.5">/</span>
                        <span className="text-sm text-gray-500 capitalize">{patient.gender}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-base text-gray-700">{patient.phone}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-gray-500 truncate block">{patient.email || "\u2014"}</span>
                      </div>
                      <div className="col-span-2 flex items-center justify-between">
                        <span className="text-sm text-gray-400">
                          {new Date(patient.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditDrawer(patient)}
                            className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Edit patient"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <Link
                            href={`/frontdesk/appointments?action=new`}
                            className="p-1.5 text-teal-500 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Book appointment"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Mobile View */}
                    <div className="md:hidden flex items-center gap-3">
                      <div className={`w-11 h-11 bg-gradient-to-br ${getGenderColor(patient.gender)} rounded-full flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        <span className="text-white font-bold text-sm">
                          {patient.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 text-base truncate">{patient.name}</p>
                          <span className="text-xs text-gray-400 font-mono flex-shrink-0">{patient.patientId}</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-0.5">
                          {patient.phone} &middot; {patient.age}y {patient.gender} &middot; {new Date(patient.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => openEditDrawer(patient)}
                          className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Edit patient"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <Link
                          href={`/frontdesk/appointments?action=new`}
                          className="p-2 text-teal-500 hover:bg-teal-50 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Infinite scroll loader */}
              <div ref={loaderRef} className="px-5 py-4">
                {loadingMore ? (
                  <div className="flex items-center justify-center gap-3 py-2">
                    <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm text-gray-500 font-medium">Loading more patients...</span>
                  </div>
                ) : hasMore ? (
                  <div className="h-1"></div>
                ) : patients.length > PATIENTS_PER_PAGE ? (
                  <p className="text-center text-sm text-gray-400 py-2">
                    Showing all {patients.length} of {total} patients
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Edit Patient Drawer */}
      {editingPatient && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingPatient(null)} />
          <div className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto animate-in slide-in-from-right">
            {/* Drawer Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Update Patient Info</h3>
                  <p className="text-sm text-gray-500">{editingPatient.name}</p>
                </div>
              </div>
              <button onClick={() => setEditingPatient(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Patient Summary Card */}
            <div className="px-6 pt-5 pb-2">
              <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl p-4 border border-teal-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${getGenderColor(editingPatient.gender)} flex items-center justify-center`}>
                    <span className="text-white font-bold text-base">{editingPatient.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{editingPatient.name}</p>
                    <p className="text-sm text-gray-500">{editingPatient.patientId} &middot; {editingPatient.phone}</p>
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize border bg-gray-50 text-gray-600 border-gray-200">{editingPatient.gender}</span>
                  <span className="text-gray-500">{editingPatient.age} years</span>
                </div>
              </div>
            </div>

            {/* Edit Form */}
            <form onSubmit={handleUpdatePatient} className="px-6 py-5 space-y-5">
              {/* Allergies */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  Allergies
                </label>
                <input
                  type="text"
                  value={editForm.allergies}
                  onChange={(e) => setEditForm({ ...editForm, allergies: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                  placeholder="e.g. Penicillin, Dust, Pollen"
                />
                <p className="text-xs text-gray-400 mt-1">Separate multiple allergies with commas</p>
              </div>

              {/* Medical History */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Medical History
                </label>
                <textarea
                  value={editForm.medicalHistory}
                  onChange={(e) => setEditForm({ ...editForm, medicalHistory: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50 resize-none"
                  placeholder="Previous conditions, surgeries, ongoing treatments..."
                />
              </div>

              {/* Age */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Age
                </label>
                <input
                  type="number"
                  value={editForm.age}
                  onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                  min="0"
                  max="150"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                  placeholder="Patient's current age"
                />
              </div>

              {/* Address */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Address
                </label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                  placeholder="Patient's address"
                />
              </div>

              {/* Email */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                  placeholder="email@example.com"
                />
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPatient(null)}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-teal-500/20 disabled:shadow-none"
                >
                  {editLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </span>
                  ) : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Patient Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Add New Patient</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Fill in patient details below</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddPatient} className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newPatient.name}
                  onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                  placeholder="Enter patient name"
                  required
                  autoFocus
                />
              </div>

              {/* Age & Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Age <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={newPatient.age}
                    onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                    placeholder="Age"
                    min="0"
                    max="150"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Gender <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { value: "male", label: "Male" },
                      { value: "female", label: "Female" },
                      { value: "other", label: "Other" },
                    ].map((g) => (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => setNewPatient({ ...newPatient, gender: g.value })}
                        className={`py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                          newPatient.gender === g.value
                            ? "border-teal-500 bg-teal-50 text-teal-700"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Phone Number <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm font-medium">+91</span>
                  </div>
                  <input
                    type="tel"
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="w-full pl-14 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                    placeholder="10-digit phone number"
                    pattern="[0-9]{10}"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Email <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                </label>
                <input
                  type="email"
                  value={newPatient.email}
                  onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                  placeholder="patient@email.com"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Address <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={newPatient.address}
                  onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50"
                  placeholder="Patient address"
                />
              </div>

              {/* Medical History */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Medical History <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>
                </label>
                <textarea
                  value={newPatient.medicalHistory}
                  onChange={(e) => setNewPatient({ ...newPatient, medicalHistory: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none resize-none text-base bg-gray-50 placeholder:text-gray-400"
                  rows={2}
                  placeholder="Any existing conditions or allergies..."
                />
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-teal-500/20 disabled:shadow-none"
                >
                  {addLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Adding...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Add Patient
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FrontdeskPatientsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <FrontdeskPatientsPageInner />
    </Suspense>
  );
}
