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
/* ---------- A BARE REGISTERED NAME MEANS THE BARE CLASS ----------
 *
 * Oracle Corporation (101,985 participants) files `Fidelity Worldwide Fund`
 * and the page publishes NOTHING on $410,529,000, because the matcher answers
 * **FWAFX**, the `Fidelity ADVISOR Worldwide Fund: Class A` — a comparable, and
 * this generator ships assertions only. The registry carries a class whose
 * registered name IS `Fidelity Worldwide Fund`, ticker **FWWFX**, and the
 * filing names exactly that string.
 *
 * The mechanism is `match-sec-tickers.mjs:1306`: with no class word in the
 * filed name `hintsOf` is empty, the class filter is skipped entirely, and the
 * representative falls to `uniq.find(c => c.hint === "a")` — which for every
 * Fidelity retail fund is the ADVISOR product line, a different product sold
 * with a load.
 *
 * ***THE PRINCIPLE IS ALREADY SHIPPED ONE LEVEL UP.*** `match-sec-tickers.mjs`
 * line 1286 narrows a one-word class statement to the class stating only that
 * word, and its comment reads *"a more specific class is a different class, and
 * it is not what a bare mention selects."* The same sentence with "one"
 * replaced by "no" is this arm: **a filing stating NO class word means the
 * class that states none** — and the registry says which class that is, for
 * 376 multi-class series, with **0 series carrying more than one** such class,
 * so there is never a tie to break.
 *
 * THE CONDITION IS STRUCTURAL, NOT A VOCABULARY. `why === "exact+ambiguous"`
 * means the filed name's TOKEN SET EQUALS the series' token set — the `exact`
 * arm's own standard — so the filed name carries no word beyond the series
 * name, and the un-designated class's registered name IS the series name.
 * Together: **the filed name equals that class's registered name, token for
 * token.** That is an identification by the exact arm's own standard, not an
 * inference about an unstated class.
 *
 * THE LOAD-BEARING CONTROL IS THAT FILERS SAY SO WHEN THEY HOLD ANOTHER CLASS,
 * and it is internal. The whole hazard is a 401(k) holding `Class K` — the
 * retirement-plan class — and filing the fund's plain name. Measured over the
 * universe's own spellings for these families, filers state it constantly and
 * in many forms: `FID MID CAP STOCK K6` (28 rows / 239,368 ppl), `FID MID CAP
 * STOCK K` (21 / 87,680), `Fidelity Mid-Cap Stock Fund Class K`, `FID EQUITY
 * INCOME K6` (23 / 104,231), `Fidelity Equity Income Fund - Class K`,
 * `T. Rowe Price Large-Cap Value Fund I Class` (4 / 60,124), `TRP LARGE-CAP
 * VAL I`, `Fidelity Freedom Blend 2050 Fund Class K6`, `… Class Z`. Every one
 * carries an extra token and is therefore outside this arm BY CONSTRUCTION.
 * **So a bare spelling is a statement about the class by omission.**
 *
 * TWO CONDITIONS SELECT THE CLASS, AND AN ASSERTION OF MINE HAD TO FIRE BEFORE
 * I BELIEVED THE SECOND. My sizing compared `className` to the series name with
 * `norm` and reported **0** series carrying more than one un-designated class;
 * the arm keys on `tokens`, which filters NOISE — `fund`, `portfolio`,
 * `account` — and under THAT comparison **42 series carry more than one**.
 * *A population measured through one normalisation is not the population a
 * repair runs under.*
 *
 * ***AND READING THE 42 REFUTED THE VEHICLE CONCLUSION I HAD ALREADY WRITTEN
 * HERE.*** I had recorded that a `Fund`/`Portfolio` difference is only the
 * filer's wording, measured over 127 rows — `State Street Aggregate Bond Index
 * Fund` -> SSAFX `… Index Portfolio`, `Fidelity Real Estate Investment Fund` ->
 * FRESX `… Investment Portfolio` — and for those houses it is. For T. Rowe
 * Price it is a DIFFERENT REGISTERED PRODUCT: `T. Rowe Price Equity Income
 * Fund` is **PRFDX** and `T. Rowe Price Equity Income Portfolio` is
 * **QAAHCX**, a variable-annuity portfolio, and the same pair exists for
 * Mid-Cap Growth (RPMGX / QAMWEX), Blue Chip Growth (TRBCX / QAAAJX), Equity
 * Index 500 (PREIX / QAAGTX), International Stock (PRITX / QAAGYX) and All-Cap
 * Opportunities (PRWAX / QAOSWX). My 127-row screen read only houses where the
 * words coincide and never looked at the counter-population. *A screen that
 * finds its own conclusion in every member it reads has not been shown the
 * members that would refute it.*
 *
 * So the vehicle question is answered by REFUSING the series, not by trusting
 * the words: (1) exactly one class of the series may be TOKENS-equal to the
 * series key — where a `Fund` and a `Portfolio` edition both are, a bare filed
 * name cannot choose between them and *a guess about the class is a guess about
 * the FEE*; and (2) that class must also be NORM-equal to the series name, so a
 * series whose only token-equal class is spelled with the other vehicle noun is
 * refused rather than asserted. Condition (1) catches the generic series name
 * that collapses across registrants ONLY where several of them are
 * un-designated and therefore tie — `Stock Index Fund` holds VSTIX, HSTIX and
 * NOSIX, `Core Bond Fund` holds VCBDX and NOCBX, and VCBDX is the very symbol
 * the issuer-cell arm's pinned VALIC hazard turned on. Where ONE registrant of
 * several has the un-designated class there is no tie, and condition (3) below
 * is the only thing standing between this arm and a cross-registrant
 * assertion.
 *
 * The dangerous vehicle words are refused upstream and independently:
 * `resolveHolding`'s own `pooled` test and this file's sliced `pooledRow` both
 * read the NAME for `trust`/`commingled`/`pool`.
 *
 * `registrantAttested` still runs on the promoted symbol, and `pooledRow` still
 * runs before it, so this arm adds no exemption: it changes WHICH class of an
 * already-identified series is the answer, and nothing else.
 *
 * AND THE ANSWER IS READ OFF `sec.series`, NEVER OFF THE FILED NAME. Sizing it
 * by looking the series up from the filed tokens read Universal Health
 * Services' `Equity-Income Fund` / issuer `Vanguard` — which resolves the
 * VANGUARD series — against a different registrant's series `Equity Income
 * Portfolio`, and would have published **GEQIX** for a Vanguard holding. The
 * resolver uses the issuer cell and a name-keyed lookup cannot, so the two
 * reach different series on the same row. */
