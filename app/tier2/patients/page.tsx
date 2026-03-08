"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

export default function PatientsPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearchQuery(value), 300);
  };

  // Add patient modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", age: "", gender: "male", phone: "", email: "" });
  const [addLoading, setAddLoading] = useState(false);

  // Edit drawer state
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [editForm, setEditForm] = useState({
    allergies: "",
    medicalHistory: "",
    age: "",
    address: "",
    email: "",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPatients = useCallback(async (pageNum: number) => {
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
      if (searchQuery) params.set("search", searchQuery);

      const response = await fetch(`/api/tier2/patients/list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        const newItems = data.data.patients;
        if (isFirst) {
          setPatients(newItems);
        } else {
          setPatients((prev) => [...prev, ...newItems]);
          setPage(pageNum);
        }
        setHasMore(pageNum < data.data.pagination.pages);
        setTotal(data.data.pagination.total);
      }
    } catch (err) {
      console.error("Failed to fetch patients:", err);
    } finally {
      if (isFirst) setLoading(false);
      else setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [searchQuery, router]);

  useEffect(() => {
    fetchPatients(1);
  }, [fetchPatients]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isFetchingRef.current) {
          fetchPatients(page + 1);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, page, fetchPatients]);

  // Fetch full patient details when opening edit drawer
  const openEditDrawer = async (patient: Patient, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/tier2/patients/${patient._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        const p = data.data.patient;
        setEditPatient(p);
        setEditForm({
          allergies: p.allergies?.join(", ") || "",
          medicalHistory: p.medicalHistory || "",
          age: p.age?.toString() || "",
          address: p.address || "",
          email: p.email || "",
        });
      } else {
        showToast("error", "Failed to load patient details");
      }
    } catch {
      showToast("error", "Failed to load patient details");
    }
  };

  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPatient) return;
    setEditLoading(true);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/tier2/patients/${editPatient._id}`, {
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

      const data = await response.json();
      if (data.success) {
        showToast("success", "Patient updated successfully!");
        setEditPatient(null);
        fetchPatients(1);
      } else {
        showToast("error", data.message || "Failed to update patient");
      }
    } catch {
      showToast("error", "Failed to update patient");
    } finally {
      setEditLoading(false);
    }
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/tier2/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...addForm,
          age: parseInt(addForm.age),
          allergies: [],
        }),
      });
      const data = await response.json();
      if (data.success) {
        showToast("success", "Patient added successfully!");
        setAddForm({ name: "", age: "", gender: "male", phone: "", email: "" });
        setShowAddModal(false);
        setSearchInput("");
        setSearchQuery("");
        setTimeout(() => router.push(`/tier2/patients/${data.data.patient._id}`), 800);
      } else {
        showToast("error", data.message);
      }
    } catch {
      showToast("error", "Failed to add patient");
    } finally {
      setAddLoading(false);
    }
  };

  const getGenderColor = (gender: string) => {
    switch (gender) {
      case "male": return "bg-blue-50 text-blue-600";
      case "female": return "bg-pink-50 text-pink-600";
      default: return "bg-gray-50 text-gray-600";
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
                <p className="text-base text-gray-500 hidden sm:block">{total} patients registered</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20 flex items-center gap-2 font-medium text-sm"
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
              { label: "Dashboard", href: "/tier2/dashboard" },
              { label: "Patients", href: "/tier2/patients", active: true },
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name, phone, or patient ID..."
              className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-white text-gray-900 text-base shadow-sm"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(""); setSearchQuery(""); }}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Patients List */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
            </div>
          ) : patients.length === 0 ? (
            <div className="text-center py-16">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-gray-500 font-medium">No patients found</p>
              {searchInput && <p className="text-sm text-gray-400 mt-1">Try a different search term</p>}
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="hidden md:grid md:grid-cols-12 gap-4 px-5 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <div className="col-span-3">Patient</div>
                <div className="col-span-2">ID</div>
                <div className="col-span-1 text-center">Age</div>
                <div className="col-span-1 text-center">Gender</div>
                <div className="col-span-2">Phone</div>
                <div className="col-span-2 text-right">Registered</div>
                <div className="col-span-1 text-center">Action</div>
              </div>

              {/* Patient rows */}
              <div className="divide-y divide-gray-100">
                {patients.map((patient) => (
                  <div key={patient._id} className="group px-5 py-4 hover:bg-gray-50/70 transition-colors flex items-center gap-4 md:grid md:grid-cols-12 md:gap-4">
                    {/* Patient name + avatar — clickable to detail page */}
                    <Link href={`/tier2/patients/${patient._id}`} className="flex items-center gap-3 flex-1 min-w-0 md:col-span-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">
                          {patient.name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-teal-700 transition-colors">{patient.name}</p>
                        {patient.email && (
                          <p className="text-xs text-gray-400 truncate">{patient.email}</p>
                        )}
                      </div>
                    </Link>

                    {/* Patient ID */}
                    <div className="hidden md:block md:col-span-2">
                      <span className="text-sm text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded">{patient.patientId}</span>
                    </div>

                    {/* Age */}
                    <div className="hidden md:block md:col-span-1 text-center">
                      <span className="text-sm text-gray-700">{patient.age}</span>
                    </div>

                    {/* Gender */}
                    <div className="hidden md:block md:col-span-1 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${getGenderColor(patient.gender)}`}>
                        {patient.gender}
                      </span>
                    </div>

                    {/* Phone */}
                    <div className="hidden md:block md:col-span-2">
                      <span className="text-sm text-gray-600">{patient.phone}</span>
                    </div>

                    {/* Registered */}
                    <div className="hidden md:block md:col-span-2 text-right">
                      <span className="text-sm text-gray-400">
                        {new Date(patient.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {/* Edit button */}
                    <div className="hidden md:flex md:col-span-1 justify-center">
                      <button
                        onClick={(e) => openEditDrawer(patient, e)}
                        className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="Update Medical Info"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>

                    {/* Mobile: meta info + edit */}
                    <div className="flex items-center gap-2 md:hidden">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${getGenderColor(patient.gender)}`}>
                        {patient.gender}
                      </span>
                      <span className="text-xs text-gray-400">{patient.age}y</span>
                      <button
                        onClick={(e) => openEditDrawer(patient, e)}
                        className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors ml-auto"
                        title="Update Medical Info"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>

                    {/* Mobile arrow to detail page */}
                    <Link href={`/tier2/patients/${patient._id}`} className="flex-shrink-0 md:hidden">
                      <svg className="w-5 h-5 text-gray-300 group-hover:text-teal-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                ))}
              </div>

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="px-5 py-3 border-t bg-gray-50 flex items-center justify-center min-h-[48px]">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600" />
                    Loading more...
                  </div>
                ) : hasMore ? null : patients.length > 0 ? (
                  <p className="text-xs text-gray-400">{total} patients total</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Add Patient Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Add New Patient</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddPatient} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Full Name *</label>
                <input type="text" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" placeholder="Patient's full name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Age *</label>
                  <input type="number" value={addForm.age} onChange={(e) => setAddForm({ ...addForm, age: e.target.value })} required min="0" max="150"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" placeholder="Age" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Gender *</label>
                  <div className="flex gap-2">
                    {["male", "female", "other"].map((g) => (
                      <button key={g} type="button" onClick={() => setAddForm({ ...addForm, gender: g })}
                        className={`flex-1 py-3 rounded-xl text-sm font-semibold capitalize transition-all ${
                          addForm.gender === g
                            ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/25"
                            : "bg-gray-50 text-gray-600 border border-gray-200 hover:border-teal-300 hover:bg-teal-50"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Phone *</label>
                <input type="tel" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} required pattern="[0-9]{10}"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" placeholder="10-digit number" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Email</label>
                <input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" placeholder="email@example.com (optional)" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base">
                  Cancel
                </button>
                <button type="submit" disabled={addLoading}
                  className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-teal-500/20 disabled:shadow-none">
                  {addLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Adding...
                    </span>
                  ) : "Add Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Medical Info Drawer */}
      {editPatient && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditPatient(null)} />
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
                  <h3 className="text-lg font-bold text-gray-900">Update Medical Info</h3>
                  <p className="text-sm text-gray-500">{editPatient.name}</p>
                </div>
              </div>
              <button onClick={() => setEditPatient(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Patient Summary Card */}
            <div className="px-6 pt-5 pb-2">
              <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl p-4 border border-teal-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
                    <span className="text-white font-bold text-base">
                      {editPatient.name?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{editPatient.name}</p>
                    <p className="text-sm text-gray-500">{editPatient.patientId} &middot; {editPatient.phone}</p>
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getGenderColor(editPatient.gender)}`}>
                    {editPatient.gender}
                  </span>
                  <span className="text-gray-500">{editPatient.age} years</span>
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
                  placeholder="Comma-separated (e.g. Penicillin, Dust, Pollen)"
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
                  placeholder="Previous conditions, surgeries, ongoing treatments, chronic diseases..."
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
                  onClick={() => setEditPatient(null)}
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
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
