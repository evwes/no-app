#!/usr/bin/env node
/* Merge matrix parse deltas (results-*.json) into the lineup stores:
 * lineups-status.json, data/lineups/ shards, lineups-index.json. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { indexFlags, JUNK_NAME_RE, AGG_DISCLOSURE, GENERIC_TYPE_NAME } from "./lib-4i.mjs";
import { isGenericTypeName } from "./lib-4i.mjs";
import { hasNoFundIdentity } from "./lib-disclose.mjs";

const SHARDS = 64;
const shardOf = (ack) => {
  let h = 0;
  for (const c of ack) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % SHARDS;
};
const shardName = (i) => `data/lineups/${String(i).padStart(2, "0")}.json`;
mkdirSync("data/lineups", { recursive: true });

const buckets = Array.from({ length: SHARDS }, () => ({}));
for (let i = 0; i < SHARDS; i++) {
  try { Object.assign(buckets[i], JSON.parse(readFileSync(shardName(i), "utf8"))); } catch { /* first run */ }
}
let status = { plans: {} };
try { status = JSON.parse(readFileSync("lineups-status.json", "utf8")); } catch { /* first run */ }
// snapshot pre-merge confidence for the post-merge diff report
const prevConfident = new Set(Object.entries(status.plans).filter(([, m]) => m.c).map(([a]) => a));
// snapshot the SHAPE of every confident entry too: a loss whose old parse
// looked like a real menu (many rows, sane ratio) is a regression candidate
// that must be triaged, not scrolled past — v49 lost 754 real menus and
// only a by-hand classification caught it (accuracy log 2026-08-11)
const prevShape = {};
for (let i = 0; i < SHARDS; i++) {
  for (const [a, e] of Object.entries(buckets[i])) {
    if (e.confident && e.funds) {
      // agg: the OLD lineup was dominated (>=90% of its sum) by rows named
      // like accounting categories — losing it is a cleanup, not a broken
      // menu, and the triage below skips it. Added after v111's withdrawal
      // of five REAL 3-4 row Vanguard menus sailed under the old n>=5
      // floor: the floor can only drop to n>=3 with this discriminator,
      // or every justified 3-row aggregate cleanup floods the audit.
      const sum = e.funds.reduce((x, f) => x + (f.value || 0), 0);
      // AGG_DISCLOSURE, never NOT_FUND_SHAPED: the broad list's total-prefix
      // arm reads "Total Stock Market Index" menus as aggregates — the exact
      // v110 regression this floor-lowering exists to catch (the unit check
      // caught the same reuse HERE before it shipped)
      const aggSum = e.funds.reduce((x, f) => {
        const nm = String(f.name || "").trim();
        return x + (AGG_DISCLOSURE.test(nm) || GENERIC_TYPE_NAME.test(nm) ? (f.value || 0) : 0);
      }, 0);
      prevShape[a] = { n: e.funds.length, r: e.coverageRatio || 0, agg: sum > 0 && aggSum / sum >= 0.9, fb: e.fb || null };
    }
  }
}

const files = readdirSync(".").filter((f) => /^results-\d+\.json$/.test(f));
console.log(`merging ${files.length} delta files`);
let applied = 0;
for (const f of files) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  for (const [ack, meta] of Object.entries(d.status)) {
    status.plans[ack] = meta;
    const b = buckets[shardOf(ack)];
    // an ack absent from d.entries means "leave the stored entry alone"
    // (download failures preserve the previous parse); an explicit null
    // means "remove it" (parse produced nothing worth keeping)
    if (ack in d.entries) {
      const entry = d.entries[ack];
      if (entry) b[ack] = entry;
      else delete b[ack];
    }
    applied++;
  }
}

// purge entries for superseded filings: when a newer filing replaces an
// ack in plans-all, the old entry is never displayed again but its stale
// data (parsed under years-old rules) polluted the audit and the payload —
// 6,132 orphans found 2026-07-26
/* Also used by the loss triage below, which is why it is hoisted out of the
 * try block: an ack that is no longer any plan's CURRENT filing cannot be a
 * parser regression, whatever its old lineup looked like. */
let currentAcks = null;
try {
  const pd = JSON.parse(readFileSync("plans-all.json", "utf8"));
  const ai = pd.fields.indexOf("ack");
  const current = new Set(pd.plans.map((r) => r[ai]));
  for (const t of JSON.parse(readFileSync("mtias.json", "utf8")).trusts) current.add(t.ack);
  currentAcks = current;
  let purged = 0;
  for (const ack of Object.keys(status.plans)) {
    if (!current.has(ack)) { delete status.plans[ack]; delete buckets[shardOf(ack)][ack]; purged++; }
  }
  if (purged) console.log(`purged ${purged} orphaned entries (superseded filings)`);
} catch { /* plans-all absent in some local invocations — skip the purge */ }

// COLLECTIVE-TRUST typing from Schedule D. Filers routinely describe CIT
// holdings as "Mutual Fund" in the schedule-of-assets description column —
// R.H. White did it for 13 Great Gray T. Rowe Price trusts worth $49.0M, 70%
// of the plan. Schedule D reports those same trusts with exact dollar values,
// so an exact value match retypes the row and marks it `cit`, which stops the
// site pricing it off a mutual-fund share class it does not hold.
try {
  const pa = JSON.parse(readFileSync("plans-all.json", "utf8"));
  const ai = pa.fields.indexOf("ack"), ci = pa.fields.indexOf("cctVals");
  if (ci !== -1) {
    const byAck = new Map();
    for (const r of pa.plans) if (r[ci]) byAck.set(r[ai], new Set(String(r[ci]).split(" ").map(Number)));
    let plansTyped = 0, rowsTyped = 0;
    for (let i = 0; i < SHARDS; i++) {
      for (const [ack, e] of Object.entries(buckets[i])) {
        const vals = byAck.get(ack);
        if (!vals || !e.funds) continue;
        let hit = 0;
        for (const f of e.funds) {
          if (!vals.has(f.value) || f.cit) continue;
          f.cit = 1;
          f.type = "Collective trust";
          hit++;
        }
        if (hit) { plansTyped++; rowsTyped += hit; }
      }
    }
    console.log(`Schedule D collective-trust typing: ${rowsTyped} holdings retyped across ${plansTyped} plans`);
  }
} catch (e) { console.warn("CIT typing skipped: " + e.message); }

// junk-name demotion: a stored entry whose fund names carry form/statement
// vocabulary must not STAY confident just because its PDF became
// undownloadable — S3-withdrawn filings keep their last parse forever, so
// parser-side junk guards can never reach them (the 2026-08-18 audit
// carried the same 8 lineup-junk HIGHs across every run; all 8 were
// e:'download' at pv 36-43). A future successful re-parse writes a fresh
// entry and is judged on its own merits.
let demoted = 0;
const demotedAcks = new Set();
for (let i = 0; i < SHARDS; i++) {
  for (const [ack, e] of Object.entries(buckets[i])) {
    if (!e.confident || !e.funds) continue;
    const junk = e.funds.find((f) => JUNK_NAME_RE.test(f.name || ""));
    if (!junk) continue;
    e.confident = false;
    if (status.plans[ack]) status.plans[ack].c = 0;
    demoted++;
    demotedAcks.add(ack);
    console.log(`junk-name demotion: ${ack} — "${String(junk.name).slice(0, 60)}"`);
  }
}
if (demoted) console.log(`demoted ${demoted} junk-named confident entries (stored, unfetchable)`);

/* LEADING JUNK ON THE ISSUER CELL — 2026-09-30 (14:2xZ).
 *
 * Found by the 14:2xZ participant-weighted draw on Capital Blue Cross (2,862
 * ppl), whose 29-row Vanguard menu is immaculate but whose issuer column
 * carries the PREVIOUS row's wrapped tail. That class is still open; this arm
 * is the piece of it that is decidable per row, and it is much the larger.
 *
 * The page renders `f.iss` with only `*` removed (app.js:2619) and the
 * crawlable pages print it too, so 567 plans are shown `— Fidelity
 * Investments`, `. Mutual of America`, `-0- VOYA FINANCIAL`, `‘Vanguard` or
 * `| Principal Life Insurance Company` as the firm behind their fund. A
 * statement's bullet, a page number and an OCR'd leader are not part of a
 * firm's name.
 *
 * IT IS AN HONESTY FIX AND NOT A COVERAGE FIX, MEASURED THROUGH ALL THREE
 * RESOLVERS rather than assumed: app.js's `lookupTicker`, app.js's
 * `fundERRow` and this file's own SEC `resolveHolding` each report 0 gained,
 * 0 lost, 0 changed over the whole affected population — because
 * `fund-er.js` already matches straight through a leading `—`, a bare `.`
 * and even `-0-`, exactly as it does through a trailing `+` and a leading
 * stray quote. A clean zero reports on the query, so each arm was
 * positive-controlled first: with the issuer supplied rather than stripped,
 * all three move (`500 Index Fund` {} -> {Vanguard} gains VFIAX, 0.03 and
 * VFINX). The harm here is the CLAIM alone.
 *
 * WHY THE RUN IS NOT LETTERS-AND-DIGITS, which is where the reading paid:
 * the naive `^[^A-Za-z0-9]+` stops at the digit and leaves `0- VOYA
 * FINANCIAL`. 27 leaders carry a digit and every one is a PAGE NUMBER or a
 * statement legend — `-0- JOHN HANCOCK` and its fifteen siblings (a John
 * Hancock / Voya template), `-18- Sponsor: Houston Distributing Company
 * inc.`, `-14- American Funds`, `%4 John Hancock`, `- 13 - Empower Trust
 * Company, LLC`. So the run is every non-LETTER, and that is safe by a
 * whole-population fact rather than a judgement: across all 535,864 stored
 * issuer values, ZERO lead with a digit.
 *
 * ZERO also lead with a party-in-interest `*` (v127 strips it upstream), so
 * this arm cannot consume that marker — checked, because an issuer strip that
 * quietly dropped it would be withdrawing a filed fact.
 *
 * THE GATE IS THE SIBLING ARM'S: the remainder must begin with a capital.
 * That is what refuses the OCR wreckage instead of half-repairing it —
 * `/anguard Group` (a `V` read as a slash) would become `anguard Group`, and
 * `.lohn Ilancock USA` would become `lohn Ilancock USA`. Both are left as
 * filed. All 403 distinct values were read, which is the whole population,
 * and not one remainder is anything but a real firm or fund name.
 *
 * IT RUNS BEFORE THE CAPTION STRIP BELOW SO THE TWO COMPOSE, and that is
 * where the largest single transformation comes from: `. GROUP ANNUITY
 * CONTRACT Mutual of America` (5,145 rows) loses its leading dot here and is
 * then a caption the strip below already knows, landing on `Mutual of
 * America`. The order also feeds that strip's own evidence — its pass 1
 * counts how often a value stands ALONE, and 403 damaged variants were
 * splitting that count away from their clean forms.
 *
 * Not a PARSER_VERSION change: it needs no re-parse and takes effect on the
 * next merge. */
function stripIssuerLead(iss) {
  const v = String(iss || "").trim();
  if (!v) return null;
  const run = (v.match(/^[^A-Za-z]+/) || [""])[0];
  if (!run) return null;
  /* THE RUN MUST END IN PUNCTUATION OR SPACE, which is what makes a
   * digit-leading FIRM safe by construction rather than by a head count. No
   * issuer in the store leads with a digit today — that was measured over all
   * 535,864 values — but `3M Company` would otherwise strip to `M Company`,
   * and a rule whose safety rests on a population that can change is a rule
   * waiting to break. A page number is fenced off from the firm (`-0- VOYA`,
   * `-18- Sponsor:`, `%4 John Hancock`); a digit INSIDE a name is not. */
  if (/[A-Za-z0-9]$/.test(run)) return null;
  const rest = v.slice(run.length).trim();
  if (!rest) return null;
  /* An issuer is a firm name and begins with a capital. This is the sibling
   * arm's own gate and it is what refuses OCR wreckage rather than
   * half-repairing it: `/anguard Group` (a V read as a slash) would become
   * `anguard Group`, and `.lohn Ilancock USA` would become `lohn Ilancock
   * USA`. Both are left exactly as filed. */
  if (!/^[A-Z]/.test(rest)) return null;
  return rest;
}
{
  let led = 0; const ledAcks = new Set();
  for (let i = 0; i < SHARDS; i++)
    for (const [ack, e] of Object.entries(buckets[i])) {
      if (!e || !e.confident || !Array.isArray(e.funds)) continue;
      for (const f of e.funds) {
        const rest = stripIssuerLead(f.iss);
        if (rest === null) continue;
        f.iss = rest; led++; ledAcks.add(ack);
      }
    }
  if (led) console.log(`issuer leading-junk strip: ${led} rows across ${ledAcks.size} plans`);
}

