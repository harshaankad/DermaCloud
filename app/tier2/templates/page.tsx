"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

interface Template {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  templateType: "dermatology" | "cosmetology";
  isActive: boolean;
  templateData: Record<string, any>;
  createdAt: string;
}

interface Toast {
  type: "success" | "error";
  message: string;
}

const NAV_LINKS = [
  { label: "Dashboard", href: "/tier2/dashboard" },
  { label: "Patients", href: "/tier2/patients" },
  { label: "Consultations", href: "/tier2/consultations" },
  { label: "Pharmacy", href: "/tier2/pharmacy" },
  { label: "Templates", href: "/tier2/templates", active: true },
  { label: "Analytics", href: "/tier2/analytics" },
  { label: "Frontdesk", href: "/tier2/settings/frontdesk" },
];

const DERMATOLOGY_CATEGORIES = [
  "Eczema", "Psoriasis", "Vitiligo", "Acne", "Fungal Infections",
  "Allergic Reactions", "Hair Disorders", "Pigmentation", "Other",
];

const COSMETOLOGY_CATEGORIES = [
  "Facial Treatments", "Laser Procedures", "Chemical Peels",
  "Botox & Fillers", "Hair Removal", "Skin Rejuvenation",
  "Pigmentation Treatment", "Anti-Aging", "Other",
];