const BARE_CLASS = new Map();            // series token key -> the un-designated class
{
  /* `tokens` is not exported, so it is SLICED from the matcher the way this
   * file already slices `pooledRow` from fund-er.js — a transcription of a
   * shipped expression rots as the expression grows, and NOISE has grown. */
  const ms = readFileSync(`${ROOT}/scripts/match-sec-tickers.mjs`, "utf8");
  const mN = ms.match(/const NOISE = new Set\(\[[\s\S]*?\]\);/);
  const mT = ms.match(/const tokens = \(s\) => [^\n]+;/);
  if (!mN || !mT) throw new Error("gen-sec-tickers: could not slice the matcher's NOISE/tokens — refusing to guess");
  const tok = new Function("norm", `${mN[0]}\n${mT[0]}\nreturn tokens;`)(norm);
  if (tok("Fidelity Worldwide Fund").join(" ") !== "fidelity worldwide")
    throw new Error("gen-sec-tickers: the sliced tokens() does not behave as expected");
  const keyOf = (s) => tok(String(s || "")).join(" ");
  let multi = 0, refusedTie = 0, refusedSpelling = 0;
  for (const [k, list] of idx.bySeries) {
    if (list.length < 2) continue;
    multi++;
    const sn = list[0].series || "", sk = keyOf(sn);
    if (!sk) continue;
    /* (1) exactly one class token-equal to the series key */
    const bare = list.filter((c) => keyOf(c.className) === sk);
    if (bare.length > 1) { refusedTie++; continue; }
    if (bare.length < 1) continue;
    /* (2) and spelled the same, so the other vehicle noun is not accepted */
    if (norm(bare[0].className) !== norm(sn)) { refusedSpelling++; continue; }
    BARE_CLASS.set(k, bare[0]);
  }
  console.error(`bare-class index: ${BARE_CLASS.size} of ${multi} multi-class series usable; refused ${refusedTie} for a Fund/Portfolio or cross-registrant TIE, ${refusedSpelling} because the only token-equal class is spelled with another vehicle noun`);
  /* assert what IS invariant — the pin's series must resolve to exactly one —
   * rather than a premise about the whole file that turned out to be false */
  if (!BARE_CLASS.size) throw new Error("gen-sec-tickers: the bare-class index is empty — the registry or the key has moved, refusing to write");
  BARE_CLASS.keyOf = keyOf;
}
/* Promote an ambiguous answer to the series' un-designated class. Returns the
 * ORIGINAL answer unchanged in every other case, so it is additive by
 * construction and can never take a symbol away. */
