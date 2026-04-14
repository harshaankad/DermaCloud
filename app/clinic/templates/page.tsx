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
  { label: "Dashboard", href: "/clinic/dashboard" },
  { label: "Patients", href: "/clinic/patients" },
  { label: "Consultations", href: "/clinic/consultations" },
  { label: "Pharmacy", href: "/clinic/pharmacy" },
  { label: "Templates", href: "/clinic/templates", active: true },
  { label: "Analytics", href: "/clinic/analytics" },
  { label: "Frontdesk", href: "/clinic/settings/frontdesk" },
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

  // Medicine search for prescription autocomplete
  const [medSearchResults, setMedSearchResults] = useState<any[]>([]);
  const [medSearchActive, setMedSearchActive] = useState<string | null>(null);
  const medSearchTimer = useRef<NodeJS.Timeout | null>(null);

  // Top-level tab
  const [pageTab, setPageTab] = useState<"templates" | "procedures">("templates");

  // Procedures state
  const [procedures, setProcedures] = useState<any[]>([]);
  const [loadingProcedures, setLoadingProcedures] = useState(false);
  const [showProcedureModal, setShowProcedureModal] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<any>(null);
  const [savingProcedure, setSavingProcedure] = useState(false);
  const [procedureForm, setProcedureForm] = useState({ name: "", category: "other", basePrice: "", gstRate: "0", description: "" });
  const [procedureSearch, setProcedureSearch] = useState("");
  const [tplProcDropdownOpen, setTplProcDropdownOpen] = useState(false);
  const [tplProcQuery, setTplProcQuery] = useState("");
  const [procCatDropdownOpen, setProcCatDropdownOpen] = useState(false);

  const searchMedicines = useCallback((query: string, key: string) => {
    setMedSearchActive(key);
    if (medSearchTimer.current) clearTimeout(medSearchTimer.current);
    if (query.length < 2) { setMedSearchResults([]); return; }
    medSearchTimer.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/tier2/inventory/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) setMedSearchResults(data.data);
      } catch { setMedSearchResults([]); }
    }, 300);
  }, []);

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

  const fetchProcedures = useCallback(async () => {
    setLoadingProcedures(true);
    try {
      const res = await fetch("/api/tier2/cosmetology-procedures?active=false", { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setProcedures(data.data);
    } catch { showToast("error", "Failed to load procedures"); }
    setLoadingProcedures(false);
  }, [showToast]);

  useEffect(() => { if (pageTab === "procedures" && procedures.length === 0) fetchProcedures(); }, [pageTab]);

  const openProcedureModal = (proc?: any) => {
    if (proc) {
      setEditingProcedure(proc);
      setProcedureForm({ name: proc.name, category: proc.category, basePrice: String(proc.basePrice), gstRate: String(proc.gstRate), description: proc.description || "" });
    } else {
      setEditingProcedure(null);
      setProcedureForm({ name: "", category: "other", basePrice: "", gstRate: "0", description: "" });
    }
    setProcCatDropdownOpen(false);
    setShowProcedureModal(true);
  };

  const saveProcedure = async () => {
    if (!procedureForm.name.trim() || !procedureForm.basePrice) { showToast("error", "Name and price are required"); return; }
    setSavingProcedure(true);
    try {
      const body: any = { name: procedureForm.name.trim(), category: procedureForm.category, basePrice: Number(procedureForm.basePrice), gstRate: Number(procedureForm.gstRate), description: procedureForm.description.trim() };
      if (editingProcedure) body._id = editingProcedure._id;
      const res = await fetch("/api/tier2/cosmetology-procedures", {
        method: editingProcedure ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", editingProcedure ? "Procedure updated" : "Procedure created");
        setShowProcedureModal(false);
        fetchProcedures();
      } else { showToast("error", data.message || "Failed to save"); }
    } catch { showToast("error", "Failed to save procedure"); }
    setSavingProcedure(false);
  };

  const toggleProcedureActive = async (proc: any) => {
    try {
      const res = await fetch("/api/tier2/cosmetology-procedures", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ _id: proc._id, isActive: !proc.isActive }),
      });
      const data = await res.json();
      if (data.success) { fetchProcedures(); showToast("success", proc.isActive ? "Procedure deactivated" : "Procedure activated"); }
    } catch { showToast("error", "Failed to update"); }
  };

  const PROCEDURE_CATEGORIES = [
    { key: "laser", label: "Laser", icon: "M13 10V3L4 14h7v7l9-11h-7z", gradient: "from-amber-400 to-orange-500", soft: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "peel", label: "Peel", icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z", gradient: "from-pink-400 to-rose-500", soft: "bg-pink-50 text-pink-700 border-pink-200" },
    { key: "injectable", label: "Injectable", icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z", gradient: "from-violet-500 to-purple-600", soft: "bg-violet-50 text-violet-700 border-violet-200" },
    { key: "facial", label: "Facial", icon: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z", gradient: "from-rose-400 to-fuchsia-500", soft: "bg-rose-50 text-rose-700 border-rose-200" },
    { key: "body", label: "Body", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", gradient: "from-sky-400 to-blue-500", soft: "bg-sky-50 text-sky-700 border-sky-200" },
    { key: "hair", label: "Hair", icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z", gradient: "from-emerald-400 to-green-500", soft: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { key: "skin", label: "Skin", icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", gradient: "from-teal-400 to-cyan-500", soft: "bg-teal-50 text-teal-700 border-teal-200" },
    { key: "other", label: "Other", icon: "M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z", gradient: "from-slate-400 to-gray-500", soft: "bg-slate-50 text-slate-700 border-slate-200" },
  ];

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

  const updateTemplateData = (fieldName: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      templateData: { ...prev.templateData, [fieldName]: value },
    }));
  };

  // Render the correct input element for a form field type
  const renderFieldInput = (field: FormField) => {
    const baseClass =
      "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none";
    const accent = formData.templateType === "cosmetology" ? "purple" : "teal";

    // Prescription has its own value handling (array, not string)
    if (field.type === "prescription") {
      const isCosmo = formData.templateType === "cosmetology";
      const meds: Array<{ name: string; dosage: string; route: string; frequency: string; duration: string; instructions: string; quantity: string }> =
        Array.isArray(formData.templateData[field.fieldName]) ? formData.templateData[field.fieldName] : [];
      const updateMed = (idx: number, key: string, val: string) => {
        const updated = [...meds];
        updated[idx] = { ...updated[idx], [key]: val };
        updateTemplateData(field.fieldName, updated);
      };
      const addMed = () => updateTemplateData(field.fieldName, [...meds, { name: "", dosage: "", route: "", frequency: "", duration: "", instructions: "", quantity: "" }]);
      const removeMed = (idx: number) => updateTemplateData(field.fieldName, meds.filter((_, i) => i !== idx));
      const inputClass = isCosmo
        ? "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
        : "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none";

      return (
        <div className="space-y-3">
          {meds.map((med, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 relative group">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${isCosmo ? "text-purple-600" : "text-teal-600"}`}>Rx {idx + 1}</span>
                {meds.length > 1 && (
                  <button type="button" onClick={() => removeMed(idx)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg transition-all" title="Remove">
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 relative">
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Medicine Name</label>
                  <input type="text" value={med.name} onChange={(e) => { updateMed(idx, "name", e.target.value); searchMedicines(e.target.value, `tpl-rx-${idx}`); }} onFocus={() => { if (med.name.length >= 2) searchMedicines(med.name, `tpl-rx-${idx}`); }} onBlur={() => setTimeout(() => { if (medSearchActive === `tpl-rx-${idx}`) { setMedSearchActive(null); setMedSearchResults([]); } }, 200)} placeholder="e.g. Tab. Azithromycin" className={inputClass} autoComplete="off" />
                  {medSearchActive === `tpl-rx-${idx}` && medSearchResults.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                      {medSearchResults.map((item: any) => (
                        <button key={item._id} type="button" className={`w-full text-left px-3 py-2.5 transition-colors border-b border-gray-50 last:border-0 ${isCosmo ? "hover:bg-purple-50" : "hover:bg-teal-50"}`} onClick={() => { updateMed(idx, "name", item.name); setMedSearchActive(null); setMedSearchResults([]); }}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">{item.name}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.currentStock > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                              {item.currentStock > 0 ? `${item.currentStock} ${item.unit}` : "Out of stock"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.genericName && <span className="text-[11px] text-gray-400">{item.genericName}</span>}
                            {item.manufacturer && <span className="text-[11px] text-gray-400">• {item.manufacturer}</span>}
                            {item.packing && <span className="text-[11px] text-gray-400">• {item.packing}</span>}
                            <span className={`text-[11px] font-medium ${isCosmo ? "text-purple-600" : "text-teal-600"}`}>₹{item.sellingPrice}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Dosage</label>
                  <input type="text" value={med.dosage} onChange={(e) => updateMed(idx, "dosage", e.target.value)} placeholder="e.g. 500mg" className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Route</label>
                  <input type="text" value={med.route} onChange={(e) => updateMed(idx, "route", e.target.value)} placeholder="e.g. Oral, Topical" className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Frequency</label>
                  <input type="text" value={med.frequency} onChange={(e) => updateMed(idx, "frequency", e.target.value)} placeholder="e.g. BD, TID, OD" className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Duration</label>
                  <input type="text" value={med.duration} onChange={(e) => updateMed(idx, "duration", e.target.value)} placeholder="e.g. 7 days, 1 month" className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Quantity</label>
                  <input type="text" value={med.quantity || ""} onChange={(e) => updateMed(idx, "quantity", e.target.value)} placeholder="e.g. 10, 1 strip" className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Instructions</label>
                  <input type="text" value={med.instructions} onChange={(e) => updateMed(idx, "instructions", e.target.value)} placeholder="e.g. After food, Apply locally" className={inputClass} />
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addMed} className={`w-full py-2.5 border-2 border-dashed rounded-xl text-sm font-semibold transition-all flex items-center justify-center space-x-2 ${isCosmo ? "border-purple-300 text-purple-600 hover:border-purple-500 hover:bg-purple-50" : "border-teal-300 text-teal-600 hover:border-teal-500 hover:bg-teal-50"}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            <span>Add Medicine</span>
          </button>
        </div>
      );
    }

    // Special: Procedure name field with search dropdown for cosmetology templates
    if (formData.templateType === "cosmetology" && field.fieldName === "name" && field.label?.toLowerCase().includes("procedure")) {
      const procValue = String(formData.templateData[field.fieldName] ?? "");
      const activeProcedures = procedures.filter(p => p.isActive !== false);
      const filtered = tplProcQuery.length >= 1
        ? activeProcedures.filter(p => p.name.toLowerCase().includes(tplProcQuery.toLowerCase()))
        : activeProcedures;
      return (
        <div className="relative">
          <input
            type="text"
            value={procValue}
            onChange={(e) => {
              updateTemplateData(field.fieldName, e.target.value);
              setTplProcQuery(e.target.value);
              setTplProcDropdownOpen(true);
              // Clear pricing if manually typed
              updateTemplateData("procedureId", "");
              updateTemplateData("basePrice", "");
              updateTemplateData("gstRate", "");
              updateTemplateData("gstAmount", "");
              updateTemplateData("totalAmount", "");
            }}
            onFocus={() => { setTplProcQuery(procValue); setTplProcDropdownOpen(true); }}
            onBlur={() => setTimeout(() => setTplProcDropdownOpen(false), 200)}
            placeholder={field.placeholder || "Search or type procedure name..."}
            className={`${baseClass} focus:ring-2 focus:ring-purple-500`}
            autoComplete="off"
          />
          {tplProcDropdownOpen && filtered.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              {filtered.map((proc: any) => {
                const gstAmt = proc.basePrice * proc.gstRate / 100;
                const total = proc.basePrice + gstAmt;
                return (
                  <button key={proc._id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0" onClick={() => {
                    updateTemplateData(field.fieldName, proc.name);
                    updateTemplateData("procedureId", proc._id);
                    updateTemplateData("basePrice", proc.basePrice);
                    updateTemplateData("gstRate", proc.gstRate);
                    updateTemplateData("gstAmount", gstAmt);
                    updateTemplateData("totalAmount", total);
                    setTplProcDropdownOpen(false);
                  }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{proc.name}</span>
                      <span className="text-sm font-bold text-purple-600">{"\u20B9"}{proc.basePrice.toLocaleString()}{proc.gstRate > 0 ? ` +${proc.gstRate}% GST` : ""}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-gray-400 capitalize">{proc.category}</span>
                      {proc.gstRate > 0 && <span className="text-[11px] text-purple-500">Total: {"\u20B9"}{total.toLocaleString()}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {formData.templateData.basePrice > 0 && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded-lg font-medium">{"\u20B9"}{Number(formData.templateData.basePrice).toLocaleString()}</span>
              {formData.templateData.gstRate > 0 && (
                <>
                  <span className="text-gray-400">+</span>
                  <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded-lg font-medium">{formData.templateData.gstRate}% GST</span>
                  <span className="text-gray-400">=</span>
                  <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-lg font-bold">{"\u20B9"}{(Number(formData.templateData.basePrice) + Number(formData.templateData.basePrice) * Number(formData.templateData.gstRate) / 100).toLocaleString()}</span>
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    const value = String(formData.templateData[field.fieldName] ?? "");
    const onChange = (val: string) => updateTemplateData(field.fieldName, val);

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
        if (field.type === "prescription" && Array.isArray(val) && val.length > 0 && val.some((m: any) => m.name?.trim())) {
          const names = val.filter((m: any) => m.name?.trim()).map((m: any) => m.name).join(", ");
          previews.push({ label: "Prescription", value: names });
          if (previews.length >= 2) return previews;
          continue;
        }
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
    Object.values(template.templateData).filter((v) => {
      if (Array.isArray(v)) return v.length > 0 && v.some((m: any) => m.name?.trim());
      return v && String(v).trim();
    }).length;

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
              {pageTab === "templates" ? (
                <>
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
                </>
              ) : (
                <button
                  onClick={() => openProcedureModal()}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors shadow-md text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Procedure
                </button>
              )}
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

      {/* Page Tab Switcher */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 py-2">
            {[
              { key: "templates", label: "Templates", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
              { key: "procedures", label: "Procedures", icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setPageTab(tab.key as typeof pageTab)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  pageTab === tab.key
                    ? "bg-purple-50 text-purple-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
                {tab.key === "procedures" && procedures.length > 0 && (
                  <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-bold">{procedures.filter(p => p.isActive).length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {pageTab === "procedures" ? (
          /* ─── PROCEDURES TAB ─── */
          loadingProcedures ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="w-14 h-14 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Loading procedures...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="relative mb-4 group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400 pointer-events-none">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input type="text" placeholder="Search procedures..." value={procedureSearch} onChange={(e) => setProcedureSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-50 shadow-sm transition-all" />
              </div>

              {/* Category pills */}
              <div className="flex flex-wrap gap-2 mb-6">
                {PROCEDURE_CATEGORIES.map((cat) => {
                  const count = procedures.filter(p => p.category === cat.key && p.isActive).length;
                  if (count === 0 && !procedureSearch) return null;
                  return (
                    <span key={cat.key} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 capitalize">
                      <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cat.icon} /></svg>
                      {cat.label} <span className="text-purple-600">{count}</span>
                    </span>
                  );
                })}
              </div>

              {procedures.filter(p => !procedureSearch || p.name.toLowerCase().includes(procedureSearch.toLowerCase())).length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
                  <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">No procedures yet</h3>
                  <p className="text-gray-500 mb-4">Create cosmetology procedures with pricing to use in consultations and templates.</p>
                  <button onClick={() => openProcedureModal()} className="px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors text-sm">
                    Add First Procedure
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {procedures.filter(p => !procedureSearch || p.name.toLowerCase().includes(procedureSearch.toLowerCase())).map((proc) => {
                    const gstAmt = proc.basePrice * proc.gstRate / 100;
                    const total = proc.basePrice + gstAmt;
                    const catInfo = PROCEDURE_CATEGORIES.find(c => c.key === proc.category) || PROCEDURE_CATEGORIES[7];
                    return (
                      <div key={proc._id} className={`bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all ${!proc.isActive ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-violet-500 rounded-xl flex items-center justify-center shadow-sm">
                              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={catInfo.icon} /></svg>
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900 text-sm">{proc.name}</h3>
                              <p className="text-xs text-purple-500 font-medium capitalize">{proc.category}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openProcedureModal(proc)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => toggleProcedureActive(proc)} className={`p-1.5 rounded-lg transition-colors ${proc.isActive ? "hover:bg-red-50" : "hover:bg-green-50"}`} title={proc.isActive ? "Deactivate" : "Activate"}>
                              {proc.isActive ? (
                                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                              ) : (
                                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              )}
                            </button>
                          </div>
                        </div>
                        {proc.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{proc.description}</p>}
                        <div className="flex items-end justify-between pt-3 border-t border-gray-100">
                          <div>
                            <p className="text-xs text-gray-400">Base Price</p>
                            <p className="text-lg font-bold text-gray-900">{"\u20B9"}{proc.basePrice.toLocaleString()}</p>
                          </div>
                          {proc.gstRate > 0 && (
                            <div className="text-right">
                              <p className="text-xs text-gray-400">GST {proc.gstRate}%</p>
                              <p className="text-sm font-semibold text-purple-600">{"\u20B9"}{total.toLocaleString()}</p>
                            </div>
                          )}
                          {!proc.isActive && (
                            <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full uppercase">Inactive</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )
        ) : loading ? (
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
                                className={field.type === "textarea" || field.type === "prescription" ? "md:col-span-2" : ""}
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

      {/* ─── Procedure Modal ─── */}
      {showProcedureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowProcedureModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{editingProcedure ? "Edit Procedure" : "New Procedure"}</h3>
              <button onClick={() => setShowProcedureModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Procedure Name</label>
                <input type="text" value={procedureForm.name} onChange={(e) => setProcedureForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Chemical Peel, Laser Hair Removal" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
                {(() => {
                  const selectedCat = PROCEDURE_CATEGORIES.find(c => c.key === procedureForm.category) || PROCEDURE_CATEGORIES[7];
                  return (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setProcCatDropdownOpen(o => !o)}
                        className={`w-full px-3 py-2.5 bg-gradient-to-br from-gray-50 to-white border-2 rounded-xl text-sm outline-none transition-all flex items-center justify-between ${
                          procCatDropdownOpen
                            ? "border-purple-500 ring-4 ring-purple-500/15 shadow-sm"
                            : "border-gray-200 hover:border-purple-300"
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className={`w-7 h-7 rounded-lg bg-gradient-to-br ${selectedCat.gradient} flex items-center justify-center shadow-sm`}>
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d={selectedCat.icon} />
                            </svg>
                          </span>
                          <span className="font-semibold text-gray-800">{selectedCat.label}</span>
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${procCatDropdownOpen ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {procCatDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setProcCatDropdownOpen(false)} />
                          <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-fade-in-down">
                            <div className="px-4 py-2.5 bg-gradient-to-r from-purple-50 to-violet-50 border-b border-purple-100">
                              <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Choose a Category</p>
                            </div>
                            <div className="max-h-44 overflow-y-auto p-2 grid grid-cols-2 gap-1.5">
                              {PROCEDURE_CATEGORIES.map((cat) => {
                                const isSelected = procedureForm.category === cat.key;
                                return (
                                  <button
                                    key={cat.key}
                                    type="button"
                                    onClick={() => {
                                      setProcedureForm(f => ({ ...f, category: cat.key }));
                                      setProcCatDropdownOpen(false);
                                    }}
                                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                                      isSelected
                                        ? `${cat.soft} border-2 shadow-sm`
                                        : "border-2 border-transparent hover:bg-gray-50 hover:border-gray-200"
                                    }`}
                                  >
                                    <span className={`flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${cat.gradient} flex items-center justify-center shadow-sm`}>
                                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                                      </svg>
                                    </span>
                                    <span className={`flex-1 text-sm font-semibold ${isSelected ? "" : "text-gray-700"}`}>{cat.label}</span>
                                    {isSelected && (
                                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Base Price ({"\u20B9"})</label>
                  <input type="number" value={procedureForm.basePrice} onChange={(e) => setProcedureForm(f => ({ ...f, basePrice: e.target.value }))} placeholder="0" min="0" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">GST Rate (%)</label>
                  <input
                    type="number"
                    value={procedureForm.gstRate}
                    onChange={(e) => setProcedureForm(f => ({ ...f, gstRate: e.target.value }))}
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                  />
                </div>
              </div>
              {Number(procedureForm.basePrice) > 0 && Number(procedureForm.gstRate) > 0 && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 flex justify-between items-center">
                  <span className="text-xs text-purple-600 font-medium">Total (incl. GST)</span>
                  <span className="text-lg font-bold text-purple-700">{"\u20B9"}{(Number(procedureForm.basePrice) + Number(procedureForm.basePrice) * Number(procedureForm.gstRate) / 100).toLocaleString()}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description (optional)</label>
                <textarea value={procedureForm.description} onChange={(e) => setProcedureForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the procedure..." rows={2} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowProcedureModal(false)} className="px-4 py-2.5 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
              <button onClick={saveProcedure} disabled={savingProcedure} className="px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors text-sm disabled:opacity-50">
                {savingProcedure ? "Saving..." : editingProcedure ? "Update" : "Create"}
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
