#!/usr/bin/env node
/* wampo — GENERATE `sec-tickers.js`, the last-resort symbol table the report
 * consults when its own resolver chain has nothing. 2026-10-09.
 *
 * WHY THIS FILE EXISTS AT ALL. `sec-funds.json` holds 29,406 SEC series/class
 * rows from the Investment Company Series and Class file, with share classes,
 * and `scripts/match-sec-tickers.mjs` resolves filed holding names against it
 * with rules this project trusts (exact-normalized, or filed tokens superset of
 * the series tokens WITH the manager token, never across managers, and an
 * UNSTATED share class gets a labelled comparable rather than a silently chosen
 * class). The page could not ask it: the predicate needs that 29,406-row index
 * and the browser must never download it. So the question is asked HERE, once,
 * over the rows that are actually published, and only the ANSWERS ship.
 *
 * ONLY ASSERTED ANSWERS ARE EMITTED. A `comparable` answer renders an asterisk
 * and a footnote — a whole category of claim, 224,741 rows reaching 59,709,578
 * participants — and publishing it is the owner's decision, not this script's.
 * `--with-comparables` exists only so the refused half can be re-sized; it
 * writes to stdout and never to the asset.
 *
 * THE GATE IS "THE PAGE HAS NOTHING", and it is asked of the page's own
 * `lookupTicker` through the TRACKED harness `scripts/apppath.mjs`, with the
 * row the page passes. Two consequences, both load-bearing:
 *   - a key is emitted only where the page resolves NOTHING, so the table can
 *     never contradict an answer the page already publishes;
 *   - a row carrying `f.tk` — the symbol the FILING's own code stated — is
 *     excluded, because `renderRow` falls back to `f.tk` when `lookupTicker`
 *     returns null (`tk = info ? info.tk : (f.tk || null)`). Measured over all
 *     1,721,920 published rows: 414 such rows exist, and on 87 of them the SEC
 *     answer is a comparable in the BASE class where the filing's own symbol
 *     names the class held (`MFS Growth Fund R2` -> MEGRX, SEC's base MFEGX).
 *     The 25 where SEC answers exactly all answer the SAME symbol. So the
 *     exclusion costs nothing and is what makes "0 swaps" true BY
 *     CONSTRUCTION rather than by luck.
 *
 * THE KEY IS THE TWO RAW CELLS THE PAGE HOLDS, joined by NUL:
 *     (f.iss || "") + "\u0000" + (f.nameRaw || f.name || "")
 * and nothing is normalized on either side. That is deliberate: a normalizer
 * would be a browser TWIN of `match-sec-tickers.mjs`'s `norm`, and this record
 * carries four twins lost to a generator and seven incomplete transcriptions.
 * An exact string match has no twin to drift. The cost is that the table is
 * keyed on spellings and a spelling absent from it resolves to nothing — which
 * is the honest status quo, never a wrong symbol.
 *
 * `f.nameRaw` IS NOT THE STORED NAME. `cleanCostMarkers` (app.js) strips a
 * trailing `N/R` or `$0.00` first and `f.name` is `cleanFiledName(f.nameRaw)`.
 * That expression is sliced out of app.js here rather than retyped.
 *
 * DRIFT, named rather than hidden: the table is a function of three inputs —
 * the lineup store, `sec-funds.json`, and app.js's own resolver chain. A DOL
 * refresh that brings a new spelling leaves that row blank until this is
 * re-run, and a widening of `fund-er.js` leaves a stale key that can never be
 * reached (the arm runs last). Neither direction can publish a wrong symbol.
 * Re-run it after a parser version lands, and commit `sec-tickers.js` plus a
 * re-stamped `index.html`.
 *
 *   node scripts/gen-sec-tickers.mjs            write sec-tickers.js
 *   node scripts/gen-sec-tickers.mjs --check    exit 1 if the asset is stale
 *   node scripts/gen-sec-tickers.mjs --dump N   print N gains (seeded draw)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { loadPlans } from "./lib-schema.mjs";
import { buildRenderer } from "./apppath.mjs";
import { servedLineup } from "./lib-ledger.mjs";
import { buildIndex, resolveHolding, norm, decodeEntities,
  STRUCTURAL, CLASS_WORDS, DESCRIPTIVE, isAssetWord } from "./match-sec-tickers.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const WITH_COMP = argv.includes("--with-comparables");
const DUMP = argv.includes("--dump") ? Number(argv[argv.indexOf("--dump") + 1] || 24) : 0;
const SEED = argv.includes("--seed") ? argv[argv.indexOf("--seed") + 1] : "20261009";
const OUT = `${ROOT}/sec-tickers.js`;

/* ---------- two expressions sliced from app.js, never transcribed ---------- */
const APP = readFileSync(`${ROOT}/app.js`, "utf8");
function sliced(re, what) {
  const m = APP.match(re);
  if (!m) throw new Error(`gen-sec-tickers: ${what} not found in app.js — the expression moved, refusing to guess`);
  return m;
}
/* cleanCostMarkers DROPS any row whose cleaned name matches ID_ONLY, so a name
 * change can change ROW MEMBERSHIP; a harness that skips the drop counts rows
 * no reader sees. */
