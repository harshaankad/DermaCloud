"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";

interface UsageStats {
  dailyUsed: number;
  dailyLimit: number;
  dailyRemaining: number;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  totalScans: number;
}

interface RecentScan {
  id: string;
  createdAt: string;
  images: Array<{
    imageUrl: string;
  }>;
  finalResult: {
    topPrediction: {
      condition: string;
      probability: number;
      confidence: string;
    };
  };
  patientInfo: {
    name: string;
  };
  status: string;
}

export default function Tier1Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);

  useEffect(() => {
    const initDashboard = async () => {
      // Check authentication
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("user");

      if (!token || !userData) {
        router.push("/login");
        return;
      }

      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);

      // Verify Tier 1
      if (parsedUser.tier !== "tier1") {
        router.push("/dashboard");
        return;
      }

      // Fetch usage stats
      try {
        const response = await fetch("/api/tier1/upload", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        if (data.success) {
          setUsageStats(data.data.usage);
          setRecentScans(data.data.recentScans || []);
        }
      } catch (error) {
        console.error("Failed to fetch usage stats:", error);
      }

      setLoading(false);
    };

    initDashboard();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-cyan-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <Link href="/tier1/dashboard">
                  <Logo size="sm" />
                </Link>
                <p className="text-sm text-gray-500">Student Plan</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600 hidden sm:block">
                {user?.name}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-gray-600 hover:text-red-600 font-medium transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <Link
              href="/tier1/dashboard"
              className="px-4 py-3 text-teal-600 border-b-2 border-teal-600 font-medium"
            >
              Dashboard
            </Link>
            <Link
              href="/tier1/upload"
              className="px-4 py-3 text-gray-600 hover:text-teal-600 font-medium transition-colors"
            >
              Upload Scan
            </Link>
            <Link
              href="/tier1/scans"
              className="px-4 py-3 text-gray-600 hover:text-teal-600 font-medium transition-colors"
            >
              Scan History
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {user?.name}!
          </h2>
          <p className="text-gray-600">
            Tier 1 - Student Plan | AI-Powered Skin Condition Analysis
          </p>
        </div>

        {/* Usage Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Daily Usage */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-teal-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-700">
                Today's Scans
              </h3>
              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-teal-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-end space-x-2">
                <span className="text-4xl font-bold text-teal-600">
                  {usageStats?.dailyUsed || 0}
                </span>
                <span className="text-gray-500 text-lg mb-1">
                  / {usageStats?.dailyLimit || 5}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-teal-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${
                      ((usageStats?.dailyUsed || 0) /
                        (usageStats?.dailyLimit || 5)) *
                      100
                    }%`,
                  }}
                ></div>
              </div>
              <p className="text-sm text-gray-600">
                {usageStats?.dailyRemaining || 5} scans remaining today
              </p>
            </div>
          </div>

          {/* Monthly Usage */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-cyan-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-700">
                This Month
              </h3>
              <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-cyan-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-end space-x-2">
                <span className="text-4xl font-bold text-cyan-600">
                  {usageStats?.monthlyUsed || 0}
                </span>
                <span className="text-gray-500 text-lg mb-1">
                  / {usageStats?.monthlyLimit || 120}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-cyan-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${
                      ((usageStats?.monthlyUsed || 0) /
                        (usageStats?.monthlyLimit || 120)) *
                      100
                    }%`,
                  }}
                ></div>
              </div>
              <p className="text-sm text-gray-600">
                {usageStats?.monthlyRemaining || 120} scans remaining this month
              </p>
            </div>
          </div>

          {/* Total Scans */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-emerald-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-700">
                Total Scans
              </h3>
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-emerald-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-emerald-600">
                {usageStats?.totalScans || 0}
              </div>
              <p className="text-sm text-gray-600">All-time scans analyzed</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Link href="/tier1/upload">
            <div className="group bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    Upload New Scan
                  </h3>
                  <p className="text-teal-100">
                    Analyze skin conditions with AI
                  </p>
                </div>
                <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-all">
                  <svg
                    className="w-8 h-8 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/tier1/scans">
            <div className="group bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-all border-l-4 border-teal-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    View Scan History
                  </h3>
                  <p className="text-gray-600">
                    Access all previous scans
                  </p>
                </div>
                <div className="w-16 h-16 bg-teal-100 rounded-xl flex items-center justify-center group-hover:bg-teal-200 transition-all">
                  <svg
                    className="w-8 h-8 text-teal-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Recent Scans */}
        {recentScans && recentScans.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-8 border-l-4 border-cyan-500">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">
              Recent Scans
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentScans.slice(0, 6).map((scan) => (
                <Link key={scan.id} href={`/tier1/scans/${scan.id}`}>
                  <div className="group bg-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all cursor-pointer border border-gray-100 hover:border-teal-200">
                    <div className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden relative">
                      <img
                        src={scan.images[0]?.imageUrl}
                        alt={scan.patientInfo.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {scan.images.length > 1 && (
                        <div className="absolute top-2 right-2 bg-teal-600 text-white text-xs font-semibold px-2 py-1 rounded-full">
                          +{scan.images.length - 1}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 truncate">
                        {scan.patientInfo.name}
                      </p>
                      <p className="text-sm text-gray-600 truncate">
                        {scan.finalResult.topPrediction.condition}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            scan.finalResult.topPrediction.confidence === "high"
                              ? "bg-green-100 text-green-700"
                              : scan.finalResult.topPrediction.confidence === "medium"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {scan.finalResult.topPrediction.confidence}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(scan.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
