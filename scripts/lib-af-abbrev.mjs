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
const BASE_SKIP = ["the", "of", "and", "inc", "incorporated", "fund", "funds", "series",
  "trust", "company", "co"];
const SKIP = new Set([...BASE_SKIP, "american", "capital", "group"]);

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
export function houseRun(T, phrases = HOUSE_PHRASES) {
  for (let n = Math.min(3, T.length); n >= 1; n--) {
    const head = T.slice(0, n);
    for (const ph of phrases) if (abbreviates(head, ph, 2, NO_SKIP)) return n;
  }
  return 0;
}

/* ---------- the registry-derived family and its series index ---------- */
const FAMILY_CLASSES = new Set(["class r-2e", "class r-5e", "class 529-a"]);
const classKey = (cn) => String(cn || "").toLowerCase()
  .replace(/\b(class|shares|share)\b/g, " ").replace(/[^a-z0-9]+/g, "").trim();

/* ---------- A FAMILY IS A CONFIGURATION, NOT A SECOND COPY OF THE ARM -------
 * 2026-10-16. The Fidelity Freedom ladder has the identical defect — a filer
 * contracts the name and the page publishes no symbol — and the relation above
 * already accepts all four observed Fidelity spellings (`FID FDM IDX 2050`,
 * `FID FREEDOM 2050`, `FID FRDM IDX 2050`, spelled out) against the registered
 * series names. So nothing about the relation is Capital Group's; what is
 * Capital Group's is the registry marker that derives the family, the house
 * phrase the filing must open with, and the series words a filer may omit.
 * Those three are a config, and `buildAfIndex`/`assertAfFamily` stay as thin
 * wrappers so there is exactly ONE copy of each shipped predicate.
 *
 * ONE THING GENUINELY DIFFERS AND IT IS THE CLASS. Capital Group's class
 * designations are CODES that survive normalisation (`R6` -> `Class R-6`), so
 * the equality test reaches them. Fidelity's are WORDS, and filers contract
 * them: `IPR` for `Institutional Premium Class`, `PRM` and `PREMIE` for
 * `Premier Class`, `INSTP`, `INV`. `classKey("Institutional Premium Class")` is
 * `institutionalpremium` and a filed `IPR` can never equal it. So this family
 * opts into matching the class BY THE SAME RELATION, and the tokens stay
 * DISTINCT under it rather than needing a guard: `IPR` reaches Institutional
 * Premium and NOT Premier (the `p` of `premier` is a mandatory first letter the
 * `i` cannot match), `PRM` reaches Premier and not Institutional Premium, and
 * neither reaches `Premier II Class` because the `ii` is left unconsumed. The
 * conflation that would publish the wrong class as fact on ~6,000 rows is
 * absent by construction. Measured over all 70 registered Freedom series.
 *
 * AND THE RELATION IS REFUSED WHERE THE TOKEN IS ITSELF A REGISTERED
 * DESIGNATION. A bare `K` is `Class K`, and `absorbs("k", ["k6"])` is true, so
 * in the 14 `Fidelity Advisor Freedom` series — which register `Class K6` and no
 * `Class K` — the relation alone would read a filed `K` as K6 and publish a
 * different class's ticker as fact. The rule is not a blocklist: if the token
 * EQUALS a class key anywhere in the family then the filer stated that class,
 * and a series that does not register it must ABSTAIN rather than be offered the
 * nearest one. Equality still runs first, so the 4,988 `K` rows whose series
 * does register `Class K` are unaffected.
 *
 * THE PER-SERIES CLASS UNIQUENESS CONDITION IS INERT ON TODAY'S REGISTRY AND IS
 * KEPT ANYWAY, LABELLED. Over the whole live family, 0 tails derived from class
 * words match two classes of one series — the designations are far enough apart
 * that the relation separates them — so no real single-protection case exists.
 * It is retained because the inertness is a property of `sec-funds.json`, which
 * refreshes from the SEC, not a property of this code, which is the same reason
 * the sliced `pooledVehicleRow` call is kept and labelled rather than deleted.
 * `af-abbrev-test.mjs` carries a CONSTRUCTED series (`Premier Class` beside
 * `Premium Class`, both reachable by `prm`) so the condition is tested on the
 * nearest reachable shape rather than claiming to have a live one. */
export const AF_FAMILY = {
  key: "af", label: "Capital Group", why: "af-abbrev",
  markers: FAMILY_CLASSES, house: HOUSE_PHRASES, skip: SKIP, classRelation: false,
  band: [30, 55], nameTest: null,
  must: ["EUPAC FUND", "NEW PERSPECTIVE FUND", "AMERICAN BALANCED FUND",
    "SMALLCAP WORLD FUND INC", "American Funds Target Date Retirement Series"],
};
export const FID_FAMILY = {
  key: "fid", label: "Fidelity", why: "fid-abbrev",
  markers: new Set(["class k6"]), house: [["fidelity"]],
  skip: new Set([...BASE_SKIP, "fidelity"]), classRelation: true,
  band: [2, 10], nameTest: /fidelity/i,
  must: ["FIDELITY SALEM STREET TRUST", "FIDELITY ABERDEEN STREET TRUST"],
};
const CLASS_SKIP = new Set(["class", "shares", "share"]);