function bareClassPromote(sec) {
  if (!sec || !sec.comparable || sec.why !== "exact+ambiguous") return sec;
  const b = BARE_CLASS.get(BARE_CLASS.keyOf(sec.series || ""));
  if (!b || b.ticker === sec.ticker) return sec;
  /* (3) THE PROMOTED CLASS MUST BELONG TO THE SAME REGISTRANT AS THE ANSWER
   * THE RESOLVER GAVE, AND ONLY A SEEDED DRAW FOUND THIS.
   *
   * `idx.bySeries` is keyed on the series TOKEN KEY, so several registrants'
   * series collapse into one list. The key `emerging markets equity` holds
   * FIVE classes across THREE registrants: Morgan Stanley Pathway's TEMUX,
   * Morgan Stanley VIF's MSMBX/MEMEX, and GuideStone's GEMYX/GEMZX. The
   * resolver answers **GEMZX\*** — honestly hedged, because the class is
   * ambiguous — and exactly one class in that list is un-designated, TEMUX, so
   * conditions (1) and (2) both PASS and the promotion crossed from GuideStone
   * to Morgan Stanley. On a real row filed `Emerging Markets Equity` with
   * issuer **`GQG Partners`** — a third manager again — the page would have
   * ASSERTED a Morgan Stanley symbol.
   *
   * ***My own comment on condition (1) overclaimed and the draw is what caught
   * it.*** I wrote that the tie test "also disposes of the generic series name
   * that collapses across registrants", and for `Stock Index Fund` (VSTIX,
   * HSTIX, NOSIX) it does — because ALL THREE are un-designated, so they tie.
   * Where only ONE registrant of several has an un-designated class there is no
   * tie to find, and the test is silent. *A condition that catches one instance
   * of a hazard is not a condition against the hazard* — and 23 of the 24 keys
   * drawn were correct, so no count and no sample average would have shown it.
   *
   * The registrant is read off `idx.byTicker`, which is the index's own record
   * of who the symbol belongs to, so this needs no new source. */
  const be = idx.byTicker.get(String(b.ticker).toUpperCase());
  const se = idx.byTicker.get(String(sec.ticker).toUpperCase());
  if (!be || !se || norm(be.entity || "") !== norm(se.entity || "")) return sec;
  return { ...sec, ticker: b.ticker, comparable: false, why: sec.why + "+bare",
    className: b.className };
}
{
  /* controls in both directions, each a case where the condition under test is
   * the ONLY thing deciding the verdict */
  const must = resolveHolding(idx, "Fidelity Worldwide Fund", "");
  if (!must || !must.comparable || must.why !== "exact+ambiguous" || must.ticker !== "FWAFX")
    throw new Error(`gen-sec-tickers: BARE-CLASS PIN — "Fidelity Worldwide Fund" should answer FWAFX* exact+ambiguous, got ${must && must.ticker}${must && must.comparable ? "*" : ""} (${must && must.why}); the matcher has moved`);
  const got = bareClassPromote(must);
  if (got.ticker !== "FWWFX" || got.comparable)
    throw new Error(`gen-sec-tickers: BARE-CLASS PIN — the promotion should assert FWWFX, got ${got.ticker}${got.comparable ? "*" : ""}`);
  /* must NOT fire: a filing that STATES a class reaches a `+class` answer and
   * is not ambiguous at all, so the arm must leave it exactly as it was */
  const stated = resolveHolding(idx, "Fidelity Mid-Cap Stock Fund Class K", "");
  if (stated && bareClassPromote(stated).ticker !== stated.ticker)
    throw new Error("gen-sec-tickers: BARE-CLASS CONTROL — a filing stating Class K must not be promoted");
  /* must NOT fire: a SUPERSET match is not `exact`, so the filed name carries a
   * word the series does not and the token-equality premise does not hold */
  for (const n of ["Fidelity Advisor Worldwide Fund", "Fidelity Worldwide Index Fund"]) {
    const r = resolveHolding(idx, n, "");
    if (r && r.why === "exact+ambiguous" && bareClassPromote(r).ticker !== r.ticker)
      throw new Error(`gen-sec-tickers: BARE-CLASS CONTROL — ${JSON.stringify(n)} is not a bare registered name and must not be promoted`);
  }
  /* SINGLE-PROTECTION CASES FOR THE TWO SELECTION CONDITIONS, drawn FROM the
   * 42 the assertion caught rather than imagined — the record's rule is to
   * measure a guard's blocking population over the live data, and a case
   * protected twice proves neither.
   *
   * (1) THE TIE. `T. Rowe Price Equity Income Fund` is token-equal to BOTH
   *     PRFDX (the fund) and QAAHCX (the variable-annuity portfolio), so the
   *     series must be refused outright. Only condition (1) blocks it:
   *     PRFDX is norm-equal to the series name, so (2) would pass it. */
  if (BARE_CLASS.has(BARE_CLASS.keyOf("T. Rowe Price Equity Income Fund")))
    throw new Error("gen-sec-tickers: BARE-CLASS CONTROL (1) — the T. Rowe Price Equity Income Fund/Portfolio TIE must be refused; PRFDX and QAAHCX are different registered products");
  /* (2) THE SPELLING. `Wireless Portfolio` has one class token-equal to its key
   *     under a DIFFERENT vehicle noun. Only condition (2) can block a series
   *     whose single token-equal class is spelled the other way. */
  for (const s of ["Wireless Portfolio", "Stock Index Fund", "Core Bond Fund", "GROWTH FUND"])
    if (BARE_CLASS.has(BARE_CLASS.keyOf(s)))
      throw new Error(`gen-sec-tickers: BARE-CLASS CONTROL (2) — ${JSON.stringify(s)} must be refused; a generic or cross-vehicle series has no unique un-designated class`);
  /* (3) THE REGISTRANT. `Emerging Markets Equity Fund` passes (1) and (2) — one
   *     un-designated class, spelled the same — and the resolver's own answer
   *     is GuideStone's GEMZX while that class is Morgan Stanley's TEMUX. Only
   *     condition (3) blocks it, which is why it is pinned by the ANSWER and
   *     not by the index: `BARE_CLASS` legitimately holds this key. */
  {
    const r = resolveHolding(idx, "Emerging Markets Equity Fund", "");
    if (!r || !r.comparable || r.why !== "exact+ambiguous")
      throw new Error(`gen-sec-tickers: BARE-CLASS CONTROL (3) — the cross-registrant pin no longer answers exact+ambiguous (got ${r && r.ticker}, ${r && r.why}); re-choose it from the data`);
    if (!BARE_CLASS.has(BARE_CLASS.keyOf("Emerging Markets Equity Fund")))
      throw new Error("gen-sec-tickers: BARE-CLASS CONTROL (3) — the pin must be in BARE_CLASS, or it tests (1)/(2) instead of (3)");
    if (bareClassPromote(r).ticker !== r.ticker)
      throw new Error(`gen-sec-tickers: BARE-CLASS CONTROL (3) — "Emerging Markets Equity Fund" must NOT be promoted across registrants (${r.ticker} -> ${bareClassPromote(r).ticker})`);
  }
}

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

