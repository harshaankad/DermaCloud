/**
 * API endpoint to generate AI patient explanation for cosmetology consultations
 * Streams the response progressively using Claude Sonnet
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatMedicines(prescription?: any[]): string[] {
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
  return items;
}

/** Collect all non-empty fields from formData into a readable block */
function collectAllFields(fd: Record<string, any>, skipKeys: string[] = []): string {
  const skip = new Set(["_multiIssue", "_issues", "prescription", ...skipKeys]);
  const lines: string[] = [];
  for (const [key, val] of Object.entries(fd)) {
    if (skip.has(key) || !val) continue;
    if (typeof val === "string" && !val.trim()) continue;
    if (Array.isArray(val)) continue;
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    lines.push(`- ${label}: ${val}`);
  }
  return lines.join("\n");
}

// ── Single-issue prompt ───────────────────────────────────────────────────────

function buildCosmetologyPrompt(consultation: any): string {
  const cf = consultation.customFields || {};
  const fd = cf._issues?.[0]?.formData || cf;
  const allFields = collectAllFields(fd);

  const pi = consultation.patientInfo || {};
  const assess = consultation.assessment || {};
  const proc = consultation.procedure || {};
  const after = consultation.aftercare || {};

  const concern = fd.primaryConcern || pi.primaryConcern || "";
  const procedureName = fd.procedureName || fd.name || proc.name || "";

  const rxData = fd.prescription || cf.prescription;
  const meds = formatMedicines(rxData);
  const medCount = meds.length;
  const numberedMeds = meds.map((m, i) => `  ${i + 1}. ${m}`).join("\n");

  return `You are a warm AI health companion speaking directly to a patient after their cosmetology visit. Be concise, warm, and specific.

FULL CONSULTATION DATA:
${allFields || "No additional details recorded."}
${concern ? `- Primary Concern: ${concern}` : ""}
${pi.skinType ? `- Skin Type: ${pi.skinType}` : ""}
${assess.findings ? `- Findings: ${assess.findings}` : ""}
${assess.diagnosis ? `- Diagnosis: ${assess.diagnosis}` : ""}
${procedureName ? `- Procedure: ${procedureName}` : ""}
${proc.goals ? `- Goals: ${proc.goals}` : ""}
${proc.productsAndParameters ? `- Products/Parameters: ${proc.productsAndParameters}` : ""}
${proc.immediateOutcome ? `- Immediate Outcome: ${proc.immediateOutcome}` : ""}
${after.instructions ? `- Aftercare: ${after.instructions}` : ""}
${after.homeProducts ? `- Home Products: ${after.homeProducts}` : ""}
${after.expectedResults ? `- Expected Results: ${after.expectedResults}` : ""}

${medCount > 0 ? `PRESCRIBED MEDICINES (${medCount}):\n${numberedMeds}` : "No medicines prescribed."}

STRICT LIMIT: 500 words total. Complete all sections. Do not exceed.

Write in this exact structure:

Opening (NO heading — 2 sentences max):
"Hi! I am your AI health companion." Acknowledge their concern and what was done today.

## What Was Done Today? (70 words max)
Plain language explanation of the procedure, what happens to the skin, and why it was chosen. One reassuring sentence.

## What To Expect Next (4 bullets, 15 words each max)
Normal reactions and positive healing signs for this procedure. Start each with •.

${medCount > 0
  ? `## How Your Medicines Help\nEXACTLY ${medCount} bullet(s) — one per medicine. Use exact names from the list. 20 words max each. Start each with •.`
  : "## Your Home Care Tips\n4 specific aftercare tips for this procedure. Start each with •. 15 words max each."}

## Your Recovery Journey (4 bullets, 15 words each max)
Actionable home care and aftercare tips. Start each with •.

End with:
---
*I am your AI health companion. This was prepared to help you understand your cosmetology treatment. Follow your doctor's instructions and bring questions to your next visit.*

Rules:
- Analyse ALL the consultation data above to make your response specific and personalised
- Use "you"/"your" — speak TO the patient
- No jargon without plain explanation
- ONLY mention medicines from the list — accuracy is critical
- Complete all sections and end with the disclaimer
- Do NOT use emojis anywhere in the response
- 500 WORDS MAX — hard cap`;
}

// ── Multi-issue prompt ─────────────────────────────────────────────────────────

function buildMultiIssueCosmetologyPrompt(issues: any[]): string {
  const N = issues.length;

  const contextBlock = issues.map((issue, idx) => {
    const fd = issue.formData || {};
    const allFields = collectAllFields(fd);
    const concern = fd.primaryConcern || `Concern ${idx + 1}`;
    const meds = formatMedicines(fd.prescription);
    return `ISSUE ${idx + 1} — ${issue.label || concern}:
${allFields || "  No additional details."}
  Medicines (${meds.length}): ${meds.length > 0 ? meds.map((m, i) => `${i + 1}. ${m}`).join(", ") : "None"}`;
  }).join("\n\n");

  const structureBlock = issues.map((issue, idx) => {
    const fd = issue.formData || {};
    const concern = fd.primaryConcern || `Concern ${idx + 1}`;
    const meds = formatMedicines(fd.prescription);
    const mCount = meds.length;
    const numberedMeds = meds.map((m, i) => `    ${i + 1}. ${m}`).join("\n");

    return `## Issue ${idx + 1}: ${concern}

### What Was Done? (50 words max)
Plain language explanation. One reassuring sentence.

### What To Expect Next (3 bullets, 15 words each max)
Normal reactions and healing signs. Start each with •.

### How Your Medicines Help
${mCount > 0
  ? `EXACTLY ${mCount} bullet(s), one per medicine in order:\n${numberedMeds}\n20 words max each. Start with •. Do NOT invent medicines.`
  : "2 specific aftercare tips for this procedure. Start each with •. 15 words max each."}

### Recovery Tips (3 bullets, 15 words each max)
Actionable home care. Start each with •.`;
  }).join("\n\n---\n\n");

  return `You are a warm AI health companion speaking to a patient after their cosmetology visit. They had ${N} treatments today. Be concise and specific.

FULL CONSULTATION DATA:
${contextBlock}

STRICT LIMIT: 700 words total. Complete ALL sections for ALL issues. Do not exceed.

Opening (NO heading — 2 sentences max):
"Hi! I am your AI health companion." Name each concern briefly.

${structureBlock}

End with:
---
*I am your AI health companion. This was prepared to help you understand your cosmetology treatments. Follow your doctor's instructions and bring questions to your next visit.*

Rules:
- Analyse ALL consultation data above — be specific to each procedure, not generic
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
    ? buildMultiIssueCosmetologyPrompt(consultation.customFields._issues)
    : buildCosmetologyPrompt(consultation);
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { consultationId } = body;

    if (!consultationId) {
      return NextResponse.json(
        { success: false, message: "Consultation ID is required" },
        { status: 400 }
      );
    }

    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY === "your-anthropic-api-key-here"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "AI explanation is not configured. Please set ANTHROPIC_API_KEY in your environment.",
        },
        { status: 503 }
      );
    }

    await connectDB();

    const consultation = await ConsultationCosmetology.findById(consultationId);

    if (!consultation) {
      return NextResponse.json(
        { success: false, message: "Consultation not found" },
        { status: 404 }
      );
    }

    const prompt = buildPrompt(consultation);

    const anthropicStream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
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
    console.error("Generate cosmetology explanation error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate AI explanation",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
