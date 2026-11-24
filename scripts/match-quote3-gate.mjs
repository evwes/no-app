#!/usr/bin/env node
/* wampo — THE GATE FOR v213's THIRD MATCH-QUOTE FALLBACK.
 *
 * WHAT IT PROTECTS, AND WHY A GATE RATHER THAN A FIXTURE LIST. The arm selects
 * on the match WORD and hands every judgment to `matchQuoteOk` plus four
 * refusals. That is a much wider selector than the two shipped loops', so the
 * refusals are the whole safety argument — and *a control that cannot fail is
 * decorative*. This gate therefore does three different things:
 *
 *  1. POSITIVE PINS, BY ACK, THAT THROW ON A MISS. Six filings read by hand
 *     must publish the exact sentence named. A pin keyed on presence alone
 *     cannot tell a right sentence from a wrong one, so the QUOTE is pinned.
 *
 *  2. A NEGATIVE CONTROL PER CONDITION, each on a case where that condition is
 *     the ONLY protection, asserted BY NAME. For every refusal fixture the gate
 *     evaluates ALL conditions on the bad sentence and requires EXACTLY ONE to
 *     reject it, equal to the one named. *A case protected by TWO conditions
 *     cannot fail for either, so it proves neither* — this is the form of that
 *     rule that needs no mutant module, because removing the named condition
 *     from the list provably leaves the sentence ACCEPTED.
 *
 *  3. COUNTER-SPECIMENS FOR WHAT MUST NOT CHANGE. v204 added the former and not
 *     the latter and took 21 real funds off a page. Plans that already publish
 *     a match formula or quote must come out BYTE-IDENTICAL, and that is asked
 *     of the whole feature object, not of the match fields.
 *
 * `--population` additionally re-asks four things of the arm's whole live
 * population, each of which is a claim made in `lib-4i.mjs`'s own comment and
 * therefore has to be checkable: no quote carries FORM-QUESTION text (which
 * `audit-data.mjs` raises as a HIGH), no plan gains or changes a match LABEL,
 * no PUBLISHED quote changes, and the shortest accepted sentence is long enough
 * that the removed length floor was genuinely inert.
 *
 * USAGE
 *   node scripts/match-quote3-gate.mjs --vs <ref|path>   [--population]
 *   node scripts/match-quote3-gate.mjs --selftest
 */
import { readFileSync, existsSync } from "node:fs";
import { matchQuoteOk } from "./lib-quote.mjs";
import { read } from "./lib-filingtext.mjs";
import { scanSentences, PIECES } from "./lib-matchslice.mjs";
import { materialiseAt } from "./lib-refmod.mjs";
import {
  MQ3_REFUSE, matchWeldPhrases, crossesWeldPhrase, extractPlanFeatures,
} from "./lib-4i.mjs";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const one = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

/* BOILER is block-scoped inside `extractPlanFeatures` and cannot be imported,
 * so it is SLICED from the source rather than retyped — the same slice the
 * cause census uses, with the same shape assertion behind it. */
const BOILER = (() => {
  const src = PIECES[0];
  const m = src.match(/^\s*const BOILER = (\/.*\/i);\s*$/);
  if (!m) throw new Error("match-quote3-gate: could not unwrap BOILER out of the slice");
  const re = new RegExp(m[1].slice(1, m[1].lastIndexOf("/")), "i");
  if (!re.test("provide explanation") || re.test("The Company matches 50% of pay"))
    throw new Error("match-quote3-gate: the BOILER slice does not behave like BOILER");
  return re;
})();

/* --------------------------------------------------------------- fixtures */
/* Every ACK here was read by hand on 2026-11-24; the accuracy log for that date
 * carries the reading. The bad sentences are identified by a DISTINCTIVE
 * substring inside one named filing and the gate asserts the substring hits
 * EXACTLY ONE scanned sentence, because a pin that matches two things
 * identifies neither. */
