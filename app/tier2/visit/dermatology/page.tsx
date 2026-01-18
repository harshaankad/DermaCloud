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

export default function DermatologyVisitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");

  const [patient, setPatient] = useState<Patient | null>(null);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Image upload states
  const [clinicalImages, setClinicalImages] = useState<File[]>([]);
  const [dermoscopeImages, setDermoscopeImages] = useState<File[]>([]);
  const [clinicalPreviews, setClinicalPreviews] = useState<string[]>([]);
  const [dermoscopePreviews, setDermoscopePreviews] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResults, setAiResults] = useState<any>(null);

  // Template states
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

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
        // Load patient data, form settings, and templates in parallel
        const [patientRes, formRes, templatesRes] = await Promise.all([
          fetch(`/api/tier2/patients/${patientId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/tier2/settings/forms?formType=dermatology`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/tier2/templates`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const patientData = await patientRes.json();
        const formSettingsData = await formRes.json();
        const templatesData = await templatesRes.json();

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

        if (templatesData.success) {
          setTemplates(templatesData.data);
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

  const applyTemplate = (templateId: string) => {
    const template = templates.find((t) => t._id === templateId);
    if (!template) return;

    setSelectedTemplate(templateId);
    setShowTemplateDropdown(false);

    // Apply template data to form fields
    const templateData = template.templateData;
    setFormData((prev) => ({
      ...prev,
      // Map template fields to form fields
      complaint: templateData.complaint || prev.complaint,
      duration: templateData.duration || prev.duration,
      previousTreatment: templateData.previousTreatment || prev.previousTreatment,
      lesionSite: templateData.lesionSite || prev.lesionSite,
      morphology: templateData.morphology || prev.morphology,
      distribution: templateData.distribution || prev.distribution,
      severity: templateData.severity || prev.severity,
      patterns: templateData.patterns || prev.patterns,
      finalInterpretation: templateData.finalInterpretation || prev.finalInterpretation,
      provisional: templateData.provisional || prev.provisional,
      differentials: templateData.differentials || prev.differentials,
      topicals: templateData.topicals || prev.topicals,
      orals: templateData.orals || prev.orals,
      lifestyleChanges: templateData.lifestyleChanges || prev.lifestyleChanges,
      investigations: templateData.investigations || prev.investigations,
      reason: templateData.reason || prev.reason,
    }));
  };

  const clearTemplate = () => {
    setSelectedTemplate("");
    // Reset form to initial values
    initializeFormData(sections);
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const compressImage = (file: File, maxWidth = 1024, quality = 0.8): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            "image/jpeg",
            quality
          );
        };
      };
    });
  };

  const handleClinicalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (clinicalImages.length + files.length > 5) {
      alert("Maximum 5 clinical images allowed");
      return;
    }

    // Compress images before adding
    const compressedFiles = await Promise.all(
      files.map((file) => compressImage(file, 1024, 0.8))
    );

    setClinicalImages([...clinicalImages, ...compressedFiles]);

    // Create previews
    compressedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setClinicalPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDermoscopeImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (dermoscopeImages.length + files.length > 5) {
      alert("Maximum 5 dermoscope images allowed");
      return;
    }

    // Compress images before adding
    const compressedFiles = await Promise.all(
      files.map((file) => compressImage(file, 1024, 0.8))
    );

    setDermoscopeImages([...dermoscopeImages, ...compressedFiles]);

    // Create previews
    compressedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDermoscopePreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeClinicalImage = (index: number) => {
    setClinicalImages(clinicalImages.filter((_, i) => i !== index));
    setClinicalPreviews(clinicalPreviews.filter((_, i) => i !== index));
  };

  const removeDermoscopeImage = (index: number) => {
    setDermoscopeImages(dermoscopeImages.filter((_, i) => i !== index));
    setDermoscopePreviews(dermoscopePreviews.filter((_, i) => i !== index));
  };

  const handleAnalyzeDermoscope = async () => {
    if (dermoscopeImages.length === 0) {
      alert("Please upload at least one dermoscope image");
      return;
    }

    setAiProcessing(true);

    try {
      const token = localStorage.getItem("token");

      // Use the tier1 upload endpoint that handles AI analysis
      const formDataObj = new FormData();
      dermoscopeImages.forEach((image) => {
        formDataObj.append("images", image);
      });

      const uploadResponse = await fetch("/api/tier1/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formDataObj,
      });

      const uploadData = await uploadResponse.json();
      console.log("API Response:", uploadData);

      if (uploadData.success) {
        const results = uploadData.data.averageScores || uploadData.data.finalResult;
        console.log("AI Results being set:", results);
        setAiResults(results);
      } else {
        alert("AI analysis failed: " + uploadData.message);
      }
    } catch (error) {
      console.error("Error analyzing images:", error);
      alert("Failed to analyze images");
    } finally {
      setAiProcessing(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    // TODO: Implement draft save API
    setTimeout(() => {
      setSaving(false);
      alert("Draft saved successfully!");
    }, 1000);
  };

  const handleSubmit = async () => {
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

    setSaving(true);
    setUploadingImages(true);

    try {
      const token = localStorage.getItem("token");

      // Upload images and get AI results for dermoscope images
      let clinicalImageUrls: string[] = [];
      let dermoscopeImageUrls: string[] = [];
      let aiAnalysis = null;

      if (dermoscopeImages.length > 0) {
        setAiProcessing(true);

        // Use the tier1 upload endpoint that handles AI analysis
        const formDataObj = new FormData();
        dermoscopeImages.forEach((image) => {
          formDataObj.append("images", image);
        });

        const uploadResponse = await fetch("/api/tier1/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formDataObj,
        });

        const uploadData = await uploadResponse.json();
        if (uploadData.success) {
          dermoscopeImageUrls = uploadData.data.imageUrls;
          aiAnalysis = uploadData.data.averageScores;
          setAiResults(aiAnalysis);
        }

        setAiProcessing(false);
      }

      // Upload clinical images (without AI)
      if (clinicalImages.length > 0) {
        const clinicalFormData = new FormData();
        clinicalImages.forEach((image) => {
          clinicalFormData.append("images", image);
        });

        const clinicalUploadResponse = await fetch("/api/tier1/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: clinicalFormData,
        });

        const clinicalUploadData = await clinicalUploadResponse.json();
        if (clinicalUploadData.success) {
          clinicalImageUrls = clinicalUploadData.data.imageUrls;
        }
      }

      console.log("Saving consultation with:", {
        patientId,
        formData,
        dermoscopeImageUrls,
        clinicalImageUrls,
      });

      // Save consultation with form data and images
      const saveResponse = await fetch("/api/tier2/consultation/dermatology", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientId,
          formData,
          aiAnalysis,
          dermoscopeImageUrls,
          clinicalImageUrls,
        }),
      });

      const saveData = await saveResponse.json();
      if (saveData.success) {
        // Redirect to consultation details page
        router.push(`/tier2/consultation/${saveData.data.consultationId}`);
      } else {
        alert("Failed to save consultation: " + saveData.message);
      }
    } catch (error) {
      console.error("Error saving consultation:", error);
      alert("Failed to save consultation");
    } finally {
      setSaving(false);
      setUploadingImages(false);
    }
  };

  const renderField = (field: FormField) => {
    if (!field.enabled) return null;

    const commonClasses =
      "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";

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
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 flex items-center justify-center">
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
            <button className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              Back to Patients
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-lg shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <Link href="/tier2/dashboard">
            <h1 className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors">
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
              <button className="flex items-center space-x-2 text-slate-600 hover:text-blue-600 font-medium transition-colors">
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
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-blue-600"
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
            <div className="px-4 py-2 bg-blue-100 rounded-lg">
              <p className="text-sm font-semibold text-blue-700">
                Dermatology Visit
              </p>
            </div>
          </div>
        </div>

        {/* Form Title */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            Dermatology Consultation Form
          </h2>
          <p className="text-slate-600">
            Complete the consultation details below
          </p>
        </div>

        {/* Template Selector */}
        {templates.length > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl shadow-md border border-amber-200 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Quick Fill with Template</h3>
                  <p className="text-sm text-slate-600">Select a template to auto-fill common fields</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="relative">
                  <button
                    onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                    className="px-4 py-2.5 bg-white border border-amber-300 rounded-lg text-slate-700 font-medium hover:bg-amber-50 transition-colors flex items-center space-x-2 min-w-[200px] justify-between"
                  >
                    <span className="truncate">
                      {selectedTemplate
                        ? templates.find((t) => t._id === selectedTemplate)?.name || "Select Template"
                        : "Select Template"}
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${showTemplateDropdown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showTemplateDropdown && (
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-80 overflow-y-auto">
                      <div className="p-2">
                        {/* Group templates by category */}
                        {Array.from(new Set(templates.map((t) => t.category || "Uncategorized"))).map((category) => (
                          <div key={category}>
                            <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              {category}
                            </div>
                            {templates
                              .filter((t) => (t.category || "Uncategorized") === category)
                              .map((template) => (
                                <button
                                  key={template._id}
                                  onClick={() => applyTemplate(template._id)}
                                  className={`w-full text-left px-3 py-2.5 rounded-lg hover:bg-amber-50 transition-colors ${
                                    selectedTemplate === template._id ? "bg-amber-100 border border-amber-300" : ""
                                  }`}
                                >
                                  <div className="font-medium text-slate-900">{template.name}</div>
                                  {template.description && (
                                    <div className="text-xs text-slate-500 truncate">{template.description}</div>
                                  )}
                                </button>
                              ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedTemplate && (
                  <button
                    onClick={clearTemplate}
                    className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors font-medium text-sm"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {selectedTemplate && (
              <div className="mt-4 pt-4 border-t border-amber-200">
                <div className="flex items-center space-x-2 text-sm text-amber-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>
                    Template "<strong>{templates.find((t) => t._id === selectedTemplate)?.name}</strong>" applied. You can modify any field as needed.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Form Sections with Images integrated */}
        <div className="space-y-6">
          {sections
            .filter((section) => section.enabled)
            .sort((a, b) => a.order - b.order)
            .map((section, sectionIndex) => (
              <>
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

                {/* Insert image upload sections after Patient Information section */}
                {section.sectionName === "patientInfo" && (
                  <>
                    {/* Clinical Images Section */}
                    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
                      <h3 className="text-xl font-bold text-slate-900 mb-4 pb-3 border-b border-gray-200">
                        Clinical Images
                      </h3>
                      <p className="text-sm text-slate-600 mb-4">Upload up to 5 clinical photographs of the affected area</p>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                        {clinicalPreviews.map((preview, index) => (
                          <div key={index} className="relative group">
                            <img src={preview} alt={`Clinical ${index + 1}`} className="w-full h-40 object-cover rounded-lg border-2 border-gray-200" />
                            <button
                              onClick={() => removeClinicalImage(index)}
                              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>

                      {clinicalImages.length < 5 && (
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <p className="text-sm text-slate-600 font-semibold">Upload Clinical Images</p>
                            <p className="text-xs text-slate-500">{clinicalImages.length}/5 uploaded</p>
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            multiple
                            onChange={handleClinicalImageUpload}
                          />
                        </label>
                      )}
                    </div>

                    {/* Dermoscope Images Section */}
                    <div className="bg-white rounded-xl shadow-md border border-emerald-200 p-6 bg-emerald-50">
                      <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-emerald-200">
                        <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        <h3 className="text-xl font-bold text-emerald-900">Dermoscope Images (AI Analysis)</h3>
                      </div>
                      <p className="text-sm text-emerald-700 mb-4">Upload up to 5 dermoscopic images for AI-powered skin lesion analysis</p>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                        {dermoscopePreviews.map((preview, index) => (
                          <div key={index} className="relative group">
                            <img src={preview} alt={`Dermoscope ${index + 1}`} className="w-full h-40 object-cover rounded-lg border-2 border-emerald-300" />
                            <button
                              onClick={() => removeDermoscopeImage(index)}
                              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>

                      {!aiResults && dermoscopeImages.length < 5 && (
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-emerald-400 rounded-lg cursor-pointer hover:border-emerald-600 hover:bg-emerald-100 transition-all bg-white">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <svg className="w-10 h-10 text-emerald-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <p className="text-sm text-emerald-700 font-semibold">Upload Dermoscope Images</p>
                            <p className="text-xs text-emerald-600">{dermoscopeImages.length}/5 uploaded</p>
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            multiple
                            onChange={handleDermoscopeImageUpload}
                          />
                        </label>
                      )}

                      {/* Done Button */}
                      {dermoscopeImages.length > 0 && !aiResults && !aiProcessing && (
                        <button
                          onClick={handleAnalyzeDermoscope}
                          className="w-full mt-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-semibold rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Done - Analyze with AI</span>
                        </button>
                      )}

                      {/* AI Processing Indicator */}
                      {aiProcessing && (
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            <p className="text-sm font-semibold text-blue-700">
                              AI is analyzing {dermoscopeImages.length} dermoscope image{dermoscopeImages.length > 1 ? 's' : ''}...
                            </p>
                          </div>
                        </div>
                      )}

                      {/* AI Results - Tier 1 Style */}
                      {aiResults && (
                        <div className="mt-4 animate-fade-in">
                          {/* Top Prediction - Highlighted */}
                          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 mb-4 border-2 border-blue-200">
                            <p className="text-sm text-gray-600 mb-2">
                              {dermoscopeImages.length > 1 ? `Analyzed ${dermoscopeImages.length} images - Averaged Result` : "AI Analysis Result"}
                            </p>
                            <h4 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                              {aiResults.topPrediction?.condition || "Unknown"}
                            </h4>
                            <p className="text-lg text-gray-700 mb-3">
                              {aiResults.topPrediction?.probability ? `${(aiResults.topPrediction.probability * 100).toFixed(1)}% confidence` : "N/A"}
                            </p>
                            <span
                              className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                                aiResults.topPrediction?.confidence === "high"
                                  ? "bg-green-100 text-green-700"
                                  : aiResults.topPrediction?.confidence === "medium"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {aiResults.topPrediction?.confidence || "low"} confidence
                            </span>
                          </div>

                          {/* All Predictions */}
                          <div className="bg-white rounded-xl p-5 border border-gray-200">
                            <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                              <svg className="w-5 h-5 mr-2 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              All Predictions:
                            </h4>
                            <div className="space-y-2">
                              {aiResults.AA !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Alopecia Areata (AA)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${aiResults.AA}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.AA.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                              {aiResults.BCC !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Basal Cell Carcinoma (BCC)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-orange-600 h-2 rounded-full" style={{ width: `${aiResults.BCC}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.BCC.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                              {aiResults.ECZ !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Eczema (ECZ)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-green-600 h-2 rounded-full" style={{ width: `${aiResults.ECZ}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.ECZ.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                              {aiResults.HZ !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Herpes Zoster (HZ)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-yellow-600 h-2 rounded-full" style={{ width: `${aiResults.HZ}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.HZ.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                              {aiResults.LP !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Lichen Planus (LP)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${aiResults.LP}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.LP.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                              {aiResults.ND !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Nevus Depigmentosus (ND)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-pink-600 h-2 rounded-full" style={{ width: `${aiResults.ND}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.ND.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                              {aiResults.PSO !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Psoriasis (PSO)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-red-600 h-2 rounded-full" style={{ width: `${aiResults.PSO}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.PSO.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                              {aiResults.TI !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Tinea Incognito (TI)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${aiResults.TI}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.TI.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                              {aiResults.VW !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Viral Warts (VW)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-teal-600 h-2 rounded-full" style={{ width: `${aiResults.VW}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.VW.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                              {aiResults.VIT !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Vitiligo (VIT)</span>
                                  <div className="flex items-center space-x-2">
                                    <div className="w-32 bg-gray-200 rounded-full h-2">
                                      <div className="bg-cyan-600 h-2 rounded-full" style={{ width: `${aiResults.VIT}%` }}></div>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">{aiResults.VIT.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Re-analyze Button */}
                          <button
                            onClick={() => {
                              setAiResults(null);
                              setDermoscopeImages([]);
                              setDermoscopePreviews([]);
                            }}
                            className="w-full mt-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                          >
                            Clear & Upload New Images
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
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
            onClick={handleSubmit}
            disabled={saving || uploadingImages}
            className="px-8 py-3 bg-gradient-to-br from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadingImages ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>{aiProcessing ? "AI Analyzing..." : "Uploading Images..."}</span>
              </>
            ) : (
              <>
                <span>Save & Complete Consultation</span>
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
