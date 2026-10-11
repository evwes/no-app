/* wampo — AN ABBREVIATED CAPITAL GROUP / AMERICAN FUNDS HOLDING, RESOLVED
 * AGAINST THE REGISTRY RATHER THAN AGAINST A GUESSED EXPANSION. 2026-10-11.
 *
 * THE DEFECT. Sandpiper Property Mgt (448 participants) publishes eight
 * `AMERFUNDS 20XX TARG DATERET R6` rows with no ticker and no fee — 65.6% of
 * its whole menu by value — while row 6 of the SAME menu,
 * `AMERICAN FUNDS 2055 TARGET R6`, resolves RFKTX. Same house, same product
 * family, same share class stated; the only thing that varies is how much of
 * the name the filer typed. Store-wide the control is stark: the house spelled
 * IN FULL resolves on 42.3% of its rows and the contracted spellings on 1.3%.
 *
 * WHY A VOCABULARY IS THE WRONG SHAPE, and this record has measured it twice.
 * Expanding `inv.` -> `Investment` gave 9 false positives of 21 rows, because
 * `2040 INV` is an INVESTOR share class; and a hand-written contraction table
 * is a list of the author's own guesses, which is how `AMER BALANCED`,
 * `TARG DATERET`, `NEW PERSP`, `Bond Fnd Amer` and `SMALLCAP WORLD` would each
 * need their own line and the next filer's spelling would need another.
 *
 * SO THE RELATION IS GENERAL AND THE REGISTRY SUPPLIES THE TARGET. One
 * predicate — can this filed token run ABBREVIATE that registered series
 * name? — asked against the Capital Group family and required to answer
 * EXACTLY ONE series. Nothing here knows that `TARG` means `Target`; it knows
 * that `targ` can abbreviate `target` and that `dateret` can abbreviate
 * `date retirement`, and the registry says which series exists.
 *
 * THE ABBREVIATION RELATION, stated exactly because it is the whole arm:
 * each FILED token consumes one or more CONSECUTIVE series words; its letters
 * must be a subsequence of their concatenation AND must include the FIRST
 * letter of every word it consumes. The first-letter obligation is what makes
 * it an abbreviation rather than a letter game: without it `balanced` would
 * "abbreviate" `funds global balanced` by skipping two words whole, and
 * `AMERFUNDS AMER BALANCED` would match `AMERICAN FUNDS GLOBAL BALANCED FUND`
 * as readily as `AMERICAN BALANCED FUND`. Measured: that condition alone is
 * what refuses the Global Balanced reading of the class's second-largest
 * family.
 *
 * THE HOUSE IS A LEADING RUN AND THAT ANCHOR IS THE DECOY GUARD. The filed
 * name must OPEN with a token run abbreviating `american funds` or
 * `capital group` — by the same relation, so `AMERFUNDS`, `AMERFDS`,
 * `AMER FUNDS`, `Amer Fds`, `Am Funds` and `AMF` all qualify without being
 * listed. `MyCompass Amer Fds 2035 Fd R` does NOT, because `mycompass` is
 * first: this file already records MyCompass American Funds as a WRAPPER lead,
 * CORRECT AS FILED (0 of 608), a platform's own product and not the mutual
 * fund, so asserting a registered symbol on it is the pooled-vehicle harm.
 * ~390 rows over twelve vintages are refused BY STRUCTURE rather than by a
 * blocklist, and pinned.
 *
 * THE FAMILY IS DERIVED FROM THE REGISTRY, NOT NAMED. A registrant belongs if
 * it registers a class called `Class R-2E`, `Class R-5E` or `Class 529-A` —
 * Capital Group's own distinctive share-class ladder. Measured over all 29,406
 * registry rows that is 39 registrants and every one of them is a Capital
 * Group trust by reading: AMCAP FUND, EUPAC FUND, GROWTH FUND OF AMERICA,
 * SMALLCAP WORLD FUND INC, NEW PERSPECTIVE FUND, WASHINGTON MUTUAL INVESTORS
 * FUND, CAPITAL INCOME BUILDER, INVESTMENT CO OF AMERICA and the twenty-odd
 * `AMERICAN FUNDS …` trusts. ZERO foreign houses. So a wrong answer from this
 * arm can only ever be the wrong Capital Group FUND — never another house's —
 * and `assertFamily` throws if that stops being true.
 *
 * THE SHARE CLASS MUST BE STATED AND IS READ OUT OF THE REGISTRY'S OWN
 * `className`. A trailing `R6` is matched against the series' registered class
 * keys, so `R6` -> `Class R-6` and `R4` -> `Class R-4` are the registry's
 * answer and not ours — which matters, because R-4 and R-6 are different
 * tickers and ~130 rows of this class state R-4. A row stating NO class is
 * REFUSED: the honest answer there is a comparable, and comparables are the
 * owner's call.
 *
 * ONLY ASSERTED ANSWERS, one unique series, one unique class.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CALLER EXEMPTS THIS ARM FROM `registrantAttested`, AND WHY THAT IS
 * NOT A WEAKENING. That guard asks whether the REGISTRANT's distinctive
 * vocabulary appears in the FILED name, and it is asked of the filed spelling.
 * For a class DEFINED BY the filed spelling being an abbreviation it is
 * refuting the arm's own premise: `AMERFUNDS AMER BALANCED - R6` -> RLBGX is
 * refused because the registrant's single distinctive word is `american` and
 * the filer typed `AMER`. Measured over all 18,802 gained rows: it refuses
 * **1,557 rows / 456 keys**, and asking it instead of the HOUSE-REPAIRED
 * spelling rescues only 597 of them — **960 rows / 283 keys** stay refused
 * because the PRODUCT is contracted too (`Nw Prspctv`, `Cap Wld Bnd`). This is
 * the MEFS lesson in its general form, and there it is structural rather than
 * incidental.
 *
 * What replaces it is stronger and is computed against the REPAIRED reading:
 * the filing must STATE the house at the lead, the destination must be in the
 * registry-derived Capital Group family, the product must abbreviate exactly
 * ONE of that family's series, and the class must be one that series registers.
 * So a wrong answer from this arm can only ever be the wrong CAPITAL GROUP
 * fund — never another house's. Three measurements support it, all
 * whole-population rather than sampled:
 *   - 22 adversarial probes, every one abstaining: a foreign house welded in
 *     (`American Funds Vanguard 500 Index R6`, `AMERFDS BLACKROCK EQUITY INDEX
 *     R6`), a product too generic to pin (`AMERFUNDS GROWTH R6`, `AMERFUNDS
 *     2030 R6`), another house whose first word is `American` (`American
 *     Century Growth Fund R6`, `American Beacon Bond R6`), and both MyCompass
 *     orderings;
 *   - over ALL gained rows, `namesManager` names 16 distinct managers and
 *     every one is Capital Group's OWN series vocabulary (`new perspective`,
 *     `new world`, `eupac`, `amcap`, `smallcap`) or the structural phrase
 *     `mutual fund`. ZERO foreign houses;
 *   - all 56 leading house runs the relation accepts anywhere in the store
 *     were enumerated and READ, with 0 decoys — the `AMF` method, not the
 *     `tiaa` one.
 * A FOREIGN-HOUSE REFUSAL WAS CONSIDERED AND DELIBERATELY NOT WRITTEN: no
 * single-protection case for it exists, because a foreign token must itself be
 * absorbed by the series for the arm to fire at all, so the condition would be
 * UNREACHABLE BY CONSTRUCTION — worse than inert. The invariant is ASSERTED in
 * `scripts/af-abbrev-test.mjs` instead.
 */

