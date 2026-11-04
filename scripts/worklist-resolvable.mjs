#!/usr/bin/env node
/* wampo — HOW MUCH OF THE WORKLIST CAN THE REGISTRY WE ALREADY HAVE NAME?
 *
 * WHY, 2026-11-04. The owner asked whether a J.P. Morgan product URL could be
 * used to find the rest of the SmartRetirement target-date ladder. It can't
 * directly -- the vintage list is drawn after load -- but the question turned
 * out to be the wrong way round: `sec-funds.json` is ALREADY IN THIS REPO with
 * 29,406 registered series/class rows, and it carries all 154 SmartRetirement
 * rows, every vintage and every share class, with tickers.
 *
 * So before building any fetcher, the number that matters is this one: of the
 * top-1,000 filed names that cover 91.2% of readers, how many does that
 * registry already name? A name we can turn into a ticker is a name a
 * ticker-keyed source can price. A name it cannot is the collective-trust
 * population, which needs a CUSIP instead.
 *
 * IT WRITES NOTHING, and it reports in READERS as well as names, because a
 * name held by one plan and a name held by eight thousand are not the same
 * find. The match is graded, from exact down to a token-subset, and each grade
 * is counted SEPARATELY rather than summed into one flattering total -- a
 * looser grade is a weaker claim and the split is the whole point.
 *
 * Run: node scripts/worklist-resolvable.mjs [--examples 20]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const N_EX = +((argv[argv.indexOf("--examples") + 1]) || 20);

const rawSec = JSON.parse(readFileSync(path.join(ROOT, "sec-funds.json"), "utf8"));
const SEC = Array.isArray(rawSec) ? rawSec : rawSec.funds;
if (!Array.isArray(SEC)) { console.error("sec-funds.json: expected a .funds array"); process.exit(1); }
const work = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-worklist.json"), "utf8")).work;
if (!Array.isArray(work) || !work.length) { console.error("fund-worklist.json: empty"); process.exit(1); }

/* `U.S.` NORMALISES TO TWO TOKENS AND THAT ALONE COST A 3,773,459-READER NAME.
 * The registry writes `Fidelity U.S. Bond Index Fund` and filers write
 * `Fidelity US Bond Index Fund`, so a token test sees {U, S} against {US} and
 * matches neither way. Adjacent single-character tokens are therefore welded
 * back together -- which is a fact about an ABBREVIATION, not a guess about a
 * fund, and it is symmetric, applied to both sides. */
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const weld = (s) => s.replace(/\b([A-Z])(?:\s+([A-Z])\b)+/g, (m) => m.replace(/\s+/g, ""));
const toks = (s) => new Set(weld(norm(s)).split(" ").filter(Boolean));

/* Index the registry by the SERIES name (the part after `::`), keeping every
 * class so an ambiguous name can be SEEN as ambiguous rather than silently
 * resolved to whichever class came first -- choosing one would be the recorded
 * wrong-share-class defect arriving by a new route. */
const bySeries = new Map();
for (const r of SEC) {
  const series = String(r[0] || "").split("::").pop().trim();
  const tk = r[1];
  if (!series || !tk) continue;
  const k = norm(series);
  if (!bySeries.has(k)) bySeries.set(k, { series, classes: [] });
  bySeries.get(k).classes.push({ tk, cls: r[3] || "" });
}
const seriesKeys = [...bySeries.keys()];
const seriesToks = seriesKeys.map((k) => ({ k, t: toks(k) }));

/* self-test: the owner's own family must resolve, or this measurement is void */
const PIN = ["JPMORGAN SMARTRETIREMENT 2030 FUND", "FIDELITY 500 INDEX FUND"];
for (const p of PIN) {
  if (!bySeries.has(p)) { console.error(`PIN FAILED: registry has no series "${p}" — index is wrong, not the data`); process.exit(1); }
}
console.log(`registry: ${SEC.length.toLocaleString()} class rows over ${bySeries.size.toLocaleString()} distinct series; both pins resolve\n`);