const ID_ONLY = vm.runInNewContext(
  sliced(/^ {2}const ID_ONLY = (.*);$/m, "ID_ONLY")[1]);
if (!ID_ONLY.test("CUSIP: 922908363") || ID_ONLY.test("Vanguard 500 Index Fund"))
  throw new Error("gen-sec-tickers: the ID_ONLY slice does not behave like ID_ONLY");
/* the cost-marker strip that produces f.nameRaw from the STORED name. The
 * character class must allow an ESCAPED slash: the shipped literal contains
 * `N\/R`, and `[^/]+` stops dead on it. */
const COST_MARKER = vm.runInNewContext(
  sliced(/f\.nameRaw = f\.name\.replace\((\/(?:\\.|[^/\\])+\/[a-z]*), ""\)/, "cost-marker strip")[1]);
if ("Vanguard 500 Index Fund N/R".replace(COST_MARKER, "").trim() !== "Vanguard 500 Index Fund"
  || "Vanguard N/R Index".replace(COST_MARKER, "") !== "Vanguard N/R Index")
  throw new Error("gen-sec-tickers: the cost-marker slice does not behave like the N/R strip");

/* ---------- the matcher and the page's own chain ---------- */
const idx = buildIndex(`${ROOT}/sec-funds.json`);
/* `secTickers: false` IS NOT OPTIONAL HERE AND IT IS NOT A PERFORMANCE FLAG.
 * This script's gate is "the page's own chain resolves nothing", and the page's
 * chain now ENDS in the table this script writes. Loaded, the generator would
 * read its own previous output as an answer the page already has, every gain
 * would fall into `already`, and the next run would write an EMPTY table —
 * silently, because an empty table publishes exactly what today's page does.
 * So the flag is asserted rather than trusted. */
const { renderRow, clean, setPlans, fns } = buildRenderer({ secTickers: false });
{
  const probe = { name: "Dodge and Cox Stock", nameRaw: "Dodge and Cox Stock", iss: "", type: "Mutual fund", value: 1 };
  if (fns.lookupTicker(probe)) throw new Error("gen-sec-tickers: the harness resolves a name only SEC can answer — secTickers:false did not take effect, and this run would write a table from its own output");
  /* and a POSITIVE control that the rest of the chain is alive, so the line
   * above cannot pass because the whole renderer is broken */
  const live = fns.lookupTicker({ name: "Vanguard 500 Index Fund Admiral Shares",
    nameRaw: "Vanguard 500 Index Fund Admiral Shares", iss: "", type: "Mutual fund", value: 1 });
  if (!live || live.tk !== "VFIAX") throw new Error(`gen-sec-tickers: the harness cannot resolve VFIAX (${JSON.stringify(live)}) — it is not measuring the page`);
}

/* ---------- A POOLED VEHICLE IS NOT THE REGISTERED FUND ----------
 *
 * FOUND BY THE SECOND SEEDED DRAW, 2026-10-09, and it is the single most
 * important thing this script refuses.
 *
 * `fund-er.js:1451` already carries this rule and its comment already names
 * the exact failure: an insurance separate account filed as `VALIC Vanguard
 * Windsor II Fund` resolved to VWNAX with `comparable: false` — "the claim that
 * the plan holds the Vanguard fund itself. It does not; it holds a separate
 * account that invests in it, at the separate account's higher cost." 878 rows
 * / 311,893 participants made that claim before the type arm was widened.
 * `match-sec-tickers.mjs` has the same rule on the NAME (`pooled`), and it
 * cannot see the TYPE cell because `resolveHolding` is never given one.
 *
 * So the page's own policy for a pooled row is **a labelled comparable, never
 * an assertion** — and my first draft returned `comparable: false`
 * unconditionally. Bridgestone's `Fidelity Freedom Blend 2055 Fund Class Z`,
 * typed `Collective trust`, issuer `Fidelity Institutional Asset Management
 * Trust Company`, $8,387,513, would have ASSERTED the mutual fund's FHPEX.
 * The draw was what caught it: the row's own TYPE cell was printed beside the
 * answer. *A count could not have — the symbol is right for the fund and wrong
 * for the vehicle.*
 *
 * THE REMEDY IS REFUSAL, NOT AN ASTERISK. Returning `comparable: true` here
 * would be the owner-gated half of this item arriving by a side door — 224,748
 * rows / 59,710,081 participants of new hedged content is a decision of its
 * own. A withheld row keeps the blank it has today, which is honest.
 *
 * THE PREDICATE IS SLICED FROM fund-er.js, all three of its arms and the
 * TRUST_CLASS constant it needs, because a transcription of a shipped
 * expression rots as the expression grows — and this one has already grown
 * once, from two of the five pooled type values to four. */
{
  const fe = readFileSync(`${ROOT}/fund-er.js`, "utf8");
  const tc = fe.match(/^const TRUST_CLASS = .*$/m);
  const po = fe.match(/^ {2}const pooled = [\s\S]*?\.test\(type \|\| ""\);$/m);
  if (!tc || !po) throw new Error("gen-sec-tickers: could not slice fund-er.js's pooled rule — it moved, refusing to guess");
  vm.runInNewContext(`${tc[0]}\n__out.pooledRow = (name, type) => {\n${po[0]}\n  return !!pooled;\n};`,
    { __out: globalThis });
}
const pooledRow = globalThis.pooledRow;
{
  /* controls in both directions, one per arm, each a case where that arm is
   * the ONLY protection */
  const cases = [
    ["Fidelity Freedom Blend 2055 Fund Class Z", "Collective trust", true],   // TYPE arm only
    ["Vanguard Value Index Adm", "Pooled separate account", true],            // TYPE arm only
    ["Vanguard Target Retirement 2035 Trust I", "Mutual fund", true],         // NAME arm only
    ["TROWEPRICE RETIRE 2035 TR B", "Mutual fund", true],                     // TRUST_CLASS arm only
    ["Vanguard Value Index Adm", "Mutual fund", false],                       // must NOT fire
    ["Fidelity Mid Cap Index Fund", "", false],
  ];
  for (const [n, t, want] of cases) {
    const got = pooledRow(n, t);
    if (got !== want) throw new Error(`gen-sec-tickers: POOLED CONTROL — ${JSON.stringify(n)} / ${JSON.stringify(t)} should be ${want}, got ${got}`);
  }
  console.error("pooled controls OK  (type arm, name arm and TRUST_CLASS arm each pinned alone)");
}

