#!/usr/bin/env node
/* wampo — IS A PRIOR-YEAR FALLBACK MENU WORTH PUBLISHING?
 *
 * `fetch-4i` falls back to a plan's next-newest full-form filing when the
 * newest has no readable schedule. 1,963 published menus come from one. That
 * rescue is usually right and it is why thousands of plans have a menu at all.
 * But it can publish something worse than nothing, and **nothing standing
 * watches it**:
 *
 *   - `coverageRatio` reads ~1.0, because the dollars are intact.
 *   - `fabricated-name` requires the merged name to be generic or
 *     non-fund-shaped, so a real-looking row passes.
 *   - `swaps-degraded` catches moving OFF a fallback, not sitting ON a bad one.
 *
 * ALBERTSONS IS THE CASE THAT PROVES IT, read against the filing on
 * 2026-11-10: 239,818 readers were shown ten rows from the plan's **2023**
 * filing, three of them OCR debris -- `le 0 0 1f` at $7,433,253,025,
 * `1g 0) 0 th 0 0 1i 0 0 qj`, and `ALBERTSONS COMPANIES, INC.` at $5,579,477
 * against EIN 475579477 -- because the 2025 filing's 4i is a trust pointer.
 * Every count on the record passed it.
 *
 * THIS REQUIRES THE PRESENCE OF THE BAD CASE, never the absence of a good one.
 * Five screens built the other way were each refuted by reading their own
 * members, and every syntactic proxy for an absence leaks. Four signals, each
 * a positive:
 *
 *   STALE     the fallback year is >= 2 years older than the plan year we
 *             DISPLAY. ***THIS IS NOT A DEFECT AND THE REPORT SAYS SO.*** I
 *             first scored it as one -- "a menu from 2010 published as a
 *             plan's current lineup is a wrong claim" -- and then read what
 *             the page actually tells the reader. The entry's own source
 *             string is `Schedule H line 4i attachment from the plan's 2023
 *             filing -- the newest filing's public copy has no readable
 *             schedule`, and `app.js:537` carries it into the report. Old data
 *             that says it is old is honest. It is counted here because the
 *             AGE is worth knowing (one menu is from 2019, six years back),
 *             but it is reported apart from the defect signals, because a
 *             check is a published claim too and calling 436,889 disclosed
 *             readers a defect would be this script's own wrong answer.
 *   DEBRIS    a row name with no alphabetic run of 3+ letters -- `le 0 0 1f`
 *             is not a fund name in any filing.
 *   POINTER   a row whose name says it is an interest in a trust. Those point
 *             AT a lineup; they are not one, which is what `dx=trust` exists
 *             to say about a whole parse.
 *   SPONSOR   the plan sponsor's own distinctive token appearing as a holding.
 *             ***PRECISION IS ABOUT HALF, MEASURED BY READING THE MEMBERS***,
 *             so this signal ranks what to READ and never licenses a fix on
 *             its own. Of the top four read on 2026-11-11: Graphic Packaging
 *             (`Interest in the GPI Savings Plans' Master Trus` as a 3-row
 *             menu) and Americantcs (`AMERICANTCS FIDUCIARY SERVICES, LLC`)
 *             are the Albertsons pattern and genuine; Auto-Owners
 *             (`Auto-Owners Life Deposit administration group`) is an
 *             insurer's OWN deposit-administration contract, which really is
 *             a plan investment, and `Steamfitters Trustee Fund` is plausibly
 *             a real union fund. A screen that finds its own conclusion in
 *             every member it reads has not been shown the members that would
 *             refute it.
 *
 * It measures through the SERVING condition and the publish gate, and resolves
 * readers through MEMBER plans -- a count keyed on plans is blind to every
 * master-trust row, met nine times on this record.
 *
 * Exit 0 always: this SIZES a queued fix (judge a fallback against the
 * FALLBACK YEAR's assets, in `fetch-4i`, needing a bump and a full re-parse)
 * so the bump can be decided on a number. It is a report, not a gate.
 *
 * Usage: node scripts/fallback-quality.mjs [--top 25]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlans, loadStatus } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOP = (() => { const i = process.argv.indexOf("--top"); return i > 0 ? +process.argv[i + 1] : 25; })();

const status = loadStatus().plans;
if (!status || Object.keys(status).length < 10000)
  throw new Error(`SHAPE CONTROL FAILED: status store has ${Object.keys(status || {}).length} entries; the ack map lives under .plans`);
const lidx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
if (!lidx) throw new Error("SHAPE CONTROL FAILED: lineups-index.json has no .plans");
const d = loadPlans();

/* members per serving ack, so readers are summed over MEMBER plans */
const members = new Map();
for (const row of d.rows) {
  const p = {
    ack: d.get(row, "ack"), mtiaAck: d.get(row, "mtiaAck"),
    ein: d.get(row, "ein"), pn: d.get(row, "pn"),
    participants: +d.get(row, "partEOY") || +d.get(row, "participants") || 0,
    planYear: +d.get(row, "planYear") || 0,
    sponsorName: String(d.get(row, "sponsorName") || "").trim(),
  };
  const s = servedLineup(p, lidx);
  if (!s.ack) continue;
  if (!members.has(s.ack)) members.set(s.ack, []);
  members.get(s.ack).push(p);
}

