#!/usr/bin/env node
/* Merge the PDF verdicts into the review list, grouped by what a reviewer can
 * actually DO about each row. Usage:
 *   node scripts/gap-report.mjs <verdicts.json> > docs/review-list-direct.md
 */
import { readFileSync } from "node:fs";

const verd = JSON.parse(readFileSync(process.argv[2], "utf8"));
const all = JSON.parse(readFileSync("plans-all.json", "utf8"));
const F = Object.fromEntries(all.fields.map((f, i) => [f, i]));
const st = JSON.parse(readFileSync("lineups-status.json", "utf8")).plans;
const byAck = new Map(all.plans.map((r) => [r[F.ack], r]));

const url = (a) => `https://efast2-filings-public.s3.amazonaws.com/prd/${a.slice(0, 4)}/${a.slice(4, 6)}/${a.slice(6, 8)}/${a}.pdf`;
const B = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);

const KEYS = [
  "TABLE PRESENT — we cannot read it (parser gap)",
  "referenced but ABSENT — the schedule pages are not in the public copy",
  "little extractable text — likely scanned or image-only",
  "no schedule table and no reference — form-only filing",
];
const HEAD = {
  [KEYS[0]]: ["A. The schedule IS in the filing and we cannot read it",
    "**This is where your help is worth most.** The table is on the page; our parser misses it. Point at the page number and roughly how the table is laid out (where the fund name sits, whether there is a description column between name and value) and that becomes a fixable parser bug."],
  [KEYS[1]]: ["B. The schedule is referenced but its pages are absent",
    "The filing's own index or auditor's report names a Schedule H line 4i, but the table is not in the public copy we can download. **Worth confirming:** if you open it and the table IS there, then our copy is truncated and the bug is ours."],
  [KEYS[2]]: ["C. Little extractable text — likely scanned",
    "Image-only pages. Our OCR either did not run or could not read them."],
  [KEYS[3]]: ["D. Form-only filing — no schedule and no reference",
    "No audited attachment in the public copy at all. Nothing to extract; recorded so it is not chased again."],
};

const rows = Object.keys(verd).map((a) => {
  const r = byAck.get(a);
  return r ? { ack: a, v: verd[a], r, s: st[a], assets: +r[F.assetsEOY] || 0 } : null;
}).filter(Boolean);

const grp = {};
for (const x of rows) (grp[x.v.verdict] = grp[x.v.verdict] || []).push(x);
for (const k of Object.keys(grp)) grp[k].sort((a, b) => b.assets - a.assets);

const out = [];
out.push(`# Review list — ${rows.length} direct full-form filers with a named gap\n`);
out.push(`Generated ${new Date().toISOString().slice(0, 10)}. **Plans that file their own schedule.** Master-trust-held plans are excluded: their gap lives in the trust's filing, not in theirs, so it cannot be acted on from the plan document.\n`);
out.push(`**Every row was verified against the actual filing PDF**, not just against our status store. That distinction matters — the store records whether *we* found a schedule, not whether the *document* contains one. Checking turned "no schedule found" into three genuinely different problems.\n`);

for (const k of KEYS) {
  const g = grp[k];
  if (!g || !g.length) continue;
  const [title, blurb] = HEAD[k];
  out.push(`---\n`);
  out.push(`## ${title} — ${g.length} plans\n`);
  out.push(`${blurb}\n`);
  g.forEach((x, i) => {
    const r = x.r, s = x.s;
    const gaps = [];
    if (!s || !s.c) gaps.push("fund lineup");
    if (!(s && s.f)) gaps.push("match / vesting / Roth (from the audit notes)");
    if (!r[F.recordkeeper]) gaps.push("recordkeeper");
    out.push(`**${i + 1}. ${String(r[F.sponsorName]).trim()}**  `);
    out.push(`EIN ${r[F.ein]} · PN ${String(r[F.pn]).padStart(3, "0")} · plan year ${r[F.planYear]} · ${B(x.assets)} · ${(+r[F.partEOY] || +r[F.participants] || 0).toLocaleString()} participants  `);
    out.push(`Missing: ${gaps.join(" · ")}  `);
    out.push(`PDF: ${x.v.pages} pages, ${x.v.headers} table header(s) found — [open](${url(x.ack)})\n`);
  });
}
console.log(out.join("\n"));
