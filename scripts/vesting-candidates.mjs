/* DOES THE FILING STATE A VESTING SCHEDULE THE EXTRACTOR MISSED?
 *
 * Written fresh rather than patched, because the previous copy was edited
 * through a Python NON-RAW string and every `\b` became a literal backspace —
 * so `\bForm 5500\b` compiled to an unmatchable pattern and the Schedule R
 * form text kept coming through as a "candidate". Its fixtures passed anyway,
 * because the one case they pinned (line 6g(2)) was caught by the DOTTED-LEADER
 * arm instead: *a case protected twice proves neither*, met on my own control.
 *
 * THE ORACLE IS THE SHIPPED GUARD: a sentence `vestingQuoteOk` ACCEPTS that
 * carries a vest word is a candidate a better selection could legitimately
 * publish; one it REJECTS is one the selection must not pick. Nothing new is
 * judged here — except that the FORM's own printed questions are excluded,
 * since they are the blank form and identical on every filing. */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { vestingQuoteOk } from "./lib-quote.mjs";
import { loadPlans } from "./lib-schema.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const ARMS = [
  ["dotted leaders", /\.{5,}/],
  ["digit-box filler", /123456789012/],
  ["a form line reference", /\b\d[a-z]\(\d\)/],
  ["the form's own 6g wording", /\bNumber of participants who\b/i],
  ["a form/schedule footer", /\b(?:Form|Schedule [A-Z]\b.{0,20})5500\b/i],
  ["the Schedule R line-14 question", /\bnumber of deferred vested\b/i],
  ["an OMB header", /\bOMB No\b/i],
  /* A CHECKBOX-RUN ARM WAS DROPPED HERE, by its own fixture. Schedule R's
   * "X Hourly X Weekly X Unit of production" separates the X's with words, so
   * `(?:\bX\s+){3}` never matched it — and the real string is caught by the
   * line-14 arm anyway. An arm I cannot give a case where it stands ALONE is
   * untested machinery, so it is not in the list. */
];
const isForm = (s) => ARMS.some(([, re]) => re.test(s));
/* EVERY ARM GETS A CASE WHERE IT IS THE ONLY PROTECTION, found by asking which
 * other arms also fire. An arm that never stands alone proves nothing. */
const SOLO = [
  ["Benefits are paid when a participant terminates employment with a vested balance...............", "dotted leaders"],
  ["Participants are vested per the schedule 123456789012 as filed", "digit-box filler"],
  ["See line 6g(2) for the number of partially vested terminations", "a form line reference"],
  ["Number of participants who left with less than full vested benefits", "the form's own 6g wording"],
  ["Schedule R (Form 5500) 2024 Page 3 reports vested participants", "a form/schedule footer"],
  ["Enter the number of deferred vested and retired participants here", "the Schedule R line-14 question"],
  ["OMB No 1210-0110 vested participant counts", "an OMB header"],
];
for (const [s, want] of SOLO) {
  const fired = ARMS.filter(([, re]) => re.test(s)).map(([n]) => n);
  if (!fired.includes(want)) throw new Error(`the arm "${want}" does not reach its own case: ${JSON.stringify(s)}`);
  if (fired.length !== 1) throw new Error(`"${want}" is protected ${fired.length}x on its own case (${fired.join(", ")}) — it proves nothing; pick a case where it stands alone`);
}
for (const s of ["Employer contributions vest 20% per year of service and are fully vested after five years.",
  "Vesting All Participants are 100% vested in the Plan from the first date of hire.",
  "Percentage Years of completed service vested Less than 2 years of service None 2 years of service 20 % 3 years of service 50"])
  if (isForm(s)) throw new Error(`the exclusion rejects a real vesting sentence: ${JSON.stringify(s)}`);
console.log(`form-boilerplate exclusion: ${ARMS.length} arms, each reaching its own case ALONE, and 3 real vesting sentences spared (1 arm dropped by its own fixture)\n`);

/* NEVER HARDCODE THE SANDBOX PATH IN A TRACKED SCRIPT: a session scratchpad
 * directory is session-specific and gitignored, and this record already cost
 * three days to a hardcoded `cwd` that made Node report `spawn python3 ENOENT`.
 * Default to a sibling of the repo, overridable. */