/* A 4i SECTION CAPTION GLUED ONTO THE ISSUER COLUMN.
 *
 * CHS/Community Health (91,940 ppl) stores `iss = "Master Trust Principal
 * Life Insurance Company"` where the filing's identity column reads only
 * `Principal Life Insurance Company` and `Master Trust` is a caption above
 * the rows. CLAUDE.md's 4i invariants already say section headers must not
 * glue into names.
 *
 * WHY THIS LIVES IN THE MERGE AND NOT THE PARSER, which is the whole reason
 * it took a separate change: the condition is 361 rows / 112 plans / 617,829
 * ppl, and it is NOT one class. USC (44,948 ppl) stores `Real Estate Account
 * (CREF)` -- TIAA's ACTUAL Real Estate Account -- and Sony's `Corporate Stock
 * - Common` is a pure type label. A blanket strip destroys real names.
 *
 * The test that separates them is EMPIRICAL rather than vocabulary: does the
 * REMAINDER appear as a COMPLETE issuer on other published rows? CHS's
 * `Principal Life Insurance Company` stands alone 16,457 times across the
 * store; `Account (CREF)` and `- Common` stand alone never. That evidence is
 * STORE-WIDE, so lib-4i cannot run it -- it sees one filing -- and neither
 * can the dedup stage, which sees one row set. The merge holds the whole
 * store, so this is where it can be decided.
 *
 * Measured on the v179 store: GLUE 114 rows / 43 plans / 275,782 ppl;
 * KEEP 247 / 75 / 445,935 left untouched. CHS lands on BOTH sides -- its
 * `Master Trust Principal...` rows strip and its `Master Trust CHS/Community
 * Health Systems, Inc.` rows do not, because a sponsor name is not a
 * standalone issuer anywhere. A partial fix on strong evidence beats a whole
 * one on weak evidence.
 *
 * Not a PARSER_VERSION change: it needs no re-parse and takes effect on the
 * next merge.
 *
 * VOCABULARY WIDENED 2026-09-28, and the diagnosis is the one this record
 * keeps arriving at from the other side: the MECHANISM was right and one
 * dimension of it was too narrow. Found by the 10:0xZ participant-weighted
 * draw — Starbucks (307,988 participants) stores `Target Date Funds Vanguard`
 * on the first row under its target-date heading, and the caption escaped
 * because only vehicle labels were listed. Measured store-wide against the
 * v188 store, the escapees are 707 rows / 231 plans / 862,093 ppl, and the
 * dominant one is not a vehicle label at all: a bare leading `Company`, 569
 * rows, the tail of a wrapped `… Trust Company` landing at the front of the
 * next row's issuer.
 *
 * WIDENING THIS IS SAFE BY CONSTRUCTION, which is why it is a vocabulary
 * change and not a new rule: the strip still happens only where the REMAINDER
 * stands alone as a complete issuer elsewhere in the store. `Company Vanguard
 * Fiduciary Trust` strips because `Vanguard Fiduciary Trust` stands alone; a
 * firm actually named `Company of New York` would leave `of New York`, which
 * stands alone nowhere. The empirical gate does the work the vocabulary
 * cannot.
 *
 * AND THE BARE `Cash` ARM IS GONE, WITHDRAWN AFTER IT SHIPPED. It won 15
 * strips (`Cash Vanguard`, `Cash Charles Schwab`) and cost two: `Cash
 * Equivalents` -> `Equivalents`. The remainder guard was supposed to stop
 * exactly that and did not, because I tested it on `Cash equivalents` —
 * lowercase, the one casing the first draft happened to produce — and
 * `/^[A-Z0-9]/` waves the title-cased variant straight through. A guard tested
 * on one casing of one example.
 *
 * A COUNT FLOOR WAS THE OBVIOUS SECOND FIX AND THE DATA REFUSED IT. Across all
 * 789 strips, the remainders that stand alone fewest times are `Account
 * American Funds` (2), `Comerica Bank and Trust, N.A` (2), `Earnest` (3),
 * `Equivalents` (3), `Prudential Retirement` (3). Any floor that catches
 * `Equivalents` also refuses two real firms, and any floor that spares them
 * keeps `Equivalents`. Frequency does not separate a term from a surname here,
 * so no floor is the right instrument — which is worth more than the fix.
 *
 * What DOES separate them is that `Cash Equivalents` is a single asset-class
 * TERM whose second word is not a firm, and nothing in the store distinguishes
 * that from caption-plus-firm without a vocabulary this rule exists to avoid.
 * So the arm is withdrawn rather than patched: 15 strips lost, the class of
 * damage closed. `cash and mutual funds` stays because its remainder follows a
 * COMPLETE phrase.
 *
 * DELIBERATELY NOT ADDED: bare `Growth`, `Value`, `Index`, `International`.
 * They are 3 rows each in the measurement and `Value Line` is a real house —
 * nine rows is not worth a vocabulary arm that has to be right about a firm
 * name. The escapee count is therefore a FLOOR and is stated as one. */
{
  const SECTION_HEAD = /^(?:master trust(?: investment account)?|common[\/ ]?collective trusts?|collective (?:investment )?trusts?|pooled separate accounts?|separate accounts?|(?:shares of )?registered investment compan(?:y|ies)(?: shares)?|mutual funds?(?:,? at fair value)?|common stocks?|corporate (?:debt|stock)s?|government securities|interest[- ]bearing cash|real estate|103[- ]12 investments?|compan(?:y|ies)|target[- ]date funds?|group annuity contracts?|guaranteed (?:interest|investment) contracts?|cash and mutual funds?)\s+(?=\S)/i;
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  /* pass 1: how often does each issuer value stand ALONE across the store? */
  const standalone = new Map();
  for (let i = 0; i < SHARDS; i++)
    for (const [, e] of Object.entries(buckets[i])) {
      if (!e || !e.confident || !Array.isArray(e.funds)) continue;
      for (const f of e.funds) {
        const v = String(f.iss || "").trim();
        if (v && !SECTION_HEAD.test(v)) standalone.set(norm(v), (standalone.get(norm(v)) || 0) + 1);
      }
    }
  /* pass 2: strip the caption only where the remainder is itself a known issuer */
  let fixed = 0; const fixedAcks = new Set();
  for (let i = 0; i < SHARDS; i++)
    for (const [ack, e] of Object.entries(buckets[i])) {
      if (!e || !e.confident || !Array.isArray(e.funds)) continue;
      for (const f of e.funds) {
        const v = String(f.iss || "").trim();
        const m = v.match(SECTION_HEAD);
        if (!m) continue;
        const rest = v.slice(m[0].length).trim();
        if (rest.length < 3 || !standalone.get(norm(rest))) continue;
        /* THE REMAINDER MUST STILL LOOK LIKE A FIRM, and this line exists
         * because the widened vocabulary produced two dangling fragments in
         * its first draft — `Cash equivalents` -> `equivalents` (5 rows) and
         * `Company of America` -> `of America` (5 rows). Both cleared the
         * standalone gate, which is the more interesting half: a floor of ONE
         * means a single already-damaged row LICENSES the same damage
         * elsewhere, so the gate can be fed by its own mistakes. An issuer is
         * a firm name and begins with a capital or a digit; a fragment left
         * behind by an over-eager cut begins lowercase. Ten rows, caught by
         * printing every distinct transformation rather than the count — the
         * count looked clean at 809. */
        if (!/^[A-Z0-9]/.test(rest)) continue;
        f.iss = rest; fixed++; fixedAcks.add(ack);
      }
    }
  if (fixed) console.log(`issuer section-caption strip: ${fixed} rows across ${fixedAcks.size} plans`);
}

/* AN OCR COLUMN-BLEED RESIDUE ON THE HOLDING NAME — 2026-09-30 (08:3xZ).
 *
 * A scanned 4i schedule can drop two or three letters of the adjacent column
 * onto the end of an otherwise immaculate fund name: `Nuveen Real Estate Sec
 * Sel R6 ial`, `PGIM High Yield Fund R6 ial`, `Vanguard Total International
 * Stock Index Fund, Admiral Shares ae`, `Voya Index Solution 2050 P Z lal`.
 * 84% of the population sits in entries carrying `ocr`.
 *
 * IT LIVES HERE AND NOT AT DISPLAY, and the reason is a standing guarantee
 * rather than a preference. The only sound narrowing gate is *does the HEAD
 * already name a fund*, which is an outcome test through `fund-er.js` — and
 * `build-seo-pages.mjs` must NEVER import `fund-er.js`, that absence being
 * what makes it impossible for a crawlable page to render a per-fund ER. A
 * purely syntactic display rule cannot do the job either, because no such
 * rule separates `Vanguard Total Bond Market Index Ad min` (a split
 * `Admiral`, MUST KEEP) from `Nuveen Real Estate Sec Sel R6 ial`.
 *
 * So the test is the ISSUER STRIP'S OWN, which only the merge can ask because
 * only the merge holds the whole store: **does the head appear as a COMPLETE
 * published name elsewhere?** `PGIM High Yield Fund R6` stands alone 627
 * times, `Small Cap Index` 898, `International Index` 514. The damaged strings
 * do not: `Vanguard Total Bond Market Index Ad` is seen twice and is refused.
 *
 * THE FLOOR IS 3 AND NOT 1 for the reason written twenty lines above — a floor
 * of one lets a single damaged row LICENSE the same damage elsewhere. Measured
 * across floors: 1 -> 3,841 rows, 2 -> 3,519, 3 -> 3,309, 5 -> 3,136.
 *
 * AND THE GATE WAS STILL FED BY ITS OWN MISTAKE ONCE, which is why the numeric
 * guard exists. `Putnam Stable Value Fund 15 bps` strips to `Putnam Stable
 * Value Fund 15` — attested THIRTY times, because those thirty rows had
 * already lost their `bps`, the basis-point unit that is the whole meaning of
 * the number. A fund name ending in a bare number is the signature of a lost
 * suffix, so a head of that shape is refused. Cost 8 rows, every one of which
 * looked like a correct repair (`LVIP Dimensional U.S. Core Equity 1 ee`);
 * accepted, because refusing a repair is the safe direction and `bps` was
 * found by probing rather than by luck.
 *
 * OUTCOME THROUGH `fund-er.js`, AND IT IS NOT THE "NOTHING MOVES" PREDICTED:
 * 0 tickers gained, **0 LOST**, 0 flipped — but **5 rows stop publishing a fee
 * the pattern table matched off the OCR NOISE ITSELF.** `af` reads as AMERICAN
 * FUNDS and put 0.4% on `Vanguard Strategic Equity Fund af` and on `FIDELITY
 * ZERO TOTAL MARKET INDEX af`; `mm` reads as MONEY MARKET and put 0.2% on
 * `EuroPacific Growth Fund - Class R6 mm` and on `Avantis Emerging Markets
 * Equity Fund Institutional Class mm`. Three fees are withdrawn and two
 * corrected. *A residue is not inert: two letters can name a house.*
 *
 * THE KEEP LIST IS NOT DECORATION — each entry was found by a probe or by the
 * outcome test. `bps` is the unit above. `ind`, `idx` and `ext` are TRUNCATED
 * WORDS, not residue: `Vanguard Total Bond Market ind` is `… Market Index`,
 * and stripping it was the ONE genuine ticker loss in the first measurement
 * (VBTLX). The rest are ordinary trailing tokens of real fund names.
 *
 * 3,291 rows / 671 plans / 565,760 participants / $5,593,466,858. */
{
  const TAIL = /^(.+?[A-Za-z0-9)])\s+([a-z]{2,3})$/;
  /* tokens that legitimately END a filed fund name: share classes, vehicle and
   * asset abbreviations, ordinary words, the basis-point unit, and the three
   * truncated words the outcome test convicted. */
  const TAIL_KEEP = new Set(["the","and","inc","llc","ltd","co","ii","iii","iv","adv","idx","adm",
    "inv","ret","gr","fd","tr","lp","na","us","uk","eq","sm","mid","cap","bd","gov","int","of","at",
    "in","on","to","by","for","shs","par","new","all","one","two","net","sub","non","pre","pro",
    "per","via","est","fee","tax","usa","reg","are","sel","svc","ins","agg","em","ex","hy","ig",
    "re","sa","ac","fi","bps","bp","ind","ext"]);
  const NUMERIC_HEAD = /\s\d{1,3}$/;
  const key = (x) => String(x).trim().toLowerCase();
  const headOf = (n) => {
    const m = TAIL.exec(String(n || "").trim());
    if (!m || TAIL_KEEP.has(m[2].toLowerCase())) return null;
    const h = m[1].trim();
    if (h.length < 12 || h.split(/\s+/).length < 2) return null;
    if (NUMERIC_HEAD.test(h)) return null;
    return h;
  };
  /* pass 1: how often does each NAME stand alone across the whole store? */
  const whole = new Map();
  for (let i = 0; i < SHARDS; i++)
    for (const [, e] of Object.entries(buckets[i])) {
      if (!e || !e.confident || !Array.isArray(e.funds)) continue;
      for (const f of e.funds) {
        const n = String(f.name || "").trim();
        if (n) whole.set(key(n), (whole.get(key(n)) || 0) + 1);
      }
    }
  /* pass 2: strip only where the head is independently attested */
  let bled = 0; const bledAcks = new Set();
  for (let i = 0; i < SHARDS; i++)
    for (const [ack, e] of Object.entries(buckets[i])) {
      if (!e || !e.confident || !Array.isArray(e.funds)) continue;
      for (const f of e.funds) {
        const h = headOf(f.name);
        if (!h || (whole.get(key(h)) || 0) < 3) continue;
        f.name = h; bled++; bledAcks.add(ack);
      }
    }
  if (bled) console.log(`ocr tail-residue strip: ${bled} rows across ${bledAcks.size} plans`);
}

