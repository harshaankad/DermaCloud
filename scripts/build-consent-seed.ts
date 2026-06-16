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
  fields: { key: string; label: string; required?: boolean }[];
  sortOrder: number;
}

const SRC_DIR = process.argv[2] || path.join(os.homedir(), "Desktop", "Consent Forms");
const OUT_FILE = path.join(process.cwd(), "scripts", "data", "consent-templates.json");

// Common, optional blanks shown for every form. Doctor fills what is relevant.
const COMMON_FIELDS = [
  { key: "diagnosis", label: "Diagnosis", required: false },
  { key: "siteTreated", label: "Site / area to be treated", required: false },
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

  // A short label followed by a long fill-in blank that runs to end of line,
  // e.g. "INDICATION FOR PRP ____" or "AREA to be treated includes: ____".
  const isFieldBlankLine = (s: string) => /^.{0,45}[_….]{6,}\s*$/.test(s);

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
    if (isFieldBlankLine(trimmed)) continue;

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

  // Strip inline fill-in blanks entirely (runs of _ … . or ----). A line that is
  // just a label trailing into a blank (a fill-in prompt) is dropped; blanks that
  // sit inside a sentence or lead a clause are removed and spacing collapsed.
  const BLANK_RUN = /[_…]{3,}|-{4,}|\.{4,}/g;
  const TRAILING_BLANK = /[\s]*([_…]{3,}|-{4,}|\.{4,})[\s_….\-]*$/;

  const cleanedLines: string[] = [];
  for (const original of out) {
    if (original.startsWith("## ")) {
      cleanedLines.push(original);
      continue;
    }
    if (!original.trim()) {
      cleanedLines.push("");
      continue;
    }

    // Drop fill-in prompt lines: "<label> ____" that don't end a real sentence.
    if (TRAILING_BLANK.test(original)) {
      const before = original.replace(TRAILING_BLANK, "").trim();
      if (!/[.!?]$/.test(before)) continue;
    }

    const cleaned = original
      .replace(/^([_…]{3,}|-{4,}|\.{4,})\s*/, "") // leading checkbox-style blank
      .replace(BLANK_RUN, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (cleaned) cleanedLines.push(cleaned);
  }

  const body = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

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

    templates.push({
      key,
      title,
      source,
      category: inferCategory(title),
      version: 1,
      bodyMarkdown: body,
      fields: COMMON_FIELDS,
      sortOrder: idx,
    });

    console.log(`✓ ${file}  →  ${title}  (${body.length} chars)`);
  });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(templates, null, 2));
  console.log(`\nWrote ${templates.length} templates → ${path.relative(process.cwd(), OUT_FILE)}`);
}

main();