/* ---------- the four positive signals ---------- */
const ALPHA3 = /[A-Za-z]{3}/;
const POINTER = /(plan'?s\s+interest\s+in|interest\s+in\s+(the\s+)?.*master\s+trust|interest\s+in\s+cct)/i;
/* A SPONSOR TOKEN MUST BE DISTINCTIVE AGAINST THE LIVE FUND CORPUS, not
 * against a stoplist I wrote. The first version took any 6+ letter word not on
 * a hand-built list, and its top hits were Topgolf **International** matching
 * `PIMCO International Bond` and Berry **Global** matching `Morgan Stanley
 * Global Fixed Income` -- 140 menus of mostly noise. A hand-built control
 * table tests the cases its author already imagined; the corpus does not. So a
 * token counts only if it appears in fewer than CORPUS_MAX menus across the
 * whole store, and the stoplist stays only as a cheap pre-filter. */
const STOP = new Set(`company companies corporation incorporated holdings limited
group services service systems national american general united savings
retirement investment investments trust trustee partners capital financial
institute association hospital health medical university college district
employees employee benefit benefits plan plans fund funds account accounts`
  .trim().split(/\s+/));
const CORPUS_MAX = 25;            // a token in more menus than this is a fund word
const menuTokens = new Map();     // token -> how many menus anywhere contain it
const rawSponsorTokens = (name) => String(name).toLowerCase().replace(/[^a-z\s]/g, " ")
  .split(/\s+/).filter((w) => w.length >= 6 && !STOP.has(w));
const sponsorTokens = (name) => rawSponsorTokens(name)
  .filter((t) => (menuTokens.get(t) || 0) < CORPUS_MAX);

/* POSITIVE FIXTURE, CARRIED OUT OF THE STORE RATHER THAN INVENTED. These are
 * the verbatim row names v204 published as Albertsons' menu, read from
 * data/lineups shard 27 before v205 withdrew them. The detector must fire
 * DEBRIS and SPONSOR on them, or a zero anywhere below means nothing.
 *
 * It is pinned as literal text, not as a git ref, for two reasons: the entry
 * is GONE from the live store (v205 correctly refused it, which is why the
 * class is invisible to a present-tense scan), and a ref pin would age out of
 * a shallow clone. A synthetic row would under-state any arm keyed on the
 * row's own fields; these are the real ones. */
const ALBERTSONS_V204 = [
  "le 0 0 1f",
  "1g 0) 0 th 0 0 1i 0 0 qj",
  "Common/collective trusts",
  "Investments — Plan's",
  "Plan's interest in investments of the Albertsons Companies Mas",
  "ALBERTSONS COMPANIES, INC.",
  "Interest Income Fund",
  "Plan's interest in the Albertsons Companies Master Trust's inv",
  "Registered investment companies (RICs)",
  "Separately managed accounts",
];

const hits = { STALE: [], DEBRIS: [], POINTER: [], SPONSOR: [] };
let fbServed = 0, fbReaders = 0, rowsSeen = 0;

/* PASS 1 — every confident menu in the store, to learn which words are fund
 * words. Counting over the fallback subset only would let a word common in
 * fund names look distinctive because few fallbacks happen to carry it. */
const fallbackMenus = [];
for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    if (!e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const seen = new Set();
    for (const f of e.funds)
      for (const w of String(f.name || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/))
        if (w.length >= 6) seen.add(w);
    for (const w of seen) menuTokens.set(w, (menuTokens.get(w) || 0) + 1);
    const st = status[ack];
    if (st && st.fb !== undefined) fallbackMenus.push([ack, e, st]);
  }
}
console.log(`  corpus: ${menuTokens.size.toLocaleString()} distinct 6+ letter words across all confident menus`);
if (menuTokens.size < 1000) throw new Error(`CORPUS CONTROL FAILED: only ${menuTokens.size} tokens`);
/* the guard must actually bite on the words that fooled v1 */
for (const w of ["international", "global"])
  if ((menuTokens.get(w) || 0) < CORPUS_MAX)
    throw new Error(`CORPUS CONTROL FAILED: "${w}" appears in only ${menuTokens.get(w)} menus, so the frequency guard would not block it`);

