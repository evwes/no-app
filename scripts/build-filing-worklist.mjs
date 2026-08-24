#!/usr/bin/env node
/* wampo — build the filing test worklist for scripts/filing-batch.mjs.
 *
 * Ranked by ASSETS, because a parse defect on a $10B plan matters more than the
 * same defect on a $10M one, and because the defects found so far cluster in
 * large plans (trustee statements, master trusts and multi-page schedules are
 * what big plans file).
 *
 * Suspicion score, highest first:
 *   +3  few or no rows name a manager  -> the column-(a) signature
 *   +2  a single row is most of the lineup -> a subtotal or statement line
 *   +1  a row name looks like a form label or table furniture
 * A plan with none of these still enters the list at the bottom, so the batches
 * eventually sample clean filings too — a test that only ever visits suspects
 * cannot tell you what the base rate is.
 *
 * Usage: node scripts/build-filing-worklist.mjs --index <sec-funds.json> [--n 4000]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, norm } from "./match-sec-tickers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("--n", 4000);
const OUT = arg("--out", path.join(root, "docs/filing-worklist.json"));
const MODE_TOP = arg("--mode", "all");
const idx = buildIndex(arg("--index", path.join(root, "sec-funds.json")));

const namesMgr = (n) => {
  const h = " " + norm(n) + " ";
  for (const m of idx.managers) if (h.includes(" " + m + " ")) return true;
  return false;
};
const SKIP = /participant loan|maturing through|company stock|employer (?:security|stock)|esop|stable value|guaranteed|\bgic\b|annuity|brokerage|self-directed|\bsdba\b|^\s*cash\b|money market|\bstif\b|^managed account|^managed by/i;
// table furniture: a row that is a heading, a form label or a fragment
const FURNITURE = /^(?:cusip|sedol|isin)\b|^total\b|^common\/collective|^corporate stock|^at fair value|^at contract value|^value of interest|^-{3,}|^various\b|^investments?,? at\b|^registered investment companies$|^collective investment fund/i;

const rows = [];
for (let i = 0; i < 64; i++) {
  const p = path.join(root, "data/lineups", String(i).padStart(2, "0") + ".json");
  if (!fs.existsSync(p)) continue;
  const shard = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const ack of Object.keys(shard)) {
    const e = shard[ack];
    if (!e.confident || !e.funds || e.funds.length < 4) continue;
    const funds = e.funds.filter((f) => !SKIP.test((f.type || "") + " " + String(f.name || "")));
    if (funds.length < 4) continue;
    const assets = funds.reduce((a, f) => a + (f.value || 0), 0);
    if (!assets) continue;
    const withMgr = funds.filter((f) => namesMgr(String(f.name || ""))).length;
    const top = Math.max(...funds.map((f) => f.value || 0));
    const furniture = funds.filter((f) => FURNITURE.test(String(f.name || "").trim())).length;

    /* MODE MATTERS. Scoring all three signals together sorts the queue by
     * "most broken overall", and the first 20 filings that produced were all
     * score 6 -- every one of them a wrong-region/statement case, and NONE of
     * them the column-(a) defect. The two defects have overlapping signatures
     * but different populations, so measuring one requires isolating it:
     * --mode issuer keeps ONLY the low-manager-share signal and actively
     * EXCLUDES the dominance and furniture signals, which are what drag
     * statement pages to the top. */
    const MODE = arg("--mode", "all");
    let score = 0;
    if (MODE === "issuer") {
      if (withMgr / funds.length > 0.15) continue;   // must carry the signature
      if (top / assets >= 0.5 || furniture) continue; // and nothing else
      score = 3;
    } else {
      if (withMgr / funds.length <= 0.15) score += 3;
      if (top / assets >= 0.5) score += 2;
      if (furniture) score += 1;
    }

    rows.push({
      ack, rows: funds.length, assets, score,
      /* Carried so the batch tester can tell its own artefacts from real
       * defects. fb means the lineup came from a PRIOR-YEAR filing because the
       * newest one had no readable schedule; the tester downloads the newest
       * filing, so those names are correctly absent from it and the entry is
       * working as designed. ocr means the text came from rasterised pages,
       * which pdftotext will not reproduce. Both scored WRONG_REGION. */
      fb: e.fb || null, ocr: e.ocr ? 1 : 0,
      mgrShare: +(withMgr / funds.length).toFixed(2),
      // the names the batch tester will look for in the filing text; longest
      // first, since a long name is a less ambiguous needle
      names: funds.map((f) => String(f.name || "").trim())
        .filter((n) => n.length >= 8 && !FURNITURE.test(n))
        .sort((a, b) => b.length - a.length).slice(0, 12),
    });
  }
}

rows.sort((a, b) => (b.score - a.score) || (b.assets - a.assets));
const out = rows.filter((r) => r.names.length >= 3).slice(0, N);
fs.writeFileSync(OUT, JSON.stringify(out));
const byScore = {};
for (const r of out) byScore[r.score] = (byScore[r.score] || 0) + 1;
console.log(`wrote ${OUT} [mode=${MODE_TOP}] — ${out.length.toLocaleString()} filings queued (of ${rows.length.toLocaleString()} eligible)`);
for (const k of Object.keys(byScore).sort((a, b) => b - a)) console.log(`  suspicion ${k}: ${byScore[k].toLocaleString()}`);
console.log(`  total assets queued: $${(out.reduce((a, r) => a + r.assets, 0) / 1e12).toFixed(2)}T`);
