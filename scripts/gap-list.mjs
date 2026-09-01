#!/usr/bin/env node
/* wampo — the review list: full-form filers with a NAMED gap, biggest first.
 *
 * Purpose: hand a human a short, concrete worklist. For each plan it says what
 * is missing, why the pipeline could not get it, and the direct link to the
 * filing PDF, so the gap can be checked against the source document rather
 * than argued about from the data.
 *
 * Full-form filers only — short-form (5500-SF) filers file no audited
 * attachment at all, so "missing lineup" is not a gap for them, it is the law.
 *
 * Usage: node scripts/gap-list.mjs [count] > docs/review-list.md
 */
import { readFileSync } from "node:fs";

const N = +(process.argv[2] || 50);
/* --direct: only plans that file their OWN schedule. A plan whose assets sit
 * in a master trust has no gap in its own filing — the trust's filing is
 * where the missing data lives, so it is a different piece of work and
 * cannot be acted on from the plan document. */
const DIRECT_ONLY = process.argv.includes("--direct");
const all = JSON.parse(readFileSync("plans-all.json", "utf8"));
const F = Object.fromEntries(all.fields.map((f, i) => [f, i]));
const st = JSON.parse(readFileSync("lineups-status.json", "utf8")).plans;
const trusts = JSON.parse(readFileSync("mtias.json", "utf8")).trusts;
const trustByAck = new Map(trusts.map((t) => [t.ack, t]));

// the filing PDF lives at a path derived from the ack's date prefix
const pdfUrl = (ack) =>
  `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;

const g = (r, k) => r[F[k]];
const rows = [];

for (const r of all.plans) {
  if (g(r, "sf")) continue;                       // full-form filers only
  const ack = g(r, "ack");
  const s = st[ack];
  const assets = +g(r, "assetsEOY") || 0;
  const parts = +g(r, "partEOY") || +g(r, "participants") || 0;
  if (assets < 5e7) continue;                     // keep the list worth a human's time

  const mtia = g(r, "mtiaAck");
  if (DIRECT_ONLY && mtia) continue;            // trust-held: gap is in the trust filing
  const gaps = [];
  // 1. the fund lineup
  if (!s || !s.c) {
    const mt = g(r, "mtiaAck");
    const ts = mt ? st[mt] : null;
    if (mt && ts && ts.c) { /* trust supplies it — not a gap */ }
    else if (mt && trustByAck.has(mt)) {
      gaps.push(`**Fund lineup** — held through *${(trustByAck.get(mt).name || "a master trust").slice(0, 44)}*, whose own filing does not parse` +
        (ts && ts.e ? ` (${ts.e})` : "") + `. Trust filing: [PDF](${pdfUrl(mt)})`);
    } else if (mt) gaps.push("**Fund lineup** — names a master trust that has no filing in EFAST2");
    else if (s && s.e === "no-section") gaps.push("**Fund lineup** — no readable Schedule H 4i section in the public PDF (form-only, scanned, or the attachment pages are absent)");
    else if (s && s.e === "download") gaps.push("**Fund lineup** — the public copy has been withdrawn from the EFAST2 bucket (403)");
    else if (s && s.tp) gaps.push("**Fund lineup** — the schedule is a single 'interest in master trust' line, with no trust linked");
    else if (s && s.s) gaps.push("**Fund lineup** — a schedule was found but the holdings do not reconcile to plan assets, so it is withheld rather than shown wrong");
    else gaps.push("**Fund lineup** — no schedule found");
  }
  // 2. the plan-feature fields, all read from the audit notes
  const feat = s && s.f;
  if (!feat) gaps.push("**Match, vesting, Roth/after-tax** — no readable audit notes in the public PDF");
  // 3. recordkeeper comes from Schedule C, not the notes
  if (!g(r, "recordkeeper")) gaps.push("**Recordkeeper** — no Schedule C service-provider row identifies one");

  if (!gaps.length) continue;
  rows.push({ ack, ein: g(r, "ein"), pn: g(r, "pn"), name: String(g(r, "sponsorName") || "").trim(),
    plan: String(g(r, "planName") || "").trim(), assets, parts, year: g(r, "planYear"), gaps });
}

rows.sort((a, b) => b.assets - a.assets);
const pick = rows.slice(0, N);

const B = (v) => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;
console.log(`# Review list — ${pick.length} full-form filers with a named gap\n`);
console.log(`Generated ${new Date().toISOString().slice(0, 10)} from the live data. Sorted by plan assets.`);
console.log(`Every row is a **full-form** filer, so an audited attachment is legally required — a gap here is a gap in what the public copy contains or in what we can read from it, never a plan that simply doesn't file one.\n`);
console.log(`Of ${rows.length.toLocaleString()} full-form plans over $50M with at least one gap, these are the largest ${pick.length}.\n`);
console.log(`---\n`);
pick.forEach((p, i) => {
  console.log(`### ${i + 1}. ${p.name}`);
  if (p.plan && p.plan.toLowerCase() !== p.name.toLowerCase()) console.log(`*${p.plan}*  `);
  console.log(`**EIN ${p.ein} · PN ${String(p.pn).padStart(3, "0")}** · plan year ${p.year} · ${B(p.assets)} · ${p.parts.toLocaleString()} participants  `);
  console.log(`Filing: [${p.ack}](${pdfUrl(p.ack)})\n`);
  for (const gap of p.gaps) console.log(`- ${gap}`);
  console.log("");
});
