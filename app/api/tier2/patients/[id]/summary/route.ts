/**
 * AI Patient Visit Summary API
 * Streams a concise, doctor-friendly patient briefing using Claude
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import Patient from "@/models/Patient";
import User from "@/models/User";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) return authResult;

    const { user: authUser } = authResult;

    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        { success: false, message: "This endpoint is only for Tier 2 users" },
        { status: 403 }
      );
    }

    const { id: patientId } = await params;

    await connectDB();

    // Fetch doctor name + patient in parallel
    const [patient, doctorUser] = await Promise.all([
      Patient.findById(patientId).lean(),
      User.findById(authUser.userId).lean(),
    ]);

    if (!patient) {
      return NextResponse.json(
        { success: false, message: "Patient not found" },
        { status: 404 }
      );
    }

    const doctorName = (doctorUser as any)?.name || "Doctor";
    // Use first name only for the greeting
    const doctorFirstName = doctorName.split(" ")[0];

    // Fetch consultations (last 5 each)
    const [dermatologyConsultations, cosmetologyConsultations] = await Promise.all([
      ConsultationDermatology.find({ patientId, clinicId: authUser.clinicId })
        .sort({ consultationDate: -1 })
        .limit(5)
        .lean(),
      ConsultationCosmetology.find({ patientId, clinicId: authUser.clinicId })
        .sort({ consultationDate: -1 })
        .limit(5)
        .lean(),
    ]);

    const totalVisits = dermatologyConsultations.length + cosmetologyConsultations.length;

    // Merge and sort visits chronologically (newest first)
    const allVisits = [
      ...dermatologyConsultations.map((c: any) => ({ ...c, visitType: "dermatology" })),
      ...cosmetologyConsultations.map((c: any) => ({ ...c, visitType: "cosmetology" })),
    ].sort(
      (a, b) =>
        new Date(b.consultationDate).getTime() - new Date(a.consultationDate).getTime()
    );

    const lastVisitDate = allVisits[0]?.consultationDate || null;
    const patientSince = allVisits.length > 0
      ? formatDate(allVisits[allVisits.length - 1].consultationDate)
      : null;

    // Build per-visit summaries with full detail
    const visitLines = allVisits.slice(0, 5).map((v: any) => {
      const date = formatDate(v.consultationDate);
      if (v.visitType === "dermatology") {
        const followUpReason = v.followUp?.reason;
        const followUpDate   = v.followUp?.date ? formatDate(v.followUp.date) : null;
        const previousTx     = v.patientInfo?.previousTreatment;

        // ── Multi-issue: loop through each condition ──────────────────────────
        if (
          v.customFields?._multiIssue === true &&
          Array.isArray(v.customFields?._issues) &&
          v.customFields._issues.length > 1
        ) {
          const lines: string[] = [
            `${date} [Dermatology — ${v.customFields._issues.length} conditions]`,
          ];
          if (previousTx) lines.push(`  Previous treatment: ${previousTx}`);

          v.customFields._issues.forEach((issue: any, idx: number) => {
            const fd          = issue.formData || {};
            const issueLabel  = issue.label || `Issue ${idx + 1}`;
            const diagnosis   = fd.provisional || fd.provisionalDiagnosis || "";
            const complaint   = fd.complaint   || fd.chiefComplaint || "";
            const duration    = fd.duration    || "";
            const severity    = fd.severity    || "";
            const lesionSite  = fd.lesionSite  || "";
            const morphology  = fd.morphology  || "";
            const dermoscopy  = fd.finalInterpretation || fd.dermoscopicFindings || "";
            const topicals    = fd.topicals    || fd.topicalMedications || "";
            const orals       = fd.orals       || fd.oralMedications    || "";
            const lifestyle   = fd.lifestyleChanges || fd.lifestyleAdvice || "";
            const investigations = fd.investigations || "";
            const differentials  = fd.differentials  || fd.differentialDiagnosis || "";

            lines.push(`  ${issueLabel}${diagnosis ? `: ${diagnosis}` : ""}`);
            if (complaint || duration || severity) {
              const sub: string[] = [];
              if (complaint) sub.push(complaint);
              if (duration)  sub.push(`for ${duration}`);
              if (severity)  sub.push(`(${severity})`);
              lines.push(`    Complaint: ${sub.join(" ")}`);
            }
            if (lesionSite || morphology) {
              const sub: string[] = [];
              if (lesionSite) sub.push(`Site: ${lesionSite}`);
              if (morphology) sub.push(`Morphology: ${morphology}`);
              lines.push(`    Findings: ${sub.join(" · ")}`);
            }
            if (dermoscopy) lines.push(`    Dermoscopy: ${dermoscopy}`);
            if (diagnosis || differentials) {
              const sub: string[] = [];
              if (diagnosis)    sub.push(diagnosis);
              if (differentials) sub.push(`DDx: ${differentials}`);
              lines.push(`    Diagnosis: ${sub.join(" · ")}`);
            }
            const meds: string[] = [];
            if (topicals) meds.push(`Topicals: ${topicals}`);
            if (orals)    meds.push(`Orals: ${orals}`);
            if (meds.length) lines.push(`    Treatment: ${meds.join(" · ")}`);
            if (lifestyle)     lines.push(`    Lifestyle: ${lifestyle}`);
            if (investigations) lines.push(`    Investigations: ${investigations}`);
          });

          if (followUpReason || followUpDate) {
            const fu: string[] = [];
            if (followUpReason) fu.push(followUpReason);
            if (followUpDate)   fu.push(`on ${followUpDate}`);
            lines.push(`  Follow-up: ${fu.join(" ")}`);
          }
          return lines.join("\n");
        }

        // ── Single-issue (original behaviour) ────────────────────────────────
        const complaint     = v.patientInfo?.complaint;
        const duration      = v.patientInfo?.duration;
        const lesionSite    = v.clinicalExamination?.lesionSite;
        const morphology    = v.clinicalExamination?.morphology;
        const severity      = v.clinicalExamination?.severity;
        const diagnosis     = v.diagnosis?.provisional;
        const differentials = v.diagnosis?.differentials?.filter(Boolean).join(", ");
        const dermoscopy    = v.dermoscopeFindings?.finalInterpretation;
        const topicals      = v.treatmentPlan?.topicals;
        const orals         = v.treatmentPlan?.orals;
        const lifestyle     = v.treatmentPlan?.lifestyleChanges;
        const investigations = v.treatmentPlan?.investigations;

        const lines: string[] = [`${date} [Dermatology]`];
        if (complaint || duration || severity) {
          const sub: string[] = [];
          if (complaint) sub.push(complaint);
          if (duration) sub.push(`for ${duration}`);
          if (severity) sub.push(`(${severity})`);
          lines.push(`  Complaint: ${sub.join(" ")}`);
        }
        if (lesionSite || morphology) {
          const sub: string[] = [];
          if (lesionSite) sub.push(`Site: ${lesionSite}`);
          if (morphology) sub.push(`Morphology: ${morphology}`);
          lines.push(`  Findings: ${sub.join(" · ")}`);
        }
        if (dermoscopy) lines.push(`  Dermoscopy: ${dermoscopy}`);
        if (previousTx) lines.push(`  Previous treatment: ${previousTx}`);
        if (diagnosis || differentials) {
          const sub: string[] = [];
          if (diagnosis) sub.push(diagnosis);
          if (differentials) sub.push(`DDx: ${differentials}`);
          lines.push(`  Diagnosis: ${sub.join(" · ")}`);
        }
        const meds: string[] = [];
        if (topicals) meds.push(`Topicals: ${topicals}`);
        if (orals) meds.push(`Orals: ${orals}`);
        if (meds.length) lines.push(`  Treatment: ${meds.join(" · ")}`);
        if (lifestyle) lines.push(`  Lifestyle: ${lifestyle}`);
        if (investigations) lines.push(`  Investigations: ${investigations}`);
        if (followUpReason || followUpDate) {
          const fu: string[] = [];
          if (followUpReason) fu.push(followUpReason);
          if (followUpDate) fu.push(`on ${followUpDate}`);
          lines.push(`  Follow-up: ${fu.join(" ")}`);
        }

        return lines.join("\n");
      } else {
        // ── Multi-issue cosmetology ───────────────────────────────────────────
        if (
          v.customFields?._multiIssue === true &&
          Array.isArray(v.customFields?._issues) &&
          v.customFields._issues.length > 1
        ) {
          const lines: string[] = [
            `${date} [Cosmetology — ${v.customFields._issues.length} conditions]`,
          ];

          v.customFields._issues.forEach((issue: any, idx: number) => {
            const fd = issue.formData || {};
            const concern       = fd.primaryConcern || "";
            const skinType      = fd.skinType || "";
            const procedure     = fd.procedureName || fd.name || "";
            const session       = fd.sessionNumber || "";
            const goals         = fd.goals || "";
            const outcome       = fd.immediateOutcome || "";
            const findings      = fd.findings || "";
            const diagnosis     = fd.diagnosis || "";
            const homeProducts  = fd.homeProducts || "";
            const expectedResults = fd.expectedResults || "";
            const followUpDate  = fd.followUpDate ? formatDate(fd.followUpDate) : null;

            const issueLabel = issue.label || `Issue ${idx + 1}`;
            lines.push(`  ${issueLabel}${concern ? `: ${concern}` : ""}`);
            if (concern || skinType) {
              const sub: string[] = [];
              if (concern) sub.push(concern);
              if (skinType) sub.push(`skin type: ${skinType}`);
              lines.push(`    Concern: ${sub.join(" · ")}`);
            }
            if (procedure || session || goals) {
              const sub: string[] = [];
              if (procedure) sub.push(procedure);
              if (session) sub.push(`session ${session}`);
              if (goals) sub.push(`Goals: ${goals}`);
              lines.push(`    Procedure: ${sub.join(" · ")}`);
            }
            if (findings || diagnosis) {
              const sub: string[] = [];
              if (findings) sub.push(findings);
              if (diagnosis) sub.push(`Dx: ${diagnosis}`);
              lines.push(`    Assessment: ${sub.join(" · ")}`);
            }
            if (outcome)          lines.push(`    Outcome: ${outcome}`);
            if (homeProducts)     lines.push(`    Home products: ${homeProducts}`);
            if (expectedResults)  lines.push(`    Expected results: ${expectedResults}`);
            if (followUpDate)     lines.push(`    Follow-up: ${followUpDate}`);
          });

          return lines.join("\n");
        }

        // ── Single-issue cosmetology ──────────────────────────────────────────
        const concern = v.patientInfo?.primaryConcern;
        const skinType = v.patientInfo?.skinType;
        const skinCondition = v.patientInfo?.skinCondition;
        const procedure = v.procedure?.name;
        const session = v.procedure?.sessionNumber;
        const goals = v.procedure?.goals;
        const outcome = v.procedure?.immediateOutcome;
        const findings = v.assessment?.findings;
        const diagnosis = v.assessment?.diagnosis;
        const aftercare = v.aftercare?.instructions;
        const homeProducts = v.aftercare?.homeProducts;
        const expectedResults = v.aftercare?.expectedResults;
        const followUpDate = v.aftercare?.followUpDate ? formatDate(v.aftercare.followUpDate) : null;

        const lines: string[] = [`${date} [Cosmetology]`];
        if (concern || skinType || skinCondition) {
          const sub: string[] = [];
          if (concern) sub.push(concern);
          if (skinType) sub.push(`skin type: ${skinType}`);
          if (skinCondition) sub.push(`condition: ${skinCondition}`);
          lines.push(`  Concern: ${sub.join(" · ")}`);
        }
        if (procedure || session || goals) {
          const sub: string[] = [];
          if (procedure) sub.push(procedure);
          if (session) sub.push(`session ${session}`);
          if (goals) sub.push(`Goals: ${goals}`);
          lines.push(`  Procedure: ${sub.join(" · ")}`);
        }
        if (findings || diagnosis) {
          const sub: string[] = [];
          if (findings) sub.push(findings);
          if (diagnosis) sub.push(`Dx: ${diagnosis}`);
          lines.push(`  Assessment: ${sub.join(" · ")}`);
        }
        if (outcome) lines.push(`  Outcome: ${outcome}`);
        if (aftercare) lines.push(`  Aftercare: ${aftercare}`);
        if (homeProducts) lines.push(`  Home products: ${homeProducts}`);
        if (expectedResults) lines.push(`  Expected results: ${expectedResults}`);
        if (followUpDate) lines.push(`  Follow-up: ${followUpDate}`);

        return lines.join("\n");
      }
    });

    const patientData = patient as any;

    // Build patient context for prompt
    const allergyLine = patientData.allergies?.length > 0
      ? `Known allergies: ${patientData.allergies.join(", ")}`
      : null;
    const medHistoryLine = patientData.medicalHistory
      ? `Medical history: ${patientData.medicalHistory}`
      : null;

    const prompt = `You are briefing a dermatologist/cosmetologist the moment their patient walks in. Write a warm, well-organised doctor briefing that covers the patient's full visit history in a way that is easy and enjoyable to read.

Doctor: ${doctorFirstName}
Greeting time: ${getGreeting()}
Patient name: ${patientData.name}
Patient age: ${patientData.age} years
Patient gender: ${patientData.gender}
${patientSince ? `Patient since: ${patientSince}` : "New patient — first visit"}
${allergyLine ? allergyLine : "No known allergies"}
${medHistoryLine ? medHistoryLine : "No significant medical history"}

Visit history (${totalVisits} total visits):
${visitLines.length > 0 ? visitLines.join("\n\n") : "No previous visits — this is their first consultation."}

Write the briefing using EXACTLY this format — nothing more, nothing less:

[Single opening line — warm and personal. Greet Dr. ${doctorFirstName} by name, mention the patient's name, and note how many visits they've had (or that it's their first visit). One sentence only, no heading.]

**Patient at a Glance**
[3–5 bullets covering: age + gender, patient-since date, allergies if any, medical history if any. Skip empty fields entirely.]

**Visit History**
[For each visit, write the header line exactly as given (e.g. "15 Jan 2025 [Dermatology]") with no bullet. Then:
- If it is a SINGLE-condition visit: on the very next line write one flowing paragraph covering complaint, duration, findings, diagnosis, medicines, and follow-up as natural readable sentences. No labels, no indentation, no bullet points.
- If it is a MULTI-condition visit (header contains "conditions", e.g. "15 Jan 2025 [Dermatology — 2 conditions]" or "15 Jan 2025 [Cosmetology — 2 conditions]"): write each issue as a separate short paragraph prefixed with its label in bold, e.g. "**Issue 1 — Acne:**" or "**Issue 1 — Pigmentation:**" followed by a flowing sentence or two covering concern, procedure, outcome. Keep each paragraph concise. Separate the issue paragraphs with a blank line.
Separate visits from each other with a blank line. If no visits: "No previous visits on record — this is their first consultation."]

Strict rules:
- Opening line has NO markdown heading — plain warm text
- Section headers use exactly **bold double stars** like shown
- Patient at a Glance bullets start with •
- Single-condition visit: date header + one plain paragraph — no bullets, no labels, no indentation
- Multi-condition visit: date header + one bold-labelled paragraph per issue — use **Issue N — Diagnosis:** prefix for each
- Skip any field that has no real data — never write "Not recorded", "None", or "N/A"
- Use exact medicine names, diagnosis names, and procedure names from the data
- Dates in "DD Mon YYYY" format
- No disclaimers, no AI notices, no closing remarks`;

    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "your-anthropic-api-key-here") {
      return NextResponse.json(
        { success: false, message: "AI summary is not configured." },
        { status: 503 }
      );
    }

    // Track this AI call per calendar month (fire-and-forget — don't await)
    const _now = new Date();
    const _ym  = `${_now.getFullYear()}_${String(_now.getMonth() + 1).padStart(2, "0")}`;
    User.findByIdAndUpdate(authUser.userId, {
      $inc: { [`aiPatientSummaries.${_ym}`]: 1 },
    }).catch(() => {});

    // Stream from Anthropic progressively
    const anthropicStream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of anthropicStream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (err: any) {
          if (err?.status === 529 || err?.message?.includes("overloaded")) {
            controller.enqueue(encoder.encode("\n\n[AI service is currently busy. Please try again in a moment.]"));
            controller.close();
          } else {
            controller.error(err);
          }
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "X-Visit-Count": String(totalVisits),
        "X-Last-Visit": lastVisitDate ? new Date(lastVisitDate).toISOString() : "",
        "X-Patient-Name": patientData.name,
      },
    });
  } catch (error: any) {
    console.error("AI Summary error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate AI summary", error: error.message },
      { status: 500 }
    );
  }
}
