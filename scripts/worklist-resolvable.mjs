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

/* The normalisers, the registry index, the pins and the graded resolver all
 * live in `lib-fundmatch.mjs`, shared with `fund-facts-issuer.mjs`, because a
 * transcribed copy of a predicate measures the transcription -- the recorded
 * `tkExact` lesson, which cost 1.11 coverage points. `loadRegistry` THROWS on a
 * wrong shape or a missing pin, so a broken index fails by name instead of
 * reporting a clean low number. */
import { loadRegistry, resolve, toks } from "./lib-fundmatch.mjs";

const reg = loadRegistry(path.join(ROOT, "sec-funds.json"));
const work = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-worklist.json"), "utf8")).work;
if (!Array.isArray(work) || !work.length) { console.error("fund-worklist.json: empty"); process.exit(1); }
console.log(`registry: ${reg.rows.toLocaleString()} class rows over ${reg.bySeries.size.toLocaleString()} distinct series; both pins resolve\n`);

const grades = { exact: [], subset: [], nearest: [], ambiguous: [], none: [] };
for (const w of work) {
  const hit = resolve(reg, w.name);
  if (hit.grade === "exact") grades.exact.push({ ...w, hit });
  else if (hit.grade === "subset") grades.subset.push({ ...w, hit });
  else if (hit.grade === "nearest") grades.nearest.push({ ...w, hit, extra: hit.extra });
  else if (hit.grade === "ambiguous") grades.ambiguous.push({ ...w, n: hit.n });
  else grades.none.push(w);
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
