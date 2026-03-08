/**
 * WhatsApp Cloud API — appointment notification sender.
 *
 * Development:  uses the `hello_world` pre-approved template (no variables needed).
 * Production:   set WHATSAPP_TEMPLATE_NAME=appointment_confirmation and Meta will
 *               use the approved template with 5 body parameter components.
 */

const PHONE_NUMBER_ID  = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN     = process.env.WHATSAPP_ACCESS_TOKEN;
const TEMPLATE_NAME    = process.env.WHATSAPP_TEMPLATE_NAME ?? "hello_world";
const REPORT_TEMPLATE  = process.env.WHATSAPP_REPORT_TEMPLATE_NAME ?? "consultation_report";
const GRAPH_URL        = "https://graph.facebook.com/v19.0";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise any Indian phone number to E.164 (+91XXXXXXXXXX).
 * Strips spaces, dashes, parentheses.  Handles:
 *   "9876543210"  →  "+919876543210"
 *   "09876543210" →  "+919876543210"
 *   "919876543210"→  "+919876543210"
 *   "+919876543210" → "+919876543210"
 */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+91${digits.slice(1)}`;
  return `+${digits}`; // already has country code
}

/**
 * Format a Date as "Wednesday, 5 March 2026" in IST.
 */
export function formatAppointmentDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Format "HH:MM" as "10:30 AM" / "2:00 PM".
 */
export function formatAppointmentTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface AppointmentNotificationParams {
  patientName:  string;
  patientPhone: string;
  clinicName:   string;
  doctorName:   string;
  date:         string; // formatted: "Wednesday, 5 March 2026"
  time:         string; // formatted: "10:30 AM"
}

/**
 * Send a WhatsApp appointment confirmation.
 * - In dev: sends the pre-approved `hello_world` template (no parameters).
 * - In prod: sends `appointment_confirmation` template with 5 body parameters.
 *
 * Throws on API error — callers should catch and log (don't block the booking).
 */
export async function sendAppointmentConfirmation(
  params: AppointmentNotificationParams
): Promise<void> {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.warn("[WhatsApp] Credentials not set — skipping notification");
    return;
  }

  const to = toE164(params.patientPhone);
  const isHelloWorld = TEMPLATE_NAME === "hello_world";

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: "en_US" },
      // hello_world takes no components; appointment_confirmation takes 5 body params
      ...(isHelloWorld
        ? {}
        : {
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: params.patientName },  // {{1}}
                  { type: "text", text: params.clinicName  },  // {{2}}
                  { type: "text", text: params.date        },  // {{3}}
                  { type: "text", text: params.time        },  // {{4}}
                  { type: "text", text: params.doctorName  },  // {{5}}
                ],
              },
            ],
          }),
    },
  };

  const res = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${errText}`);
  }

  const json = await res.json();
  console.log(`[WhatsApp] Sent to ${to} — message ID: ${json.messages?.[0]?.id}`);
}

// ── Consultation report ────────────────────────────────────────────────────────

export interface ConsultationReportParams {
  patientName:      string;
  patientPhone:     string;
  consultationType: string; // "Dermatology" | "Cosmetology"
  clinicName:       string;
  doctorName:       string;
  reportLink:       string; // pre-signed S3 URL
}

/**
 * Send a WhatsApp consultation report notification using the
 * `consultation_report` template (5 numbered body parameters).
 *
 * Throws on API error — callers should catch.
 */
export async function sendConsultationReport(
  params: ConsultationReportParams
): Promise<void> {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.warn("[WhatsApp] Credentials not set — skipping report notification");
    return;
  }

  const to = toE164(params.patientPhone);

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: REPORT_TEMPLATE,
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.patientName      }, // {{1}}
            { type: "text", text: params.consultationType }, // {{2}}
            { type: "text", text: params.clinicName       }, // {{3}}
            { type: "text", text: params.doctorName       }, // {{4}}
            { type: "text", text: params.reportLink       }, // {{5}}
          ],
        },
      ],
    },
  };

  const res = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${errText}`);
  }

  const json = await res.json();
  console.log(`[WhatsApp] Report sent to ${to} — message ID: ${json.messages?.[0]?.id}`);
}
