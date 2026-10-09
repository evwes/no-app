#!/usr/bin/env node
/* wampo — SIZE THE NUMERIC-TOKEN RESIDUE OF THE CAPTION / LABEL VOCABULARIES.
 * 2026-10-09.
 *
 * Two queue residues were recorded separately and said to share one mechanism
 * ("a bare number defeats an end-anchored whole-string vocabulary"):
 *
 *   (A) `103-12 investment entities` — Schedule H line 1c(12)'s own caption,
 *       recorded at 10 rows / 6 crawlable pages, needing `SCHEDULE_H_CAPTION`
 *       to "accept a NUMERIC token".
 *   (B) remedy (c)'s trailing-label residue — recorded at 163 rows / 37 plans /
 *       155,819 ppl, whose named member is Touro's `… companies 693`, where
 *       "a trailing NUMBER defeats the end-anchor" of `isLabelOnlyName`.
 *
 * It measures, per candidate vocabulary addition and over the PUBLISHED AND
 * SERVED population only (`lineups-index` bit 1, then the serving condition
 * from `lib-ledger`, trust acks resolved through their MEMBER plans), what each
 * of the two display surfaces would newly say — because the two surfaces ask
 * different questions of the same predicate: the report's caption arm needs NO
 * type cell, the crawlable page's `captionFiledType` needs ONE.
 *
 * Both tests, for every token:
 *   ALONE          — what does it reach on its own? (detects an INERT arm)
 *   LEAVE-ONE-OUT  — what is lost without it?       (decides whether it ships)
 *
 * THE ANSWER, 2026-10-09, AND NOTHING SHIPPED FROM IT:
 *
 *   (A) and (B) DO NOT SHARE A MECHANISM. (B)'s own named member is already
 *       qualified by `isGenericTypeName`, and the row as filed is defeated at
 *       the START of the string by a welded real fund name, not at the end by
 *       a number. The widening gains 0 and would reach Capital Manor's
 *       target-date vintages, which `isLabelOnlyName`'s own pin already
 *       refuses. 28 rows / 13 acks / 95,561 ppl examined.
 *   (A) IS A PARSER DEFECT, not a vocabulary gap. The widening moves 8 rows /
 *       405,863 ppl, needs TWO additions rather than the one the register
 *       named (`entit(y|ies)` as well as the numeric literal — each ALONE
 *       reaches 0), and SEVEN of the 8 rows are N real named funds welded into
 *       one because the description column, holding Schedule H's own item
 *       caption, beat the identity column. Verified by exact arithmetic
 *       against four filings.
 *
 * Both refusals are pinned as must-KEEP controls in `lib-disclose.mjs`, with
 * the evidence, so a future widening throws rather than republishing this.
 *
 *   node scripts/size-caption-numeric.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { loadPlans } from "./lib-schema.mjs";
import { buildRenderer } from "./apppath.mjs";
import { servedLineup } from "./lib-ledger.mjs";
import { cleanFiledName, hasNoFundIdentity, isLabelOnlyName, isSentenceRow,
  isNamelessFundRow, captionFiledType, isDirectionCaptionRow, isOfficeListRow,
  isPageBreakCaptionRow, isLoanDescriptionRow } from "./lib-disclose.mjs";
import { isGenericTypeName } from "./lib-4i.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/* ---------- the two vocabularies, rebuilt from the SHIPPED source text ----------
 * Sliced, never transcribed: this record carries seven incomplete
 * transcriptions of shipped expressions, each of which produced a wrong
 * published figure. The point of slicing here is that a candidate addition can
 * be injected into the REAL fragment. */
const LD = readFileSync(`${ROOT}/scripts/lib-disclose.mjs`, "utf8");
function sliceConst(name, kind) {
  /* the whole `const NAME = ...;` statement, which may span lines */
  const a = LD.indexOf(`const ${name} =`);
  if (a < 0) throw new Error(`size-caption-numeric: ${name} not found in lib-disclose.mjs`);
  const b = LD.indexOf("\n};", a) >= 0 && kind === "obj" ? LD.indexOf("\n};", a) + 3 : null;
  /* statements here end at the first line that ends in `;` at depth 0 — all
   * three targets are simple string/regex concatenations */
  let i = a, depth = 0;
  for (; i < LD.length; i++) {
    const c = LD[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === ";" && depth === 0) break;
  }
  return LD.slice(a, i + 1);
}
const SRC_CAPTION_WORD = sliceConst("CAPTION_WORD");
const SRC_CAPTION_SEP = sliceConst("CAPTION_SEP");
const SRC_LABEL_ONLY_WORD = sliceConst("LABEL_ONLY_WORD");
const SRC_LABEL_ONLY_PAGE_REF = sliceConst("LABEL_ONLY_PAGE_REF");

