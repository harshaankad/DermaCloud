"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { saveAs } from "file-saver";

interface ConsultationData {
  _id: string;
  consultationDate: string;
  patientInfo: {
    name: string;
    age: number;
    gender: string;
    complaint?: string;
    duration?: string;
    previousTreatment?: string;
  };
  clinicalExamination?: {
    lesionSite?: string;
    morphology?: string;
    distribution?: string;
    severity?: string;
  };
  dermoscopeFindings?: {
    aiResults?: {
      predictions: Array<{ condition: string; probability: number }>;
      topPrediction: string;
      confidence: number;
    };
    finalInterpretation?: string;
  };
  diagnosis?: {
    provisional?: string;
    differentials?: string[];
  };
  treatmentPlan?: {
    topicals?: string;
    orals?: string;
    lifestyleChanges?: string;
    investigations?: string;
  };
  images: Array<{
    url: string;
    type: "clinical" | "dermoscopic";
    uploadedAt: string;
  }>;
  followUp?: {
    date?: string;
    reason?: string;
  };
  customFields?: Record<string, any>;
  patientSummary?: {
    aiGenerated?: string;
    doctorEdited?: string;
    translations?: {
      hindi?: string;
      kannada?: string;
    };
  };
  patientId: {
    _id: string;
    patientId: string;
    name: string;
    age: number;
    gender: string;
    phone: string;
    email?: string;
    address?: string;
    medicalHistory?: string;
  };
  clinicId: {
    _id: string;
    clinicName: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  status: string;
  createdAt: string;
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/tier2/dashboard" },
  { label: "Patients", href: "/tier2/patients" },
  { label: "Consultations", href: "/tier2/consultations", active: true },
  { label: "Pharmacy", href: "/tier2/pharmacy" },
  { label: "Templates", href: "/tier2/templates" },
  { label: "Analytics", href: "/tier2/analytics" },
  { label: "Frontdesk", href: "/tier2/settings/frontdesk" },
];

// Renders markdown-style text (##, •, ---, *italic*) as styled JSX
function renderInline(text: string): React.ReactNode {
  if (!text.includes("**")) return text;
  const parts = text.split("**");
  return <>{parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-gray-900">{part}</strong> : part
  )}</>;
}

function RenderMarkdown({ text, headingColor = "text-violet-800" }: { text: string; headingColor?: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, index) => {
        if (line.startsWith("## ")) {
          return (
            <h3 key={index} className={`text-base font-bold ${headingColor} mt-4 mb-1 first:mt-0`}>
              {line.replace("## ", "")}
            </h3>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <h4 key={index} className="text-sm font-semibold text-gray-800 mt-3 mb-1">
              {line.replace("### ", "")}
            </h4>
          );
        }
        if (line.startsWith("• ")) {
          return (
            <p key={index} className="text-sm text-gray-700 flex gap-2 ml-1">
              <span className="text-gray-400 flex-shrink-0 mt-0.5">•</span>
              <span>{renderInline(line.slice(2))}</span>
            </p>
          );
        }
        if (line === "---") {
          return <hr key={index} className="my-3 border-gray-200" />;
        }
        if (line.startsWith("*") && line.endsWith("*") && line.length > 2) {
          return (
            <p key={index} className="text-xs text-gray-500 italic mt-2">
              {line.slice(1, -1)}
            </p>
          );
        }
        if (line.includes("**")) {
          return (
            <p key={index} className="text-sm text-gray-700">
              {renderInline(line)}
            </p>
          );
        }
        if (line.trim()) {
          return <p key={index} className="text-sm text-gray-700">{line}</p>;
        }
        return null;
      })}
    </div>
  );
}

