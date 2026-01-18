"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TemplateData {
  complaint?: string;
  duration?: string;
  previousTreatment?: string;
  lesionSite?: string;
  morphology?: string;
  distribution?: string;
  severity?: string;
  patterns?: string;
  finalInterpretation?: string;
  provisional?: string;
  differentials?: string;
  topicals?: string;
  orals?: string;
  lifestyleChanges?: string;
  investigations?: string;
  reason?: string;
}

interface Template {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  isActive: boolean;
  templateData: TemplateData;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  "Eczema",
  "Psoriasis",
  "Vitiligo",
  "Acne",
  "Fungal Infections",
  "Allergic Reactions",
  "Hair Disorders",
  "Pigmentation",
  "Other",
];

const SEVERITY_OPTIONS = ["Mild", "Moderate", "Severe", "Very Severe"];

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    templateData: {
      complaint: "",
      duration: "",
      previousTreatment: "",
      lesionSite: "",
      morphology: "",
      distribution: "",
      severity: "",
      patterns: "",
      finalInterpretation: "",
      provisional: "",
      differentials: "",
      topicals: "",
      orals: "",
      lifestyleChanges: "",
      investigations: "",
      reason: "",
    } as TemplateData,
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/tier2/templates?activeOnly=false", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      description: "",
      category: "",
      templateData: {
        complaint: "",
        duration: "",
        previousTreatment: "",
        lesionSite: "",
        morphology: "",
        distribution: "",
        severity: "",
        patterns: "",
        finalInterpretation: "",
        provisional: "",
        differentials: "",
        topicals: "",
        orals: "",
        lifestyleChanges: "",
        investigations: "",
        reason: "",
      },
    });
    setShowModal(true);
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category || "",
      templateData: { ...template.templateData },
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert("Template name is required");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const url = "/api/tier2/templates";
      const method = editingTemplate ? "PUT" : "POST";
      const body = editingTemplate
        ? { templateId: editingTemplate._id, ...formData }
        : formData;

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.success) {
        setShowModal(false);
        fetchTemplates();
      } else {
        alert(data.message || "Failed to save template");
      }
    } catch (error) {
      console.error("Error saving template:", error);
      alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/tier2/templates?templateId=${templateId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setDeleteConfirm(null);
        fetchTemplates();
      } else {
        alert(data.message || "Failed to delete template");
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      alert("Failed to delete template");
    }
  };

  const toggleActive = async (template: Template) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/tier2/templates", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          templateId: template._id,
          isActive: !template.isActive,
        }),
      });

      const data = await response.json();
      if (data.success) {
        fetchTemplates();
      }
    } catch (error) {
      console.error("Error toggling template:", error);
    }
  };

  const updateTemplateData = (field: keyof TemplateData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      templateData: {
        ...prev.templateData,
        [field]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-lg shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-8">
              <Link href="/tier2/dashboard">
                <h1 className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors">
                  DermaHMS
                </h1>
              </Link>
              <nav className="hidden md:flex space-x-6">
                <Link href="/tier2/dashboard" className="text-slate-700 hover:text-blue-600 font-medium transition-colors">
                  Dashboard
                </Link>
                <Link href="/tier2/patients" className="text-slate-700 hover:text-blue-600 font-medium transition-colors">
                  Patients
                </Link>
                <Link href="/tier2/templates" className="text-blue-600 font-medium">
                  Templates
                </Link>
                <Link href="/tier2/settings/forms" className="text-slate-700 hover:text-blue-600 font-medium transition-colors">
                  Form Settings
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Consultation Templates</h2>
            <p className="text-slate-600 mt-1">Create and manage templates to auto-fill consultation forms</p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create Template</span>
          </button>
        </div>

        {/* Templates Grid */}
        {templates.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No Templates Yet</h3>
            <p className="text-slate-500 mb-6">Create your first template to speed up consultations</p>
            <button
              onClick={openCreateModal}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Your First Template
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template._id}
                className={`bg-white rounded-xl shadow-md p-6 border-2 transition-all hover:shadow-lg ${
                  template.isActive ? "border-transparent hover:border-blue-200" : "border-gray-200 opacity-60"
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{template.name}</h3>
                    {template.category && (
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded mt-1">
                        {template.category}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleActive(template)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      template.isActive
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {template.isActive ? "Active" : "Inactive"}
                  </button>
                </div>

                {template.description && (
                  <p className="text-sm text-slate-600 mb-4 line-clamp-2">{template.description}</p>
                )}

                {/* Preview of template data */}
                <div className="space-y-2 mb-4">
                  {template.templateData.provisional && (
                    <div className="flex items-center text-sm">
                      <span className="text-slate-500 w-20">Diagnosis:</span>
                      <span className="text-slate-700 font-medium truncate">{template.templateData.provisional}</span>
                    </div>
                  )}
                  {template.templateData.topicals && (
                    <div className="flex items-center text-sm">
                      <span className="text-slate-500 w-20">Topicals:</span>
                      <span className="text-slate-700 font-medium truncate">{template.templateData.topicals}</span>
                    </div>
                  )}
                  {template.templateData.severity && (
                    <div className="flex items-center text-sm">
                      <span className="text-slate-500 w-20">Severity:</span>
                      <span className="text-slate-700 font-medium">{template.templateData.severity}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex space-x-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => openEditModal(template)}
                    className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(template._id)}
                    className="px-4 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition-colors text-sm"
                  >
                    Delete
                  </button>
                </div>

                {/* Delete Confirmation */}
                {deleteConfirm === template._id && (
                  <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm text-red-700 mb-3">Are you sure you want to delete this template?</p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleDelete(template._id)}
                        className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="flex-1 px-3 py-1.5 bg-white text-slate-700 text-sm font-medium rounded border hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <h3 className="text-xl font-bold text-white">
                {editingTemplate ? "Edit Template" : "Create New Template"}
              </h3>
              <p className="text-blue-100 text-sm mt-1">
                Fill in the fields you want to auto-populate in consultations
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Template Info */}
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Template Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Eczema - Mild Case"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Category</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of when to use this template"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Chief Complaint & History */}
              <div className="mb-6">
                <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-gray-200">
                  Chief Complaint & History
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Chief Complaint</label>
                    <input
                      type="text"
                      value={formData.templateData.complaint || ""}
                      onChange={(e) => updateTemplateData("complaint", e.target.value)}
                      placeholder="e.g., Itchy red patches on skin"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Duration</label>
                    <input
                      type="text"
                      value={formData.templateData.duration || ""}
                      onChange={(e) => updateTemplateData("duration", e.target.value)}
                      placeholder="e.g., 2 weeks"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-600 mb-1">Previous Treatment</label>
                    <input
                      type="text"
                      value={formData.templateData.previousTreatment || ""}
                      onChange={(e) => updateTemplateData("previousTreatment", e.target.value)}
                      placeholder="e.g., Used OTC hydrocortisone cream"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Clinical Examination */}
              <div className="mb-6">
                <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-gray-200">
                  Clinical Examination
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Lesion Site</label>
                    <input
                      type="text"
                      value={formData.templateData.lesionSite || ""}
                      onChange={(e) => updateTemplateData("lesionSite", e.target.value)}
                      placeholder="e.g., Bilateral arms, trunk"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Morphology</label>
                    <input
                      type="text"
                      value={formData.templateData.morphology || ""}
                      onChange={(e) => updateTemplateData("morphology", e.target.value)}
                      placeholder="e.g., Erythematous papules and plaques"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Distribution</label>
                    <input
                      type="text"
                      value={formData.templateData.distribution || ""}
                      onChange={(e) => updateTemplateData("distribution", e.target.value)}
                      placeholder="e.g., Symmetrical, bilateral"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Severity</label>
                    <select
                      value={formData.templateData.severity || ""}
                      onChange={(e) => updateTemplateData("severity", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="">Select Severity</option>
                      {SEVERITY_OPTIONS.map((sev) => (
                        <option key={sev} value={sev}>{sev}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Dermoscopic Findings */}
              <div className="mb-6">
                <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-gray-200">
                  Dermoscopic Findings
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Patterns</label>
                    <input
                      type="text"
                      value={formData.templateData.patterns || ""}
                      onChange={(e) => updateTemplateData("patterns", e.target.value)}
                      placeholder="e.g., Dotted vessels, scales"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Final Interpretation</label>
                    <input
                      type="text"
                      value={formData.templateData.finalInterpretation || ""}
                      onChange={(e) => updateTemplateData("finalInterpretation", e.target.value)}
                      placeholder="e.g., Consistent with eczematous dermatitis"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Diagnosis */}
              <div className="mb-6">
                <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-gray-200">
                  Diagnosis
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Provisional Diagnosis</label>
                    <input
                      type="text"
                      value={formData.templateData.provisional || ""}
                      onChange={(e) => updateTemplateData("provisional", e.target.value)}
                      placeholder="e.g., Atopic Dermatitis"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Differential Diagnosis</label>
                    <input
                      type="text"
                      value={formData.templateData.differentials || ""}
                      onChange={(e) => updateTemplateData("differentials", e.target.value)}
                      placeholder="e.g., Contact dermatitis, Psoriasis"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Treatment Plan */}
              <div className="mb-6">
                <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-gray-200">
                  Treatment Plan
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Topical Medications</label>
                    <textarea
                      value={formData.templateData.topicals || ""}
                      onChange={(e) => updateTemplateData("topicals", e.target.value)}
                      placeholder="e.g., Mometasone 0.1% cream BD x 2 weeks"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Oral Medications</label>
                    <textarea
                      value={formData.templateData.orals || ""}
                      onChange={(e) => updateTemplateData("orals", e.target.value)}
                      placeholder="e.g., Cetirizine 10mg OD x 2 weeks"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Lifestyle Advice</label>
                    <textarea
                      value={formData.templateData.lifestyleChanges || ""}
                      onChange={(e) => updateTemplateData("lifestyleChanges", e.target.value)}
                      placeholder="e.g., Avoid hot water baths, use moisturizer regularly"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Investigations</label>
                    <textarea
                      value={formData.templateData.investigations || ""}
                      onChange={(e) => updateTemplateData("investigations", e.target.value)}
                      placeholder="e.g., CBC, IgE levels if needed"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Follow-up */}
              <div className="mb-6">
                <h4 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-gray-200">
                  Follow-up
                </h4>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Follow-up Reason</label>
                  <input
                    type="text"
                    value={formData.templateData.reason || ""}
                    onChange={(e) => updateTemplateData("reason", e.target.value)}
                    placeholder="e.g., Review in 2 weeks to assess treatment response"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2.5 bg-white text-slate-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{editingTemplate ? "Update Template" : "Create Template"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