/* a caption predicate with `extra` alternatives spliced into CAPTION_WORD */
function mkCaption(extra) {
  const src = `
${SRC_CAPTION_WORD}
${SRC_CAPTION_SEP}
const W = ${JSON.stringify(extra)} ? CAPTION_WORD.replace(/\\)$/, "|" + ${JSON.stringify(extra)} + ")") : CAPTION_WORD;
const RE = new RegExp("^(?:" + CAPTION_SEP + ")?" + W
  + "(?:" + CAPTION_SEP + W + ")*(?:" + CAPTION_SEP + ")?$", "i");
globalThis.__t = (s) => RE.test(String(s == null ? "" : s));
`;
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.__t;
}
/* a label-only predicate, with `extraRest` alternatives added to the
 * TOLERATED-REMAINDER test (the page-ref arm's slot) */
function mkLabelOnly(extraRest) {
  const src = `
${SRC_LABEL_ONLY_WORD}
${SRC_LABEL_ONLY_PAGE_REF}
const EXTRA = ${extraRest ? `/${extraRest}/i` : "null"};
globalThis.__t = function (name) {
  const w = String(name == null ? "" : name).trim().split(/\\s+/).filter(Boolean);
  if (!w.length) return false;
  let i = 0;
  while (i < w.length && LABEL_ONLY_WORD.test(w[i])) i++;
  if (!i) return false;
  const rest = w.slice(i).join(" ");
  return !rest || LABEL_ONLY_PAGE_REF.test(rest) || !!(EXTRA && EXTRA.test(rest));
};
`;
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.__t;
}

/* ---------- THE MOTIVATING FIXTURES, ASSERTED BEFORE ANY COUNT ----------
 * A measurement that cannot see its own motivating example has not been
 * scoped, and an implausible number read before the pin is a number that gets
 * published. */
const SHIPPED_CAPTION = mkCaption("");
for (const [s, want, why] of [
  ["103-12 INVESTMENT ENTITY", false, "Verizon, $164,190,569 — the motivating row, BLOCKED today"],
  ["CORPORATE STOCK - COMMON", true, "the shipped predicate still works — a positive control on the SLICE"],
  ["500 Index Fund", false, "the register's warning case: `index` and `fund` are absent from this vocabulary"],
]) if (SHIPPED_CAPTION(s) !== want) throw new Error(`size-caption-numeric: the sliced caption predicate is not the shipped one on ${JSON.stringify(s)} (${why})`);

const SHIPPED_LABEL = mkLabelOnly("");
for (const [s, want, why] of [
  ["Registered investment companies 693", false, "the (B) shape, BLOCKED today by its trailing number"],
  ["Registered Investment Companies (Page 166)", true, "the shipped page-ref arm — a positive control on the SLICE"],
  ["FID SEL UTILITIES Registered investment companies 693", false, "Touro AS FILED: it does not START with a label word"],
]) if (SHIPPED_LABEL(s) !== want) throw new Error(`size-caption-numeric: the sliced label predicate is not the shipped one on ${JSON.stringify(s)} (${why})`);

/* and that the candidate additions reach what they are for */
const CAP_NARROW = "103\\-12";
const CAP_ENT = "entit(?:y|ies)";
if (!mkCaption(`${CAP_ENT}|${CAP_NARROW}`)("103-12 INVESTMENT ENTITY"))
  throw new Error("size-caption-numeric: the candidate caption addition does not reach Verizon's row — the arm is broken, not inert");
if (mkCaption(`${CAP_ENT}|${CAP_NARROW}`)("500 Index Fund"))
  throw new Error("size-caption-numeric: the candidate caption addition reaches `500 Index Fund`");