const grades = { exact: [], subset: [], nearest: [], ambiguous: [], none: [] };
for (const w of work) {
  const n = norm(w.name);
  if (bySeries.has(n)) { grades.exact.push({ ...w, hit: bySeries.get(n) }); continue; }
  /* SUBSET: every token of the filed name appears in the series name. This is
   * the direction that matters -- a filed name is usually an ABBREVIATION of
   * the registered one, never a superset -- and it must be UNIQUE, because
   * several matching series means we do not know which fund it is. */
  const t = toks(w.name);
  if (t.size >= 3) {
    const cand = seriesToks.filter(({ t: st }) => [...t].every((x) => st.has(x)));
    if (cand.length === 1) { grades.subset.push({ ...w, hit: bySeries.get(cand[0].k) }); continue; }
    /* NEAREST, and it is a WEAKER claim kept in its own grade. `Fidelity 500
     * Index` is a subset of both `Fidelity 500 Index Fund` and `Fidelity SERIES
     * 500 Index Fund`, and those are genuinely different funds -- the Series
     * ones exist inside Fidelity's target-date funds. So the tie-break is the
     * FEWEST unexplained extra tokens, and it must be a STRICT minimum: a tie
     * at the minimum is still an unanswered question and goes to `ambiguous`,
     * because picking one would be the recorded wrong-fund defect by a new
     * route. */
    if (cand.length > 1) {
      const scored = cand.map((c) => ({ c, extra: c.t.size - t.size }));
      const best = Math.min(...scored.map((s) => s.extra));
      const at = scored.filter((s) => s.extra === best);
      if (at.length === 1) { grades.nearest.push({ ...w, hit: bySeries.get(at[0].c.k), extra: best }); continue; }
      grades.ambiguous.push({ ...w, n: cand.length });
      continue;
    }
  }
  grades.none.push(w);
}

const sum = (a) => a.reduce((s, x) => s + (+x.readers || 0), 0);
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const total = sum(work);
console.log(`worklist: ${work.length.toLocaleString()} names · ${fmt(total)} readers\n`);
for (const [g, label] of [
  ["exact", "EXACT registry series name"],
  ["subset", "unique token-subset"],
  ["nearest", "nearest series, strictly fewest extras"],
  ["ambiguous", "several series tie — NOT resolved"],
  ["none", "registry says NOTHING"],
]) {
  const a = grades[g];
  console.log(`${label.padEnd(38)} ${String(a.length).padStart(5)} names · ${fmt(sum(a)).padStart(11)} readers (${(sum(a) / total * 100).toFixed(1)}%)`);
}

/* AMBIGUITY IS NOT COVERAGE. A series with several classes gives a ticker only
 * once the filed name states the class, and most do not -- so this is split out
 * rather than folded into the headline. */
/* `nearest` is included because it names ONE series, but it is the weakest
 * grade and is printed separately above so a reader can discount it. */
const resolved = [...grades.exact, ...grades.subset, ...grades.nearest];
const oneClass = resolved.filter((x) => x.hit.classes.length === 1);
const multi = resolved.filter((x) => x.hit.classes.length > 1);
console.log(`\nof the resolved names:`);
console.log(`  series registering ONE class (an unambiguous ticker) ${String(oneClass.length).padStart(5)} names · ${fmt(sum(oneClass)).padStart(11)} readers`);
console.log(`  series registering SEVERAL (class must be stated)    ${String(multi.length).padStart(5)} names · ${fmt(sum(multi)).padStart(11)} readers`);

console.log(`\nlargest RESOLVED (a ticker we could price today):`);
for (const x of resolved.sort((a, b) => b.readers - a.readers).slice(0, N_EX)) {
  const cl = x.hit.classes;
  const show = cl.length === 1 ? cl[0].tk : `${cl.length} classes: ${cl.slice(0, 3).map((c) => c.tk).join("/")}…`;
  console.log(`  ${String(fmt(x.readers)).padStart(10)} ppl  ${show.padEnd(26)} ${x.name.slice(0, 46)}`);
}
console.log(`\nlargest UNRESOLVED (the registry has no such series — mostly collective trusts):`);
for (const x of grades.none.sort((a, b) => b.readers - a.readers).slice(0, N_EX)) {
  console.log(`  ${String(fmt(x.readers)).padStart(10)} ppl  ${x.name.slice(0, 60)}`);
}
console.log(`\nA TICKER IS NOT A FEE. This says how many names we can ADDRESS, not how`);
console.log(`many we can price; whether a ticker-keyed source answers a runner is`);
console.log(`measured separately by scripts/fund-source-probe.mjs.`);