export default function ConsultationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const consultationId = params.consultationId as string;

  const [consultation, setConsultation] = useState<ConsultationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [includeAiExplanation, setIncludeAiExplanation] = useState(true);
  const [generatingExplanation, setGeneratingExplanation] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Translation state — tab-based with cache
  const [activeTab, setActiveTab] = useState<"english" | "hindi" | "kannada">("english");
  const [translationCache, setTranslationCache] = useState<Record<string, string>>({});
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);

  // Translation edit state
  const [editingTranslationLang, setEditingTranslationLang] = useState<string | null>(null);
  const [editedTranslation, setEditedTranslation] = useState("");
  const [savingTranslation, setSavingTranslation] = useState(false);

  // Tracks last-viewed translated language + text for PDF inclusion
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [translatedExplanation, setTranslatedExplanation] = useState<string | null>(null);
  const [includeTranslation, setIncludeTranslation] = useState(true);

  // Multi-issue state
  const [expandedIssues, setExpandedIssues] = useState<Set<number>>(new Set([0]));
  const isMultiIssue = consultation?.customFields?._multiIssue === true;
  const multiIssueData: Array<{
    label: string;
    formData: Record<string, any>;
    aiAnalysis: any;
    dermoscopeImageUrls: string[];
    clinicalImageUrls: string[];
  }> = consultation?.customFields?._issues || [];

  // Active explanation = doctor edited version if available, else AI generated
  const activeExplanation = consultation?.patientSummary?.doctorEdited || consultation?.patientSummary?.aiGenerated;

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchConsultation();
  }, [consultationId]);


  const fetchConsultation = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `/api/tier2/consultation/dermatology?consultationId=${consultationId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (data.success) {
        setConsultation(data.data);
        // Expand all multi-issue accordion items by default
        const issues = data.data.customFields?._issues;
        if (Array.isArray(issues) && issues.length > 0) {
          setExpandedIssues(new Set(issues.map((_: any, i: number) => i)));
        }
        // Pre-load any saved translations so the doctor doesn't re-translate on reload
        const saved = data.data.patientSummary?.translations;
        if (saved) {
          setTranslationCache((prev) => ({
            ...prev,
            ...(saved.hindi ? { hindi: saved.hindi } : {}),
            ...(saved.kannada ? { kannada: saved.kannada } : {}),
          }));
        }
      } else {
        showToast("error", "Failed to load consultation details");
      }
    } catch (error) {
      showToast("error", "Failed to load consultation details");
    } finally {
      setLoading(false);
    }
  };

  const generateAiExplanation = async () => {
    if (!consultation) return;
    setGeneratingExplanation(true);
    setStreamingText("");
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/tier2/consultation/dermatology/generate-explanation", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId }),
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).message || "Failed to generate explanation");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        flushSync(() => setStreamingText(fullText));
      }

      // Commit the final text to consultation state
      setConsultation({
        ...consultation,
        patientSummary: { aiGenerated: fullText, doctorEdited: undefined },
      });
      setStreamingText("");
      setTranslationCache({});
      setActiveTab("english");
      setSelectedLanguage(null);
      setTranslatedExplanation(null);
      showToast("success", "Explanation generated successfully");
    } catch (error) {
      showToast("error", "Failed to generate explanation");
      setStreamingText("");
    } finally {
      setGeneratingExplanation(false);
    }
  };

  const saveExplanation = async () => {
    if (!consultation || !editedText.trim()) return;
    setSavingEdit(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/tier2/consultation/dermatology/save-explanation", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId, doctorEdited: editedText }),
      });
      const data = await response.json();
      if (data.success) {
        setConsultation({
          ...consultation,
          patientSummary: {
            aiGenerated: consultation.patientSummary?.aiGenerated,
            doctorEdited: data.doctorEdited,
          },
        });
        // Clear translation cache as text changed
        setTranslationCache({});
        setActiveTab("english");
        setSelectedLanguage(null);
        setTranslatedExplanation(null);
        setIsEditing(false);
        showToast("success", "Explanation saved");
      } else {
        showToast("error", "Failed to save explanation");
      }
    } catch (error) {
      showToast("error", "Failed to save explanation");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleTabClick = async (tab: "english" | "hindi" | "kannada", force = false) => {
    setActiveTab(tab);
    if (tab === "english") return;

    // Use cache if already translated (skip if forced regeneration)
    if (!force && translationCache[tab]) {
      setSelectedLanguage(tab);
      setTranslatedExplanation(translationCache[tab]);
      return;
    }

    if (!activeExplanation) return;
    setTranslatingLang(tab);

    try {
      const token = localStorage.getItem("token");

      // Split on each ## heading so every section is a small, self-contained
      // chunk — well within token limits for any language including Kannada.
      // All sections are translated in parallel; streams update independently.
      const sections = activeExplanation.split(/\n(?=## )/).filter((s) => s.trim());
      const translatedSections = new Array<string>(sections.length).fill("");

      const translateSection = async (index: number, sectionText: string) => {
        const response = await fetch("/api/tier2/translate", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: sectionText, targetLanguage: tab }),
        });

        if (!response.ok || !response.body) throw new Error(`Section ${index} failed`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          translatedSections[index] += decoder.decode(value, { stream: true });
          // Join all slots in original order on every chunk — sections already
          // being streamed show partial text while others are still empty.
          setTranslationCache((prev) => ({
            ...prev,
            [tab]: translatedSections.join("\n"),
          }));
        }
      };

      await Promise.all(sections.map((section, i) => translateSection(i, section)));

      const fullText = translatedSections.join("\n");
      setSelectedLanguage(tab);
      setTranslatedExplanation(fullText);

      // Auto-save to DB so the doctor never has to retranslate on reload
      try {
        const saveRes = await fetch("/api/tier2/consultation/dermatology/save-translation", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ consultationId, language: tab, text: fullText }),
        });
        const saveData = await saveRes.json();
        if (!saveData.success) {
          showToast("error", "Translation generated but could not be saved — it will retranslate on reload");
        }
      } catch {
        showToast("error", "Translation generated but could not be saved — it will retranslate on reload");
      }
    } catch (error) {
      showToast("error", "Translation failed");
      setActiveTab("english");
      setTranslationCache((prev) => { const next = { ...prev }; delete next[tab]; return next; });
    } finally {
      setTranslatingLang(null);
    }
  };

  const saveTranslationEdit = async () => {
    if (!editingTranslationLang || !editedTranslation.trim()) return;
    setSavingTranslation(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/tier2/consultation/dermatology/save-translation", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId, language: editingTranslationLang, text: editedTranslation }),
      });
      const data = await response.json();
      if (data.success) {
        setTranslationCache((prev) => ({ ...prev, [editingTranslationLang]: editedTranslation }));
        if (selectedLanguage === editingTranslationLang) setTranslatedExplanation(editedTranslation);
        setEditingTranslationLang(null);
        showToast("success", "Translation saved");
      } else {
        showToast("error", "Failed to save translation");
      }
    } catch {
      showToast("error", "Failed to save translation");
    } finally {
      setSavingTranslation(false);
    }
  };

  const generatePdf = async () => {
    if (!consultation) return;
    setDownloading(true);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/tier2/consultation/dermatology/generate-pdf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          consultationId,
          includeExplanation: includeAiExplanation,
          language: includeAiExplanation && includeTranslation && selectedLanguage ? selectedLanguage : null,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "PDF generation failed");
      }

      const blob = await response.blob();
      const patientId = consultation.patientId?.patientId || "Unknown";
      const dateStr   = new Date().toISOString().split("T")[0];
      saveAs(blob, `Consultation_${patientId}_${dateStr}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      showToast("error", "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  const shareViaWhatsApp = async () => {
    if (!consultation) return;
    setSharingWhatsApp(true);

    try {
      const token = localStorage.getItem("token");

      // Step 1: Generate the shareable PDF URL
      const pdfResponse = await fetch("/api/tier2/consultation/dermatology/share-pdf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          consultationId,
          includeExplanation: includeAiExplanation,
          language: includeAiExplanation && includeTranslation && selectedLanguage ? selectedLanguage : null,
        }),
      });

      if (!pdfResponse.ok) {
        const err = await pdfResponse.json().catch(() => ({}));
        throw new Error(err.message || "Failed to generate shareable PDF");
      }

      const { url } = await pdfResponse.json();

      // Step 2: Send via WhatsApp template API
      const waResponse = await fetch("/api/tier2/consultation/send-whatsapp-report", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId, reportUrl: url, consultationType: "dermatology" }),
      });

      if (!waResponse.ok) {
        const err = await waResponse.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send WhatsApp message");
      }

      showToast("success", "Report sent to patient via WhatsApp!");
    } catch (error) {
      console.error("Error sharing via WhatsApp:", error);
      showToast("error", "Failed to send WhatsApp report");
    } finally {
      setSharingWhatsApp(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-14 w-14 border-4 border-teal-100 border-t-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Loading consultation...</p>
        </div>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-semibold text-xl mb-4">Consultation not found</p>
          <Link href="/tier2/consultations">
            <button className="px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700">Back to Consultations</button>
          </Link>
        </div>
      </div>
    );
  }

  const initials = consultation.patientInfo.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const severityColor = (s?: string) => {
    if (!s) return "text-gray-600 bg-gray-100";
    const sl = s.toLowerCase();
    if (sl.includes("mild")) return "text-green-700 bg-green-100";
    if (sl.includes("moderate")) return "text-amber-700 bg-amber-100";
    if (sl.includes("severe")) return "text-red-700 bg-red-100";
    return "text-gray-700 bg-gray-100";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/tier2/consultations" className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-teal-600 transition-colors flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </Link>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-sm flex-shrink-0">
                <svg className="w-4.5 h-4.5 text-white w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-gray-900 truncate">{consultation.patientInfo.name}</h1>
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${consultation.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {consultation.status === "completed" ? "Completed" : "Draft"}
                  </span>
                  {consultation.patientSummary?.doctorEdited && (
                    <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">Doctor Reviewed</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 hidden sm:block">
                  {new Date(consultation.consultationDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  {" · "}{consultation.patientId.patientId}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* AI Summary button — always visible, opens modal */}
              <button
                onClick={() => {
                  // New format stored (## headings present) → just open modal to show it
                  // No content or old format → run generation immediately (same as Regenerate button)
                  const hasValidContent = !!(activeExplanation?.includes("## "));
                  setShowAiModal(true);
                  if (!hasValidContent && !generatingExplanation) {
                    setGeneratingExplanation(true);
                    setStreamingText("");
                    generateAiExplanation();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-violet-50 text-violet-700 border border-violet-300 text-xs font-semibold rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <span>{activeExplanation ? "AI Summary" : "Add AI Summary"}</span>
                {activeExplanation && <span className="w-2 h-2 rounded-full bg-emerald-300 flex-shrink-0"></span>}
              </button>
              {/* PDF inclusion toggles — only if summary exists */}
              {activeExplanation && (
                <label className="flex items-center gap-1.5 bg-violet-50 px-2.5 py-1.5 rounded-lg border border-violet-200 cursor-pointer">
                  <input type="checkbox" checked={includeAiExplanation} onChange={(e) => setIncludeAiExplanation(e.target.checked)} className="w-3.5 h-3.5 text-violet-600 rounded" />
                  <span className="text-xs text-violet-700 font-medium">AI in PDF</span>
                </label>
              )}
              {selectedLanguage && translatedExplanation && (
                <label className="flex items-center gap-1.5 bg-orange-50 px-2.5 py-1.5 rounded-lg border border-orange-200 cursor-pointer">
                  <input type="checkbox" checked={includeTranslation} onChange={(e) => setIncludeTranslation(e.target.checked)} className="w-3.5 h-3.5 text-orange-600 rounded" />
                  <span className="text-xs text-orange-700 font-medium">{selectedLanguage === "hindi" ? "हिंदी" : "ಕನ್ನಡ"} in PDF</span>
                </label>
              )}
              <Link href={`/tier2/patients/${consultation.patientId._id}`}>
                <button className="px-3 py-1.5 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors">Patient</button>
              </Link>
              <button onClick={generatePdf} disabled={downloading} className="px-4 py-1.5 text-sm font-semibold bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-lg hover:from-teal-600 hover:to-cyan-700 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                {downloading ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div><span>Generating...</span></> : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><span>Download PDF</span></>}
              </button>
              <button onClick={shareViaWhatsApp} disabled={sharingWhatsApp} title="Send PDF report via WhatsApp" className="px-4 py-1.5 text-sm font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-lg transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                {sharingWhatsApp ? (
                  <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div><span>Preparing...</span></>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg><span>WhatsApp</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Nav ── */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative ${item.active ? "text-teal-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-teal-600" : "text-gray-500 hover:text-gray-700"}`}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Patient Info Card ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xl">{initials}</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-white font-bold text-xl leading-tight">{consultation.patientInfo.name}</h2>
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">{consultation.patientInfo.age} yrs</span>
                  <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium capitalize">{consultation.patientInfo.gender}</span>
                  <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">{consultation.patientId.phone}</span>
                  <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">ID: {consultation.patientId.patientId}</span>
                </div>
              </div>
            </div>
          </div>
          {(consultation.patientInfo.complaint || consultation.patientInfo.duration || consultation.patientId.email || consultation.patientId.address) && (
            <div className="px-6 py-4 grid sm:grid-cols-2 gap-3">
              {consultation.patientInfo.complaint && (
                <div className="sm:col-span-2 p-3 bg-teal-50 rounded-xl border border-teal-100">
                  <p className="text-xs text-teal-600 font-medium mb-0.5">Chief Complaint</p>
                  <p className="text-sm font-semibold text-gray-900">{consultation.patientInfo.complaint}</p>
                </div>
              )}
              {consultation.patientInfo.duration && (
                <div><p className="text-xs text-gray-400 mb-0.5">Duration</p><p className="text-sm font-semibold text-gray-900">{consultation.patientInfo.duration}</p></div>
              )}
              {consultation.patientInfo.previousTreatment && (
                <div className="sm:col-span-2"><p className="text-xs text-gray-400 mb-0.5">Previous Treatment</p><p className="text-sm font-semibold text-gray-900">{consultation.patientInfo.previousTreatment}</p></div>
              )}
              {consultation.patientId.email && (
                <div><p className="text-xs text-gray-400 mb-0.5">Email</p><p className="text-sm font-semibold text-gray-900">{consultation.patientId.email}</p></div>
              )}
            </div>
          )}
        </div>

        {/* ── Multi-Issue Accordion ── */}
        {isMultiIssue && multiIssueData.length > 0 && (() => {
          const ISSUE_COLORS = [
            { gradient: "from-teal-500 to-cyan-600", light: "bg-teal-50 border-teal-200", bar: "from-teal-500 to-cyan-500" },
            { gradient: "from-violet-500 to-indigo-600", light: "bg-violet-50 border-violet-200", bar: "from-violet-500 to-indigo-500" },
            { gradient: "from-amber-500 to-orange-600", light: "bg-amber-50 border-amber-200", bar: "from-amber-500 to-orange-500" },
            { gradient: "from-pink-500 to-rose-600", light: "bg-pink-50 border-pink-200", bar: "from-pink-500 to-rose-500" },
          ];
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">{multiIssueData.length} Issues Documented</h2>
                <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-semibold">{multiIssueData.length} conditions</span>
              </div>
              {multiIssueData.map((issue, idx) => {
                const color = ISSUE_COLORS[idx % ISSUE_COLORS.length];
                const isExpanded = expandedIssues.has(idx);
                const fd = issue.formData || {};
                const toggle = () => setExpandedIssues((prev) => { const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next; });
                return (
                  <div key={idx} className={`rounded-2xl border-2 ${color.light} shadow-sm overflow-hidden`}>
                    <div className={`bg-gradient-to-r ${color.gradient} px-5 py-3.5 flex items-center justify-between cursor-pointer select-none`} onClick={toggle}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white/25 rounded-lg flex items-center justify-center font-bold text-white">{idx + 1}</div>
                        <div>
                          <p className="font-bold text-white text-sm">{issue.label}</p>
                          {fd.complaint && <p className="text-white/70 text-xs truncate max-w-xs">{String(fd.complaint).substring(0, 60)}{String(fd.complaint).length > 60 ? "..." : ""}</p>}
                        </div>
                      </div>
                      <svg className={`w-5 h-5 text-white transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    {isExpanded && (
                      <div className="bg-white p-5 space-y-5">
                        {(fd.complaint || fd.duration || fd.previousTreatment) && (
                          <div>
                            <div className="flex items-center gap-2 mb-3"><div className={`w-1 h-5 rounded-full bg-gradient-to-b ${color.bar}`} /><h4 className="font-semibold text-gray-800 text-sm">Complaint & History</h4></div>
                            <div className="grid sm:grid-cols-2 gap-3">
                              {fd.complaint && <div className="sm:col-span-2"><p className="text-xs text-gray-400 mb-0.5">Chief Complaint</p><p className="text-sm font-medium text-gray-900">{fd.complaint}</p></div>}
                              {fd.duration && <div><p className="text-xs text-gray-400 mb-0.5">Duration</p><p className="text-sm font-medium text-gray-900">{fd.duration}</p></div>}
                              {fd.previousTreatment && <div className="sm:col-span-2"><p className="text-xs text-gray-400 mb-0.5">Previous Treatment</p><p className="text-sm font-medium text-gray-900">{fd.previousTreatment}</p></div>}
                            </div>
                          </div>
                        )}
                        {issue.clinicalImageUrls?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-3"><div className={`w-1 h-5 rounded-full bg-gradient-to-b ${color.bar}`} /><h4 className="font-semibold text-gray-800 text-sm">Clinical Images</h4></div>
                            <div className="grid grid-cols-3 gap-2">
                              {issue.clinicalImageUrls.map((url: string, i: number) => (
                                <img key={i} src={url} alt={`Clinical ${i + 1}`} className="w-full h-32 object-cover rounded-xl border-2 border-gray-100 cursor-pointer hover:border-teal-400 transition-colors" onClick={() => window.open(url, "_blank")} />
                              ))}
                            </div>
                          </div>
                        )}
                        {(fd.lesionSite || fd.morphology || fd.distribution || fd.severity) && (
                          <div>
                            <div className="flex items-center gap-2 mb-3"><div className={`w-1 h-5 rounded-full bg-gradient-to-b ${color.bar}`} /><h4 className="font-semibold text-gray-800 text-sm">Clinical Examination</h4></div>
                            <div className="grid sm:grid-cols-2 gap-3">
                              {fd.lesionSite && <div><p className="text-xs text-gray-400 mb-0.5">Lesion Site</p><p className="text-sm font-medium text-gray-900">{fd.lesionSite}</p></div>}
                              {fd.morphology && <div><p className="text-xs text-gray-400 mb-0.5">Morphology</p><p className="text-sm font-medium text-gray-900">{fd.morphology}</p></div>}
                              {fd.distribution && <div><p className="text-xs text-gray-400 mb-0.5">Distribution</p><p className="text-sm font-medium text-gray-900">{fd.distribution}</p></div>}
                              {fd.severity && <div><p className="text-xs text-gray-400 mb-0.5">Severity</p><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${severityColor(fd.severity)}`}>{fd.severity}</span></div>}
                            </div>
                          </div>
                        )}
                        {(issue.dermoscopeImageUrls?.length > 0 || issue.aiAnalysis) && (
                          <div>
                            <div className="flex items-center gap-2 mb-3"><div className={`w-1 h-5 rounded-full bg-gradient-to-b ${color.bar}`} /><h4 className="font-semibold text-gray-800 text-sm">Dermoscope Analysis</h4></div>
                            {issue.dermoscopeImageUrls?.length > 0 && (
                              <div className="grid grid-cols-3 gap-2 mb-3">
                                {issue.dermoscopeImageUrls.map((url: string, i: number) => (
                                  <img key={i} src={url} alt={`Dermoscope ${i + 1}`} className="w-full h-32 object-cover rounded-xl border-2 border-violet-100 cursor-pointer hover:border-violet-400 transition-colors" onClick={() => window.open(url, "_blank")} />
                                ))}
                              </div>
                            )}
                            {issue.aiAnalysis?.topPrediction ? (
                              <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-xl p-3 border border-blue-100">
                                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">AI Result</p>
                                <p className="text-base font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">{issue.aiAnalysis.topPrediction?.condition || "Unknown"}</p>
                                {issue.aiAnalysis.topPrediction?.probability && <p className="text-xs text-gray-500 mt-0.5">{(issue.aiAnalysis.topPrediction.probability * 100).toFixed(1)}% confidence</p>}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-xs text-slate-500">No AI analysis performed for this issue</p>
                              </div>
                            )}
                          </div>
                        )}
                        {(fd.provisional || fd.differentials) && (
                          <div>
                            <div className="flex items-center gap-2 mb-3"><div className={`w-1 h-5 rounded-full bg-gradient-to-b ${color.bar}`} /><h4 className="font-semibold text-gray-800 text-sm">Diagnosis</h4></div>
                            {fd.provisional && <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 mb-2"><p className="text-xs text-amber-600 mb-0.5">Provisional Diagnosis</p><p className="font-bold text-amber-900">{fd.provisional}</p></div>}
                            {fd.differentials && <div><p className="text-xs text-gray-400 mb-1">Differentials</p><p className="text-sm text-gray-900">{fd.differentials}</p></div>}
                          </div>
                        )}
                        {(fd.topicals || fd.orals || fd.lifestyleChanges || fd.investigations) && (
                          <div>
                            <div className="flex items-center gap-2 mb-3"><div className={`w-1 h-5 rounded-full bg-gradient-to-b ${color.bar}`} /><h4 className="font-semibold text-gray-800 text-sm">Treatment Plan</h4></div>
                            <div className="space-y-2">
                              {fd.topicals && <div className="flex gap-3 p-2.5 bg-emerald-50 rounded-lg"><span className="text-xs text-emerald-600 font-medium w-20 flex-shrink-0 pt-0.5">Topicals</span><span className="text-sm text-gray-900">{fd.topicals}</span></div>}
                              {fd.orals && <div className="flex gap-3 p-2.5 bg-blue-50 rounded-lg"><span className="text-xs text-blue-600 font-medium w-20 flex-shrink-0 pt-0.5">Orals</span><span className="text-sm text-gray-900">{fd.orals}</span></div>}
                              {fd.lifestyleChanges && <div className="flex gap-3 p-2.5 bg-orange-50 rounded-lg"><span className="text-xs text-orange-600 font-medium w-20 flex-shrink-0 pt-0.5">Lifestyle</span><span className="text-sm text-gray-900">{fd.lifestyleChanges}</span></div>}
                              {fd.investigations && <div className="flex gap-3 p-2.5 bg-purple-50 rounded-lg"><span className="text-xs text-purple-600 font-medium w-20 flex-shrink-0 pt-0.5">Tests</span><span className="text-sm text-gray-900">{fd.investigations}</span></div>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── Single-Issue sections ── */}
        {!isMultiIssue && (
          <>
            {/* Images */}
            {consultation.images && consultation.images.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-teal-500 to-cyan-500"></div>
                  <h2 className="text-sm font-bold text-gray-800">Images</h2>
                  <span className="ml-auto text-xs text-teal-600 font-semibold bg-teal-50 px-2 py-0.5 rounded-full">{consultation.images.length} photos</span>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {consultation.images.map((image, index) => (
                    <div key={index} className="relative group cursor-pointer" onClick={() => window.open(image.url, "_blank")}>
                      <img src={image.url} alt={`${image.type} ${index + 1}`} className="w-full h-40 object-cover rounded-xl border-2 border-gray-100 group-hover:border-teal-400 transition-all group-hover:shadow-md"
                        onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23d1d5db' stroke-width='1'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E"; }} />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 rounded-xl transition-colors flex items-center justify-center">
                        <svg className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </div>
                      <span className={`absolute bottom-2 left-2 text-white text-xs px-2 py-0.5 rounded-full font-medium ${image.type === "dermoscopic" ? "bg-violet-600/80" : "bg-teal-600/80"}`}>
                        {image.type === "dermoscopic" ? "Dermoscope" : "Clinical"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clinical Examination */}
            {consultation.clinicalExamination && (consultation.clinicalExamination.lesionSite || consultation.clinicalExamination.morphology || consultation.clinicalExamination.distribution || consultation.clinicalExamination.severity) && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-sky-500 to-blue-500"></div>
                  <h2 className="text-sm font-bold text-gray-800">Clinical Examination</h2>
                </div>
                <div className="p-5 grid sm:grid-cols-2 gap-4">
                  {consultation.clinicalExamination.lesionSite && <div><p className="text-xs text-gray-400 mb-1">Lesion Site</p><p className="text-sm font-semibold text-gray-900">{consultation.clinicalExamination.lesionSite}</p></div>}
                  {consultation.clinicalExamination.morphology && <div><p className="text-xs text-gray-400 mb-1">Morphology</p><p className="text-sm font-semibold text-gray-900">{consultation.clinicalExamination.morphology}</p></div>}
                  {consultation.clinicalExamination.distribution && <div><p className="text-xs text-gray-400 mb-1">Distribution</p><p className="text-sm font-semibold text-gray-900">{consultation.clinicalExamination.distribution}</p></div>}
                  {consultation.clinicalExamination.severity && (
                    <div><p className="text-xs text-gray-400 mb-1">Severity</p>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${severityColor(consultation.clinicalExamination.severity)}`}>{consultation.clinicalExamination.severity}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dermoscopic Findings */}
            {consultation.dermoscopeFindings?.finalInterpretation && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-violet-500 to-purple-500"></div>
                  <h2 className="text-sm font-bold text-gray-800">Dermoscopic Findings</h2>
                </div>
                <div className="p-5">
                  <p className="text-sm text-gray-800 leading-relaxed">{consultation.dermoscopeFindings.finalInterpretation}</p>
                </div>
              </div>
            )}

            {/* Diagnosis + Treatment */}
            <div className="grid sm:grid-cols-2 gap-5">
              {consultation.diagnosis && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-amber-500 to-orange-500"></div>
                    <h2 className="text-sm font-bold text-gray-800">Diagnosis</h2>
                  </div>
                  <div className="p-5 space-y-3">
                    {consultation.diagnosis.provisional && (
                      <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                        <p className="text-xs text-amber-600 font-medium mb-1">Provisional Diagnosis</p>
                        <p className="text-base font-bold text-amber-900">{consultation.diagnosis.provisional}</p>
                      </div>
                    )}
                    {consultation.diagnosis.differentials && consultation.diagnosis.differentials.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-2">Differential Diagnosis</p>
                        <div className="flex flex-wrap gap-1.5">
                          {consultation.diagnosis.differentials.map((diff, i) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{diff}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {consultation.treatmentPlan && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-emerald-500 to-green-500"></div>
                    <h2 className="text-sm font-bold text-gray-800">Treatment Plan</h2>
                  </div>
                  <div className="p-5 space-y-2.5">
                    {consultation.treatmentPlan.topicals && (
                      <div className="flex gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                        <span className="text-xs font-semibold text-emerald-700 w-16 flex-shrink-0 pt-0.5">Topicals</span>
                        <span className="text-sm text-gray-900">{consultation.treatmentPlan.topicals}</span>
                      </div>
                    )}
                    {consultation.treatmentPlan.orals && (
                      <div className="flex gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <span className="text-xs font-semibold text-blue-700 w-16 flex-shrink-0 pt-0.5">Orals</span>
                        <span className="text-sm text-gray-900">{consultation.treatmentPlan.orals}</span>
                      </div>
                    )}
                    {consultation.treatmentPlan.lifestyleChanges && (
                      <div className="flex gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                        <span className="text-xs font-semibold text-orange-700 w-16 flex-shrink-0 pt-0.5">Lifestyle</span>
                        <span className="text-sm text-gray-900">{consultation.treatmentPlan.lifestyleChanges}</span>
                      </div>
                    )}
                    {consultation.treatmentPlan.investigations && (
                      <div className="flex gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
                        <span className="text-xs font-semibold text-purple-700 w-16 flex-shrink-0 pt-0.5">Tests</span>
                        <span className="text-sm text-gray-900">{consultation.treatmentPlan.investigations}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Follow-up ── */}
        {consultation.followUp?.date && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-cyan-500 to-sky-500"></div>
              <h2 className="text-sm font-bold text-gray-800">Follow-up</h2>
            </div>
            <div className="p-5 flex gap-6">
              <div>
                <p className="text-xs text-gray-400 mb-1">Follow-up Date</p>
                <p className="text-base font-bold text-cyan-700">{new Date(consultation.followUp.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
              {consultation.followUp.reason && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Reason</p>
                  <p className="text-sm font-semibold text-gray-900">{consultation.followUp.reason}</p>
                </div>
              )}
            </div>
          </div>
        )}


        {/* ── Bottom nav ── */}
        <div className="flex items-center justify-between pt-2 pb-4">
          <Link href="/tier2/consultations">
            <button className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm">← Back to Consultations</button>
          </Link>
          <Link href={`/tier2/patients/${consultation.patientId._id}`}>
            <button className="px-5 py-2.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors font-medium text-sm">View Patient Profile →</button>
          </Link>
        </div>
      </main>

      {/* ── AI Summary Modal ── */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowAiModal(false); }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Panel */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

            {/* Modal Header */}
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div>
                  <h2 className="text-white font-bold text-base">AI Patient Summary</h2>
                  <p className="text-violet-200 text-xs">
                    {consultation.patientSummary?.doctorEdited ? "Doctor reviewed & edited" : activeExplanation ? "AI Generated · Claude Sonnet" : "Not yet generated"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeExplanation && !isEditing && !generatingExplanation && (
                  <button onClick={() => { setIsEditing(true); setEditedText(activeExplanation); }} className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Edit
                  </button>
                )}
                <button onClick={() => { setShowAiModal(false); setIsEditing(false); }} className="p-1.5 bg-white/15 hover:bg-white/30 text-white rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto">
              {generatingExplanation ? (
                /* Streaming / generating state */
                streamingText ? (
                  /* Text is flowing in — show it live */
                  <div className="p-6">
                    <RenderMarkdown text={streamingText} headingColor="text-violet-800" />
                    <span className="inline-block w-0.5 h-4 bg-violet-500 ml-0.5 align-middle animate-pulse" />
                  </div>
                ) : (
                  /* Just kicked off — waiting for first token */
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="relative w-14 h-14">
                      <div className="absolute inset-0 rounded-full border-4 border-violet-100"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-t-violet-600 animate-spin"></div>
                    </div>
                    <p className="text-sm font-medium text-gray-500">Generating summary&hellip;</p>
                  </div>
                )
              ) : !activeExplanation ? (
                /* No summary yet */
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mb-5">
                    <svg className="w-8 h-8 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Generate AI Patient Summary</h3>
                  <p className="text-sm text-gray-500 mb-8 max-w-sm">Create a personalised, patient-friendly explanation of this consultation in English, Hindi, or Kannada.</p>
                  <button onClick={generateAiExplanation} className="px-8 py-3 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <span>Generate Summary</span>
                  </button>
                </div>
              ) : isEditing ? (
                /* Edit mode */
                <div className="p-5">
                  <p className="text-xs text-gray-500 mb-3">Edit the explanation below. Markdown formatting is preserved (## headings, • bullets).</p>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    rows={16}
                    className="w-full text-sm text-gray-800 font-mono bg-gray-50 border border-gray-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent resize-none leading-relaxed"
                  />
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-gray-400">{editedText.length} characters</p>
                    <div className="flex gap-2">
                      <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                      <button onClick={saveExplanation} disabled={savingEdit || !editedText.trim()} className="px-5 py-2 text-sm font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors flex items-center gap-2 disabled:opacity-50">
                        {savingEdit ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>Saving...</> : <>Save Changes</>}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* View mode with tabs */
                <>
                  <div className="flex border-b border-gray-100 px-5 pt-1">
                    {[
                      { key: "english", label: "English", flag: "🇬🇧" },
                      { key: "hindi", label: "हिंदी", flag: "🇮🇳" },
                      { key: "kannada", label: "ಕನ್ನಡ", flag: "🏛️" },
                    ].map(({ key, label, flag }) => (
                      <button
                        key={key}
                        onClick={() => handleTabClick(key as "english" | "hindi" | "kannada")}
                        disabled={translatingLang !== null}
                        className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                          activeTab === key
                            ? "text-violet-700 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-violet-600"
                            : "text-gray-400 hover:text-gray-600"
                        } disabled:cursor-wait`}
                      >
                        <span>{flag}</span>
                        <span>{label}</span>
                        {translatingLang === key && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-violet-500 ml-1"></div>}
                        {translationCache[key] && activeTab !== key && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-2 right-1"></span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className={`p-6 ${activeTab === "hindi" ? "bg-orange-50/30" : activeTab === "kannada" ? "bg-emerald-50/30" : "bg-white"}`}>
                    {activeTab === "english" && (
                      <RenderMarkdown text={activeExplanation} headingColor="text-violet-800" />
                    )}
                    {(activeTab === "hindi" || activeTab === "kannada") && (() => {
                      const lang = activeTab;
                      const accent = lang === "hindi"
                        ? { text: "text-orange-700", border: "border-orange-200", btn: "bg-orange-600 hover:bg-orange-700", ring: "focus:ring-orange-400", spinner: "border-orange-500", spinnerText: "text-orange-600" }
                        : { text: "text-emerald-700", border: "border-emerald-200", btn: "bg-emerald-600 hover:bg-emerald-700", ring: "focus:ring-emerald-400", spinner: "border-emerald-500", spinnerText: "text-emerald-600" };
                      const cached = translationCache[lang];
                      if (!cached) {
                        return <div className="flex items-center justify-center py-12 gap-3"><div className={`animate-spin rounded-full h-5 w-5 border-b-2 ${accent.spinner}`}></div><span className={`text-sm font-medium ${accent.spinnerText}`}>Translating to {lang === "hindi" ? "Hindi" : "Kannada"}...</span></div>;
                      }
                      if (editingTranslationLang === lang) {
                        return (
                          <div>
                            <p className="text-xs text-gray-500 mb-3">Edit the translation below.</p>
                            <textarea
                              value={editedTranslation}
                              onChange={(e) => setEditedTranslation(e.target.value)}
                              rows={16}
                              className={`w-full text-sm text-gray-800 font-mono bg-gray-50 border border-gray-200 rounded-xl p-4 focus:outline-none focus:ring-2 ${accent.ring} focus:border-transparent resize-none leading-relaxed`}
                            />
                            <div className="flex items-center justify-between mt-3">
                              <p className="text-xs text-gray-400">{editedTranslation.length} characters</p>
                              <div className="flex gap-2">
                                <button onClick={() => setEditingTranslationLang(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                                <button onClick={saveTranslationEdit} disabled={savingTranslation || !editedTranslation.trim()} className={`px-5 py-2 text-sm font-semibold ${accent.btn} text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50`}>
                                  {savingTranslation ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>Saving...</> : <>Save Changes</>}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {cached.replace(/^##+ /gm, "").replace(/\*\*/g, "")}
                          </p>
                          {translatingLang !== lang && (
                            <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end">
                              <button onClick={() => { setEditingTranslationLang(lang); setEditedTranslation(cached); }} className={`px-3 py-1.5 text-xs font-medium ${accent.text} border ${accent.border} rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                Edit Translation
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer — PDF toggles */}
            {activeExplanation && !generatingExplanation && (
              <div className="border-t border-gray-100 px-6 py-3 flex items-center gap-4 flex-shrink-0 bg-gray-50">
                <span className="text-xs text-gray-500 font-medium">Include in PDF:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={includeAiExplanation} onChange={(e) => setIncludeAiExplanation(e.target.checked)} className="w-3.5 h-3.5 text-violet-600 rounded" />
                  <span className="text-xs text-gray-700">English summary</span>
                </label>
                {selectedLanguage && translatedExplanation && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={includeTranslation} onChange={(e) => setIncludeTranslation(e.target.checked)} className="w-3.5 h-3.5 text-orange-600 rounded" />
                    <span className="text-xs text-gray-700">{selectedLanguage === "hindi" ? "हिंदी translation" : "ಕನ್ನಡ translation"}</span>
                  </label>
                )}
                <button onClick={() => setShowAiModal(false)} className="ml-auto px-4 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border ${toast.type === "success" ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-red-200 text-red-700"}`}>
            {toast.type === "success"
              ? <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              : <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            }
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