/* ---------- the published + served pool (the gen-sec-tickers shape) ---------- */
const APP = readFileSync(`${ROOT}/app.js`, "utf8");
function sliced(re, what) {
  const m = APP.match(re);
  if (!m) throw new Error(`size-caption-numeric: ${what} not found in app.js`);
  return m;
}
const ID_ONLY = vm.runInNewContext(sliced(/^ {2}const ID_ONLY = (.*);$/m, "ID_ONLY")[1]);
if (!ID_ONLY.test("CUSIP: 922908363") || ID_ONLY.test("Vanguard 500 Index Fund"))
  throw new Error("size-caption-numeric: the ID_ONLY slice does not behave like ID_ONLY");
const COST_MARKER = vm.runInNewContext(
  sliced(/f\.nameRaw = f\.name\.replace\((\/(?:\\.|[^/\\])+\/[a-z]*), ""\)/, "cost-marker strip")[1]);

const idxFile = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8"));
if (!idxFile.plans) throw new Error("size-caption-numeric: lineups-index.json has no .plans map");
const INDEX = idxFile.plans;
const d = loadPlans();
const members = new Map();
for (const r of d.rows) {
  const o = { sponsorName: d.get(r, "sponsorName"), ein: d.get(r, "ein"), pn: d.get(r, "pn"),
    ticker: d.get(r, "ticker"), ppl: d.get(r, "partEOY") || d.get(r, "participants") || 0,
    ack: d.get(r, "ack"), mtiaAck: d.get(r, "mtiaAck"), assetsEOY: d.get(r, "assetsEOY") || 0 };
  for (const a of [o.ack, o.mtiaAck]) {
    if (!a) continue;
    if (!members.has(a)) members.set(a, []);
    members.get(a).push(o);
  }
}
const servedBy = (m) => servedLineup(m, INDEX).ack;

/* ---------- the two surfaces' verdicts, composed as the call sites compose them ----------
 * app.js / the report: `isNamelessFundRow`'s caption arm, gated on NO type cell
 * and (at the call site) on the issuer. The crawlable page: ALSO
 * `captionFiledType`, which needs a type cell and is LAST in the chain.
 * The `capFn` argument is what the candidate vocabulary changes; everything
 * else is the shipped composition. */
function verdicts(f, nm, capFn) {
  const iss = String(f.iss || "").replace(/\*+/g, "").trim();
  const issGeneric = (n) => isGenericTypeName(n) || hasNoFundIdentity(n);
  const nameGeneric = (n) => issGeneric(n) || isLabelOnlyName(n) || isSentenceRow(n);
  /* isNamelessFundRow with the CANDIDATE caption predicate: its own caption arm
   * is `!type.trim() && isScheduleHCaption(name)`, so re-express it here with
   * capFn and keep every early return by delegating the rest to the shipped
   * function with a never-firing caption (type forced non-empty is wrong — it
   * changes the employer-stock path). Instead: ask the shipped function, then
   * OR in the candidate arm, which is a superset by construction because the
   * shipped function's own arm is the same expression with the shipped
   * predicate. The early returns are re-applied explicitly. */
  const type = String(f.type || "");
  const shippedNameless = isNamelessFundRow(f, nm, nameGeneric);
  let capArm = false;
  if (!/^subtotal \(not a holding\)$/i.test(type) && !/brokerage window/i.test(type)
      && !/company stock|employer (security|stock)/i.test(type + " " + nm)
      && !type.trim() && capFn(nm)) capArm = true;
  const namelessName = shippedNameless || capArm;
  const nameless = (!iss || issGeneric(iss))
    && (namelessName || isDirectionCaptionRow(nm) || isOfficeListRow(nm) || isPageBreakCaptionRow(nm));
  const descLoan = isLoanDescriptionRow(nm);
  /* captionFiledType, re-expressed with the candidate predicate (its shipped
   * body is: a type, no naming issuer, and the caption test) */
  const capType = (nameless || descLoan) ? ""
    : (!type.trim() ? "" : (iss && !issGeneric(iss)) ? "" : (capFn(nm) ? type.trim() : ""));
  return { nameless, capType, descLoan };
}