const POSITIVE = [
  { id: "selector-verb-passive", ack: "20260917145749NAL0006535586001", name: "Aecom",
    quote: "Employer Contributions — The participants’ pre-tax and Roth 401(k) contributions made to the Plan are matched 50% by the Company up to 6% of eligible compensation." },
  { id: "selector-noun-after-employer", ack: "20260701105447NAL0016694576001", name: "Becton, Dickinson",
    quote: "Individual employee contributions of up to 6% of eligible compensation are eligible for a matching Company contribution." },
  { id: "selector-bare-noun-match", ack: "20261009091506NAL0035004579001", name: "Geico",
    quote: "The maximum amount of the Companies’ match is one dollar for each dollar of the first 6 percent of eligible compensation that a participant contributes to the Plan." },
  { id: "selector-rate-before-word", ack: "20261013143248NAL0004058097001", name: "Tyson Foods",
    quoteStarts: "The Plan, as amended effective January 1, 1997, allows 100% Sponsor matching contributions on participant deferrals up to 3% of compensation" },
  { id: "selector-parenthetical", ack: "20261008142254NAL0016178787001", name: "Amgen",
    quoteStarts: "In addition, the Company makes a contribution equal to amounts contributed by the participant as pre-tax contributions or Roth contributions" },
  { id: "short-sentence-kept", ack: "20261015100011NAL0007631235001", name: "Jubitz",
    quote: "The Company matches 50%, up to 6%, of employee deferrals." },
  /* A CAP STATED AS A NEGATIVE must be published — the `no-match` refusal's own
   * exception, pinned so a future widening of that refusal cannot eat it. */
  { id: "cap-as-negative-kept", ack: "20260715104425NAL0002846225001", name: "Producers Dairy",
    quote: "There will be no matching contribution in excess of 5% of the compensation." },
];

const REFUSALS = [
  { id: "weld-two-column", cond: "weld", ack: "20261014162515NAL0003209059001", name: "Goldman Sachs",
    find: "Restricted from transferring into or out of the Stock Fund during The Plan offers" },
  { id: "weld-invented-number", cond: "weld", ack: "20260922162735NAL0006264451001", name: "JHM Hotels",
    find: "safe harbor match of 100 4 percent" },
  { id: "weld-flattened-table", cond: "weld", ack: "20261013142219NAL0004040769001", name: "Intermountain",
    find: "Percentage of participant’s Matching compensation contributed contribution" },
  { id: "vesting-schedule", cond: "vest", ack: "20261013181921NAL0002232355001", name: "Qualcomm",
    find: "Participants vest in the Company’s matching and discretionary contributions" },
  { id: "match-removed", cond: "no-match", ack: "20260714071539NAL0000767267002", name: "Quarles & Brady",
    find: "and to remove matching contributions" },
  { id: "combined-heading", cond: "combined-head", ack: "20261008141403NAL0032682272001", name: "Univ. of San Francisco",
    find: "Employer match and profit sharing contributions" },
  { id: "form-page-underscores", cond: "boiler", ack: "20261013105615NAL0004812848001", name: "Dartmouth Health",
    find: "Employer Matching Contributions" },
  { id: "no-rate-in-match-position", cond: "matchQuoteOk", ack: "20261014140340NAL0010782050001", name: "Delta Air Lines",
    find: "withdraw all or a portion of their after-tax contributions" },
];

/* COUNTER-SPECIMENS: plans whose match answer must not move at all. v204 added
 * positive specimens and not these and took 21 real funds off a page.
 *
 * MY FIRST THREE WERE WRONG IN A WAY WORTH RECORDING: I picked PSA Airlines,
 * Xerox and Gilead — all three from the arm's own GAINER list — so the gate
 * failed on the change working. A counter-specimen has to be a plan that
 * ALREADY answers, which is the population the arm is gated out of. These are
 * chosen for spread across the ways a plan can already answer, and every one is
 * verified present in the text cache:
 *   a plain parsed formula; the v210 DISCRETIONARY label (the nearest
 *   neighbour in the same chain); a DOLLAR-capped formula; a withheld
 *   quote-only cell whose quote the page REFUSES; a withheld quote-only cell
 *   whose quote the page PUBLISHES (the one this arm could displace if it were
 *   ordered wrongly); and a named regression plan. */
