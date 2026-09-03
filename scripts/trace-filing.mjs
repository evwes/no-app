#!/usr/bin/env node
/* wampo — run the PRODUCTION parser over one filing and show its working.
 *
 * The standing rule is: instrument before believing a cause. It has been right
 * every time it was followed and wrong every time it was skipped — on
 * 2026-09-02/03 the cause reasoned from the page layout was wrong four times
 * running, and the cause printed from the parser's own state was right in a
 * single run each time.
 *
 * Before this script that meant copying lib-4i.mjs to /tmp, injecting a
 * console.log and importing the copy: four hand-patches in two days, each one
 * an opportunity to instrument a different file from the one production uses.
 * Now the hooks are in lib-4i itself, off unless asked for, and this is the
 * front door.
 *
 *   node scripts/trace-filing.mjs <ack>                      summary only
 *   WAMPO_TRACE=rows  node scripts/trace-filing.mjs <ack>    per-row naming
 *   WAMPO_TRACE=cands node scripts/trace-filing.mjs <ack>    region scoring
 *   WAMPO_TRACE=rows WAMPO_TRACE_MATCH=2585344 node scripts/trace-filing.mjs <ack>
 *   node scripts/trace-filing.mjs <ack> --vs <git-ref>       compare to a version
 *
 * Assets and sponsor come from plans-all, so the parse matches what the
 * pipeline actually does — passing a plan's assets to a trust parse (or a
 * rounded figure) silently changes the ratio and has produced three
 * "experiments" that measured nothing.
 */
import { readFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { loadPlans, loadStatus, loadTrusts } from "./lib-schema.mjs";

const ack = process.argv[2];
if (!ack) { console.error("usage: node scripts/trace-filing.mjs <ack> [--vs <git-ref>]"); process.exit(2); }
const vsIdx = process.argv.indexOf("--vs");
const vsRef = vsIdx > 0 ? process.argv[vsIdx + 1] : null;

const P = loadPlans();
const S = loadStatus();
const row = P.byAck().get(ack);

/* a trust's own filing must be judged against the TRUST's assets, never the
 * member plan's — that mistake made parse4i return found=false and wasted an
 * afternoon on three invalid experiments */
let assets = 0, sponsor = "", codes = "", what = "";
if (row) {
  assets = +P.get(row, "assetsEOY") || 0;
  sponsor = String(P.get(row, "sponsorName") || "").trim();
  codes = String(P.get(row, "codes") || "");
  what = `plan  ${sponsor}`;
} else {
  const t = loadTrusts().byAck().get(ack);
  if (!t) { console.error(`ack ${ack} is in neither plans-all nor mtias — cannot judge a ratio without assets`); process.exit(1); }
  assets = +t.assetsEOY || 0; sponsor = String(t.name || "").trim();
  what = `TRUST ${sponsor}`;
}

const CACHE = process.env.CORPUS_DIR || "/tmp/wampo-corpus";
const W = "/tmp/trace-filing";
if (!existsSync(W)) mkdirSync(W, { recursive: true });

let text;
const cached = `${CACHE}/${ack}.txt`;
if (existsSync(cached)) { text = readFileSync(cached, "utf8"); }
else {
  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
  const pdf = `${W}/${ack}.pdf`;
  execFileSync("curl", ["-sfL", "--max-time", "180", "-o", pdf, url], { stdio: "ignore" });
  text = execFileSync("pdftotext", ["-layout", "-q", pdf, "-"], { encoding: "utf8", maxBuffer: 300 * 1024 * 1024 });
  try { unlinkSync(pdf); } catch { /* ignore */ }
}

const isConfident = (p) => p.found && p.funds.length >= 3 && (p.ratio || 0) > 0.45 && (p.ratio || 0) < 1.6 &&
  (p.funds.length >= 5 || ((p.ratio || 0) > 0.7 && (p.ratio || 0) < 1.3)) && !p.stmt && !p.trustPtr;

const report = (tag, mod) => {
  const p = mod.parse4i(text, assets, sponsor, codes);
  console.log(`\n${tag} (v${mod.PARSER_VERSION}): ${p.found
    ? `${p.funds.length} rows, ratio ${(p.ratio || 0).toFixed(3)}, stmt=${!!p.stmt}, trustPtr=${!!p.trustPtr}, CONFIDENT=${isConfident(p)}`
    : "NOT FOUND"}`);
  if (p.found) {
    const sum = p.funds.reduce((s, f) => s + (+f.value || 0), 0);
    for (const f of p.funds.slice(0, 12)) {
      console.log(`   ${String(f.value).padStart(14)}  ${(100 * f.value / (sum || 1)).toFixed(1).padStart(5)}%  ${String(f.name).slice(0, 56)}${f.iss ? `   [iss ${f.iss}]` : ""}`);
    }
    if (p.funds.length > 12) console.log(`   … ${p.funds.length - 12} more`);
  }
  return p;
};

const st = S.at(ack);
console.log(`${what}\n  assets $${(assets / 1e9).toFixed(3)}B   stored status: ${st ? JSON.stringify({ pv: st.pv, c: st.c, s: st.s, f: st.f, e: st.e, tp: st.tp }) : "(none)"}`);
console.log(`  text ${text.length.toLocaleString()} chars, ${(text.match(/\f/g) || []).length + 1} pages` +
  `, statutory 4i header ${/identity of issue/i.test(text) ? "PRESENT" : "ABSENT"}`);

const work = await import(new URL("./lib-4i.mjs", import.meta.url).href);
if (vsRef) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "trace-"));
  const bp = path.join(tmp, "b.mjs");
  writeFileSync(bp, execFileSync("git", ["show", `${vsRef}:scripts/lib-4i.mjs`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  report(`baseline ${vsRef}`, await import(bp));
}
report("working tree", work);