const { renderRow, clean, setPlans } = buildRenderer();
setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

/* ---------- walk ---------- */
const CANDIDATES = {
  "ship (entity|entities + 103-12 literal)": `${CAP_ENT}|${CAP_NARROW}`,
  "entity|entities ALONE": CAP_ENT,
  "103-12 literal ALONE": CAP_NARROW,
  "WIDE bare 103|12 + entity": `${CAP_ENT}|103|12`,
  "WIDE any 1-4 digit run + entity": `${CAP_ENT}|\\d{1,4}`,
};
const capFns = new Map([["shipped", SHIPPED_CAPTION]]);
for (const [k, v] of Object.entries(CANDIDATES)) capFns.set(k, mkCaption(v));

const moved = new Map();            // candidate -> rows[]
for (const k of capFns.keys()) moved.set(k, []);
let rows = 0, pool = 0;
/* (B)'s own census, collected in the same pass */
const labelTrailNum = [];
const TRAIL_NUM = /\s\d[\d,]*$/;

for (let s = 0; s < 64; s++) {
  const file = `${ROOT}/data/lineups/${String(s).padStart(2, "0")}.json`;
  if (!existsSync(file)) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) {
    const all = members.get(ack);
    if (!all || !e.funds || !e.funds.length) continue;
    if (((INDEX[ack] || 0) & 1) !== 1) continue;
    const mem = all.filter((m) => servedBy(m) === ack);
    const ppl = mem.reduce((a, m) => a + m.ppl, 0);
    if (!mem.length || ppl <= 0) continue;
    const lead = mem.slice().sort((a, b) => b.ppl - a.ppl)[0];
    const funds = e.funds.map((x) => {
      const nameRaw = String(x.name || "").replace(COST_MARKER, "").trim();
      return { ...x, nameRaw, name: clean(nameRaw) };
    }).filter((x) => !ID_ONLY.test(x.name || ""));
    const total = funds.reduce((a, x) => a + (+x.value || 0), 0);
    pool++;
    for (const f of funds) {
      rows++;
      const nm = f.name;
      const base = verdicts(f, nm, SHIPPED_CAPTION);
      for (const [k, fn] of capFns) {
        if (k === "shipped") continue;
        const v = verdicts(f, nm, fn);
        if (v.nameless !== base.nameless || v.capType !== base.capType) {
          moved.get(k).push({ ack, nm, raw: f.nameRaw, type: f.type || "", iss: f.iss || "",
            value: +f.value || 0, ppl, mem: mem.length, sponsor: lead.sponsorName,
            pct: total ? (f.value / total) * 100 : 0,
            before: base, after: v,
            r: (() => { const r = renderRow(lead, f, "menu", total); return { tk: r.tk, er: r.er, star: r.star, shownType: r.shownType, name: r.name }; })(),
          });
        }
      }
      /* (B): a SHOWN name that would be label-only but for a trailing number */
      if (!SHIPPED_LABEL(nm) && TRAIL_NUM.test(nm) && SHIPPED_LABEL(nm.replace(TRAIL_NUM, ""))) {
        labelTrailNum.push({ ack, nm, raw: f.nameRaw, type: f.type || "", iss: f.iss || "",
          value: +f.value || 0, ppl, sponsor: lead.sponsorName,
          pct: total ? (f.value / total) * 100 : 0,
          alreadyNameless: base.nameless, capType: base.capType });
      }
    }
  }
}

const sum = (xs, k) => xs.reduce((a, x) => a + (x[k] || 0), 0);
const uniq = (xs, k) => new Set(xs.map((x) => x[k])).size;
function report(title, xs) {
  const plans = new Set(); let ppl = 0;
  for (const x of xs) { if (!plans.has(x.ack)) { plans.add(x.ack); } }
  /* participants: a plan counted ONCE even if several of its rows move */
  const byAck = new Map();
  for (const x of xs) if (!byAck.has(x.ack)) byAck.set(x.ack, x.ppl);
  ppl = [...byAck.values()].reduce((a, b) => a + b, 0);
  console.log(`\n${title}`);
  console.log(`  rows ${xs.length}  acks ${byAck.size}  participants ${ppl.toLocaleString()}  $${sum(xs, "value").toLocaleString()}  distinct names ${uniq(xs, "nm")}`);
}

