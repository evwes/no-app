#!/usr/bin/env node
/* wampo — why do these plans have a fund lineup but no match/vesting/Roth?
 *
 * The features come from the audit NOTES; the lineup comes from the Schedule H
 * 4i attachment. Both live in the same public PDF, so "we read the schedule
 * but not the notes" looks like an extraction failure and gets recorded as an
 * unknown. Dollar General — 201,691 participants — turned out not to be that:
 * its public copy contains the auditors' report and the 4i table and stops.
 * The notes the report refers to were never in the document.
 *
 * That is a completely different answer from a parser gap, and the directive is
 * that no item rests as unknown. So classify the bucket by what the DOCUMENT
 * contains, not by what we managed to extract:
 *
 *   notes-absent   the public copy has no notes section at all — an honest gap
 *   notes-thin     a notes section exists but says nothing about contributions
 *   PARSER GAP     the notes describe a match or vesting and we missed it
 *
 * Only the third is ours to fix, and it is the only one worth a parser change.
 *
 * Usage: node scripts/size-features.mjs [sampleSize]
 */
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadPlans, loadStatus } from "./lib-schema.mjs";
import { extractPlanFeatures } from "./lib-4i.mjs";

const N = +(process.argv[2] || 30);
const P = loadPlans();
const S = loadStatus();

const pool = [];
for (const r of P.rows) {
  if (P.get(r, "sf") || P.get(r, "mtiaAck")) continue;
  const s = S.at(P.get(r, "ack"));
  if (!s || !s.c || s.f) continue;                    // confident lineup, no features
  pool.push({ ack: P.get(r, "ack"), r,
    parts: +P.get(r, "partEOY") || +P.get(r, "participants") || 0 });
}
pool.sort((a, b) => b.parts - a.parts);
const step = Math.max(1, Math.floor(pool.length / N));
const pick = [];
for (let i = 0; i < pool.length && pick.length < N; i += step) pick.push(pool[i]);

/* a real notes section names itself AND discusses the plan, not just the audit */
const NOTES_HEAD = /notes? to (?:the )?financial statements/i;
const PLAN_NOTE = /\b(?:description of (?:the )?plan|plan description|general\s*\n|participants? may (?:elect|contribute|defer)|eligible employees may)\b/i;
/* CONTRIB_TALK must not match the Form 5500's own printed pages. The first
 * version did: "Employer contributions", "less than 100% vested" and
 * "employee deferrals and employer matching contributions (as applicable)
 * under Code sections 401(k)(3)" are all form boilerplate, so every filing
 * whose attachment anchor was missing scored as a parser gap and the bucket
 * came out 30% ours when it is not. Require PROSE — a sentence a plan
 * document writes about itself, with a rate or an entitlement in it. */
const CONTRIB_TALK = new RegExp([
  "\\b(?:the )?(?:company|employer|plan sponsor) (?:matches|will match|contributes)\\b",
  "\\bmatching contributions? (?:equal to|of|are|is|shall)\\b",
  "\\b\\d{1,3}\\s*%\\s*of (?:the (?:first|next) )?\\d{0,3}\\s*%?\\s*(?:of )?(?:eligible )?(?:compensation|pay|deferrals)",
  "\\bparticipants? (?:are|become|shall be) (?:immediately )?(?:100% )?vested\\b",
  "\\bvest(?:ed|s)? (?:at a rate of|according to|in accordance with|ratably|over) \\b",
  "\\byears? of (?:vesting )?service\\b[^.]{0,60}\\bvest",
  "\\broth (?:elective deferrals?|contributions?) (?:are|may be)\\b",
].join("|"), "i");

const W = "/tmp/size-features";
if (!existsSync(W)) mkdirSync(W, { recursive: true });

const buckets = {};
const add = (k, x) => (buckets[k] = buckets[k] || []).push(x);

for (const { ack, r, parts } of pick) {
  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
  const pdf = `${W}/${ack}.pdf`;
  let text = "";
  try {
    execFileSync("curl", ["-sfL", "--max-time", "150", "-o", pdf, url], { stdio: "ignore" });
    text = execFileSync("pdftotext", ["-layout", "-q", pdf, "-"], { encoding: "utf8", maxBuffer: 300 * 1024 * 1024 });
  } catch { add("unreachable", { ack, parts, name: String(P.get(r, "sponsorName") || "").trim() }); continue; }
  finally { try { unlinkSync(pdf); } catch { /* ignore */ } }

  const name = String(P.get(r, "sponsorName") || "").trim();
  /* the Form 5500 pages themselves mention "matching contributions" in their
   * printed instructions, so only look BELOW the auditor's report — that is
   * where an attachment's own prose begins */
  /* If no attachment anchor is found, the attachment's prose cannot be
   * isolated from the form's own pages — and falling back to the whole
   * document is precisely how the first run of this script manufactured a 30%
   * parser-gap rate out of Form 5500 boilerplate. No anchor means no readable
   * attachment prose, which is a finding, not a reason to guess. */
  const auditAt = text.search(/independent auditors?['’]? report|report of independent|notes? to (?:the )?financial statements|statements? of net assets available for benefits/i);
  if (auditAt < 0) { add("no attachment prose in the public copy", { ack, parts, name }); continue; }
  const body = text.slice(auditAt);

  const hasNotesHead = NOTES_HEAD.test(body);
  const hasPlanNote = PLAN_NOTE.test(body);
  const talks = CONTRIB_TALK.test(body);

  if (!hasNotesHead && !hasPlanNote) { add("notes-absent", { ack, parts, name }); continue; }
  if (!talks) { add("notes-thin", { ack, parts, name }); continue; }

  /* the notes DO discuss contributions — so ask the production extractor what
   * it makes of them. Anything it returns empty here is genuinely ours. */
  const ff = extractPlanFeatures(body, "");
  const got = [ff && ff.match ? "match" : null, ff && ff.vesting ? "vesting" : null, ff && ff.roth ? "roth" : null].filter(Boolean);
  if (got.length) add("extractor-DOES-find-something (status stale?)", { ack, parts, name, got: got.join("+") });
  else add("PARSER GAP — notes describe it, we miss it", { ack, parts, name });
}

console.log(`\nB1 population: ${pool.length} plans, ${pool.reduce((s, x) => s + x.parts, 0).toLocaleString()} participants`);
console.log(`sampled ${pick.length} stratified across the participant range\n`);
const keys = Object.keys(buckets).sort((a, b) => buckets[b].length - buckets[a].length);
for (const k of keys) {
  const b = buckets[k];
  const parts = b.reduce((s, x) => s + x.parts, 0);
  console.log(`${String(b.length).padStart(3)}  ${String(Math.round(100 * b.length / pick.length)).padStart(3)}%  ${parts.toLocaleString().padStart(9)} participants   ${k}`);
}
for (const k of keys) {
  console.log(`\n--- ${k} ---`);
  for (const x of buckets[k].sort((a, b) => b.parts - a.parts).slice(0, 6)) {
    console.log(`   ${String(x.parts).padStart(7)}  ${x.name.slice(0, 40)}${x.got ? `  [${x.got}]` : ""}`);
  }
}