/* A LOST SPACE INSIDE A PUBLISHED FUND NAME — `Great Gray TrustInternational
 * Stock R1 Fund`, `Vanguard Total BondMarket Index Adm`, `JPMorganMid Cap
 * Growth Fund R6`. It runs BEFORE the SEC block on purpose: a repaired name is
 * what lets that resolver answer, and 36 of the 140 rows gain a ticker there.
 *
 * THE OBVIOUS PREDICATE IS NOT A CLASS AND THE SIZE IS THE TELL. A
 * lowercase-to-uppercase seam inside a token matches 93,171 published rows
 * across 39.5M participants, because CamelCase is how these funds are NAMED:
 * `LifePath` 28,826, `BlackRock` 24,868, `EuroPacific` 7,938,
 * `SmartRetirement` 5,221, `MassMutual` 3,634, plus ClearBridge, RealPath,
 * ActiveBeta, FlexPath, SmallCap, LargeCap, MyWayRet, YourPath.
 *
 * NOR DOES TOKEN RARITY DISCRIMINATE, which is the finding worth keeping.
 * Requiring the joined token to be unattested while both halves are ordinary
 * published words still leaves 529 rows / 689,387 ppl, and that is at least
 * THREE mechanisms: (A) REAL firm names that are merely rare — `FirstEnergy
 * common stock` at 16,802 participants and $458,084,933, `ExxonMobil Stock
 * Fund`, `BancPlus Corporation`, `HomeTrust Bancshares`, `LifePoint Health
 * Stable Value`, `SoundShore`, `VantageTrust` — which must NEVER be split;
 * (B) the genuine lost space; (C) a DOUBLE RENDER welded at the seam
 * (`Dodge & Cox IncomeDodge & Cox Income`), where splitting leaves a doubled
 * name and the defect is something else entirely. A rare-but-real CamelCase
 * name and a lost space are INDISTINGUISHABLE BY COUNT.
 *
 * So the test is the issuer strip's own, asked of the WHOLE REPAIRED NAME:
 * does the repaired string appear elsewhere as a COMPLETE published name?
 * `Vanguard Total Bond Market Index Fund: Inst'l Shr` stands alone 81 times,
 * `Vanguard Growth Index Adm` 1,271, `Blackrock Total Return Fund` 202. (A)
 * and (C) are refused BY CONSTRUCTION — `First Energy common stock` is
 * attested nowhere, and neither is a doubled name. The floor is 3 and not 1
 * for the reason written above the OCR strip.
 *
 * ONE REPAIR PER NAME, and it costs nothing: measured whole-store, ZERO names
 * offer more than one attested repair. A second pass would have to attest an
 * intermediate string that by construction does not exist.
 *
 * OUTCOME, and it is NOT the honesty fix this was queued as — all 137 distinct
 * transformations were read and every one is a real fund name: fund-er.js
 * +17 tickers / -0 / 0 flipped and +18 fees / -0 / 9 CHANGED (every change a
 * correction away from a generic pattern — `Vanguard Developed Markets Index
 * Admiral` 0.1 -> 0.05, `Fidelity Mid Cp Index Fund` 0.1 -> 0.025); and the
 * SEC index **+29 / -0 / 0**, including `FidelityTotal Bond K6 Fund` -> FTKFX,
 * the K6 share class this record has named as a defect four times.
 *
 * THAT 29 IS THE REAL MERGE'S NUMBER AND MY HARNESS SAID 36. The block below
 * stores `stk` only where the FILING types the row a registered mutual fund,
 * and my outcome test asked `resolveHolding` without that gate, so seven gains
 * sit on rows that never reach the field. *Measure through the function the
 * page calls* — here the merge's own gate, and the merge is what settled it.
 *
 * 140 rows / 98 plans / 140,349 participants / $291,925,206. Measured on the
 * RAW stored name, which is what the merge holds; the same predicate over
 * `cleanFiledName`'s output reads 151 / 108 / 151,454, and that is the
 * DISPLAY string, not this one. */
{
  const SEAM = /\b[A-Za-z]{3,}[a-z][A-Z][a-z]{2,}[A-Za-z]*\b/g;
  const nk = (s) => String(s).trim().toLowerCase();
  /* a CLASS key: the registry writes `Class R-6` where a filer writes `Class
   * R6`, so the comparison has to be punctuation-insensitive. `nk` deliberately
   * is not — see the class-rotation note below, where that strictness is what
   * keeps a rotated name with a punctuation seam attested nowhere. */
  const ck = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const whole = new Map(), tok = new Map();
  for (let i = 0; i < SHARDS; i++)
    for (const [, e] of Object.entries(buckets[i])) {
      if (!e || !e.confident || !Array.isArray(e.funds)) continue;
      for (const f of e.funds) {
        const n = String(f.name || "").trim(); if (!n) continue;
        whole.set(nk(n), (whole.get(nk(n)) || 0) + 1);
        for (const t of n.split(/[^A-Za-z]+/))
          if (t.length > 1) tok.set(t.toLowerCase(), (tok.get(t.toLowerCase()) || 0) + 1);
      }
    }
  const cnt = (w) => tok.get(String(w).toLowerCase()) || 0;
  /* THE SAME EVIDENCE, OVER THE ISSUER COLUMN — 2026-10-02 (12:3xZ).
   *
   * `weldRepair` below repairs a lost space at a CamelCase seam, and the same
   * damage stands in the ISSUER column, which that arm never read. Gehl Foods
   * (1,110 ppl) publishes `Enter N Fund` with issuer `JanusHenderson`; the
   * class is `John HancockLife Insurance Company` (36 + 32), `T. RowePrice`
   * (19), `OppenheimerFunds` (17), `StateStreet Global Advisors` (15),
   * `AmericanFunds` (10), `GoldmanSachs`, `GreatGray Trust Company`,
   * `WilmingtonTrust` and 22 more. *A fix for one COLUMN is not a fix for the
   * class* — this record's fifth surface of that shape, after POSITION, COLUMN,
   * PHRASING and CLASS.
   *
   * It is not only honesty: `lookupTicker` PREPENDS the issuer (app.js, v67),
   * so damaged issuer text can block a match the repaired form would make, and
   * `resolveHolding` reads the issuer too. Measured below — it is NOT
   * ticker-neutral.
   *
   * THE ATTESTATION EVIDENCE MUST COME FROM THE COLUMN BEING REPAIRED, and
   * that is the finding rather than a precaution. Asked with the maps the
   * shipped arm holds — built over NAMES — the same function reads 827 rows /
   * 697,199 ppl, and 668 of those are `AllianceBernstein` -> `Alliance
   * Bernstein`: the one wrong repair #545 names as its own cost, AMPLIFIED
   * 42-FOLD, because that firm's joined spelling is common in FUND names
   * (`AllianceBernstein Small Cap Growth`) and rare as a standalone issuer. The
   * issuer column's own evidence refuses it. *A repair whose evidence comes from
   * a different population than the one it edits inherits that population's
   * damage.* DO NOT CARRY 827 OR 697,199 FORWARD.
   *
   * SO IT IS ONE PREDICATE ASKED TWICE, never a second copy: `weldRepair` takes
   * the evidence as a parameter and defaults to the name maps, so the NAME arm
   * is unchanged by construction and the two asks are provably the same
   * question. The v185 rule — one function, because the whole value of asking
   * twice is that both asks are the same question.
   *
   * AND `whole` OVER ISSUERS IS ALREADY THE SECOND WITNESS THE QUEUE ASKED FOR.
   * The entry proposed `stripIssuerLead`'s standalone test; that measurement
   * actually lives in the CAPTION STRIP ~250 lines above (its pass 1 counts how
   * often each issuer value stands ALONE), and `whole` built over the issuer
   * column IS that count. No third test was invented.
   *
   * THE CLASS, re-sized against the current store and unchanged from the draw:
   * 188 rows / 52 entries / 52 plans / 119,370 participants / $1,585,923,998,
   * 30 distinct transformations, ALL READ. The real merge reproduces it exactly.
   *
   * OUTCOME through the page's own render, before store vs after store, every
   * column positive-controlled first and the EXACT pre-filter being the
   * predicate's own first condition (189 candidate rows, not 1.7M): ticker
   * **+3 / -0 / 0 flipped**, fee **+3 / -0 / 1 changed**, asterisk **+2 / -0**.
   * So it is NOT ticker-neutral and is not claimed to be. All three gains read
   * against the registry: `American New Perspective R6` [AmericanFunds ->
   * American Funds] gains RNPGX, which `sec-funds.json` registers as that
   * series' Class R-6 and which twenty-odd SIBLING ROWS OF THE SAME NAME ALREADY
   * PUBLISH — the repaired row joins them, which is the strongest corroboration
   * available; and Sonoco's (11,589 ppl) two State Street collective trusts gain
   * SSSYX and MDY *behind the asterisk*, where the footnote's claim — a
   * collective trust with no ticker and no published ER — is TRUE of an `SL CL
   * II` unit class. The one fee CHANGE is 0.03 -> 0.02 on that row: an
   * unattributed generic replaced by the named comparable's own figure, under a
   * label. Both asterisk moves are GAINS, which is the weaker claim.
   *
   * STORE-SIDE: `stk` **+1 / -0 / 0 changed** — `resolveHolding` reads the
   * issuer too — and nothing else moves. Verified by running the real
   * `merge-4i` with no deltas and diffing all 64 shards field by field: 0 acks
   * added or removed, 0 row-count changes, 0 sums moved, `iss` on 188, `ftk`
   * `tk` `value` `type` on 0, and `lineups-status` / `lineups-index` /
   * `plans-index` byte-identical once `generated` is removed. The 1 `name`
   * change in that diff is HEAD's OWN residual arm — HEAD's merge on the same
   * store prints `lost-space repair: 1 rows across 1 plans` and `sec tickers:
   * 479694`, so this arm's contribution is +1 row / +0 plans, attributed to the
   * digit rather than differenced against a remembered number.
   *
   * SURFACE: 3 crawlable pages (`build-seo-pages.mjs:258` prints the issuer),
   * every changed cell read — Northern Trust Global Investments, Sonoco's
   * eleven State Street cells, Principal Global Investors Trust Co. And
   * `titleCase` had been LOWERCASING the seam, so the page showed `Statestreet`
   * and `Investorstrust` where the store showed the capitals: v519's finding
   * again, the display transform making the damage harder to see than the data.
   *
   * COSTS NAMED, 19 of 188 rows, and 0 published cells move on any of them.
   * `OppenheimerFunds, Inc.` was the firm's OFFICIAL one-word styling, so 17
   * rows are split wrongly; the store's own issuer column writes the spaced form
   * 60 times against the joined 17, so the row lands on the majority filed
   * spelling, and protecting it needs a vocabulary of one-word firm brands,
   * which the registry does not have and which is wrong in the unsafe
   * direction. `AllianceBernstien` (2 rows) is the filer's MISSPELLING of a
   * one-word brand: both forms are wrong, and it is the ONLY transformation
   * disjunct (1) contributes to this column — measured, so that disjunct is
   * load-bearing here only for a wrong repair, and it is kept anyway rather than
   * forked per column, because one predicate asked twice is worth two cosmetic
   * rows and the test asserts the figure so a later store surfaces as a surprise.
   *
   * AND THE QUEUE'S "ONE SEAM PER CALL NEEDS A LOOP" IS REFUTED BY MEASUREMENT.
   * A fixpoint loop repairs exactly the same 188 rows and changes 0 answers: the
   * residue `TRowePrice` -> `TRowe Price` (12 rows) and `T.RowePrice` ->
   * `T.Rowe Price` (2) is a HALF repair whose remaining seam is `T|R`, uppercase
   * then uppercase, which SEAM cannot see (it requires `[a-z][A-Z]`) and which
   * the all-caps arm cannot either (it requires `\b[A-Z]{8,}\b`). Asked
   * directly, `"TRowe Price".match(SEAM)` is EMPTY. So it is outside both arms BY
   * CONSTRUCTION and not for want of a pass; an uppercase-uppercase seam finder
   * is a separate measurement. The half repair is NOT worthless — it is what
   * buys Cantex's two fees (null -> 0.49).
   *
   * THE REGISTRY WITNESS IS DECORATIVE FOR THIS COLUMN AND IS LABELLED SO:
   * dropping `regSpellsJoined` changes 0 of the 188 rows, because the RATIO
   * already refuses every real one-word brand the registry knows (`BlackRock`
   * joined 8,984 against `Black Rock` 0, `MassMutual` 971, `TransAmerica`
   * 2,771, `ClearBridge` 440, `FullerThaler` 25). It is not decorative for the
   * NAME column, where the existing `weld-nowitness` control fails by name on
   * PCRIX, and it is one function, so the condition is already controlled.
   *
   * THE RATIO IS THE WHOLE GUARD HERE, priced: replacing it with a bare
   * attestation floor admits 940 further rows, and 729 of them are the
   * `AllianceBernstein` family — the same wrong repair the NAME maps produce,
   * reached from the other direction — plus `MainStay` -> `Main Stay` (50),
   * `AssetMark` -> `Asset Mark` (26), `IndexSelect` (53) and `EuroPacific` (13),
   * every one a real one-word brand. ITS OWN COST IS NAMED: `JohnHancock
   * Insurance Company` -> `John Hancock Insurance Company` is a CORRECT repair
   * refused by one factor (joined 33, repaired 72, and 72 > 99 is false), 33
   * rows. Refusing a repair is the safe direction.
   *
   * `w > joined * 3` DEGENERATES TO `w > 0` WHEN `joined` IS 0, so one
   * attestation would license a repair — and what forces `w >= 4` is that the
   * arm is asked only about strings drawn from the very column its maps are
   * built from, which makes `joined >= 1` true by construction. The maps are a
   * snapshot taken before the loop, so a row repaired earlier cannot move them.
   * `scripts/merge-name-test.mjs` ASSERTS every issuer pin is in-population for
   * that reason: `ExxonMobil` is attested 0 times as an issuer and `Exxon Mobil`
   * once, and the predicate splits it — a branch production cannot reach, so
   * pinning it would pin behaviour that does not exist.
   *
   * 31 PINS, added because of the 27 existing weld cases 10 answer differently
   * under the issuer maps and ALL TEN GO TO NULL — they are fund names and the
   * issuer column attests nothing for them, so not one is a must-REPAIR here and
   * the existing table could not have verified any issuer repair. (That
   * unanimity is also evidence the arm is not a blanket widening: handed the
   * wrong column's string it refuses.) A negative control PER CONDITION, each
   * asserted to have landed via the test's own `cut()`: the NAME maps fail by
   * name on 4 of 31 including `AllianceBernstein`; the bare floor on 8; dropping
   * disjunct (1) on exactly 1; the halves PRE-FILTER on 0 and is labelled
   * DECORATIVE. The CALL-SITE ORDER is decorative on this store too — 0 of
   * 1,730,676 published rows have BOTH columns damaged — so it is controlled on
   * a CRAFTED row instead, and moving the call after the chain leaves that row's
   * issuer unrepaired. */
  const issWhole = new Map(), issTok = new Map();
  for (let i = 0; i < SHARDS; i++)
    for (const [, e] of Object.entries(buckets[i])) {
      if (!e || !e.confident || !Array.isArray(e.funds)) continue;
      for (const f of e.funds) {
        const v = String(f.iss || "").trim(); if (!v) continue;
        issWhole.set(nk(v), (issWhole.get(nk(v)) || 0) + 1);
        for (const t of v.split(/[^A-Za-z]+/))
          if (t.length > 1) issTok.set(t.toLowerCase(), (issTok.get(t.toLowerCase()) || 0) + 1);
      }
    }
  const issCnt = (w) => issTok.get(String(w).toLowerCase()) || 0;
  const ISS_EV = { whole: issWhole, cnt: issCnt };
  /* THE CASE THE STORE ITSELF PUBLISHES for a token, most-frequent spelling
   * first with a deterministic tie-break. Read only by the `!` arm below, to
   * decide the CASE of a replacement character it has already chosen by
   * attestation — never to choose the character. */
  const caseOf = new Map();
  for (let i = 0; i < SHARDS; i++)
    for (const [, e] of Object.entries(buckets[i])) {
      if (!e || !e.confident || !Array.isArray(e.funds)) continue;
      for (const f of e.funds)
        for (const t of String(f.name || "").split(/[^A-Za-z]+/)) {
          if (t.length < 2) continue;
          const k = t.toLowerCase();
          if (!caseOf.has(k)) caseOf.set(k, new Map());
          const cm = caseOf.get(k); cm.set(t, (cm.get(t) || 0) + 1);
        }
    }
  const bangCase = (w) => {
    const cm = caseOf.get(String(w).toLowerCase());
    if (!cm) return null;
    return [...cm].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  };
  /* v529's own guard, PORTED BACK — 2026-10-02 (11:4xZ).
   *
   * `weldRepair` refused `EquityIncome Adm` because `cnt("EquityIncome") = 3`
   * and the ceiling below cuts at `> 2`: refused by ONE occurrence, and **all
   * three occurrences feeding it are damage** — this row, `Fidelity VIP
   * EquityIncome Fund`, and an all-caps address weld. That row then lost an SEC
   * ticker on #544, which the registration had put at −0.
   *
   * This is v529's recorded finding met in the arm v529 did not fix. Its comment
   * fifty lines below says the ceiling "CANNOT TRANSFER" to the all-caps arm
   * because *a ceiling that reads repetition as evidence of correctness is fed
   * by repeated damage*, and it built a RATIO between two WHOLE NAMES plus an
   * INDEPENDENT REGISTRY WITNESS instead. Both belong here too: the witness is
   * what protects a CamelCase house name (`BlackRock`, `Contrafund`,
   * `LifeStrategy`, `SmallCap`) by evidence outside this store, where the
   * ceiling protects it by its own frequency and so can be bought off by damage.
   *
   * SHIPPED AS A DISJUNCTION, so it is STRICTLY ADDITIVE BY CONSTRUCTION: the
   * old rule is kept as the first disjunct, measured at 0 rows repaired-only-
   * before over all 1,724,201 confident rows.
   *
   * AND THAT DISJUNCT IS SUBSUMED ON THIS STORE — 0 repairs lost across all
   * 415,221 distinct published names — so it is labelled as what it is rather
   * than carried as reassurance. It is NOT subsumed STRUCTURALLY: a repaired
   * name attested exactly 3 beside a damaged one attested 1 satisfies `w >= 3`
   * and fails `w > joined * 3`. So it stays as the guarantee that the widening
   * can only ADD, on this store and on any later one, and the test asserts the
   * 0 so a store that makes it load-bearing surfaces as a surprise.
   *
   * AND THE WITNESS ASKS CONTAINMENT, NOT EQUALITY, which that same test
   * settled: the naive form also lost PCRIX on 3 rows, because `realreturn` is
   * not a registry word while the registry spells the series
   * `CommodityRealReturn` — *the damaged token can be a proper SUBSTRING of a
   * registry word.* The caps arm's own equality test is DELIBERATELY left as it
   * is: widening it moves a different population (>=8-char all-caps tokens) and
   * that is a separate measurement.
   *
   * `secWords` is initialised ~70 lines below and this closure is first CALLED
   * ~500 lines below that, so the reference is safe at call time — and the arm
   * degrades to exactly the shipped rule when the registry is absent, so no
   * branch is worse than before. A future caller moved above the registry load
   * loses the widening and keeps the old behaviour; it cannot throw.
   *
   * MEASURED whole-store BY SLICING THIS BLOCK OUT OF BOTH REFS and running
   * the shipped bodies — never by restating the predicate, which is how the
   * first measurement of this change went wrong: it used its own `nk` (merge-4i
   * normalises only `trim().toLowerCase()`) and a far looser SEAM, read 1,153
   * rows, and three pins written off those numbers FAILED against the real
   * function. DO NOT CARRY 1,153 OR 775,449 FORWARD.
   *
   * The true effect, every column positive-controlled first and the two sides
   * asserted to disagree on the motivating row: **488 rows / 329 lineup entries
   * / 329 plans / 286,318 participants / $696,610,357**. Stored `stk` **+110 /
   * -0 / 0 changed**, display ticker **+58 / -0 / 0**, fee **+284 / -0 / 39
   * changed and 0 lost**, asterisks **+20 / -0** (a labelled comparable is the
   * weaker claim). ALL 270 DISTINCT TRANSFORMATIONS READ.
   *
   * COST NAMED, not rounded away: 16 rows across four strings split
   * `AllianceBernstein`, whose official spelling is one word and which no
   * registry word contains, into `Alliance Bernstein`. 0 tickers, 0 fees and 0
   * asterisks move on them, and the store's own filers write it spaced 72 times
   * against joined 14, so the row ends up agreeing with the majority filed
   * spelling. Three further rows move a fee toward the GENERIC estimate
   * (`Federal MoneyMarket Investor` 0.11 -> 0.2, two `... IndexFund` rows
   * 0.05 -> 0.1) — both in the OVERSTATING direction. */
  const regSpellsJoined = (t) => {
    if (!secWords) return false;
    const k = String(t).toLowerCase();
    if (secWords.has(k)) return true;
    for (const w of secWords) if (w.length > k.length && w.includes(k)) return true;
    return false;
  };
  /* `ev` carries the attestation evidence and DEFAULTS to the name maps, so
   * every existing caller is unchanged by construction. The issuer arm passes
   * `ISS_EV` — the SAME predicate over the column it edits. The registry
   * witness is deliberately NOT parameterised: it is a registry, not a
   * population, and it answers the same question for either column. */
  const weldRepair = (name, ev) => {
    const W = ev ? ev.whole : whole, CNT = ev ? ev.cnt : cnt;
    const s = String(name || "").trim();
    const joined = W.get(nk(s)) || 0;
    SEAM.lastIndex = 0; let m, best = null;
    while ((m = SEAM.exec(s))) {
      const t = m[0];
      const sm = /([a-z])([A-Z])/.exec(t);
      const i = t.indexOf(sm[0]) + 1;
      const L = t.slice(0, i), Rt = t.slice(i);
      if (CNT(L) < 3 || CNT(Rt) < 3) continue;        // both halves ordinary published words
      const rep = s.slice(0, m.index) + L + " " + Rt + s.slice(m.index + t.length);
      const w = W.get(nk(rep)) || 0;
      // (1) the SHIPPED rule, kept verbatim so the widening adds and never removes
      const shipped = CNT(t) <= 2 && w >= 3;
      // (2) v529's guard: repaired whole name >> damaged one, and the registry
      //     does not spell the token joined anywhere inside a fund's own name
      const widened = !!secWords && w > joined * 3 && !regSpellsJoined(t);
      if (shipped || widened) best = rep;
    }
    return best;
  };
  /* THE SAME LOST SPACE INSIDE AN ALL-CAPS NAME, which `weldRepair` cannot see
   * BY CONSTRUCTION. Its SEAM needs a lowercase letter followed by an uppercase
   * one inside a word, and an all-caps filed name never has one — so Texas
   * Children's (21,233 ppl) published `VANGUARDTARGET RETIREMENT INCOME`.
   *
   * The repair EVIDENCE transfers unchanged: does the repaired WHOLE NAME stand
   * alone elsewhere, floor 3. Only the seam finder differs — split an
   * unattested token into two attested ones.
   *
   * AND THE CEILING CANNOT TRANSFER, WHICH IS THE POINT. `weldRepair` refuses
   * when the joined token is itself attested more than twice, because that is
   * how a CamelCase house name (`BlackRock`, `LifePath`) is protected. Here the
   * drawn row's joined token is attested EIGHT times and its repaired whole
   * name 1,299 times — *a ceiling that reads repetition as evidence of
   * correctness is fed by repeated damage*, the floor-of-one lesson at a
   * ceiling of two. So the test is a RATIO between two WHOLE NAMES: the
   * repaired form must be attested far more often than the damaged one.
   *
   * THE RATIO IS THE WHOLE GUARD AND IT IS THE ONLY ONE — measured, not
   * asserted. Replacing it with a bare floor (repaired name attested >= 3)
   * admits a further 333 transformations and they overwhelmingly DESTROY REAL
   * FUND NAMES: `EUROPACIFIC` -> `EURO PACIFIC`, `CONTRAFUND` -> `CONTRA FUND`,
   * `JPMORGAN` -> `JPM ORGAN`, `BLACKROCK` -> `BLACK ROCK`, `LIFESTRATEGY` ->
   * `LIFE STRATEGY`, `SMALLCAP` -> `SMALL CAP`, `MASSMUTUAL` -> `MASS MUTUAL`,
   * `ALLSPRING` -> `ALL SPRING`. All of those are attested in their joined form
   * hundreds of times, which is exactly what the ratio reads.
   *
   * AND THE TWO CONDITIONS THAT LOOK LIKE GUARDS CANNOT FIRE, so they are named
   * as what they are rather than carried as reassurance. (a) A floor of 3 on the
   * repaired name is SUBSUMED: this runs only over confident entries and the
   * maps are built from the same population, so the row's own name is attested
   * at least once, and `w > joined * 3` already forces `w >= 4`. (b) The
   * both-halves-attested test is SUBSUMED too: if the repaired whole name is
   * published 4+ times then each half appears as a token in those same rows.
   * Removing either changes 0 of the 163 rows, measured. (b) stays only as a
   * PRE-FILTER — two map lookups instead of building a candidate string at
   * every split point — and is labelled so no later reader mistakes it for
   * protection.
   *
   * AND THE RATIO ALONE WAS NOT ENOUGH, which only the OUTCOME test could show.
   * It admitted `SMALLCAP WORLD R6 FUND` -> `SMALL CAP WORLD R6 FUND` and that
   * row LOST its ticker: the SEC registers the series as `SMALLCAP WORLD FUND
   * INC`, one word, so American Funds' own spelling is the joined one and the
   * split destroys the match. Reading all 62 transformations did not catch it —
   * `SMALL CAP WORLD` looks right to a human eye — and the whole-store
   * ticker diff did.
   *
   * So the arm asks an INDEPENDENT WITNESS and no vocabulary: a token the SEC
   * registers inside a fund's own name is a word, and may never be split. It
   * refuses `SMALLCAP`, and it independently refuses `CONTRAFUND`,
   * `EUROPACIFIC`, `LIFESTRATEGY`, `BLACKROCK`, `JPMORGAN`, `MASSMUTUAL` and
   * `ALLSPRING`, which the ratio was carrying alone. It FAILS CLOSED: without
   * the registry the arm does nothing, because a repair with no witness is a
   * guess. */
  let secWords = null;
  try {
    const sf = JSON.parse(readFileSync("sec-funds.json", "utf8"));
    secWords = new Set();
    for (const r of (sf.funds || []))
      for (const t of String(r[0] || "").split(/[^A-Za-z]+/)) if (t.length > 2) secWords.add(t.toLowerCase());
    console.log(`all-caps repair: ${secWords.size} registered name words available as the witness`);
  } catch (err) {
    console.log(`all-caps repair: SKIPPED, no registry witness (${err.message})`);
  }
  const capsRepair = (name) => {
    if (!secWords) return null;                        // fail closed, see above
    const s = String(name || "").trim();
    const joined = whole.get(nk(s)) || 0;
    let best = null, bestScore = -1;
    for (const m of s.matchAll(/\b[A-Z]{8,}\b/g)) {
      const t = m[0];
      if (secWords.has(t.toLowerCase())) continue;     // the SEC spells it joined: it is a word
      for (let k = 3; k <= t.length - 3; k++) {
        const L = t.slice(0, k), R = t.slice(k);
        if (cnt(L) < 3 || cnt(R) < 3) continue;        // PRE-FILTER only, see above
        const rep = s.slice(0, m.index) + L + " " + R + s.slice(m.index + t.length);
        const w = whole.get(nk(rep)) || 0;
        if (w <= joined * 3) continue;                 // repaired >> damaged
        if (w > bestScore) { best = rep; bestScore = w; }
      }
    }
    return best;
  };
  /* A SHARE CLASS ROTATED TO THE FRONT OF THE NAME — 2026-10-01 (08:1xZ).
   *
   * The filer's name wraps and the halves are re-joined in the wrong order, so
   * the DESIGNATION leads and the fund follows: `Fund I Class T. Rowe Price
   * Retirement 2045`, `Institutional Premium Class Fidelity Freedom Index 2055
   * Fund`, `Admiral Shares Vanguard Total International Stock Index`. The same
   * rotation this record measured in the ISSUER column on 2026-09-30 (15:2xZ)
   * and refused there, because the only repair available was a STRIP and a
   * strip truncates the firm. Here the repair is the rotation itself, which is
   * why it ships: moving the lead back to the end destroys nothing.
   *
   * IT MUST ROTATE AND MUST NOT STRIP, and that is measured, not argued.
   * Dropping `Admiral Fund` from `Admiral Fund Vanguard Total Bond Market
   * Index` would withdraw VBTLX, a correct answer, because the class word is
   * the only thing distinguishing it from four sibling classes. A repair that
   * withdraws a correct answer is not a repair.
   *
   * THE WITNESS IS THE REGISTRY'S CLASS-NAME COLUMN — the same evidence v529
   * reads to REFUSE splitting `SMALLCAP` and v531 reads to JOIN `Small Cap`,
   * in a third direction: a lead the SEC registers as a class name is a
   * designation, and a designation belongs at the end. It is load-bearing and
   * the whole-store control prices it at 835 further rows, which are
   * overwhelmingly CORRECT NAMES the ratio alone would have destroyed —
   * `Cash, non-interest bearing` -> `non-interest bearing Cash,`, `Robeco
   * Boston Partners Mid Cap Value` -> `Mid Cap Value Robeco Boston Partners`,
   * and the `SACG`/`GM` legend-and-sponsor prefixes, which want a STRIP and
   * not a rotation. FAILS CLOSED: no registry, no repair.
   *
   * THE RATIO IS THE SECOND LOAD-BEARING CONDITION, v529's guard again: a
   * RATIO between two whole names rather than a floor on one, because repeated
   * damage feeds a floor. It costs about six correct repairs it cannot
   * distinguish from five wrong ones (`Fund Class I T. Rowe Price Retirement
   * 2055`, `Class K BlackRock LifePath Index Retirement` are refused beside
   * `Retirement Income Fund Vanguard Target` -> `Income Fund Vanguard Target
   * Retirement`, where neither spelling is right). Refusing a repair is the
   * safe direction.
   *
   * THE PUNCTUATION CONDITION IS DECORATIVE ON THIS STORE — 0 rows, measured —
   * and is labelled rather than presented as protection. It exists because the
   * registry's class-name column holds a FULL FUND NAME for some registrants
   * (`Core Bond Fund`, `Inflation Protected Fund`, `Growth Fund`), so the
   * witness alone would admit `Core Bond Fund - VALIC` -> `- VALIC Core Bond
   * Fund`. What actually refuses those today is `nk`'s exact normalisation,
   * which keeps the punctuation in the key so the rotated form is attested
   * nowhere; the check is kept so a later loosening of `nk` cannot quietly
   * re-open the shape. A floor of 3 is subsumed by the ratio for the same
   * reason it is in the arm above and is kept as a PRE-FILTER only.
   *
   * 672 rows / 179 plans / 288,327 participants / $2,267,257,067 across 474
   * distinct transformations. Outcome through every resolver the stored name
   * moves: display ticker +7 / -0 / 19 FLIPPED, stored SEC stk +57 / -0 / 0
   * changed, fee +0 / -0 / 5 changed, 0 asterisks. Every one of the 15 distinct
   * flips is the T. Rowe Price Retirement `-I Class` the filing states, read
   * out of the registry — the wrong-share-class defect this record has named
   * five times, corrected here because the filing hands us the answer. The 5
   * fee moves are two names reaching `fund-er.js`'s own SOURCED Admiral rate
   * (0.05 -> 0.07), whose pattern requires `admiral` AFTER the fund words; both
   * move UP, the direction that cannot be a flattering bias. */
  let secClasses = null;
  try {
    const sfc = JSON.parse(readFileSync("sec-funds.json", "utf8"));
    secClasses = new Set();
    for (const r of (sfc.funds || [])) { const c = ck(r[3]); if (c) secClasses.add(c); }
    console.log(`class-rotation repair: ${secClasses.size} registered class names available as the witness`);
  } catch (err) {
    console.log(`class-rotation repair: SKIPPED, no registry witness (${err.message})`);
  }
  const rotRepair = (name) => {
    if (!secClasses) return null;                      // fail closed, see above
    const s = String(name || "").trim();
    const toks = s.split(/\s+/);
    if (toks.length < 3) return null;
    const filed = whole.get(nk(s)) || 0;
    let best = null, bestN = -1;
    for (let k = 1; k <= 3 && k < toks.length - 1; k++) {
      const lead = toks.slice(0, k).join(" ");
      /* break, not continue: every longer lead opens with the same token */
      if (!/^[A-Za-z0-9]/.test(lead)) break;           // DECORATIVE, see above
      const ln = ck(lead);
      /* a wrapped line often carries the vehicle word along with the class */
      if (!secClasses.has(ln) && !secClasses.has(ln.replace(/^fund\s+/, ""))) continue;
      const rest = toks.slice(k).join(" ");
      if (!/^[A-Za-z0-9]/.test(rest)) continue;        // DECORATIVE, see above
      const cand = `${rest} ${lead}`;
      const n = whole.get(nk(cand)) || 0;
      if (n < 3) continue;                             // PRE-FILTER only, see above
      if (n < filed * 3) continue;                     // rotated >> as filed
      if (n > bestN) { best = cand; bestN = n; }
    }
    return best;
  };
  /* A NAME THAT CONTAINS ITSELF AT BOTH ENDS — `X … X` — 2026-10-10 (03:4xZ).
   *
   * `Admiral Shares Vanguard Windsor II Admiral Shares`, `LENDING (TIER J) NT
   * COLLECTIVE S&P500 INDEX FUND-DC-NON LENDING (TIER J)`, `American Funds
   * 2030 Target Date Fund R6 American Funds`. A wrapped line is re-joined with
   * one end's run duplicated at the other, so the published name carries the
   * same token run twice with the fund in between.
   *
   * `collapseSelfRepeat` CANNOT REACH IT BY CONSTRUCTION, not by its floors.
   * That arm needs the repeat to run FORWARD from the remainder's start
   * (`X X rest`) — which is what keeps two VINTAGES of one series intact — so
   * for `Trust TD2 Capital Group 2030 … Trust TD2` it asks whether the
   * remainder starts with `trusttd2` and it starts with `capitalgroup`.
   * Lowering its 3-word / 10-character floors would still not reach this.
   *
   * THE DETECTOR IS SOUND FOR A REASON THE SIBLING ARMS DO NOT HAVE, and it
   * still says nothing about the REPAIR. Both copies sit inside ONE name, so
   * the evidence is not drawn from a sibling the same column shift could have
   * produced — the contamination that killed the same-menu witness on
   * 2026-10-03. But `X mid X` holds THREE orientations: the LEAD is stray
   * (ITW), the TAIL is stray (`… Fund R6 American Funds`, where stripping the
   * lead removes the HOUSE), or it is a ROTATION whose head appears at both
   * ends and NEITHER strip is a name. *A witness that a row is damaged is not
   * a witness to which side the damage is on* — fifth instance, and the first
   * where the witness is internal to the name.
   *
   * THE PRESCRIBED ORACLE IS REFUTED AND THE REASON IS STRUCTURAL. The record
   * prescribes, for this class and for the mid-name-house parent: build both
   * candidates and let the shipped resolver say which is the fund. Piloted on
   * the 276 display-name rows, where every member had been read: 0 wrong but 5
   * abstentions of 6 pinned cases, and of the 12 rows it acts on 5 are WRONG
   * and ALL 5 ARE ROTATIONS. ***A token-set matcher is ORDER-BLIND, and `X mid
   * X` strips to `mid X` or `X mid` — the same multiset minus one copy of
   * `X`*** — so the resolver answers identically on both sides (ITW reads
   * `NOSIX*` twice) or on neither. `Shares Vanguard Value Index Fund Admiral`
   * carries every correct token in the wrong order and resolves perfectly: *a
   * resolver answer is not evidence the string is a NAME at all.* The oracle
   * may still work for the parent, where the two candidates are genuinely
   * different token sets.
   *
   * SO THE WITNESS IS ORDER-SENSITIVE AND EXACT: does the surviving candidate
   * stand alone as some other plan's WHOLE filed name? No plan files the
   * rotated spelling as its whole name, which is exactly what the resolver
   * cannot see. `Vanguard Windsor II Admiral Shares` stands alone 27 times,
   * `New York Life Guaranteed Interest Account` 47, `Fidelity U.S. Bond Index
   * Fund` 1,906. That is `whole`, the same map the three arms above read, and
   * only the merge holds it.
   *
   * THE FLOOR IS THE WHOLE PROTECTION AND IT IS PRICED AT 61 ROWS — a floor of
   * one lets a single damaged row license the same damage elsewhere, measured
   * on the pilot where `Class K Fidelity U.S. Bond Index Fund` won on ONE
   * attestation that was itself another damaged copy. What the floor refuses
   * here is mostly a DIFFERENT family: `Money market fund - Fidelity
   * Government Money Market Fund` is a welded TYPE CAPTION, whose lead strip
   * leaves a dangling separator and whose remainder is attested once. Refusing
   * a repair is the safe direction and that family wants its own arm.
   *
   * THE RATIO REFUSES 0 ROWS ON THIS STORE and is labelled rather than
   * presented as protection — the same honesty the class-rotation arm's
   * punctuation condition is given. It cannot bite because every row the floor
   * admits has the opposite side attested 0 or 1 times; it is kept because the
   * pilot found a row where two damaged copies attested a rotation, which is
   * the shape it exists for, and because a later lowering of the floor would
   * re-open it. Priced both ways: floor alone 93 rows, ratio alone 154, both
   * 93, detector alone 154.
   *
   * 93 rows / 79 plans / 131,723 participants, every one published AND served,
   * and ALL 93 WERE READ — 0 rotations in the acted set, because the surviving
   * side is attested as a whole filed name by construction. `Admiral Shares
   * Vanguard Windsor II Admiral Shares` -> `Vanguard Windsor II Admiral
   * Shares` KEEPS ITS NUMERAL, which is the hazard that cost a wrong fund name
   * once and is this arm's first fixture. */
  const WRAP_FLOOR = 3, WRAP_RATIO = 10;
  const wrapRepair = (name) => {
    const w = String(name || "").trim().split(/\s+/).filter(Boolean);
    /* longest run first: a shorter run is a prefix of the same duplication and
     * would leave part of the stray copy behind */
    for (let k = Math.floor((w.length - 3) / 2); k >= 2; k--) {
      const lead = w.slice(0, k).join(" "), tail = w.slice(w.length - k).join(" ");
      const a = ck(lead).replace(/ /g, "");
      if (a.length < 5) continue;                      // two tiny tokens are not a run
      if (a !== ck(tail).replace(/ /g, "")) continue;   // the duplication itself
      /* "substantial text between the copies" needs NO condition: the loop
       * bound `k <= floor((n-3)/2)` already forces `n - 2k >= 3`, with
       * equality at the largest k. A first draft carried the test anyway and
       * `wrap-repair-test` could not build a case where it was the only
       * protection — because production cannot reach one. A condition
       * unreachable by construction is worse than an inert one: it reads as a
       * guard and is dead code, so the invariant is asserted in the test
       * across name lengths instead of restated here. */
      const stripLead = w.slice(k).join(" "), stripTail = w.slice(0, w.length - k).join(" ");
      const aL = whole.get(nk(stripLead)) || 0, aT = whole.get(nk(stripTail)) || 0;
      if (aL >= WRAP_FLOOR && aL >= aT * WRAP_RATIO) return stripLead;
      if (aT >= WRAP_FLOOR && aT >= aL * WRAP_RATIO) return stripTail;
      return null;                                      // ABSTAIN, do not try a shorter run
    }
    return null;
  };
  /* A BROKEN FONT SHIFTED A RUN OF THE NAME BY +29 — 2026-10-01 (15:4xZ).
   *
   * The PDF's cmap is offset, so every character of a run arrives 29 code
   * points low: `$GPLUDO` is `Admiral`, `1XYHHQ` is `Nuveen`, `7RWDO QXPEHU`
   * is `Total number`. The browser renders the ciphered SPACE (0x03) as
   * nothing, which is the class shipped at 14:0xZ; this is the other half of
   * the same font, where the LETTERS moved too.
   *
   * THE QUEUED MECHANISM IS REFUTED BY THE POPULATION. It read: a token
   * PRECEDED by a control character is in the same ciphered run, because 0x03
   * IS the ciphered space. But 0x03 is ALSO how this font encodes an ORDINARY
   * space — that is precisely the 14:0xZ class — so Fairway Market's
   * `AEGON<03>US<03>High<03>Yi eld<03>Ret<03>Opt` has a control separator
   * before every token and is PLAIN TEXT throughout. Licensing a token off its
   * separator decodes it to `^bdlk rp e v  o l`.
   *
   * WHAT IS TRUE IS THE SAME OBSERVATION USED AS A FENCE RATHER THAN A
   * LICENCE, and it makes the run a CHARACTER SPAN instead of a token list.
   * Inside a ciphered run the space is 0x03; a PLAIN space is 0x20, and 0x20
   * is not a character the shift can produce, so it BOUNDS the run. Extending
   * a seed outward over [\x03-\x1f\x21-\x3d\x44-\x5d] and stopping at 0x20
   * keeps Antonini Freight Express's own `ANTONINI FREIGHT EXPRESS, INC.
   * 401(K) & PROFIT SHARING PLAN` whole while decoding the `(PSOR\HU
   * ,GHQWLILFDWLRQ` that follows it. Dropping the fence CHANGES 15 of the 23
   * rows and destroys that sponsor name into `=^kqlkfkf=cobfdeq=bumobppI=`.
   *
   * AND IT SOLVES THE HALF-DECODE THE QUEUE PREDICTED, FOR FREE. A token-level
   * rule decodes `&ODVV` to `Class` and leaves the `5`, publishing `Class 5`
   * where the filing says `Class R` — a wrong share class asserted. A span
   * decodes its SEPARATORS too, and 0x03 -> " " while 0x19 -> "6", so
   * Retriever Medical Dental Payment's `&ODVV<03>5<19>` comes out `Class R6`
   * and Edelman's `,,` comes out `II`. No floor is needed and no token is left
   * behind.
   *
   * FOUR CONDITIONS, each negative-controlled over the whole population and
   * each naming its own cases:
   *   - the PLAIN-SPACE FENCE (above): 15 rows changed, all damaged.
   *   - the MID-WORD TRIM: 0x30-0x3d is AMBIGUOUS, being both a literal digit
   *     and the ciphered form of an uppercase Q-Z, so it cannot fence a run —
   *     Retriever needs `5` -> `R`. But Lifespan files `Add lines 6d and 6e`,
   *     Form 5500 line references set in an UNSHIFTED font inside a ciphered
   *     caption, and the span swallowed the `6` and published `Sd`. A real run
   *     is never followed by an ALPHANUMERIC character, because inside the run
   *     the next letter would itself be ciphered; so where the span is cut
   *     mid-word its trailing ambiguous characters are the unshifted text's.
   *     Dropping it changes exactly those 2 rows.
   *   - the DECODE ATTESTED >= 3: this is what protects `AEGON`, not the fence.
   *     Dropping it admits 3 rows of garbage — `Vanguard Tot Wld Stk Index
   *     bqc` (an `ETF` decoded), `Abdlk Balanced`, `Abdlk rp eigh`.
   *   - a CIPHERED SPACE INSIDE THE RUN, which is the structural claim that
   *     this is a run at all rather than one coincidental token. COST NAMED:
   *     it refuses 2 CORRECT repairs, Absolute Dental Group's and American
   *     Financial Resources' `LQVWUXFWLRQV` -> `instructions`, a form caption
   *     naming no fund. Refusing a repair is the safe direction.
   *
   * THERE IS NO FILED-ATTESTATION TEST AND THE MEASUREMENT IS WHY. The draft
   * carried the issuer strip's two-sided witness — the token as filed attested
   * NOWHERE — and that test COSTS 6 ROWS reaching 118,240 participants
   * (Fiserv 39,782, Philips 29,491, Gallagher 29,477, Lifespan 19,490), because
   * the attestation maps are built from the STORED names and this font appears
   * in several filings: `FRPSOHWH`, `WKLV` and `LWHP` are each attested in
   * their CIPHERED form. Third instance of that trap on this record and the
   * FIRST in the refusal direction — a floor that reads repetition as evidence
   * of authenticity is fed by repeated damage, exactly as the OCR strip's
   * ceiling was. Replacing it with a RATIO was measured too and is DECORATIVE
   * at every factor up to 3 (0 rows against no test at all), so it is not
   * shipped: a condition that cannot fire is decoration.
   *
   * ALL-CAPS CIPHERED TEXT IS OUT OF REACH BY CONSTRUCTION and that is left as
   * under-reach: the seed is a ciphered LOWERCASE word (0x44-0x5d), so IBEW's
   * `,%(:<03>/2&$/` has no seed and stays as filed.
   *
   * OUTCOME through all four resolvers, since the name is STORED: display
   * ticker +1 / -0 / 0 flipped (Edelman gains VWNAX), display fee +1 / -0 / 0
   * changed, SEC `stk` +2 / -0 / 0 (VWNAX, TISCX), `ftk` +0 / -0 / 0, 0
   * asterisks moved.
   *
   * TWO COSTS IN THAT OUTCOME, both named rather than rounded away. (1) The
   * queue entry predicted this would CORRECT Edelman's fee, which publishes
   * 0.3 where `Vanguard Windsor II Admiral` is 0.26 — it does not. The table
   * has ONE Windsor entry (`fund-er.js:203`), so the fee was wrong
   * independently of legibility and the row now carries a correct symbol
   * beside the same wrong number. The cipher hid the share class; it was not
   * why the fee was wrong. (2) `Nuveen Small Cap Blend Index Fund Class R`
   * gains the GENERIC unattributed index estimate 0.1 on a name that states a
   * house — a live instance of the queued fee pre-emption, fed by one row and
   * not caused here, in the understating direction.
   *
   * 23 rows / 13 plans / 127,006 participants / $87,902,604, 18 distinct
   * transformations, all read. STORED and PUBLISHED are the same set (the arm
   * joins the three above in gating on `e.confident`) and 0 rows sit in a
   * trust. It must run HERE and never at display: `cleanFiledName` replaces
   * every control character with a space, so the ciphered digits (0x13-0x1c)
   * are gone before a display arm could decode them. */
  const CIPH_CH = /[\x03-\x1f\x21-\x3d\x44-\x5d]/;
  const CIPH_AMBIG = /[\x21-\x3d]/;
  const CIPH_WORD = /[\x21-\x3d]?[\x44-\x5d]{2,}/g;
  const unshift = (s) => s.replace(/[\s\S]/g, (c) => {
    const o = c.charCodeAt(0);
    return o >= 0x03 && o <= 0x5d ? String.fromCharCode(o + 29) : c;
  });
  const cipherRepair = (name) => {
    const s = String(name || "");
    if (!/[\u0000-\u001f\u007f]/.test(s)) return null;   // a run carries its own space
    let out = "", i = 0, moved = 0;
    while (i < s.length) {
      if (!CIPH_CH.test(s[i])) { out += s[i++]; continue; }
      let j = i; while (j < s.length && CIPH_CH.test(s[j])) j++;
      let k = j;
      if (k < s.length && /[A-Za-z0-9]/.test(s[k]))      // cut MID-WORD, see above
        while (k > i && CIPH_AMBIG.test(s[k - 1])) k--;
      const run = s.slice(i, k);
      let seeded = 0;
      if (/[\u0000-\u001f\u007f]/.test(run)) {
        CIPH_WORD.lastIndex = 0; let m;
        while ((m = CIPH_WORD.exec(run))) {
          const d = unshift(m[0]);
          if (/^[A-Za-z]{3,}$/.test(d) && cnt(d) >= 3) seeded++;
        }
      }
      out += seeded ? unshift(run) + s.slice(k, j) : s.slice(i, j);
      if (seeded) moved++;
      i = j;
    }
    if (!moved) return null;
    const a = out.replace(/\s{2,}/g, " ").trim(), b = s.replace(/\s{2,}/g, " ").trim();
    if (!a || a === b) return null;
    /* A REPAIR THAT MAKES A JUNK ROW LEGIBLE HANDS THE WHOLE PLAN TO A GUARD
     * WRITTEN FOR LEGIBLE JUNK — measured by #536, which withdrew FIVE real
     * menus reaching 61,261 participants.
     *
     * `JUNK_NAME_RE`'s demotion sixty lines above is ENTRY-level: one row whose
     * name carries form vocabulary withdraws the whole lineup. Most of this
     * class is v193's Form 5500 COVER-PAGE family in cipher, and decoding
     * `7RWDO QXPEHU RI DFWLYH SDUWLFLSDQWV` or `(PSOR\HU ,GHQWLILFDWLRQ`
     * produces exactly the vocabulary that guard reads — so Fiserv's 37-row
     * Vanguard menu (39,782 ppl) was convicted by three caption rows among it,
     * along with Lifespan (19,490), Plastic Ingenuity, McElroy and Antonini.
     *
     * The demotion is not wrong; it is aimed elsewhere. Its own comment says it
     * exists for a STORED entry whose PDF became undownloadable, where the
     * parser-side guards can never reach the junk. These five are fresh parses
     * at the current pv with no error code, and the correct response to three
     * caption rows in a thirty-seven-row menu is to drop or type those ROWS,
     * not to withdraw the menu. *A guard's live population is not always the
     * population it was written for.*
     *
     * So the repair declines where it would create the conviction, and the cost
     * is named rather than hidden: those caption rows stay ciphered, exactly as
     * they were before this arm existed, and no reader loses anything they had.
     * The entry it was WRITTEN for — a real fund name — is untouched. What this
     * costs is the "composition win" the first write-up claimed for making the
     * captions legible; that was a composition LOSS. */
    if (JUNK_NAME_RE.test(a) && !JUNK_NAME_RE.test(b)) return null;
    return a;
  };
  /* AN OCR'd `!` WHERE A LETTER BELONGS — 2026-10-02.
   *
   * A scanned filing's lowercase `l` is a bare vertical stroke and OCR reads it
   * as `!`, so `Fidelity Freedom Index 2040 Inst! Prem` is `Instl`, `Vngrd Tt!
   * Intl Bd Idx Adml` is `Ttl`, `Mutua! Fund` is `Mutual`, `accoun!` is
   * `account`, `Mk!` is `Mkt`, `!shares` is `iShares` and `Metrop!tn` is
   * `Metropltn`. This project already repairs the SAME GLYPH CLASS one
   * character along — a trailing column bar is the share-class `I`
   * (app.js:686, 743 plans / 683k ppl) — and `!` is the other reading of the
   * same stroke.
   *
   * THE GLYPH STANDS FOR A DIFFERENT LETTER IN DIFFERENT ROWS, so a character
   * substitution cannot work and this record already measured a naive `!`->`I`
   * rewrite WRONG on 4 of the 7 rows it was then sized at (`Metrop!tn`,
   * `Smal!Cap` want `l`). Across the 59 token edits a 26-letter candidate set
   * reaches, the glyph stands for `l` on 345 rows, `I`
   * on 28, `t` on 11, `i` on 9, and `T`/`X`/`L` once each. So the LETTER is chosen
   * by a WITNESS and never by a rule: the repaired token must be a word the
   * store itself publishes.
   *
   * THE SIZE WAS 7 ROWS AND IT IS 576, BECAUSE THE RECORDED FIGURE COUNTED ONE
   * SPELLING. Re-sized whole-store on the pv-196 store: 576 published rows
   * carry a `!`, 511 distinct names, 516,218 participants; 463 of them publish
   * no ticker at all. *A class sized from a remembered example is sized from
   * the example.*
   *
   * WHOLE EFFECT THROUGH THE REAL MERGE, attributed field by field against the
   * pv-196 store: `name` on 393 rows across 280 entries and `stk` +28 / -0 / 0
   * changed, AND NOTHING ELSE — 1,730,535 rows both sides, 0 acks added or
   * removed, 0 row-count changes, `ftk` on 0. A READER gains 46 tickers / -1 /
   * 3 corrected, 31 fees / -1 / 25 corrected, 9 asterisks and 2 typings across
   * 280 plans / 365,305 participants / $1,373,992,265, plus 8 crawlable pages /
   * 121,203 participants. Every one of the 30 changed cells was read.
   *
   * MY HARNESS SAID 394 ROWS AND +34 STORED `stk`; BOTH DELTAS ARE ACCOUNTED
   * FOR AND NEITHER IS THE ARM. The extra row sits in a NON-CONFIDENT entry
   * (`DFA Int! SmCap Vat`), which this loop skips; and 6 of the 34 are refused
   * by `secTypeAdmits` — the merge-4i:501 trap, where an outcome test asks
   * `resolveHolding` without the gate the storage line applies. Counting the
   * DISPLAY ticker the same way is 9 rows too high, and all 9 carry a filed
   * type that contradicts a registered mutual fund (7 `Pooled separate
   * account`, 2 ETF). *Measure through the function the caller calls.*
   *
   * FOUR CONDITIONS, each negative-controlled by name, and the two that decide
   * the population are RATIOS rather than floors:
   *
   * (1) THE FLOOR. The repaired token must be published at least 3 times. A
   *     floor of ONE lets a single damaged row license the same damage
   *     elsewhere, which this record has paid for twice.
   *
   * (2) THE LETTER RATIO. Where more than one letter yields a published token
   *     the best must beat the runner-up TENFOLD, or nothing is known. This is
   *     what refuses `Blackrock Gib! Allocation` (the filing means `Glbl`; no
   *     candidate dominates) and `CRLN E MID CAP GR!`.
   *
   * (3) THE MARKER REFUSAL, and a FLOOR CANNOT REPLACE IT. A trailing `!`
   *     after a COMPLETE word is a marker and not a letter, and appending one
   *     FABRICATES a word: `Growth!` -> `GrowthR` (published 6 times, against
   *     `growth`'s 143,800), `Company!` -> `CompanyT`, `Plus!` -> `Plusb`,
   *     `T. Rowe Price Retirement 2015 Fund!` -> `... Funds`. No floor
   *     separates those from the correct repairs, because `Metropltn` is
   *     published 4 times and `GrowthR` 6. What separates them is the BARE
   *     token: refuse when deleting the glyph is far better attested than any
   *     letter.
   *     IT IS A REFUSAL AND NOT A 27th CANDIDATE, measured: made to compete on
   *     equal terms, `inst` (25,207) and `instl` (22,687) sit within 1.11x, so
   *     both lose condition (2) and the 183-row bulk dies — and `!shares`
   *     loses to the bare `shares`. Its ratio is FIVE, bounded by reading both
   *     sides: at TEN the eleven fabrications above survive; at THREE all
   *     eight `!shares` -> `ishares` repairs die. Cost named, one row: `Eaton
   *     Vance-At! Cp SMIDCp F R6` keeps its glyph.
   *
   * (4) THE TOKEN MUST HOLD A LETTER AND BE AT LEAST THREE CHARACTERS.
   *     DECORATIVE ON THIS STORE — dropping either changes 0 of the 393 rows —
   *     and CONTROLLED ON A CRAFTED CASE INSTEAD, because a condition that
   *     cannot fail is decoration:
   *     kept because each refuses a shape the witness alone would admit, shown
   *     on a crafted case rather than claimed: without the length floor
   *     `Vanguard O! America Fund` becomes `Vanguard OF America Fund`, because
   *     the English word `of` is published often enough to clear any ratio.
   *
   * THE REGISTRY BONUS WAS BUILT, MEASURED AND REMOVED. `capsRepair`'s
   * `secWords` witness admits a candidate the store barely publishes, and here
   * it changed 0 of the 393 rows while being the only thing that let `Mutual!` ->
   * `Mutuals` through (published twice). A witness with no measured benefit and
   * a measured risk is not carried.
   *
   * ONLY THE GLYPH MOVES. Every other character stays exactly as filed, so the
   * filer's own case survives (`accoun!` -> `account`, not `Account`); the
   * replacement takes the surrounding case when the token's other letters are
   * all capitals (`SM!` -> `SML`) and otherwise the case the store's most
   * published spelling carries at that position (`!ndex` -> `Index`, `!shares`
   * -> `ishares`). Residue named: `Ci!` -> `CiT` and `Mut!` -> `MutL` get the
   * right letter in odd case, 2 rows.
   *
   * ALL-OR-NOTHING PER NAME. If any glyph in a name cannot be witnessed the
   * name is left entirely alone, because a PARTIAL repair is worse than none —
   * it publishes a name that is half ours.
   *
   * A REPAIR THAT MAKES A JUNK ROW LEGIBLE IS REFUSED, the guard `cipherRepair`
   * carries sixty lines above and for its reason: #536 withdrew five real menus
   * reaching 61,261 participants that way. DECORATIVE on this store — 0 of 393 rows
   * create a `JUNK_NAME_RE` match — and carried because the cost of being
   * wrong is a whole plan's menu. Two rows DO newly match
   * `GENERIC_TYPE_NAME` (`Registered investmen! company` -> `... Investment
   * ...`) at 0.5% and 4.3% of their menus, far under the dominance guard's 90%
   * floor, and that is the arm working: the row now admits it names no fund.
   *
   * MERGE-SIDE BY NECESSITY. The witness is the whole store's published names,
   * which neither the browser nor `build-seo-pages` can hold — the same reason
   * the three arms above it live here. And a merge repair runs AFTER region
   * selection, so unlike a vocabulary change in `lib-4i` it cannot move which
   * region wins: the v196 hazard is closed by construction. */
  const BANG_TOK = /[A-Za-z]*![A-Za-z!]*/g;
  const BANG_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
  const BANG_FLOOR = 3, BANG_RATIO = 10, BANG_MARKER = 5, BANG_MINLEN = 3;
  const bangRepair = (name) => {
    const s = String(name || "");
    if (!s.includes("!")) return null;
    let out = "", last = 0, changed = 0;
    BANG_TOK.lastIndex = 0; let m;
    while ((m = BANG_TOK.exec(s))) {
      const t = m[0];
      if (!/!/.test(t)) continue;
      if (!/[A-Za-z]/.test(t)) return null;            // (4) a lone glyph
      if (t.length < BANG_MINLEN) return null;         // (4) see `O!` above
      const scored = BANG_LETTERS.map((L) => t.replace(/!/g, L))
        .map((c) => ({ c, n: cnt(c) }))
        .filter((x) => x.n >= BANG_FLOOR)              // (1)
        .sort((a, b) => b.n - a.n);
      if (!scored.length) return null;
      if (scored.length > 1 && scored[0].n < BANG_RATIO * scored[1].n) return null;  // (2)
      const bare = t.replace(/!/g, "");
      if (bare.length > 1 && cnt(bare) >= BANG_MARKER * scored[0].n) return null;    // (3)
      const allCaps = /[A-Z]/.test(bare) && !/[a-z]/.test(bare);
      const sp = bangCase(scored[0].c) || scored[0].c;
      let rep = "";
      for (let k = 0; k < t.length; k++) {
        if (t[k] !== "!") { rep += t[k]; continue; }
        rep += allCaps ? scored[0].c[k].toUpperCase() : (sp[k] || scored[0].c[k]);
      }
      out += s.slice(last, m.index) + rep;
      last = m.index + t.length; changed++;
    }
    out += s.slice(last);
    if (!changed) return null;
    const a = out.replace(/\s{2,}/g, " ").trim(), b = s.replace(/\s{2,}/g, " ").trim();
    if (!a || a === b) return null;
    if (JUNK_NAME_RE.test(a) && !JUNK_NAME_RE.test(b)) return null;   // #536
    return a;
  };
  /* A HOLDING NAME CARRYING ITS OWN VALUE, NEGATED. ABM Industries (88,660
   * ppl) publishes `MONEY MARKET -415,027` on a row whose value IS 415,027 --
   * the 4i layout put a negative figure in the description column and the
   * extractor welded it to the name.
   *
   * ITS EVIDENCE IS THE ROW ITSELF, which is why this needs no attestation map
   * and no registry: the trailing number must EQUAL the row's own value. Every
   * other repair in this file argues from how often a spelling appears
   * elsewhere; this one is self-verifying, and that makes it the strongest
   * condition available.
   *
   * A VOCABULARY WOULD HAVE MEASURED THE VOCABULARY. A screen for "a name
   * ending in a negative or parenthesised number" reads 1,229 rows; the
   * equality test keeps 34. The 1,195 refused are real names -- contract
   * numbers (`Citibank N.A. Contract #TR24-100`), CMO tranches with maturity
   * dates (`...FLTG RT07-15-2042`), insurer contract captions -- and a repair
   * that stripped those would damage legible rows to fix illegible ones.
   *
   * ONLY THE MINUS FORM, BECAUSE ONLY IT HAS A LIVE CASE: all 34 are
   * `name -digits` and 0 are parenthesised, so a parenthesised arm would ship
   * untested. A floor of zero is not a floor.
   *
   * MEASURED DISJOINT from every arm below rather than assumed: of the 34
   * heads, 0 contain a camelCase seam and 0 contain an eight-capital run, so
   * neither `weldRepair` nor `capsRepair` can claim one. It is therefore asked
   * FIRST and OUTSIDE the `continue` chain -- like the issuer arm, and for the
   * same reason: stripping the bogus figure can only make a name MORE
   * repairable, never less, so a later arm must still get its turn.
   *
   * PRICED ON EVERY PUBLISHED CELL, not just the name: across all 34 rows the
   * ticker, fee, asterisk, shown type, all fourteen suppressor flags, and both
   * the generic-name and not-fund-shaped guards are UNCHANGED. The 12
   * `CERT OF DEPOSIT / BANK DEPOSIT` rows already have `bankDepositFee`
   * withholding their fee and still do; the 22 `MONEY MARKET` rows keep their
   * 0.2 pattern estimate. *A legibility fix must be priced against the guards
   * that READ names* -- making three caption rows legible once handed five
   * whole menus to a junk demotion. Here it moves nothing but the name.
   *
   * It runs after confidence and region selection, so it cannot affect which
   * region won or whether a plan is published. */
  const valueRepair = (f) => {
    const n = String(f.name || "");
    const m = /^(.*[A-Za-z)])\s*[-−]\s*([\d,]{3,})$/.exec(n);
    if (!m) return null;
    const num = Number(m[2].replace(/,/g, ""));
    const v = Math.abs(Number(f.value) || 0);
    if (!(num > 0 && Math.abs(num - v) <= 1)) return null;   // the self-evidence
    const head = m[1].trim();
    /* a repair that leaves no readable name behind is not a repair */
    if (!/[A-Za-z]{3}/.test(head)) return null;
    return head;
  };
  /* THE SAME EVIDENCE, WITH THE NUMBER IN THE MIDDLE — a welded SHARE COUNT.
   * Sibling of `valueRepair` above: W.R. Grace (4,138 ppl) publishes
   * `Invesco Stable Value Trust, 91,398,409 shares` on a row whose value IS
   * $91,398,409. 18 rows / 16 plans / 11,668 participants / $110,295,497.
   *
   * The count must be FOLLOWED by `shares` or `units`, so a bare trailing
   * number is left to `valueRepair` and a mid-name contract number is never
   * touched. It must EQUAL the row's own value, which is the same
   * self-evidence `valueRepair` uses and the only reason this is safe: the
   * cheap screen — any number followed by shares/units — reads **1,606** rows
   * and the equality test keeps 18. The class is almost all CASH because a
   * share count equals the dollar value only at a $1.00 NAV.
   *
   * NO THOUSANDS ARM. Allowing "the value in thousands" read 117 rows, and
   * most were arithmetic coincidences: a vintage year x 1,000 lands between
   * $2.0M and $2.07M, so `T. ROWE PRICE RET 2005 ACT B` at $2,005,350 matched.
   * *A tolerance wide enough to catch an imagined shape is wide enough to
   * manufacture one*, and that one was aimed at the commonest family in the
   * store.
   *
   * THE IDENTITY GUARD IS NOT CAUTION — WITHOUT IT THIS ARM MAKES THREE ROWS
   * WORSE. L Brands (30,989 ppl) files `Mutual Fund - 85,408,028 - shares` at
   * $85,408,028. Today `cleanFiledName` strips the caption and the page shows
   * `85,408,028 - shares`, which `hasNoFundIdentity` already qualifies as "the
   * filing names no specific fund". Strip the count instead and the name
   * becomes `Mutual Fund` — a caption published as though it were a fund, with
   * the qualifier gone, on $85.4M. `hasNoFundIdentity` cannot see it (its
   * filler list has `fund` but not `mutual`); `isGenericTypeName` answers TRUE
   * on it and FALSE on all seven heads that must be kept, which is why the
   * guard is the display's own composition of the two.
   * ***A REPAIR THAT LEAVES A NAME WITH NO FUND IN IT IS NOT A REPAIR.***
   *
   * PRICED ON EVERY PUBLISHED CELL through the tracked harness, across all 18
   * rows: ticker 0, fee 0, asterisk 0, shown type 0, every suppressor flag 0,
   * and **0 rows gain a fee they did not have** — the hazard that mattered,
   * since trading a bogus ticker for a fabricated expense ratio is not a win.
   * Only the name moves.
   *
   * RESIDUE, named rather than swept in: H. Eikenhout files
   * `26,911 shares Key Guaranteed Portfolio Fund 1,400,750 shares` and the head
   * keeps a SECOND count at the front, which this arm does not reach; three
   * heads retain a leading enumerator (`11 Charles Schwab ...`). Both are
   * improvements on what ships today and neither is made worse. */
  const shareRepair = (f) => {
    const m = /^(.*?[A-Za-z)])\s*[-\u2013\u2014\u2212,;:]?\s*([\d,]{3,}(?:\.\d+)?)\s*(?:[-\u2013\u2014\u2212]\s*)?(?:shares?|units?)\b/i
      .exec(String(f.name || ""));
    if (!m) return null;
    const num = Number(m[2].replace(/,/g, ""));
    const v = Math.abs(Number(f.value) || 0);
    if (!(num > 0 && Math.abs(num - v) <= 1)) return null;     // the self-evidence
    const head = m[1].trim().replace(/[-\u2013\u2014\u2212,;:]+$/, "").trim();
    if (!/[A-Za-z]{3}/.test(head)) return null;                // leave something readable
    if (isGenericTypeName(head) || hasNoFundIdentity(head)) return null;   // and it must name a fund
    return head;
  };
  let weld = 0, caps = 0, rot = 0, ciph = 0, bang = 0, iweld = 0, vrep = 0, srep = 0, wrap = 0;
  const weldAcks = new Set(), capsAcks = new Set(), rotAcks = new Set(), ciphAcks = new Set(), bangAcks = new Set();
  const wrapAcks = new Set();
  const iweldAcks = new Set(), vrepAcks = new Set(), srepAcks = new Set();
  for (let i = 0; i < SHARDS; i++)
    for (const [ack, e] of Object.entries(buckets[i])) {
      if (!e || !e.confident || !Array.isArray(e.funds)) continue;
      for (const f of e.funds) {
        /* THE ISSUER COLUMN, asked FIRST and OUTSIDE the chain below — 2026-10-02
         * (12:3xZ). The chain is five arms on the NAME joined by `continue`, and
         * a different COLUMN must not be skipped because a name arm fired: both
         * cells of one row can be damaged and both must be repaired. Asked first
         * so that is true by construction rather than by reading five
         * `continue`s. The two are independent — `weldRepair(f.name)` reads only
         * `f.name` and this reads only `f.iss` — and the maps are snapshots taken
         * before the loop, so neither can see the other's edits. */
        const irep = weldRepair(f.iss, ISS_EV);
        if (irep) { f.iss = irep; iweld++; iweldAcks.add(ack); }
        /* the row's own value welded into its name — asked here, outside the
         * chain, because its evidence is `f.value` and not the name maps, and
         * because the strip can only make the remaining name more repairable */
        const vr = valueRepair(f);
        if (vr) { f.name = vr; vrep++; vrepAcks.add(ack); }
        /* the welded SHARE COUNT, asked beside its sibling and outside the
         * chain for the same reason: its evidence is `f.value`, and stripping
         * the count can only make the remaining name more repairable. Asked
         * AFTER valueRepair so a row carrying both shapes loses the trailing
         * figure first; the two regexes are disjoint, since this one requires a
         * unit word after the number and that one requires end-of-string. */
        const sr = shareRepair(f);
        if (sr) { f.name = sr; srep++; srepAcks.add(ack); }
        const rep = weldRepair(f.name);
        if (rep) { f.name = rep; weld++; weldAcks.add(ack); continue; }
        /* disjoint from the arm above by construction — an all-caps token has
         * no case transition for SEAM to find — so the order cannot matter, and
         * `continue` says so rather than relying on it */
        const crep = capsRepair(f.name);
        if (crep) { f.name = crep; caps++; capsAcks.add(ack); continue; }
        /* the rotation is a whole-name REORDER where the two above are
         * per-token repairs, so it is asked last and only of a name neither
         * touched; the attestation maps are built from the stored names, so a
         * name repaired this run is attested in its damaged form either way */
        const rrep = rotRepair(f.name);
        if (rrep) { f.name = rrep; rot++; rotAcks.add(ack); continue; }
        /* the self-wrapping duplication, asked after the rotation because both
         * are whole-name operations and this one is the narrower claim: the
         * rotation MOVES a designation the registry names, where this one
         * REMOVES a run the name already carries twice. Measured as disjoint
         * from all three arms above rather than assumed — of the 93 rows this
         * repairs, 0 are claimed by any of them. */
        const wrep = wrapRepair(f.name);
        if (wrep) { f.name = wrep; wrap++; wrapAcks.add(ack); continue; }
        /* asked LAST and only of a name no arm above touched. The three above
         * all require the damaged form to be attested or unattested as ASCII
         * words; a ciphered run contains a control character, which `whole`
         * and `tok` key on as a word boundary, so none of them can have fired
         * on one. The `continue` states that rather than relying on it. */
        const xrep = cipherRepair(f.name);
        if (xrep) { f.name = xrep; ciph++; ciphAcks.add(ack); continue; }
        /* asked LAST and only of a name no arm above touched. Measured as
         * disjoint rather than assumed: of the 393 rows this arm repairs, 0
         * are claimed by any arm above it, because `!` is a non-letter and the
         * maps key on it as a word boundary — a camel SEAM cannot straddle it,
         * an all-caps run of eight cannot contain it, and a rotation needs a
         * class designation this population does not carry. The `continue`
         * chain states the order rather than relying on it. */
        const brep = bangRepair(f.name);
        if (brep) { f.name = brep; bang++; bangAcks.add(ack); }
      }
    }
  if (vrep) console.log(`welded-value repair: ${vrep} rows across ${vrepAcks.size} plans`);
  if (srep) console.log(`welded-share-count repair: ${srep} rows across ${srepAcks.size} plans`);
  if (iweld) console.log(`issuer lost-space repair: ${iweld} rows across ${iweldAcks.size} plans`);
  if (weld) console.log(`lost-space repair: ${weld} rows across ${weldAcks.size} plans`);
  if (caps) console.log(`all-caps lost-space repair: ${caps} rows across ${capsAcks.size} plans`);
  if (rot) console.log(`class-rotation repair: ${rot} rows across ${rotAcks.size} plans`);
  if (wrap) console.log(`self-wrapping-duplication repair: ${wrap} rows across ${wrapAcks.size} plans`);
  if (ciph) console.log(`cipher-run repair: ${ciph} rows across ${ciphAcks.size} plans`);
  if (bang) console.log(`ocr-bang repair: ${bang} rows across ${bangAcks.size} plans`);
}

