"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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
}

export default function PatientProfilePage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // AI Summary states
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    summary: string;
    visitCount: number;
    hasData: boolean;
    lastVisit?: string;
  } | null>(null);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    const fetchPatientData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        // Fetch patient details
        const patientResponse = await fetch(`/api/tier2/patients/${patientId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const patientData = await patientResponse.json();
        if (patientData.success) {
          setPatient(patientData.data.patient);
          setVisits(patientData.data.visits || []);
        } else {
          setError(patientData.message);
        }
      } catch (err) {
        setError("Failed to load patient data");
      } finally {
        setLoading(false);
      }
    };

    if (patientId) {
      fetchPatientData();
    }
  }, [patientId, router]);

  const fetchAISummary = async () => {
    setSummaryLoading(true);
    setSummaryError("");
    setShowSummaryModal(true);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/tier2/patients/${patientId}/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setSummaryData(data.data);
      } else {
        setSummaryError(data.message || "Failed to generate summary");
      }
    } catch (err) {
      setSummaryError("Failed to generate AI summary. Please try again.");
    } finally {
      setSummaryLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading patient data...</p>
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Error Loading Patient</h3>
          <p className="text-slate-600 mb-6">{error || "Patient not found"}</p>
          <Link href="/tier2/patients">
            <button className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              Back to Patients
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
      {/* Animated background */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-slate-200 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-lg shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <Link href="/tier2/dashboard">
            <h1 className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors">
              DermaHMS
            </h1>
          </Link>
          <Link href="/tier2/patients">
            <button className="flex items-center space-x-2 text-slate-600 hover:text-blue-600 font-medium transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Patients</span>
            </button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        {/* Patient Info Card */}
        <div className="bg-white rounded-xl shadow-md p-8 border border-gray-200 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-slate-900">{patient.name}</h2>
                <p className="text-slate-600">Patient ID: {patient.patientId}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              {/* AI Summary Button */}
              <button
                onClick={fetchAISummary}
                disabled={visits.length === 0}
                className={`px-5 py-3 font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl flex items-center space-x-2 ${
                  visits.length === 0
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-gradient-to-br from-purple-600 to-indigo-700 text-white hover:from-purple-700 hover:to-indigo-800"
                }`}
                title={visits.length === 0 ? "No visits to summarize" : "Get AI-powered summary of recent visits"}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span>AI Summary</span>
              </button>

              {/* Start New Visit Button */}
              <Link href={`/tier2/visit/new?patientId=${patient._id}`}>
                <button className="px-6 py-3 bg-gradient-to-br from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Start New Visit</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Patient Details Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div>
              <p className="text-sm text-slate-500 mb-1">Age</p>
              <p className="font-semibold text-slate-900">{patient.age} years</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Gender</p>
              <p className="font-semibold text-slate-900 capitalize">{patient.gender}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Phone</p>
              <p className="font-semibold text-slate-900">{patient.phone}</p>
            </div>
            {patient.email && (
              <div>
                <p className="text-sm text-slate-500 mb-1">Email</p>
                <p className="font-semibold text-slate-900">{patient.email}</p>
              </div>
            )}
          </div>

          {/* Additional Info */}
          {(patient.address || patient.medicalHistory || (patient.allergies && patient.allergies.length > 0)) && (
            <div className="border-t border-gray-200 pt-6 space-y-4">
              {patient.address && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">Address</p>
                  <p className="text-slate-600">{patient.address}</p>
                </div>
              )}
              {patient.medicalHistory && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">Medical History</p>
                  <p className="text-slate-600">{patient.medicalHistory}</p>
                </div>
              )}
              {patient.allergies && patient.allergies.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">Allergies</p>
                  <div className="flex flex-wrap gap-2">
                    {patient.allergies.map((allergy, index) => (
                      <span key={index} className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm font-medium border border-red-200">
                        {allergy}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Visit History */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-2xl font-bold text-slate-900">Visit History</h3>
            <p className="text-slate-600">
              {visits.length} visit{visits.length !== 1 ? "s" : ""} on record
            </p>
          </div>

          {visits.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-slate-900 mb-2">No visits yet</h4>
              <p className="text-slate-600 mb-6">Start the first consultation for this patient</p>
              <Link href={`/tier2/visit/new?patientId=${patient._id}`}>
                <button className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                  Start New Visit
                </button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {visits.map((visit) => (
                <Link key={visit._id} href={`/tier2/consultation/${visit._id}`}>
                  <div className="p-6 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          visit.visitType === "dermatology" ? "bg-blue-100" : "bg-purple-100"
                        }`}>
                          <svg className={`w-6 h-6 ${
                            visit.visitType === "dermatology" ? "text-blue-600" : "text-purple-600"
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 capitalize">{visit.visitType} Consultation</h4>
                          <p className="text-sm text-slate-600">
                            {new Date(visit.consultationDate).toLocaleDateString("en-US", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                          {visit.diagnosis && (
                            <p className="text-sm text-slate-500 mt-1">Diagnosis: {visit.diagnosis}</p>
                          )}
                          {visit.assessment && (
                            <p className="text-sm text-slate-500 mt-1">Assessment: {visit.assessment}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          visit.status === "completed"
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : "bg-amber-100 text-amber-700 border border-amber-200"
                        }`}>
                          {visit.status}
                        </span>
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* AI Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                    <h3 className="text-xl font-bold text-white">AI Patient Summary</h3>
                    <p className="text-purple-100 text-sm">
                      {patient?.name} • {summaryData?.visitCount || 0} recent visits analyzed
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
                <div className="text-center py-12">
                  <div className="relative mx-auto w-20 h-20 mb-6">
                    <div className="absolute inset-0 rounded-full border-4 border-purple-200"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-purple-600 border-t-transparent animate-spin"></div>
                    <div className="absolute inset-3 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center">
                      <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">Analyzing Patient History...</h4>
                  <p className="text-slate-600">AI is reviewing the patient's recent visits to generate a comprehensive summary</p>
                </div>
              ) : summaryError ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">Failed to Generate Summary</h4>
                  <p className="text-slate-600 mb-6">{summaryError}</p>
                  <button
                    onClick={fetchAISummary}
                    className="px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : summaryData ? (
                <div>
                  {/* Summary Header Info */}
                  {summaryData.lastVisit && (
                    <div className="mb-6 p-4 bg-purple-50 rounded-xl border border-purple-100">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-purple-700 font-medium">
                          <strong>{summaryData.visitCount}</strong> visits analyzed
                        </span>
                        <span className="text-purple-600">
                          Last visit: {new Date(summaryData.lastVisit).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Summary Content */}
                  <div className="prose prose-slate max-w-none">
                    <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl p-6 border border-gray-200">
                      {summaryData.summary.split("\n").map((line, index) => {
                        // Handle markdown-like formatting
                        if (line.startsWith("**") && line.endsWith("**")) {
                          return (
                            <h4 key={index} className="text-lg font-bold text-slate-900 mt-4 mb-2 first:mt-0">
                              {line.replace(/\*\*/g, "")}
                            </h4>
                          );
                        } else if (line.startsWith("- ") || line.startsWith("• ")) {
                          return (
                            <div key={index} className="flex items-start space-x-2 ml-2 mb-1">
                              <span className="text-purple-600 mt-1">•</span>
                              <span className="text-slate-700">{line.replace(/^[-•]\s*/, "")}</span>
                            </div>
                          );
                        } else if (line.trim()) {
                          return (
                            <p key={index} className="text-slate-700 mb-2">
                              {line}
                            </p>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-amber-800">
                        <strong>Note:</strong> This AI-generated summary is intended to assist clinical decision-making and should not replace thorough review of patient records. Always verify critical information from original consultation notes.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-500">
                  Powered by Claude AI
                </p>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="px-6 py-2 bg-slate-600 text-white font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