const CACHE = process.env.VESTING_PDF_CACHE || (ROOT + "/.vesting-pdf-cache");
mkdirSync(CACHE, { recursive: true });
const R = ROOT;
const d = loadPlans();
const members = new Map();
for (const r of d.rows) {
  const o = { id: `${d.get(r, "ein")}|${d.get(r, "pn")}`, who: d.get(r, "sponsorName"),
    ppl: d.get(r, "partEOY") || d.get(r, "participants") || 0 };
  for (const a of [d.get(r, "ack"), d.get(r, "mtiaAck")]) {
    if (!a) continue;
    if (!members.has(a)) members.set(a, []);
    members.get(a).push(o);
  }
}
const targets = [];
for (let s = 0; s < 64; s++) {
  const fp = `${R}/data/lineups/${String(s).padStart(2, "0")}.json`;
  if (!existsSync(fp)) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(fp, "utf8")))) {
    const f = e.features || {};
    if (!f.vestingText || String(f.vesting || "").trim()) continue;
    if (vestingQuoteOk(String(f.vestingText))) continue;
    const mem = members.get(ack) || [];
    targets.push({ ack, text: String(f.vestingText), mem,
      ppl: mem.reduce((a, m) => a + m.ppl, 0), who: (mem[0] || {}).who || "(no plan)" });
  }
}
console.log(`${targets.length} withheld entries to read (the whole population, not a sample)\n`);

const url = (a) => `https://efast2-filings-public.s3.amazonaws.com/prd/${a.slice(0, 4)}/${a.slice(4, 6)}/${a.slice(6, 8)}/${a}.pdf`;
/* A deliberately GENEROUS split: a missed boundary merges two sentences, which
 * makes the guard MORE likely to reject, so the yield below is a FLOOR. */
