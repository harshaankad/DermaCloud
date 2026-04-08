/**
 * API endpoint to generate AI explanation for existing consultations
 * Streams the response progressively using Claude Sonnet
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { connectDB } from "@/lib/db/connection";
import ConsultationDermatology from "@/models/ConsultationDermatology";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatMedicines(prescription?: any[], topicals?: string, orals?: string): string[] {
  const items: string[] = [];
  if (Array.isArray(prescription)) {
    for (const med of prescription) {
      if (med.name?.trim()) {
        const parts = [med.name.trim()];
        if (med.dosage) parts.push(med.dosage);
        if (med.route) parts.push(`(${med.route})`);
        if (med.frequency) parts.push(`— ${med.frequency}`);
        if (med.duration) parts.push(`for ${med.duration}`);
        if (med.instructions) parts.push(`[${med.instructions}]`);
        items.push(parts.join(" "));
      }
    }
  }
  if (topicals) items.push(...topicals.split(/[,;\n\r]+/).map((m: string) => m.trim()).filter(Boolean).map((m: string) => `${m} (topical)`));
  if (orals) items.push(...orals.split(/[,;\n\r]+/).map((m: string) => m.trim()).filter(Boolean).map((m: string) => `${m} (oral)`));
  return items;
}

/** Collect all non-empty fields from formData into a readable block */
function collectAllFields(fd: Record<string, any>, skipKeys: string[] = []): string {
  const skip = new Set(["_multiIssue", "_issues", "prescription", ...skipKeys]);
  const lines: string[] = [];
  for (const [key, val] of Object.entries(fd)) {
    if (skip.has(key) || !val) continue;
    if (typeof val === "string" && !val.trim()) continue;
    if (Array.isArray(val)) continue; // prescription handled separately
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    lines.push(`- ${label}: ${val}`);
  }
  return lines.join("\n");
}

// ── Single-issue prompt ───────────────────────────────────────────────────────

function buildSingleIssuePrompt(consultation: any): string {
  // Gather all form data from customFields
  const cf = consultation.customFields || {};
  const fd = cf._issues?.[0]?.formData || cf;
  const allFields = collectAllFields(fd);

  // Also include structured top-level fields as fallback
  const pi = consultation.patientInfo || {};
  const ce = consultation.clinicalExamination || {};
  const tp = consultation.treatmentPlan || {};
  const diag = consultation.diagnosis || {};

  const complaint = fd.complaint || pi.complaint || "";
  const diagnosis = fd.provisional || diag.provisional || "";

  const prescription = fd.prescription || cf.prescription;
  const meds = formatMedicines(prescription, fd.topicals || tp.topicals, fd.orals || tp.orals);
  const medCount = meds.length;
  const numberedMeds = meds.map((m, i) => `  ${i + 1}. ${m}`).join("\n");

  return `You are a warm AI health companion speaking directly to a patient after their dermatology visit. Be concise, warm, and specific.

FULL CONSULTATION DATA:
${allFields || "No additional details recorded."}
${complaint ? `- Chief Complaint: ${complaint}` : ""}
${diagnosis ? `- Diagnosis: ${diagnosis}` : ""}
${ce.lesionSite ? `- Lesion Site: ${ce.lesionSite}` : ""}
${ce.morphology ? `- Morphology: ${ce.morphology}` : ""}
${ce.severity ? `- Severity: ${ce.severity}` : ""}

${medCount > 0 ? `PRESCRIBED MEDICINES (${medCount}):\n${numberedMeds}` : "No medicines prescribed."}

STRICT LIMIT: 500 words total. Complete all sections. Do not exceed.

Write in this exact structure:

Opening (NO heading — 2 sentences max):
"Hi! I am your AI health companion." Acknowledge their complaint warmly.

## What's Happening With Your Skin? (70 words max)
Plain language explanation of the condition, what's happening, and reassurance.

## Why Did This Happen? (4 bullets, 15 words each max)
Specific causes/triggers for this condition. Start each with •.

## How Your Medicines Help
${medCount > 0
  ? `EXACTLY ${medCount} bullet(s) — one per medicine. Use exact names from the list. 20 words max each. Start with •.`
  : "3 specific skincare tips for this condition. Start each with •. 15 words max each."}

## Your Recovery Journey (4 bullets, 15 words each max)
Actionable home care tips. Start each with •.

End with:
---
*I am your AI health companion. This was prepared to help you understand your condition. Follow your doctor's instructions and bring questions to your next visit.*

Rules:
- Analyse ALL the consultation data above to make your response specific and personalised
- Use "you"/"your" — speak TO the patient
- No jargon without plain explanation
- ONLY mention medicines from the list — accuracy is critical
- Complete all sections and end with the disclaimer
- Do NOT use emojis anywhere in the response
- 500 WORDS MAX — hard cap`;
}