const COUNTER = [
  /* AND ONE CASE THE GATE'S OWN OUTPUT CORRECTED ME ABOUT. The store publishes
   * JPMorgan Chase's "100% of the first 5% of pay", and this harness's cached
   * text parses to NOTHING — so the live entry came from a different read (OCR,
   * or the prior-year fallback) and the plan is locally in the arm's own
   * reachable population. It is kept, relabelled: the arm must not fire here
   * either, and `match=null` in the output below is the gate reporting that
   * rather than a failure. */
  { ack: "20261008102153NAL0026304945001", name: "JPMorgan Chase (store publishes; cached text parses to nothing)" },
  { ack: "20261015093638NAL0007583331001", name: "ADP TotalSource (v210 discretionary)" },
  { ack: "20260723165543NAL0014354289001", name: "Costco (dollar cap)" },
  { ack: "20260807125158NAL0006445970001", name: "Bank of America (quote the page refuses)" },
  { ack: "20260709065957NAL0017766435001", name: "BAE Systems (quote the page publishes)" },
  { ack: "20261009080419NAL0034920179001", name: "Coca-Cola Beverages Northeast" },
  { ack: "20260212124052NAL0000199392001", name: "Black Hills Surgical Hospital" },
];

/* ---------------------------------------------------------- the conditions */
/* Every test the arm applies, in one list, so a refusal fixture can be asked
 * which ones reject it. The three in MQ3_REFUSE are the shipped array itself —
 * never a copy — and `boiler`/`matchQuoteOk`/`weld` are the arm's other three
 * in the arm's own order. */
const conditionsFor = (welds) => [
  ["boiler", (s) => BOILER.test(s)],
  ["matchQuoteOk", (s) => !matchQuoteOk(s, false)],
  ...MQ3_REFUSE.map(([n, f]) => [n, f]),
  ["weld", (s) => !!crossesWeldPhrase(s, welds)],
];

const MW = "\\bmatch(?:es|ed|ing)?\\b";
function sentencesOf(ack) {
  const raw = read(ack);
  if (!raw) throw new Error(`match-quote3-gate: ${ack} is not in the text cache — populate it with notes-gap-census --download`);
  return { raw, sents: scanSentences(raw, MW), welds: matchWeldPhrases(raw) };
}

/* ------------------------------------------------------------------- report */
let bad = 0;
const fail = (m) => { console.log(`FAIL  ${m}`); bad++; };
const ok = (m) => console.log(`ok    ${m}`);

/* ----------------------------------------------- 1. the positive pins ----- */
async function positives(baseExtract) {
  console.log(`\n--- 1/3  POSITIVE PINS: the arm must publish the sentence read by hand ---`);
  for (const p of POSITIVE) {
    const raw = read(p.ack);
    if (!raw) { fail(`${p.id} (${p.name}) — ${p.ack} is not in the text cache`); continue; }
    const before = baseExtract(raw, p.name) || {};
    const after = extractPlanFeatures(raw, p.name) || {};
    if (before.matchText || before.match)
      { fail(`${p.id} (${p.name}) — the BASELINE already answers (${before.match || "quote"}): this is not a pin for this change`); continue; }
    if (after.match)
      { fail(`${p.id} (${p.name}) — the candidate wrote a LABEL "${after.match}": this arm must write only a quote`); continue; }
    const got = String(after.matchText || "");
    const want = p.quote || p.quoteStarts;
    const hit = p.quote ? got === p.quote : got.startsWith(p.quoteStarts);
    if (!hit) fail(`${p.id} (${p.name}) — quote mismatch\n        want${p.quoteStarts ? " (prefix)" : ""}: ${want}\n        got      : ${got || "(none)"}`);
    else if (!matchQuoteOk(got, false)) fail(`${p.id} (${p.name}) — the quote is stored but the page's own guard refuses it, so no reader sees it`);
    else ok(`${p.id} (${p.name}) — ${got.slice(0, 92)}…`);
  }
}