export function buildFamilyIndex(funds, fam) {
  const family = new Set();
  for (const r of funds) {
    const reg = String(r[0]).split("::")[0].trim();
    if (fam.markers.has(String(r[3] || "").trim().toLowerCase())) family.add(reg);
  }
  /* series -> { tokens, classes: Map(classKey -> ticker), classList, name, reg } */
  const series = new Map();
  const famClassKeys = new Set();
  for (const r of funds) {
    const parts = String(r[0]).split("::");
    const reg = parts[0].trim();
    if (!family.has(reg)) continue;
    const name = (parts[1] || parts[0]).trim();
    const id = `${reg}\u0000${name}`;
    if (!series.has(id)) series.set(id, { name, reg, toks: afToks(name), classes: new Map(), classList: [] });
    const ck = classKey(r[3]);
    if (!ck) continue;
    series.get(id).classes.set(ck, r[1]);
    series.get(id).classList.push({ ck, cn: String(r[3] || ""), toks: afToks(r[3]), ticker: r[1] });
    famClassKeys.add(ck);
  }
  return { family, series, famClassKeys, fam };
}
export const buildAfIndex = (funds) => buildFamilyIndex(funds, AF_FAMILY);
export const buildFidIndex = (funds) => buildFamilyIndex(funds, FID_FAMILY);

/* THE FAMILY IS ASSERTED, NOT TRUSTED. If a refresh of `sec-funds.json` ever
 * puts a registrant in here that is not a Capital Group trust, the arm's whole
 * safety claim — that a wrong answer can only be the wrong Capital Group fund —
 * is void, so this throws rather than shipping it. The band is wide enough for
 * a trust to be added or wound up and narrow enough to catch a house. The
 * Fidelity family carries a NAME TEST as well, because its marker derives four
 * registrants rather than thirty-nine and a single foreign one would be a
 * larger share of it. */
export function assertFamily(idx) {
  const fam = idx.fam;
  const n = idx.family.size;
  const [lo, hi] = fam.band;
  if (n < lo || n > hi)
    throw new Error(`lib-af-abbrev: the registry-derived ${fam.label} family is ${n} registrants, outside ${lo}-${hi} — read the list before widening this band:\n  ${[...idx.family].sort().join("\n  ")}`);
  if (fam.nameTest) {
    const foreign = [...idx.family].filter((r) => !fam.nameTest.test(r));
    if (foreign.length)
      throw new Error(`lib-af-abbrev: the ${fam.label} family carries ${foreign.length} registrant(s) the name test refuses — the safety claim that a wrong answer can only be the wrong ${fam.label} fund is VOID:\n  ${foreign.join("\n  ")}`);
  }
  for (const must of fam.must)
    if (!idx.family.has(must))
      throw new Error(`lib-af-abbrev: ${must} is no longer in the derived ${fam.label} family (${n} registrants) — the class-ladder witness has moved`);
  return n;
}
export const assertAfFamily = (idx) => assertFamily(idx);

/* ---------- the arm ----------
 * `afAbbrevAsk(idx, filedName)` -> { ticker, series, className, why } or null.
 * ASSERTED answers only, and only where ONE series and ONE class answer. */
export function afAbbrevAsk(idx, filedName) {
  const fam = idx.fam || AF_FAMILY;
  const T = afToks(filedName);
  if (T.length < 3) return null;                 // house run plus a product plus a class
  const h = houseRun(T, fam.house);
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
    /* the token is a registered designation in its own right, so the relation
     * must not reinterpret it as an abbreviation of a different class */
    const stated = idx.famClassKeys ? idx.famClassKeys.has(ck) : true;
    const hits = [];
    for (const s of idx.series.values()) {
      if (!abbreviates(head, s.toks, 3, fam.skip)) continue;
      if (s.classes.has(ck)) { hits.push({ ticker: s.classes.get(ck), series: s.name, reg: s.reg, ck, how: "equal" }); continue; }
      if (!fam.classRelation || stated || ck.length < 2) continue;
      const cm = s.classList.filter((c) => abbreviates(tail, c.toks, 3, CLASS_SKIP));
      if (cm.length !== 1) continue;             // ambiguous within the series: abstain
      /* A TRUNCATION IS A PREFIX AND AN ABBREVIATION NEED NOT BE. The relation
       * answers `IN` -> Investor correctly by its own definition — `in` cannot
       * abbreviate `Institutional Premium`, whose `p` is a mandatory first
       * letter — and a filer cutting `INSTITUTIONAL PREMIUM` at a field width
       * produces those same two characters. So where the run is also a PREFIX of
       * a DIFFERENT class the same series registers, the two readings cannot be
       * told apart and the arm abstains. Measured: this is the only condition
       * refusing `IN` (Investor vs Institutional Premium) and `PREMIE` (Premier
       * vs Premier II), and it costs nothing on `IPR`, `IP`, `INSTP`, `INV` or
       * `PRM`, none of which is a prefix of a sibling class.
       *
       * IT IS NOT A SUBSTITUTE FOR THE LENGTH FLOOR ABOVE, and I wrote exactly
       * that claim into this comment before measuring it and it was FALSE. Over
       * the whole live family **34 single-character runs reach an answer** with
       * the floor removed — `P` -> Premier in the 28 Freedom series that
       * register no Premier II, and `E` -> ETF Class — so the floor's
       * single-protection population is real and live, not hypothetical. The two
       * conditions catch different things: the floor refuses a run too thin to
       * be anyone's abbreviation, and the prefix rule refuses a run that is
       * thick enough and still ambiguous (`PREMIE`, 275 rows, is six characters).
       * Each has its own live case in `af-abbrev-test.mjs`. */
      if (s.classList.some((c) => c.ck !== cm[0].ck && c.ck.startsWith(ck))) continue;
      hits.push({ ticker: cm[0].ticker, series: s.name, reg: s.reg, ck: cm[0].ck, how: "relation" });
    }
    if (hits.length !== 1) continue;             // ambiguous or nothing: abstain
    const hit = hits[0];
    return { ticker: hit.ticker, series: hit.series, registrant: hit.reg,
      className: hit.ck, comparable: false, how: hit.how, why: fam.why };
  }
  return null;
}