/* ---------- tokens ---------- */
export const afToks = (s) =>
  String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/* series words the filer may leave out entirely. `american`/`funds`/`capital`/
 * `group` are here because the SERIES name often repeats the house the filed
 * name already stated in its leading run — `American Funds 2055 Target Date
 * Retirement Fund` against a filed rest of `2055 TARG DATERET`. Skipping is a
 * PERMISSION, never an obligation, so `AMERICAN BALANCED FUND` can still be
 * matched by a filed `AMER BALANCED`. */
const SKIP = new Set(["the", "of", "and", "inc", "incorporated", "fund", "funds", "series",
  "trust", "company", "co", "american", "capital", "group"]);

/* ---------- noise in the leftover run, tested BY THE SAME RELATION ----------
 * MY FIRST DRAFT LISTED THE SPELLINGS AND THE LIST COST 276 ROWS ON ITS FIRST
 * MEASUREMENT: it held `fd` and `fds` and not `fnd`, so
 * `American Funds NewPrsp R6 Fnd` abstained while `American Funds NewPrsp R6`
 * answered RNPGX. ***A count keyed on a vocabulary measures the vocabulary***,
 * met inside the very arm written to avoid a vocabulary — so the noise test is
 * the ABBREVIATION RELATION against a handful of vehicle words, which reaches
 * `fnd`, `fnds`, `fd`, `shs`, `cl` and the next filer's spelling alike.
 *
 * `the`, `of` and the bare `a` are LITERAL on purpose. `a` is also a real share
 * class, and letting a bare `A` tail be read as `Class A` would assert a retail
 * class's symbol — the relation would never drop it (`a` cannot abbreviate
 * `shares`, whose first letter is mandatory), so it is listed, and the arm
 * ABSTAINS on a row whose only designation is `A`. That is the conservative
 * direction and its cost is named rather than hidden. */
