/**
 * Seeds the global consent form templates from scripts/data/consent-templates.json.
 *
 * Idempotent: upserts by `key`. Bumps `version` only when the body or fields
 * actually change, so re-running is safe and signed records (which snapshot the
 * version) stay meaningful.
 *
 * Usage:
 *   npx tsx scripts/seed-consent-templates.ts            # apply
 *   npx tsx scripts/seed-consent-templates.ts --dry-run  # preview
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });

import ConsentTemplate from "../models/ConsentTemplate";

const MONGODB_URI = process.env.MONGODB_URI || "";
const DATA_FILE = path.join(process.cwd(), "scripts", "data", "consent-templates.json");
const DRY_RUN = process.argv.includes("--dry-run");

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

async function main() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Seed data not found: ${DATA_FILE}. Run build-consent-seed.ts first.`);
    process.exit(1);
  }

  const templates: SeedTemplate[] = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  await mongoose.connect(MONGODB_URI);
  console.log(`Connected. ${DRY_RUN ? "[DRY RUN] " : ""}Seeding ${templates.length} templates…\n`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const tpl of templates) {
    const existing = await ConsentTemplate.findOne({ key: tpl.key });

    if (!existing) {
      console.log(`+ create  ${tpl.key}`);
      if (!DRY_RUN) {
        await ConsentTemplate.create({ ...tpl, isActive: true });
      }
      created++;
      continue;
    }

    const changed =
      existing.bodyMarkdown !== tpl.bodyMarkdown ||
      existing.title !== tpl.title ||
      (existing.source || "") !== (tpl.source || "") ||
      (existing.category || "") !== (tpl.category || "") ||
      JSON.stringify(existing.fields) !== JSON.stringify(tpl.fields);

    if (!changed) {
      unchanged++;
      continue;
    }

    console.log(`~ update  ${tpl.key}  (v${existing.version} → v${existing.version + 1})`);
    if (!DRY_RUN) {
      existing.title = tpl.title;
      existing.source = tpl.source;
      existing.category = tpl.category;
      existing.bodyMarkdown = tpl.bodyMarkdown;
      existing.fields = tpl.fields as any;
      existing.sortOrder = tpl.sortOrder;
      existing.version = existing.version + 1;
      await existing.save();
    }
    updated++;
  }

  console.log(`\nDone. created=${created} updated=${updated} unchanged=${unchanged}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