/* ---------- THE REGISTRANT MUST BE ATTESTED BY THE FILING ----------
 *
 * FOUND BY READING THE TABLE THIS SCRIPT WROTE, 2026-10-09, and it is a
 * PRE-EXISTING hole in `match-sec-tickers.mjs` that this call site is the first
 * thing to expose at corpus scale.
 *
 * `(Vanguard Asset Allocation Fund)` resolved to **VCAAX**, asserted, and the
 * SEC registers VCAAX as `VALIC Co I :: Asset Allocation Fund` — A DIFFERENT
 * HOUSE. The superset arm matched because VALIC's series name is the wholly
 * generic `Asset Allocation Fund`, whose tokens the filed name contains, and
 * the leftover `vanguard` was then EXCUSED by the arm's own rule that "a house
 * name the filing states and the registrant's legal name omits" is a
 * legitimate leftover. That rule is right for `American Funds Growth Fund of
 * America`, whose registrant genuinely omits the house — and it never asks
 * whether the registrant is THAT house. So `match-sec-tickers` can cross
 * managers exactly when the registered series name carries no house of its
 * own. CLAUDE.md describes the rule as "never across managers"; that
 * description is true of the exact arm and FALSE of the superset arm.
 *
 * THE GUARD IS NOT A MANAGER TEST, because a manager test was written first
 * and refuted by its own output: `namesManager` works on multi-word phrases
 * (`mfs series`, `dimensional`), so asking "do the filed and registered
 * manager phrases intersect" flagged 69 keys of which ~68 are CORRECT —
 * `Empower Annuity Insurance Company MFS Lifetime 2025 R6` -> LTTKX (Empower
 * is the TRUSTEE prefix, MFS the house), `DFA Real Estate Securities
 * Portfolio` -> DFREX (registrant says `DIMENSIONAL`), `Ishares S&P 500 Index
 * K` -> WFSPX (registrant says `BlackRock Funds III`). *A count keyed on a
 * vocabulary measures the vocabulary.*
 *
 * What the evidence actually supports is weaker and sufficient: THE
 * REGISTRANT'S OWN NAME MUST SAY SOMETHING THE FILING ALSO SAYS. Take
 * `entity :: series`, drop every word that is structural, a share-class word,
 * descriptive or an asset word, keep what is left at three characters or more
 * — the registrant's distinctive vocabulary — and require ONE of those words
 * in the filed name or its issuer cell.
 *   VALIC Co I Asset Allocation Fund -> {valic}, absent from the filing -> REFUSE
 *   MFS SERIES TRUST XII MFS Lifetime 2025 Fund -> {mfs, lifetime, 2025} -> ALLOW
 *   BlackRock Funds III iShares S&P 500 Index Fund -> {blackrock, ishares, 500} -> ALLOW
 *
 * AN EMPTY DISTINCTIVE SET ALLOWS, deliberately. `GROWTH FUND OF AMERICA` and
 * `SHORT-TERM BOND FUND OF AMERICA` are real American Funds funds whose legal
 * names are entirely descriptive; the matcher's own `anonDistinct` already
 * handles that population and refusing it here would withdraw correct answers
 * on no evidence. Where the registrant says nothing distinctive there is
 * nothing to contradict. */