/* A CUSTODIAN'S OWN WORDS IN THE ISSUER CELL BLOCK THE HOUSE THEY CARRY, AND
 * THEY BLOCK IT TWO INDEPENDENT WAYS — measured, not reasoned:
 *
 *   iss "Vanguard Fiduciary Trust"         -> no answer
 *   iss "Vanguard Fiduciary Trust Company" -> no answer
 *   iss "Vanguard Group"                   -> no answer
 *   iss "Vanguard"                         -> VINIX
 *
 * `resolveFaithful` prepends the issuer IN FULL and hands the composed string
 * to `resolve`, whose first act is to test that string for `\btrust\b` and
 * friends — so a custodian named `… Trust` makes the row read as a COLLECTIVE
 * TRUST, which the matcher must never assert a registered fund for. That is
 * mechanism one, and it is the custodian's word doing it, not the holding's.
 * Mechanism two is plainer: `Group`, `Company`, `Fiduciary` are left as
 * unexplained leftover tokens and the superset arm declines.
 *
 * THE REDUCTION IS REGISTRY-ATTESTED, NOT A VOCABULARY. This record has twice
 * measured a guessed word list as harmful here (`inv.` -> `Investment` gave 9
 * false positives of 21 rows), so the house core is the LONGEST leading 1-3
 * token phrase of the issuer that the registry itself registers as a manager —
 * exactly the shape `leadManager` already uses on the filed name. Longest
 * first, so `American Funds Fiduciary Trust` reduces to `american funds` and
 * never to a bare `american`.
 *
 * APPENDED LAST, so it is ADDITIVE BY CONSTRUCTION: a row that resolves under
 * any existing spelling resolves first and identically, and the reduced issuer
 * can only ever be consulted where every existing candidate came back empty.
 * It returns null when the reduction changes nothing, so a bare-house issuer
 * adds no candidate at all.
 *
 * THE HAZARD IS NAMED AND IS WHY THE MEASUREMENT MUST READ A DRAW RATHER THAN A
 * COUNT: this record has three times found that the issuer cell routinely holds
 * the CUSTODIAN rather than the manager, and reducing a custodian to its house
 * core supplies a house the holding may not belong to. Reducing makes that
 * failure MORE reachable, not less. */