/* THE SEC TICKER, RESOLVED ONCE AT MERGE AND STORED ON THE ROW.
 *
 * `fund-er.js` is a hand-written pattern table and cannot finish the tail:
 * measured 2026-09-28, 663,283 rows the FILING ITSELF types a registered
 * mutual fund carry no ticker at all. The SEC's own series/class file names
 * them, and `sec-funds.json` sits in the tree with its source URL and
 * generation date because a ticker here is SOURCED, never derived.
 *
 * WHY HERE AND NOT IN THE BROWSER. The resolver is an ES module with a 29,406
 * row index behind it; shipping either to the page would put megabytes on the
 * boot path the 2026-08-09 split exists to protect. The lineup shards are
 * already fetched per-plan on demand, so a field on the row costs a reader
 * nothing extra.
 *
 * ONLY THE EXACT ANSWER IS STORED. `resolveHolding` also returns a COMPARABLE
 * — a representative share class behind an asterisk — and that is a different
 * claim: `fund-er.js` prices a ticker, and this record carries 10,387 fee
 * cells withdrawn on 2026-09-28 for pricing one share class as another. The
 * comparable half is queued, not shipped.
 *
 * It cannot introduce a FEE: `fundER` is called on the NAME and never on the
 * ticker (app.js:1906/1919), so a row that gains `stk` still renders a blank
 * expense ratio unless the name itself resolves. Verified before writing this.
 *
 * A BLANK TYPE CELL IS NOT A CONTRADICTION, and requiring the filing's word
 * held this index to a stricter standard than the hand table beside it.
 * `fundTickerInfo(name, type)` reads the type to DEMOTE a collective trust or
 * a separate account to a labelled comparable — never to require corroboration
 * — so `fund-er.js` has always asserted a ticker from the name alone wherever
 * the cell is empty. Asking the SEC index for the filing's own word as well
 * meant two resolvers applying opposite standards to the same missing fact.
 *
 * So the gate keeps refusing every type that CONTRADICTS (pooled separate
 * account, collective trust, separate account, stable value, company stock,
 * ETF, the debt and cash categories) and admits the blank cell, which states
 * nothing. Only the EXACT answer is stored either way.
 *
 * The widening needs no vehicle screen and that is the index's own doing, not
 * a guard: the SEC registers no collective trust, so a name that states one
 * cannot resolve exactly. Measured over the whole admitted population, a
 * vehicle-word screen refuses 0 rows — `Vanguard Institutional Target
 * Retirement 2030 Trust II` is null and `Vanguard Target Retirement 2030 Trust
 * Select` is a COMPARABLE, which this block already declines to store.
 */
