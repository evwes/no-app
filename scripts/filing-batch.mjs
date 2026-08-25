#!/usr/bin/env node
/* wampo — automated filing test batch.
 *
 * WHY THIS EXISTS. Testing filings by hand is the only way to find parse
 * defects, and doing it by hand is also what makes it slow enough to stall
 * behind report-writing. This does the mechanical half — fetch the filing,
 * read its Schedule H line 4i region, compare it to what wampo stored, and
 * classify the difference — so a batch of ten never waits on prose. The
 * judgement half (is this classification right, what does it mean, what do we
 * change) stays with a reviewer reading this output.
 *
 * It answers one question per filing: DOES OUR STORED LINEUP MATCH THE FILING,
 * and if not, in which of the known ways does it fail?
 *
 *   ISSUER_DROPPED  the filing prints "Fidelity | 500 Index Fund" in columns
 *                   (a) and (b); we stored only "500 Index Fund". Discovered
 *                   2026-08-24 and the single largest defect found so far.
 *   WRONG_REGION    stored names are not in the 4i schedule at all — they came
 *                   from a Statement of Net Assets, a Schedule D page, or a
 *                   trustee statement's security detail.
 *   NAMES_MATCH     stored names appear in the filing as filed. Clean.
 *   NO_TEXT         form-only PDF, or a scanned attachment this pass can't read
 *                   (no OCR here — that is the pipeline's job, not the test's).
 *
 * Usage:
 *   node scripts/filing-batch.mjs [--n 10] [--worklist docs/filing-worklist.json]
 *                                 [--out docs/filing-tests.jsonl]
 * Re-running continues where the last batch stopped: acks already present in
 * the output file are skipped, so the cadence can be a dumb timer.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildIndex, norm } from "./match-sec-tickers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("--n", 10);
const WORKLIST = arg("--worklist", path.join(root, "docs/filing-worklist.json"));
const OUT = arg("--out", path.join(root, "docs/filing-tests.jsonl"));
const TMP = process.env.SCRATCH || "/tmp/wampo-filing-batch";
/* The repo copy is the default. It used to be a scratchpad path, which is a
 * single point of failure for unattended runs: this container is ephemeral and
 * /tmp does not survive a recycle, so every overnight cycle would have failed
 * on a missing index with no one awake to rebuild it. */
const SEC = arg("--index", process.env.SEC_INDEX || path.join(root, "sec-funds.json"));

/* An issuer is a FUND MANAGER, not any text to the left. Without this check the
 * classifier reported "INSTITUTIONAL x5" and "HIGH YIELD BOND FUND x1" as
 * dropped issuers: the first is a wrapped Schedule C provider-name fragment on
 * a service-provider page, the second is part of the fund's own name on a
 * continuation line. Two of the first three ISSUER_DROPPED verdicts were false
 * for this reason. Requiring the left column to name a manager the rest of the
 * system already recognises makes the verdict mean what it says -- and those
 * are the only ones that would gain a ticker from the fix anyway. */
let MGRS = null;
try { MGRS = buildIndex(SEC).managers; }
catch (e) { console.log("WARN: no SEC index, issuer check degraded: " + e.message); }
const isManager = (tok) => {
  if (!MGRS) return true;
  const h = " " + norm(tok) + " ";
  for (const m of MGRS) if (h.includes(" " + m + " ")) return true;
  return false;
};

fs.mkdirSync(TMP, { recursive: true });

// already-tested acks, so a repeated run advances instead of repeating
const done = new Set();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).ack); } catch { /* partial last line */ }
  }
}

const work = JSON.parse(fs.readFileSync(WORKLIST, "utf8"));
const batch = work.filter((w) => !done.has(w.ack)).slice(0, N);
if (!batch.length) { console.log("worklist exhausted — regenerate it"); process.exit(0); }

const pdfUrl = (ack) => {
  const y = ack.slice(0, 4), m = ack.slice(4, 6), d = ack.slice(6, 8);
  return `https://efast2-filings-public.s3.amazonaws.com/prd/${y}/${m}/${d}/${ack}.pdf`;
};