const NOISE_WORDS = ["fund", "funds", "shares", "share", "units", "unit", "class", "classes"];
const NOISE_LITERAL = new Set(["the", "of", "a", "an", "and"]);
function isNoiseTok(t) {
  if (NOISE_LITERAL.has(t)) return true;
  for (const w of NOISE_WORDS) if (absorbs(t, [w])) return true;
  return false;
}

/* ---------- can `t` abbreviate the concatenation of `words`? ----------
 * `t`'s letters must appear in order inside the concatenation, and every word's
 * FIRST character must be one of the matched positions. */
function absorbs(t, words) {
  const concat = words.join("");
  if (t.length > concat.length) return false;
  const mandatory = new Set();
  let off = 0;
  for (const w of words) { mandatory.add(off); off += w.length; }
  /* DP: can t[i..] match concat[j..] using every mandatory position >= j? */
  const memo = new Map();
  const go = (i, j) => {
    if (i === t.length) {
      for (const m of mandatory) if (m >= j) return false;
      return true;
    }
    if (j === concat.length) return false;
    const k = i * (concat.length + 1) + j;
    if (memo.has(k)) return memo.get(k);
    let ok = false;
    if (t[i] === concat[j]) ok = go(i + 1, j + 1);
    if (!ok && !mandatory.has(j)) ok = go(i, j + 1);   // skip a non-mandatory char
    memo.set(k, ok);
    return ok;
  };
  return go(0, 0);
}
export const __absorbs = absorbs;

/* ---------- can filed tokens T abbreviate series tokens S? ----------
 * Returns true only if every filed token is consumed and every series token is
 * either consumed or skippable. `maxWords` bounds how many series words one
 * filed token may weld (`DATERET` = date + retirement needs 2). */
export function abbreviates(T, S, maxWords = 3, skip = SKIP) {
  const memo = new Map();
  const go = (i, j) => {
    if (i === T.length) {
      for (let x = j; x < S.length; x++) if (!skip.has(S[x])) return false;
      return true;
    }
    if (j >= S.length) return false;
    const k = i * (S.length + 1) + j;
    if (memo.has(k)) return memo.get(k);
    let ok = false;
    if (skip.has(S[j])) ok = go(i, j + 1);             // leave this series word out
    for (let w = 1; !ok && w <= maxWords && j + w <= S.length; w++)
      if (absorbs(T[i], S.slice(j, j + w))) ok = go(i + 1, j + w);
    memo.set(k, ok);
    return ok;
  };
  return go(0, 0);
}
const NO_SKIP = new Set();

/* ---------- the leading house run ----------
 * Returns how many leading filed tokens abbreviate `american funds` or
 * `capital group`, or 0.
 *
 * BOTH WORDS MUST BE COVERED, AND `NO_SKIP` IS WHY — MY FIRST DRAFT PASSED THE
 * SKIP SET IN AND `American Century Growth R6` WAS ACCEPTED WITH A HOUSE RUN OF
 * ONE. `funds` is in `SKIP` for the series side, so `american` alone satisfied
 * the phrase by skipping the second word whole, and the arm's whole house claim
 * — this filing says American FUNDS — collapsed to "this filing says American".
 * American Century, American Beacon, American Century Investments and
 * `Bank of America` are all other houses. The comment above this function
 * asserted the opposite of what the code did until a control printed it.
 *
 * AND THERE IS NO LETTER FLOOR ON THE RUN, WHICH IS A MEASUREMENT AND NOT AN
 * OVERSIGHT — I shipped a four-letter floor in the first draft on the reasoning
 * that `CG` is a code rather than an abbreviation, and then PRICED IT BY THE
 * OUTCOME instead of by the rows a predicate matches. A floor of 4 loses **684
 * rows** and every one was read: `AF AMER MUTUAL R6` (92), `AF BOND FD AMER R6`
 * (67), `AMF BOND FUND OF AMERICA R6` (62), `AMF INCOME FD OF AMERICA R6`,
 * `AFS Interm Bond Fund of America R6` — all unambiguously Capital Group. A
 * floor of 2 against a floor of 1 changes **0** rows, because a one-letter
 * token cannot satisfy the relation anyway, so any floor at or below 2 is
 * UNREACHABLE BY CONSTRUCTION and a condition unreachable by construction is
 * worse than an inert one. The single leading run the floor would have been
 * for, `CG LONG DUR CREDIT TRST (US) CL DB` — not a Capital Group mutual fund —
 * is refused by the SERIES MATCH on its own and never reaches an answer.
 * `af-abbrev-test.mjs` asserts that rather than leaving it to a comment. */