try {
  const { buildIndex, resolveHolding, resolveFiledTicker, resolveTrailingFiledTicker } =
    await import("./match-sec-tickers.mjs");
  const idx = buildIndex("sec-funds.json");
  /* The filing's TYPE cell admits an SEC answer when it says mutual fund or
   * says nothing. Anything else names a different vehicle and refuses. */
  const secTypeAdmits = (type) => {
    const t = String(type || "").trim();
    return t === "" || /^mutual fund/i.test(t);
  };
  let named = 0, blank = 0; const acks = new Set();
  let filed = 0; const filedAcks = new Set();
  let trail = 0; const trailAcks = new Set();
  for (let i = 0; i < SHARDS; i++)
    for (const [ack, e] of Object.entries(buckets[i])) {
      if (!e || !Array.isArray(e.funds)) continue;
      for (const f of e.funds) {
        const t = String(f.type || "").trim();
        /* THE SYMBOL THE FILING ITSELF PRINTS, stored separately because the
         * page must prefer it over the pattern table rather than fall back to
         * it. The rule and its three conditions are in match-sec-tickers.mjs.
         *
         * NO TYPE GATE, and the measurement is what decided that rather than
         * caution. `secTypeAdmits` exists because resolving a NAME can land on
         * a mutual fund where the filing calls the row a collective trust; a
         * printed SYMBOL is not open to that, because the SEC registers no
         * collective trust and so none can lead with one. Applying the gate
         * here refuses 63 rows and every one is a correctly-named money-market
         * or bond fund typed `Cash / short-term` or `Government securities` —
         * an asset CATEGORY, not a contradicting vehicle. Across all 937 hits
         * not one carries a collective-trust or separate-account type.
         *
         * It cannot move a FEE: `fundERRow` is called on the NAME and never on
         * a symbol, and the answer is never `comparable`, so no asterisk moves
         * either. Measured: 0 of the 35 corrections are asterisked today. */
        /* The TRAILING arm runs only where the leading one declined, so it can
         * only ever fill a blank — and that it never shadows the leading rule
         * is MEASURED, not argued: of its 659 hits, `resolveFiledTicker`
         * already answers on 0. Its own guard and the three candidates it
         * killed are documented at the function. */
        const ftk = resolveFiledTicker(idx, f.name);
        const ttk = ftk ? null : resolveTrailingFiledTicker(idx, f.name, f.iss);
        if (ftk) { f.ftk = ftk; filed++; filedAcks.add(ack); }
        else if (ttk) { f.ftk = ttk; trail++; trailAcks.add(ack); }
        else delete f.ftk;
        if (!secTypeAdmits(t)) continue;               // the FILING contradicts
        const r = resolveHolding(idx, f.name, f.iss);
        if (!r || r.comparable) { delete f.stk; continue; }
        f.stk = r.ticker; named++; if (!t) blank++; acks.add(ack);
      }
    }
  console.log(`sec tickers: ${named} rows across ${acks.size} plans (${blank} on a blank type cell) (index ${idx.rows} classes, ${idx.generated})`);
  console.log(`filed tickers: ${filed} rows across ${filedAcks.size} plans`);
  console.log(`filed tickers (trailing parenthetical): ${trail} rows across ${trailAcks.size} plans`);
} catch (err) {
  console.log(`sec tickers: skipped (${err.message})`);
}

