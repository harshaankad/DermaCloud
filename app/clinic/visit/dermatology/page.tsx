"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import aiModelLabels from "@/labels.json";

// ─── Interfaces ──────────────────────────────────────────────────────────────

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
  clinicalImages: File[];
  dermoscopeImages: File[];
  clinicalPreviews: string[];
  dermoscopePreviews: string[];
  aiResults: any;
  aiProcessing: boolean;
  isExpanded: boolean;
}

interface Toast {
  message: string;
  type: "success" | "error";
}

interface PreviousVisit {
  _id: string;
  consultationDate: string;
  customFields?: Record<string, any>;
  images: { url: string; type: string; uploadedAt: string }[];
}

interface ComparisonSlotData {
  key: string;           // "visitId-issueIdx"
  visitDate: string;
  issueLabel: string;    // e.g. "Issue 1 — Psoriasis" or "" for single-issue
  diagnosis: string;
  images: { url: string; type: string; uploadedAt: string }[];
}

interface AggregatedImage {
  url: string;
  type: string;
  issueLabel: string;
  uid: string;
}

interface ComparisonPhoto {
  url: string;
  visitLabel: string;
  issueLabel?: string;
  type?: string;
  uid: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** These section names appear ONCE at the bottom of the page, shared across all issues */
const SHARED_SECTION_NAMES = ["followUp"];

const ISSUE_COLORS = [
  {
    gradient: "from-teal-500 to-cyan-600",
    light: "bg-teal-50 border-teal-200",
    badge: "bg-teal-100 text-teal-700",
    accent: "from-teal-500 to-cyan-500",
  },
  {
    gradient: "from-purple-500 to-indigo-600",
    light: "bg-purple-50 border-purple-200",
    badge: "bg-purple-100 text-purple-700",
    accent: "from-purple-500 to-indigo-500",
  },
  {
    gradient: "from-amber-500 to-orange-600",
    light: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    accent: "from-amber-500 to-orange-500",
  },
  {
    gradient: "from-pink-500 to-rose-600",
    light: "bg-pink-50 border-pink-200",
    badge: "bg-pink-100 text-pink-700",
    accent: "from-pink-500 to-rose-500",
  },
];

// Splits a previous visit into per-issue comparison slots
function getVisitSlots(visit: PreviousVisit): ComparisonSlotData[] {
  if (
    visit.customFields?._multiIssue === true &&
    Array.isArray(visit.customFields._issues) &&
    visit.customFields._issues.length > 1
  ) {
    return visit.customFields._issues.map((issue: any, idx: number) => {
      const diag = issue.formData?.provisional || issue.formData?.provisionalDiagnosis || "";
      const label = issue.label || `Issue ${idx + 1}`;
      const clinicalUrls: string[] =
        idx === 0
          ? visit.images.filter((i) => i.type === "clinical").map((i) => i.url)
          : issue.clinicalImageUrls || [];
      const dermUrls: string[] =
        idx === 0
          ? visit.images.filter((i) => i.type === "dermoscopic").map((i) => i.url)
          : issue.dermoscopeImageUrls || [];
      const images = [
        ...clinicalUrls.map((url) => ({ url, type: "clinical", uploadedAt: "" })),
        ...dermUrls.map((url) => ({ url, type: "dermoscopic", uploadedAt: "" })),
      ];
      return {
        key: `${visit._id}-${idx}`,
        visitDate: visit.consultationDate,
        issueLabel: `${label}${diag ? ` — ${diag}` : ""}`,
        diagnosis: diag,
        images,
      };
    });
  }
  const diag = visit.customFields?.provisional || visit.customFields?.provisionalDiagnosis || "";
  return [{
    key: `${visit._id}-0`,
    visitDate: visit.consultationDate,
    issueLabel: "",
    diagnosis: diag,
    images: visit.images,
  }];
}

// Returns all images for a visit, including images from Issue 2+ stored in customFields._issues
function getAllVisitImages(visit: PreviousVisit): { url: string; type: string; uploadedAt: string }[] {
  const imgs: { url: string; type: string; uploadedAt: string }[] = [...(visit.images || [])];
  if (visit.customFields?._multiIssue && Array.isArray(visit.customFields._issues)) {
    visit.customFields._issues.forEach((issue: any, issueIdx: number) => {
      if (issueIdx === 0) return; // Issue 1 is already represented in visit.images
      (issue.clinicalImageUrls || []).forEach((url: string) => {
        imgs.push({ url, type: "clinical", uploadedAt: new Date().toISOString() });
      });
      (issue.dermoscopeImageUrls || []).forEach((url: string) => {
        imgs.push({ url, type: "dermoscopic", uploadedAt: new Date().toISOString() });
      });
    });
  }
  return imgs;
}

// ─── Component ────────────────────────────────────────────────────────────────

function DermatologyVisitPageInner() {
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
  const [templateTargetIssueId, setTemplateTargetIssueId] = useState<string>("");
  // Per-issue template dropdown: stores the issue id whose dropdown is open, or null
  const [openIssueTemplateId, setOpenIssueTemplateId] = useState<string | null>(null);
  // Tracks which template was last applied per issue, for the "applied" badge
  const [appliedTemplates, setAppliedTemplates] = useState<Record<string, string>>({});
  // Search query inside per-issue template dropdown
  const [issueTemplateSearch, setIssueTemplateSearch] = useState("");

  // Billing
  const [consultationFee, setConsultationFee] = useState<string>("");
  const [feeSource, setFeeSource] = useState<"appointment" | "manual" | null>(null);

  // Toast
  const [toast, setToast] = useState<Toast | null>(null);

  // Before/After Comparison state
  const [previousVisits, setPreviousVisits] = useState<PreviousVisit[]>([]);
  const [loadingPreviousVisits, setLoadingPreviousVisits] = useState(false);
  const [hasPreviousVisits, setHasPreviousVisits] = useState<boolean | null>(null); // null = still checking
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<string[]>([]);
  const [comparisonSlots, setComparisonSlots] = useState<ComparisonSlotData[]>([]);
  const [showFullscreenComparison, setShowFullscreenComparison] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [comparisonImageType, setComparisonImageType] = useState<"clinical" | "dermoscopic">("clinical");
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<ComparisonPhoto[]>([]);
  const [aiInfoOpenIssueId, setAiInfoOpenIssueId] = useState<string | null>(null);

  // Medicine search for prescription autocomplete
  const [medSearchResults, setMedSearchResults] = useState<any[]>([]);
  const [medSearchActive, setMedSearchActive] = useState<string | null>(null); // "idx" key for which input is active
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

  // Ref to ensure issue initialization only runs once
  const initializedRef = useRef(false);

  // Ref to scroll to the newest issue card when added
  const newestIssueRef = useRef<HTMLDivElement | null>(null);
  // Ref for auto-focusing search input inside per-issue template dropdown
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

  // ─── Toast ────────────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ─── Before/After Comparison ─────────────────────────────────────────────

  const aggregatedCurrentImages = useMemo<AggregatedImage[]>(() => {
    const imgs: AggregatedImage[] = [];
    issues.forEach((issue, idx) => {
      const label = issues.length > 1 ? `Issue ${idx + 1}` : "Current";
      issue.clinicalPreviews.forEach((url, imgIdx) => {
        imgs.push({ url, type: "clinical", issueLabel: label, uid: `cur-${idx}-c-${imgIdx}` });
      });
      issue.dermoscopePreviews.forEach((url, imgIdx) => {
        imgs.push({ url, type: "dermoscopic", issueLabel: label, uid: `cur-${idx}-d-${imgIdx}` });
      });
    });
    return imgs;
  }, [issues]);

  const fetchPreviousVisits = async () => {
    setLoadingPreviousVisits(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `/api/tier2/consultation/dermatology?patientId=${patientId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) {
        const visitsWithImages = data.data.filter(
          (visit: PreviousVisit) => getAllVisitImages(visit).length > 0
        );
        setPreviousVisits(visitsWithImages);
        setHasPreviousVisits(visitsWithImages.length > 0);
      } else {
        setHasPreviousVisits(false);
      }
    } catch (error) {
      console.error("Error fetching previous visits:", error);
      setHasPreviousVisits(false);
    } finally {
      setLoadingPreviousVisits(false);
    }
  };

  // Pre-fetch previous visits once on page load
  useEffect(() => {
    if (!patientId) return;
    fetchPreviousVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const openComparisonModal = () => {
    setShowComparisonModal(true);
    setSelectedSlotKeys([]);
    setComparisonSlots([]);
  };

  const toggleSlotSelection = (key: string) => {
    setSelectedSlotKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 5) {
        showToast("You can compare up to 5 slots", "error");
        return prev;
      }
      return [...prev, key];
    });
  };

  const loadComparisonData = () => {
    const slots: ComparisonSlotData[] = [];
    for (const visit of previousVisits) {
      for (const slot of getVisitSlots(visit)) {
        if (selectedSlotKeys.includes(slot.key)) slots.push(slot);
      }
    }
    setComparisonSlots(slots);
    setShowComparisonModal(false);
    setShowPhotoPicker(true);
    setSelectedPhotos([]);
    setComparisonImageType("clinical");
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
          fetch(`/api/tier2/settings/forms?formType=dermatology`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/tier2/templates?templateType=dermatology`, { headers: { Authorization: `Bearer ${token}` } }),
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
          // Find today's scheduled/confirmed/checked-in appointment for this patient with a fee
          const appts: any[] = apptData?.data?.appointments ?? [];
          const active = appts.find(
            (a) =>
              ["scheduled", "confirmed", "checked-in", "in-progress"].includes(a.status) &&
              a.consultationFee != null
          );
          if (active) apptFee = active.consultationFee;
        }

        console.log("[VISIT] appointmentId:", appointmentId ?? "(auto-lookup)", "| fee found:", apptFee);
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

  // ─── Initialize issues once sections load ────────────────────────────────

  useEffect(() => {
    if (sections.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    // Build initial formData for a fresh issue
    const buildIssueFormData = () => {
      const fd: Record<string, any> = {};
      sections
        .filter((s) => s.enabled && !SHARED_SECTION_NAMES.includes(s.sectionName))
        .forEach((section) => {
          section.fields.filter((f) => f.enabled).forEach((field) => {
            fd[field.fieldName] = field.type === "checkbox" ? false : "";
          });
        });
      return fd;
    };

    const firstIssue: Issue = {
      id: `issue-${Date.now()}`,
      formData: buildIssueFormData(),
      clinicalImages: [],
      dermoscopeImages: [],
      clinicalPreviews: [],
      dermoscopePreviews: [],
      aiResults: null,
      aiProcessing: false,
      isExpanded: true,
    };
    setIssues([firstIssue]);
    setTemplateTargetIssueId(firstIssue.id);

    // Build shared form data
    const shared: Record<string, any> = {};
    sections
      .filter((s) => s.enabled && SHARED_SECTION_NAMES.includes(s.sectionName))
      .forEach((section) => {
        section.fields.filter((f) => f.enabled).forEach((field) => {
          shared[field.fieldName] = field.type === "checkbox" ? false : "";
        });
      });
    setSharedFormData(shared);
  }, [sections]);

  // Scroll to the newest issue card when one is added
  useEffect(() => {
    if (issues.length > 1) {
      newestIssueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [issues.length]);

  // Auto-focus + clear search when per-issue template dropdown opens/closes
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
    issueSections.forEach((section) => {
      section.fields.filter((f) => f.enabled).forEach((field) => {
        fd[field.fieldName] = field.type === "checkbox" ? false : "";
      });
    });
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
      clinicalImages: [],
      dermoscopeImages: [],
      clinicalPreviews: [],
      dermoscopePreviews: [],
      aiResults: null,
      aiProcessing: false,
      isExpanded: true,
    };
    setIssues((prev) => [...prev, newIssue]);
  }, [issues.length, buildIssueFormData, showToast]);

  const removeIssue = (id: string) => {
    setIssues((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      // Ensure at least one issue is expanded after removal
      if (updated.length > 0 && !updated.some((i) => i.isExpanded)) {
        updated[updated.length - 1].isExpanded = true;
      }
      return updated;
    });
    if (templateTargetIssueId === id) {
      setTemplateTargetIssueId(issues.find((i) => i.id !== id)?.id || "");
    }
  };

  const updateIssue = (id: string, updates: Partial<Issue>) => {
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  const updateIssueFormData = (id: string, fieldName: string, value: any) => {
    setIssues((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, formData: { ...i.formData, [fieldName]: value } } : i
      )
    );
  };

  // ─── Template Apply ───────────────────────────────────────────────────────

  /** Core helper: apply a template's non-empty fields to a specific issue */
  const applyTemplateToIssue = (issueId: string, templateId: string) => {
    const template = templates.find((t) => t._id === templateId);
    if (!template) return;
    const nonEmpty = Object.fromEntries(
      Object.entries(template.templateData).filter(
        ([, v]) => v !== undefined && v !== null && v !== ""
      )
    );
    setIssues((prev) =>
      prev.map((i) =>
        i.id === issueId ? { ...i, formData: { ...i.formData, ...nonEmpty } } : i
      )
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

  const handleClinicalImageUpload = async (
    issueId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;
    const files = Array.from(e.target.files || []);
    if (issue.clinicalImages.length + files.length > 5) {
      showToast("Maximum 5 clinical images per issue", "error");
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
      clinicalImages: [...issue.clinicalImages, ...compressed],
      clinicalPreviews: [...issue.clinicalPreviews, ...newPreviews],
    });
  };

  const handleDermoscopeImageUpload = async (
    issueId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;
    const files = Array.from(e.target.files || []);
    if (issue.dermoscopeImages.length + files.length > 5) {
      showToast("Maximum 5 dermoscope images per issue", "error");
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
      dermoscopeImages: [...issue.dermoscopeImages, ...compressed],
      dermoscopePreviews: [...issue.dermoscopePreviews, ...newPreviews],
    });
  };

  const removeClinicalImage = (issueId: string, index: number) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;
    updateIssue(issueId, {
      clinicalImages: issue.clinicalImages.filter((_, i) => i !== index),
      clinicalPreviews: issue.clinicalPreviews.filter((_, i) => i !== index),
    });
  };

