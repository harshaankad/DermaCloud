"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

interface DashboardStats {
  todayAppointments: {
    scheduled: number;
    checkedIn: number;
    completed: number;
    total: number;
  };
  todaySales: {
    totalSales: number;
    paidCount: number;
    pendingCount: number;
  };
  inventory: {
    lowStockCount: number;
    outOfStockCount: number;
  };
}

export default function FrontdeskDashboardPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const staffData = localStorage.getItem("frontdeskStaff");
    const token = localStorage.getItem("frontdeskToken");

    if (!staffData || !token) {
      router.push("/frontdesk/login");
      return;
    }

    setStaff(JSON.parse(staffData));
    fetchDashboardData(token);
  }, []);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = async (token: string) => {
    try {
      const today = new Date().toISOString().split("T")[0];

      const [appointmentsRes, inventoryRes, salesRes] = await Promise.all([
        fetch(`/api/tier2/appointments?date=${today}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/tier2/inventory?lowStock=true", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/tier2/sales?startDate=${today}&endDate=${today}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const appointmentsData = await appointmentsRes.json();
      const inventoryData = await inventoryRes.json();
      const salesData = await salesRes.json();

      if (appointmentsData.success) {
        setTodayAppointments(appointmentsData.data.appointments || []);
      }

      setStats({
        todayAppointments: {
          scheduled: appointmentsData.data?.todayStats?.scheduled || 0,
          checkedIn: appointmentsData.data?.todayStats?.["checked-in"] || 0,
          completed: appointmentsData.data?.todayStats?.completed || 0,
          total: appointmentsData.data?.pagination?.total || 0,
        },
        todaySales: (() => {
          const salesList: any[] = salesData.data?.sales || [];
          return {
            totalSales: salesList.length,
            paidCount: salesList.filter((s: any) => s.paymentStatus === "paid").length,
            pendingCount: salesList.filter((s: any) => s.paymentStatus === "pending" || s.paymentStatus === "partial").length,
          };
        })(),
        inventory: {
          lowStockCount: inventoryData.data?.stats?.lowStockCount || 0,
          outOfStockCount: inventoryData.data?.stats?.outOfStockCount || 0,
        },
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("frontdeskToken");
    localStorage.removeItem("frontdeskStaff");
    router.push("/frontdesk/login");
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: "Scheduled",
      "in-progress": "In Progress",
      completed: "Completed",
      cancelled: "Cancelled",
      "no-show": "No Show",
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading dashboard...</p>
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
              <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{staff?.clinicName || "Clinic"}</h1>
                <p className="text-base text-gray-500 hidden sm:block">Frontdesk &middot; {staff?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {staff?.doctorName && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-teal-50 rounded-lg">
                  <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-sm font-medium text-teal-700">Dr. {staff.doctorName}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            <Link href="/frontdesk/dashboard" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors relative text-teal-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-teal-600 after:rounded-full">
              Dashboard
            </Link>
            {staff?.permissions.appointments && (
              <Link href="/frontdesk/appointments" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">
                Appointments
              </Link>
            )}
            {staff?.permissions.patients && (
              <Link href="/frontdesk/patients" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">
                Patients
              </Link>
            )}
            {staff?.permissions.pharmacy && (
              <Link href="/frontdesk/pharmacy" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">
                Pharmacy
              </Link>
            )}
            {staff?.permissions.sales && (
              <Link href="/frontdesk/sales" className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700">
                Sales
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Banner */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Good {getGreeting()}, {staff?.name?.split(" ")[0]}!</h2>
            <p className="text-gray-500 mt-0.5">Here&apos;s what&apos;s happening today at the clinic.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm w-fit">
            <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{formatDate(currentTime)}</span>
            <span className="text-gray-300">|</span>
            <span className="font-medium text-teal-600">{formatTime(currentTime)}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {/* Today's Appointments */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-5 border border-gray-100 border-l-4 border-l-teal-500">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Appointments</h3>
              <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats?.todayAppointments.total || 0}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-yellow-600">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                {stats?.todayAppointments.scheduled || 0} scheduled
              </span>
              <span className="flex items-center gap-1 text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                {stats?.todayAppointments.completed || 0} completed
              </span>
            </div>
          </div>

          {/* Today's Sales Count */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-5 border border-gray-100 border-l-4 border-l-green-500">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Sales</h3>
              <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats?.todaySales.totalSales || 0}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                {stats?.todaySales.paidCount || 0} paid
              </span>
              <span className="flex items-center gap-1 text-orange-600">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                {stats?.todaySales.pendingCount || 0} pending
              </span>
            </div>
          </div>

          {/* Inventory Alerts */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-5 border border-gray-100 border-l-4 border-l-red-500">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Inventory</h3>
              <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{(stats?.inventory.lowStockCount || 0) + (stats?.inventory.outOfStockCount || 0)}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-orange-600">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                {stats?.inventory.lowStockCount || 0} low stock
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                {stats?.inventory.outOfStockCount || 0} out
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions & Today's Schedule */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Quick Actions</h3>
              <div className="space-y-2">
                {staff?.permissions.appointments && (
                  <Link
                    href="/frontdesk/appointments?action=new"
                    className="flex items-center p-3 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors group"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center mr-3 shadow-sm group-hover:scale-105 transition-transform">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-medium text-teal-700 text-sm">Book Appointment</span>
                      <p className="text-xs text-teal-500">Schedule a new visit</p>
                    </div>
                  </Link>
                )}
                {staff?.permissions.patients && (
                  <Link
                    href="/frontdesk/patients?action=new"
                    className="flex items-center p-3 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors group"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mr-3 shadow-sm group-hover:scale-105 transition-transform">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-medium text-blue-700 text-sm">Add Patient</span>
                      <p className="text-xs text-blue-500">Register new patient</p>
                    </div>
                  </Link>
                )}
                {staff?.permissions.sales && (
                  <Link
                    href="/frontdesk/sales?action=new"
                    className="flex items-center p-3 bg-green-50 hover:bg-green-100 rounded-xl transition-colors group"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mr-3 shadow-sm group-hover:scale-105 transition-transform">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-medium text-green-700 text-sm">New Sale</span>
                      <p className="text-xs text-green-500">Create a billing entry</p>
                    </div>
                  </Link>
                )}
                {staff?.permissions.pharmacy && (
                  <Link
                    href="/frontdesk/pharmacy"
                    className="flex items-center p-3 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors group"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mr-3 shadow-sm group-hover:scale-105 transition-transform">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-medium text-purple-700 text-sm">View Inventory</span>
                      <p className="text-xs text-purple-500">Check stock levels</p>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Today's Appointments */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Today&apos;s Schedule</h3>
                  {todayAppointments.length > 0 && (
                    <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-semibold rounded-full">
                      {todayAppointments.length}
                    </span>
                  )}
                </div>
                {staff?.permissions.appointments && (
                  <Link href="/frontdesk/appointments" className="text-teal-600 hover:text-teal-700 text-sm font-medium flex items-center gap-1">
                    View All
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>

              {todayAppointments.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {todayAppointments.slice(0, 10).map((apt, index) => (
                    <div
                      key={apt._id}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="text-center min-w-[44px]">
                          <p className="text-xs font-bold text-teal-600">{apt.appointmentTime || `#${index + 1}`}</p>
                        </div>
                        <div className="w-px h-8 bg-gray-200"></div>
                        <div className="w-10 h-10 bg-gradient-to-br from-teal-100 to-cyan-100 rounded-full flex items-center justify-center">
                          <span className="text-teal-700 font-bold text-sm">
                            {apt.patientId?.name?.charAt(0)?.toUpperCase() || "?"}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{apt.patientId?.name || "Unknown Patient"}</p>
                          <p className="text-xs text-gray-400">{apt.type || "General"}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        apt.status === "scheduled" ? "bg-yellow-50 text-yellow-700 border border-yellow-200" :
                        apt.status === "in-progress" ? "bg-purple-50 text-purple-700 border border-purple-200" :
                        apt.status === "completed" ? "bg-green-50 text-green-700 border border-green-200" :
                        apt.status === "cancelled" ? "bg-red-50 text-red-700 border border-red-200" :
                        "bg-gray-50 text-gray-700 border border-gray-200"
                      }`}>
                        {getStatusLabel(apt.status)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 font-medium">No appointments today</p>
                  <p className="text-gray-400 text-sm mt-1">Appointments will show up here once scheduled</p>
                  {staff?.permissions.appointments && (
                    <Link
                      href="/frontdesk/appointments?action=new"
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-teal-50 text-teal-600 rounded-lg text-sm font-medium hover:bg-teal-100 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Book First Appointment
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}