/* Find the line in the filing that carries a stored fund name, and report what
 * sits to its LEFT.
 *
 * The first version searched the whole document for the name and treated any
 * leading text as an issuer. That matched prose in the notes ("Risks and
 * Uncertainties — The Plan utilizes...") and form labels ("a Name of MTIA,
 * CCT, PSA..."), and reported them as dropped issuers. Three structural
 * conditions separate a real two-column table row from a sentence that happens
 * to contain a fund name:
 *   1. a WIDE GAP (3+ spaces) between the issuer and the product — columns are
 *      laid out, sentences are not;
 *   2. a VALUE to the right of the name — every 4i row carries one;
 *   3. the left text is name-shaped: a few words, no sentence punctuation, not
 *      a form label, not a number.
 * All three, or it does not count. */
const VALUE_RIGHT = /[\d,]{4,}(?:\.\d\d)?\s*$/;
const PROSE = /[.:;—]|\b(?:the|of|and|is|are|was|were|which|that|percent|plan|total|note)\b/i;
const FORM_LABEL = /^[a-e]\s|^\(\d|^\d/;
/* Parser residue makes a stored name unfindable in the filing that produced it.
 * Report #14 found the third case: the cost column's "N/R" glued onto every
 * name made ACI Worldwide score WRONG_REGION 0/12 on a schedule the parser had
 * read correctly. The first two were prior-year and OCR entries, handled by
 * their own verdicts. This strips known residue and retries, so a stored name
 * is judged on the fund it names rather than on what the parser welded to it. */
const RESIDUE = [
  /\s*\bN\/?R\b\s*$/i, /\s*\bN\/?A\b\s*$/i, /\s*\*+\s*$/, /\s*\$?0\.00\s*$/,
  /\s*-\s*See.*$/i, /\s*\(see note.*$/i, /\s*#\s*$/, /\s+0$/,
  /\s+[—–]\s*$/,  // empty cost column's em dash, glued to every name (BWXT, report #18)
];
function stripResidue(name) {
  let n = name, prev;
  do { prev = n; for (const re of RESIDUE) n = n.replace(re, ""); } while (n !== prev);
  return n.trim();
}

function issuerBefore(lines, name) {
  const needle = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (needle.length < 10) return null;            // short names are ambiguous
  let seen = null;
  for (const raw of lines) {
    const low = raw.toLowerCase();
    const at = low.indexOf(needle);
    if (at < 0) continue;
    const rest = raw.slice(at + needle.length);
    if (!VALUE_RIGHT.test(rest)) continue;         // no value -> not a table row
    seen = { found: true, issuer: null };
    const left = raw.slice(0, at);
    const gap = left.match(/\s{3,}$/);             // column gap, not a word space
    if (!gap) return seen;
    const tok = left.slice(0, left.length - gap[0].length).replace(/^[\s*]+/, "").trim();
    if (!tok || tok.length < 3 || tok.length > 46) return seen;
    if (PROSE.test(tok) || FORM_LABEL.test(tok)) return seen;
    if (tok.split(/\s+/).length > 5) return seen;
    if (!isManager(tok)) return seen;
    return { found: true, issuer: tok };
  }
  return seen;
}

const results = [];
for (const w of batch) {
  const rec = { ack: w.ack, ein: w.ein || null, plan: w.plan || null, rows: w.rows,
    assets: w.assets, tested: new Date().toISOString() };
  const pdf = path.join(TMP, w.ack + ".pdf");
  const txt = path.join(TMP, w.ack + ".txt");
  try {
    execFileSync("curl", ["-sS", "--max-time", "120", "-o", pdf, pdfUrl(w.ack)]);
    execFileSync("pdftotext", ["-layout", pdf, txt]);
  } catch (e) {
    rec.verdict = "FETCH_FAIL"; rec.note = String(e.message).slice(0, 120);
    results.push(rec); continue;
  }
  let text = "";
  try { text = fs.readFileSync(txt, "utf8"); } catch { /* empty */ }
  const lines = text.split("\n");
  rec.chars = text.length;

  if (text.length < 4000) { rec.verdict = "NO_TEXT"; results.push(rec); continue; }
  /* Two verdicts that are NOT defects, separated out because lumping them into
   * WRONG_REGION overstated it: measured over the first 98 filings, prior-year
   * entries were 5 of 19 WRONG_REGION against 1 of 56 NAMES_MATCH -- a 13x
   * enrichment that is entirely explained by this tester fetching the newest
   * filing while the entry was built from an older one. OCR entries cannot be
   * found by pdftotext at all, which the previous run flagged as a permanent
   * blind spot. */
  if (w.fb) { rec.verdict = "PRIOR_YEAR_SOURCE"; rec.note = `lineup built from the ${w.fb} filing`; results.push(rec); continue; }
  if (w.ocr) { rec.verdict = "OCR_SOURCE"; rec.note = "lineup built from OCR; pdftotext cannot reproduce it"; results.push(rec); continue; }
  rec.hasIssuerHeader = /identity of\s+(?:issue|issuer|party)/i.test(text)
    || /Identity of issue, borrower/i.test(text);

  let found = 0, withIssuer = 0;
  const issuers = new Map();
  for (const name of w.names) {
    let hit = issuerBefore(lines, name);
    const bare = stripResidue(name);
    if (!hit && bare !== name && bare.length >= 10) { hit = issuerBefore(lines, bare); if (hit) rec.residue = (rec.residue || 0) + 1; }
    /* Fifth artefact class (report #22): the parser also normalizes MID-name
     * text — Whiting-Turner's "Treasury Notes, interest rate 1.125%" was
     * stored as "Treasury Notes rate 1.125%", so no contiguous needle can
     * match and 46 correctly-parsed rows scored WRONG_REGION 0/12. Fallback:
     * the stored name's tokens must appear IN ORDER in a line that carries a
     * value — insertions ("interest") and punctuation stop mattering. Loose
     * matches count only toward found-in-filing, never toward issuer
     * detection, and are tallied separately so a verdict that leaned on them
     * is visible as such. */
    if (!hit) {
      const toks = bare.toLowerCase().match(/[a-z0-9.%-]+/g) || [];
      if (toks.length >= 3) {
        for (const raw of lines) {
          if (!VALUE_RIGHT.test(raw)) continue;
          const lt = raw.toLowerCase().match(/[a-z0-9.%-]+/g) || [];
          let i = 0;
          for (const t of lt) if (t === toks[i] && ++i === toks.length) break;
          if (i === toks.length) { hit = { found: true, issuer: null }; rec.loose = (rec.loose || 0) + 1; break; }
        }
      }
    }
    if (!hit) continue;
    found++;
    if (hit.issuer) { withIssuer++; issuers.set(hit.issuer, (issuers.get(hit.issuer) || 0) + 1); }
  }
  rec.namesChecked = w.names.length;
  rec.namesFoundInFiling = found;
  rec.namesWithIssuerToLeft = withIssuer;
  rec.issuers = [...issuers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n} x${c}`);

  /* v67 keeps the identity column, so "the filing prints an issuer" is no
   * longer the same claim as "we lost it". When the stored entry already
   * carries issuers on most rows, the filing's issuer column is EVIDENCE OF
   * A FIX, not of a defect — report it as ISSUER_KEPT so the cadence stops
   * re-reporting a solved problem. */
  rec.issShare = w.issShare ?? null;
  if (found === 0) rec.verdict = "WRONG_REGION";
  else if (withIssuer / found >= 0.6 && (w.issShare ?? 0) >= 0.5) rec.verdict = "ISSUER_KEPT";
  else if (withIssuer / found >= 0.6) rec.verdict = "ISSUER_DROPPED";
  else if (found / w.names.length < 0.4) rec.verdict = "WRONG_REGION";
  else rec.verdict = "NAMES_MATCH";
  results.push(rec);
  try { fs.unlinkSync(pdf); fs.unlinkSync(txt); } catch { /* best effort */ }
}

fs.appendFileSync(OUT, results.map((r) => JSON.stringify(r)).join("\n") + "\n");

const tally = {};
for (const r of results) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
console.log(`batch of ${results.length}  (${done.size} previously tested)`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${v}`);
console.log("");
for (const r of results) {
  console.log(`${r.verdict.padEnd(16)} ${r.ack}  ${String(r.rows).padStart(3)} rows  $${(r.assets / 1e9).toFixed(1)}B`);
  /* The label has to follow the verdict, not the detection. Once ISSUER_KEPT
   * existed, printing "issuers dropped" under it reported a fixed defect as a
   * live one — the same stale-claim mistake the verdict was added to end. */
  if (r.issuers && r.issuers.length) {
    const lbl = r.verdict === "ISSUER_KEPT" ? `issuers KEPT (stored on ${Math.round((r.issShare || 0) * 100)}% of rows)`
      : r.verdict === "NAMES_MATCH" ? "issuers in the filing, partly stored"
        : "issuers dropped";
    console.log(`                 ${lbl}: ${r.issuers.join(", ")}`);
  }
  else if (r.verdict === "WRONG_REGION") console.log(`                 ${r.namesFoundInFiling}/${r.namesChecked} stored names appear in the filing text`);
}