status.generated = new Date().toISOString();
writeFileSync("lineups-status.json", JSON.stringify(status));
const index = {};
for (let i = 0; i < SHARDS; i++) {
  writeFileSync(shardName(i), JSON.stringify(buckets[i]));
  for (const [ack, e] of Object.entries(buckets[i])) index[ack] = indexFlags(e);
}
writeFileSync("lineups-index.json", JSON.stringify({ generated: new Date().toISOString(), shards: SHARDS, plans: index }));

// Row-aligned effective bits for the site's boot (plans-list.json order ==
// plans-all order): the browser no longer knows acks at boot, so the flags
// are positional. Extra bits beyond indexFlags: 2048 = this plan's linked
// master trust has a confident lineup (the trust ack itself arrives with
// the detail shard on expand); bits 13-15 = document-shape enum (DS_ENUM,
// frozen order); 4096 = the parser found the filing's
// schedule but it reports investments in AGGREGATE (dx=stmt: MetLife,
// Comcast, Albertsons class, plus the generic-dominant lineups v111
// withdrew) — the frontend explains that instead of implying an unread
// schedule.
/* `few` that is really an AGGREGATE FILING (2026-09-09). A plan whose whole
 * schedule is one or two lines summing to the plan's own assets did not defeat
 * our reading — it reported in aggregate, exactly like the `stmt` class, and
 * saying "we could not read it" of such a filing is false. The test is the
 * DOMINANT row: >=80% of the parsed sum, under a name that is a whole-plan
 * wrapper rather than a fund.
 *
 * The dominant-row form is deliberate and measured. Requiring EVERY row to be
 * aggregate-shaped labelled 35 plans; the dominant form labels 63 (61,976
 * participants, $3.3B) and the rows it admits are "Master Pooled Separate
 * Account [99%]", "403(b) annuity contracts and custodial accounts [100%]",
 * "Value of Int in Regist Invest Co. [91%]". What it still refuses is the
 * parser's own debris — "of participation [91%]", "PNC Bank [96%]",
 * "Beginning of the year - End of the year [100%]" — which is the whole point:
 * the page makes a claim about the FILING here, so a junk row must never be
 * allowed to stand in for one.
 *
 * AGG_VEHICLE is narrow on purpose and lives here because this is merge's
 * question. GENERIC_TYPE_NAME and AGG_DISCLOSURE are imported rather than
 * re-typed — three copies of a vocabulary have drifted apart once already. */
