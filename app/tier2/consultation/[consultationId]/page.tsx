"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, BorderStyle, ShadingType, convertInchesToTwip } from "docx";
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
  patientSummary?: {
    aiGenerated?: string;
    doctorEdited?: string;
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

export default function ConsultationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const consultationId = params.consultationId as string;

  const [consultation, setConsultation] = useState<ConsultationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [includeAiExplanation, setIncludeAiExplanation] = useState(true);
  const [generatingExplanation, setGeneratingExplanation] = useState(false);

  useEffect(() => {
    fetchConsultation();
  }, [consultationId]);

  const generateAiExplanation = async () => {
    if (!consultation) return;

    setGeneratingExplanation(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `/api/tier2/consultation/dermatology/generate-explanation`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ consultationId }),
        }
      );

      const data = await response.json();
      if (data.success) {
        // Update local state with the new explanation
        setConsultation({
          ...consultation,
          patientSummary: {
            aiGenerated: data.explanation,
          },
        });
      } else {
        alert("Failed to generate AI explanation");
      }
    } catch (error) {
      console.error("Error generating AI explanation:", error);
      alert("Failed to generate AI explanation");
    } finally {
      setGeneratingExplanation(false);
    }
  };

  const fetchConsultation = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `/api/tier2/consultation/dermatology?consultationId=${consultationId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();
      if (data.success) {
        setConsultation(data.data);
      } else {
        alert("Failed to load consultation details");
      }
    } catch (error) {
      console.error("Error fetching consultation:", error);
      alert("Failed to load consultation details");
    } finally {
      setLoading(false);
    }
  };

  const generateWordDocument = async () => {
    if (!consultation) return;

    setDownloading(true);

    try {
      // Safely access clinic data with fallbacks
      const clinicName = consultation.clinicId?.clinicName || "Dermatology Clinic";
      const clinicAddress = consultation.clinicId?.address || "";
      const clinicPhone = consultation.clinicId?.phone || "";
      const clinicEmail = consultation.clinicId?.email || "";

      // Helper function to create section header with styled background
      const createSectionHeader = (text: string) => {
        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { fill: "1E3A5F", type: ShadingType.SOLID, color: "1E3A5F" },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: text,
                          bold: true,
                          color: "FFFFFF",
                          size: 24,
                        }),
                      ],
                      spacing: { before: 100, after: 100 },
                      indent: { left: 200 },
                    }),
                  ],
                  margins: { top: 100, bottom: 100, left: 200, right: 200 },
                }),
              ],
            }),
          ],
        });
      };

      // Helper function to create info row
      const createInfoRow = (label: string, value: string) => {
        return new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: "F0F4F8", type: ShadingType.SOLID, color: "F0F4F8" },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: label, bold: true, size: 22 })],
                  spacing: { before: 80, after: 80 },
                }),
              ],
              margins: { left: 150, right: 100 },
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: value, size: 22 })],
                  spacing: { before: 80, after: 80 },
                }),
              ],
              margins: { left: 150, right: 100 },
            }),
          ],
        });
      };

      const doc = new Document({
        styles: {
          paragraphStyles: [
            {
              id: "Normal",
              name: "Normal",
              run: {
                font: "Calibri",
                size: 22,
              },
            },
          ],
        },
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: convertInchesToTwip(0.75),
                  right: convertInchesToTwip(0.75),
                  bottom: convertInchesToTwip(0.75),
                  left: convertInchesToTwip(0.75),
                },
              },
            },
            children: [
              // Clinic Header with styled box
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 2, color: "1E3A5F" },
                  bottom: { style: BorderStyle.SINGLE, size: 2, color: "1E3A5F" },
                  left: { style: BorderStyle.SINGLE, size: 2, color: "1E3A5F" },
                  right: { style: BorderStyle.SINGLE, size: 2, color: "1E3A5F" },
                },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        shading: { fill: "1E3A5F", type: ShadingType.SOLID, color: "1E3A5F" },
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: clinicName.toUpperCase(),
                                bold: true,
                                color: "FFFFFF",
                                size: 36,
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 200, after: 100 },
                          }),
                          ...(clinicAddress ? [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: clinicAddress,
                                  color: "E0E7EE",
                                  size: 20,
                                }),
                              ],
                              alignment: AlignmentType.CENTER,
                              spacing: { after: 50 },
                            }),
                          ] : []),
                          ...(clinicPhone || clinicEmail ? [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${clinicPhone ? "Tel: " + clinicPhone : ""}${clinicPhone && clinicEmail ? " | " : ""}${clinicEmail ? "Email: " + clinicEmail : ""}`,
                                  color: "E0E7EE",
                                  size: 20,
                                }),
                              ],
                              alignment: AlignmentType.CENTER,
                              spacing: { after: 200 },
                            }),
                          ] : []),
                        ],
                      }),
                    ],
                  }),
                ],
              }),

              // Report Title
              new Paragraph({
                children: [
                  new TextRun({
                    text: "DERMATOLOGY CONSULTATION REPORT",
                    bold: true,
                    size: 28,
                    color: "1E3A5F",
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 400, after: 100 },
              }),

              // Date and Report ID
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Date: ${new Date(consultation.consultationDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`,
                    size: 20,
                    color: "666666",
                  }),
                  new TextRun({ text: "     |     ", color: "CCCCCC", size: 20 }),
                  new TextRun({
                    text: `Patient ID: ${consultation.patientId?.patientId || "N/A"}`,
                    size: 20,
                    color: "666666",
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
              }),

              // Patient Information Section
              createSectionHeader("PATIENT INFORMATION"),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                },
                rows: [
                  createInfoRow("Name", consultation.patientInfo?.name || "N/A"),
                  createInfoRow("Age / Gender", `${consultation.patientInfo?.age || "N/A"} years / ${(consultation.patientInfo?.gender || "N/A").charAt(0).toUpperCase() + (consultation.patientInfo?.gender || "").slice(1)}`),
                  createInfoRow("Contact", consultation.patientId?.phone || "N/A"),
                  ...(consultation.patientInfo?.complaint ? [createInfoRow("Chief Complaint", consultation.patientInfo.complaint)] : []),
                  ...(consultation.patientInfo?.duration ? [createInfoRow("Duration", consultation.patientInfo.duration)] : []),
                  ...(consultation.patientInfo?.previousTreatment ? [createInfoRow("Previous Treatment", consultation.patientInfo.previousTreatment)] : []),
                ],
              }),

              new Paragraph({ text: "", spacing: { before: 300, after: 100 } }),

              // Clinical Examination Section
              ...(consultation.clinicalExamination?.lesionSite || consultation.clinicalExamination?.morphology || consultation.clinicalExamination?.distribution || consultation.clinicalExamination?.severity ? [
                createSectionHeader("CLINICAL EXAMINATION"),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  },
                  rows: [
                    ...(consultation.clinicalExamination?.lesionSite ? [createInfoRow("Lesion Site", consultation.clinicalExamination.lesionSite)] : []),
                    ...(consultation.clinicalExamination?.morphology ? [createInfoRow("Morphology", consultation.clinicalExamination.morphology)] : []),
                    ...(consultation.clinicalExamination?.distribution ? [createInfoRow("Distribution", consultation.clinicalExamination.distribution)] : []),
                    ...(consultation.clinicalExamination?.severity ? [createInfoRow("Severity", consultation.clinicalExamination.severity)] : []),
                  ],
                }),
                new Paragraph({ text: "", spacing: { before: 300, after: 100 } }),
              ] : []),

              // Dermoscopic Findings Section
              ...(consultation.dermoscopeFindings?.finalInterpretation ? [
                createSectionHeader("DERMOSCOPIC FINDINGS"),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  },
                  rows: [
                    new TableRow({
                      children: [
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [new TextRun({ text: consultation.dermoscopeFindings.finalInterpretation, size: 22 })],
                              spacing: { before: 100, after: 100 },
                            }),
                          ],
                          margins: { left: 150, right: 150, top: 100, bottom: 100 },
                        }),
                      ],
                    }),
                  ],
                }),
                new Paragraph({ text: "", spacing: { before: 300, after: 100 } }),
              ] : []),

              // Diagnosis Section
              ...(consultation.diagnosis?.provisional || (consultation.diagnosis?.differentials && consultation.diagnosis.differentials.length > 0) ? [
                createSectionHeader("DIAGNOSIS"),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  },
                  rows: [
                    ...(consultation.diagnosis?.provisional ? [createInfoRow("Provisional Diagnosis", consultation.diagnosis.provisional)] : []),
                    ...(consultation.diagnosis?.differentials && consultation.diagnosis.differentials.length > 0 ? [createInfoRow("Differential Diagnosis", consultation.diagnosis.differentials.join(", "))] : []),
                  ],
                }),
                new Paragraph({ text: "", spacing: { before: 300, after: 100 } }),
              ] : []),

              // Treatment Plan Section
              ...(consultation.treatmentPlan?.topicals || consultation.treatmentPlan?.orals || consultation.treatmentPlan?.lifestyleChanges || consultation.treatmentPlan?.investigations ? [
                createSectionHeader("TREATMENT PLAN"),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  },
                  rows: [
                    ...(consultation.treatmentPlan?.topicals ? [createInfoRow("Topical Medications", consultation.treatmentPlan.topicals)] : []),
                    ...(consultation.treatmentPlan?.orals ? [createInfoRow("Oral Medications", consultation.treatmentPlan.orals)] : []),
                    ...(consultation.treatmentPlan?.lifestyleChanges ? [createInfoRow("Lifestyle Advice", consultation.treatmentPlan.lifestyleChanges)] : []),
                    ...(consultation.treatmentPlan?.investigations ? [createInfoRow("Investigations", consultation.treatmentPlan.investigations)] : []),
                  ],
                }),
                new Paragraph({ text: "", spacing: { before: 300, after: 100 } }),
              ] : []),

              // Follow-up Section
              ...(consultation.followUp?.date ? [
                createSectionHeader("FOLLOW-UP"),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  },
                  rows: [
                    createInfoRow("Follow-up Date", new Date(consultation.followUp.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })),
                    ...(consultation.followUp?.reason ? [createInfoRow("Reason", consultation.followUp.reason)] : []),
                  ],
                }),
              ] : []),

              // AI Patient Explanation Section (optional)
              ...(includeAiExplanation && consultation.patientSummary?.aiGenerated ? [
                new Paragraph({ text: "", spacing: { before: 300, after: 100 } }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    new TableRow({
                      children: [
                        new TableCell({
                          shading: { fill: "7C3AED", type: ShadingType.SOLID, color: "7C3AED" },
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: "UNDERSTANDING YOUR CONDITION (FOR PATIENT)",
                                  bold: true,
                                  color: "FFFFFF",
                                  size: 24,
                                }),
                              ],
                              spacing: { before: 100, after: 100 },
                              indent: { left: 200 },
                            }),
                          ],
                          margins: { top: 100, bottom: 100, left: 200, right: 200 },
                        }),
                      ],
                    }),
                  ],
                }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  },
                  rows: [
                    new TableRow({
                      children: [
                        new TableCell({
                          shading: { fill: "FAF5FF", type: ShadingType.SOLID, color: "FAF5FF" },
                          children: consultation.patientSummary.aiGenerated.split('\n').map(line => {
                            // Parse markdown-style formatting
                            const isMainHeader = line.startsWith('## ');
                            const isSubHeader = line.startsWith('### ');
                            const isBullet = line.startsWith('• ');
                            const isBold = line.includes('**');
                            const isDisclaimer = line.startsWith('*') && line.endsWith('*');
                            const isDivider = line.startsWith('---');

                            if (isDivider) {
                              return new Paragraph({ text: "", spacing: { before: 100, after: 100 } });
                            }

                            if (isMainHeader) {
                              return new Paragraph({
                                children: [new TextRun({ text: line.replace('## ', ''), bold: true, size: 26, color: "7C3AED" })],
                                spacing: { before: 200, after: 100 },
                              });
                            }

                            if (isSubHeader) {
                              return new Paragraph({
                                children: [new TextRun({ text: line.replace('### ', ''), bold: true, size: 22, color: "1E3A5F" })],
                                spacing: { before: 150, after: 80 },
                              });
                            }

                            if (isBullet) {
                              return new Paragraph({
                                children: [new TextRun({ text: line, size: 20 })],
                                spacing: { before: 40, after: 40 },
                                indent: { left: 200 },
                              });
                            }

                            if (isDisclaimer) {
                              return new Paragraph({
                                children: [new TextRun({ text: line.replace(/\*/g, ''), italics: true, size: 18, color: "666666" })],
                                spacing: { before: 100, after: 50 },
                              });
                            }

                            if (isBold) {
                              const parts = line.split('**');
                              return new Paragraph({
                                children: parts.map((part, i) =>
                                  new TextRun({ text: part, bold: i % 2 === 1, size: 20 })
                                ),
                                spacing: { before: 40, after: 40 },
                              });
                            }

                            return new Paragraph({
                              children: [new TextRun({ text: line, size: 20 })],
                              spacing: { before: 40, after: 40 },
                            });
                          }),
                          margins: { left: 200, right: 200, top: 150, bottom: 150 },
                        }),
                      ],
                    }),
                  ],
                }),
              ] : []),

              // Signature Section
              new Paragraph({ text: "", spacing: { before: 600 } }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        children: [new Paragraph({ text: "" })],
                      }),
                      new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        children: [
                          new Paragraph({
                            children: [new TextRun({ text: "_____________________________", size: 22 })],
                            alignment: AlignmentType.CENTER,
                          }),
                          new Paragraph({
                            children: [new TextRun({ text: "Doctor's Signature & Stamp", italics: true, size: 20, color: "666666" })],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 100 },
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),

              // Footer
              new Paragraph({ text: "", spacing: { before: 400 } }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "This is a computer-generated document. Please consult your physician for any clarifications.",
                    italics: true,
                    size: 18,
                    color: "999999",
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Consultation_${consultation.patientId?.patientId || "Unknown"}_${new Date().toISOString().split("T")[0]}.docx`);
    } catch (error) {
      console.error("Error generating document:", error);
      alert("Failed to generate Word document");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">Loading consultation details...</p>
        </div>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-semibold text-xl mb-4">Consultation not found</p>
          <Link href="/tier2/dashboard">
            <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Back to Dashboard
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header with Actions */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Consultation Details</h1>
              <p className="text-gray-600 mt-1">
                Date: {new Date(consultation.consultationDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Toggle for AI Explanation in Download */}
              {consultation.patientSummary?.aiGenerated && (
                <label className="flex items-center space-x-2 bg-purple-50 px-4 py-2 rounded-lg border border-purple-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAiExplanation}
                    onChange={(e) => setIncludeAiExplanation(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <span className="text-sm text-purple-700 font-medium">Include AI Explanation</span>
                </label>
              )}
              <button
                onClick={generateWordDocument}
                disabled={downloading}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 transition-all shadow-lg flex items-center space-x-2 disabled:opacity-50"
              >
                {downloading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Download Report</span>
                  </>
                )}
              </button>
              <Link href={`/tier2/patients/${consultation.patientId._id}`}>
                <button className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-lg">
                  View Patient Profile
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Patient Information */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b">Patient Information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Patient ID</p>
              <p className="font-semibold text-gray-900">{consultation.patientId.patientId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Name</p>
              <p className="font-semibold text-gray-900">{consultation.patientInfo.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Age</p>
              <p className="font-semibold text-gray-900">{consultation.patientInfo.age} years</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Gender</p>
              <p className="font-semibold text-gray-900 capitalize">{consultation.patientInfo.gender}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-semibold text-gray-900">{consultation.patientId.phone}</p>
            </div>
            {consultation.patientId.email && (
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-semibold text-gray-900">{consultation.patientId.email}</p>
              </div>
            )}
            {consultation.patientInfo.complaint && (
              <div className="md:col-span-2">
                <p className="text-sm text-gray-600">Chief Complaint</p>
                <p className="font-semibold text-gray-900">{consultation.patientInfo.complaint}</p>
              </div>
            )}
          </div>
        </div>

        {/* Chief Complaint and History */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b">Chief Complaint & History</h2>
          <div className="space-y-4">
            {consultation.patientInfo.complaint && (
              <div>
                <p className="text-sm text-gray-600">Chief Complaint</p>
                <p className="font-semibold text-gray-900">{consultation.patientInfo.complaint}</p>
              </div>
            )}
            {consultation.patientInfo.duration && (
              <div>
                <p className="text-sm text-gray-600">Duration</p>
                <p className="font-semibold text-gray-900">{consultation.patientInfo.duration}</p>
              </div>
            )}
            {consultation.patientInfo.previousTreatment && (
              <div>
                <p className="text-sm text-gray-600">Previous Treatment</p>
                <p className="font-semibold text-gray-900">{consultation.patientInfo.previousTreatment}</p>
              </div>
            )}
          </div>
        </div>

        {/* Images */}
        {consultation.images && consultation.images.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b">Images</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {consultation.images.map((image, index) => (
                <div key={index} className="relative group">
                  <img
                    src={image.url}
                    alt={`${image.type} ${index + 1}`}
                    className="w-full h-48 object-cover rounded-lg border-2 border-gray-200 hover:border-blue-500 transition-colors cursor-pointer"
                    onClick={() => window.open(image.url, '_blank')}
                  />
                  <span className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    {image.type === "dermoscopic" ? "Dermoscope" : "Clinical"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clinical Examination */}
        {consultation.clinicalExamination && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b">Clinical Examination</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {consultation.clinicalExamination.lesionSite && (
                <div>
                  <p className="text-sm text-gray-600">Lesion Site</p>
                  <p className="font-semibold text-gray-900">{consultation.clinicalExamination.lesionSite}</p>
                </div>
              )}
              {consultation.clinicalExamination.morphology && (
                <div>
                  <p className="text-sm text-gray-600">Morphology</p>
                  <p className="font-semibold text-gray-900">{consultation.clinicalExamination.morphology}</p>
                </div>
              )}
              {consultation.clinicalExamination.distribution && (
                <div>
                  <p className="text-sm text-gray-600">Distribution</p>
                  <p className="font-semibold text-gray-900">{consultation.clinicalExamination.distribution}</p>
                </div>
              )}
              {consultation.clinicalExamination.severity && (
                <div>
                  <p className="text-sm text-gray-600">Severity</p>
                  <p className="font-semibold text-gray-900">{consultation.clinicalExamination.severity}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dermoscopic Findings */}
        {consultation.dermoscopeFindings?.finalInterpretation && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b">Dermoscopic Findings</h2>
            <p className="text-gray-900">{consultation.dermoscopeFindings.finalInterpretation}</p>
          </div>
        )}

        {/* Diagnosis & Treatment */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {consultation.diagnosis && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b">Diagnosis</h2>
              {consultation.diagnosis.provisional && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600">Provisional Diagnosis</p>
                  <p className="font-semibold text-gray-900">{consultation.diagnosis.provisional}</p>
                </div>
              )}
              {consultation.diagnosis.differentials && consultation.diagnosis.differentials.length > 0 && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">Differential Diagnosis</p>
                  <ul className="list-disc list-inside space-y-1">
                    {consultation.diagnosis.differentials.map((diff, index) => (
                      <li key={index} className="text-gray-900">{diff}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {consultation.treatmentPlan && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b">Treatment Plan</h2>
              {consultation.treatmentPlan.topicals && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600">Topical Medications</p>
                  <p className="font-semibold text-gray-900">{consultation.treatmentPlan.topicals}</p>
                </div>
              )}
              {consultation.treatmentPlan.orals && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600">Oral Medications</p>
                  <p className="font-semibold text-gray-900">{consultation.treatmentPlan.orals}</p>
                </div>
              )}
              {consultation.treatmentPlan.lifestyleChanges && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600">Lifestyle Advice</p>
                  <p className="font-semibold text-gray-900">{consultation.treatmentPlan.lifestyleChanges}</p>
                </div>
              )}
              {consultation.treatmentPlan.investigations && (
                <div>
                  <p className="text-sm text-gray-600">Investigations</p>
                  <p className="font-semibold text-gray-900">{consultation.treatmentPlan.investigations}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Follow-up */}
        {consultation.followUp?.date && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b">Follow-up</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Follow-up Date</p>
                <p className="font-semibold text-gray-900">{new Date(consultation.followUp.date).toLocaleDateString()}</p>
              </div>
              {consultation.followUp.reason && (
                <div>
                  <p className="text-sm text-gray-600">Reason</p>
                  <p className="font-semibold text-gray-900">{consultation.followUp.reason}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Patient Explanation */}
        {consultation.patientSummary?.aiGenerated ? (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl shadow-lg p-6 mb-6 border border-purple-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-purple-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-purple-900">Understanding Your Condition</h2>
                  <p className="text-sm text-purple-600">AI-Generated Patient Explanation</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">
                For Patient
              </span>
            </div>
            <div className="prose prose-purple max-w-none">
              {consultation.patientSummary.aiGenerated.split('\n').map((line, index) => {
                if (line.startsWith('## ')) {
                  return (
                    <h3 key={index} className="text-xl font-bold text-purple-800 mt-4 mb-2">
                      {line.replace('## ', '')}
                    </h3>
                  );
                }
                if (line.startsWith('### ')) {
                  return (
                    <h4 key={index} className="text-lg font-semibold text-gray-800 mt-3 mb-2">
                      {line.replace('### ', '')}
                    </h4>
                  );
                }
                if (line.startsWith('• ')) {
                  return (
                    <p key={index} className="text-gray-700 ml-4 my-1">
                      {line}
                    </p>
                  );
                }
                if (line.startsWith('---')) {
                  return <hr key={index} className="my-4 border-purple-200" />;
                }
                if (line.startsWith('*') && line.endsWith('*')) {
                  return (
                    <p key={index} className="text-sm text-gray-500 italic mt-4">
                      {line.replace(/\*/g, '')}
                    </p>
                  );
                }
                if (line.includes('**')) {
                  const parts = line.split('**');
                  return (
                    <p key={index} className="text-gray-700 my-1">
                      {parts.map((part, i) => (
                        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                      ))}
                    </p>
                  );
                }
                if (line.trim()) {
                  return (
                    <p key={index} className="text-gray-700 my-1">
                      {line}
                    </p>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ) : (
          /* Show button to generate AI explanation for existing consultations */
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl shadow-lg p-6 mb-6 border border-purple-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-400 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-purple-900">AI Patient Explanation</h2>
                  <p className="text-sm text-purple-600">Generate a patient-friendly explanation for this consultation</p>
                </div>
              </div>
              <button
                onClick={generateAiExplanation}
                disabled={generatingExplanation}
                className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all shadow-lg flex items-center space-x-2 disabled:opacity-50"
              >
                {generatingExplanation ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Generate Explanation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Back Button */}
        <div className="flex justify-center">
          <Link href={`/tier2/patients/${consultation.patientId._id}`}>
            <button className="px-8 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-all">
              Back to Patient Profile
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
