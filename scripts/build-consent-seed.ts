/**
 * One-time (local, macOS) generator that turns the 31 IADVL Academy consent
 * `.docx` files into a committed JSON seed: scripts/data/consent-templates.json.
 *
 * The .docx source files are NOT committed; this script reads them from a local
 * folder via macOS `textutil`, strips the demographics header + signature block
 * (DermaCloud renders those itself), and keeps the informed-consent body as
 * lightweight markdown.
 *
 * Usage:  npx tsx scripts/build-consent-seed.ts "/Users/<you>/Desktop/Consent Forms"
 *
 * The portable seed step (scripts/seed-consent-templates.ts) consumes the JSON
 * and needs no .docx or textutil.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

interface SeedTemplate {
  key: string;
  title: string;
  source?: string;
  category?: string;
  version: number;
  bodyMarkdown: string;
  fields: { key: string; label: string; autofill?: string }[];
  sortOrder: number;
}

const SRC_DIR = process.argv[2] || path.join(os.homedir(), "Desktop", "Consent Forms");
const OUT_FILE = path.join(process.cwd(), "scripts", "data", "consent-templates.json");

// Token metadata: label shown in the form, and whether it pre-fills from known data.
const TOKEN_META: Record<string, { label: string; autofill?: string }> = {
  patientName: { label: "Patient name", autofill: "patientName" },
  doctorName: { label: "Doctor name", autofill: "doctorName" },
  procedure: { label: "Procedure", autofill: "procedure" },
  relation: { label: "Relation to patient" },
  site: { label: "Site / area treated" },
  indication: { label: "Indication" },
  machine: { label: "Machine used" },
  product: { label: "Product name" },
  fillerType: { label: "Type of filler" },
  threadType: { label: "Type of threads" },
  threadsLeft: { label: "Number of threads (left)" },
  threadsRight: { label: "Number of threads (right)" },
  peelType: { label: "Type of chemical peel" },
  toxinType: { label: "Type of botulinum toxin" },
  batchNo: { label: "Batch number" },
  size: { label: "Size" },
};
// Order pre-filled (autofill) fields first, then the rest by appearance.
const FIELD_ORDER = ["patientName", "doctorName", "procedure", "relation"];

// Matches any run of fill-in blank characters (underscores / dashes / dots / ellipses).
const B = "(?:_{3,}|-{4,}|\\.{4,}|…+)";

// Ordered rules: each maps a labelled blank in the body to a {{token}}. Order matters —
// doctor/patient blanks are resolved before the generic fallback.
const TOKEN_RULES: { re: RegExp; to: string }[] = [
  { re: new RegExp(`\\bDr\\.?\\s*${B}`, "gi"), to: "Dr. {{doctorName}}" },
  { re: new RegExp(`${B}\\s*\\(relation\\)`, "gi"), to: "{{relation}} (relation)" },
  { re: new RegExp(`operate on myself or on\\s*${B}`, "gi"), to: "operate on myself or on {{patientName}}" },
  { re: new RegExp(`\\bI,?\\s*${B}`, "g"), to: "I, {{patientName}}" },
  { re: new RegExp(`Name of (?:the )?PROCEDURE\\s*:?\\s*${B}`, "gi"), to: "Name of the Procedure: {{procedure}}" },
  { re: new RegExp(`\\bfor\\s*${B}\\s*\\.\\s*Initial`, "gi"), to: "for {{procedure}}. Initial" },
  { re: new RegExp(`Initial\\s*${B}`, "gi"), to: "Initial ______" },
  { re: new RegExp(`Site and Brief description of scar\\s*${B}(?:\\s*${B})?`, "gi"), to: "Site and Brief description of scar: {{site}}" },
  { re: new RegExp(`(AREA to be treated includes|Treatment Area|Area of Treatment)\\s*:?\\s*${B}`, "gi"), to: "$1: {{site}}" },
  { re: new RegExp(`Number of Threads used:\\s*Left\\s*${B}\\s*Right\\s*${B}`, "gi"), to: "Number of Threads used: Left {{threadsLeft}} Right {{threadsRight}}" },
  { re: new RegExp(`(Indications?|INDICATION FOR PRP|INDICATION)\\s*:?\\s*${B}`, "gi"), to: "$1: {{indication}}" },
  { re: new RegExp(`(Machine Used|Name of Machine)\\s*:?\\s*${B}`, "gi"), to: "$1: {{machine}}" },
  { re: new RegExp(`(Name of (?:the )?Product)\\s*:?\\s*${B}`, "gi"), to: "$1: {{product}}" },
  { re: new RegExp(`(Type of Filler(?: to be used)?)\\s*:?\\s*${B}`, "gi"), to: "$1: {{fillerType}}" },
  { re: new RegExp(`TYPE OF THREADS\\s*:?\\s*${B}`, "gi"), to: "Type of Threads: {{threadType}}" },
  { re: new RegExp(`TYPE OF CHEMICAL PEEL\\s*:?\\s*${B}`, "gi"), to: "Type of Chemical Peel: {{peelType}}" },
  { re: new RegExp(`TYPE OF BOTULINUM TOXIN\\s*:?\\s*${B}`, "gi"), to: "Type of Botulinum Toxin: {{toxinType}}" },
  { re: new RegExp(`Batch (?:number|No)\\.?\\s*:?\\s*${B}`, "gi"), to: "Batch No: {{batchNo}}" },
  { re: new RegExp(`Size\\s*:?\\s*${B}`, "gi"), to: "Size: {{size}}" },
];

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Preserve known acronyms / tokens with digits; title-case everything else.
const ACRONYMS = new Set(["HIFU", "PRP", "RF", "CO2", "IPL", "FDA", "US", "PDO", "MNRF"]);
function smartTitleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((word) => {
      const core = word.replace(/[()]/g, "").toUpperCase();
      if (/\d/.test(core)) return word; // CO2
      if (ACRONYMS.has(core)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function normalizeTitle(rawTitle: string): string {
  const procedure = rawTitle
    .replace(/^consent\s+(form\s+)?for\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return `Consent for ${smartTitleCase(procedure)}`;
}

function inferCategory(title: string): string {
  const t = title.toLowerCase();
  if (/laser|co2|hifu|ultrasound|radiofrequency|cryolipolysis|lipolysis/.test(t)) return "laser";
  if (/peel/.test(t)) return "peel";
  if (/botulinum|toxin|filler|booster|prp|micrograft|threads|lipolysis|injection/.test(t)) return "injectable";
  if (/microblading|microderm|dermaroller|microneedl|dermabrasion/.test(t)) return "facial";
  if (/surgery|removal|excision|revision|nail|cyst|mole|vitiligo/.test(t)) return "surgery";
  return "other";
}

// A line that is purely separators (dots / underscores / dashes / spaces).
function isSeparatorLine(line: string): boolean {
  const stripped = line.replace(/[\s_.\-…·•]/g, "");
  return stripped.length === 0 && /[._\-…]/.test(line);
}

const DEMO_LABELS = [
  "name", "address", "hospital id", "phone", "phone no", "phone number", "mobile",
  "email", "age", "sex", "gender", "date", "time", "place", "diagnosis",
  "case record no", "case no", "indication", "indications", "indication for",
  "name of the procedure", "procedure details", "name and relationship",
];

function isDemographicLine(line: string): boolean {
  const l = line.trim().toLowerCase().replace(/\*\*/g, "");
  // "Mr/Mrs./Miss___" style name line
  if (/^(mr\s*\/\s*mrs|mrs\s*\.?\s*\/\s*mr|mr\.?\s*\/|name\s*:|patient'?s?\s+name)/i.test(line.trim())) return true;
  for (const label of DEMO_LABELS) {
    if (l.startsWith(label + ":") || l === label || l.startsWith(label + " :")) return true;
    // "Age: ____ Sex: ____" combined lines
    if (new RegExp(`^${label}\\s*[:_…]`).test(l)) return true;
  }
  return false;
}

const SIG_MARKERS = [
  "signature of", "thumb impression", "witness", "was translation",
  "name and relationship with the guardian", "authorized representative",
  "signature of the translator", "operating doctor",
];

function isSignatureLine(line: string): boolean {
  const l = line.trim().toLowerCase();
  if (!l) return false;
  return SIG_MARKERS.some((m) => l.includes(m));
}

function isPostCareHeading(line: string): boolean {
  return /post[\s-]*procedure care|post[\s-]*op(erative)? (care|instructions)|after[\s-]*care/i.test(line.trim());
}

function extractText(docxPath: string): string {
  // textutil emits a temp .txt; read and return it.
  const tmp = path.join(os.tmpdir(), `consent-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  execFileSync("textutil", ["-convert", "txt", docxPath, "-output", tmp]);
  const text = fs.readFileSync(tmp, "utf8");
  fs.unlinkSync(tmp);
  return text;
}

function parseForm(raw: string): { title: string; source: string; body: string } {
  const lines = raw.split(/\r?\n/);

  // Header: find the IADVL line, SIG line, the "consent form for ..." title, the acknowledge note.
  let title = "";
  let sigGroup = "";
  let titleIdx = -1;

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const t = lines[i].trim();
    if (/^sig\b/i.test(t) || /special interest group/i.test(t)) sigGroup = t;
    if (/consent (form )?for\b/i.test(t) && titleIdx === -1) {
      title = t.replace(/\s+/g, " ").trim();
      titleIdx = i;
    }
  }

  const source = `IADVL Academy${sigGroup ? " — " + sigGroup.replace(/^SIG\s*/i, "").replace(/\s+/g, " ").trim() : ""}`;

  // Body: everything after the title line, with demographic + signature lines removed.
  const startIdx = titleIdx >= 0 ? titleIdx + 1 : 0;
  const out: string[] = [];
  let inPostCare = false;
  // Once the trailing signature block starts, skip everything until a post-care
  // heading (handles stray "Name:", "Date: Time: Place:", translator lines, etc.).
  let inSignatureZone = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].replace(/\t/g, " ").replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (isPostCareHeading(trimmed)) {
      out.push("", "## Post-procedure care", "");
      inPostCare = true;
      inSignatureZone = false;
      continue;
    }
    if (inSignatureZone) continue;

    if (!trimmed) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (/please acknowledge the source/i.test(trimmed)) continue;
    if (isSeparatorLine(trimmed)) continue;

    if (isSignatureLine(trimmed)) {
      inSignatureZone = true;
      continue;
    }
    if (!inPostCare && isDemographicLine(trimmed)) continue;

    // Normalise bullets (textutil renders list bullets as a leading "•" or tab+•).
    const bulletMatch = trimmed.match(/^[•·*]\s*(.+)$/);
    if (bulletMatch) {
      out.push(`• ${bulletMatch[1].trim()}`);
      continue;
    }

    out.push(trimmed);
  }

  // Convert fill-in blanks into {{tokens}} via the labelled rules. Any blank the
  // rules don't recognise becomes a plain underline (checkbox / initials / free note).
  let body = out.join("\n");
  for (const rule of TOKEN_RULES) body = body.replace(rule.re, rule.to);
  body = body
    .replace(new RegExp(B, "g"), "______") // unrecognised blanks → handwritten underline
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, source, body };
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Source folder not found: ${SRC_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.toLowerCase().endsWith(".docx"))
    .sort();

  const usedKeys = new Set<string>();
  const templates: SeedTemplate[] = [];

  files.forEach((file, idx) => {
    const raw = extractText(path.join(SRC_DIR, file));
    const { title: rawTitle, source, body } = parseForm(raw);

    if (!rawTitle || !body) {
      console.warn(`⚠️  Skipped (no title/body): ${file}`);
      return;
    }

    const title = normalizeTitle(rawTitle);
    let key = slug(title);
    if (usedKeys.has(key)) {
      const m = file.match(/(\d+)/);
      key = `${key}-${m ? m[1] : idx}`;
    }
    usedKeys.add(key);

    // Collect the {{tokens}} actually present in this form → its field list.
    const present = new Set<string>();
    for (const m of body.matchAll(/\{\{(\w+)\}\}/g)) present.add(m[1]);
    const fields = [...present]
      .sort((a, b) => {
        const ia = FIELD_ORDER.indexOf(a);
        const ib = FIELD_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map((tok) => {
        const meta = TOKEN_META[tok] || { label: tok };
        return { key: tok, label: meta.label, ...(meta.autofill ? { autofill: meta.autofill } : {}) };
      });

    templates.push({
      key,
      title,
      source,
      category: inferCategory(title),
      version: 1,
      bodyMarkdown: body,
      fields,
      sortOrder: idx,
    });

    console.log(`✓ ${title}  —  fields: [${fields.map((f) => f.key).join(", ")}]`);
  });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(templates, null, 2));
  console.log(`\nWrote ${templates.length} templates → ${path.relative(process.cwd(), OUT_FILE)}`);
}

main();
