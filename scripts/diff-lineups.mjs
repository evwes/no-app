#!/usr/bin/env node
/* wampo — diff the working parser's LINEUPS against a committed one over the
 * local corpus, before spending a re-parse.
 *
 * WHY THIS EXISTS. scripts/diff-parser.mjs compares the FEATURE fields (match,
 * vesting, Roth). It reported "no changes" for v101, which was true and also
 * useless: v101 was a lineup fix and the tool cannot see lineups. Three parser
 * versions in a row have now been lineup work, and each was shipped on a
 * single-filing check plus a gate of fifteen specimens. That is how a fix gets
 * projected at 65% of a bucket and delivers 2.5%.
 *
 * So this reports, per filing: does it become confident or stop being
 * confident, does its row count move, and — the one that matters most — does
 * it carry a row whose name is a bare investment-type phrase. That last is the
 * fabricated-fund signature: several real holdings collapsing onto one shared
 * generic name and summing into a holding that does not exist.
 *
 * Usage: node scripts/diff-lineups.mjs <git-ref>     # e.g. the previous version
 *        CORPUS_DIR=/tmp/wampo-corpus (default)
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { loadPlans } from "./lib-schema.mjs";
import { GENERIC_TYPE_NAME } from "./lib-4i.mjs";

const ref = process.argv[2];
if (!ref) { console.error("usage: node scripts/diff-lineups.mjs <git-ref>"); process.exit(2); }
const DIR = process.env.CORPUS_DIR || "/tmp/wampo-corpus";

const tmp = mkdtempSync(path.join(os.tmpdir(), "wampo-ldiff-"));
const basePath = path.join(tmp, "lib-4i-baseline.mjs");
writeFileSync(basePath, execFileSync("git", ["show", `${ref}:scripts/lib-4i.mjs`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

const base = await import(basePath);
const work = await import(new URL("./lib-4i.mjs", import.meta.url).href);
console.log(`baseline ${ref} = v${base.PARSER_VERSION}  ->  working tree = v${work.PARSER_VERSION}\n`);

/* the production confidence predicate, copied so buckets match downstream */
const isConfident = (p) => p.found && p.funds.length >= 3 && (p.ratio || 0) > 0.45 && (p.ratio || 0) < 1.6 &&
  (p.funds.length >= 5 || ((p.ratio || 0) > 0.7 && (p.ratio || 0) < 1.3)) && !p.stmt && !p.trustPtr;

/* a name that is nothing but an investment TYPE is never a real fund; when one
 * carries a large share of a lineup it is several holdings merged onto a
 * shared generic name */
const fabricated = (p) => {
  if (!p.found || !p.funds.length) return 0;
  const sum = p.funds.reduce((s, f) => s + (+f.value || 0), 0) || 1;
  return p.funds.filter((f) => GENERIC_TYPE_NAME.test(String(f.name).trim()) && f.value / sum >= 0.15).length;
};

const P = loadPlans();
const byAck = P.byAck();

/* ENSURE THE SOLVED CLASSES ARE IN THE COMPARISON. The corpus is sampled by
 * assets, so it contains whatever is common rather than whatever is broken:
 * this tool reported "no changes" for v101, v103 and v104 because not one of
 * those defect classes was in it, and three fixes shipped measured only by a
 * single filing each. docs/defect-specimens.json pins one filing per class;
 * anything missing is fetched once and cached into the corpus. */
try {
  const spec = JSON.parse(readFileSync("docs/defect-specimens.json", "utf8")).specimens;
  let fetched = 0;
  for (const sp of spec) {
    const dest = path.join(DIR, `${sp.ack}.txt`);
    if (existsSync(dest)) continue;
    if (!byAck.get(sp.ack)) continue;                 // not in this plans-all
    const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${sp.ack.slice(0, 4)}/${sp.ack.slice(4, 6)}/${sp.ack.slice(6, 8)}/${sp.ack}.pdf`;
    const pdf = path.join(DIR, `${sp.ack}.pdf`);
    try {
      execFileSync("curl", ["-sfL", "--max-time", "180", "-o", pdf, url], { stdio: "ignore" });
      writeFileSync(dest, execFileSync("pdftotext", ["-layout", "-q", pdf, "-"], { encoding: "utf8", maxBuffer: 300 * 1024 * 1024 }));
      fetched++;
    } catch { /* leave it out rather than fail the diff */ }
    finally { try { unlinkSync(pdf); } catch { /* ignore */ } }
  }
  if (fetched) console.log(`(fetched ${fetched} pinned defect specimen(s) into the corpus)\n`);
} catch (e) { console.warn("defect-specimen top-up skipped: " + e.message); }

const gained = [], lost = [], rowMoved = [], fabFixed = [], fabNew = [];
let n = 0;
for (const f of readdirSync(DIR)) {
  if (!f.endsWith(".txt")) continue;
  const ack = f.replace(/\.txt$/, "");
  const row = byAck.get(ack);
  if (!row) continue;
  const assets = +P.get(row, "assetsEOY") || 0;
  if (!assets) continue;
  const text = readFileSync(path.join(DIR, f), "utf8");
  const sponsor = String(P.get(row, "sponsorName") || "");
  const codes = String(P.get(row, "codes") || "");
  let a, b;
  try { a = base.parse4i(text, assets, sponsor, codes); } catch { continue; }
  try { b = work.parse4i(text, assets, sponsor, codes); } catch { continue; }
  n++;
  const ca = isConfident(a), cb = isConfident(b);
  const na = a.found ? a.funds.length : 0, nb = b.found ? b.funds.length : 0;
  const fa = fabricated(a), fb = fabricated(b);
  const label = `${sponsor.trim().slice(0, 38)} [${ack}]`;
  if (!ca && cb) gained.push(`${label}  ${na}->${nb} rows, ratio ${(b.ratio || 0).toFixed(2)}`);
  if (ca && !cb) lost.push(`${label}  ${na}->${nb} rows, ratio ${(a.ratio || 0).toFixed(2)}->${(b.ratio || 0).toFixed(2)}`);
  if (ca === cb && na !== nb) rowMoved.push(`${label}  ${na}->${nb} rows`);
  if (fa > fb) fabFixed.push(`${label}  generic rows ${fa}->${fb}`);
  if (fb > fa) fabNew.push(`${label}  generic rows ${fa}->${fb}   <-- REGRESSION`);
}

const show = (title, arr, cap = 25) => {
  console.log(`${title}: ${arr.length}`);
  for (const l of arr.slice(0, cap)) console.log("   ", l);
  if (arr.length > cap) console.log(`    … ${arr.length - cap} more`);
  console.log("");
};
console.log(`${n} filings compared\n`);
show("CONFIDENCE GAINED", gained);
show("CONFIDENCE LOST  (must be justified or the change is rolled back)", lost);
show("FABRICATED GENERIC ROWS REMOVED", fabFixed);
show("FABRICATED GENERIC ROWS INTRODUCED", fabNew);
show("row count moved, confidence unchanged", rowMoved, 15);
process.exit(fabNew.length ? 1 : 0);