/* --------------------------- 2. one negative control per condition -------- */
function negatives({ shuffle = false } = {}) {
  console.log(`\n--- 2/3  NEGATIVE CONTROLS: for each case, EXACTLY ONE condition rejects it, by name ---`);
  /* THE SHIFTED EXPECTATION MUST BE A DIFFERENT CONDITION, and the first
   * version shifted by POSITION: three consecutive fixtures name `weld`, so two
   * of the eight were handed their own condition back and passed, and the
   * selftest reported 6 of 8 as a failure of the gate rather than of the
   * shuffle. Shift through the DISTINCT names instead. */
  const distinct = [...new Set(REFUSALS.map((r) => r.cond))];
  for (let i = 0; i < REFUSALS.length; i++) {
    const r = REFUSALS[i];
    const expect = shuffle
      ? distinct[(distinct.indexOf(r.cond) + 1) % distinct.length]
      : r.cond;
    let S;
    try { S = sentencesOf(r.ack); } catch (e) { fail(`${r.id} (${r.name}) — ${e.message}`); continue; }
    const hits = S.sents.filter((x) => x.s.includes(r.find));
    if (hits.length !== 1) {
      fail(`${r.id} (${r.name}) — the pin "${r.find.slice(0, 48)}…" matches ${hits.length} scanned sentences, so it identifies ${hits.length ? "more than one" : "nothing"}`);
      continue;
    }
    const s = hits[0].s;
    const conds = conditionsFor(S.welds);
    const rejecting = conds.filter(([, f]) => f(s)).map(([n]) => n);
    if (rejecting.length !== 1)
      fail(`${r.id} (${r.name}) — ${rejecting.length} conditions reject it (${rejecting.join(", ") || "none"}); a case protected twice proves neither`);
    else if (rejecting[0] !== expect)
      fail(`${r.id} (${r.name}) — rejected by ${rejecting[0]}, expected ${expect}`);
    else {
      /* and WITHOUT it the sentence is accepted — the "only protection" claim */
      const without = conds.filter(([n]) => n !== expect);
      if (without.some(([, f]) => f(s)))
        fail(`${r.id} (${r.name}) — removing ${expect} still leaves it rejected`);
      else ok(`${r.id} (${r.name}) — ONLY ${expect} rejects it; without it the arm would publish "${s.slice(0, 74)}…"`);
    }
    /* finally, the live arm must not actually publish it */
    const after = extractPlanFeatures(S.raw, r.name) || {};
    if (String(after.matchText || "").includes(r.find))
      fail(`${r.id} (${r.name}) — the shipped arm PUBLISHED the bad sentence`);
  }
}

/* --------------------------------------- 3. counter-specimens ------------- */
function counters(baseExtract) {
  console.log(`\n--- 3/3  COUNTER-SPECIMENS: what must not change ---`);
  for (const c of COUNTER) {
    const raw = read(c.ack);
    if (!raw) { fail(`counter ${c.name} — ${c.ack} is not in the text cache`); continue; }
    const before = baseExtract(raw, c.name) || {};
    const after = extractPlanFeatures(raw, c.name) || {};
    const a = JSON.stringify(before), b = JSON.stringify(after);
    if (a !== b) {
      const moved = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      fail(`counter ${c.name} — features changed on [${moved.join(", ")}]`);
    } else ok(`counter ${c.name} — every feature byte-identical (match=${JSON.stringify(after.match || null)})`);
  }
}

/* ------------------------------------- 4. the population claims ----------- */
const AUDIT_SRC_PATH = new URL("./audit-data.mjs", import.meta.url).pathname;
function formQuestionRe() {
  const src = readFileSync(AUDIT_SRC_PATH, "utf8");
  const m = src.match(/const FORM_QUESTION =\s*\n?\s*(\/.*\/i);/);
  if (!m) throw new Error("match-quote3-gate: could not slice FORM_QUESTION out of audit-data.mjs");
  const re = new RegExp(m[1].slice(1, m[1].lastIndexOf("/")), "i");
  if (!re.test("permissive aggregation")) throw new Error("match-quote3-gate: the FORM_QUESTION slice is inert");
  return re;
}
async function population(baseExtract) {
  const CEIL = process.env.MATCH_CEILING_CACHE || "/tmp/wampo-match-ceiling.jsonl";
  if (!existsSync(CEIL)) { fail(`--population needs ${CEIL} — run: node scripts/match-quote-ceiling.mjs`); return; }
  const recs = readFileSync(CEIL, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.b === "C");
  console.log(`\n--- 4  POPULATION: re-asking lib-4i's own four claims over ${recs.length} bucket-C plans ---`);
  const FQ = formQuestionRe();
  let fired = 0, ppl = 0, minLen = Infinity, labels = [], fq = [], quoteMoves = [];
  for (const r of recs) {
    const raw = read(r.ack);
    if (!raw) continue;
    const before = baseExtract(raw, r.name || "") || {};
    const after = extractPlanFeatures(raw, r.name || "") || {};
    if (JSON.stringify(before.match || null) !== JSON.stringify(after.match || null))
      labels.push(`${r.name}: ${before.match || "(none)"} -> ${after.match || "(none)"}`);
    const hadPublished = before.matchText && matchQuoteOk(before.matchText, !!before.match);
    if (hadPublished && before.matchText !== after.matchText) quoteMoves.push(r.name);
    if (!before.matchText && after.matchText) {
      fired++; ppl += r.ppl;
      minLen = Math.min(minLen, after.matchText.length);
      if (FQ.test(after.matchText)) fq.push(`${r.name}: ${after.matchText.slice(0, 90)}`);
    }
  }
  console.log(`      arm fires on ${fired} plans / ${ppl.toLocaleString()} readers`);
  if (!fired) fail("the arm fired on ZERO plans — a broken arm and an inert arm read the same zero");
  else ok(`the arm is live on the data (${fired} plans)`);
  if (labels.length) { fail(`${labels.length} plans gained or changed a match LABEL (must be 0)`); for (const l of labels.slice(0, 6)) console.log(`        ${l}`); }
  else ok("0 plans gain or change a match LABEL");
  if (quoteMoves.length) { fail(`${quoteMoves.length} PUBLISHED quotes changed (must be 0): ${quoteMoves.slice(0, 5).join(", ")}`); }
  else ok("0 published quotes change");
  if (fq.length) { fail(`${fq.length} quotes carry FORM-QUESTION text — audit-data raises this as a HIGH`); for (const l of fq.slice(0, 4)) console.log(`        ${l}`); }
  else ok("0 quotes carry FORM-QUESTION text");
  if (minLen <= 25) fail(`the shortest accepted sentence is ${minLen} characters, so the length floor removed at v213 was NOT inert — restore it`);
  else ok(`the shortest accepted sentence is ${minLen} characters — the removed length floor was inert`);
}