/* AND THE HAZARD IS NOT HYPOTHETICAL — IT WAS FOUND BY READING, AND THE
 * REDUCTION IS WHAT REMOVES ITS PROTECTION.
 *
 * Unguarded, the arm newly ASSERTED a registered fund on 37 keys whose issuer
 * cell is `VALIC variable annuity accounts` and kin: `Core Bond Fund` ->
 * VCBDX, `Stock Index Fund` -> VSTIX. Those symbols are real VALIC Company I
 * funds and the claim is still false, because the filer's own issuer cell says
 * the holding is a variable annuity SUB-ACCOUNT — the plan does not hold the
 * fund, it holds an account that invests in it, at the account's higher cost.
 * `fund-er.js`'s pooled veto already carries that exact reasoning for VALIC.
 *
 * WHAT HAD BEEN STOPPING THEM IS THE MECHANISM THIS ARM EXISTS TO REMOVE: the
 * words `variable annuity accounts` were unexplained leftover tokens, so the
 * superset arm declined. The same leftover behaviour that blocks a legitimate
 * house was accidentally blocking a platform's own declaration — so removing it
 * cannot be done without replacing the protection deliberately.
 *
 * TWO REFUSALS, BOTH STRUCTURAL RATHER THAN BRAND VOCABULARIES — each asks what
 * the CELL IS SAYING, not which house it names:
 *
 *  (1) the cell DECLARES A VEHICLE (`variable annuity`, `separate account`,
 *      `annuity account`). That is a statement about the holding, not a company
 *      name, which is why `Empower Annuity Insurance Co.` — a legal entity — is
 *      deliberately NOT reached by it. IT IS NOT A GUARD: measured over the
 *      store it changes no answer, because (3) or the loop already refuse
 *      whatever it would. What it IS, is the DETECTOR the pre-pass for (3)
 *      reads — one condition read twice, not two conditions.
 *  (2) the cell names SEVERAL FIRMS, slash-separated (`VALIC/SunAmerica`,
 *      `VALIC/T. Rowe Price/RCM/Wellington`). A manager cell holds one manager;
 *      a platform-and-sub-adviser pair is a sub-account naming convention, and
 *      reducing it to the first name supplies a house that is not the fund's.
 *  (3) the STORE ITSELF attests the house as selling through a wrapper. A brand
 *      token would have fixed the one case that survives (1) and (2) —
 *      `Valic Corebridge`, 5 keys, no slash and no declaration — and a guessed
 *      brand list is the shape this record has twice measured as harmful, and
 *      is `fund-er.js`'s job rather than the matcher's. So the issuer column
 *      answers instead: where the same house LEADS another cell that DOES
 *      declare a wrapper, that house sells its funds through separate accounts
 *      and a bare cell naming it is not evidence the plan holds the fund. It is
 *      `registrantAttested`'s discipline pointed at the issuer column, and it
 *      keeps working as brands are renamed.
 *      Measured in BOTH directions over the store's 15,683 issuer cells: it
 *      flags `valic` and does NOT flag `fidelity`, `vanguard`, `principal`,
 *      `dimensional`, `american funds`, `american century`, `neuberger`,
 *      `schwab`, `prudential` or `new york` — the ten houses the whole gain
 *      rests on. A test that also flagged those would be a worse instrument
 *      than the brand list it replaces, so the control is the point.
 *      It is LEADING-ANCHORED, deliberately and with a named limit: a cell like
 *      `Variable Annuity Prudential` puts the declaration first, so no house is
 *      extracted and `prudential` is not flagged. The house that LEADS such a
 *      cell is the one selling the wrapper, which is the claim we want.
 *
 * THE CONVERSE IS LEFT ALONE, on this record's own measured rule: an insurer in
 * the issuer cell with a SHARE CLASS stated in the name is the retail fund and
 * the symbol is right, because a separate account has no share class. So
 * `Lifetime Hybrid 2015 R6 Fund` [iss `Principal Life Insurance Company`] ->
 * PLRRX ships, and 14 Principal keys with it. */
