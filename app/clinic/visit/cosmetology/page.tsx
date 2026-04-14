"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface FormField {
  fieldName: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "date" | "checkbox" | "prescription";
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

interface Issue {
  id: string;
  formData: Record<string, any>;
  visitImages: File[];
  visitPreviews: string[];
  isExpanded: boolean;
}

interface Toast {
  message: string;
  type: "success" | "error";
}

interface PreviousVisit {
  _id: string;
  consultationDate: string;
  procedure?: { name?: string };
  customFields?: Record<string, any>;
  images: { url: string; uploadedAt: string }[];
}

interface ComparisonPhoto {
  url: string;
  visitLabel: string;
  issueLabel?: string;
  uid: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SHARED_SECTION_NAMES = ["followUp"];

const ISSUE_COLORS = [
  {
    gradient: "from-purple-500 to-purple-600",
    light: "bg-purple-50 border-purple-200",
    accent: "from-purple-500 to-purple-600",
  },
  {
    gradient: "from-violet-500 to-indigo-600",
    light: "bg-violet-50 border-violet-200",
    accent: "from-violet-500 to-indigo-600",
  },
];

// Get all images from a visit (including multi-issue images stored in customFields)
// Used for lightbox URL lookup — returns flat ordered array: issue 1 then issue 2, etc.
function getAllVisitImages(visit: PreviousVisit): { url: string; uploadedAt: string }[] {
  const imgs = [...(visit.images || [])];
  if (visit.customFields?._multiIssue && Array.isArray(visit.customFields._issues)) {
    visit.customFields._issues.forEach((issue: any, idx: number) => {
      if (idx === 0) return; // Issue 1 images already in visit.images
      (issue.imageUrls || []).forEach((url: string) => {
        imgs.push({ url, uploadedAt: "" });
      });
    });
  }
  return imgs;
}

interface VisitIssueGroup {
  label: string; // empty string for single-issue visits
  images: { url: string; uploadedAt: string }[];
}

// Returns per-issue photo groups for rendering with labels in the comparison view
function getVisitIssueGroups(visit: PreviousVisit): VisitIssueGroup[] {
  if (
    visit.customFields?._multiIssue === true &&
    Array.isArray(visit.customFields._issues) &&
    visit.customFields._issues.length > 1
  ) {
    return visit.customFields._issues.map((issue: any, idx: number) => {
      const concern = issue.formData?.primaryConcern || "";
      const baseLabel = issue.label || `Issue ${idx + 1}`;
      const label = `${baseLabel}${concern ? ` — ${concern}` : ""}`;
      const images: { url: string; uploadedAt: string }[] =
        idx === 0
          ? (visit.images || [])
          : (issue.imageUrls || []).map((url: string) => ({ url, uploadedAt: "" }));
      return { label, images };
    });
  }
  return [{ label: "", images: visit.images || [] }];
}

// ─── Component ────────────────────────────────────────────────────────────────

function CosmetologyVisitPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");
  const appointmentId = searchParams.get("appointmentId");

  const [patient, setPatient] = useState<Patient | null>(null);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");

  // Multi-issue state
  const [issues, setIssues] = useState<Issue[]>([]);
  const [sharedFormData, setSharedFormData] = useState<Record<string, any>>({});

  // Template state
  const [templates, setTemplates] = useState<any[]>([]);
  const [openIssueTemplateId, setOpenIssueTemplateId] = useState<string | null>(null);
  const [appliedTemplates, setAppliedTemplates] = useState<Record<string, string>>({});
  const [issueTemplateSearch, setIssueTemplateSearch] = useState("");

  // Billing
  const [consultationFee, setConsultationFee] = useState<string>("");
  const [feeSource, setFeeSource] = useState<"appointment" | "manual" | null>(null);

  // Toast
  const [toast, setToast] = useState<Toast | null>(null);

  // Before/After Comparison
  const [previousVisits, setPreviousVisits] = useState<PreviousVisit[]>([]);
  const [loadingPreviousVisits, setLoadingPreviousVisits] = useState(false);
  const [hasPreviousVisits, setHasPreviousVisits] = useState<boolean | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [selectedVisitIds, setSelectedVisitIds] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<PreviousVisit[]>([]);
  const [showFullscreenComparison, setShowFullscreenComparison] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<ComparisonPhoto[]>([]);

  // Medicine search for prescription autocomplete
  const [medSearchResults, setMedSearchResults] = useState<any[]>([]);
  const [medSearchActive, setMedSearchActive] = useState<string | null>(null);
  const medSearchTimer = useRef<NodeJS.Timeout | null>(null);
  const medDropdownRef = useRef<HTMLDivElement | null>(null);

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

  // Procedure search for autocomplete
  const [procSearchResults, setProcSearchResults] = useState<any[]>([]);
  const [procSearchActive, setProcSearchActive] = useState<string | null>(null);
  const procSearchTimer = useRef<NodeJS.Timeout | null>(null);
  const procDropdownRef = useRef<HTMLDivElement | null>(null);