  const removeDermoscopeImage = (issueId: string, index: number) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;
    updateIssue(issueId, {
      dermoscopeImages: issue.dermoscopeImages.filter((_, i) => i !== index),
      dermoscopePreviews: issue.dermoscopePreviews.filter((_, i) => i !== index),
    });
  };

  const handleAnalyzeDermoscope = async (issueId: string) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue || issue.dermoscopeImages.length === 0) {
      showToast("Please upload at least one dermoscope image", "error");
      return;
    }
    updateIssue(issueId, { aiProcessing: true });
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      issue.dermoscopeImages.forEach((img) => fd.append("images", img));
      const res = await fetch("/api/tier2/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        updateIssue(issueId, {
          aiResults: data.data.finalResult,
          aiProcessing: false,
        });
      } else {
        showToast("AI analysis failed: " + data.message, "error");
        updateIssue(issueId, { aiProcessing: false });
      }
    } catch {
      showToast("Failed to analyze images", "error");
      updateIssue(issueId, { aiProcessing: false });
    }
  };

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Validate required fields across all issues
    for (const [idx, issue] of issues.entries()) {
      for (const section of issueSections) {
        for (const field of section.fields) {
          if (field.enabled && field.required && !issue.formData[field.fieldName]) {
            showToast(`Issue ${idx + 1}: "${field.label}" is required`, "error");
            // Expand the issue with the error
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

      // Process each issue: upload images, get AI
      const processedIssues: Array<{
        label: string;
        formData: Record<string, any>;
        aiAnalysis: any;
        dermoscopeImageUrls: string[];
        clinicalImageUrls: string[];
      }> = [];

      for (const [idx, issue] of issues.entries()) {
        let clinicalImageUrls: string[] = [];
        let dermoscopeImageUrls: string[] = [];
        // Only use AI results the doctor explicitly requested via "Analyse with AI"
        const aiAnalysis = issue.aiResults ?? null;

        if (issue.dermoscopeImages.length > 0) {
          // Upload dermoscope images — never auto-run AI inference
          const fd = new FormData();
          issue.dermoscopeImages.forEach((img) => fd.append("images", img));
          const res = await fetch("/api/tier2/upload?skipAI=true", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const data = await res.json();
          if (data.success) dermoscopeImageUrls = data.data.imageUrls;
        }

        if (issue.clinicalImages.length > 0) {
          const fd = new FormData();
          issue.clinicalImages.forEach((img) => fd.append("images", img));
          const res = await fetch("/api/tier2/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const data = await res.json();
          if (data.success) clinicalImageUrls = data.data.imageUrls;
        }

        processedIssues.push({
          label: `Issue ${idx + 1}`,
          formData: issue.formData,
          aiAnalysis,
          dermoscopeImageUrls,
          clinicalImageUrls,
        });
      }

      // Build combined formData:
      // — Issue 1's fields at top level (backward compat with API structured schema mapping)
      // — Shared fields (followUp)
      // — All issues stored under _issues (for multi-issue view page rendering)
      const combinedFormData: Record<string, any> = {
        ...processedIssues[0]?.formData,
        ...sharedFormData,
      };
      if (issues.length > 1) {
        combinedFormData._multiIssue = true;
        combinedFormData._issues = processedIssues;
      }

      const saveRes = await fetch("/api/tier2/consultation/dermatology", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId,
          appointmentId,
          formData: combinedFormData,
          aiAnalysis: processedIssues[0]?.aiAnalysis,
          dermoscopeImageUrls: processedIssues[0]?.dermoscopeImageUrls || [],
          clinicalImageUrls: processedIssues[0]?.clinicalImageUrls || [],
          consultationFee: consultationFee ? parseFloat(consultationFee) : undefined,
        }),
      });

      const saveData = await saveRes.json();
      if (saveData.success) {
        router.push(`/clinic/consultation/${saveData.data.consultationId}`);
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
    onChange: (fieldName: string, value: any) => void
  ) => {
    if (!field.enabled) return null;

    const inputClass =
      "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all text-slate-800 placeholder-gray-400";

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
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                value ? "bg-teal-500" : "bg-gray-300"
              }`}
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
                  <span className="text-xs font-bold text-teal-600 uppercase tracking-wider">Rx {idx + 1}</span>
                  {meds.length > 1 && (
                    <button type="button" onClick={() => removeMed(idx)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg transition-all" title="Remove">
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 relative">
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Medicine Name</label>
                    <input type="text" value={med.name} onChange={(e) => { updateMed(idx, "name", e.target.value); searchMedicines(e.target.value, `rx-${idx}`); }} onFocus={() => { if (med.name.length >= 2) searchMedicines(med.name, `rx-${idx}`); }} onBlur={() => setTimeout(() => { if (medSearchActive === `rx-${idx}`) { setMedSearchActive(null); setMedSearchResults([]); } }, 200)} placeholder="e.g. Tab. Azithromycin" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" autoComplete="off" />
                    {medSearchActive === `rx-${idx}` && medSearchResults.length > 0 && (
                      <div ref={medDropdownRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {medSearchResults.map((item: any) => (
                          <button key={item._id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-teal-50 transition-colors border-b border-gray-50 last:border-0" onClick={() => { updateMed(idx, "name", item.name); setMedSearchActive(null); setMedSearchResults([]); }}>
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
                              <span className="text-[11px] text-teal-600 font-medium">₹{item.sellingPrice}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Dosage</label>
                    <input type="text" value={med.dosage} onChange={(e) => updateMed(idx, "dosage", e.target.value)} placeholder="e.g. 500mg" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Route</label>
                    <input type="text" value={med.route} onChange={(e) => updateMed(idx, "route", e.target.value)} placeholder="e.g. Oral, Topical" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Frequency</label>
                    <input type="text" value={med.frequency} onChange={(e) => updateMed(idx, "frequency", e.target.value)} placeholder="e.g. BD, TID, OD" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Duration</label>
                    <input type="text" value={med.duration} onChange={(e) => updateMed(idx, "duration", e.target.value)} placeholder="e.g. 7 days, 1 month" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Quantity</label>
                    <input type="text" value={med.quantity || ""} onChange={(e) => updateMed(idx, "quantity", e.target.value)} placeholder="e.g. 10, 1 strip" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Instructions</label>
                    <input type="text" value={med.instructions} onChange={(e) => updateMed(idx, "instructions", e.target.value)} placeholder="e.g. After food, Apply locally" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addMed} className="w-full py-2.5 border-2 border-dashed border-teal-300 rounded-xl text-teal-600 text-sm font-semibold hover:border-teal-500 hover:bg-teal-50 transition-all flex items-center justify-center space-x-2">
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

  // ─── AI Results Panel ─────────────────────────────────────────────────────

  const renderAiResults = (aiResults: any, imageCount: number, issueId: string) => {
    const top = aiResults?.topPrediction;
    const predictions: { condition: string; probability: number; confidence: string }[] =
      aiResults?.predictions || [];

    const confStyles = (c: string) =>
      c === "high"
        ? { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", dot: "bg-emerald-500" }
        : c === "medium"
        ? { badge: "bg-amber-50 text-amber-700 border-amber-200", bar: "bg-amber-500", dot: "bg-amber-500" }
        : { badge: "bg-slate-100 text-slate-600 border-slate-200", bar: "bg-slate-400", dot: "bg-slate-400" };

    const topStyle = confStyles(top?.confidence || "low");
    const topPct = top?.probability ? (top.probability * 100).toFixed(1) : "—";

    return (
      <div className="space-y-3">
        {/* Hero: Top prediction */}
        <div className="relative bg-white rounded-2xl p-5 border border-slate-200 shadow-sm overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-cyan-500" />
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-3.5 h-3.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  {imageCount > 1 ? `AI Analysis · ${imageCount} images averaged` : "AI Analysis"}
                </p>
              </div>
              <h4 className="text-2xl font-bold text-slate-900 tracking-tight">
                {top?.condition || "Unknown"}
              </h4>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${topStyle.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${topStyle.dot}`} />
              {top?.confidence || "low"} confidence
            </span>
          </div>

          <div className="flex items-end justify-between mb-2">
            <span className="text-xs text-slate-500 font-medium">Probability</span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{topPct}<span className="text-base text-slate-400">%</span></span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${topStyle.bar} rounded-full transition-all duration-500`}
              style={{ width: `${top?.probability ? top.probability * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Top 3 predictions */}
        {predictions.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Top Predictions</p>
              <span className="text-[10px] text-slate-400 font-medium">Ranked by probability</span>
            </div>
            <div className="space-y-2.5">
              {predictions.slice(0, 3).map((p, idx) => {
                const s = confStyles(p.confidence);
                const pct = (p.probability * 100).toFixed(1);
                return (
                  <div
                    key={idx}
                    className={`rounded-xl p-3 border transition-colors ${
                      idx === 0 ? "bg-teal-50/40 border-teal-200" : "bg-slate-50 border-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            idx === 0 ? "bg-teal-600 text-white" : "bg-slate-300 text-slate-700"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-slate-800 truncate">{p.condition}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900 tabular-nums flex-shrink-0 ml-2">{pct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white rounded-full overflow-hidden">
                      <div
                        className={`h-full ${s.bar} rounded-full transition-all duration-500`}
                        style={{ width: `${p.probability * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Disclaimer + Clear button */}
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50/50 border border-amber-100 rounded-xl">
          <svg className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-[10px] text-amber-700 leading-relaxed">
            AI predictions are assistive only. Always confirm diagnosis with clinical examination.
          </p>
        </div>

        <button
          onClick={() =>
            updateIssue(issueId, {
              aiResults: null,
              dermoscopeImages: [],
              dermoscopePreviews: [],
            })
          }
          className="w-full py-2.5 bg-white border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors text-xs flex items-center justify-center gap-2"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Clear & Upload New Images
        </button>
      </div>
    );
  };

  // ─── Loading / Error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-teal-600 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading form...</p>
        </div>
      </div>
    );
  }

  if (pageError || !patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Error</h3>
          <p className="text-slate-600 mb-6">{pageError || "Failed to load form"}</p>
          <Link href="/clinic/patients">
            <button className="px-6 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors">
              Back to Patients
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]">
          <div
            className={`flex items-center space-x-3 px-5 py-3.5 rounded-2xl shadow-xl text-white font-medium text-sm ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-500"
            }`}
          >
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
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">Dermatology Visit</h1>
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
                      ? "border-teal-600 text-teal-700"
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
          {/* Top accent strip */}
          <div className="h-1 bg-gradient-to-r from-slate-700 via-slate-500 to-slate-400" />
          <div className="px-6 py-5 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shrink-0 shadow-md">
                <span className="text-xl font-bold text-white leading-none select-none">
                  {patient.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">{patient.name}</h3>
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-full text-xs font-semibold tracking-wide">
                    Dermatology
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

        {/* Overlay to close any open per-issue template dropdown */}
        {openIssueTemplateId && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => { setOpenIssueTemplateId(null); setIssueTemplateSearch(""); }}
          />
        )}

        {/* ── Issue Cards ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Issues header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-slate-900">
                {issues.length === 1 ? "Consultation Details" : `${issues.length} Issues`}
              </h2>
              {issues.length > 1 && (
                <span className="px-2.5 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-semibold">
                  {issues.length} conditions
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
                        {issues.length === 1 && " — Primary Complaint"}
                      </p>
                      {issue.formData.complaint && (
                        <p className="text-white/75 text-xs truncate max-w-xs mt-0.5">
                          {String(issue.formData.complaint).substring(0, 60)}
                          {String(issue.formData.complaint).length > 60 ? "..." : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {/* Per-issue template button */}
                    {templates.length > 0 && (
                      <div
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            setOpenIssueTemplateId(
                              openIssueTemplateId === issue.id ? null : issue.id
                            )
                          }
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/35 rounded-xl text-white text-xs font-semibold transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>
                            {appliedTemplates[issue.id]
                              ? appliedTemplates[issue.id]
                              : "Template"}
                          </span>
                          <svg
                            className={`w-3 h-3 transition-transform ${openIssueTemplateId === issue.id ? "rotate-180" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Template dropdown for this issue */}
                        {openIssueTemplateId === issue.id && (
                          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 flex flex-col max-h-96 overflow-hidden">
                            {/* Header */}
                            <div className={`px-4 py-3 bg-gradient-to-r ${color.gradient} shrink-0`}>
                              <p className="text-xs font-bold text-white/90 uppercase tracking-wider">
                                Apply template to Issue {issueIndex + 1}
                              </p>
                            </div>
                            {/* Search bar */}
                            <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
                              <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus-within:border-teal-400 focus-within:bg-white focus-within:shadow-sm transition-all">
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
                            {/* Scrollable list */}
                            <div className="overflow-y-auto flex-1 min-h-0 py-1.5">
                              {issueFilteredTemplates.length === 0 ? (
                                <div className="px-4 py-8 text-center">
                                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                  </div>
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
                                    className="w-full text-left px-4 py-2.5 hover:bg-teal-50 active:bg-teal-100 transition-colors group"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="font-semibold text-slate-800 text-sm group-hover:text-teal-700 transition-colors truncate">{tmpl.name}</p>
                                        {tmpl.description && (
                                          <p className="text-xs text-slate-400 truncate mt-0.5">{tmpl.description}</p>
                                        )}
                                      </div>
                                      {tmpl.category && (
                                        <span className="shrink-0 px-2 py-0.5 bg-slate-100 text-slate-500 group-hover:bg-teal-100 group-hover:text-teal-600 rounded-full text-xs font-medium transition-colors">
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

                    {/* Remove issue */}
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

                    {/* Expand / collapse */}
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
                    {issueSections.map((section) => (
                      <div key={section.sectionName}>
                        {/* Section header */}
                        <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-gray-100">
                          <div className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${color.accent}`} />
                          <h4 className="font-bold text-slate-900">{section.sectionLabel}</h4>
                        </div>

                        {/* Section fields */}
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
                                {renderField(
                                  field,
                                  issue.formData[field.fieldName],
                                  (fn, v) => updateIssueFormData(issue.id, fn, v)
                                )}
                              </div>
                            ))}
                        </div>

                        {/* Image sections — inserted after patientInfo */}
                        {section.sectionName === "patientInfo" && (
                          <div className="mt-6 space-y-4">
                            {/* Clinical Images */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
                              <div className="flex items-center space-x-2 mb-4">
                                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div>
                                  <h5 className="font-semibold text-slate-900 text-sm">Clinical Images</h5>
                                  <p className="text-xs text-slate-400">Up to 5 photographs of the affected area</p>
                                </div>
                              </div>

                              {issue.clinicalPreviews.length > 0 && (
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                  {issue.clinicalPreviews.map((preview, i) => (
                                    <div key={i} className="relative group">
                                      <img
                                        src={preview}
                                        alt={`Clinical ${i + 1}`}
                                        className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                                      />
                                      <button
                                        onClick={() => removeClinicalImage(issue.id, i)}
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

                              {issue.clinicalImages.length < 5 && (
                                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-teal-400 hover:bg-teal-50/50 transition-all">
                                  <svg className="w-7 h-7 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  <p className="text-xs text-slate-500 font-medium">Add Clinical Images ({issue.clinicalImages.length}/5)</p>
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => handleClinicalImageUpload(issue.id, e)}
                                  />
                                </label>
                              )}
                            </div>

                            {/* Dermoscope Images + AI */}
                            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center space-x-2">
                                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <h5 className="font-semibold text-slate-900 text-sm">Dermoscope Images</h5>
                                    <p className="text-xs text-emerald-600">AI-powered skin lesion analysis · up to 5 images</p>
                                  </div>
                                </div>
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setAiInfoOpenIssueId(aiInfoOpenIssueId === issue.id ? null : issue.id)}
                                    className={`group relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg hover:scale-110 ${
                                      aiInfoOpenIssueId === issue.id
                                        ? "bg-gradient-to-br from-emerald-500 to-teal-600 ring-2 ring-emerald-300 ring-offset-2"
                                        : "bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                                    }`}
                                    aria-label="AI model information"
                                    title="About the AI model"
                                  >
                                    <svg className="w-5 h-5 text-white relative z-10" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </button>
                                  {aiInfoOpenIssueId === issue.id && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm"
                                        onClick={() => setAiInfoOpenIssueId(null)}
                                      />
                                      <div className="absolute right-0 top-11 z-50 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden animate-fade-in-down">
                                        {/* Header */}
                                        <div className="relative px-5 py-4 bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white overflow-hidden">
                                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                                          <div className="absolute -left-4 -bottom-4 w-20 h-20 bg-cyan-300/20 rounded-full blur-2xl" />
                                          <div className="relative flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30">
                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                </svg>
                                              </div>
                                              <div>
                                                <h6 className="text-sm font-bold leading-tight">AI Model Information</h6>
                                                <p className="text-[11px] text-emerald-100 mt-0.5">Dermoscopic lesion classifier</p>
                                              </div>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => setAiInfoOpenIssueId(null)}
                                              className="relative w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25 text-white/90 hover:text-white flex items-center justify-center transition-all"
                                              aria-label="Close"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                              </svg>
                                            </button>
                                          </div>
                                        </div>

                                        {/* Body */}
                                        <div className="p-5 space-y-4">
                                          <div>
                                            <div className="flex items-center justify-between mb-3">
                                              <div className="flex items-center space-x-2">
                                                <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                                                  <svg className="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                  </svg>
                                                </div>
                                                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                                  Trained Conditions
                                                </p>
                                              </div>
                                              <span className="px-2 py-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full border border-emerald-200">
                                                {(aiModelLabels as string[]).length} total
                                              </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                              {(aiModelLabels as string[]).map((label, idx) => (
                                                <div
                                                  key={label}
                                                  className="group flex items-center space-x-2 px-2.5 py-1.5 bg-gradient-to-br from-slate-50 to-emerald-50/50 hover:from-emerald-50 hover:to-teal-50 rounded-lg border border-slate-200/80 hover:border-emerald-300 transition-all"
                                                >
                                                  <span className="flex-shrink-0 w-5 h-5 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                                                    {idx + 1}
                                                  </span>
                                                  <span className="text-[11px] font-medium text-slate-700 truncate" title={label}>
                                                    {label}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Warning footer */}
                                        <div className="relative px-5 py-4 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 border-t border-amber-200/60">
                                          <div className="flex items-start space-x-3">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                              </svg>
                                            </div>
                                            <div className="flex-1">
                                              <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider mb-1">
                                                Important Notice
                                              </p>
                                              <p className="text-[11px] text-amber-900/90 leading-relaxed">
                                                This model is trained <span className="font-bold">only</span> on the conditions above. Predictions for any other condition will be unreliable and should be ignored. AI output is <span className="font-bold">assistive only</span> — always confirm the diagnosis with clinical examination and your professional judgement.
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>

                              {issue.dermoscopePreviews.length > 0 && (
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                  {issue.dermoscopePreviews.map((preview, i) => (
                                    <div key={i} className="relative group">
                                      <img
                                        src={preview}
                                        alt={`Dermoscope ${i + 1}`}
                                        className="w-full h-32 object-cover rounded-lg border-2 border-emerald-200"
                                      />
                                      <button
                                        onClick={() => removeDermoscopeImage(issue.id, i)}
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

                              {!issue.aiResults && issue.dermoscopeImages.length < 5 && (
                                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-emerald-300 rounded-xl cursor-pointer hover:border-emerald-500 hover:bg-emerald-100/50 transition-all">
                                  <svg className="w-7 h-7 text-emerald-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  <p className="text-xs text-emerald-700 font-medium">Add Dermoscope Images ({issue.dermoscopeImages.length}/5)</p>
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => handleDermoscopeImageUpload(issue.id, e)}
                                  />
                                </label>
                              )}

                              {issue.dermoscopeImages.length > 0 && !issue.aiResults && !issue.aiProcessing && (
                                <button
                                  onClick={() => handleAnalyzeDermoscope(issue.id)}
                                  className="w-full mt-3 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all shadow text-sm flex items-center justify-center space-x-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span>Analyze with AI</span>
                                </button>
                              )}

                              {issue.aiProcessing && (
                                <div className="mt-3 p-3 bg-white border border-emerald-200 rounded-xl flex items-center space-x-3">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600" />
                                  <p className="text-sm text-emerald-700 font-medium">Analyzing with AI...</p>
                                </div>
                              )}

                              {issue.aiResults && renderAiResults(issue.aiResults, issue.dermoscopeImages.length, issue.id)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Compare with Previous Visits — always visible */}
          <div className={`rounded-2xl shadow-md border p-5 ${
            hasPreviousVisits === false
              ? "bg-gray-50 border-gray-200"
              : "bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-200"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${
                  hasPreviousVisits === false
                    ? "bg-gray-300"
                    : "bg-gradient-to-br from-teal-500 to-cyan-600"
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
                      : "Compare today\u2019s photos with up to 5 previous visits"}
                  </p>
                </div>
              </div>
              <button
                onClick={openComparisonModal}
                disabled={!hasPreviousVisits}
                className={`px-5 py-2.5 font-semibold rounded-xl transition-all flex items-center space-x-2 ${
                  hasPreviousVisits
                    ? "bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700 shadow-md hover:shadow-lg"
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
            {comparisonSlots.length > 0 && (
              <div className="mt-4 pt-4 border-t border-teal-200 flex items-center justify-between">
                <p className="text-sm text-teal-700 font-medium">
                  {comparisonSlots.length} slot{comparisonSlots.length > 1 ? "s" : ""} selected for comparison
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowPhotoPicker(true)}
                    className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    View Comparison
                  </button>
                  <button
                    onClick={() => setComparisonSlots([])}
                    className="px-4 py-2 text-sm bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Add Another Issue */}
          {issues.length < 2 && (
            <button
              onClick={addIssue}
              className="w-full py-4 border-2 border-dashed border-teal-300 rounded-2xl text-teal-700 font-semibold hover:border-teal-500 hover:bg-teal-50 transition-all flex items-center justify-center space-x-2 group"
            >
              <div className="w-7 h-7 bg-teal-100 group-hover:bg-teal-200 rounded-xl flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span>Add Another Issue</span>
              <span className="text-teal-400 text-sm font-normal">({issues.length}/2)</span>
            </button>
          )}
        </div>

        {/* ── Shared Sections (Follow-up) ─────────────────────────────────── */}
        {sharedSections.map((section) => (
          <div key={section.sectionName} className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
            <div className="flex items-center space-x-3 mb-5 pb-4 border-b border-gray-100">
              <div className="w-1.5 h-6 bg-gradient-to-b from-slate-400 to-slate-500 rounded-full" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">{section.sectionLabel}</h3>
                {issues.length > 1 && (
                  <p className="text-xs text-slate-400">Shared across all issues</p>
                )}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {section.fields
                .filter((f) => f.enabled)
                .sort((a, b) => a.order - b.order)
                .map((field) => (
                  <div key={field.fieldName} className={field.type === "textarea" || field.type === "prescription" ? "md:col-span-2" : ""}>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderField(
                      field,
                      sharedFormData[field.fieldName],
                      (fn, v) => setSharedFormData((prev) => ({ ...prev, [fn]: v }))
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
                className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none text-slate-800 placeholder-gray-400 text-base"
              />
            </div>
            <div className="flex flex-col gap-1">
              {feeSource === "appointment" && (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
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

        {/* ── Action Buttons ───────────────────────────────────────────────── */}
        <div className="flex justify-between items-center pb-8">
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-white text-slate-700 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-8 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-semibold rounded-xl hover:from-teal-700 hover:to-cyan-700 transition-all shadow-md hover:shadow-lg flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  Save & Complete Consultation
                  {issues.length > 1 && ` (${issues.length} issues)`}
                </span>
              </>
            )}
          </button>
        </div>

      </main>

      {/* ── Visit Selection Modal ──────────────────────────────────────────── */}
      {showComparisonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white">Compare with Previous Visits</h3>
              <p className="text-teal-100 text-sm mt-1">
                Select up to 5 previous visits to compare with today&apos;s photos
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {loadingPreviousVisits ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mx-auto mb-4" />
                  <p className="text-slate-600">Loading previous visits...</p>
                </div>
              ) : previousVisits.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-slate-700 mb-2">No Previous Visits with Photos</h4>
                  <p className="text-slate-500">This patient has no previous dermatology visits with photos to compare.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 mb-4">
                    <span className="font-semibold">{selectedSlotKeys.length}/5</span> slots selected for comparison
                  </p>

                  {previousVisits.map((visit) => {
                    const slots = getVisitSlots(visit);
                    const isMultiIssue = slots.length > 1;

                    return (
                      <div key={visit._id} className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Visit date header */}
                        <div className="bg-slate-50 px-4 py-3 border-b border-gray-100">
                          <h4 className="font-semibold text-slate-900">
                            {new Date(visit.consultationDate).toLocaleDateString("en-IN", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </h4>
                          {!isMultiIssue && slots[0].diagnosis && (
                            <p className="text-sm text-slate-500 mt-0.5">{slots[0].diagnosis}</p>
                          )}
                        </div>

                        {/* Per-issue rows */}
                        <div className={isMultiIssue ? "divide-y divide-gray-100" : ""}>
                          {slots.map((slot) => {
                            const clinicalCount = slot.images.filter((i) => i.type === "clinical").length;
                            const dermCount = slot.images.filter((i) => i.type === "dermoscopic").length;
                            const isSelected = selectedSlotKeys.includes(slot.key);

                            return (
                              <div key={slot.key} className={`p-4 transition-colors ${isSelected ? "bg-teal-50" : "bg-white"}`}>
                                {isMultiIssue && (
                                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    {slot.issueLabel}
                                  </p>
                                )}
                                <div className="flex items-center justify-between gap-3">
                                  {/* Thumbnails: up to 2 clinical + 2 dermoscopic, with overflow indicator */}
                                  <div className="flex gap-2 flex-wrap flex-1 min-w-0">
                                    {(["clinical", "dermoscopic"] as const).map((imgType) => {
                                      const allOfType = slot.images.filter((i) => i.type === imgType);
                                      const shown = allOfType.slice(0, 2);
                                      const extra = allOfType.length - shown.length;
                                      if (shown.length === 0) return null;
                                      return (
                                        <div key={imgType} className="flex gap-2 items-center">
                                          {shown.map((img, idx) => (
                                            <div key={idx} className="relative shrink-0">
                                              <img
                                                src={img.url}
                                                alt={`${imgType} ${idx + 1}`}
                                                className="w-20 h-20 object-cover rounded-xl"
                                              />
                                              <span className={`absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md ${
                                                imgType === "clinical" ? "bg-teal-600 text-white" : "bg-emerald-600 text-white"
                                              }`}>
                                                {imgType === "clinical" ? "C" : "D"}
                                              </span>
                                            </div>
                                          ))}
                                          {extra > 0 && (
                                            <div className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                                              imgType === "clinical" ? "bg-teal-50 border-2 border-teal-200" : "bg-emerald-50 border-2 border-emerald-200"
                                            }`}>
                                              <span className={`text-lg font-bold ${imgType === "clinical" ? "text-teal-600" : "text-emerald-600"}`}>+{extra}</span>
                                              <span className={`text-[10px] font-semibold ${imgType === "clinical" ? "text-teal-500" : "text-emerald-500"}`}>more</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {/* Compare toggle button */}
                                  <button
                                    onClick={() => toggleSlotSelection(slot.key)}
                                    className={`shrink-0 px-4 py-2 text-sm font-semibold rounded-lg border transition-all ${
                                      isSelected
                                        ? "bg-teal-600 border-teal-600 text-white"
                                        : "bg-white border-teal-300 text-teal-700 hover:bg-teal-50"
                                    }`}
                                  >
                                    {isSelected ? "✓ Added" : "Compare"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t">
              <button
                onClick={() => {
                  setShowComparisonModal(false);
                  setSelectedSlotKeys([]);
                }}
                className="px-6 py-2.5 bg-white text-slate-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={loadComparisonData}
                disabled={selectedSlotKeys.length === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium rounded-lg hover:from-teal-700 hover:to-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Compare Selected Visits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Picker ─────────────────────────────────────────────────────── */}
      {showPhotoPicker && comparisonSlots.length > 0 && (
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
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1 bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setComparisonImageType("clinical")}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${comparisonImageType === "clinical" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >Clinical</button>
                  <button
                    onClick={() => setComparisonImageType("dermoscopic")}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${comparisonImageType === "dermoscopic" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >Dermoscope</button>
                </div>
                <button onClick={() => { setShowPhotoPicker(false); setSelectedImageIndex(null); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Photo Grid */}
          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
            {/* Current Visit */}
            {(() => {
              const filtered = aggregatedCurrentImages.filter((img) => img.type === comparisonImageType);
              if (filtered.length === 0) return null;
              return (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center space-x-3 px-5 py-4 border-b border-gray-100">
                    <span className="px-2.5 py-1 bg-teal-50 text-teal-700 rounded-lg text-xs font-bold uppercase tracking-wide">Today</span>
                    <h4 className="font-semibold text-gray-900">Current Visit</h4>
                    <span className="text-xs text-gray-400">{filtered.length} photo{filtered.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {filtered.map((img, idx) => {
                        const photo: ComparisonPhoto = { url: img.url, visitLabel: "Current Visit", issueLabel: img.issueLabel, type: img.type, uid: img.uid };
                        const selIdx = selectedPhotos.findIndex((p) => p.uid === img.uid);
                        const isSelected = selIdx >= 0;
                        return (
                          <div key={img.uid} className={`relative aspect-square cursor-pointer group rounded-xl overflow-hidden transition-all duration-200 ${isSelected ? "ring-2 ring-teal-500 ring-offset-2 scale-[0.97]" : "hover:shadow-md ring-1 ring-gray-200"}`} onClick={() => togglePhotoSelection(photo)}>
                            <img src={img.url} alt={`Current ${idx + 1}`} className="w-full h-full object-cover" />
                            <div className={`absolute inset-0 transition-all duration-200 ${isSelected ? "bg-teal-500/10" : "bg-black/0 group-hover:bg-black/5"}`} />
                            {isSelected ? (
                              <div className="absolute top-2 right-2 w-7 h-7 bg-teal-500 rounded-full flex items-center justify-center shadow-lg">
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
              );
            })()}

            {/* Previous Visits */}
            {comparisonSlots.map((slot, sIdx) => {
              const filtered = slot.images.filter((img) => img.type === comparisonImageType);
              if (filtered.length === 0) return null;
              const visitDate = new Date(slot.visitDate);
              const dateLabel = visitDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
              const daysAgo = Math.floor((Date.now() - visitDate.getTime()) / 86400000);
              const timeAgo = daysAgo < 7 ? `${daysAgo}d ago` : daysAgo < 30 ? `${Math.floor(daysAgo / 7)}w ago` : daysAgo < 365 ? `${Math.floor(daysAgo / 30)}mo ago` : `${Math.floor(daysAgo / 365)}y ago`;
              return (
                <div key={slot.key} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center space-x-3 px-5 py-4 border-b border-gray-100">
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">{timeAgo}</span>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate">{dateLabel}</h4>
                      {(slot.issueLabel || slot.diagnosis) && <p className="text-xs text-gray-500 truncate">{slot.issueLabel || slot.diagnosis}</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{filtered.length} photo{filtered.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {filtered.map((img, idx) => {
                        const imgUid = `prev-${slot.key}-${idx}`;
                        const photo: ComparisonPhoto = { url: img.url, visitLabel: dateLabel, issueLabel: slot.issueLabel, type: img.type, uid: imgUid };
                        const selIdx = selectedPhotos.findIndex((p) => p.uid === imgUid);
                        const isSelected = selIdx >= 0;
                        return (
                          <div key={imgUid} className={`relative aspect-square cursor-pointer group rounded-xl overflow-hidden transition-all duration-200 ${isSelected ? "ring-2 ring-teal-500 ring-offset-2 scale-[0.97]" : "hover:shadow-md ring-1 ring-gray-200"}`} onClick={() => togglePhotoSelection(photo)}>
                            <img src={img.url} alt={`Visit ${sIdx + 1} - ${idx + 1}`} className="w-full h-full object-cover" />
                            <div className={`absolute inset-0 transition-all duration-200 ${isSelected ? "bg-teal-500/10" : "bg-black/0 group-hover:bg-black/5"}`} />
                            {isSelected ? (
                              <div className="absolute top-2 right-2 w-7 h-7 bg-teal-500 rounded-full flex items-center justify-center shadow-lg">
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
                      <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 ring-2 ring-teal-500">
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
                <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${selectedPhotos.length > 0 ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
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
                  className="px-8 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm disabled:shadow-none"
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
                      <span className="w-6 h-6 bg-teal-500 text-white rounded-full flex items-center justify-center text-[11px] font-bold shrink-0">{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{photo.visitLabel}</p>
                        {photo.issueLabel && <p className="text-[11px] text-gray-400 truncate">{photo.issueLabel}</p>}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
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

      {/* ── Image Lightbox ─────────────────────────────────────────────────── */}
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
                  <span className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center text-white text-xs font-bold">{selectedImageIndex + 1}</span>
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

export default function DermatologyVisitPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <DermatologyVisitPageInner />
    </Suspense>
  );
}