const ISS_DECLARES_VEHICLE = /\bvariable\s+annuit|separate\s+account|\bannuity\s+account/i;
const PLATFORM_HOUSE = new Set();                         // filled by the pre-pass below
const houseCore = (iss) => {
  const raw = String(iss == null ? "" : iss);
  /* NO REFUSAL HERE FOR A VEHICLE DECLARATION, and that is measured rather than
   * an omission. A cell declaring a wrapper either leads with a registered
   * manager — in which case the pre-pass has already put that house in
   * PLATFORM_HOUSE and (3) refuses it — or leads with no manager, in which case
   * the loop below finds nothing and returns null anyway. So the refusal is
   * UNREACHABLE: evaluated both ways over all 15,685 distinct issuer cells in
   * the store it fires on 136 and changes the answer on 0.
   * A condition unreachable by construction is worse than an inert one, because
   * it reads as a guard and is dead code. The regex survives because the
   * PRE-PASS needs it; the guard does not. */
  if (raw.includes("/")) return null;                     // (2) names several firms
  const t = norm(iss).split(" ").filter(Boolean);
  if (t.length < 2) return null;                   // already bare — nothing to reduce
  for (let n = Math.min(3, t.length); n >= 1; n--) {
    const p = t.slice(0, n).join(" ");
    if (!idx.managers.has(p)) continue;
    if (n === t.length) return null;               // no reduction is not a candidate
    return PLATFORM_HOUSE.has(p) ? null : p;       // (3) store-attested platform
  }
  return null;
};

