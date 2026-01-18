"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AIResult {
  predictions: Array<{
    condition: string;
    probability: number;
    confidence: string;
  }>;
  topPrediction: {
    condition: string;
    probability: number;
    confidence: string;
  };
  processingTime: number;
}

interface ImageResult {
  imageUrl: string;
  s3Key: string;
  aiResult: AIResult;
}

interface Scan {
  id: string;
  images: ImageResult[];
  finalResult: AIResult;
  patientInfo: {
    name: string;
    age?: number;
    gender?: string;
  };
  notes?: string;
  status: string;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export default function ScanHistoryPage() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchScans = async (page: number) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/tier1/scans?page=${page}&limit=12`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setScans(data.data.scans);
        setPagination(data.data.pagination);
      } else {
        setError(data.message || "Failed to load scan history");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScans(currentPage);
  }, [currentPage]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading && scans.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading scan history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
      {/* Animated background - softer colors */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-slate-200 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-lg shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <Link href="/tier1/dashboard">
            <h1 className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors">
              DermaHMS
            </h1>
          </Link>
          <Link href="/tier1/dashboard">
            <button className="flex items-center space-x-2 text-slate-600 hover:text-blue-600 font-medium transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Dashboard</span>
            </button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-bold text-slate-900 mb-3">Scan History</h2>
          <p className="text-slate-600 text-lg">
            {pagination ? `${pagination.totalCount} total scans` : "View all your previous scans"}
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {scans.length === 0 && !loading && !error && (
          <div className="text-center py-20 bg-white rounded-2xl shadow-md border border-gray-200">
            <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">No scans yet</h3>
            <p className="text-slate-600 mb-8 max-w-md mx-auto">Upload your first scan to get started with AI-powered skin analysis</p>
            <Link href="/tier1/upload">
              <button className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl">
                Upload New Scan
              </button>
            </Link>
          </div>
        )}

        {scans.length > 0 && (
          <>
            {/* Scans Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {scans.map((scan) => (
                <Link key={scan.id} href={`/tier1/scans/${scan.id}`}>
                  <div className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200 overflow-hidden hover:border-blue-300">
                    {/* Image */}
                    <div className="aspect-square bg-slate-100 relative overflow-hidden">
                      <img
                        src={scan.images[0]?.imageUrl}
                        alt={scan.patientInfo.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      {scan.images.length > 1 && (
                        <div className="absolute top-3 right-3 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-md">
                          +{scan.images.length - 1}
                        </div>
                      )}
                      <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-md ${
                        scan.status === "completed"
                          ? "bg-emerald-500 text-white"
                          : scan.status === "pending"
                          ? "bg-amber-500 text-white"
                          : "bg-rose-500 text-white"
                      }`}>
                        {scan.status}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-5">
                      <p className="font-bold text-slate-900 truncate mb-1 text-base">
                        {scan.patientInfo.name}
                      </p>
                      <p className="text-sm text-slate-600 truncate mb-4">
                        {scan.finalResult.topPrediction.condition}
                      </p>

                      {/* Stats */}
                      <div className="flex items-center justify-between mb-4">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${
                            scan.finalResult.topPrediction.confidence === "high"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : scan.finalResult.topPrediction.confidence === "medium"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {scan.finalResult.topPrediction.confidence}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          {new Date(scan.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Probability bar */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-500 font-medium">Confidence</span>
                          <span className="text-xs font-bold text-slate-700">
                            {(scan.finalResult.topPrediction.probability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${scan.finalResult.topPrediction.probability * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-200">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* Page info */}
                  <div className="text-sm text-slate-600">
                    Showing page <span className="font-bold text-slate-900">{pagination.page}</span> of{" "}
                    <span className="font-bold text-slate-900">{pagination.totalPages}</span>
                    {" "}({pagination.totalCount} total scans)
                  </div>

                  {/* Pagination buttons */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handlePageChange(1)}
                      disabled={!pagination.hasPrev}
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      First
                    </button>
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={!pagination.hasPrev}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      ← Prev
                    </button>

                    {/* Page numbers */}
                    <div className="hidden sm:flex items-center space-x-1">
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNum;
                        if (pagination.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= pagination.totalPages - 2) {
                          pageNum = pagination.totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }

                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                              currentPage === pageNum
                                ? "bg-blue-600 text-white shadow-md"
                                : "border border-gray-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={!pagination.hasNext}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Next →
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.totalPages)}
                      disabled={!pagination.hasNext}
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Last
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Quick Actions */}
        <div className="mt-10 flex gap-4 justify-center">
          <Link href="/tier1/upload">
            <button className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg">
              Upload New Scan
            </button>
          </Link>
          <Link href="/tier1/dashboard">
            <button className="px-8 py-3 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors shadow-md hover:shadow-lg border border-gray-300">
              Back to Dashboard
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}