console.log(`pool: ${pool} published+served entries, ${rows.toLocaleString()} rows`);
for (const [k, xs] of moved) {
  if (k === "shipped") continue;
  report(`CANDIDATE  ${k}`, xs);
}

/* LEAVE-ONE-OUT on the shipping set */
console.log("\n--- leave-one-out on the shipping set ---");
const shipSet = moved.get("ship (entity|entities + 103-12 literal)");
const aloneEnt = new Set(moved.get("entity|entities ALONE").map((x) => x.ack + "\u0000" + x.nm));
const aloneNum = new Set(moved.get("103-12 literal ALONE").map((x) => x.ack + "\u0000" + x.nm));
let needBoth = 0, onlyEnt = 0, onlyNum = 0;
for (const x of shipSet) {
  const k = x.ack + "\u0000" + x.nm;
  if (aloneEnt.has(k)) onlyEnt++; else if (aloneNum.has(k)) onlyNum++; else needBoth++;
}
console.log(`  of ${shipSet.length} moved rows: reachable by entity alone ${onlyEnt}, by the numeric literal alone ${onlyNum}, needing BOTH ${needBoth}`);

console.log("\n--- the shipping set, every row ---");
for (const x of shipSet.sort((a, b) => b.ppl - a.ppl)) {
  console.log(`  ${x.sponsor} | ppl ${x.ppl} | ${x.pct.toFixed(1)}% | $${x.value.toLocaleString()} | type=${JSON.stringify(x.type)} iss=${JSON.stringify(x.iss)}`);
  console.log(`      name=${JSON.stringify(x.nm)}  nameless ${x.before.nameless}->${x.after.nameless}  capType ${JSON.stringify(x.before.capType)}->${JSON.stringify(x.after.capType)}`);
  console.log(`      render: tk=${JSON.stringify(x.r.tk)} er=${JSON.stringify(x.r.er)} star=${x.r.star} shownType=${JSON.stringify(x.r.shownType)}  ack=${x.ack}`);
}

/* THE PRICE OF THE WIDE FORM. `CAPTION_SEP` includes `-`, so `103-12`
 * tokenises as `103` + sep + `12`; a bare-digit-run alternative would admit
 * ANY name made of digits plus caption words. Print exactly what the wide form
 * adds over the narrow literal, so the refusal is measured and not asserted. */
console.log("\n--- what the WIDE \\d{1,4} form adds over the narrow `103-12` literal ---");
const narrowKeys = new Set(shipSet.map((x) => x.ack + "\u0000" + x.nm));
const wideExtra = moved.get("WIDE any 1-4 digit run + entity").filter((x) => !narrowKeys.has(x.ack + "\u0000" + x.nm));
report("WIDE extras", wideExtra);
for (const x of wideExtra.sort((a, b) => b.ppl - a.ppl)) {
  console.log(`  ${x.sponsor} | ppl ${x.ppl} | ${x.pct.toFixed(1)}% | $${x.value.toLocaleString()} | type=${JSON.stringify(x.type)} iss=${JSON.stringify(x.iss)}`);
  console.log(`      ${JSON.stringify(x.nm)}  nameless ${x.before.nameless}->${x.after.nameless}  capType ${JSON.stringify(x.before.capType)}->${JSON.stringify(x.after.capType)}  tk=${JSON.stringify(x.r.tk)} er=${JSON.stringify(x.r.er)}  ack=${x.ack}`);
}

console.log("\n--- (B) a shown name that would be LABEL-ONLY but for a trailing number ---");
report("(B) candidates", labelTrailNum);
for (const x of labelTrailNum.sort((a, b) => b.ppl - a.ppl)) {
  console.log(`  ${x.sponsor} | ppl ${x.ppl} | ${x.pct.toFixed(1)}% | $${x.value.toLocaleString()} | type=${JSON.stringify(x.type)} iss=${JSON.stringify(x.iss)} alreadyNameless=${x.alreadyNameless} capType=${JSON.stringify(x.capType)}`);
  console.log(`      ${JSON.stringify(x.nm)}   ack=${x.ack}`);
}
