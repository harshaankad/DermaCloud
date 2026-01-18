"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface FormField {
  fieldName: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "date" | "checkbox";
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

interface Patient {
  _id: string;
  patientId: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
}

export default function CosmetologyVisitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");

  const [patient, setPatient] = useState<Patient | null>(null);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      if (!patientId) {
        setError("No patient selected");
        setLoading(false);
        return;
      }

      try {
        // Load patient data and form settings in parallel
        const [patientRes, formRes] = await Promise.all([
          fetch(`/api/tier2/patients/${patientId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/tier2/settings/forms?formType=cosmetology`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const patientData = await patientRes.json();
        const formSettingsData = await formRes.json();

        if (patientData.success) {
          setPatient(patientData.data.patient);
        } else {
          setError(patientData.message);
        }

        if (formSettingsData.success) {
          setSections(formSettingsData.data.sections);
          // Initialize form data with empty values
          initializeFormData(formSettingsData.data.sections);
        } else {
          setError(formSettingsData.message);
        }
      } catch (err) {
        setError("Failed to load form data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [patientId, router]);

  const initializeFormData = (sections: FormSection[]) => {
    const initialData: Record<string, any> = {};
    sections.forEach((section) => {
      if (section.enabled) {
        section.fields.forEach((field) => {
          if (field.enabled) {
            initialData[field.fieldName] =
              field.type === "checkbox" ? false : "";
          }
        });
      }
    });
    setFormData(initialData);
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    // TODO: Implement draft save API
    setTimeout(() => {
      setSaving(false);
      alert("Draft saved successfully!");
    }, 1000);
  };

  const handleContinue = () => {
    // Validate required fields
    const enabledSections = sections.filter((s) => s.enabled);
    for (const section of enabledSections) {
      for (const field of section.fields) {
        if (field.enabled && field.required && !formData[field.fieldName]) {
          alert(`Please fill in required field: ${field.label}`);
          return;
        }
      }
    }

    // TODO: Navigate to image upload page
    router.push(`/tier2/visit/cosmetology/images?patientId=${patientId}`);
  };

  const renderField = (field: FormField) => {
    if (!field.enabled) return null;

    const commonClasses =
      "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors";

    switch (field.type) {
      case "textarea":
        return (
          <textarea
            value={formData[field.fieldName] || ""}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            className={commonClasses}
            required={field.required}
          />
        );

      case "number":
        return (
          <input
            type="number"
            value={formData[field.fieldName] || ""}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            className={commonClasses}
            required={field.required}
          />
        );

      case "date":
        return (
          <input
            type="date"
            value={formData[field.fieldName] || ""}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            className={commonClasses}
            required={field.required}
          />
        );

      case "select":
        return (
          <select
            value={formData[field.fieldName] || ""}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            className={commonClasses}
            required={field.required}
          >
            <option value="">Select {field.label}</option>
            {field.options?.map((option, idx) => (
              <option key={idx} value={option}>
                {option}
              </option>
            ))}
          </select>
          );

      case "checkbox":
        return (
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={formData[field.fieldName] || false}
              onChange={(e) =>
                handleFieldChange(field.fieldName, e.target.checked)
              }
              className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
              required={field.required}
            />
            <span className="text-sm text-slate-600">{field.placeholder}</span>
          </div>
        );

      default: // text
        return (
          <input
            type="text"
            value={formData[field.fieldName] || ""}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            className={commonClasses}
            required={field.required}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Error</h3>
          <p className="text-slate-600 mb-6">{error || "Failed to load form"}</p>
          <Link href="/tier2/patients">
            <button className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors">
              Back to Patients
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-purple-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-lg shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <Link href="/tier2/dashboard">
            <h1 className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-purple-600 transition-colors">
              DermaHMS
            </h1>
          </Link>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="px-4 py-2 bg-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <Link href={`/tier2/patients/${patientId}`}>
              <button className="flex items-center space-x-2 text-slate-600 hover:text-purple-600 font-medium transition-colors">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                <span>Cancel</span>
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Patient Info Banner */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {patient.name}
                </h3>
                <p className="text-slate-600">
                  {patient.age} years • {patient.gender} • {patient.patientId}
                </p>
              </div>
            </div>
            <div className="px-4 py-2 bg-purple-100 rounded-lg">
              <p className="text-sm font-semibold text-purple-700">
                Cosmetology Visit
              </p>
            </div>
          </div>
        </div>

        {/* Form Title */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            Cosmetology Consultation Form
          </h2>
          <p className="text-slate-600">
            Complete the consultation details below
          </p>
        </div>

        {/* Dynamic Form Sections */}
        <div className="space-y-6">
          {sections
            .filter((section) => section.enabled)
            .sort((a, b) => a.order - b.order)
            .map((section, sectionIndex) => (
              <div
                key={section.sectionName}
                className="bg-white rounded-xl shadow-md border border-gray-200 p-6"
              >
                <h3 className="text-xl font-bold text-slate-900 mb-4 pb-3 border-b border-gray-200">
                  {section.sectionLabel}
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  {section.fields
                    .filter((field) => field.enabled)
                    .sort((a, b) => a.order - b.order)
                    .map((field) => (
                      <div
                        key={field.fieldName}
                        className={
                          field.type === "textarea" ? "md:col-span-2" : ""
                        }
                      >
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          {field.label}
                          {field.required && (
                            <span className="text-red-600 ml-1">*</span>
                          )}
                        </label>
                        {renderField(field)}
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex justify-between items-center">
          <Link href={`/tier2/patients/${patientId}`}>
            <button className="px-6 py-3 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 transition-colors">
              Cancel
            </button>
          </Link>
          <button
            onClick={handleContinue}
            className="px-8 py-3 bg-gradient-to-br from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl flex items-center space-x-2"
          >
            <span>Continue to Images</span>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </main>
    </div>
  );
}
