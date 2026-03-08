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

function parseMedicines(topicals: string, orals: string): string[] {
  const items: string[] = [];
  if (topicals) items.push(...topicals.split(/[,;\n\r]+/).map((m: string) => m.trim()).filter(Boolean).map((m: string) => `${m} (topical)`));
  if (orals)    items.push(...orals.split(/[,;\n\r]+/).map((m: string) => m.trim()).filter(Boolean).map((m: string) => `${m} (oral)`));
  return items;
}

// ── Single-issue prompt (unchanged logic) ──────────────────────────────────────

function buildSingleIssuePrompt(consultation: any): string {
  const diagnosis = consultation.diagnosis?.provisional || "";
  const severity  = consultation.clinicalExamination?.severity || "";
  const complaint = consultation.patientInfo?.complaint || "";
  const duration  = consultation.patientInfo?.duration || "";
  const topicals  = consultation.treatmentPlan?.topicals || "";
  const orals     = consultation.treatmentPlan?.orals || "";
  const instructions = consultation.treatmentPlan?.instructions || "";

  const medicineItems = parseMedicines(topicals, orals);
  const medicineCount = medicineItems.length;
  const numberedMedicines = medicineItems.map((m, i) => `  ${i + 1}. ${m}`).join("\n");

  return `You are a warm, friendly AI health companion speaking directly to a patient right after their dermatology visit. Your job is to make them feel genuinely cared for, fully informed, and confident — like they're getting a personal explanation from someone who truly understands their situation, not a generic pamphlet.

Consultation details:
- Patient complaint: ${complaint || "Not specified"}
- Duration: ${duration || "Not specified"}
- Diagnosis: ${diagnosis || "Skin condition under evaluation"}
- Severity: ${severity || "Not specified"}
- Doctor's instructions: ${instructions || "None"}

Use this exact structure. Each section has a strict word limit — do not exceed it:

Opening (NO heading — 55 words max):
Introduce yourself as the patient's AI health companion. Acknowledge their specific complaint and duration. Say your goal is to help them understand in plain language. Keep it to 2 short, warm sentences.

## What's Happening With Your Skin? (90 words max)
In plain, friendly language: what is this condition, what is happening inside their skin, what does it look and feel like, and what does the severity mean for them? End with one short reassuring sentence about what is possible with treatment.

## Why Did This Happen? (exactly 5 bullets, 20 words max each)
Five specific triggers or causes for this exact condition. Start each with •. One concise sentence per bullet — relate to real-life experiences the patient would recognise.

## How Your Medicines Help
${medicineCount > 0
  ? `IMPORTANT: The doctor prescribed exactly ${medicineCount} medicine(s) for this patient. You must write EXACTLY ${medicineCount} bullet point(s) in this section — one bullet per medicine. Do not add, combine, or invent any medicines beyond this list.

The complete medicine list (write one • bullet for each, in order):
${numberedMedicines}

For each medicine (use the exact name as given, without adding descriptions like "cream" or "ointment" unless already in the name), write exactly 1 sentence — 30 words max: what it does for this patient's condition and what they will notice. Start each bullet with •. After the last bullet, one short encouraging sentence.`
  : "No medicines were prescribed for this visit. Give 3–4 specific, evidence-based skin care tips that directly apply to this condition. Start each with •."}

## Your Recovery Journey (exactly 5 bullets, 20 words max each)
Five specific, actionable home care tips for this exact condition. Tell them what to do. Start each with •. End with one short warm sentence about their recovery.

End with exactly:
---
*Hi, I am your AI health companion. This explanation was prepared to help you understand your condition and feel confident about your recovery. Please follow your doctor's instructions carefully and bring any questions to your next visit — you deserve to feel fully informed.*

Rules:
- The opening paragraph must NOT have a ## heading — it speaks directly to the patient
- Start the opening with "Hi! I am your AI health companion" and make it feel genuinely warm
- Use "you" and "your" throughout — speak TO the patient, not about them
- Never use medical jargon without immediately explaining it in plain language
- Be specific to this exact diagnosis — nothing that could apply to any skin condition
- Validate the patient's experience — it is okay to acknowledge that having this condition can be worrying or frustrating
- Make the patient feel hopeful, cared for, and empowered to manage their recovery
- Do NOT use bullet points outside the ## sections
- NEVER mention or describe any medicine that is not in the prescribed list above — this is a patient-facing medical document and accuracy is critical
- CRITICAL: You have enough token budget to complete this fully. Write all sections completely and end with the --- disclaimer. Never stop mid-sentence or mid-section.
- WORD LIMITS ARE HARD CAPS: Do not exceed any section's word limit. Concise = better.`;
}

