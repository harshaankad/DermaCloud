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

function buildCosmetologyPrompt(consultation: any): string {
  const primaryConcern = consultation.patientInfo?.primaryConcern || "";
  const skinType = consultation.patientInfo?.skinType || "";
  const procedureName = consultation.procedure?.name || "";
  const procedureGoals = consultation.procedure?.goals || "";
  const sessionNumber = consultation.procedure?.sessionNumber;
  const totalPackage = consultation.procedure?.package || "";
  const productsAndParameters = consultation.procedure?.productsAndParameters || "";
  const immediateOutcome = consultation.procedure?.immediateOutcome || "";
  const aftercareInstructions = consultation.aftercare?.instructions || "";
  const homeProducts = consultation.aftercare?.homeProducts || "";
  const expectedResults = consultation.aftercare?.expectedResults || "";
  const followUpDate = consultation.aftercare?.followUpDate;
  const diagnosis = consultation.assessment?.diagnosis || "";
  const findings = consultation.assessment?.findings || "";

  const followUpStr = followUpDate
    ? new Date(followUpDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const sessionLabel = sessionNumber
    ? `Session ${sessionNumber}${totalPackage ? ` of ${totalPackage}` : ""}`
    : totalPackage
    ? totalPackage
    : "First visit";

  return `You are a warm, friendly AI health companion speaking directly to a patient right after their cosmetology visit. Your job is to make them feel genuinely cared for, fully informed, and confident about their skin — like getting a personal explanation from someone who truly understands their situation, not a generic pamphlet.

Consultation details:
- Primary concern: ${primaryConcern || "Skin improvement"}
- Skin type: ${skinType || "Not specified"}
- Clinical findings: ${findings || "Not documented"}
- Diagnosis / Assessment: ${diagnosis || "Skin evaluation completed"}
- Procedure performed: ${procedureName || "Cosmetology treatment"}
- Treatment goals: ${procedureGoals || "Skin improvement and rejuvenation"}
- Session: ${sessionLabel}
- Products / Parameters used: ${productsAndParameters || "Not specified"}
- Immediate outcome after procedure: ${immediateOutcome || "Procedure completed well"}
- Aftercare instructions: ${aftercareInstructions || "Standard aftercare"}
- Home products recommended: ${homeProducts || "None"}
- Expected results: ${expectedResults || "Gradual improvement with sessions"}
${followUpStr ? `- Follow-up date: ${followUpStr}` : ""}

Use this exact structure. Each section has a strict word limit — do not exceed it:

Opening (NO heading — 50 words max):
Start with "Hi! I am your AI health companion." Acknowledge their primary concern and what was done today. State your goal briefly. 2 short, warm sentences only.

## What Was Done Today? (90 words max)
In plain language: what is this procedure, what happens to the skin during it, and why was it chosen for their concern and skin type? If a follow-up session, acknowledge their progress. End with one short reassuring sentence.

## What To Expect Next (exactly 4 bullets, 20 words max each)
Four specific things to expect — both normal reactions and positive healing signs for this exact procedure. Start each with •. One concise sentence per bullet.

## Your Home Care Routine (exactly 5 bullets, 20 words max each)
${homeProducts ? `The doctor recommended: ${homeProducts}. For each product, 22 words max: what it does and when to use it. Fill remaining bullets with specific aftercare tips.` : "Five specific, actionable aftercare tips for this procedure and skin concern. Tell them what to do."} Start each with •. End with one short encouraging sentence.

## When To Expect Results (60 words max)
What specific improvements will they see and in what realistic timeframe for this exact procedure?${followUpStr ? ` Mention follow-up on ${followUpStr}.` : " Encourage scheduling a follow-up."} One honest, encouraging closing sentence.

End with exactly:
---
*Hi, I am your AI health companion. This explanation was prepared to help you understand your cosmetology treatment and feel confident about your skin care journey. Please follow your doctor's aftercare instructions carefully and bring any questions to your next visit — beautiful, healthy skin is a journey, and you are on the right path.*

Rules:
- The opening paragraph must NOT have a ## heading — it speaks directly to the patient
- Start the opening with "Hi! I am your AI health companion" and make it feel genuinely warm
- Use "you" and "your" throughout — speak TO the patient, not about them
- Never use medical jargon without immediately explaining it in plain language
- Be specific to this exact procedure — nothing generic that could apply to any treatment
- Make the patient feel hopeful, cared for, and empowered to follow their aftercare routine
- Do NOT use bullet points outside the ## sections
- CRITICAL: Write all sections completely and end with the --- disclaimer. Never stop mid-sentence or mid-section.
- WORD LIMITS ARE HARD CAPS: Do not exceed any section's word limit. Concise = better.`;
}

// ── Multi-issue prompt ─────────────────────────────────────────────────────────

function buildMultiIssueCosmetologyPrompt(issues: any[]): string {
  const N = issues.length;
  // Scale word budget: ~260 per issue for 2, ~210 for 3
  const wordsPerIssue = Math.max(180, Math.round(520 / N));
  const totalWords = wordsPerIssue * N + 80;

  // Concise context block for the model
  const contextBlock = issues.map((issue, idx) => {
    const fd = issue.formData || {};
    const concern = fd.primaryConcern || `Concern ${idx + 1}`;
    const procedure = fd.procedureName || fd.name || "Cosmetology treatment";
    const homeProducts = fd.homeProducts || "None";
    return `Issue ${idx + 1} — ${issue.label || concern}:
  Primary concern: ${concern}
  Skin type: ${fd.skinType || "Not specified"}
  Procedure: ${procedure}
  Goals: ${fd.goals || "Skin improvement"}
  Immediate outcome: ${fd.immediateOutcome || "Completed well"}
  Home products: ${homeProducts}`;
  }).join("\n\n");

  // Per-issue structure block
  const structureBlock = issues.map((issue, idx) => {
    const fd = issue.formData || {};
    const concern = fd.primaryConcern || `Concern ${idx + 1}`;
    const procedure = fd.procedureName || fd.name || "Cosmetology treatment";
    const homeProducts = fd.homeProducts || "";
    const expectedResults = fd.expectedResults || "";
    const followUpDate = fd.followUpDate
      ? new Date(fd.followUpDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      : "";

    return `## Issue ${idx + 1}: ${concern}

### What Was Done? (60 words max)
Plain language: what is "${procedure}", what happens to the skin, why chosen for "${concern}" and "${fd.skinType || "their skin type"}". One short reassuring sentence at the end.

### What To Expect Next (exactly 3 bullets, 18 words max each)
Three specific things to expect — normal reactions and positive healing signs for ${procedure}. Start each with •. One concise sentence per bullet.

### Your Home Care Routine (exactly 3 bullets, 18 words max each)
${homeProducts
  ? `Doctor recommended: ${homeProducts}. For each product, 22 words max: what it does and when to use it. Fill remaining bullets with aftercare tips for ${procedure}.`
  : `Three specific aftercare tips for ${procedure} and ${concern}. Start each with •. Tell them what to do.`}

### When To Expect Results (50 words max)
${expectedResults ? `Expected: ${expectedResults}. ` : ""}Realistic timeline for ${procedure}.${followUpDate ? ` Mention follow-up on ${followUpDate}.` : " Encourage scheduling a follow-up."} One encouraging sentence.`;
  }).join("\n\n---\n\n");

  return `You are a warm, friendly AI health companion speaking directly to a patient after their cosmetology visit. They had ${N} separate treatments today.

Consultation summary:
${contextBlock}

WORD BUDGET: Write approximately ${totalWords} words total (about ${wordsPerIssue} words per issue). This is carefully sized so you can complete ALL sections within your token limit. Do not go over, and do not leave anything unfinished.

CRITICAL COMPLETION RULE: You MUST write every section for every issue AND end with the closing disclaimer. If you run long on one issue, trim it — but never skip a section or stop before the closing.

─────────────────────────────────────────

Opening paragraph (NO ## heading — ~60 words):
Start with "Hi! I am your AI health companion." Warmly tell the patient they had ${N} separate treatments today — name each concern briefly. Say you'll walk them through each one. Keep it warm and reassuring.

${structureBlock}

End with EXACTLY this closing (do not skip or shorten it):
---
*Hi, I am your AI health companion. This explanation was prepared to help you understand your cosmetology treatments and feel confident about your skin care journey. Please follow your doctor's aftercare instructions carefully and bring any questions to your next visit — beautiful, healthy skin is a journey, and you are on the right path.*

─────────────────────────────────────────

Rules:
- Complete ALL ${N} issues fully — every ### subheading under every ## issue
- Use "you"/"your" throughout — speak TO the patient
- Be specific to each procedure and concern — nothing generic
- Do NOT use bullet points outside ### sections
- End with the --- disclaimer — this is mandatory`;
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
      max_tokens: 3500,
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
