"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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

interface Visit {
  _id: string;
  visitType: "dermatology" | "cosmetology";
  consultationDate: string;
  status: "draft" | "completed";
  diagnosis?: string;
  assessment?: string;
  procedureName?: string;
  procedureTotal?: number;
}

function PatientProfilePageInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const patientId = params.id as string;

  const appointmentId = searchParams.get("appointmentId");

  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit drawer state
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editForm, setEditForm] = useState({
    allergies: "",
    medicalHistory: "",
    age: "",
    address: "",
    email: "",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // AI Summary states
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryStreamText, setSummaryStreamText] = useState("");
  const [summaryMeta, setSummaryMeta] = useState<{ visitCount: number; lastVisit?: string } | null>(null);
  const [summaryError, setSummaryError] = useState("");

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPatientData = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const patientResponse = await fetch(`/api/tier2/patients/${patientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const patientData = await patientResponse.json();
      if (patientData.success) {
        setPatient(patientData.data.patient);
        setVisits(patientData.data.visits || []);
      } else {
        setError(patientData.message);
      }
    } catch {
      setError("Failed to load patient data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchPatientData();
    }
  }, [patientId, router]);

  const openEditDrawer = () => {
    if (!patient) return;
    setEditForm({
      allergies: patient.allergies?.join(", ") || "",
      medicalHistory: patient.medicalHistory || "",
      age: patient.age?.toString() || "",
      address: patient.address || "",
      email: patient.email || "",
    });
    setShowEditDrawer(true);
  };

  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    setEditLoading(true);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/tier2/patients/${patient._id}`, {
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
        setShowEditDrawer(false);
        fetchPatientData();
      } else {
        showToast("error", data.message || "Failed to update patient");
      }
    } catch {
      showToast("error", "Failed to update patient");
    } finally {
      setEditLoading(false);
    }
  };

  const fetchAISummary = async () => {
    setSummaryLoading(true);
    setSummaryError("");
    setSummaryStreamText("");
    setSummaryMeta(null);
    setShowSummaryModal(true);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/tier2/patients/${patientId}/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}));
        setSummaryError((err as any).message || "Failed to generate AI summary. Please try again.");
        setSummaryLoading(false);
        return;
      }

      // Read metadata from headers
      const visitCount = parseInt(response.headers.get("X-Visit-Count") || "0");
      const lastVisit = response.headers.get("X-Last-Visit") || undefined;
      setSummaryMeta({ visitCount, lastVisit: lastVisit || undefined });
      setSummaryLoading(false);

      // Stream the summary text
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setSummaryStreamText(fullText);
      }
    } catch {
      setSummaryError("Failed to generate AI summary. Please try again.");
      setSummaryLoading(false);
    }
  };

  const getGenderColor = (gender: string) => {
    switch (gender) {
      case "male": return "bg-blue-50 text-blue-600 border-blue-200";
      case "female": return "bg-pink-50 text-pink-600 border-pink-200";
      default: return "bg-gray-50 text-gray-600 border-gray-200";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-teal-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading patient data...</p>
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Error Loading Patient</h3>
          <p className="text-slate-600 mb-6">{error || "Patient not found"}</p>
          <Link href="/clinic/patients">
            <button className="px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors">
              Back to Patients
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/clinic/patients"
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-teal-600 transition-colors"
                title="Back to Patients"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Patient Profile</h1>
                <p className="text-base text-gray-500 hidden sm:block">{patient.name} &middot; {patient.patientId}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {[
              { label: "Dashboard", href: "/clinic/dashboard" },
              { label: "Patients", href: "/clinic/patients", active: true },
              { label: "Consultations", href: "/clinic/consultations" },
              { label: "Pharmacy", href: "/clinic/pharmacy" },
              { label: "Templates", href: "/clinic/templates" },
              { label: "Analytics", href: "/clinic/analytics" },
              { label: "Frontdesk", href: "/clinic/settings/frontdesk" },
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Appointment Banner */}
        {appointmentId && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-amber-800 font-medium">
              Appointment linked — start a visit below to complete this appointment
            </p>
          </div>
        )}

        {/* Patient Info Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-6">
          {/* Patient header row */}
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xl">
                  {patient.name?.charAt(0)?.toUpperCase() || "?"}
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{patient.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded">{patient.patientId}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize border ${getGenderColor(patient.gender)}`}>
                    {patient.gender}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Edit Medical Info */}
              <button
                onClick={openEditDrawer}
                className="px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 hover:border-teal-300 hover:text-teal-700 transition-all flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Info
              </button>

              {/* AI Summary */}
              <button
                onClick={fetchAISummary}
                disabled={visits.length === 0}
                className={`px-4 py-2.5 font-medium rounded-xl transition-all flex items-center gap-2 text-sm ${
                  visits.length === 0
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-700 shadow-md shadow-purple-500/20"
                }`}
                title={visits.length === 0 ? "No visits to summarize" : "AI-powered summary"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI Summary
              </button>

              {/* Start Visit Buttons */}
              <Link href={`/clinic/visit/dermatology?patientId=${patient._id}${appointmentId ? `&appointmentId=${appointmentId}` : ""}`}>
                <button className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-medium rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Dermatology
                </button>
              </Link>
              <Link href={`/clinic/visit/cosmetology?patientId=${patient._id}${appointmentId ? `&appointmentId=${appointmentId}` : ""}`}>
                <button className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all shadow-md shadow-purple-500/20 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Cosmetology
                </button>
              </Link>
            </div>
          </div>

          {/* Patient Details Grid */}
          <div className="border-t border-gray-100 px-6 py-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Age</p>
                <p className="font-semibold text-gray-900">{patient.age} years</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Phone</p>
                <p className="font-semibold text-gray-900">{patient.phone}</p>
              </div>
              {patient.email && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Email</p>
                  <p className="font-semibold text-gray-900 truncate">{patient.email}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Registered</p>
                <p className="font-semibold text-gray-900">
                  {new Date(patient.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>

          {/* Medical Info Section */}
          <div className="border-t border-gray-100 px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Medical Information</h3>
              <button
                onClick={openEditDrawer}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            </div>

            <div className="space-y-4">
              {/* Allergies */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  Allergies
                </p>
                {patient.allergies && patient.allergies.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patient.allergies.map((allergy, index) => (
                      <span key={index} className="px-3 py-1 bg-red-50 text-red-700 rounded-lg text-sm font-medium border border-red-200">
                        {allergy}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No allergies recorded</p>
                )}
              </div>

              {/* Medical History */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Medical History
                </p>
                {patient.medicalHistory ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                    <p className="text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">{patient.medicalHistory}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No medical history recorded</p>
                )}
              </div>

              {/* Address */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Address
                </p>
                {patient.address ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <p className="text-sm text-amber-900">{patient.address}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No address recorded</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Visit History */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Visit History</h3>
              <p className="text-sm text-gray-500">
                {visits.length} visit{visits.length !== 1 ? "s" : ""} on record
              </p>
            </div>
          </div>

          {visits.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-base font-semibold text-gray-900 mb-1">No visits yet</h4>
              <p className="text-sm text-gray-500 mb-6">Start the first consultation for this patient</p>
              <div className="flex items-center justify-center gap-3">
                <Link href={`/clinic/visit/dermatology?patientId=${patient._id}${appointmentId ? `&appointmentId=${appointmentId}` : ""}`}>
                  <button className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-medium rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all text-sm">
                    Dermatology
                  </button>
                </Link>
                <Link href={`/clinic/visit/cosmetology?patientId=${patient._id}${appointmentId ? `&appointmentId=${appointmentId}` : ""}`}>
                  <button className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all text-sm">
                    Cosmetology
                  </button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {visits.map((visit) => (
                <Link key={visit._id} href={visit.visitType === "cosmetology" ? `/clinic/consultation/cosmetology/${visit._id}` : `/clinic/consultation/${visit._id}`}>
                  <div className="px-6 py-4 hover:bg-gray-50/70 transition-colors cursor-pointer group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          visit.visitType === "dermatology" ? "bg-teal-50 border border-teal-200" : "bg-purple-50 border border-purple-200"
                        }`}>
                          <svg className={`w-5 h-5 ${
                            visit.visitType === "dermatology" ? "text-teal-600" : "text-purple-600"
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 capitalize text-sm group-hover:text-teal-700 transition-colors">{visit.visitType} Consultation</h4>
                          <p className="text-sm text-gray-500">
                            {new Date(visit.consultationDate).toLocaleDateString("en-IN", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                          {visit.diagnosis && (
                            <p className="text-xs text-gray-400 mt-0.5">Diagnosis: {visit.diagnosis}</p>
                          )}
                          {visit.assessment && (
                            <p className="text-xs text-gray-400 mt-0.5">Assessment: {visit.assessment}</p>
                          )}
                          {visit.procedureName && (
                            <p className="text-xs text-purple-600 mt-0.5 font-medium">
                              {visit.procedureName}
                              {visit.procedureTotal != null && visit.procedureTotal > 0 && (
                                <span className="text-purple-500"> · ₹{Number(visit.procedureTotal).toLocaleString("en-IN")}</span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          visit.status === "completed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}>
                          {visit.status}
                        </span>
                        <svg className="w-5 h-5 text-gray-300 group-hover:text-teal-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Edit Medical Info Drawer */}
      {showEditDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowEditDrawer(false)} />
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
                  <p className="text-sm text-gray-500">{patient.name}</p>
                </div>
              </div>
              <button onClick={() => setShowEditDrawer(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
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
                      {patient.name?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{patient.name}</p>
                    <p className="text-sm text-gray-500">{patient.patientId} &middot; {patient.phone}</p>
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize border ${getGenderColor(patient.gender)}`}>
                    {patient.gender}
                  </span>
                  <span className="text-gray-500">{patient.age} years</span>
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
                  onClick={() => setShowEditDrawer(false)}
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

      {/* AI Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-700 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">AI Patient Briefing</h3>
                    <p className="text-purple-100 text-sm">
                      {patient?.name}{summaryMeta ? ` · ${summaryMeta.visitCount} visit${summaryMeta.visitCount !== 1 ? "s" : ""} on record` : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {summaryLoading ? (
                /* Waiting for first token */
                <div className="flex flex-col items-center justify-center py-14 gap-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-purple-100"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-t-purple-600 animate-spin"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-semibold text-slate-800">Preparing your briefing&hellip;</p>
                    <p className="text-sm text-slate-400 mt-1">Reading through the patient&apos;s visit history</p>
                  </div>
                </div>
              ) : summaryError ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h4 className="text-base font-semibold text-slate-800 mb-2">Could not generate summary</h4>
                  <p className="text-sm text-slate-500 mb-5">{summaryError}</p>
                  <button onClick={fetchAISummary} className="px-5 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors">
                    Try Again
                  </button>
                </div>
              ) : summaryStreamText ? (
                /* Streaming or done — render live */
                <div>
                  {/* Meta pill */}
                  {summaryMeta && (
                    <div className="flex items-center gap-3 mb-5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-full border border-purple-100">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        {summaryMeta.visitCount} visit{summaryMeta.visitCount !== 1 ? "s" : ""} on record
                      </span>
                      {summaryMeta.lastVisit && (
                        <span className="text-xs text-slate-400">
                          Last seen {new Date(summaryMeta.lastVisit).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Briefing card */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
                    {summaryStreamText.split("\n").map((line, i, arr) => {
                      const trimmed = line.trim();

                      // Helper: render inline **bold** markers within a string
                      const renderInline = (text: string) => {
                        const parts = text.split(/(\*\*[^*]+\*\*)/g);
                        return parts.map((part, j) =>
                          /^\*\*(.+)\*\*$/.test(part)
                            ? <strong key={j}>{part.slice(2, -2)}</strong>
                            : part
                        );
                      };

                      // Section heading: full-line **text** (no trailing content after closing **)
                      if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
                        const title = trimmed.replace(/^\*\*|\*\*$/g, "");
                        return (
                          <p key={i} className="text-[11px] font-bold uppercase tracking-widest text-purple-500 mt-6 mb-3 first:mt-0">
                            {title}
                          </p>
                        );
                      }

                      // Visit header: "DD Mon YYYY [Dermatology]", "[Cosmetology]", or "[Dermatology — N conditions]"
                      if (/^\d{2} \w+ \d{4} \[[^\]]+\]$/.test(trimmed)) {
                        const tagContent = trimmed.match(/\[([^\]]+)\]$/)?.[1] || "";
                        const isDerm = tagContent.toLowerCase().startsWith("dermatology");
                        const dateStr = trimmed.replace(/ \[[^\]]+\]$/, "");
                        const prevLines = arr.slice(0, i);
                        const hasPrev = prevLines.some(l => /^\d{2} \w+ \d{4} \[[^\]]+\]$/.test(l.trim()));
                        return (
                          <div key={i} className={`flex items-center justify-between mb-3 ${hasPrev ? "mt-5 pt-4 border-t border-slate-200" : "mt-1"}`}>
                            <span className="text-sm font-bold text-slate-800">{dateStr}</span>
                            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${isDerm ? "bg-teal-50 text-teal-700 border border-teal-100" : "bg-purple-50 text-purple-700 border border-purple-100"}`}>
                              {tagContent}
                            </span>
                          </div>
                        );
                      }

                      // Bullet: • text (Patient at a Glance)
                      if (line.startsWith("• ")) {
                        return (
                          <div key={i} className="flex gap-2.5 mb-1.5">
                            <span className="text-purple-400 leading-relaxed flex-shrink-0 select-none">•</span>
                            <span className="text-sm text-slate-700 leading-relaxed">{renderInline(line.slice(2))}</span>
                          </div>
                        );
                      }

                      // Inline bold label + content: **Label:** rest — bold label on its own line, content below
                      const issueMatch = trimmed.match(/^(\*\*[^*]+\*\*:?)\s+([\s\S]+)$/);
                      if (issueMatch) {
                        const boldLabel = issueMatch[1].replace(/^\*\*|\*\*$/g, "");
                        const rest = issueMatch[2];
                        return (
                          <div key={i} className="mb-3">
                            <span className="block text-sm font-bold text-slate-800 mb-1">{boldLabel}</span>
                            <p className="text-sm text-slate-600 leading-relaxed">{rest}</p>
                          </div>
                        );
                      }

                      // Plain text — greeting (first non-empty line before any section) or visit paragraph
                      if (trimmed) {
                        const isBeforeFirstSection = !arr.slice(0, i).some(l => /^\*\*[^*]+\*\*$/.test(l.trim()));
                        return (
                          <p key={i} className={`leading-relaxed mb-3 ${isBeforeFirstSection ? "text-sm font-medium text-slate-800" : "text-sm text-slate-600"}`}>{renderInline(trimmed)}</p>
                        );
                      }

                      return null;
                    })}
                    {/* blinking cursor while still streaming */}
                    {summaryStreamText && !summaryStreamText.endsWith("\n") && (
                      <span className="inline-block w-0.5 h-3.5 bg-purple-400 ml-0.5 align-middle animate-pulse" />
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-3.5 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-400">Powered by Claude · for clinical guidance only</p>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="px-5 py-1.5 text-sm bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
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

export default function PatientProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <PatientProfilePageInner />
    </Suspense>
  );
}