/* ------------------------------------------------------------------ driver */
async function loadBase(spec) {
  if (/[/.]/.test(spec) && existsSync(spec)) {
    const m = await import(new URL(spec, `file://${process.cwd()}/`).pathname);
    if (typeof m.extractPlanFeatures !== "function") throw new Error(`${spec} exports no extractPlanFeatures`);
    return { f: m.extractPlanFeatures, how: `path ${spec} (v${m.PARSER_VERSION})` };
  }
  const at = materialiseAt(spec, "lib-4i.mjs", { label: "wampo-mq3gate" });
  const m = await import(at.entryPath);
  if (typeof m.extractPlanFeatures !== "function") throw new Error(`${spec} exports no extractPlanFeatures`);
  return { f: m.extractPlanFeatures, how: `ref ${spec} (v${m.PARSER_VERSION})` };
}

if (has("--selftest")) {
  console.log("--- SELFTEST: prove this gate can FAIL ---");
  let sbad = 0;
  const mustThrow = async (label, fn) => {
    try { await fn(); console.log(`FAIL  ${label} — did not throw`); sbad++; }
    catch (e) { console.log(`ok    ${label} — ${String(e.message).slice(0, 110)}`); }
  };
  await mustThrow("--vs /nope/missing.mjs", () => loadBase("/nope/missing.mjs"));
  await mustThrow("--vs no-such-ref-20261124", () => loadBase("no-such-ref-20261124"));
  await mustThrow("--vs scripts/lib-schema.mjs (exists, no extractor)", () => loadBase("scripts/lib-schema.mjs"));
  console.log(`\nthe negative controls with every expectation SHIFTED BY ONE — all ${REFUSALS.length} must fail`);
  const before = bad;
  negatives({ shuffle: true });
  const got = bad - before;
  if (got < REFUSALS.length) { console.log(`FAIL  only ${got} of ${REFUSALS.length} shifted expectations were caught`); sbad++; }
  else console.log(`ok    all ${got} shifted expectations caught`);
  bad = before;
  if (sbad) { console.error(`\nSELFTEST FAILED (${sbad}) — this gate's zeros mean nothing.`); process.exit(1); }
  console.log(`\nSELFTEST PASSED — a missing baseline throws and every per-condition control fails when mis-named.`);
  process.exit(0);
}

const spec = one("--vs", null);
if (!spec) {
  console.error("match-quote3-gate: --vs <ref|path> is required (the BEFORE extractor)\n" +
    "  e.g. node scripts/match-quote3-gate.mjs --vs HEAD --population\n" +
    "       node scripts/match-quote3-gate.mjs --selftest");
  process.exit(2);
}
const B = await loadBase(spec);
console.log(`baseline: ${B.how}`);
await positives(B.f);
negatives();
counters(B.f);
if (has("--population")) await population(B.f);
console.log(bad ? `\nGATE FAILED — ${bad} failure(s).` : `\nGATE GREEN.`);
process.exit(bad ? 1 : 0);