const regRows = JSON.parse(readFileSync(`${ROOT}/sec-funds.json`, "utf8")).funds;
const entitiesByTicker = new Map();
for (const r of regRows) {
  const t = r[1];
  if (!entitiesByTicker.has(t)) entitiesByTicker.set(t, []);
  entitiesByTicker.get(t).push(decodeEntities(r[0]));
}
/* THE REGISTRANT'S WORDS ARE TAKEN BOTH NORMALISED AND RAW, because `norm`
 * EXPANDS HOUSE ALIASES and the expansion is one-sided on damaged text.
 * `DFA INVESTMENT DIMENSIONS GROUP INC` normalises to `dimensional investment
 * dimensions group inc` — the alias fires — while the filed `D F A US S m all
 * C ap F u n d` normalises to `d f a us s m all c ap f u n d`, where `dfa` is
 * three separate tokens and no alias can reach it. So the registrant said
 * `dimensional`, the filing said `DFA`, and a correct answer was refused.
 * Found by reading the refusal list, not by any count. */
const distinctiveCache = new Map();
function distinctiveWords(s) {
  if (distinctiveCache.has(s)) return distinctiveCache.get(s);
  const out = new Set();
  const raw = String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const w of (norm(s) + " " + raw).split(" ")) {
    if (w.length < 3) continue;
    if (STRUCTURAL.has(w) || CLASS_WORDS.has(w) || DESCRIPTIVE.has(w) || isAssetWord(w)) continue;
    out.add(w);
  }
  distinctiveCache.set(s, out);
  return out;
}
/* THE FIRST VERSION ASKED ONLY FOR A WHOLE TOKEN AND REFUSED 25 CORRECT
 * ANSWERS, every one a BROKEN FONT. `F id e lity Large C ap Gro w th In d e x`
 * resolves correctly to FSPGX — `joinCandidates` repairs the split seam — and
 * the attestation then looked for the token `fidelity` in a string that spells
 * it in six pieces. Same for `V anguard Inte rnational V alue Fund`,
 * `D F A R e a l E s ta te S e cu ri ti e s F u n d`, `IN VESCO SMALL CAP
 * GROWTH R6`, `Sch w ab To tal Sto ck M ark e t In d e x Fu n d` and twenty
 * more. ***THE TEST WAS REFUTED BY READING ITS OWN REFUSALS, which a count of
 * them could not have done*** — 75 keys is a number, and only the list says
 * that a third of it is the guard misfiring on OCR damage.
 *
 * So attestation also accepts the word as a SUBSTRING of the filed string with
 * all whitespace removed, which is exactly the damage class and nothing else.
 * `MASS MUTUAL` -> `massmutual` passes for the same reason and is likewise a
 * correct answer the token test refused.
 *
 * IT LEAKS, named: a three-character distinctive word could appear by accident
 * inside a de-spaced name. That direction is safe — attestation is a
 * PERMISSION, so a leak returns the decision to the matcher's own judgment,
 * which is the status quo. A false REFUSAL costs a correct symbol, which is
 * why that is the direction measured and read. */
function registrantAttested(ticker, filedName, iss) {
  const ents = entitiesByTicker.get(ticker) || [];
  if (!ents.length) return false;                 // a symbol we cannot attribute at all
  const n = norm(`${filedName} ${iss || ""}`);
  const said = new Set(n.split(" "));
  const squashed = n.replace(/\s+/g, "");
  for (const e of ents) {
    const d = distinctiveWords(e);
    if (!d.size) return true;                     // registrant says nothing distinctive
    for (const w of d) if (said.has(w) || squashed.includes(w)) return true;
  }
  return false;
}
/* controls, in BOTH directions, on the case that exposed it and on three the
 * refuted manager test got wrong */
{
  const must = [
    ["VCAAX", "(Vanguard Asset Allocation Fund)", "", false],
    ["VMIDX", "VALIC Mid Cap Index Fund", "", true],
    ["LTTKX", "Empower Annuity Insurance Company MFS Lifetime 2025 R6", "", true],
    ["WFSPX", "13,952 Mutual Fund Shares", "Ishares S&P 500 Index K", true],
    ["DFREX", "1,088 Mutual Fund Shares", "DFA Real Estate Securities Portfolio", true],
    ["RFDTX", "Mutual Fund – Target Date 2025 R6 Fund", "American Funds", true],
    /* MUST REFUSE: a generically-named registrant magnetizing another house's
     * fund. Homestead's series is the bare `Intermediate Bond Fund`, and the
     * matcher's own comment records the same registrant doing this with
     * `Short-Term Bond Fund`. Both of these are the filed name naming the
     * OTHER house outright. */
    ["HOIBX", "Vanguard Intermediate Bond Fund", "", false],
    ["HOIBX", "JPMorgan Intermediate Bond Fund", "", false],
    ["HOIBX", "Intermediate Bond Fund", "Voya Financial", false],
    /* the de-spaced clause is the ONLY protection on each of these — the whole
     * token is absent from the filed string, split by a broken font or spelled
     * as two words, and the token-only version of this guard refused all four */
    ["FSPGX", "F id e lity Large C ap Gro w th In d e x", "", true],
    ["SWTSX", "Sch w ab To tal Sto ck M ark e t In d e x Fu n d", "", true],
    ["GTSFX", "IN VESCO SMALL CAP GROWTH R6", "", true],
    ["MKSXX", "Mass Mutual US Government Money Market Fund", "", true],
    /* the RAW-words clause is the only protection on this one: the registrant
     * normalises to `dimensional` and the filing spells `D F A` */
    ["DFSTX", "D F A US S m all C ap F u n d", "", true],
  ];
  for (const [tk, n, iss, want] of must) {
    const got = registrantAttested(tk, n, iss);
    if (got !== want) throw new Error(`gen-sec-tickers: ATTESTATION CONTROL — ${tk} on ${JSON.stringify(n)} / ${JSON.stringify(iss)} should be ${want}, got ${got}`);
  }
  console.error("attestation controls OK  (VCAAX refused; VMIDX, LTTKX, WFSPX, DFREX, RFDTX allowed)");
}