const AGG_VEHICLE = /^(?:master |group |unallocated )?(?:pooled )?separate account.*|^.*annuity contracts?(?: and custodial accounts?)?$|^(?:self[- ]?directed|individually directed|self managed) brokerage accounts?$|^403\(b\) .*(?:contracts?|accounts?)$|^interest in .*|^value of int(?:erest)? in .*/i;
function filedAggregate(st, ack) {
  if (st.dx !== "few" || !(st.rt >= 90 && st.rt <= 110)) return false;
  const e = buckets[shardOf(ack)][ack];
  const funds = (e && e.funds) || [];
  if (!funds.length) return false;
  const sum = funds.reduce((a, f) => a + (+f.value || 0), 0);
  if (!(sum > 0)) return false;
  const dom = funds.reduce((a, f) => ((+f.value || 0) > (+a.value || 0) ? f : a), funds[0]);
  if ((+dom.value || 0) / sum < 0.8) return false;
  const n = String(dom.name || "").trim();
  return AGG_DISCLOSURE.test(n) || GENERIC_TYPE_NAME.test(n) || AGG_VEHICLE.test(n);
}

/* TRUST-HELD BUT UNLINKED (bit 65536, v-index 2026-09-11).
 *
 * A plan whose Schedule D names a master trust we could not follow still tells
 * us so in its own 4i rows: "Plan Interest in Master Trust at Fair Value".
 * Without this, such a plan falls through to the document-shape sentence and
 * is told something FALSE about its filing — Conagra (28,863 participants) was
 * shown "those pages are not present in the public copy" while we had read six
 * rows from exactly those pages, and Genentech ($14.35B) was shown "we could
 * not read it" when the real cause is that no MTIA filing exists under the EIN
 * its Schedule D names.
 *
 * The pattern demands the row say the PLAN HOLDS AN INTEREST in a trust. A
 * bare mention of "trust" is not enough: fund names like "Collective Trust
 * Fund" contain the word and are ordinary holdings, and this bit makes a claim
 * on the page. Measured over the live store: 6 plans, 75,808 participants,
 * $16.8B — 4 band-hi, 1 trust, 1 few, so it is deliberately NOT keyed to dx. */