/* THE PRE-PASS FOR (3). It must complete before the main loop, because that
 * loop is where `houseCore` is consulted — so this reads the issuer column of
 * the lineup shards on its own. Cheap: the `iss` field only, no renderer.
 * The house is taken with the SAME reduction, minus (1) and (2), so a house is
 * judged on its own merits rather than being pre-refused by the conditions this
 * one complements. */
{
  const lead = (iss) => {
    const t = norm(iss).split(" ").filter(Boolean);
    for (let n = Math.min(3, t.length); n >= 1; n--) {
      const p = t.slice(0, n).join(" ");
      if (idx.managers.has(p)) return p;
    }
    return null;
  };
  let cells = 0;
  for (let s = 0; s < 64; s++) {
    const f = `${ROOT}/data/lineups/${String(s).padStart(2, "0")}.json`;
    if (!existsSync(f)) continue;
    for (const e of Object.values(JSON.parse(readFileSync(f, "utf8")))) {
      if (!e || !Array.isArray(e.funds)) continue;
      for (const fd of e.funds) {
        const i = String(fd.iss || "").trim();
        if (!i || !ISS_DECLARES_VEHICLE.test(i)) continue;
        cells++;
        const h = lead(i);
        if (h) PLATFORM_HOUSE.add(h);
      }
    }
  }
  /* assert the control rather than trust it: the houses the gain rests on must
   * not be flagged, and a run where they are is a run that must not ship */
  for (const h of ["fidelity", "vanguard", "principal", "dimensional", "american funds",
                   "american century", "neuberger", "schwab", "prudential", "new york"]) {
    if (PLATFORM_HOUSE.has(h)) throw new Error(`platform pre-pass flagged "${h}" — it carries the gain; refusing to write a table`);
  }
  console.error(`platform pre-pass: ${PLATFORM_HOUSE.size} house(s) attested as selling through a wrapper, from ${cells} declaring cell(s) — ${[...PLATFORM_HOUSE].join(", ")}`);
}

function secAsk(nameRaw, nameClean, iss) {
  const k = `${iss}\u0000${nameRaw}\u0000${nameClean}`;
  if (secCache.has(k)) return secCache.get(k);
  let out = null;
  /* the same order `lookupTicker` tries: the name as filed, then the cleaned
   * one. Asking only the cleaned name loses rows whose markers the registry
   * tolerates; asking only the raw one loses rows the cleaner repairs. */
  const names = nameRaw === nameClean ? [nameRaw] : [nameRaw, nameClean];
  const tries = [];
  for (const n of names) tries.push([n, iss]);
  /* then, and only then, the apostrophe-repaired spellings */
  const issX = aposExpand(iss);
  for (const n of names) {
    const nX = aposExpand(n);
    if (nX !== n || issX !== iss) tries.push([nX, issX]);
  }
  /* and last, the issuer cell reduced to the house the registry attests */
  const issCore = houseCore(iss);
  if (issCore) for (const n of names) {
    tries.push([n, issCore]);
    const nX = aposExpand(n);
    if (nX !== n) tries.push([nX, issCore]);
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
      /* `let`, because the bare-class promotion below rebinds it. It returns a
       * NEW object rather than mutating, which matters: `secAsk` is cached. */
      let sec = secAsk(f.nameRaw, f.name, f.iss || "");
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
      /* AFTER the vehicle question and BEFORE the asserted/comparable split: a
       * bare registered name names the un-designated class. Additive by
       * construction — it returns the original answer in every other case —
       * and `registrantAttested` below still runs on whatever it returns. */
      sec = bareClassPromote(sec);
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
