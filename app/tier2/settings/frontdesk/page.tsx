"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface FrontdeskStaff {
  _id: string;
  staffId: string;
  name: string;
  email: string;
  phone: string;
  status: "active" | "inactive";
  permissions: {
    appointments: boolean;
    patients: boolean;
    pharmacy: boolean;
    sales: boolean;
    reports: boolean;
  };
  lastLogin?: string;
  createdAt: string;
}

export default function FrontdeskSettingsPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<FrontdeskStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<FrontdeskStaff | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    permissions: {
      appointments: true,
      patients: true,
      pharmacy: true,
      sales: true,
      reports: false,
    },
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchStaff(token);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
  };

  const fetchStaff = async (token: string) => {
    try {
      const response = await fetch("/api/tier2/frontdesk", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setStaff(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching staff:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      phone: "",
      permissions: { appointments: true, patients: true, pharmacy: true, sales: true, reports: false },
    });
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const token = localStorage.getItem("token");

    try {
      const response = await fetch("/api/tier2/frontdesk", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.success) {
        showToast("Frontdesk staff added successfully!", "success");
        setShowAddModal(false);
        resetForm();
        fetchStaff(token!);
      } else {
        showToast(data.message || "Failed to add staff", "error");
      }
    } catch {
      showToast("Error adding staff. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;

    setSubmitting(true);
    const token = localStorage.getItem("token");

    try {
      const updateData: Record<string, unknown> = {
        name: formData.name,
        phone: formData.phone,
        permissions: formData.permissions,
      };
      if (formData.password) updateData.password = formData.password;

      const response = await fetch(`/api/tier2/frontdesk/${selectedStaff._id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();
      if (data.success) {
        showToast("Staff updated successfully!", "success");
        setShowEditModal(false);
        setSelectedStaff(null);
        fetchStaff(token!);
      } else {
        showToast(data.message || "Failed to update staff", "error");
      }
    } catch {
      showToast("Error updating staff. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (staffMember: FrontdeskStaff) => {
    const token = localStorage.getItem("token");
    const newStatus = staffMember.status === "active" ? "inactive" : "active";

    try {
      const response = await fetch(`/api/tier2/frontdesk/${staffMember._id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();
      if (data.success) {
        showToast(`${staffMember.name} ${newStatus === "active" ? "activated" : "deactivated"}`, "success");
        fetchStaff(token!);
      } else {
        showToast(data.message || "Failed to update status", "error");
      }
    } catch {
      showToast("Error updating status. Please try again.", "error");
    }
  };

  const openEditModal = (staffMember: FrontdeskStaff) => {
    setSelectedStaff(staffMember);
    setFormData({
      name: staffMember.name,
      email: staffMember.email,
      password: "",
      phone: staffMember.phone,
      permissions: staffMember.permissions,
    });
    setShowEditModal(true);
  };

  const permissionLabels: Record<string, { label: string; icon: string; color: string }> = {
    appointments: { label: "Appointments", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", color: "text-blue-400" },
    patients: { label: "Patients", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", color: "text-teal-400" },
    pharmacy: { label: "Pharmacy", icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z", color: "text-purple-400" },
    sales: { label: "Sales", icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z", color: "text-amber-400" },
    reports: { label: "Reports", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", color: "text-red-400" },
  };

  const PermissionsGrid = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Permissions</label>
      <div className="space-y-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
        {Object.entries(formData.permissions).map(([key, value]) => (
          <label key={key} className="flex items-center justify-between py-2 px-2 cursor-pointer group hover:bg-white rounded-lg transition-colors">
            <div className="flex items-center gap-2.5">
              <svg className={`w-4 h-4 ${permissionLabels[key]?.color || "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={permissionLabels[key]?.icon || ""} />
              </svg>
              <span className="text-sm text-gray-700 font-medium">{permissionLabels[key]?.label || key}</span>
            </div>
            <div
              onClick={(e) => {
                e.preventDefault();
                setFormData({
                  ...formData,
                  permissions: { ...formData.permissions, [key]: !value },
                });
              }}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                value ? "bg-teal-500" : "bg-gray-300"
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                value ? "translate-x-4" : "translate-x-0.5"
              }`} />
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-teal-600 transition-colors"
                title="Go back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Frontdesk Staff</h1>
                <p className="text-base text-gray-500 hidden sm:block">{staff.length} staff member{staff.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20 flex items-center gap-2 font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="hidden sm:inline text-base">Add Staff</span>
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
              { label: "Patients", href: "/tier2/patients" },
              { label: "Consultations", href: "/tier2/consultations" },
              { label: "Pharmacy", href: "/tier2/pharmacy" },
              { label: "Templates", href: "/tier2/templates" },
              { label: "Analytics", href: "/tier2/analytics" },
              { label: "Frontdesk", href: "/tier2/settings/frontdesk", active: true },
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
        {/* Info Banner */}
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-teal-900 text-sm">About Frontdesk Staff</h3>
              <p className="text-sm text-teal-700 mt-0.5">
                Staff log in at <span className="font-mono bg-teal-100 px-1.5 py-0.5 rounded text-teal-800 text-xs">/frontdesk/login</span> using the credentials you create here. You can control their access with permissions.
              </p>
            </div>
          </div>
        </div>

        {/* Staff List */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
            </div>
          ) : staff.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {staff.map((member) => (
                <div key={member._id} className="p-5 hover:bg-gray-50/70 transition-colors group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        member.status === "active"
                          ? "bg-gradient-to-br from-teal-400 to-cyan-500"
                          : "bg-gray-200"
                      }`}>
                        <span className={`text-lg font-bold ${
                          member.status === "active" ? "text-white" : "text-gray-400"
                        }`}>
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{member.name}</p>
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                            member.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-gray-100 text-gray-500 border border-gray-200"
                          }`}>
                            {member.status === "active" ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">{member.email}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{member.phone}</span>
                          <span className="text-xs text-gray-300">&middot;</span>
                          <span className="text-xs text-gray-400 font-mono">{member.staffId}</span>
                          {member.lastLogin && (
                            <>
                              <span className="text-xs text-gray-300">&middot;</span>
                              <span className="text-xs text-gray-400">
                                Last login: {new Date(member.lastLogin).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(member)}
                        className="p-2 hover:bg-teal-50 rounded-lg text-gray-400 hover:text-teal-600 transition-colors"
                        title="Edit"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleToggleStatus(member)}
                        className={`p-2 rounded-lg transition-colors ${
                          member.status === "active"
                            ? "hover:bg-red-50 text-gray-400 hover:text-red-600"
                            : "hover:bg-emerald-50 text-gray-400 hover:text-emerald-600"
                        }`}
                        title={member.status === "active" ? "Deactivate" : "Activate"}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                            member.status === "active"
                              ? "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                              : "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          } />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {/* Permissions */}
                  <div className="mt-3 flex flex-wrap gap-1.5 ml-16">
                    {Object.entries(member.permissions).map(([key, value]) => (
                      <span
                        key={key}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                          value
                            ? "bg-teal-50 text-teal-700 border border-teal-200"
                            : "bg-gray-50 text-gray-400 line-through border border-gray-100"
                        }`}
                      >
                        {permissionLabels[key]?.label || key}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-900 mb-1">No frontdesk staff added yet</p>
              <p className="text-sm text-gray-500 mb-5">Add your first staff member to get started</p>
              <button
                onClick={() => { resetForm(); setShowAddModal(true); }}
                className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20 text-sm font-medium"
              >
                Add Staff Member
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Add Frontdesk Staff</h3>
                  <p className="text-sm text-gray-500">Create a new staff login</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddStaff} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Full Name *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" placeholder="Staff member name" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Email *</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" placeholder="staff@example.com" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Password *</label>
                <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required minLength={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" placeholder="Minimum 6 characters" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Phone *</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} required pattern="[0-9]{10}"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" placeholder="10-digit number" />
              </div>

              <PermissionsGrid />

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-teal-500/20 disabled:shadow-none">
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Adding...
                    </span>
                  ) : "Add Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {showEditModal && selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Edit Staff</h3>
                  <p className="text-sm text-gray-500">{selectedStaff.staffId}</p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUpdateStaff} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Full Name *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email (cannot change)</label>
                <input type="email" value={formData.email} disabled
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed text-base" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  New Password <span className="text-gray-400 font-normal normal-case">(leave blank to keep current)</span>
                </label>
                <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} minLength={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" placeholder="Enter new password" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">Phone *</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} required pattern="[0-9]{10}"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-base bg-gray-50" />
              </div>

              <PermissionsGrid isEdit />

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-base">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-teal-500/20 disabled:shadow-none">
                  {submitting ? (
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