// Custom styled select dropdown (self-contained state)
function CustomSelectInput({
  value,
  onChange,
  options,
  placeholder,
  accentColor = "teal",
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  accentColor?: "teal" | "purple";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ringClass =
    accentColor === "purple"
      ? "border-purple-500 ring-2 ring-purple-100"
      : "border-teal-500 ring-2 ring-teal-100";
  const selectedBg =
    accentColor === "purple"
      ? "bg-purple-50 text-purple-700 font-semibold"
      : "bg-teal-50 text-teal-700 font-semibold";
  const checkColor = accentColor === "purple" ? "text-purple-600" : "text-teal-600";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`w-full flex items-center justify-between px-4 py-3 bg-gray-50 border rounded-xl text-sm transition-all outline-none ${
          open ? ringClass : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <span className={value ? "text-gray-900 font-medium" : "text-gray-400"}>
          {value || placeholder || "Select…"}
        </span>
        <div className="flex items-center gap-2">
          {value && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="text-gray-300 hover:text-gray-500 transition-colors cursor-pointer"
              title="Clear"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
          <div className="py-1.5 max-h-52 overflow-y-auto">
            {options.map((opt) => {
              const isSelected = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(isSelected ? "" : opt); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors ${
                    isSelected ? selectedBg : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {opt}
                  {isSelected && (
                    <svg className={`w-4 h-4 flex-shrink-0 ${checkColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TemplatesPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "dermatology" | "cosmetology">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Form settings — loaded once on mount, used in modal
  const [dermaSections, setDermaSections] = useState<FormSection[]>([]);
  const [cosmoSections, setCosmoSections] = useState<FormSection[]>([]);

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // Delete confirm modal
  const [deleteConfirm, setDeleteConfirm] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    templateType: "dermatology" as "dermatology" | "cosmetology",
    templateData: {} as Record<string, any>,
  });

  const [toast, setToast] = useState<Toast | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Close category dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const getToken = () => localStorage.getItem("token") || "";

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    fetchTemplates();
    fetchFormSettings(token);
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/tier2/templates?activeOnly=false", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setTemplates(data.data);
    } catch {
      showToast("error", "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const fetchFormSettings = async (token: string) => {
    try {
      const [dermaRes, cosmoRes] = await Promise.all([
        fetch("/api/tier2/settings/forms?formType=dermatology", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/tier2/settings/forms?formType=cosmetology", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const [dermaData, cosmoData] = await Promise.all([
        dermaRes.json(),
        cosmoRes.json(),
      ]);
      if (dermaData.success) setDermaSections(dermaData.data.sections);
      if (cosmoData.success) setCosmoSections(cosmoData.data.sections);
    } catch {
      // Non-critical; modal will show fallback message
    }
  };

  const openCreateModal = (type: "dermatology" | "cosmetology") => {
    setEditingTemplate(null);
    setFormData({ name: "", description: "", category: "", templateType: type, templateData: {} });
    setModalError("");
    setShowCategoryDropdown(false);
    setShowModal(true);
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category || "",
      templateType: template.templateType || "dermatology",
      templateData: { ...template.templateData },
    });
    setModalError("");
    setShowCategoryDropdown(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setModalError("Template name is required.");
      return;
    }
    setSaving(true);
    try {
      const method = editingTemplate ? "PUT" : "POST";
      const body = editingTemplate
        ? { templateId: editingTemplate._id, ...formData }
        : formData;

      const res = await fetch("/api/tier2/templates", {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        showToast("success", editingTemplate ? "Template updated!" : "Template created!");
        fetchTemplates();
      } else {
        setModalError(data.message || "Failed to save template");
      }
    } catch {
      setModalError("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tier2/templates?templateId=${deleteConfirm._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setDeleteConfirm(null);
        showToast("success", "Template deleted");
        fetchTemplates();
      } else {
        showToast("error", data.message || "Failed to delete");
      }
    } catch {
      showToast("error", "Failed to delete template");
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (template: Template) => {
    try {
      const res = await fetch("/api/tier2/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ templateId: template._id, isActive: !template.isActive }),
      });
      const data = await res.json();
      if (data.success) fetchTemplates();
    } catch {}
  };

  const updateTemplateData = (fieldName: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      templateData: { ...prev.templateData, [fieldName]: value },
    }));
  };

  // Render the correct input element for a form field type
  const renderFieldInput = (field: FormField) => {
    const value = String(formData.templateData[field.fieldName] ?? "");
    const onChange = (val: string) => updateTemplateData(field.fieldName, val);
    const baseClass =
      "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none";

    switch (field.type) {
      case "textarea":
        return (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className={`${baseClass} resize-none`}
          />
        );
      case "select":
        return (
          <CustomSelectInput
            value={value}
            onChange={onChange}
            options={field.options || []}
            placeholder={`Select ${field.label}`}
            accentColor={formData.templateType === "cosmetology" ? "purple" : "teal"}
          />
        );
      case "number":
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={baseClass}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={baseClass}
          />
        );
      case "checkbox":
        return (
          <div className="flex items-center gap-3 py-1">
            <button
              type="button"
              onClick={() => onChange(value === "true" ? "" : "true")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                value === "true" ? "bg-teal-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  value === "true" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-gray-500">{value === "true" ? "Yes" : "No"}</span>
          </div>
        );
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={baseClass}
          />
        );
    }
  };

  // Get first 2 non-empty preview fields for a template card
  const getPreviewFields = (template: Template) => {
    const sections = template.templateType === "cosmetology" ? cosmoSections : dermaSections;
    const previews: { label: string; value: string }[] = [];
    for (const section of sections) {
      for (const field of section.fields) {
        const val = template.templateData[field.fieldName];
        if (
          val &&
          typeof val === "string" &&
          val.trim() &&
          field.type !== "checkbox" &&
          field.type !== "date"
        ) {
          previews.push({ label: field.label, value: val.trim() });
          if (previews.length >= 2) return previews;
        }
      }
    }
    return previews;
  };

  const getFilledCount = (template: Template) =>
    Object.values(template.templateData).filter((v) => v && String(v).trim()).length;

  const filteredTemplates = templates.filter((t) => {
    const matchesType = filterType === "all" || t.templateType === filterType;
    const matchesSearch = !searchQuery.trim() || t.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });
  const dermaCount = templates.filter(
    (t) => t.templateType === "dermatology" || !t.templateType
  ).length;
  const cosmoCount = templates.filter((t) => t.templateType === "cosmetology").length;

  const currentSections =
    formData.templateType === "dermatology" ? dermaSections : cosmoSections;

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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
                <p className="text-base text-gray-500 hidden sm:block">Auto-fill consultation forms faster</p>
              </div>
            </div>

            {/* Create Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => openCreateModal("dermatology")}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-md text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Dermatology</span>
                <span className="sm:hidden">Derma</span>
              </button>
              <button
                onClick={() => openCreateModal("cosmetology")}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors shadow-md text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Cosmetology</span>
                <span className="sm:hidden">Cosmo</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {NAV_LINKS.map((item) => (
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

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-14 h-14 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Loading templates...</p>
            </div>
          </div>
        ) : <>
        {/* Search bar */}
        <div className="relative mb-4 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-teal-400 pointer-events-none transition-colors group-focus-within:text-teal-600">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search templates by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-11 py-3 bg-white border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-50 shadow-sm hover:border-gray-300 transition-all"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 rounded-full transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-300 font-medium pointer-events-none">
              {templates.length} templates
            </span>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6">
          {[
            { key: "all", label: `All (${templates.length})`, color: "teal" },
            { key: "dermatology", label: `Dermatology (${dermaCount})`, color: "teal" },
            { key: "cosmetology", label: `Cosmetology (${cosmoCount})`, color: "purple" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterType(f.key as typeof filterType)}
              className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors ${
                filterType === f.key
                  ? f.color === "purple"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-teal-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        {filteredTemplates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-1">No templates yet</h3>
            <p className="text-sm text-gray-400 mb-6">
              Templates auto-fill your consultation forms — create one to save time during visits.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => openCreateModal("dermatology")}
                className="px-5 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors text-sm"
              >
                Dermatology Template
              </button>
              <button
                onClick={() => openCreateModal("cosmetology")}
                className="px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors text-sm"
              >
                Cosmetology Template
              </button>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTemplates.map((template) => {
              const previewFields = getPreviewFields(template);
              const filledCount = getFilledCount(template);
              const isDerma = template.templateType !== "cosmetology";

              return (
                <div
                  key={template._id}
                  className={`bg-white rounded-2xl border shadow-sm transition-all hover:shadow-md flex flex-col ${
                    template.isActive
                      ? isDerma
                        ? "border-l-4 border-b-4 border-l-teal-500 border-b-teal-500 border-gray-100"
                        : "border-l-4 border-b-4 border-l-purple-500 border-b-purple-500 border-gray-100"
                      : "border-gray-100 opacity-60"
                  }`}
                >
                  <div className="p-5 flex-1">
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="font-bold text-gray-900 leading-tight mb-1.5">{template.name}</h3>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                              isDerma ? "bg-teal-50 text-teal-700" : "bg-purple-50 text-purple-700"
                            }`}
                          >
                            {isDerma ? "Dermatology" : "Cosmetology"}
                          </span>
                          {template.category && (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">
                              {template.category}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleActive(template)}
                        className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                          template.isActive
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {template.isActive ? "Active" : "Inactive"}
                      </button>
                    </div>

                    {/* Description */}
                    {template.description && (
                      <p className="text-xs text-gray-400 mb-3 line-clamp-2">{template.description}</p>
                    )}

                    {/* Preview Fields */}
                    {previewFields.length > 0 ? (
                      <div className="space-y-1.5 mb-3">
                        {previewFields.map((pf, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-gray-400 flex-shrink-0 w-20 truncate">{pf.label}:</span>
                            <span className="text-gray-700 font-medium line-clamp-1 flex-1">{pf.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-300 italic mb-3">No fields pre-filled yet</p>
                    )}

                    {/* Filled count badge */}
                    {filledCount > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          isDerma ? "text-teal-600" : "text-purple-600"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {filledCount} field{filledCount !== 1 ? "s" : ""} pre-filled
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 px-5 pb-5">
                    <button
                      onClick={() => openEditModal(template)}
                      className="flex-1 py-2 bg-gray-50 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(template)}
                      className="py-2 px-3 bg-red-50 text-red-600 font-semibold rounded-xl hover:bg-red-100 transition-colors text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>}
      </main>

      {/* ─── Create / Edit Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div
              className={`px-6 py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0 ${
                formData.templateType === "cosmetology"
                  ? "bg-gradient-to-r from-purple-600 to-purple-700"
                  : "bg-gradient-to-r from-teal-600 to-cyan-600"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingTemplate
                      ? "Edit Template"
                      : `New ${formData.templateType === "cosmetology" ? "Cosmetology" : "Dermatology"} Template`}
                  </h3>
                  <p className="text-white/70 text-xs mt-0.5">
                    Fill only the fields you want to auto-populate
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* Error */}
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
                  {modalError}
                </div>
              )}

              {/* Template Meta */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Template Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      setModalError("");
                    }}
                    placeholder={
                      formData.templateType === "cosmetology"
                        ? "e.g., Laser Hair Removal — First Session"
                        : "e.g., Eczema — Mild Case"
                    }
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Category
                  </label>
                  <div className="relative" ref={categoryDropdownRef}>
                    {/* Trigger */}
                    <button
                      type="button"
                      onClick={() => setShowCategoryDropdown((p) => !p)}
                      className={`w-full flex items-center justify-between px-4 py-3 bg-gray-50 border rounded-xl text-sm transition-all outline-none ${
                        showCategoryDropdown
                          ? formData.templateType === "cosmetology"
                            ? "border-purple-500 ring-2 ring-purple-100"
                            : "border-teal-500 ring-2 ring-teal-100"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className={formData.category ? "text-gray-900 font-medium" : "text-gray-400"}>
                        {formData.category || "Select a category"}
                      </span>
                      <div className="flex items-center gap-2">
                        {formData.category && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData({ ...formData, category: "" });
                            }}
                            className="text-gray-300 hover:text-gray-500 transition-colors cursor-pointer"
                            title="Clear"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </span>
                        )}
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showCategoryDropdown ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Dropdown Panel */}
                    {showCategoryDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
                        <div className="py-1.5 max-h-52 overflow-y-auto">
                          {(formData.templateType === "cosmetology"
                            ? COSMETOLOGY_CATEGORIES
                            : DERMATOLOGY_CATEGORIES
                          ).map((cat) => {
                            const isSelected = formData.category === cat;
                            const isCosmo = formData.templateType === "cosmetology";
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, category: isSelected ? "" : cat });
                                  setShowCategoryDropdown(false);
                                }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors ${
                                  isSelected
                                    ? isCosmo
                                      ? "bg-purple-50 text-purple-700 font-semibold"
                                      : "bg-teal-50 text-teal-700 font-semibold"
                                    : "text-gray-700 hover:bg-gray-50"
                                }`}
                              >
                                {cat}
                                {isSelected && (
                                  <svg className={`w-4 h-4 flex-shrink-0 ${isCosmo ? "text-purple-600" : "text-teal-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief note on when to use this template"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  Form Fields
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* ── Dynamic fields from Form Settings ── */}
              {currentSections.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">Could not load form settings.</p>
                  <p className="text-gray-300 text-xs mt-1">
                    Go to Form Settings to configure your consultation form first.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {currentSections
                    .filter((s) => s.enabled)
                    .sort((a, b) => a.order - b.order)
                    .map((section) => {
                      const enabledFields = section.fields
                        .filter((f) => f.enabled)
                        .sort((a, b) => a.order - b.order);

                      if (enabledFields.length === 0) return null;

                      return (
                        <div key={section.sectionName}>
                          {/* Section heading */}
                          <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                formData.templateType === "cosmetology"
                                  ? "bg-purple-500"
                                  : "bg-teal-500"
                              }`}
                            />
                            {section.sectionLabel}
                          </h4>

                          <div className="grid md:grid-cols-2 gap-3">
                            {enabledFields.map((field) => (
                              <div
                                key={field.fieldName}
                                className={field.type === "textarea" ? "md:col-span-2" : ""}
                              >
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                  {field.label}
                                  {field.required && (
                                    <span className="text-red-400 ml-0.5">*</span>
                                  )}
                                </label>
                                {renderFieldInput(field)}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 rounded-b-2xl flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex-[2] py-3 text-white font-semibold rounded-xl transition-colors shadow-md text-sm disabled:opacity-60 flex items-center justify-center gap-2 ${
                  formData.templateType === "cosmetology"
                    ? "bg-purple-600 hover:bg-purple-700"
                    : "bg-teal-600 hover:bg-teal-700"
                }`}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : editingTemplate ? (
                  "Update Template"
                ) : (
                  "Create Template"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirm Modal ─── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Delete Template</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Delete{" "}
              <span className="font-semibold text-gray-700">"{deleteConfirm.name}"</span>?
              <br />
              <span className="text-xs">This cannot be undone.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors text-sm disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg text-white text-sm font-medium ${
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
