"use client";

import { useEffect, useState } from "react";
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

export default function FormSettingsPage() {
  const router = useRouter();
  const [selectedForm, setSelectedForm] = useState<"dermatology" | "cosmetology">("dermatology");
  const [sections, setSections] = useState<FormSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);
  const [newField, setNewField] = useState({
    fieldName: "",
    label: "",
    type: "text",
    placeholder: "",
    options: "",
  });

  useEffect(() => {
    fetchFormSettings(selectedForm);
  }, [selectedForm]);

  const fetchFormSettings = async (formType: "dermatology" | "cosmetology") => {
    setLoading(true);
    setError("");

    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const response = await fetch(`/api/tier2/settings/forms?formType=${formType}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setSections(data.data.sections);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Failed to load form settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    const token = localStorage.getItem("token");

    try {
      const response = await fetch("/api/tier2/settings/forms", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          formType: selectedForm,
          sections,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSuccess("Form settings saved successfully!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (sectionIndex: number) => {
    const newSections = [...sections];
    newSections[sectionIndex].enabled = !newSections[sectionIndex].enabled;
    setSections(newSections);
  };

  const toggleField = (sectionIndex: number, fieldIndex: number) => {
    const newSections = [...sections];
    newSections[sectionIndex].fields[fieldIndex].enabled =
      !newSections[sectionIndex].fields[fieldIndex].enabled;
    setSections(newSections);
  };

  const toggleFieldRequired = (sectionIndex: number, fieldIndex: number) => {
    const newSections = [...sections];
    newSections[sectionIndex].fields[fieldIndex].required =
      !newSections[sectionIndex].fields[fieldIndex].required;
    setSections(newSections);
  };

  const openAddFieldModal = (sectionIndex: number) => {
    setCurrentSectionIndex(sectionIndex);
    setNewField({
      fieldName: "",
      label: "",
      type: "text",
      placeholder: "",
      options: "",
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setCurrentSectionIndex(null);
    setNewField({
      fieldName: "",
      label: "",
      type: "text",
      placeholder: "",
      options: "",
    });
  };

  const handleAddField = () => {
    if (!newField.fieldName || !newField.label) {
      alert("Please fill in field name and label");
      return;
    }

    if (currentSectionIndex === null) return;

    let options: string[] | undefined;
    if (newField.type === "select") {
      options = newField.options ? newField.options.split(",").map(o => o.trim()) : [];
      if (options.length === 0) {
        alert("Please provide options for select field");
        return;
      }
    }

    const newSections = [...sections];
    const field: FormField = {
      fieldName: newField.fieldName,
      label: newField.label,
      type: newField.type,
      required: false,
      enabled: true,
      options,
      placeholder: newField.placeholder || undefined,
      order: newSections[currentSectionIndex].fields.length + 1,
    };

    newSections[currentSectionIndex].fields.push(field);
    setSections(newSections);
    closeModal();
  };

  const deleteCustomField = (sectionIndex: number, fieldIndex: number) => {
    const field = sections[sectionIndex].fields[fieldIndex];
    if (!confirm(`Are you sure you want to delete field "${field.label}"?`)) {
      return;
    }

    const newSections = [...sections];
    newSections[sectionIndex].fields.splice(fieldIndex, 1);
    setSections(newSections);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading form settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-lg shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <Link href="/tier2/dashboard">
            <h1 className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors">
              DermaHMS
            </h1>
          </Link>
          <Link href="/tier2/dashboard">
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
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-slate-900 mb-2">Form Settings</h2>
          <p className="text-slate-600 text-lg">Customize consultation forms to match your workflow</p>
        </div>

        {/* Messages */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Form Type Selector */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-3">Select Form Type</label>
          <div className="flex gap-4">
            <button
              onClick={() => setSelectedForm("dermatology")}
              className={`flex-1 px-6 py-4 rounded-lg font-semibold transition-all ${
                selectedForm === "dermatology"
                  ? "bg-blue-600 text-white shadow-lg"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Dermatology Form
            </button>
            <button
              onClick={() => setSelectedForm("cosmetology")}
              className={`flex-1 px-6 py-4 rounded-lg font-semibold transition-all ${
                selectedForm === "cosmetology"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Cosmetology Form
            </button>
          </div>
        </div>

        {/* Form Sections */}
        <div className="space-y-4 mb-6">
          {sections.map((section, sectionIndex) => (
            <div
              key={section.sectionName}
              className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden"
            >
              {/* Section Header */}
              <div className="p-6 border-b border-gray-200 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => toggleSection(sectionIndex)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        section.enabled ? "bg-blue-600" : "bg-slate-300"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                          section.enabled ? "translate-x-6" : "translate-x-0.5"
                        }`}
                      ></div>
                    </button>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{section.sectionLabel}</h3>
                      <p className="text-sm text-slate-500">
                        {section.fields.filter((f) => f.enabled).length} of {section.fields.length} fields enabled
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      section.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {section.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>

              {/* Fields */}
              {section.enabled && (
                <div className="p-6">
                  <div className="space-y-3">
                    {section.fields.map((field, fieldIndex) => (
                      <div
                        key={field.fieldName}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center space-x-4 flex-1">
                          {/* Enable/Disable Toggle */}
                          <button
                            onClick={() => toggleField(sectionIndex, fieldIndex)}
                            className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                              field.enabled ? "bg-green-500" : "bg-slate-300"
                            }`}
                          >
                            <div
                              className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform ${
                                field.enabled ? "translate-x-5" : "translate-x-0.5"
                              }`}
                            ></div>
                          </button>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{field.label}</p>
                            <p className="text-sm text-slate-500">
                              Type: {field.type} • {field.fieldName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {/* Required/Optional Toggle */}
                          <button
                            onClick={() => toggleFieldRequired(sectionIndex, fieldIndex)}
                            disabled={!field.enabled}
                            className={`w-16 h-7 rounded-full transition-colors flex-shrink-0 relative ${
                              field.required ? "bg-red-500" : "bg-blue-500"
                            } ${!field.enabled ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <div
                              className={`w-6 h-6 bg-white rounded-full shadow-md transition-transform absolute top-0.5 ${
                                field.required ? "translate-x-9" : "translate-x-0.5"
                              }`}
                            ></div>
                            <span className={`absolute text-[10px] font-bold text-white ${
                              field.required ? "left-1.5" : "right-1.5"
                            } top-1.5`}>
                              {field.required ? "REQ" : "OPT"}
                            </span>
                          </button>
                          {/* Delete Button */}
                          <button
                            onClick={() => deleteCustomField(sectionIndex, fieldIndex)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete field"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Custom Field Button */}
                  <button
                    onClick={() => openAddFieldModal(sectionIndex)}
                    className="mt-4 w-full px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center space-x-2 font-semibold"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Add Custom Field</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Save Button */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href="/tier2/dashboard" className="flex-shrink-0">
            <button className="px-8 py-4 bg-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-300 transition-colors">
              Cancel
            </button>
          </Link>
        </div>
      </main>

      {/* Add Custom Field Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Add Custom Field</h3>
                <button
                  onClick={closeModal}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Field Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Field Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={newField.fieldName}
                  onChange={(e) => setNewField({ ...newField, fieldName: e.target.value })}
                  placeholder="e.g., skinTexture"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Unique identifier (camelCase recommended)</p>
              </div>

              {/* Field Label */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Field Label <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={newField.label}
                  onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                  placeholder="e.g., Skin Texture"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Display name shown in the form</p>
              </div>

              {/* Field Type */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Field Type <span className="text-red-600">*</span>
                </label>
                <select
                  value={newField.type}
                  onChange={(e) => setNewField({ ...newField, type: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="textarea">Textarea</option>
                  <option value="number">Number</option>
                  <option value="select">Select (Dropdown)</option>
                  <option value="date">Date</option>
                  <option value="checkbox">Checkbox</option>
                </select>
              </div>

              {/* Placeholder */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Placeholder Text
                </label>
                <input
                  type="text"
                  value={newField.placeholder}
                  onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })}
                  placeholder="e.g., Enter skin texture details"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Options (only for select) */}
              {newField.type === "select" && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Options <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    value={newField.options}
                    onChange={(e) => setNewField({ ...newField, options: e.target.value })}
                    placeholder="Option 1, Option 2, Option 3"
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Comma-separated values</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-slate-50 border-t border-gray-200 px-6 py-4 rounded-b-2xl flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-3 bg-white border border-gray-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddField}
                className="flex-1 px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
              >
                Add Field
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