// ── Multi-issue prompt ────────────────────────────────────────────────────────

function buildMultiIssuePrompt(issues: any[]): string {
  const N = issues.length;

  const contextBlock = issues.map((issue, idx) => {
    const fd = issue.formData || {};
    const allFields = collectAllFields(fd);
    const diagnosis = fd.provisional || fd.provisionalDiagnosis || `Condition ${idx + 1}`;
    const meds = formatMedicines(fd.prescription, fd.topicals, fd.orals);
    return `ISSUE ${idx + 1} — ${issue.label || diagnosis}:
${allFields || "  No additional details."}
  Medicines (${meds.length}): ${meds.length > 0 ? meds.map((m, i) => `${i + 1}. ${m}`).join(", ") : "None"}`;
  }).join("\n\n");

  const structureBlock = issues.map((issue, idx) => {
    const fd = issue.formData || {};
    const diagnosis = fd.provisional || fd.provisionalDiagnosis || `Condition ${idx + 1}`;
    const meds = formatMedicines(fd.prescription, fd.topicals, fd.orals);
    const mCount = meds.length;
    const numberedMeds = meds.map((m, i) => `    ${i + 1}. ${m}`).join("\n");

    return `## Issue ${idx + 1}: ${diagnosis}

### What's Happening? (50 words max)
Plain language explanation. One reassuring sentence.

### Why Did This Happen? (3 bullets, 15 words each max)
Specific causes. Start each with •.

### How Your Medicines Help
${mCount > 0
  ? `EXACTLY ${mCount} bullet(s), one per medicine in order:\n${numberedMeds}\n20 words max each. Start with •. Do NOT invent medicines.`
  : "2 skincare tips for this condition. Start each with •. 15 words max each."}

### Recovery Tips (3 bullets, 15 words each max)
Actionable home care. Start each with •.`;
  }).join("\n\n---\n\n");

  return `You are a warm AI health companion speaking to a patient after their dermatology visit. They had ${N} skin conditions today. Be concise and specific.

FULL CONSULTATION DATA:
${contextBlock}

STRICT LIMIT: 700 words total. Complete ALL sections for ALL issues. Do not exceed.

Opening (NO heading — 2 sentences max):
"Hi! I am your AI health companion." Name each condition briefly.

${structureBlock}

End with:
---
*I am your AI health companion. This was prepared to help you understand your conditions. Follow your doctor's instructions and bring questions to your next visit.*

Rules:
- Analyse ALL consultation data above — be specific to each condition, not generic
- Use "you"/"your" — speak TO the patient
- ONLY mention medicines from the lists — accuracy is critical
- Complete every section for every issue and end with disclaimer
- Do NOT use emojis anywhere in the response
- 700 WORDS MAX — hard cap`;
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────

function buildPrompt(consultation: any): string {
  const isMultiIssue =
    consultation.customFields?._multiIssue === true &&
    Array.isArray(consultation.customFields?._issues) &&
    consultation.customFields._issues.length > 1;

  return isMultiIssue
    ? buildMultiIssuePrompt(consultation.customFields._issues)
    : buildSingleIssuePrompt(consultation);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { consultationId } = body;

    if (!consultationId) {
      return NextResponse.json(
        { success: false, message: "Consultation ID is required" },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "your-anthropic-api-key-here") {
      return NextResponse.json(
        { success: false, message: "AI explanation is not configured. Please set ANTHROPIC_API_KEY in your environment." },
        { status: 503 }
      );
    }

    await connectDB();

    const consultation = await ConsultationDermatology.findById(consultationId);

    if (!consultation) {
      return NextResponse.json(
        { success: false, message: "Consultation not found" },
        { status: 404 }
      );
    }

    const prompt = buildPrompt(consultation);

    // Start streaming from Anthropic
    const anthropicStream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Stream text chunks to client as they arrive
          for await (const chunk of anthropicStream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }

          // After stream ends, get full text and save to DB
          const finalMessage = await anthropicStream.finalMessage();
          const fullText =
            finalMessage.content[0]?.type === "text"
              ? finalMessage.content[0].text
              : "";

          consultation.patientSummary = {
            aiGenerated: fullText,
            doctorEdited: consultation.patientSummary?.doctorEdited,
          };
          await consultation.save();

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    console.error("Generate explanation error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate AI explanation", error: error.message },
      { status: 500 }
    );
  }
}