/* PASS 2 — the signals, over served fallback menus only */
{
  for (const [ack, e, st] of fallbackMenus) {
    const mem = members.get(ack);
    if (!mem || !mem.length) continue;                 // not SERVED to anyone
    const ppl = mem.reduce((a, m) => a + m.participants, 0);
    fbServed++; fbReaders += ppl;
    const lead = mem[0];
    const names = e.funds.map((f) => String(f.name || ""));
    rowsSeen += names.length;
    const rec = (sig, why) => hits[sig].push({ ack, ppl, name: lead.sponsorName, fb: st.fb,
      planYear: lead.planYear, n: names.length, why });

    /* STALE — no judgment required */
    if (lead.planYear && st.fb && lead.planYear - st.fb >= 2)
      rec("STALE", `menu from ${st.fb}, plan year displayed ${lead.planYear} (${lead.planYear - st.fb}y old)`);
    /* DEBRIS */
    const debris = names.filter((n) => n.trim() && !ALPHA3.test(n));
    if (debris.length) rec("DEBRIS", `${debris.length} row(s) with no 3-letter word, e.g. ${JSON.stringify(debris[0].slice(0, 40))}`);
    /* POINTER */
    const ptr = names.filter((n) => POINTER.test(n));
    if (ptr.length) rec("POINTER", `${ptr.length} trust-pointer row(s), e.g. ${JSON.stringify(ptr[0].slice(0, 46))}`);
    /* SPONSOR */
    const toks = sponsorTokens(lead.sponsorName);
    if (toks.length) {
      const sp = names.filter((n) => { const l = n.toLowerCase(); return toks.some((t) => l.includes(t)); });
      if (sp.length) rec("SPONSOR", `${sp.length} row(s) carry the sponsor's own name, e.g. ${JSON.stringify(sp[0].slice(0, 46))}`);
    }
  }
}