/* WIDENED 2026-09-11, same day, after auditing what the first version missed.
 * Three narrownesses, each costing real plans:
 *   - singular verb only: "InvestmentS in master trust" (Fluor, 16,213p)
 *   - a 40-char window that a long trust NAME overruns: "Participation
 *     interest in HCA Inc. Master Retirement Savings Trust" (HCA, 379,101p)
 *   - "master trust" required verbatim, so a trust called something else was
 *     missed: "Investment in Nestle in the USA Savings Trust" (Nestle, 50,509p)
 * Still demands the row express an INTEREST IN a trust: a bare "... Trust"
 * would sweep in ordinary holdings named "Collective Trust Fund", and this
 * bit makes a claim on the page. Measured before shipping: +25 plans,
 * ~600,000 participants, and the CONTROL is that 2 plans matching the text
 * publish a confident lineup - they never receive the bit because it is gated
 * on there being no lineup from any source. That gate is load-bearing. */
const TRUST_INTEREST_ROW =
  /\b(?:interests?|participations?|investments?)\b[^|]{0,20}\bin\b[^|]{0,60}\b(?:master|savings|retirement|benefit)\s+trust\b|\bmaster trust\b[^|]{0,30}\bat (?:fair|contract) value\b|^plan(?:'s)? interest\b/i;
function trustHeldUnlinked(ack) {
  const e = buckets[shardOf(ack)][ack];
  const funds = (e && e.funds) || [];
  return funds.some((f) => TRUST_INTEREST_ROW.test(String(f.name || "").trim()));
}

/* Document-shape enum for plans-index bits 13-15. Order is FROZEN: the
 * frontend decodes by number, so appending is safe and reordering is not. */
const DS_ENUM = { noattach: 1, notable: 2, omitted: 3, absent: 4, scanned: 5, readfail: 6, unread: 7 };
try {
  const pa = JSON.parse(readFileSync("plans-all.json", "utf8"));
  const ai = pa.fields.indexOf("ack"), mi = pa.fields.indexOf("mtiaAck");
  const bits = pa.plans.map((r) => {
    let b = index[r[ai]] || 0;
    if (r[mi] && (index[r[mi]] || 0) & 1) b |= 2048;
    const st = status.plans[r[ai]];
    /* ORDER CORRECTED 2026-09-18, and the order is the whole defect. Bit 4096
     * ("filed in aggregate") was assigned BEFORE the trust test below and the
     * trust test is gated on `!(b & 4096)`, so a plan whose single 4i row says
     * `Plan's interest in Master Trust` — which is BOTH an aggregate and a
     * trust pointer — could never reach 65536/131072.
     *
     * First American Financial (17,090 participants, $2.86B) is the type case
     * and was queued as a defect: v135 part 1 made its one-row trust pointer
     * readable and predicted the page would name the trust, but the store came
     * back `dx=stmt` (diagnose() tests `parsed.stmt` before `parsed.trustPtr`,
     * and a lone `master trust` row is aggregate-only) and the index came back
     * 4460 — bit 4096, neither trust bit. So the page said the plan files its
     * investments in aggregate and never said WHERE the money is, which the
     * filing states plainly.
     *
     * Both sentences are true of such a plan; the trust one is strictly more
     * informative, because it names the trust (`mtiaName`) and tells the
     * reader which return to look at. So the more specific claim is made
     * first and 4096 becomes the fallback. Nothing else moves: a plan with an
     * aggregate top row that is NOT a trust interest still gets 4096, and a
     * plan with any lineup (bit 1 or 2048) still gets neither. */
    if (st && !st.c && !(b & (1 | 2048)) && trustHeldUnlinked(r[ai])) {
      b |= 65536;
      if (r[mi]) b |= 131072;
    }
    if (st && !st.c && (st.dx === "stmt" || filedAggregate(st, r[ai])) && !(b & (1 | 2048 | 65536))) b |= 4096;
    /* v113 data: bits 13-15 carry the DOCUMENT SHAPE as a 3-bit enum so a
     * plan with no lineup can state the real reason instead of the hedge
     * "scanned/absent, or held through a trust". Read ONLY when there is no
     * lineup to show — `ds` describes the FILING, not our success, and must
     * be conditioned (a band-hi plan legitimately carries ds=readfail). */
    /* Trust-held-but-unlinked outranks the document-shape sentence, because
     * that sentence would describe the FILING when the filing is fine and the
     * gap is the missing trust return. Gated on having no lineup from any
     * source and no trust link of its own. */
    /* 65536 = the plan's own rows say the money is in a master trust, and no
     * fund list is available. TWO populations reach here and the page must
     * not conflate them, so 131072 marks the second:
     *   no mtiaAck            -> we never matched the plan to a trust return
     *   mtiaAck, trust opaque -> we found it; the TRUST's return is the one
     *                            without a readable fund list (bit 2048 needs
     *                            the trust itself to have parsed confidently)
     * Measured 2026-09-11: 6 unlinked, 41 linked-but-opaque (631,022
     * participants, Albertsons 236,172). The first pass gated on !mtiaAck and
     * left the larger half saying "we could not read it - that's our gap"
     * about a filing that had been read without trouble. */
    if (st && !st.c && !(b & (1 | 2048 | 4096 | 65536)) && DS_ENUM[st.ds]) b |= DS_ENUM[st.ds] << 13;
    return b;
  });
  writeFileSync("plans-index.json", JSON.stringify({ generated: new Date().toISOString(), count: bits.length, bits }));
  console.log(`wrote plans-index.json: ${bits.length} rows, ${bits.filter((b) => b & 2048).length} trust-lineup plans, ${bits.filter((b) => b & 4096).length} filed-in-aggregate, ${bits.filter((b) => (b >> 13) & 7).length} with a document-shape reason, ${bits.filter((b) => b & 65536).length} trust-held without a fund list (${bits.filter((b) => b & 131072).length} of them linked to a trust that is itself opaque)`);
} catch (e) { console.warn("plans-index skipped (plans-all absent?): " + e.message); }

const vals = Object.values(status.plans);
console.log(`merged ${applied} entries; totals: ${vals.length} parsed, ${vals.filter((p) => p.c).length} confident lineups, ${vals.filter((p) => p.f).length} with features`);

// confidence diff report: every run prints WHAT moved, so a regression is
// visible in the log without a by-hand diff (v39 shipped +13/-38 that only
// a manual diff caught — see accuracy log 2026-08-04). LOSSES especially
// must be sampled against filing text before the next parser change.
{
  const gained = [], lost = [];
  for (const [a, m] of Object.entries(status.plans)) {
    if (m.c && !prevConfident.has(a)) gained.push(a);
    if (!m.c && prevConfident.has(a)) lost.push(a);
  }
  for (const a of prevConfident) if (!(a in status.plans)) lost.push(a + " (entry purged)");
  console.log(`\n== CONFIDENCE DIFF vs previous data: +${gained.length} / -${lost.length}`);
  if (gained.length) console.log(`  gained: ${gained.slice(0, 25).join(", ")}${gained.length > 25 ? ` … +${gained.length - 25} more` : ""}`);
  if (lost.length) console.log(`  LOST:   ${lost.slice(0, 25).join(", ")}${lost.length > 25 ? ` … +${lost.length - 25} more` : ""}`);
  const fb = vals.filter((p) => p.fb).length;
  if (fb) console.log(`  prior-year fallback lineups in store: ${fb}`);
  // LOSS TRIAGE: losses whose OLD parse was real-menu-shaped go to the
  // audit as HIGH findings — junk-cleanup losses (tiny/edge-band parses)
  // are expected on guard changes, but a lost 20-row ratio-1.0 menu means
  // the new version broke something real. audit-data reads this file.
  // junk-name demotions are excluded: the demotion IS the triage verdict
  // (the entry's own fund names prove it was never a real menu)
  /* SUPERSESSION IS NOT REGRESSION — the fix for run #186, which raised 4,741
   * HIGH findings of which 4,737 were false and buried the four real ones.
   *
   * That run ingested a new filing season, so thousands of plans moved to a
   * newer ack. The triage compared ack to ack and never asked whether the
   * PLAN had moved, so every superseded filing looked like a lineup that had
   * "lost confidence". Triaged by hand afterwards: 4,505 were replaced by a
   * newer filing that is itself confident, 250 by a newer filing that is not
   * yet, 12 were master-trust acks, and ZERO were the only shape that is
   * actually a regression — the same ack still current with its lineup gone.
   *
   * An ack that is no longer any plan's current filing is never displayed
   * again, so its lineup cannot have regressed for a reader. Only acks still
   * in plans-all (or mtias.json) can. When plans-all is unavailable the set is
   * null and the filter is skipped rather than silently passing everything. */
  let superseded = 0;
  const realish = lost.filter((a) => {
    const ack = a.split(" ")[0];
    if (demotedAcks.has(ack)) return false;
    if (currentAcks && !currentAcks.has(ack)) { superseded++; return false; }
    const s = prevShape[ack];
    // floor lowered n>=5 -> n>=3 in-band, gated on !agg (see the capture
    // comment above): a lost 3-fund Vanguard menu at ratio 1.0 is exactly
    // as much a regression as a lost 20-fund one
    return s && !s.agg && (s.n >= 7 || (s.n >= 3 && s.r >= 0.7 && s.r <= 1.3));
  });
  if (superseded) console.log(`  of those losses, ${superseded} are superseded filings (the plan moved to a newer ack) — not regressions, not triaged`);
  else if (!currentAcks) console.log("  supersession filter SKIPPED (plans-all unavailable) — losses may include superseded filings");
  console.log(`  real-menu-shaped losses (auto-triage → audit HIGH): ${realish.length}`);
  writeFileSync("losses-triage.txt", realish.join("\n") + (realish.length ? "\n" : ""));

  /* SOURCE SWAPS — the blind spot the loss triage cannot see.
   *
   * Everything above compares CONFIDENT to NOT-CONFIDENT. A plan that stays
   * confident while its lineup SOURCE changes — served from its prior-year
   * filing one run, from its own newest filing the next — moves no count at
   * all: `c` stays 1, the totals do not budge, the triage never looks.
   *
   * Measured on run #254 (2026-09-10), which swapped 157 plans that way:
   * 94 held or grew their row count, and the 10 that shrank were FINE because
   * their ratio moved TOWARD 1.0 (Extron 55 rows @ 0.81 -> 7 @ 0.97) — the
   * signature of the prior year having carried extra rows, not of lost
   * detail. Row count alone would have flagged all ten and been wrong ten
   * times. What actually discriminates is the ratio moving AWAY from 1.0, and
   * exactly 2 did: Prevost Car 15 rows @ 0.90 -> 15 @ 0.46 and Pediatrics
   * West 33 @ 0.95 -> 37 @ 0.51. Nothing fabricated — the rows are real — but
   * each now publishes a menu accounting for about half the plan's money,
   * clearing isConfident only because the floor is 0.45.
   *
   * WARN, not HIGH: a swap is usually an upgrade and the population is tiny,
   * so this must not drown the four known-baseline HIGHs. It exists so the
   * next one is seen at all. */
  {
    const swaps = [];
    for (const [a, m] of Object.entries(status.plans)) {
      if (!m.c) continue;
      const before = prevShape[a];
      if (!before || !before.fb) continue;       // was NOT served from a prior year
      if (m.fb) continue;                         // still is: not a swap
      const e = buckets[shardOf(a)][a];
      if (!e || !e.funds) continue;
      const r = e.coverageRatio || 0;
      const drift = Math.abs(1 - r) - Math.abs(1 - before.r);
      if (drift > 0.25) {
        swaps.push(`${a} ${before.n} rows @ ${before.r.toFixed(2)} (from ${before.fb}) -> ${e.funds.length} rows @ ${r.toFixed(2)}`);
      }
    }
    console.log(`  source swaps that DEGRADED coverage (prior-year -> own filing, ratio >0.25 further from 1.0): ${swaps.length}`);
    for (const line of swaps.slice(0, 15)) console.log(`    ${line}`);
    writeFileSync("swaps-degraded.txt", swaps.join("\n") + (swaps.length ? "\n" : ""));
  }

  /* ROWS DROPPED FROM A LINEUP THAT STAYS CONFIDENT — the third blind spot,
   * and the one that let v172 reach readers.
   *
   * The loss triage above compares CONFIDENT to NOT-CONFIDENT. The swap check
   * compares SOURCES. Neither looks at a plan that stays confident, keeps its
   * source, and simply publishes FEWER ROWS than it did — so a version that
   * deletes one row from a 27-row menu moves nothing any check watches.
   *
   * MEASURED, 2026-09-20. v172 deleted the row where Apple files
   * `BROKERGE ACCOUNT | Various Accounts | 2,153,504,672` — the identity is
   * the brokerage window, the description is prose, the description won the
   * name and the prose rule fired on it. **$2,153,504,672, 7% of a $30.8B
   * plan, 145,428 participants**, and Apple's published menu fell from 98.7%
   * of the plan to 91.7% with nothing on the page saying so. Its verdict read
   * three plans by ROW COUNT, all three came out as predicted, and it passed:
   * Apple went 27 -> 26, a one-row move indistinguishable from noise.
   *
   * What discriminates is what already discriminates for swaps — the RATIO
   * moving AWAY from 1.0. A version that removes a fabricated row leaves a
   * genuinely unaccounted gap and the ratio falls honestly, so this cannot be
   * a HIGH and cannot be read as "the version is wrong"; it is a list of the
   * plans a human must look at before mirroring. WARN, like the swaps, and
   * for the same reason: the population must not drown the baseline HIGHs.
   *
   * The bar is 0.03 of drift because Apple's was 0.070 and the whole point is
   * to catch the next one with margin. */
  {
    const dropped = [];
    for (const [a, m] of Object.entries(status.plans)) {
      if (!m.c) continue;
      const before = prevShape[a];
      if (!before) continue;
      if (before.fb || m.fb) continue;           // a source change is the swap check's job
      const e = buckets[shardOf(a)][a];
      if (!e || !e.funds) continue;
      if (e.funds.length >= before.n) continue;  // no rows lost
      const r = e.coverageRatio || 0;
      const drift = Math.abs(1 - r) - Math.abs(1 - before.r);
      if (drift > 0.03) {
        dropped.push(`${a} ${before.n} rows @ ${before.r.toFixed(3)} -> ${e.funds.length} rows @ ${r.toFixed(3)} (${drift.toFixed(3)} further from 1.0)`);
      }
    }
    dropped.sort();
    console.log(`  confident lineups that LOST rows and moved away from 1.0 (>0.03): ${dropped.length}`);
    for (const line of dropped.slice(0, 15)) console.log(`    ${line}`);
    writeFileSync("rows-dropped.txt", dropped.join("\n") + (dropped.length ? "\n" : ""));
  }
}
