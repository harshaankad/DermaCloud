"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface UsageStats {
  dailyUsed: number;
  dailyLimit: number;
  dailyRemaining: number;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  totalConsultations: number;
  totalPatients: number;
}

interface TodayVisit {
  id: string;
  patientName: string;
  visitType: "dermatology" | "cosmetology";
  time: string;
  status: "draft" | "completed";
}

export default function Tier2Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [todayVisits, setTodayVisits] = useState<TodayVisit[]>([]);

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

      // Verify Tier 2
      if (parsedUser.tier !== "tier2") {
        router.push("/dashboard");
        return;
      }

      // Fetch dashboard data
      try {
        const response = await fetch("/api/tier2/dashboard", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        if (data.success) {
          setUsageStats(data.data.usage);
          setTodayVisits(data.data.todayVisits || []);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading dashboard...</p>
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
      <header className="bg-white/90 backdrop-blur-lg shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-8">
              <Link href="/tier2/dashboard">
                <h1 className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors">
                  DermaHMS
                </h1>
              </Link>
              <nav className="hidden md:flex space-x-6">
                <Link
                  href="/tier2/dashboard"
                  className="text-slate-700 hover:text-blue-600 font-medium transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/tier2/patients"
                  className="text-slate-700 hover:text-blue-600 font-medium transition-colors"
                >
                  Patients
                </Link>
                <Link
                  href="/tier2/consultations"
                  className="text-slate-700 hover:text-blue-600 font-medium transition-colors"
                >
                  Consultations
                </Link>
                <Link
                  href="/tier2/templates"
                  className="text-slate-700 hover:text-blue-600 font-medium transition-colors"
                >
                  Templates
                </Link>
                <Link
                  href="/tier2/settings/forms"
                  className="text-slate-700 hover:text-blue-600 font-medium transition-colors"
                >
                  Form Settings
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/tier2/profile">
                <span className="text-sm text-slate-600 hover:text-blue-600 cursor-pointer font-medium hidden sm:block transition-colors">
                  Dr. {user?.name}
                </span>
              </Link>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors shadow-md"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-slate-900 mb-2">
            Welcome back, Dr. {user?.name}!
          </h2>
          <p className="text-slate-600 text-lg">
            Tier 2 - Professional Plan • Clinic Management System
          </p>
        </div>

        {/* Quick Actions - Primary Focus */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Add/Search Patient */}
          <Link href="/tier2/patients">
            <div className="group bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-8 cursor-pointer border border-blue-600">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <svg
                    className="w-7 h-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white text-lg">Add/Search Patient</h3>
                  <p className="text-sm text-blue-100">Find or register patient to start consultation</p>
                </div>
              </div>
            </div>
          </Link>

          {/* View Today's Visits */}
          <Link href="/tier2/consultations?filter=today">
            <div className="group bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-8 cursor-pointer border border-gray-200 hover:border-purple-400">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-600 transition-colors">
                  <svg
                    className="w-7 h-7 text-purple-600 group-hover:text-white transition-colors"
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
                <div>
                  <h3 className="font-semibold text-slate-900 text-lg">Today's Visits</h3>
                  <p className="text-sm text-slate-600">{todayVisits.length} visits scheduled for today</p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {/* Daily Usage */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Today's Visits</h3>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold text-slate-900">
                {usageStats?.dailyUsed || 0}
                <span className="text-lg text-slate-500 font-normal"> / {usageStats?.dailyLimit || 20}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${((usageStats?.dailyUsed || 0) / (usageStats?.dailyLimit || 20)) * 100}%`,
                  }}
                ></div>
              </div>
              <p className="text-xs text-slate-600">{usageStats?.dailyRemaining || 20} remaining today</p>
            </div>
          </div>

          {/* Monthly Usage */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">This Month</h3>
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold text-slate-900">
                {usageStats?.monthlyUsed || 0}
                <span className="text-lg text-slate-500 font-normal"> / {usageStats?.monthlyLimit || 500}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${((usageStats?.monthlyUsed || 0) / (usageStats?.monthlyLimit || 500)) * 100}%`,
                  }}
                ></div>
              </div>
              <p className="text-xs text-slate-600">{usageStats?.monthlyRemaining || 500} remaining this month</p>
            </div>
          </div>

          {/* Total Consultations */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Total Visits</h3>
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <div className="text-4xl font-bold text-slate-900 mb-1">{usageStats?.totalConsultations || 0}</div>
            <p className="text-xs text-slate-600">All-time consultations</p>
          </div>

          {/* Total Patients */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Total Patients</h3>
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <div className="text-4xl font-bold text-slate-900 mb-1">{usageStats?.totalPatients || 0}</div>
            <p className="text-xs text-slate-600">Registered patients</p>
          </div>
        </div>

        {/* Today's Visits */}
        {todayVisits && todayVisits.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Today's Visits</h3>
            <div className="space-y-3">
              {todayVisits.map((visit) => (
                <Link key={visit.id} href={`/tier2/consultations/${visit.id}`}>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        visit.visitType === "dermatology" ? "bg-blue-100" : "bg-purple-100"
                      }`}>
                        <svg className={`w-5 h-5 ${
                          visit.visitType === "dermatology" ? "text-blue-600" : "text-purple-600"
                        }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{visit.patientName}</p>
                        <p className="text-sm text-slate-600 capitalize">{visit.visitType}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-slate-500">{visit.time}</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        visit.status === "completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {visit.status}
                      </span>
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