/* ---------- FIXTURES AHEAD OF THE COUNT ----------
 * A must-SEE fixture turns a wrong answer into a refusal; this record has had
 * two implausible screens refused by one before a number was ever read. */
{
  const row = (name, type, iss) => ({ name, nameRaw: name, iss: iss || "", type: type || "Mutual fund", value: 1 });
  /* (1) the SEC side must answer where the page cannot */
  const dc = row("Dodge and Cox Stock");
  if (fns.lookupTicker(dc)) throw new Error("gen-sec-tickers: FIXTURE — the page already resolves `Dodge and Cox Stock`; the SEC answer must be the only one");
  const dcSec = resolveHolding(idx, dc.name, "");
  if (!dcSec || dcSec.ticker !== "DODGX") throw new Error(`gen-sec-tickers: FIXTURE — SEC must answer DODGX for \`Dodge and Cox Stock\`, got ${JSON.stringify(dcSec)}`);
  /* ...and it must answer it as a COMPARABLE, because the SEC registers two
   * classes of that fund and the filing states none. So this row is in the
   * REFUSED half and must NOT appear in the asset — which makes it the control
   * on the asserted-only gate itself. */
  if (!dcSec.comparable) throw new Error("gen-sec-tickers: FIXTURE — `Dodge and Cox Stock` has two registered classes, so the answer must be a comparable; if it is asserted the ambiguity test has moved");
  /* (2) employer stock is no registered series: null on BOTH sides. Without
   * this control a synthetic-plan shortcut would inflate every gain figure. */
  const cc = row("Costco Wholesale Corporation", "Company stock");
  if (fns.lookupTicker(cc)) throw new Error("gen-sec-tickers: FIXTURE — the page must not resolve employer stock from the name");
  if (resolveHolding(idx, cc.name, "")) throw new Error("gen-sec-tickers: FIXTURE — SEC must not resolve employer stock");
  /* (3) a POSITIVE control on the asserted path, so a table that comes back
   * empty is a failing test rather than a finding. */
  const ac = row("American Century Mid Cap Val R6");
  const acSec = resolveHolding(idx, ac.name, "");
  if (!acSec || acSec.comparable || acSec.ticker !== "AMDVX")
    throw new Error(`gen-sec-tickers: FIXTURE — SEC must ASSERT AMDVX for \`American Century Mid Cap Val R6\`, got ${JSON.stringify(acSec)}`);
  console.error("fixtures OK  (page-null + SEC-comparable: Dodge and Cox Stock; null on both: Costco; SEC-asserted: AMDVX)");
}

/* ---------- the published + served pool ----------
 * Both gates, in this order: `lineups-index` bit 1 (the site renders a lineup
 * only when the entry is CONFIDENT), then the SERVING condition — a trust's
 * menu reaches a plan only where the plan's own lineup is unusable. The
 * condition is imported from lib-ledger, the one place it lives. */
const idxFile = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8"));
if (!idxFile.plans || typeof idxFile.plans !== "object")
  throw new Error(`gen-sec-tickers: lineups-index.json has no .plans map; its keys are ${Object.keys(idxFile).join(", ")}`);
const INDEX = idxFile.plans;

const d = loadPlans();
setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

const members = new Map();
for (const r of d.rows) {
  const o = { sponsorName: d.get(r, "sponsorName"), ein: d.get(r, "ein"), pn: d.get(r, "pn"),
    ticker: d.get(r, "ticker"), ppl: d.get(r, "partEOY") || d.get(r, "participants") || 0,
    ack: d.get(r, "ack"), mtiaAck: d.get(r, "mtiaAck") };
  for (const a of [o.ack, o.mtiaAck]) {
    if (!a) continue;
    if (!members.has(a)) members.set(a, []);
    members.get(a).push(o);
  }
}
const servedBy = (m) => servedLineup(m, INDEX).ack;

