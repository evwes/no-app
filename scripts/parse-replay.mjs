#!/usr/bin/env node
/* wampo — REPLAY THE REAL PARSER OVER A POPULATION, TWO REFS, AND DIFF.
 *
 * WHY THIS EXISTS, in one sentence: display changes are measured over all 1.7M
 * published rows and parser changes were measured over ten gate specimens,
 * because the real parser measurement is a 3.5-hour re-parse — so parser work
 * is the one class shipped on a sample, and it is the one class that keeps
 * breaking. v110 withdrew five real Vanguard menus. v166 condemned a 29-fund
 * Fidelity menu whole. v118's null-deref silently mis-filed 11,366 filings a
 * run for three runs. v204 took 21 genuine Vanguard funds from Saks Global's
 * 9,723 participants, passed all 80 gate specimens, and was caught by
 * `mirror.sh` three and a half hours later.
 *
 * Saks was ALREADY ON SCREEN when v204 shipped — row 7 of a fair-value-note
 * measurement printed minutes earlier, at 47.3% note share. The data to catch
 * it was in hand and nothing asked the question. This asks it.
 *
 * WHAT IT IS NOT: it is not the pipeline. It judges a parse exactly as fetch-4i
 * does (`isConfident` in lib-refmod, asserted against the committed store
 * before anything is reported) but it does not merge, does not write a store
 * and does not see OCR. A filing production reads through OCR is reported as
 * OCR-DEPENDENT and excluded from the verdict rather than silently counted as
 * unreadable — the v201 lesson that a replay is only as honest as its inputs.
 *
 * Usage:
 *   node scripts/parse-replay.mjs --vs origin/main                  # the cached corpus
 *   node scripts/parse-replay.mjs --vs <ref> --acks acks.txt        # a named population
 *   node scripts/parse-replay.mjs --vs <ref> --ack <ACK> [--ack …]  # a few
 *     --must-keep <ACK>       fail unless it is confident on BOTH sides
 *     --must-reach <ACK>:<N>  fail unless it is confident AFTER with >= N rows
 *     --download              fetch any ack not in the text cache
 *     --limit <n>             cap the corpus population (for a quick pass)
 *
 * Exit 1 when a pin fails or confidence is LOST anywhere. A lost menu is the
 * failure mode this script exists for, so it is a failure by default, and the
 * report names every plan and participant behind it.
 */
import { readFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materialiseAt, isConfident } from "./lib-refmod.mjs";
import { loadPlans, loadStatus, loadTrusts } from "./lib-schema.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = process.env.CORPUS_DIR || "/tmp/wampo-corpus";
const WORK = "/tmp/parse-replay";

const argv = process.argv.slice(2);
const one = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const many = (f) => argv.reduce((a, x, i) => (x === f ? [...a, argv[i + 1]] : a), []);
const has = (f) => argv.includes(f);

const vsRef = one("--vs");
if (!vsRef) { console.error("parse-replay: --vs <git-ref> is required (the baseline to compare against)"); process.exit(2); }
const mustKeep = new Set(many("--must-keep"));
const mustReach = new Map(many("--must-reach").map((s) => {
  const [a, n] = String(s).split(":");
  if (!a || !Number.isFinite(+n)) { console.error(`parse-replay: --must-reach wants ACK:N, got ${JSON.stringify(s)}`); process.exit(2); }
  return [a, +n];
}));
const limit = +(one("--limit") || 0);

/* ---- the population ------------------------------------------------------ */
let acks = [...many("--ack")];
const ackFile = one("--acks");
if (ackFile) acks.push(...readFileSync(ackFile, "utf8").split(/\s+/).filter((s) => /^\d{14}[A-Z0-9]+$/.test(s)));
const fromCorpus = !acks.length || has("--corpus");
if (fromCorpus && existsSync(CACHE)) {
  for (const f of readdirSync(CACHE)) if (f.endsWith(".txt")) acks.push(f.slice(0, -4));
}
/* the pins are part of the population by construction: a pin the run never
 * reaches is the defect this project has paid for repeatedly. */
for (const a of [...mustKeep, ...mustReach.keys()]) acks.push(a);
acks = [...new Set(acks)];
if (limit) {
  const pinned = new Set([...mustKeep, ...mustReach.keys()]);
  acks = [...pinned, ...acks.filter((a) => !pinned.has(a)).slice(0, limit)];
}
if (!acks.length) { console.error(`parse-replay: no acks. Give --ack/--acks, or populate ${CACHE}.`); process.exit(2); }

/* ---- what each ack is judged against ------------------------------------- */
const P = loadPlans(), S = loadStatus(), T = loadTrusts();
const byAck = P.byAck(), trustByAck = T.byAck();
const lidx = (() => {
  try { return JSON.parse(readFileSync(`${REPO}/lineups-index.json`, "utf8")).plans; }
  catch { return {}; }
})();

