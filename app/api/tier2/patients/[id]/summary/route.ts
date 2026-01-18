/**
 * AI Patient Visit Summary API
 * Generates an AI-powered summary of the patient's recent visits
 * Uses free Hugging Face Inference API with open-source models
 */

import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import Patient from "@/models/Patient";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        { success: false, message: "This endpoint is only for Tier 2 users" },
        { status: 403 }
      );
    }

    const { id: patientId } = await params;

    await connectDB();

    // Fetch patient details
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return NextResponse.json(
        { success: false, message: "Patient not found" },
        { status: 404 }
      );
    }

    // Fetch last 5 consultations for this patient
    const consultations = await ConsultationDermatology.find({
      patientId: patientId,
      clinicId: authUser.clinicId,
    })
      .sort({ consultationDate: -1 })
      .limit(5)
      .lean();

    if (consultations.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          summary: "No previous visits found for this patient. This appears to be a new patient or their first dermatology consultation at this clinic.",
          visitCount: 0,
          hasData: false,
        },
      });
    }

    // Prepare consultation data for AI summary
    const visitSummaries = consultations.map((consultation: any, index: number) => {
      const date = new Date(consultation.consultationDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      return `
Visit ${index + 1} (${date}):
- Chief Complaint: ${consultation.patientInfo?.complaint || "Not recorded"}
- Duration: ${consultation.patientInfo?.duration || "Not specified"}
- Lesion Site: ${consultation.clinicalExamination?.lesionSite || "Not recorded"}
- Morphology: ${consultation.clinicalExamination?.morphology || "Not recorded"}
- Severity: ${consultation.clinicalExamination?.severity || "Not assessed"}
- Provisional Diagnosis: ${consultation.diagnosis?.provisional || "Not recorded"}
- Differential Diagnosis: ${consultation.diagnosis?.differentials?.join(", ") || "None"}
- Topical Treatment: ${consultation.treatmentPlan?.topicals || "None prescribed"}
- Oral Treatment: ${consultation.treatmentPlan?.orals || "None prescribed"}
- Lifestyle Advice: ${consultation.treatmentPlan?.lifestyleChanges || "None given"}
- Dermoscopic Findings: ${consultation.dermoscopeFindings?.finalInterpretation || "Not recorded"}
${consultation.followUp?.reason ? `- Follow-up Reason: ${consultation.followUp.reason}` : ""}
`.trim();
    });

    const patientContext = `
Patient: ${patient.name}
Age: ${patient.age} years
Gender: ${patient.gender}
${patient.medicalHistory ? `Medical History: ${patient.medicalHistory}` : ""}
${patient.allergies?.length > 0 ? `Known Allergies: ${patient.allergies.join(", ")}` : ""}

Recent Visits (${consultations.length} total):
${visitSummaries.join("\n\n")}
`;

    // Generate summary using Hugging Face Inference API (free tier)
    const prompt = `You are a medical assistant helping a dermatologist. Based on the patient visit data below, provide a concise clinical summary.

${patientContext}

Provide a summary with these sections:
1. **Patient Overview**: Brief description of patient and skin health pattern
2. **Primary Conditions**: Conditions treated
3. **Treatment History**: Treatments tried
4. **Key Observations**: Patterns or recurring issues
5. **Recommendations**: What doctor should consider

Be professional and concise. Use bullet points.

Summary:`;

    let summaryText = "";

    try {
      // Try Hugging Face Inference API with Mistral model (free)
      const hfResponse = await fetch(
        "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // HF allows limited free inference without API key
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 500,
              temperature: 0.7,
              return_full_text: false,
            },
          }),
        }
      );

      if (hfResponse.ok) {
        const hfData = await hfResponse.json();
        if (Array.isArray(hfData) && hfData[0]?.generated_text) {
          summaryText = hfData[0].generated_text;
        }
      }
    } catch (hfError) {
      console.log("HuggingFace API not available, using local summary generation");
    }

    // Fallback: Generate structured summary locally if API fails
    if (!summaryText) {
      summaryText = generateLocalSummary(patient, consultations);
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: summaryText,
        visitCount: consultations.length,
        hasData: true,
        lastVisit: consultations[0]?.consultationDate,
        patientName: patient.name,
      },
    });
  } catch (error: any) {
    console.error("AI Summary error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate AI summary",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// Local summary generation function (no external API needed)
function generateLocalSummary(patient: any, consultations: any[]): string {
  const diagnoses = new Set<string>();
  const treatments = {
    topicals: new Set<string>(),
    orals: new Set<string>(),
  };
  const complaints = new Set<string>();
  const severities: string[] = [];

  consultations.forEach((c: any) => {
    if (c.diagnosis?.provisional) diagnoses.add(c.diagnosis.provisional);
    if (c.diagnosis?.differentials) {
      c.diagnosis.differentials.forEach((d: string) => diagnoses.add(d));
    }
    if (c.treatmentPlan?.topicals) treatments.topicals.add(c.treatmentPlan.topicals);
    if (c.treatmentPlan?.orals) treatments.orals.add(c.treatmentPlan.orals);
    if (c.patientInfo?.complaint) complaints.add(c.patientInfo.complaint);
    if (c.clinicalExamination?.severity) severities.push(c.clinicalExamination.severity);
  });

  const latestVisit = consultations[0];
  const oldestVisit = consultations[consultations.length - 1];

  const dateRange = consultations.length > 1
    ? `from ${new Date(oldestVisit.consultationDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} to ${new Date(latestVisit.consultationDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`
    : `on ${new Date(latestVisit.consultationDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;

  let summary = `**Patient Overview**
- ${patient.name}, ${patient.age}-year-old ${patient.gender}
- ${consultations.length} dermatology consultation(s) ${dateRange}
${patient.medicalHistory ? `- Medical History: ${patient.medicalHistory}` : ""}
${patient.allergies?.length > 0 ? `- Known Allergies: ${patient.allergies.join(", ")}` : ""}

**Primary Conditions**
${Array.from(diagnoses).length > 0
  ? Array.from(diagnoses).map(d => `- ${d}`).join("\n")
  : "- No specific diagnosis recorded"}

**Chief Complaints**
${Array.from(complaints).length > 0
  ? Array.from(complaints).map(c => `- ${c}`).join("\n")
  : "- No complaints recorded"}

**Treatment History**
${Array.from(treatments.topicals).length > 0
  ? `Topical Medications:\n${Array.from(treatments.topicals).map(t => `- ${t}`).join("\n")}`
  : "No topical treatments recorded"}

${Array.from(treatments.orals).length > 0
  ? `\nOral Medications:\n${Array.from(treatments.orals).map(o => `- ${o}`).join("\n")}`
  : ""}

**Key Observations**
- Severity trend: ${severities.length > 0 ? severities.join(" → ") : "Not assessed"}
- Latest complaint: ${latestVisit.patientInfo?.complaint || "Not recorded"}
- Latest diagnosis: ${latestVisit.diagnosis?.provisional || "Not recorded"}
${latestVisit.followUp?.reason ? `- Previous follow-up note: ${latestVisit.followUp.reason}` : ""}`;

  return summary;
}