// ── Multi-issue prompt ─────────────────────────────────────────────────────────

function buildMultiIssuePrompt(issues: any[]): string {
  const N = issues.length;
  // Scale word budget: ~260 per issue for 2, ~210 for 3, ~180 for 4
  const wordsPerIssue = Math.max(180, Math.round(520 / N));
  const totalWords = wordsPerIssue * N + 80; // +80 for shared opening/closing

  // Build concise context block for the model
  const contextBlock = issues.map((issue, idx) => {
    const fd = issue.formData || {};
    const diagnosis = fd.provisional || fd.provisionalDiagnosis || `Condition ${idx + 1}`;
    const complaint = fd.complaint || fd.chiefComplaint || "Not specified";
    const duration  = fd.duration || "Not specified";
    const meds = parseMedicines(fd.topicals || "", fd.orals || "");
    return `Issue ${idx + 1} — ${issue.label || diagnosis}:
  Complaint: ${complaint} | Duration: ${duration}
  Diagnosis: ${diagnosis}
  Medicines (${meds.length}): ${meds.length > 0 ? meds.map((m, i) => `${i + 1}. ${m}`).join(", ") : "None"}`;
  }).join("\n\n");

  // Build per-issue structure block
  const structureBlock = issues.map((issue, idx) => {
    const fd = issue.formData || {};
    const diagnosis = fd.provisional || fd.provisionalDiagnosis || `Condition ${idx + 1}`;
    const duration  = fd.duration || "some time";
    const meds = parseMedicines(fd.topicals || "", fd.orals || "");
    const mCount = meds.length;
    const numberedMeds = meds.map((m, i) => `    ${i + 1}. ${m}`).join("\n");

    return `## Issue ${idx + 1}: ${diagnosis}

### What's Happening? (60 words max)
Plain language: what is ${diagnosis}, what is happening in their skin, what does it look/feel like. One short reassuring sentence at the end.

### Why Did This Happen? (exactly 3 bullets, 18 words max each)
Three specific causes for ${diagnosis}. One concise sentence per bullet starting with •. Relate to real-life experience.

### How Your Medicines Help
${mCount > 0
  ? `EXACTLY ${mCount} bullet(s) — one per medicine, in this exact order:
${numberedMeds}
For each: 1 sentence — 28 words max: what it does and what the patient will notice. Start each bullet with •. Do NOT add any medicine not in this list.`
  : `No medicines for this issue. Give 2 specific skincare tips for ${diagnosis}, each starting with •, 20 words max each.`}

### Recovery Tips (exactly 3 bullets, 18 words max each)
Three actionable home care tips for ${diagnosis}. Start each with •. Tell them what to do.`;
  }).join("\n\n---\n\n");

  return `You are a warm, friendly AI health companion speaking directly to a patient after their dermatology visit. They came in with ${N} separate skin conditions today.

Consultation summary:
${contextBlock}

WORD BUDGET: Write approximately ${totalWords} words total (about ${wordsPerIssue} words per issue). This budget is carefully sized so you can complete ALL sections fully within your token limit. Stick to it — do not go over, and do not leave anything unfinished.

CRITICAL COMPLETION RULE: You MUST write every section for every issue AND end with the closing disclaimer. If you find yourself running long on one issue, trim it — but never skip a section or stop before the closing. A complete answer that is slightly shorter is far better than one that cuts off in the middle.

─────────────────────────────────────────

Opening paragraph (NO ## heading — 55 words max):
Start with "Hi! I am your AI health companion." Tell the patient they came in for ${N} separate skin concerns today — name each diagnosis briefly. Say you'll walk them through each one. 2 short sentences only.

${structureBlock}

End with EXACTLY this closing (do not skip or shorten it):
---
*Hi, I am your AI health companion. This explanation was prepared to help you understand your conditions and feel confident about your recovery. Please follow your doctor's instructions carefully and bring any questions to your next visit — you deserve to feel fully informed.*

─────────────────────────────────────────

Rules:
- Complete ALL ${N} issues fully — every ### subheading under every ## issue
- Use "you"/"your" throughout — speak TO the patient
- Be specific to each exact diagnosis — not generic
- ONLY mention medicines from the lists provided — this is a patient-facing medical document
- Do NOT use bullet points outside ### sections
- End with the --- disclaimer — this is mandatory
- WORD LIMITS ARE HARD CAPS: Do not exceed any section's word limit. Concise = better.`;
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
      max_tokens: 3500,
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