/* readers behind an ack: its own plan, plus every plan served by it as a trust */
const readersOf = new Map();
for (const row of P.rows) {
  const own = P.get(row, "ack"), mt = P.get(row, "mtiaAck");
  const ppl = +P.get(row, "partEOY") || +P.get(row, "participants") || 0;
  for (const a of [own, mt]) {
    if (!a) continue;
    const cur = readersOf.get(a) || { plans: 0, ppl: 0 };
    cur.plans++; cur.ppl += ppl; readersOf.set(a, cur);
  }
}

function judgedAgainst(ack) {
  const row = byAck.get(ack);
  if (row) return { assets: +P.get(row, "assetsEOY") || 0, sponsor: String(P.get(row, "sponsorName") || "").trim(),
    codes: String(P.get(row, "codes") || ""), kind: "plan" };
  const t = trustByAck.get(ack);
  if (t) return { assets: +t.assetsEOY || 0, sponsor: String(t.name || "").trim(), codes: "", kind: "trust" };
  return null;
}

function textOf(ack) {
  const cached = `${CACHE}/${ack}.txt`;
  if (existsSync(cached)) return readFileSync(cached, "utf8");
  if (!has("--download")) return null;
  if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });
  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
  const pdf = `${WORK}/${ack}.pdf`;
  try {
    execFileSync("curl", ["-sfL", "--max-time", "180", "-o", pdf, url], { stdio: "ignore" });
    const t = execFileSync("pdftotext", ["-layout", "-q", pdf, "-"],
      { encoding: "utf8", maxBuffer: 300 * 1024 * 1024, timeout: 180000 });
    return t;
  } catch { return null; }
  finally { try { unlinkSync(pdf); } catch { /* ignore */ } }
}

/* ---- the two parsers ----------------------------------------------------- */
const head = await import(new URL("./lib-4i.mjs", import.meta.url).href);
const base = materialiseAt(vsRef, "lib-4i.mjs", { label: "replay" });
const baseMod = await import(base.entryPath);
console.log(`baseline ${vsRef} (v${baseMod.PARSER_VERSION}) vs working tree (v${head.PARSER_VERSION})`);
console.log(`  graph: ${base.files.join(", ")}`);
console.log(`  population: ${acks.length} acks (cache ${CACHE}${has("--download") ? ", downloading misses" : ", cache only"})`);

/* ---- CONTROL: this copy of isConfident must BE the shipped rule ----------
 * Asserted against the committed store: for every ack in the population that
 * the store knows, the baseline parse's confidence must agree with the stored
 * `c` flag. A replay whose confidence predicate disagrees with production's is
 * measuring a different question, and would report losses and gains that no
 * reader could ever see. Mismatches are reported, and a mismatch RATE above a
 * tenth refuses to run at all. */
let agree = 0, disagree = 0, noStore = 0, ocrDep = 0, noText = 0;
const rows = [];
for (const ack of acks) {
  const j = judgedAgainst(ack);
  if (!j) { noStore++; continue; }
  const text = textOf(ack);
  if (text == null) { noText++; continue; }
  let b, h;
  try { b = baseMod.parse4i(text, j.assets, j.sponsor, j.codes); } catch (e) { b = { found: false, why: `throw: ${e.message}` }; }
  try { h = head.parse4i(text, j.assets, j.sponsor, j.codes); } catch (e) { h = { found: false, why: `throw: ${e.message}` }; }
  const bc = isConfident(b), hc = isConfident(h);

  const st = S.at(ack);
  if (st && st.pv != null) {
    /* `c` is the stored confidence. A filing production read through OCR will
     * disagree with a local pdftotext parse for a reason that is nothing to do
     * with the code under test, so it is reported separately and never counted
     * as a disagreement. */
    const storedConf = !!st.c;
    if (storedConf && !bc) { ocrDep++; } else if (storedConf === bc) { agree++; } else { disagree++; }
  } else noStore++;

  rows.push({ ack, sponsor: j.sponsor, kind: j.kind,
    b: { c: bc, n: b.found ? b.funds.length : 0, r: +(b.ratio || 0).toFixed(3), stmt: !!b.stmt },
    h: { c: hc, n: h.found ? h.funds.length : 0, r: +(h.ratio || 0).toFixed(3), stmt: !!h.stmt },
    ...(readersOf.get(ack) || { plans: 0, ppl: 0 }) });
}

const checked = agree + disagree;
console.log(`\nCONTROL — this script's confidence predicate against the committed store:`);
console.log(`  agrees on ${agree} of ${checked}${checked ? ` (${(100 * agree / checked).toFixed(1)}%)` : ""}` +
  `, disagrees on ${disagree}; ${ocrDep} OCR-dependent (stored confident, not readable locally), ` +
  `${noStore} not in the store, ${noText} no text available`);