const secCache = new Map();
/* AN APOSTROPHE-ELIDED SHARE CLASS LEAVES A STRAY LETTER AND THE MATCHER THEN
 * REFUSES THE WHOLE ROW — 2026-10-10 (05:3xZ).
 *
 * `norm("Inst'l Shares")` is `"institutional l shares"`: the expansion is
 * already in `norm`, and it leaves a one-letter token behind. That token is an
 * unexplained leftover, so `resolveHolding` declines — measured, the same
 * series answers `VINIX*` when the class is spelled out and NOTHING when it is
 * filed as `Inst'l`. So this is not a registry gap; the answer is in the file
 * and one stray letter stands between.
 *
 * FOUR SPELLINGS, EACH ITS OWN RULE, because they are not one class of
 * abbreviation: `Inst'l` is institutional and `Int'l` is INTERNATIONAL, and a
 * single "drop the apostrophe" rule would conflate them. Measured over
 * published+served rows the page resolves nothing for: 1,247 carry one, and
 * repairing the spelling makes the matcher newly answer on **324 rows / 304
 * plans / 1,199,200 participants ASSERTED** plus 194 / 178 / 488,810 comparable
 * — and only the asserted half can ship, because this generator emits
 * assertions and the comparable half is the owner's call.
 *
 * APPENDED AFTER the existing candidates and never substituted for them, so the
 * change is ADDITIVE BY CONSTRUCTION: a row that resolves today resolves first
 * and identically, and a repaired spelling can only ever be consulted where
 * every existing spelling already came back empty. That is the loss profile
 * this record prefers and the reason it sits here rather than in `norm` —
 * `merge-4i` shares that function to write `ftk`, which is consulted FIRST by
 * `lookupTicker` and so can take a symbol AWAY as readily as add one.
 *
 * The issuer is expanded too, because `resolveHolding` reads it. */
