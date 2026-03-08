"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface FormField {
  fieldName: string;
  label: string;
  type: string;
  required: boolean;
  enabled: boolean;
  options?: string[];
  placeholder?: string;
  order: number;
}

interface FormSection {
  sectionName: string;
  sectionLabel: string;
  enabled: boolean;
  fields: FormField[];
  order: number;
}

interface Toast {
  type: "success" | "error";
  message: string;
}

const NAV_LINKS = [
  { label: "Dashboard", href: "/tier2/dashboard" },
  { label: "Patients", href: "/tier2/patients" },
  { label: "Visits", href: "/tier2/visit/new" },
  { label: "Appointments", href: "/tier2/appointments" },
  { label: "Templates", href: "/tier2/templates" },
];

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  textarea: "Paragraph",
  number: "Number",
  select: "Dropdown",
  date: "Date",
  checkbox: "Checkbox",
};

const FIELD_TYPE_COLORS: Record<string, string> = {
  text: "bg-blue-50 text-blue-700",
  textarea: "bg-purple-50 text-purple-700",
  number: "bg-amber-50 text-amber-700",
  select: "bg-teal-50 text-teal-700",
  date: "bg-rose-50 text-rose-700",
  checkbox: "bg-green-50 text-green-700",
};

export default function FormSettingsPage() {
  const router = useRouter();
  const [selectedForm, setSelectedForm] = useState<"dermatology" | "cosmetology">("dermatology");
  const [sections, setSections] = useState<FormSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Add Field Modal
  const [showModal, setShowModal] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);
  const [newField, setNewField] = useState({
    fieldName: "",
    label: "",
    type: "text",
    placeholder: "",
    options: "",
  });
  const [modalError, setModalError] = useState("");

  // Delete Confirm Modal
  const [deleteConfirm, setDeleteConfirm] = useState<{
    sectionIndex: number;
    fieldIndex: number;
    label: string;
  } | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    fetchFormSettings(selectedForm);
    setHasChanges(false);
  }, [selectedForm]);

  const fetchFormSettings = async (formType: "dermatology" | "cosmetology") => {
    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }

    try {
      const res = await fetch(`/api/tier2/settings/forms?formType=${formType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSections(data.data.sections);
      } else {
        showToast("error", data.message || "Failed to load form settings");
      }
    } catch {
      showToast("error", "Failed to load form settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/tier2/settings/forms", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ formType: selectedForm, sections }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Form settings saved!");
        setHasChanges(false);
      } else {
        showToast("error", data.message || "Failed to save settings");
      }
    } catch {
      showToast("error", "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (sectionIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].enabled = !updated[sectionIndex].enabled;
    setSections(updated);
    setHasChanges(true);
  };

  const toggleField = (sectionIndex: number, fieldIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].fields[fieldIndex].enabled = !updated[sectionIndex].fields[fieldIndex].enabled;
    setSections(updated);
    setHasChanges(true);
  };

  const toggleFieldRequired = (sectionIndex: number, fieldIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].fields[fieldIndex].required = !updated[sectionIndex].fields[fieldIndex].required;
    setSections(updated);
    setHasChanges(true);
  };

  const openAddFieldModal = (sectionIndex: number) => {
    setCurrentSectionIndex(sectionIndex);
    setNewField({ fieldName: "", label: "", type: "text", placeholder: "", options: "" });
    setModalError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setCurrentSectionIndex(null);
    setNewField({ fieldName: "", label: "", type: "text", placeholder: "", options: "" });
    setModalError("");
  };

  const handleAddField = () => {
    if (!newField.fieldName.trim() || !newField.label.trim()) {
      setModalError("Field key and label are required.");
      return;
    }
    if (newField.type === "select" && !newField.options.trim()) {
      setModalError("Please provide at least one option for the dropdown.");
      return;
    }
    if (currentSectionIndex === null) return;

    const options =
      newField.type === "select"
        ? newField.options.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined;

    const updated = [...sections];
    updated[currentSectionIndex].fields.push({
      fieldName: newField.fieldName.trim(),
      label: newField.label.trim(),
      type: newField.type,
      required: false,
      enabled: true,
      options,
      placeholder: newField.placeholder.trim() || undefined,
      order: updated[currentSectionIndex].fields.length + 1,
    });

    setSections(updated);
    setHasChanges(true);
    closeModal();
    showToast("success", `"${newField.label.trim()}" field added`);
  };

  const confirmDeleteField = (sectionIndex: number, fieldIndex: number) => {
    setDeleteConfirm({
      sectionIndex,
      fieldIndex,
      label: sections[sectionIndex].fields[fieldIndex].label,
    });
  };

  const handleDeleteField = () => {
    if (!deleteConfirm) return;
    const updated = [...sections];
    updated[deleteConfirm.sectionIndex].fields.splice(deleteConfirm.fieldIndex, 1);
    setSections(updated);
    setHasChanges(true);
    showToast("success", `"${deleteConfirm.label}" removed`);
    setDeleteConfirm(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading form settings...</p>
        </div>
      </div>
    );
  }

  const enabledCount = sections.filter((s) => s.enabled).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md shadow-teal-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Form Settings</h1>
                <p className="text-base text-gray-500 hidden sm:block">Customize your consultation forms</p>
              </div>
            </div>

            {/* Header Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                hasChanges
                  ? "bg-teal-600 text-white hover:bg-teal-700 shadow-md"
                  : "bg-gray-100 text-gray-400"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {hasChanges ? "Save Changes" : "Saved"}
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-3 text-base font-medium whitespace-nowrap transition-colors text-gray-500 hover:text-gray-700"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* Form Type Selector */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Select Form to Configure</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Dermatology */}
            <button
              onClick={() => setSelectedForm("dermatology")}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                selectedForm === "dermatology"
                  ? "border-teal-500 bg-teal-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                selectedForm === "dermatology" ? "bg-teal-100" : "bg-gray-100"
              }`}>
                <svg className={`w-5 h-5 ${selectedForm === "dermatology" ? "text-teal-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${selectedForm === "dermatology" ? "text-teal-700" : "text-gray-700"}`}>Dermatology</p>
                <p className={`text-xs mt-0.5 ${selectedForm === "dermatology" ? "text-teal-500" : "text-gray-400"}`}>Skin consultation form</p>
              </div>
              {selectedForm === "dermatology" && (
                <div className="w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>

            {/* Cosmetology */}
            <button
              onClick={() => setSelectedForm("cosmetology")}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                selectedForm === "cosmetology"
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                selectedForm === "cosmetology" ? "bg-purple-100" : "bg-gray-100"
              }`}>
                <svg className={`w-5 h-5 ${selectedForm === "cosmetology" ? "text-purple-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${selectedForm === "cosmetology" ? "text-purple-700" : "text-gray-700"}`}>Cosmetology</p>
                <p className={`text-xs mt-0.5 ${selectedForm === "cosmetology" ? "text-purple-500" : "text-gray-400"}`}>Cosmetic consultation form</p>
              </div>
              {selectedForm === "cosmetology" && (
                <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Summary Bar */}
        <div className="flex items-center justify-between mb-4 px-1">
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-700">{enabledCount}</span> of{" "}
            <span className="font-semibold text-gray-700">{sections.length}</span> sections active
          </p>
          {hasChanges && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
              Unsaved changes
            </span>
          )}
        </div>

        {/* Sections */}
        <div className="space-y-4 mb-8">
          {sections.map((section, sectionIndex) => (
            <div
              key={section.sectionName}
              className={`bg-white rounded-2xl border transition-all ${
                section.enabled ? "border-gray-200 shadow-sm" : "border-gray-100 opacity-60"
              }`}
            >
              {/* Section Header */}
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleSection(sectionIndex)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${
                      section.enabled ? "bg-teal-500" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                        section.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <div>
                    <h3 className="font-semibold text-gray-900">{section.sectionLabel}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {section.fields.filter((f) => f.enabled).length}/{section.fields.length} fields active
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    section.enabled ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {section.enabled ? "Active" : "Hidden"}
                </span>
              </div>

              {/* Fields */}
              {section.enabled && (
                <>
                  <div className="border-t border-gray-100">
                    {section.fields.map((field, fieldIndex) => (
                      <div
                        key={field.fieldName}
                        className={`flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-b-0 ${
                          !field.enabled ? "bg-gray-50/60" : "hover:bg-gray-50/40"
                        }`}
                      >
                        {/* Field Enable Toggle */}
                        <button
                          onClick={() => toggleField(sectionIndex, fieldIndex)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                            field.enabled ? "bg-green-500" : "bg-gray-200"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                              field.enabled ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>

                        {/* Field Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${field.enabled ? "text-gray-900" : "text-gray-400"}`}>
                              {field.label}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                                field.enabled
                                  ? FIELD_TYPE_COLORS[field.type] || "bg-gray-50 text-gray-500"
                                  : "bg-gray-100 text-gray-400"
                              }`}
                            >
                              {FIELD_TYPE_LABELS[field.type] || field.type}
                            </span>
                          </div>
                        </div>

                        {/* Required Toggle Pill */}
                        <button
                          onClick={() => field.enabled && toggleFieldRequired(sectionIndex, fieldIndex)}
                          disabled={!field.enabled}
                          title={field.enabled ? "Click to toggle required/optional" : "Enable field first"}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors flex-shrink-0 ${
                            !field.enabled
                              ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                              : field.required
                              ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer"
                              : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer"
                          }`}
                        >
                          {field.required ? "Required" : "Optional"}
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => confirmDeleteField(sectionIndex, fieldIndex)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                          title="Remove field"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Custom Field */}
                  <div className="px-5 py-3">
                    <button
                      onClick={() => openAddFieldModal(sectionIndex)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-400 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Custom Field
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Bottom Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-white border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
              hasChanges
                ? "bg-teal-600 text-white hover:bg-teal-700 shadow-md"
                : "bg-gray-100 text-gray-400"
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {hasChanges ? "Save Changes" : "No Changes"}
              </>
            )}
          </button>
        </div>
      </main>

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Remove Field</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Remove{" "}
              <span className="font-semibold text-gray-700">"{deleteConfirm.label}"</span> from the form?
              <br />
              <span className="text-xs">This action cannot be undone.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteField}
                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Field Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Add Custom Field</h3>
              </div>
              <button
                onClick={closeModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Field Label <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newField.label}
                  onChange={(e) => { setNewField({ ...newField, label: e.target.value }); setModalError(""); }}
                  placeholder="e.g., Skin Texture"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">The display name shown in the consultation form</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Field Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newField.fieldName}
                  onChange={(e) => { setNewField({ ...newField, fieldName: e.target.value }); setModalError(""); }}
                  placeholder="e.g., skinTexture"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">Unique identifier — camelCase recommended</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Field Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={newField.type}
                  onChange={(e) => setNewField({ ...newField, type: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                >
                  <option value="text">Text — Short single-line input</option>
                  <option value="textarea">Paragraph — Multi-line text area</option>
                  <option value="number">Number — Numeric value input</option>
                  <option value="select">Dropdown — Pick from a list</option>
                  <option value="date">Date — Date picker</option>
                  <option value="checkbox">Checkbox — Yes / No toggle</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Placeholder Text
                </label>
                <input
                  type="text"
                  value={newField.placeholder}
                  onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })}
                  placeholder="e.g., Describe the skin texture..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                />
              </div>

              {newField.type === "select" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Dropdown Options <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={newField.options}
                    onChange={(e) => { setNewField({ ...newField, options: e.target.value }); setModalError(""); }}
                    placeholder="Normal, Mild, Moderate, Severe"
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">Comma-separated values</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-6 py-4 rounded-b-2xl flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddField}
                className="flex-[2] py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-md text-sm"
              >
                Add Field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg text-white text-sm font-medium transition-all ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