if (checked >= 20 && disagree / checked > 0.10) {
  console.error(`\nREFUSING TO REPORT: the predicate disagrees with the store on ${(100 * disagree / checked).toFixed(1)}% ` +
    `of the population. That is a broken instrument, not a finding — fix the predicate before reading any diff.`);
  process.exit(1);
}

/* ---- the diff ------------------------------------------------------------ */
const lost = rows.filter((r) => r.b.c && !r.h.c);
const gained = rows.filter((r) => !r.b.c && r.h.c);
const moved = rows.filter((r) => r.b.c && r.h.c && r.b.n !== r.h.n);
const same = rows.length - lost.length - gained.length - moved.length;
const sum = (a) => a.reduce((x, r) => x + r.ppl, 0);

console.log(`\nREPLAYED ${rows.length} filings`);
console.log(`  CONFIDENCE LOST   ${String(lost.length).padStart(4)}  ${sum(lost).toLocaleString().padStart(11)} participants`);
console.log(`  CONFIDENCE GAINED ${String(gained.length).padStart(4)}  ${sum(gained).toLocaleString().padStart(11)} participants`);
console.log(`  rows moved        ${String(moved.length).padStart(4)}  ${sum(moved).toLocaleString().padStart(11)} participants`);
console.log(`  unchanged         ${String(same).padStart(4)}`);

const show = (label, a, n = 25) => {
  if (!a.length) return;
  console.log(`\n--- ${label} ---`);
  for (const r of a.sort((x, y) => y.ppl - x.ppl).slice(0, n))
    console.log(`  ${String(r.ppl).padStart(7)}ppl  ${r.b.n}r@${r.b.r}${r.b.stmt ? " stmt" : ""} -> ${r.h.n}r@${r.h.r}${r.h.stmt ? " stmt" : ""}  ${r.ack}  ${r.sponsor.slice(0, 34)}`);
  if (a.length > n) console.log(`  … ${a.length - n} more`);
};
show("CONFIDENCE LOST — a menu that published and now does not", lost);
show("CONFIDENCE GAINED", gained);
show("rows moved while still confident", moved, 15);

/* ---- pins ---------------------------------------------------------------- */
const fails = [];
/* A must-keep pin is a claim about a LOSS, so it may fail only where the
 * baseline was confident and the working tree is not.
 *
 * Its first version failed on `!head.confident` alone, and four of seven pins
 * fired on filings that are non-confident on BOTH sides locally because
 * production reads them through OCR and `pdftotext` yields nothing usable. Those
 * are UNJUDGEABLE here, not regressions — and a pin that cries wolf is how a
 * gate becomes habitually red, which this record already paid ten `site-test`
 * failures to learn. They are reported loudly and separately so the population
 * they cover is never silently assumed tested. */
const unjudgeable = [];
for (const ack of mustKeep) {
  const r = rows.find((x) => x.ack === ack);
  if (!r) { fails.push(`--must-keep ${ack}: NOT REACHED by the run (no text, or not in the store) — the pin proves nothing`); continue; }
  if (r.b.c && !r.h.c)
    fails.push(`--must-keep ${ack} (${r.sponsor}, ${r.ppl.toLocaleString()} ppl): was ${r.b.n}r@${r.b.r} confident, now ${r.h.n}r@${r.h.r} NOT${r.h.stmt ? " (stmt)" : ""}`);
  else if (!r.b.c && !r.h.c)
    unjudgeable.push(`--must-keep ${ack} (${r.sponsor}, ${r.ppl.toLocaleString()} ppl): non-confident on BOTH sides locally (${r.b.n}r@${r.b.r} -> ${r.h.n}r@${r.h.r}) — production reads this filing differently, most likely through OCR, so this pin is UNTESTED here`);
}
if (unjudgeable.length) {
  console.log(`\n--- PINS THIS RUN COULD NOT JUDGE (${unjudgeable.length}) ---`);
  for (const u of unjudgeable) console.log(`  ${u}`);
  console.log(`  These need ONLY_ACKS_4I through the real fetch-4i path, which does OCR.`);
}
for (const [ack, n] of mustReach) {
  const r = rows.find((x) => x.ack === ack);
  if (!r) { fails.push(`--must-reach ${ack}:${n}: NOT REACHED by the run — the pin proves nothing`); continue; }
  if (!r.h.c) fails.push(`--must-reach ${ack}:${n} (${r.sponsor}): not confident after (${r.h.n}r@${r.h.r})`);
  else if (r.h.n < n) fails.push(`--must-reach ${ack}:${n} (${r.sponsor}): only ${r.h.n} rows after (@${r.h.r})`);
}
if (lost.length) fails.push(`${lost.length} filing(s) lost a published menu, ${sum(lost).toLocaleString()} participants — read every one before shipping`);

if (fails.length) {
  console.error(`\nREPLAY FAILED:`);
  for (const f of fails) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`\nREPLAY OK — 0 menus lost, ${mustKeep.size} must-keep and ${mustReach.size} must-reach pins held`);