const APOS_EXPAND = [
  [/\bInst'l\b/gi, "Institutional"],
  [/\bInt'l\b/gi, "International"],
  [/\bGov't\b/gi, "Government"],
  [/\bNat'l\b/gi, "National"],
];
const aposExpand = (s) => {
  let o = String(s == null ? "" : s);
  for (const [re, to] of APOS_EXPAND) o = o.replace(re, to);
  return o;
};

function secAsk(nameRaw, nameClean, iss) {
  const k = `${iss}\u0000${nameRaw}\u0000${nameClean}`;
  if (secCache.has(k)) return secCache.get(k);
  let out = null;
  /* the same order `lookupTicker` tries: the name as filed, then the cleaned
   * one. Asking only the cleaned name loses rows whose markers the registry
   * tolerates; asking only the raw one loses rows the cleaner repairs. */
  const tries = [];
  for (const n of (nameRaw === nameClean ? [nameRaw] : [nameRaw, nameClean])) tries.push([n, iss]);
  /* then, and only then, the apostrophe-repaired spellings */
  const issX = aposExpand(iss);
  for (const n of (nameRaw === nameClean ? [nameRaw] : [nameRaw, nameClean])) {
    const nX = aposExpand(n);
    if (nX !== n || issX !== iss) tries.push([nX, issX]);
  }
  for (const [n, is] of tries) {
    const r = resolveHolding(idx, n, is);
    if (r) { out = r; break; }
  }
  secCache.set(k, out);
  return out;
}

const table = new Map();                 // key -> ticker  (ASSERTED only)
const conflicts = [];
let rows = 0, already = 0, ftkHeld = 0, gainExact = 0, gainComp = 0, blank = 0;
let unattested = 0, unattestedPpl = 0;
const unattestedKeys = new Map();
let pooledRefused = 0, pooledRefusedPpl = 0, suppressed = 0;
const pooledKeys = new Set(), planPooled = new Map();
const planExact = new Map(), planComp = new Map();
const gains = [];
const compKeys = new Set();

for (let s = 0; s < 64; s++) {
  const file = `${ROOT}/data/lineups/${String(s).padStart(2, "0")}.json`;
  if (!existsSync(file)) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) {
    const all = members.get(ack);
    if (!all || !e.funds || !e.funds.length) continue;
    if (all.reduce((a, m) => a + m.ppl, 0) <= 0) continue;
    if (((INDEX[ack] || 0) & 1) !== 1) continue;         // not published
    const mem = all.filter((m) => servedBy(m) === ack);  // not served
    const ppl = mem.reduce((a, m) => a + m.ppl, 0);
    if (!mem.length || ppl <= 0) continue;
    const lead = mem.slice().sort((a, b) => b.ppl - a.ppl)[0];
    /* exactly what cleanCostMarkers does, in its order */
    const funds = e.funds.map((x) => {
      const nameRaw = String(x.name || "").replace(COST_MARKER, "").trim();
      return { ...x, nameRaw, name: clean(nameRaw) };
    }).filter((x) => !ID_ONLY.test(x.name || ""));
    const total = funds.reduce((a, x) => a + (+x.value || 0), 0);
    for (const f of funds) {
      rows++;
      const r = renderRow(lead, f, "menu", total);
      if (r.tk) { already++; continue; }
      /* A FLAG THAT FLIPS IS NOT A CELL THAT CHANGES, AND NEITHER IS AN ANSWER
       * THE PAGE NEVER ASKS FOR. `renderRow` gates `lookupTicker` itself —
       *   info = tab==="menu" && !gicRow && !subtotalRow && !loanRow
       *          && !annuityRow && !contractRow ? lookupTicker(f) : null
       * — and then `tk` is overridden outright for a loan or an employer-stock
       * row. On any of those the function is either not called or its answer is
       * discarded, so a key written for them is a gain NO READER CAN SEE.
       * Found by the third seeded draw printing the row's TYPE beside the
       * answer: `Vanguard ® Target Retirement Income Fund- Investor Shares`
       * is typed `Stable value / GIC`, which trips `gicRow`, so its VTINX could
       * never have reached the page. *A count of what the predicate answers is
       * not a count of what the page prints.* */
      const fl = r.flags;
      if (fl.gicRow || fl.subtotalRow || fl.loanRow || fl.annuityRow || fl.contractRow || fl.stockRow) {
        suppressed++;
        continue;
      }
      /* the f.tk guard: renderRow would publish it the moment `info` is null,
       * so this arm must never make `info` non-null there */
      if (f.tk) { ftkHeld++; continue; }
      const sec = secAsk(f.nameRaw, f.name, f.iss || "");
      if (!sec) { blank++; continue; }
      /* the vehicle question, asked of the name the page prints AND of the
       * filing's own type cell, before the asserted/comparable split — because
       * a pooled row is never an assertion whatever the registry says */
      if (pooledRow(f.name, f.type || "") || pooledRow(f.nameRaw, f.type || "")) {
        pooledRefused++;
        pooledRefusedPpl += ppl;
        pooledKeys.add(`${f.iss || ""}\u0000${f.nameRaw || f.name || ""}`);
        for (const m of mem) planPooled.set(`${m.ein}|${m.pn}`, m.ppl);
        continue;
      }
      const key = `${f.iss || ""}\u0000${f.nameRaw || f.name || ""}`;
      if (sec.comparable) {
        gainComp++;
        compKeys.add(key);
        for (const m of mem) planComp.set(`${m.ein}|${m.pn}`, m.ppl);
        continue;
      }
      if (!registrantAttested(sec.ticker, f.nameRaw, f.iss || "")) {
        unattested++;
        unattestedPpl += ppl;
        if (!unattestedKeys.has(key)) unattestedKeys.set(key, { tk: sec.ticker, iss: f.iss || "",
          name: f.nameRaw, series: sec.series || "", why: sec.why || "",
          ent: (entitiesByTicker.get(sec.ticker) || [])[0] || "" });
        continue;
      }
      gainExact++;
      for (const m of mem) planExact.set(`${m.ein}|${m.pn}`, m.ppl);
      const prev = table.get(key);
      if (prev !== undefined && prev !== sec.ticker) conflicts.push([key, prev, sec.ticker]);
      table.set(key, sec.ticker);
      gains.push({ ack, sponsor: lead.sponsorName, ppl, iss: f.iss || "", name: f.nameRaw,
        nameClean: f.name, type: f.type || "", value: +f.value || 0, tk: sec.ticker,
        series: sec.series || "", cls: sec.className || "", why: sec.why || "" });
    }
  }
}

/* ONE KEY CANNOT CARRY TWO SYMBOLS. The key is the pair of raw cells and
 * `resolveHolding` is a pure function of them, so a conflict means something
 * upstream is not deterministic and the table must not be written. */
if (conflicts.length) {
  console.error(`gen-sec-tickers: ${conflicts.length} key(s) resolve to MORE THAN ONE ticker — refusing to write:`);
  for (const [k, a, b] of conflicts.slice(0, 10)) console.error(`  ${JSON.stringify(k)}: ${a} vs ${b}`);
  process.exit(1);
}
/* A key that is ALSO reached as a comparable elsewhere would mean the same two
 * cells answer two ways, which the purity argument forbids. */
const both = [...table.keys()].filter((k) => compKeys.has(k));
if (both.length) {
  console.error(`gen-sec-tickers: ${both.length} key(s) answer asserted AND comparable — refusing to write`);
  process.exit(1);
}

const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const sumOf = sum;
const fig = {
  rows, already, ftkHeld, blank,
  exactRows: gainExact, exactPlans: planExact.size, exactPpl: sum(planExact),
  compRows: gainComp, compPlans: planComp.size, compPpl: sum(planComp),
  keys: table.size,
};
const report = [
  `rows examined (published + served)        ${rows.toLocaleString()}`,
  `already resolve today (untouched)         ${already.toLocaleString()}`,
  `held by the filing's own f.tk (excluded)  ${ftkHeld.toLocaleString()}`,
  `the page never asks (gic/loan/stock/...)   ${suppressed.toLocaleString()}`,
  `REFUSED, POOLED vehicle (not the fund)   ${pooledRefused.toLocaleString()} rows / ${pooledKeys.size.toLocaleString()} keys -> ${planPooled.size.toLocaleString()} plans / ${sumOf(planPooled).toLocaleString()} ppl`,
  `REFUSED, registrant unattested           ${unattested.toLocaleString()} rows / ${unattestedKeys.size.toLocaleString()} keys (participant sum, double-counted: ${unattestedPpl.toLocaleString()})`,
  `GAIN an ASSERTED symbol                   ${gainExact.toLocaleString()} rows -> ${planExact.size.toLocaleString()} plans / ${sum(planExact).toLocaleString()} ppl`,
  `gain a COMPARABLE (REFUSED, not shipped)  ${gainComp.toLocaleString()} rows -> ${planComp.size.toLocaleString()} plans / ${sum(planComp).toLocaleString()} ppl`,
  `still blank                               ${blank.toLocaleString()}`,
  `distinct keys written                     ${table.size.toLocaleString()}`,
  `SWAPS                                     0  (a key exists only where the page resolves nothing and f.tk is absent)`,
  `LOSSES                                    0  (the arm runs last and only fills a blank)`,
].join("\n");
console.error(report);
if (unattestedKeys.size) {
  console.error(`\nEVERY REFUSED KEY, so the class is read and not merely counted:`);
  for (const [, u] of unattestedKeys)
    console.error(`  ${u.tk}  filed=${JSON.stringify(u.name)}  iss=${JSON.stringify(u.iss)}  reg="${u.ent}"  via ${u.why}`);
}

if (DUMP) {
  /* a SEEDED uniform draw over the gain rows — ranking would pick the biggest
   * plans, which are systematically different, and a rate needs a random draw */
  let h = 2166136261 >>> 0;
  for (const c of String(SEED)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const rand = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const seen = new Set();
  console.log(`\nUNIFORM DRAW of ${DUMP} gain rows, seed=${SEED} (of ${gains.length.toLocaleString()})`);
  while (seen.size < Math.min(DUMP, gains.length)) {
    const i = Math.floor(rand() * gains.length);
    if (seen.has(i)) continue;
    seen.add(i);
    const g = gains[i];
    console.log(`\n[${i}] ${g.sponsor}  (${g.ppl.toLocaleString()} ppl)  ack=${g.ack}`);
    console.log(`     filed name : ${JSON.stringify(g.name)}`);
    if (g.nameClean !== g.name) console.log(`     cleaned    : ${JSON.stringify(g.nameClean)}`);
    console.log(`     issuer     : ${JSON.stringify(g.iss)}   type: ${JSON.stringify(g.type)}   $${g.value.toLocaleString()}`);
    console.log(`     SEC answer : ${g.tk}   series "${g.series}"  class "${g.cls}"  via ${g.why}`);
  }
}

/* ---------- the asset ---------- */
const SEC_ROWS = JSON.parse(readFileSync(`${ROOT}/sec-funds.json`, "utf8")).funds.length;
const keys = [...table.keys()].sort();
const body = keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(table.get(k))}`).join(",\n");
const asset = `/* wampo — GENERATED by scripts/gen-sec-tickers.mjs. DO NOT HAND-EDIT.
 *
 * The last-resort symbol table for the report's \`lookupTicker\`: the answers
 * scripts/match-sec-tickers.mjs gives for published holding names the page's
 * own chain cannot resolve, from the SEC Investment Company Series and Class
 * file (sec-funds.json, ${SEC_ROWS.toLocaleString()} series/class rows).
 *
 * ASSERTED ANSWERS ONLY. A \`comparable\` — the SEC registers several share
 * classes and the filing states none — is NOT in here: it would publish an
 * asterisked approximation on ${fig.compPlans.toLocaleString()} plans reaching ${fig.compPpl.toLocaleString()}
 * participants, which is a decision of its own.
 *
 * Key: the two raw cells the page holds, joined by NUL —
 *   (f.iss || "") + "\\u0000" + (f.nameRaw || f.name || "")
 * No normalisation on either side, so there is no browser twin to drift. A
 * spelling absent from this table resolves to nothing, which is the honest
 * status quo and never a wrong symbol.
 *
 * ${fig.keys.toLocaleString()} keys, covering ${fig.exactRows.toLocaleString()} published rows across ${fig.exactPlans.toLocaleString()} plans
 * reaching ${fig.exactPpl.toLocaleString()} participants. Swaps 0, losses 0: a key is written only
 * where the page's chain returns nothing AND the row carries no \`f.tk\`.
 */
const SEC_TICKERS = {
${body}
};
/* a pin the smoke test and scripts/sec-tickers-test.mjs assert, so a
 * regenerated table that lost its consumer fails a gate rather than a reader */
const SEC_TICKERS_PIN = ${JSON.stringify(keys.length ? { key: keys[0], tk: table.get(keys[0]) } : null)};
`;

if (CHECK) {
  const have = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (have === asset) { console.error("gen-sec-tickers: sec-tickers.js is up to date"); process.exit(0); }
  console.error("gen-sec-tickers: sec-tickers.js is STALE — run `node scripts/gen-sec-tickers.mjs` and commit it with a re-stamped index.html");
  process.exit(1);
}
if (WITH_COMP) { console.log(report); process.exit(0); }
writeFileSync(OUT, asset);
console.error(`\ngen-sec-tickers: wrote sec-tickers.js — ${table.size.toLocaleString()} keys, ${asset.length.toLocaleString()} bytes`);
