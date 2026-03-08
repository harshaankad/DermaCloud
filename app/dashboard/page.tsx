"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");

    if (!token || !userData) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);

    // Redirect to tier2 dashboard (tier1 has been removed)
    router.push("/tier2/dashboard");
    return;

    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-white to-cyan-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
            DermaCloud
          </h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome back, {user?.name}! 👋
          </h2>
          <p className="text-gray-600 text-lg">
            You're logged in with <strong>DermaCloud Clinic</strong> plan
          </p>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Account Information</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-semibold text-gray-900">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">User ID</p>
              <p className="font-semibold text-gray-900 font-mono text-sm">{user?.id}</p>
            </div>
            {user?.phone && (
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <p className="font-semibold text-gray-900">{user?.phone}</p>
              </div>
            )}
            {user?.clinicId && (
              <div>
                <p className="text-sm text-gray-600">Clinic ID</p>
                <p className="font-semibold text-gray-900 font-mono text-sm">{user?.clinicId}</p>
              </div>
            )}
          </div>
        </div>

        {/* Success Message */}
        <div className="mt-8 p-6 bg-green-50 border-2 border-green-200 rounded-xl">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="font-bold text-green-900">Authentication System Working!</h4>
              <p className="text-green-700 text-sm">
                Signup, OTP verification, and login are all functioning correctly.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
