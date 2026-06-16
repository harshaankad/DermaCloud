/**
 * Consent form body templating.
 *
 * Form bodies contain `{{fieldKey}}` placeholders (e.g. `authorize Dr. {{doctorName}}`).
 * At sign time the doctor's entered values + known data (patient/doctor/procedure)
 * are substituted in. Any placeholder left empty renders as a short underline so
 * it can be completed by hand.
 *
 * Pure module — safe to import from both client components and server routes.
 */

export const BLANK_UNDERLINE = "__________";

export function substituteConsentTokens(
  body: string,
  values: Record<string, string | undefined>,
  opts: { blank?: string } = {}
): string {
  const blank = opts.blank ?? BLANK_UNDERLINE;
  return body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const v = values[key];
    return v && v.trim() ? v.trim() : blank;
  });
}

/** Resolve the autofill value for a field from known data. */
export function resolveAutofill(
  autofill: string | undefined,
  ctx: { patientName?: string; doctorName?: string; procedure?: string }
): string | undefined {
  switch (autofill) {
    case "patientName":
      return ctx.patientName;
    case "doctorName":
      return ctx.doctorName;
    case "procedure":
      return ctx.procedure;
    default:
      return undefined;
  }
}

/** "Consent for Scar Revision Surgery" -> "Scar Revision Surgery". */
export function procedureFromTitle(title: string): string {
  return title.replace(/^consent\s+(form\s+)?for\s+/i, "").trim();
}