  const searchProcedures = useCallback((query: string, key: string) => {
    setProcSearchActive(key);
    if (procSearchTimer.current) clearTimeout(procSearchTimer.current);
    if (query.length < 1) { setProcSearchResults([]); return; }
    procSearchTimer.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/tier2/cosmetology-procedures?search=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.success) setProcSearchResults(data.data);
      } catch { setProcSearchResults([]); }
    }, 300);
  }, []);

  const initializedRef = useRef(false);
  const newestIssueRef = useRef<HTMLDivElement | null>(null);
  const issueTemplateSearchRef = useRef<HTMLInputElement | null>(null);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const issueSections = useMemo(
    () =>
      sections
        .filter((s) => s.enabled && !SHARED_SECTION_NAMES.includes(s.sectionName))
        .sort((a, b) => a.order - b.order),
    [sections]
  );

  const sharedSections = useMemo(
    () =>
      sections
        .filter((s) => s.enabled && SHARED_SECTION_NAMES.includes(s.sectionName))
        .sort((a, b) => a.order - b.order),
    [sections]
  );

  const issueFilteredTemplates = useMemo(() => {
    const q = issueTemplateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q)
    );
  }, [templates, issueTemplateSearch]);

  // Aggregate all current-visit images across issues (for comparison view)
  const allCurrentImages = useMemo(() => {
    return issues.flatMap((issue, idx) =>
      issue.visitPreviews.map((url) => ({
        url,
        issueLabel: issues.length > 1 ? `Issue ${idx + 1}` : "Current",
      }))
    );
  }, [issues]);

  // ─── Toast ────────────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ─── Data Load ────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadData = async () => {
      const token = localStorage.getItem("token");
      if (!token) { router.push("/login"); return; }
      if (!patientId) { setPageError("No patient selected"); setLoading(false); return; }

      try {
        const today = new Date().toISOString().split("T")[0];
        const apptUrl = appointmentId
          ? `/api/tier2/appointments/${appointmentId}`
          : `/api/tier2/appointments?patientId=${patientId}&date=${today}&limit=10`;

        const [patientRes, formRes, templatesRes, apptRes] = await Promise.all([
          fetch(`/api/tier2/patients/${patientId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/tier2/settings/forms?formType=cosmetology`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/tier2/templates?templateType=cosmetology`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(apptUrl, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const [patientData, formSettingsData, templatesData, apptData] = await Promise.all(
          [patientRes, formRes, templatesRes, apptRes].map((r) => r.json())
        );

        if (patientData.success) setPatient(patientData.data.patient);
        else setPageError(patientData.message);

        if (formSettingsData.success) setSections(formSettingsData.data.sections);
        else setPageError(formSettingsData.message);

        if (templatesData.success) setTemplates(templatesData.data);

        // Extract fee from either single appointment or today's list
        let apptFee: number | null = null;
        if (appointmentId) {
          if (apptData?.success && apptData.data?.consultationFee != null) {
            apptFee = apptData.data.consultationFee;
          }
        } else {
          const appts: any[] = apptData?.data?.appointments ?? [];
          const active = appts.find(
            (a) =>
              ["scheduled", "confirmed", "checked-in", "in-progress"].includes(a.status) &&
              a.consultationFee != null
          );
          if (active) apptFee = active.consultationFee;
        }

        console.log("[VISIT-COSM] appointmentId:", appointmentId ?? "(auto-lookup)", "| fee found:", apptFee);
        if (apptFee != null) {
          setConsultationFee(String(apptFee));
          setFeeSource("appointment");
        }
      } catch {
        setPageError("Failed to load form data");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [patientId, router]);

  // Pre-fetch previous visits for comparison button visibility
  useEffect(() => {
    if (!patientId) return;
    const fetchPreviousVisits = async () => {
      setLoadingPreviousVisits(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/tier2/consultation/cosmetology?patientId=${patientId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          const withImages = data.data.filter((v: PreviousVisit) => getAllVisitImages(v).length > 0);
          setPreviousVisits(withImages);
          setHasPreviousVisits(withImages.length > 0);
        } else {
          setHasPreviousVisits(false);
        }
      } catch {
        setHasPreviousVisits(false);
      } finally {
        setLoadingPreviousVisits(false);
      }
    };
    fetchPreviousVisits();
  }, [patientId]);

  // ─── Initialize issues once sections load ────────────────────────────────

  useEffect(() => {
    if (sections.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    const buildEmpty = () => {
      const fd: Record<string, any> = {};
      sections
        .filter((s) => s.enabled && !SHARED_SECTION_NAMES.includes(s.sectionName))
        .forEach((s) => s.fields.filter((f) => f.enabled).forEach((f) => {
          fd[f.fieldName] = f.type === "checkbox" ? false : "";
        }));
      return fd;
    };

    setIssues([{
      id: `issue-${Date.now()}`,
      formData: buildEmpty(),
      visitImages: [],
      visitPreviews: [],
      isExpanded: true,
    }]);

    const shared: Record<string, any> = {};
    sections
      .filter((s) => s.enabled && SHARED_SECTION_NAMES.includes(s.sectionName))
      .forEach((s) => s.fields.filter((f) => f.enabled).forEach((f) => {
        shared[f.fieldName] = f.type === "checkbox" ? false : "";
      }));
    setSharedFormData(shared);
  }, [sections]);

  // Scroll to newest issue card
  useEffect(() => {
    if (issues.length > 1) {
      newestIssueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [issues.length]);

  // Auto-focus template search on open
  useEffect(() => {
    if (openIssueTemplateId) {
      const t = setTimeout(() => issueTemplateSearchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      setIssueTemplateSearch("");
    }
  }, [openIssueTemplateId]);

  // ─── Issue Management ─────────────────────────────────────────────────────

  const buildIssueFormData = useCallback(() => {
    const fd: Record<string, any> = {};
    issueSections.forEach((s) =>
      s.fields.filter((f) => f.enabled).forEach((f) => {
        fd[f.fieldName] = f.type === "checkbox" ? false : "";
      })
    );
    return fd;
  }, [issueSections]);

  const addIssue = useCallback(() => {
    if (issues.length >= 2) {
      showToast("Maximum 2 issues per consultation", "error");
      return;
    }
    const newIssue: Issue = {
      id: `issue-${Date.now()}`,
      formData: buildIssueFormData(),
      visitImages: [],
      visitPreviews: [],
      isExpanded: true,
    };
    setIssues((prev) => [...prev, newIssue]);
  }, [issues.length, buildIssueFormData, showToast]);

  const removeIssue = (id: string) => {
    setIssues((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      if (updated.length > 0 && !updated.some((i) => i.isExpanded)) {
        updated[updated.length - 1].isExpanded = true;
      }
      return updated;
    });
  };

  const updateIssue = (id: string, updates: Partial<Issue>) => {
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  const updateIssueFormData = (id: string, fieldName: string, value: any) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === id ? { ...i, formData: { ...i.formData, [fieldName]: value } } : i))
    );
  };

  // ─── Template Apply ───────────────────────────────────────────────────────

  const applyTemplateToIssue = (issueId: string, templateId: string) => {
    const template = templates.find((t) => t._id === templateId);
    if (!template) return;
    const nonEmpty: Record<string, any> = Object.fromEntries(
      Object.entries(template.templateData).filter(([, v]) => v !== undefined && v !== null && v !== "")
    );
    const bp = Number(nonEmpty.basePrice);
    const gr = Number(nonEmpty.gstRate);
    if (!isNaN(bp) && bp > 0) {
      const rate = !isNaN(gr) ? gr : 0;
      nonEmpty.basePrice = bp;
      nonEmpty.gstRate = rate;
      nonEmpty.gstAmount = bp * rate / 100;
      nonEmpty.totalAmount = bp + nonEmpty.gstAmount;
    }
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, formData: { ...i.formData, ...nonEmpty } } : i))
    );
    setAppliedTemplates((prev) => ({ ...prev, [issueId]: template.name }));
  };

  // ─── Image Compression ────────────────────────────────────────────────────

  const compressImage = (file: File, maxWidth = 1024, quality = 0.8): Promise<File> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(new File([blob], file.name, { type: "image/jpeg", lastModified: Date.now() }))
                : resolve(file),
            "image/jpeg",
            quality
          );
        };
      };
    });

  // ─── Image Handlers (per-issue) ───────────────────────────────────────────

  const handleVisitImageUpload = async (issueId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;
    const files = Array.from(e.target.files || []);
    if (issue.visitImages.length + files.length > 10) {
      showToast("Maximum 10 photos per issue", "error");
      return;
    }
    const compressed = await Promise.all(files.map((f) => compressImage(f)));
    const newPreviews: string[] = [];
    await Promise.all(
      compressed.map(
        (file) =>
          new Promise<void>((res) => {
            const reader = new FileReader();
            reader.onloadend = () => { newPreviews.push(reader.result as string); res(); };
            reader.readAsDataURL(file);
          })
      )
    );
    updateIssue(issueId, {
      visitImages: [...issue.visitImages, ...compressed],
      visitPreviews: [...issue.visitPreviews, ...newPreviews],
    });
  };

  const removeVisitImage = (issueId: string, index: number) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;
    updateIssue(issueId, {
      visitImages: issue.visitImages.filter((_, i) => i !== index),
      visitPreviews: issue.visitPreviews.filter((_, i) => i !== index),
    });
  };

  // ─── Comparison ───────────────────────────────────────────────────────────

  const toggleVisitSelection = (visitId: string) => {
    setSelectedVisitIds((prev) => {
      if (prev.includes(visitId)) return prev.filter((id) => id !== visitId);
      if (prev.length >= 5) { showToast("You can compare up to 5 previous visits", "error"); return prev; }
      return [...prev, visitId];
    });
  };

  const loadComparisonData = () => {
    const selected = previousVisits.filter((v) => selectedVisitIds.includes(v._id));
    setComparisonData(selected);
    setShowComparisonModal(false);
    setShowPhotoPicker(true);
    setSelectedPhotos([]);
    setSelectedImageIndex(null);
  };

  const togglePhotoSelection = (photo: ComparisonPhoto) => {
    setSelectedPhotos((prev) => {
      const exists = prev.findIndex((p) => p.uid === photo.uid);
      if (exists >= 0) return prev.filter((_, i) => i !== exists);
      if (prev.length >= 4) {
        showToast("You can select up to 4 photos", "error");
        return prev;
      }
      return [...prev, photo];
    });
  };

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Validate required fields across all issues
    for (const [idx, issue] of issues.entries()) {
      for (const section of issueSections) {
        for (const field of section.fields) {
          if (field.enabled && field.required && !issue.formData[field.fieldName]) {
            showToast(`Issue ${idx + 1}: "${field.label}" is required`, "error");
            updateIssue(issue.id, { isExpanded: true });
            return;
          }
        }
      }
    }
    for (const section of sharedSections) {
      for (const field of section.fields) {
        if (field.enabled && field.required && !sharedFormData[field.fieldName]) {
          showToast(`"${field.label}" is required`, "error");
          return;
        }
      }
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");

      // Upload images per issue
      const processedIssues: Array<{
        label: string;
        formData: Record<string, any>;
        imageUrls: string[];
      }> = [];

      for (const [idx, issue] of issues.entries()) {
        let imageUrls: string[] = [];
        if (issue.visitImages.length > 0) {
          const fd = new FormData();
          issue.visitImages.forEach((img) => fd.append("images", img));
          const res = await fetch("/api/tier2/upload?skipAI=true", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const data = await res.json();
          if (data.success) imageUrls = data.data.imageUrls;
        }
        processedIssues.push({ label: `Issue ${idx + 1}`, formData: issue.formData, imageUrls });
      }

      // Build combined formData (issue 1 fields at top level for backwards compat)
      const combinedFormData: Record<string, any> = {
        ...processedIssues[0]?.formData,
        ...sharedFormData,
      };
      if (issues.length > 1) {
        combinedFormData._multiIssue = true;
        combinedFormData._issues = processedIssues;
      }

      const saveRes = await fetch("/api/tier2/consultation/cosmetology", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId,
          appointmentId,
          formData: combinedFormData,
          imageUrls: processedIssues[0]?.imageUrls || [],
          consultationFee: consultationFee ? parseFloat(consultationFee) : undefined,
        }),
      });

      const saveData = await saveRes.json();
      if (saveData.success) {
        router.push(`/clinic/consultation/cosmetology/${saveData.data.consultationId}`);
      } else {
        showToast("Failed to save: " + saveData.message, "error");
      }
    } catch {
      showToast("Failed to save consultation", "error");
    } finally {
      setSaving(false);
    }
  };

  // ─── Render Field ─────────────────────────────────────────────────────────

  const renderField = (
    field: FormField,
    value: any,
    onChange: (fieldName: string, value: any) => void,
    contextKey: string = "shared"
  ) => {
    if (!field.enabled) return null;

    const inputClass =
      "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-slate-800 placeholder-gray-400";

    // Special: Procedure name field with search dropdown + price/GST auto-fill
    if (field.fieldName === "name" && field.label?.toLowerCase().includes("procedure")) {
      const searchKey = `proc-${contextKey}-${field.fieldName}`;
      return (
        <div className="relative">
          <input
            type="text"
            value={value || ""}
            onChange={(e) => { onChange(field.fieldName, e.target.value); searchProcedures(e.target.value, searchKey); }}
            onFocus={() => { if ((value || "").length >= 1) searchProcedures(value, searchKey); }}
            onBlur={() => setTimeout(() => { if (procSearchActive === searchKey) { setProcSearchActive(null); setProcSearchResults([]); } }, 200)}
            placeholder={field.placeholder || "Search or type procedure name..."}
            className={inputClass}
            required={field.required}
            autoComplete="off"
          />
          {procSearchActive === searchKey && procSearchResults.length > 0 && (
            <div ref={procDropdownRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              {procSearchResults.map((proc: any) => {
                const gstAmt = proc.basePrice * proc.gstRate / 100;
                const total = proc.basePrice + gstAmt;
                return (
                  <button key={proc._id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0" onClick={() => {
                    onChange(field.fieldName, proc.name);
                    onChange("procedureId", proc._id);
                    onChange("basePrice", proc.basePrice);
                    onChange("gstRate", proc.gstRate);
                    onChange("gstAmount", gstAmt);
                    onChange("totalAmount", total);
                    setProcSearchActive(null); setProcSearchResults([]);
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
          {/* Show pricing summary if selected */}
          {value && (typeof onChange === "function") && (() => {
            // We can't directly access other fields here, but pricing shows in the form below
            return null;
          })()}
        </div>
      );
    }

    switch (field.type) {
      case "textarea":
        return (
          <textarea
            value={value || ""}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className={inputClass}
            required={field.required}
          />
        );
      case "number":
        return (
          <input
            type="number"
            value={value || ""}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            className={inputClass}
            required={field.required}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={value || ""}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            className={inputClass}
            required={field.required}
          />
        );
      case "select":
        return (
          <select
            value={value || ""}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            className={inputClass}
            required={field.required}
          >
            <option value="">Select {field.label}</option>
            {field.options?.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case "checkbox":
        return (
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => onChange(field.fieldName, !value)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? "bg-purple-500" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm text-slate-600">{field.placeholder || field.label}</span>
          </div>
        );
      case "prescription": {
        const meds: Array<{ name: string; dosage: string; route: string; frequency: string; duration: string; instructions: string; quantity: string }> = Array.isArray(value) ? value : [];
        const updateMed = (idx: number, key: string, val: string) => {
          const updated = [...meds];
          updated[idx] = { ...updated[idx], [key]: val };
          onChange(field.fieldName, updated);
        };
        const addMed = () => onChange(field.fieldName, [...meds, { name: "", dosage: "", route: "", frequency: "", duration: "", instructions: "", quantity: "" }]);
        const removeMed = (idx: number) => onChange(field.fieldName, meds.filter((_, i) => i !== idx));
        return (
          <div className="space-y-3">
            {meds.map((med, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 relative group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Rx {idx + 1}</span>
                  {meds.length > 1 && (
                    <button type="button" onClick={() => removeMed(idx)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg transition-all" title="Remove">
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 relative">
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Medicine Name</label>
                    <input type="text" value={med.name} onChange={(e) => { updateMed(idx, "name", e.target.value); searchMedicines(e.target.value, `rx-${idx}`); }} onFocus={() => { if (med.name.length >= 2) searchMedicines(med.name, `rx-${idx}`); }} onBlur={() => setTimeout(() => { if (medSearchActive === `rx-${idx}`) { setMedSearchActive(null); setMedSearchResults([]); } }, 200)} placeholder="e.g. Tab. Azithromycin" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none" autoComplete="off" />
                    {medSearchActive === `rx-${idx}` && medSearchResults.length > 0 && (
                      <div ref={medDropdownRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {medSearchResults.map((item: any) => (
                          <button key={item._id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0" onClick={() => { updateMed(idx, "name", item.name); setMedSearchActive(null); setMedSearchResults([]); }}>
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
                              <span className="text-[11px] text-purple-600 font-medium">₹{item.sellingPrice}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Dosage</label>
                    <input type="text" value={med.dosage} onChange={(e) => updateMed(idx, "dosage", e.target.value)} placeholder="e.g. 500mg" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Route</label>
                    <input type="text" value={med.route} onChange={(e) => updateMed(idx, "route", e.target.value)} placeholder="e.g. Oral, Topical" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Frequency</label>
                    <input type="text" value={med.frequency} onChange={(e) => updateMed(idx, "frequency", e.target.value)} placeholder="e.g. BD, TID, OD" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Duration</label>
                    <input type="text" value={med.duration} onChange={(e) => updateMed(idx, "duration", e.target.value)} placeholder="e.g. 7 days, 1 month" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Quantity</label>
                    <input type="text" value={med.quantity || ""} onChange={(e) => updateMed(idx, "quantity", e.target.value)} placeholder="e.g. 10, 1 strip" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Instructions</label>
                    <input type="text" value={med.instructions} onChange={(e) => updateMed(idx, "instructions", e.target.value)} placeholder="e.g. After food, Apply locally" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none" />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addMed} className="w-full py-2.5 border-2 border-dashed border-purple-300 rounded-xl text-purple-600 text-sm font-semibold hover:border-purple-500 hover:bg-purple-50 transition-all flex items-center justify-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <span>Add Medicine</span>
            </button>
          </div>
        );
      }
      default:
        return (
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            className={inputClass}
            required={field.required}
          />
        );
    }
  };

  // ─── Loading / Error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading form...</p>
        </div>
      </div>
    );
  }

  if (pageError || !patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Error</h3>
          <p className="text-slate-600 mb-6">{pageError || "Failed to load form"}</p>
          <Link href="/clinic/patients">
            <button className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors">
              Back to Patients
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]">
          <div className={`flex items-center space-x-3 px-5 py-3.5 rounded-2xl shadow-xl text-white font-medium text-sm ${toast.type === "success" ? "bg-emerald-600" : "bg-red-500"}`}>
            {toast.type === "success" ? (
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-lg shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-slate-500 hover:text-slate-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">Cosmetology Visit</h1>
              <p className="text-base text-slate-500 leading-tight">
                {patient.name} · {patient.patientId}
              </p>
            </div>
          </div>
        </div>
        <nav className="border-t border-gray-100 bg-white/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-1 overflow-x-auto">
              {[
                { label: "Dashboard", href: "/clinic/dashboard" },
                { label: "Patients", href: "/clinic/patients" },
                { label: "Visits", href: "/clinic/visit/new", active: true },
                { label: "Appointments", href: "/clinic/appointments" },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`py-3 px-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    item.active
                      ? "border-purple-600 text-purple-700"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Patient Banner */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-400" />
          <div className="px-6 py-5 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shrink-0 shadow-md shadow-purple-500/20">
                <span className="text-xl font-bold text-white leading-none select-none">
                  {patient.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">{patient.name}</h3>
                  <span className="px-2.5 py-0.5 bg-purple-100 text-purple-700 border border-purple-200 rounded-full text-xs font-semibold tracking-wide">
                    Cosmetology
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="font-medium">{patient.age} yrs</span>
                  <span className="text-slate-300">·</span>
                  <span>{patient.gender}</span>
                  <span className="text-slate-300">·</span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {patient.phone}
                  </span>
                </div>
              </div>
            </div>
            <div className="shrink-0 pl-6 border-l border-slate-100 text-right">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">Patient ID</p>
              <p className="text-base font-bold text-slate-800 font-mono tracking-wide">{patient.patientId}</p>
            </div>
          </div>
        </div>

        {/* Overlay to close per-issue template dropdown */}
        {openIssueTemplateId && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => { setOpenIssueTemplateId(null); setIssueTemplateSearch(""); }}
          />
        )}

        {/* ── Issue Cards ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-slate-900">
                {issues.length === 1 ? "Consultation Details" : `${issues.length} Issues`}
              </h2>
              {issues.length > 1 && (
                <span className="px-2.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                  {issues.length} concerns
                </span>
              )}
            </div>
            {issues.length > 1 && (
              <p className="text-xs text-slate-400">Click an issue header to expand/collapse</p>
            )}
          </div>

          {issues.map((issue, issueIndex) => {
            const color = ISSUE_COLORS[issueIndex % ISSUE_COLORS.length];
            return (
              <div
                key={issue.id}
                ref={issueIndex === issues.length - 1 && issues.length > 1 ? newestIssueRef : undefined}
                className={`rounded-2xl border-2 shadow-md overflow-hidden ${color.light}`}
              >
                {/* Issue Header */}
                <div
                  className={`bg-gradient-to-r ${color.gradient} px-6 py-4 flex items-center justify-between cursor-pointer select-none`}
                  onClick={() => updateIssue(issue.id, { isExpanded: !issue.isExpanded })}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 bg-white/25 rounded-xl flex items-center justify-center font-bold text-white text-base">
                      {issueIndex + 1}
                    </div>
                    <div>
                      <p className="font-bold text-white text-base">
                        Issue {issueIndex + 1}
                        {issues.length === 1 && " — Primary Concern"}
                      </p>
                      {Object.values(issue.formData).find((v) => v && v !== false) && (
                        <p className="text-white/75 text-xs truncate max-w-xs mt-0.5">
                          {String(Object.values(issue.formData).find((v) => v && v !== false) || "").substring(0, 60)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">

                    {/* Per-issue template button */}
                    {templates.length > 0 && (
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() =>
                            setOpenIssueTemplateId(openIssueTemplateId === issue.id ? null : issue.id)
                          }
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/35 rounded-xl text-white text-xs font-semibold transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>{appliedTemplates[issue.id] ?? "Template"}</span>
                          <svg
                            className={`w-3 h-3 transition-transform ${openIssueTemplateId === issue.id ? "rotate-180" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {openIssueTemplateId === issue.id && (
                          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 flex flex-col max-h-96 overflow-hidden">
                            {/* Dropdown header */}
                            <div className={`px-4 py-3 bg-gradient-to-r ${color.gradient} shrink-0`}>
                              <p className="text-xs font-bold text-white/90 uppercase tracking-wider">
                                Apply template to Issue {issueIndex + 1}
                              </p>
                            </div>
                            {/* Search */}
                            <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
                              <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus-within:border-purple-400 focus-within:bg-white focus-within:shadow-sm transition-all">
                                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                  ref={issueTemplateSearchRef}
                                  type="text"
                                  value={issueTemplateSearch}
                                  onChange={(e) => setIssueTemplateSearch(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const first = issueFilteredTemplates[0];
                                      if (first) { applyTemplateToIssue(issue.id, first._id); setOpenIssueTemplateId(null); setIssueTemplateSearch(""); }
                                    }
                                    if (e.key === "Escape") { setOpenIssueTemplateId(null); setIssueTemplateSearch(""); }
                                  }}
                                  placeholder="Search by name or category…"
                                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none ring-0 focus:ring-0 focus:outline-none"
                                />
                                {issueTemplateSearch ? (
                                  <button
                                    onClick={() => setIssueTemplateSearch("")}
                                    className="w-5 h-5 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded-full shrink-0 transition-colors"
                                  >
                                    <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-300 shrink-0">{templates.length}</span>
                                )}
                              </div>
                            </div>
                            {/* Template list */}
                            <div className="overflow-y-auto flex-1 min-h-0 py-1.5">
                              {issueFilteredTemplates.length === 0 ? (
                                <div className="px-4 py-8 text-center">
                                  <p className="text-sm font-medium text-slate-500">No templates found</p>
                                  <p className="text-xs text-slate-400 mt-0.5">Try a different search term</p>
                                </div>
                              ) : (
                                issueFilteredTemplates.map((tmpl) => (
                                  <button
                                    key={tmpl._id}
                                    onClick={() => {
                                      applyTemplateToIssue(issue.id, tmpl._id);
                                      setOpenIssueTemplateId(null);
                                      setIssueTemplateSearch("");
                                    }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-purple-50 active:bg-purple-100 transition-colors group"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="font-semibold text-slate-800 text-sm group-hover:text-purple-700 transition-colors truncate">{tmpl.name}</p>
                                        {tmpl.description && (
                                          <p className="text-xs text-slate-400 truncate mt-0.5">{tmpl.description}</p>
                                        )}
                                      </div>
                                      {tmpl.category && (
                                        <span className="shrink-0 px-2 py-0.5 bg-slate-100 text-slate-500 group-hover:bg-purple-100 group-hover:text-purple-600 rounded-full text-xs font-medium transition-colors">
                                          {tmpl.category}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Remove issue button */}
                    {issues.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeIssue(issue.id); }}
                        className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/35 transition-colors"
                        title="Remove this issue"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}

                    {/* Expand / collapse chevron */}
                    <svg
                      className={`w-5 h-5 text-white transition-transform duration-200 ${issue.isExpanded ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Issue Content */}
                {issue.isExpanded && (
                  <div className="bg-white p-6 space-y-6">

                    {/* Form sections */}
                    {issueSections.map((section) => (
                      <div key={section.sectionName}>
                        <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-gray-100">
                          <div className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${color.accent}`} />
                          <h4 className="font-bold text-slate-900">{section.sectionLabel}</h4>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          {section.fields
                            .filter((f) => f.enabled)
                            .sort((a, b) => a.order - b.order)
                            .map((field) => (
                              <div
                                key={field.fieldName}
                                className={field.type === "textarea" || field.type === "prescription" ? "md:col-span-2" : ""}
                              >
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                  {field.label}
                                  {field.required && <span className="text-red-500 ml-1">*</span>}
                                </label>
                                {renderField(field, issue.formData[field.fieldName], (fn, v) => updateIssueFormData(issue.id, fn, v), issue.id)}
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}

                    {/* Procedure Pricing Summary */}
                    {issue.formData.basePrice > 0 && (
                      <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl border border-purple-200 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <h5 className="font-semibold text-slate-900 text-sm">
                            Procedure Pricing
                            {issues.length > 1 && <span className="text-purple-600 font-bold ml-1">· Issue {issueIndex + 1}</span>}
                          </h5>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-white rounded-lg p-3 text-center border border-purple-100">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Procedure Base Price</p>
                            <p className="text-lg font-bold text-slate-800">{"\u20B9"}{Number(issue.formData.basePrice).toLocaleString()}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center border border-purple-100">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">GST Charged ({issue.formData.gstRate || 0}%)</p>
                            <p className="text-lg font-bold text-slate-800">{"\u20B9"}{Number(issue.formData.gstAmount || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center border border-purple-100">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Total Payable</p>
                            <p className="text-lg font-bold text-purple-700">{"\u20B9"}{Number(issue.formData.totalAmount || issue.formData.basePrice).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visit Photos — per issue */}
                    <div className="bg-purple-50 rounded-xl border border-purple-200 p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <h5 className="font-semibold text-slate-900 text-sm">Visit Photos</h5>
                            <p className="text-xs text-purple-600">Up to 10 photos for this concern</p>
                          </div>
                        </div>
                      </div>

                      {issue.visitPreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          {issue.visitPreviews.map((preview, i) => (
                            <div key={i} className="relative group">
                              <img
                                src={preview}
                                alt={`Photo ${i + 1}`}
                                className="w-full h-32 object-cover rounded-lg border-2 border-purple-200"
                              />
                              <button
                                onClick={() => removeVisitImage(issue.id, i)}
                                className="absolute top-1.5 right-1.5 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {issue.visitImages.length < 10 && (
                        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-purple-300 rounded-xl cursor-pointer hover:border-purple-500 hover:bg-purple-100/50 transition-all">
                          <svg className="w-7 h-7 text-purple-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <p className="text-xs text-purple-600 font-medium">Add Photos ({issue.visitImages.length}/10)</p>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            multiple
                            onChange={(e) => handleVisitImageUpload(issue.id, e)}
                          />
                        </label>
                      )}
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Compare with Previous Visits — always visible */}
          <div className={`rounded-2xl shadow-md border p-5 ${
            hasPreviousVisits === false
              ? "bg-gray-50 border-gray-200"
              : "bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${
                  hasPreviousVisits === false
                    ? "bg-gray-300"
                    : "bg-gradient-to-br from-purple-500 to-indigo-600"
                }`}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h4 className={`font-bold ${hasPreviousVisits === false ? "text-slate-500" : "text-slate-900"}`}>
                    Compare with Previous Visits
                  </h4>
                  <p className="text-sm text-slate-500">
                    {hasPreviousVisits === null
                      ? "Checking for previous visits..."
                      : hasPreviousVisits === false
                      ? "No previous visits with photos for this patient"
                      : "Compare today\u2019s photos with previous visits"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowComparisonModal(true); setSelectedVisitIds([]); setComparisonData([]); }}
                disabled={!hasPreviousVisits}
                className={`px-5 py-2.5 font-semibold rounded-xl transition-all flex items-center space-x-2 ${
                  hasPreviousVisits
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 shadow-md hover:shadow-lg"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Compare</span>
              </button>
            </div>

            {/* Comparison indicator */}
            {comparisonData.length > 0 && (
              <div className="mt-4 pt-4 border-t border-purple-200 flex items-center justify-between">
                <p className="text-sm text-purple-700 font-medium">
                  {comparisonData.length} visit{comparisonData.length > 1 ? "s" : ""} selected for comparison
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowPhotoPicker(true)}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors text-sm"
                  >
                    View Comparison
                  </button>
                  <button
                    onClick={() => setComparisonData([])}
                    className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

        {/* Add Another Issue button */}
        {issues.length < 2 && (
          <button
            onClick={addIssue}
            className="w-full py-3.5 border-2 border-dashed border-purple-300 rounded-2xl text-purple-700 font-semibold hover:border-purple-500 hover:bg-purple-50 transition-all flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Another Issue</span>
          </button>
        )}

        {/* Shared sections (e.g. Follow Up) */}
        {sharedSections.map((section) => (
          <div key={section.sectionName} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-gray-100">
              <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-slate-500 to-slate-700" />
              <h4 className="font-bold text-slate-900">{section.sectionLabel}</h4>
              {issues.length > 1 && (
                <span className="text-xs text-slate-400 ml-2">(shared across all issues)</span>
              )}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {section.fields
                .filter((f) => f.enabled)
                .sort((a, b) => a.order - b.order)
                .map((field) => (
                  <div key={field.fieldName} className={field.type === "textarea" || field.type === "prescription" ? "md:col-span-2" : ""}>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderField(field, sharedFormData[field.fieldName], (fn, v) =>
                      setSharedFormData((prev) => ({ ...prev, [fn]: v }))
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}


        {/* ── Consultation Fee ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
          <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-gray-100">
            <div className="w-1.5 h-6 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-full" />
            <h3 className="text-lg font-bold text-slate-900">Consultation Fee</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative max-w-xs">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-base">₹</span>
              <input
                type="text"
                inputMode="decimal"
                value={consultationFee}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setConsultationFee(v);
                }}
                placeholder="e.g. 500"
                className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-slate-800 placeholder-gray-400 text-base"
              />
            </div>
            <div className="flex flex-col gap-1">
              {feeSource === "appointment" && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full w-fit">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Auto-filled from appointment
                </span>
              )}
              <p className="text-sm text-slate-400">
                {consultationFee
                  ? `₹${parseFloat(consultationFee).toLocaleString("en-IN")} will be recorded for this visit`
                  : "Leave blank if not applicable"}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <Link href={`/clinic/patients/${patientId}`}>
            <button className="px-6 py-3 bg-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-300 transition-colors">
              Cancel
            </button>
          </Link>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md shadow-purple-500/20 hover:shadow-lg flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>Save & Complete Consultation</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </>
            )}
          </button>
        </div>

      </main>

      {/* ── Comparison Modal ─────────────────────────────────────────────────── */}
      {showComparisonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white">Comparative Analysis</h3>
              <p className="text-purple-100 text-sm mt-1">Select up to 5 previous visits to compare with the current visit</p>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {loadingPreviousVisits ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4" />
                  <p className="text-slate-600">Loading previous visits...</p>
                </div>
              ) : previousVisits.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-slate-700 mb-2">No Previous Visits with Photos</h4>
                  <p className="text-slate-500">This patient has no previous cosmetology visits with photos to compare.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 mb-4">
                    <span className="font-semibold">{selectedVisitIds.length}/5</span> visits selected
                  </p>
                  {previousVisits.map((visit) => {
                    const allImgs = getAllVisitImages(visit);
                    return (
                      <div
                        key={visit._id}
                        onClick={() => toggleVisitSelection(visit._id)}
                        className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                          selectedVisitIds.includes(visit._id)
                            ? "border-purple-500 bg-purple-50"
                            : "border-gray-200 hover:border-purple-300"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-semibold text-slate-900">
                              {new Date(visit.consultationDate).toLocaleDateString("en-IN", {
                                weekday: "long", day: "numeric", month: "long", year: "numeric",
                              })}
                            </h4>
                            {visit.procedure?.name && (
                              <p className="text-sm text-slate-600">{visit.procedure.name}</p>
                            )}
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            selectedVisitIds.includes(visit._id) ? "bg-purple-600 border-purple-600" : "border-gray-300"
                          }`}>
                            {selectedVisitIds.includes(visit._id) && (
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {allImgs.slice(0, 4).map((img, idx) => (
                            <img key={idx} src={img.url} alt={`Visit ${idx + 1}`} className="w-full h-20 object-cover rounded-lg" />
                          ))}
                          {allImgs.length > 4 && (
                            <div className="w-full h-20 bg-slate-100 rounded-lg flex items-center justify-center text-sm text-slate-500">
                              +{allImgs.length - 4} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t">
              <button
                onClick={() => { setShowComparisonModal(false); setSelectedVisitIds([]); }}
                className="px-6 py-2.5 bg-white text-slate-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={loadComparisonData}
                disabled={selectedVisitIds.length === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Compare Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fullscreen Comparison ────────────────────────────────────────────── */}
      {/* ── Photo Picker ─────────────────────────────────────────────────────── */}
      {showPhotoPicker && comparisonData.length > 0 && (
        <div className="fixed inset-0 bg-gray-100/80 z-[100] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button onClick={() => { setShowPhotoPicker(false); setShowComparisonModal(true); }} className="p-2 -ml-2 hover:bg-gray-100 rounded-xl transition-colors" title="Back">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Select Photos to Compare</h3>
                  <p className="text-gray-500 text-xs mt-0.5">Tap photos from any visit below</p>
                </div>
              </div>
              <button onClick={() => { setShowPhotoPicker(false); setSelectedImageIndex(null); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Photo Grid */}
          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
            {/* Current Visit */}
            {allCurrentImages.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center space-x-3 px-5 py-4 border-b border-gray-100">
                  <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold uppercase tracking-wide">Today</span>
                  <h4 className="font-semibold text-gray-900">Current Visit</h4>
                  <span className="text-xs text-gray-400">{allCurrentImages.length} photo{allCurrentImages.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {allCurrentImages.map((img, idx) => {
                      const imgUid = `cur-${img.issueLabel || "0"}-${idx}`;
                      const photo: ComparisonPhoto = { url: img.url, visitLabel: "Current Visit", issueLabel: img.issueLabel, uid: imgUid };
                      const selIdx = selectedPhotos.findIndex((p) => p.uid === imgUid);
                      const isSelected = selIdx >= 0;
                      return (
                        <div key={imgUid} className={`relative aspect-square cursor-pointer group rounded-xl overflow-hidden transition-all duration-200 ${isSelected ? "ring-2 ring-purple-500 ring-offset-2 scale-[0.97]" : "hover:shadow-md ring-1 ring-gray-200"}`} onClick={() => togglePhotoSelection(photo)}>
                          <img src={img.url} alt={`Current ${idx + 1}`} className="w-full h-full object-cover" />
                          <div className={`absolute inset-0 transition-all duration-200 ${isSelected ? "bg-purple-500/10" : "bg-black/0 group-hover:bg-black/5"}`} />
                          {isSelected ? (
                            <div className="absolute top-2 right-2 w-7 h-7 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </div>
                          ) : (
                            <div className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-gray-200">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                          )}
                          {issues.length > 1 && (
                            <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-medium rounded-md">{img.issueLabel}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Previous Visits */}
            {comparisonData.map((visit, vIdx) => {
              const allImages = getAllVisitImages(visit);
              if (allImages.length === 0) return null;
              const visitDate = new Date(visit.consultationDate);
              const dateLabel = visitDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
              const daysAgo = Math.floor((Date.now() - visitDate.getTime()) / 86400000);
              const timeAgo = daysAgo < 7 ? `${daysAgo}d ago` : daysAgo < 30 ? `${Math.floor(daysAgo / 7)}w ago` : daysAgo < 365 ? `${Math.floor(daysAgo / 30)}mo ago` : `${Math.floor(daysAgo / 365)}y ago`;
              return (
                <div key={visit._id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center space-x-3 px-5 py-4 border-b border-gray-100">
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">{timeAgo}</span>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate">{dateLabel}</h4>
                      {visit.procedure?.name && <p className="text-xs text-gray-500 truncate">{visit.procedure.name}</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{allImages.length} photo{allImages.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {allImages.map((img, idx) => {
                        const imgUid = `prev-${visit._id}-${idx}`;
                        const photo: ComparisonPhoto = { url: img.url, visitLabel: dateLabel, uid: imgUid };
                        const selIdx = selectedPhotos.findIndex((p) => p.uid === imgUid);
                        const isSelected = selIdx >= 0;
                        return (
                          <div key={imgUid} className={`relative aspect-square cursor-pointer group rounded-xl overflow-hidden transition-all duration-200 ${isSelected ? "ring-2 ring-purple-500 ring-offset-2 scale-[0.97]" : "hover:shadow-md ring-1 ring-gray-200"}`} onClick={() => togglePhotoSelection(photo)}>
                            <img src={img.url} alt={`Visit ${vIdx + 1} - ${idx + 1}`} className="w-full h-full object-cover" />
                            <div className={`absolute inset-0 transition-all duration-200 ${isSelected ? "bg-purple-500/10" : "bg-black/0 group-hover:bg-black/5"}`} />
                            {isSelected ? (
                              <div className="absolute top-2 right-2 w-7 h-7 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              </div>
                            ) : (
                              <div className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-gray-200">
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Photos Preview + Actions */}
          <div className="bg-white border-t border-gray-200 shrink-0">
            {selectedPhotos.length > 0 && (
              <div className="px-6 pt-4 pb-2">
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Selected</span>
                  <div className="flex items-center space-x-2 overflow-x-auto">
                    {selectedPhotos.map((photo, idx) => (
                      <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 ring-2 ring-purple-500">
                        <img src={photo.url} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedPhotos((prev) => prev.filter((_, i) => i !== idx)); }}
                          className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center">
                          <span className="text-[9px] text-white font-medium">{idx + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="px-6 py-3 flex justify-between items-center">
              <button onClick={() => { setShowPhotoPicker(false); setShowComparisonModal(true); }} className="flex items-center space-x-2 px-5 py-2 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                <span>Back to Visits</span>
              </button>
              <div className="flex items-center space-x-3">
                <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${selectedPhotos.length > 0 ? "bg-purple-50 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                  <span>{selectedPhotos.length}</span>
                  <span>/</span>
                  <span>4</span>
                </div>
                {selectedPhotos.length > 0 && (
                  <button onClick={() => setSelectedPhotos([])} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Clear</button>
                )}
                <button
                  disabled={selectedPhotos.length === 0}
                  onClick={() => { setShowPhotoPicker(false); setShowFullscreenComparison(true); setSelectedImageIndex(null); }}
                  className="px-8 py-2.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm disabled:shadow-none"
                >
                  Compare Photos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Fullscreen Comparison View ─────────────────────────────────────── */}
      {showFullscreenComparison && selectedPhotos.length > 0 && (
        <div className="fixed inset-0 bg-gray-100/80 z-[100] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-4">
              <button onClick={() => { setShowFullscreenComparison(false); setShowPhotoPicker(true); }} className="p-2 -ml-2 hover:bg-gray-100 rounded-xl transition-colors" title="Back">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Treatment Progress</h3>
                <p className="text-gray-400 text-xs mt-0.5">{selectedPhotos.length} photo{selectedPhotos.length > 1 ? "s" : ""} · tap to enlarge</p>
              </div>
            </div>
            <button onClick={() => { setShowFullscreenComparison(false); setSelectedImageIndex(null); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Comparison Grid */}
          <div className="flex-1 flex items-stretch p-4 overflow-auto">
            <div className={`w-full max-w-7xl mx-auto grid gap-3 ${selectedPhotos.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2"}`}>
              {selectedPhotos.map((photo, idx) => (
                <div key={idx} className="relative flex flex-col bg-white rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-gray-200 hover:shadow-md transition-shadow" onClick={() => setSelectedImageIndex(idx)}>
                  <div className="flex-1 min-h-0 flex items-center justify-center p-2 bg-gray-50/50">
                    <img src={photo.url} alt={`Compare ${idx + 1}`} className="max-w-full max-h-full object-contain rounded-lg" />
                  </div>
                  <div className="px-4 py-2.5 bg-white border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-[11px] font-bold shrink-0">{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{photo.visitLabel}</p>
                        {photo.issueLabel && <p className="text-[11px] text-gray-400 truncate">{photo.issueLabel}</p>}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-purple-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center shrink-0">
            <button onClick={() => { setShowFullscreenComparison(false); setShowPhotoPicker(true); }} className="flex items-center space-x-2 px-5 py-2 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span>Back to Selection</span>
            </button>
            <button onClick={() => { setShowFullscreenComparison(false); setSelectedImageIndex(null); }} className="px-6 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Image Lightbox ───────────────────────────────────────────────────── */}
      {selectedImageIndex !== null && showFullscreenComparison && (
        <div className="fixed inset-0 bg-black/95 z-[110] flex items-center justify-center" onClick={() => setSelectedImageIndex(null)}>
          {/* Close */}
          <button onClick={() => setSelectedImageIndex(null)} className="absolute top-4 right-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors z-10">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          {/* Prev Arrow */}
          {selectedImageIndex > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setSelectedImageIndex(selectedImageIndex - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors z-10">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          {/* Next Arrow */}
          {selectedImageIndex < selectedPhotos.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); setSelectedImageIndex(selectedImageIndex + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors z-10">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          {(() => {
            const photo = selectedPhotos[selectedImageIndex];
            if (!photo) return null;
            return (
              <>
                <img src={photo.url} alt="Full size" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-xl flex items-center space-x-3">
                  <span className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">{selectedImageIndex + 1}</span>
                  <div>
                    <p className="text-white text-sm font-medium">{photo.visitLabel}</p>
                    {photo.issueLabel && <p className="text-white/60 text-xs">{photo.issueLabel}</p>}
                  </div>
                  <span className="text-white/40 text-xs">{selectedImageIndex + 1}/{selectedPhotos.length}</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}

export default function CosmetologyVisitPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <CosmetologyVisitPageInner />
    </Suspense>
  );
}
