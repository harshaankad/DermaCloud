"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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

interface ScanDetails {
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
  updatedAt: string;
}

export default function ScanDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const scanId = params.id as string;

  const [scan, setScan] = useState<ScanDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchScanDetails = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const response = await fetch(`/api/tier1/scans/${scanId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        if (data.success) {
          setScan(data.data.scan);
        } else {
          setError(data.message || "Failed to load scan details");
        }
      } catch (err) {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchScanDetails();
  }, [scanId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading scan details...</p>
        </div>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-6">{error || "Scan not found"}</p>
          <Link href="/tier1/dashboard">
            <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all">
              Back to Dashboard
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Animated background */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
      <div className="absolute top-40 right-10 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/tier1/dashboard">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent cursor-pointer">
              DermaHMS
            </h1>
          </Link>
          <Link href="/tier1/dashboard">
            <button className="text-gray-600 hover:text-gray-900 font-semibold">
              ← Back to Dashboard
            </button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <div className="text-center mb-8 animate-fade-in-down">
          <h2 className="text-4xl font-bold text-gray-900 mb-2">Scan Results</h2>
          <p className="text-gray-600">
            {new Date(scan.createdAt).toLocaleString()}
          </p>
        </div>

        {/* Top Prediction Card */}
        <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-2xl p-8 mb-8 text-white animate-fade-in-up">
          <div className="text-center">
            <p className="text-blue-100 mb-2">
              {scan.images.length > 1 ? `Final Result (Averaged from ${scan.images.length} images)` : "Top Prediction"}
            </p>
            <h3 className="text-4xl font-bold mb-4">{scan.finalResult.topPrediction.condition}</h3>
            <div className="flex items-center justify-center space-x-4">
              <div className="text-center">
                <p className="text-5xl font-bold">
                  {(scan.finalResult.topPrediction.probability * 100).toFixed(1)}%
                </p>
                <p className="text-blue-100 mt-1">Probability</p>
              </div>
              <div className="text-center">
                <span className={`inline-block px-6 py-3 rounded-full text-lg font-semibold ${
                  scan.finalResult.topPrediction.confidence === "high"
                    ? "bg-green-500"
                    : scan.finalResult.topPrediction.confidence === "medium"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}>
                  {scan.finalResult.topPrediction.confidence.toUpperCase()} Confidence
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Images Gallery */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/20 animate-fade-in mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Scan Images ({scan.images.length})
          </h3>
          <div className={`grid gap-4 ${scan.images.length === 1 ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'}`}>
            {scan.images.map((img, idx) => (
              <div key={idx} className="group">
                <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden mb-2">
                  <img
                    src={img.imageUrl}
                    alt={`Scan ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Image {idx + 1} Result</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {img.aiResult.topPrediction.condition}
                  </p>
                  <p className="text-xs text-gray-600">
                    {(img.aiResult.topPrediction.probability * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Patient Info */}
          {scan.patientInfo && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-bold text-gray-900 mb-3">Patient Information</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Name</p>
                  <p className="text-sm font-semibold text-gray-900">{scan.patientInfo.name}</p>
                </div>
                {scan.patientInfo.age && (
                  <div>
                    <p className="text-xs text-gray-500">Age</p>
                    <p className="text-sm font-semibold text-gray-900">{scan.patientInfo.age} years</p>
                  </div>
                )}
                {scan.patientInfo.gender && (
                  <div>
                    <p className="text-xs text-gray-500">Gender</p>
                    <p className="text-sm font-semibold text-gray-900 capitalize">{scan.patientInfo.gender}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* All Predictions Card */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/20 animate-fade-in animation-delay-200">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            {scan.images.length > 1 ? "Averaged Predictions" : "All Predictions"}
          </h3>
          <div className="space-y-4">
            {scan.finalResult.predictions.map((pred, idx) => (
              <div
                key={idx}
                className="border-2 border-gray-200 rounded-xl p-4 hover:border-blue-400 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900">{pred.condition}</h4>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      pred.confidence === "high"
                        ? "bg-green-100 text-green-700"
                        : pred.confidence === "medium"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {pred.confidence}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all"
                    style={{ width: `${pred.probability * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600">
                  {(pred.probability * 100).toFixed(2)}% probability
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>Total Processing Time:</strong> {scan.finalResult.processingTime}ms
            </p>
          </div>
        </div>

        {/* Notes */}
        {scan.notes && (
          <div className="mt-8 bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/20 animate-fade-in animation-delay-400">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Notes</h3>
            <p className="text-gray-700">{scan.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 flex gap-4 justify-center">
          <Link href="/tier1/upload">
            <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg">
              Upload New Scan
            </button>
          </Link>
          <Link href="/tier1/scans">
            <button className="px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all shadow-lg border-2 border-gray-200">
              View All Scans
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}