/* ---------- discharge the fixture ---------- */
{
  const names = ALBERTSONS_V204;
  const debris = names.filter((n) => n.trim() && !ALPHA3.test(n));
  const ptr = names.filter((n) => POINTER.test(n));
  const toks = sponsorTokens("Albertsons Companies, Inc.");
  const sp = names.filter((n) => { const l = n.toLowerCase(); return toks.some((t) => l.includes(t)); });
  const fails = [];
  if (debris.length < 2) fails.push(`DEBRIS fired on ${debris.length} of the pinned rows, expected >= 2 ("le 0 0 1f" and "1g 0) 0 th ...")`);
  if (!ptr.length) fails.push("POINTER fired on none of the pinned rows");
  if (!toks.includes("albertsons")) fails.push(`the sponsor token "albertsons" was filtered out (corpus count ${menuTokens.get("albertsons") || 0}) — the frequency guard is too tight`);
  if (!sp.length) fails.push("SPONSOR fired on none of the pinned rows");
  if (fails.length) {
    console.error("\n  FIXTURE FAILED — the detector cannot see its own motivating case:");
    for (const f of fails) console.error(`    ${f}`);
    process.exit(1);
  }
  console.log(`  fixture: Albertsons' v204 rows trip DEBRIS x${debris.length}, POINTER x${ptr.length}, SPONSOR x${sp.length} — the detector can see the class`);
}

console.log(`\n  PUBLISHED + SERVED menus sourced from a prior-year filing: ${fbServed.toLocaleString()}`);
console.log(`  readers reached by them (member-plan summed): ${fbReaders.toLocaleString()}`);
console.log(`  holding rows in them: ${rowsSeen.toLocaleString()}\n`);

/* CONTROL: a detector that finds nothing on a store known to contain Albertons'
 * class has not been shown able to see it. */
const total = Object.values(hits).reduce((a, v) => a + v.length, 0);
if (!total) {
  console.log("  no signal fired on any of the served fallback menus.");
  console.log("  TREAT THAT AS SUSPECT, NOT CLEAN: Albertsons' 2023-sourced menu was");
  console.log("  exactly this class on 2026-11-10. A detector that fires nowhere has not");
  console.log("  been shown able to fire at all.");
}

const DEFECT = ["DEBRIS", "POINTER", "SPONSOR"];
console.log("  DEFECT SIGNALS — a row that should not be in any menu:");
for (const sig of DEFECT) {
  const ppl = hits[sig].reduce((a, h) => a + h.ppl, 0);
  console.log(`    ${sig.padEnd(8)} ${String(hits[sig].length).padStart(5)} menus   ${ppl.toLocaleString().padStart(12)} readers`);
}
const stalePpl = hits.STALE.reduce((a, h) => a + h.ppl, 0);
console.log(`\n  DISCLOSED, NOT A DEFECT — the entry's source string names the year and`);
console.log(`  app.js:537 carries it into the report, so the reader is told:`);
console.log(`    STALE    ${String(hits.STALE.length).padStart(5)} menus   ${stalePpl.toLocaleString().padStart(12)} readers`);
const oldest = hits.STALE.slice().sort((a, b) => a.fb - b.fb)[0];
if (oldest) console.log(`    oldest: ${oldest.name} fb=${oldest.fb} (${oldest.planYear - oldest.fb}y), ${oldest.ppl.toLocaleString()} readers`);

const union = new Map();
for (const sig of DEFECT) for (const h of hits[sig]) if (!union.has(h.ack)) union.set(h.ack, h);
const unionPpl = [...union.values()].reduce((a, h) => a + h.ppl, 0);
console.log(`\n  ANY DEFECT signal: ${union.size.toLocaleString()} of ${fbServed.toLocaleString()} served fallback menus / ${unionPpl.toLocaleString()} readers`);
console.log(`  (a menu can trip several signals, so the four lines above do not sum)`);

console.log(`\n  TOP ${TOP} BY READERS — read these against their filings before any fix:`);
const ranked = [...union.values()].sort((a, b) => b.ppl - a.ppl).slice(0, TOP);
for (const h of ranked) {
  const sigs = Object.entries(hits).filter(([, l]) => l.some((x) => x.ack === h.ack)).map(([s]) => s).join("+");
  console.log(`  ${h.ppl.toLocaleString().padStart(9)}  ${String(h.name).slice(0, 34).padEnd(34)} fb=${h.fb} rows=${String(h.n).padStart(3)}  ${sigs}`);
  console.log(`             ${h.why}`);
}