const HOUSE_PHRASES = [["american", "funds"], ["capital", "group"]];
export function houseRun(T) {
  for (let n = Math.min(3, T.length); n >= 1; n--) {
    const head = T.slice(0, n);
    for (const ph of HOUSE_PHRASES) if (abbreviates(head, ph, 2, NO_SKIP)) return n;
  }
  return 0;
}

/* ---------- the registry-derived family and its series index ---------- */
const FAMILY_CLASSES = new Set(["class r-2e", "class r-5e", "class 529-a"]);
const classKey = (cn) => String(cn || "").toLowerCase()
  .replace(/\b(class|shares|share)\b/g, " ").replace(/[^a-z0-9]+/g, "").trim();

export function buildAfIndex(funds) {
  const family = new Set();
  for (const r of funds) {
    const reg = String(r[0]).split("::")[0].trim();
    if (FAMILY_CLASSES.has(String(r[3] || "").trim().toLowerCase())) family.add(reg);
  }
  /* series -> { tokens, classes: Map(classKey -> ticker), name, reg } */
  const series = new Map();
  for (const r of funds) {
    const parts = String(r[0]).split("::");
    const reg = parts[0].trim();
    if (!family.has(reg)) continue;
    const name = (parts[1] || parts[0]).trim();
    const id = `${reg}\u0000${name}`;
    if (!series.has(id)) series.set(id, { name, reg, toks: afToks(name), classes: new Map() });
    const ck = classKey(r[3]);
    if (ck) series.get(id).classes.set(ck, r[1]);
  }
  return { family, series };
}

/* THE FAMILY IS ASSERTED, NOT TRUSTED. If a refresh of `sec-funds.json` ever
 * puts a registrant in here that is not a Capital Group trust, the arm's whole
 * safety claim — that a wrong answer can only be the wrong Capital Group fund —
 * is void, so this throws rather than shipping it. The band is wide enough for
 * a trust to be added or wound up and narrow enough to catch a house. */
export function assertAfFamily(idx) {
  const n = idx.family.size;
  if (n < 30 || n > 55)
    throw new Error(`lib-af-abbrev: the registry-derived Capital Group family is ${n} registrants, outside 30-55 — read the list before widening this band:\n  ${[...idx.family].sort().join("\n  ")}`);
  for (const must of ["EUPAC FUND", "NEW PERSPECTIVE FUND", "AMERICAN BALANCED FUND",
    "SMALLCAP WORLD FUND INC", "American Funds Target Date Retirement Series"])
    if (!idx.family.has(must))
      throw new Error(`lib-af-abbrev: ${must} is no longer in the derived family (${n} registrants) — the class-ladder witness has moved`);
  return n;
}

/* ---------- the arm ----------
 * `afAbbrevAsk(idx, filedName)` -> { ticker, series, className, why } or null.
 * ASSERTED answers only, and only where ONE series and ONE class answer. */
export function afAbbrevAsk(idx, filedName) {
  const T = afToks(filedName);
  if (T.length < 3) return null;                 // house run plus a product plus a class
  const h = houseRun(T);
  if (!h) return null;
  let rest = T.slice(h);
  /* trailing vehicle words sit BEHIND the class as often as in front of it
   * (`… R6 Fnd`), and a filer may write both */
  while (rest.length && isNoiseTok(rest[rest.length - 1])) rest = rest.slice(0, -1);
  if (!rest.length) return null;
  /* the trailing run is the share class; try the shortest leftover first so the
   * product keeps as much of the name as it can */
  for (let c = 1; c <= Math.min(3, rest.length - 1); c++) {
    const head = rest.slice(0, rest.length - c);
    const tail = rest.slice(rest.length - c).filter((x) => !isNoiseTok(x));
    if (!tail.length) continue;
    const ck = classKey(tail.join(""));
    if (!ck) continue;
    /* a product run must carry real words, not one letter */
    if (head.join("").length < 4) continue;
    const hits = [];
    for (const s of idx.series.values()) {
      if (!s.classes.has(ck)) continue;
      if (!abbreviates(head, s.toks)) continue;
      hits.push({ ticker: s.classes.get(ck), series: s.name, reg: s.reg, ck });
    }
    if (hits.length !== 1) continue;             // ambiguous or nothing: abstain
    const hit = hits[0];
    return { ticker: hit.ticker, series: hit.series, registrant: hit.reg,
      className: hit.ck, comparable: false, why: "af-abbrev" };
  }
  return null;
}
