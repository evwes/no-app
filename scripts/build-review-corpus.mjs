#!/usr/bin/env node
/* wampo — rebuild the local filing corpus used to diff one parser version
 * against another before a re-parse is spent on it.
 *
 * The corpus lives outside the repo (filings are large) and does NOT survive a
 * container recycle, which is how a whole cycle's worth of downloads was lost
 * on 2026-08-30. Rebuilding it was previously an ad-hoc pile of one-off
 * scripts; this is the repeatable version.
 *
 *   node scripts/build-review-corpus.mjs [count]        # default 200
 *
 * Selection is spread deliberately: the biggest plans (most participants
 * affected by a defect), plus a slice from each class a parser change tends to
 * touch, so a diff sees both the common shapes and the awkward ones. One plan
 * per company, for the same reason the review sampler dedupes.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const DIR = process.env.CORPUS_DIR || "/tmp/wampo-corpus";
const COUNT = Number(process.argv[2]) || 200;
mkdirSync(DIR, { recursive: true });

const all = JSON.parse(readFileSync("plans-all.json", "utf8"));
const F = Object.fromEntries(all.fields.map((f, i) => [f, i]));
const g = (r, k) => r[F[k]];
const entries = {};
for (const f of readdirSync("data/lineups")) {
  Object.assign(entries, JSON.parse(readFileSync("data/lineups/" + f, "utf8")));
}

const rows = [...all.plans].filter((r) => !g(r, "sf"))
  .sort((a, b) => (g(b, "assetsEOY") || 0) - (g(a, "assetsEOY") || 0));

// quarters of the budget: biggest plans, vesting-quote-only, match-quote-only,
// and plans with features but no label of either kind
const quota = Math.max(1, Math.floor(COUNT / 4));
const buckets = {
  biggest: () => true,
  vestingQuoteOnly: (e) => e && e.features && e.features.vestingText && !e.features.vesting,
  matchQuoteOnly: (e) => e && e.features && e.features.matchText && !e.features.match,
  labelled: (e) => e && e.features && (e.features.vesting || e.features.match),
};

const picked = new Map();
const seenEin = new Set();
for (const [name, pred] of Object.entries(buckets)) {
  let n = 0;
  for (const r of rows) {
    if (n >= quota) break;
    const ack = g(r, "ack"), ein = String(g(r, "ein"));
    if (picked.has(ack) || seenEin.has(ein)) continue;
    if (!pred(entries[ack])) continue;
    picked.set(ack, name);
    seenEin.add(ein);
    n++;
  }
  console.log(`${name}: ${n}`);
}

let have = 0, got = 0, failed = 0;
for (const [ack] of picked) {
  const txt = path.join(DIR, ack + ".txt");
  if (existsSync(txt)) { have++; continue; }
  const pdf = path.join(DIR, ack + ".pdf");
  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
  try {
    execFileSync("curl", ["-sf", "--retry", "1", "--max-time", "120", "-o", pdf, url]);
    writeFileSync(txt, execFileSync("pdftotext", ["-layout", "-q", pdf, "-"],
      { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 }));
    got++;
  } catch { failed++; }
}
console.log(`corpus at ${DIR}: ${have} cached, ${got} downloaded, ${failed} unavailable`);