const sentences = (t) => String(t).replace(/\s+/g, " ").split(/(?<=[.;:])\s+(?=[A-Z("“]|\d)/);
const VEST_WORD = /\bvest(?:s|ed|ing)?\b|\bforfeit/i;
/* vesting ARITHMETIC — a ladder, a cliff, or an explicit 100% — is what makes a
 * candidate worth publishing rather than merely acceptable. */
const ARITHMETIC = /\d{1,3}\s?%|\bpercent\b|\b(?:one|two|three|four|five|six)\s+years?\b|\bimmediate(?:ly)?\b|\bfirst date of hire\b|\ball times\b/i;

const rows = [];
for (const t of targets) {
  const pdf = `${CACHE}/${t.ack}.pdf`, txt = `${CACHE}/${t.ack}.txt`;
  try {
    if (!existsSync(txt)) {
      if (!existsSync(pdf)) {
        execFileSync("curl", ["-sS", "-f", "--max-time", "60", "-o", pdf, url(t.ack)], { stdio: ["ignore", "ignore", "pipe"] });
        await new Promise((r) => setTimeout(r, 400));
      }
      execFileSync("pdftotext", ["-layout", pdf, txt], { stdio: ["ignore", "ignore", "pipe"] });
    }
  } catch { rows.push({ ...t, err: "download/convert" }); continue; }
  const text = readFileSync(txt, "utf8");
  if (text.replace(/\s/g, "").length < 2000) { rows.push({ ...t, err: "no readable text (scanned?)" }); continue; }
  const same = t.text.replace(/\s+/g, " ");
  const cands = sentences(text).filter((s) => s.length > 40 && s.length < 600
    && VEST_WORD.test(s) && !isForm(s) && vestingQuoteOk(s) && s.replace(/\s+/g, " ") !== same);
  const withMath = cands.filter((s) => ARITHMETIC.test(s));
  rows.push({ ...t, cands, withMath });
}
const tally = (xs) => {
  const ids = new Set(); let ppl = 0;
  for (const x of xs) for (const m of x.mem) if (!ids.has(m.id)) { ids.add(m.id); ppl += m.ppl; }
  return `${xs.length} plans / ${ppl.toLocaleString()} ppl`;
};
const read = rows.filter((x) => !x.err);
const math = read.filter((x) => x.withMath.length);
const anyOnly = read.filter((x) => x.cands.length && !x.withMath.length);
const none = read.filter((x) => !x.cands.length);
console.log(`read ${read.length}, unreadable ${rows.length - read.length}`);
console.log(`  a candidate stating vesting ARITHMETIC exists: ${tally(math)}`);
console.log(`  a candidate exists but states NO arithmetic:   ${tally(anyOnly)}`);
console.log(`  NO candidate at all — withholding is complete: ${tally(none)}`);
/* CLASSIFY THE BEST CANDIDATE BY WHAT IT ACTUALLY SAYS. Counting "a candidate
 * exists" reads 35 plans and is NOT the yield: ranked by acceptance alone,
 * Charter's best is "immediately vested in their voluntary contributions" and
 * Brown's is "vested in the portion attributable to their employee
 * contributions" — employee money is vested BY LAW in every 401(k), so those
 * are true, useless, and would be published as the plan's answer to 133,044
 * readers. The selection rules below are read off that evidence. */
const EMPLOYEE_SCOPE = /\b(?:their own|employee|participant'?s?|voluntary|elective|salary[- ]defer|pre-?tax|roth|after-?tax)\b[^.]{0,60}\bcontribution/i;
const EMPLOYER_SCOPE = /\b(?:employer|company|matching|match|nonelective|non-?elective|profit[- ]sharing|discretionary)\b/i;
const LADDER = /\d{1,3}\s?%[^.]{0,60}(?:year|anniversar)|(?:year|anniversar)[^.]{0,60}\d{1,3}\s?%|\bless than \d\b[^.]{0,40}\d{1,3}\s?%|\bcliff\b/i;
const IMMEDIATE = /\b(?:immediate(?:ly)?|at all times|fully vested|100\s?%\s*vested|first date of hire)\b/i;
/* another named rule wearing a percentage: a loan clause trailing a ladder, a
 * contribution-by-AGE table (UCB files `21-24 3.5% / 25-34 4.0%`), forfeiture
 * accounting. The guard accepts these; the RANKING must still demote them. */
const OTHER_RULE = /\bborrow\b|\bloan\b|\bminimum of \$|\bmaximum equal to\b|Contribution Age|\bcontract value\b/i;
const rank = (x) => (OTHER_RULE.test(x) ? -5 : 0) + (LADDER.test(x) ? 4 : 0)
  + (EMPLOYER_SCOPE.test(x) ? 2 : 0) + (IMMEDIATE.test(x) ? 1 : 0) + (EMPLOYEE_SCOPE.test(x) ? -2 : 0);
const classify = (best) => !best ? "none"
  : OTHER_RULE.test(best) ? "another rule (loan / contribution table / garble)"
  : LADDER.test(best) ? "a LADDER or CLIFF is available"
  : IMMEDIATE.test(best) ? "unqualified IMMEDIATE vesting is available"
  : "accepted but says nothing useful";
for (const x of read) { x.ranked = x.cands.slice().sort((a, b) => rank(b) - rank(a)); x.kind = classify(x.ranked[0] || ""); }
const buckets = new Map();
for (const x of read) { if (!buckets.has(x.kind)) buckets.set(x.kind, []); buckets.get(x.kind).push(x); }
const USABLE = ["a LADDER or CLIFF is available", "unqualified IMMEDIATE vesting is available"];
const usable = read.filter((x) => USABLE.includes(x.kind));
console.log(`\nCLASSIFIED by what the best candidate SAYS (this, not "a candidate exists", is the yield):`);
for (const [k, xs] of [...buckets.entries()].sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${String(xs.length).padStart(3)}  ${tally(xs).padEnd(26)} ${k}`);
console.log(`\n  PUBLISHABLE TOTAL: ${tally(usable)}  of  ${tally(read)} read`);
console.log(`\n  every publishable plan, largest first:`);
for (const x of usable.sort((a, b) => b.ppl - a.ppl))
  console.log(`    ${String(x.ppl).padStart(7)} ppl  ${String(x.who).slice(0, 28).padEnd(29)} ${JSON.stringify(x.ranked[0].replace(/\s+/g, " ").slice(0, 120))}`);

console.log(`\nTHE BEST ARITHMETIC CANDIDATE PER PLAN, largest first:`);
for (const x of math.sort((a, b) => b.ppl - a.ppl))
  console.log(`\n  ${String(x.ppl).padStart(7)} ppl  ${x.who}  (${x.withMath.length} of ${x.cands.length} carry arithmetic)\n     BEST: ${JSON.stringify(x.withMath[0].replace(/\s+/g, " ").slice(0, 220))}`);
for (const x of anyOnly.sort((a, b) => b.ppl - a.ppl))
  console.log(`\n  ${String(x.ppl).padStart(7)} ppl  ${x.who}  NO ARITHMETIC, best of ${x.cands.length}:\n     ${JSON.stringify(x.cands[0].replace(/\s+/g, " ").slice(0, 180))}`);
for (const x of none) console.log(`\n  ${String(x.ppl).padStart(7)} ppl  ${x.who}  — NO candidate`);
for (const x of rows.filter((y) => y.err)) console.log(`\n  ${String(x.ppl).padStart(7)} ppl  ${x.who}  — ${x.err}`);
