"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PatientPicker, { PickedPatient } from "@/components/PatientPicker";
import SignaturePad, { SignaturePadHandle } from "@/components/SignaturePad";

interface TemplateMeta {
  key: string;
  title: string;
  source?: string;
  category?: string;
}

interface TemplateFull extends TemplateMeta {
  bodyMarkdown: string;
  fields: { key: string; label: string; placeholder?: string; required?: boolean }[];
}

const CATEGORY_STYLE: Record<string, { label: string; cls: string }> = {
  laser: { label: "Laser", cls: "bg-rose-100 text-rose-700" },
  peel: { label: "Peel", cls: "bg-amber-100 text-amber-700" },
  injectable: { label: "Injectable", cls: "bg-violet-100 text-violet-700" },
  facial: { label: "Facial", cls: "bg-pink-100 text-pink-700" },
  surgery: { label: "Surgery", cls: "bg-sky-100 text-sky-700" },
  other: { label: "Procedure", cls: "bg-gray-100 text-gray-600" },
};

function categoryChip(category?: string) {
  const c = CATEGORY_STYLE[category || "other"] || CATEGORY_STYLE.other;
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>;
}

function StepHeader({ n, title, hint, done }: { n: number; title: string; hint?: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
          done ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-600 ring-1 ring-teal-200"
        }`}
      >
        {done ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          n
        )}
      </div>
      <div>
        <h2 className="text-sm font-bold text-gray-900 leading-tight">{title}</h2>
        {hint && <p className="text-xs text-gray-400 leading-tight">{hint}</p>}
      </div>
    </div>
  );
}

// Minimal markdown renderer for the read-only consent body.
function renderBody(md: string) {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line) {
      out.push(<div key={i} className="h-2" />);
      return;
    }
    const bold = (s: string) =>
      s.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
        seg.startsWith("**") && seg.endsWith("**") ? (
          <strong key={j}>{seg.slice(2, -2)}</strong>
        ) : (
          <span key={j}>{seg}</span>
        )
      );
    if (line.startsWith("## ")) {
      out.push(<h3 key={i} className="font-bold text-gray-900 text-sm mt-3 mb-1">{line.slice(3)}</h3>);
    } else if (line.startsWith("### ")) {
      out.push(<h4 key={i} className="font-semibold text-gray-800 text-sm mt-2">{line.slice(4)}</h4>);
    } else if (line.startsWith("• ") || line.startsWith("- ")) {
      out.push(
        <div key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
          <span className="text-gray-400 shrink-0">•</span>
          <span>{bold(line.slice(2))}</span>
        </div>
      );
    } else {
      out.push(<p key={i} className="text-sm text-gray-700 leading-relaxed">{bold(line)}</p>);
    }
  });
  return out;
}

export default function NewConsentPage() {
  const router = useRouter();

  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templateQuery, setTemplateQuery] = useState("");
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [template, setTemplate] = useState<TemplateFull | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelation, setGuardianRelation] = useState("");

  const [sigMode, setSigMode] = useState<"draw" | "upload">("draw");
  const [hasInk, setHasInk] = useState(false);
  const [uploadedSig, setUploadedSig] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const templateBoxRef = useRef<HTMLDivElement>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetch("/api/tier2/consent/templates", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setTemplates(data.data.templates);
      })
      .catch(() => showToast("error", "Failed to load forms"));
  }, [router]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (templateBoxRef.current && !templateBoxRef.current.contains(e.target as Node)) {
        setShowTemplateList(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filteredTemplates = useMemo(() => {
    const q = templateQuery.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.title.toLowerCase().includes(q));
  }, [templates, templateQuery]);

  const loadTemplate = async (key: string) => {
    setSelectedKey(key);
    setShowTemplateList(false);
    setTemplateQuery("");
    setLoadingTemplate(true);
    setTemplate(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/tier2/consent/templates/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setTemplate(data.data.template);
        setFieldValues({});
      } else {
        showToast("error", data.message || "Failed to load form");
      }
    } catch {
      showToast("error", "Failed to load form");
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      showToast("error", "Please upload a PNG or JPG image");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast("error", "Image must be under 8MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUploadedSig(reader.result as string);
    reader.readAsDataURL(file);
  };

  const canSave =
    !!patient &&
    !!template &&
    (sigMode === "draw" ? hasInk : !!uploadedSig) &&
    (!isMinor || guardianName.trim().length > 0);

  const handleSave = async () => {
    if (!patient || !template) return;

    const signatureImage = sigMode === "draw" ? padRef.current?.getDataUrl() : uploadedSig;
    if (!signatureImage) {
      showToast("error", "Please capture the patient's signature");
      return;
    }
    if (isMinor && !guardianName.trim()) {
      showToast("error", "Guardian name is required for a minor");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/tier2/consent/records", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId: patient._id,
          templateKey: template.key,
          fieldValues,
          isMinor,
          guardianName: isMinor ? guardianName.trim() : undefined,
          guardianRelation: isMinor ? guardianRelation.trim() : undefined,
          signatureImage,
          signatureMethod: sigMode === "draw" ? "drawn" : "uploaded",
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/clinic/consent-forms");
      } else {
        showToast("error", data.message || "Failed to save consent");
        setSaving(false);
      }
    } catch {
      showToast("error", "Failed to save consent");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/clinic/consent-forms"
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-teal-600 transition-colors"
              title="Back to Consent Forms"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">New Consent</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Select patient and form, then capture signature</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        {/* Step 1: Patient */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeader n={1} title="Patient" hint="Who is this consent for?" done={!!patient} />
          <PatientPicker value={patient} onChange={setPatient} tokenKey="token" />
        </section>

        {/* Step 2: Form */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <StepHeader n={2} title="Consent Form" hint="Procedure the patient is consenting to" done={!!template} />

          {template && !showTemplateList ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white border border-teal-200 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm truncate">{template.title}</span>
                  {categoryChip(template.category)}
                </div>
                {template.source && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{template.source}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTemplateList(true);
                  setTemplateQuery("");
                }}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700 px-2 py-1 hover:bg-white rounded-lg transition-colors shrink-0"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative" ref={templateBoxRef}>
              <div className="relative">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  autoFocus={!!template}
                  value={templateQuery}
                  onChange={(e) => {
                    setTemplateQuery(e.target.value);
                    setShowTemplateList(true);
                  }}
                  onFocus={() => setShowTemplateList(true)}
                  placeholder="Search procedure consent form..."
                  className="w-full border border-gray-200 bg-gray-50 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none"
                />
              </div>
              {showTemplateList && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
                  {filteredTemplates.length > 0 ? (
                    filteredTemplates.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => loadTemplate(t.key)}
                        className="w-full text-left px-3 py-2.5 hover:bg-teal-50 border-b border-gray-100 last:border-b-0 transition-colors flex items-center justify-between gap-2"
                      >
                        <span className="text-sm font-semibold text-gray-900 truncate">{t.title}</span>
                        {categoryChip(t.category)}
                      </button>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-gray-500 text-center">No matching form</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Step 3: Form details + signature (only once patient + template chosen) */}
        {loadingTemplate && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-teal-600" />
          </div>
        )}

        {template && patient && !loadingTemplate && (
          <>
            {/* Fill-in fields */}
            {template.fields.length > 0 && (
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <StepHeader n={3} title="Details" hint="Fill any procedure-specific blanks (optional)" />
                <div className="grid sm:grid-cols-2 gap-4">
                  {template.fields.map((f) => (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                      <input
                        type="text"
                        value={fieldValues[f.key] || ""}
                        onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder || ""}
                        className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Consent body */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                  <svg className="text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold text-gray-900 leading-tight">Consent document</h2>
                  <p className="text-xs text-gray-400 leading-tight">Read aloud to the patient before signing</p>
                </div>
              </div>
              <div className="relative">
                <div className="max-h-80 overflow-y-auto px-5 py-4 space-y-0.5">{renderBody(template.bodyMarkdown)}</div>
                <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-white to-transparent" />
              </div>
            </section>

            {/* Signature + minor */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Minor toggle */}
              <label className="flex items-start gap-3 cursor-pointer mb-4 pb-4 border-b border-gray-100">
                <input
                  type="checkbox"
                  checked={isMinor}
                  onChange={(e) => setIsMinor(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800">Patient is a minor — signed by guardian</span>
                  <span className="block text-xs text-gray-400">Captures the guardian&apos;s signature and relationship</span>
                </span>
              </label>
              {isMinor && (
                <div className="grid sm:grid-cols-2 gap-4 mb-5 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Guardian name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Relationship to patient</label>
                    <input
                      type="text"
                      value={guardianRelation}
                      onChange={(e) => setGuardianRelation(e.target.value)}
                      placeholder="e.g. Father, Mother"
                      className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm font-bold text-gray-900">{isMinor ? "Guardian signature" : "Patient signature"}</span>
                </div>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setSigMode("draw")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${sigMode === "draw" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500"}`}
                  >
                    Draw
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigMode("upload")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${sigMode === "upload" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500"}`}
                  >
                    Upload / thumb
                  </button>
                </div>
              </div>

              {sigMode === "draw" ? (
                <SignaturePad ref={padRef} onChange={setHasInk} />
              ) : (
                <div>
                  <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUpload} className="hidden" />
                  {uploadedSig ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="bg-white border border-gray-200 rounded-xl p-3 w-full max-w-xs h-32 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={uploadedSig} alt="Signature" className="max-h-full max-w-full object-contain" />
                      </div>
                      <button type="button" onClick={() => uploadRef.current?.click()} className="text-xs font-semibold text-teal-600 hover:text-teal-700">
                        Choose a different image
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => uploadRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-sm font-semibold">Upload signature / thumb impression</span>
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Save (sticky) */}
            <div className="sticky bottom-4 z-20 pb-6">
              <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-2xl shadow-lg shadow-gray-200/50 px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500 hidden sm:block">
                  {canSave ? "Ready to sign" : "Capture the signature to continue"}
                </p>
                <div className="flex items-center gap-3 ml-auto">
                  <Link
                    href="/clinic/consent-forms"
                    className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </Link>
                  <button
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-semibold text-sm hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save &amp; Sign
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border ${
              toast.type === "success" ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-red-200 text-red-700"
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
