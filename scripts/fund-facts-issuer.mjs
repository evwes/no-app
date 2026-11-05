#!/usr/bin/env node
/* wampo — SOURCE a fund's expense ratio and YTD return, with a date and a URL.
 *
 * THE CHAIN, AND EVERY LINK OF IT IS MEASURED RATHER THAN ASSUMED:
 *
 *   filed fund name
 *     -> `sec-funds.json`, ALREADY IN THIS REPO (29,406 class rows / 12,440
 *        series). `worklist-resolvable.mjs` measures that it names 35.9% of the
 *        top-1,000 filed names' readers today.
 *     -> a registered TICKER, but only where the class is unambiguous
 *     -> `schwab.wallst.com` research page, which run #8 measured answering a
 *        GitHub runner at 200 with BOTH an expense ratio and a YTD return for
 *        THREE FOREIGN HOUSES -- Fidelity FXAIX, Vanguard VTTVX and JPMorgan
 *        JSMYX -- in about 400ms each. That is what makes it a source rather
 *        than Schwab's own shelf, and SWPPX alone could not have shown it.
 *
 * WHY NOT YAHOO: 429 on runs #1 and #2, 401 on every probe since. Yahoo
 * rate-limits GitHub's runner range outright. WHY NOT THE ISSUERS DIRECTLY:
 * Vanguard answers and Fidelity answers, but T. Rowe Price, Schwab's own
 * product pages, BlackRock's LifePath pages and J.P. Morgan's are either
 * JS-rendered or keyed by a CUSIP we cannot derive -- the owner's own
 * J.P. Morgan URL proved the host is open and that a guessed path 404s
 * indistinguishably from a hostile one.
 *
 * NOTHING UNSOURCED AND NOTHING UNDATED. Every figure written carries the URL
 * it was read from and the as-of date the PAGE states. Where the page states no
 * date the figure is DROPPED rather than stamped with today, because a fee with
 * no date is the thing this project refuses to publish. `fund-facts-check.mjs`
 * enforces the rest.
 *
 * IT MUST RUN ON A RUNNER. In the CCR sandbox every host is ENOTFOUND and
 * `http=000` is a report on the QUERY, not the source -- so this script
 * distinguishes "blocked here" from "no such fund" and never writes a figure it
 * did not read.
 *
 * --explain IS NOT A DEBUG FLAG, IT IS THE CALIBRATION STEP. The extraction
 * patterns below are written against a page shape I have never seen, because
 * the sandbox cannot fetch it. Guessing a pattern and shipping it is how a
 * silent zero gets mistaken for "the source has nothing". So --explain prints
 * the surrounding bytes for each figure it looks for and writes NOTHING, which
 * turns one runner pass into the evidence for the real patterns.
 *
 * Run: node scripts/fund-facts-issuer.mjs [--limit 40] [--dry] [--explain] [--verbose]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, resolve, tickerFor } from "./lib-fundmatch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const one = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (f) => argv.includes(f);
const LIMIT = +one("--limit", "40");
const EXPLAIN = has("--explain");
const DRY = has("--dry") || EXPLAIN;      // --explain never writes
const VERBOSE = has("--verbose") || EXPLAIN;
const UA = "wampo-fund-facts/1.0 (+https://github.com/evwes/no-app)";
/* --tickers VERIFIES A NAMED FUND RATHER THAN WALKING THE WORKLIST, and it
 * exists because of a gap in my own tether: all four of its fixtures are
 * Fidelity INDEX funds with the same page shape and tiny expense ratios. The
 * positional anchor assumes a fixed column order, and an ACTIVE fund's page may
 * carry an extra column (a gross ratio beside the net one), which would shift
 * every field right and read as a plausible figure. FCNTX came back 0.74 where
 * our pattern table says 0.39 and 0.45 -- a 2x gap on a flagship fund is worth
 * one probe before 41,453 published cells move. */
const ONLY = (() => {
  const i = argv.indexOf("--tickers");
  if (i < 0) return null;
  return argv.slice(i + 1).filter((a) => !a.startsWith("--")).map((t) => t.toUpperCase());
})();

const reg = loadRegistry(path.join(ROOT, "sec-funds.json"));
const work = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-worklist.json"), "utf8")).work;
const factsPath = path.join(ROOT, "data", "fund-facts.json");
const facts = existsSync(factsPath) ? JSON.parse(readFileSync(factsPath, "utf8")) : { funds: {}, vehicles: {} };
facts.funds ||= {}; facts.vehicles ||= {};
console.log(`registry ${reg.rows.toLocaleString()} class rows / ${reg.bySeries.size.toLocaleString()} series; worklist ${work.length} names\n`);

const schwab = (tk) =>
  `https://www.schwab.wallst.com/schwab/Prospect/research/mutualfunds/summary.asp?symbol=${encodeURIComponent(tk)}`;

async function get(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(25000), redirect: "follow" });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body, bytes: body.length };
  } catch (e) {
    const why = `${e.message} ${e.cause?.code || ""}`;
    const blocked = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|CERT|timeout|aborted|fetch failed/i.test(why);
    return { ok: false, status: 0, body: "", bytes: 0, blocked, err: why.trim().slice(0, 70) };
  }
}

/* ---- extraction ----------------------------------------------------------
 * Tags are stripped first, because a figure and its label are routinely in
 * different cells and a window measured in raw HTML is mostly markup. */
const detag = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;?/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ");

/* LABEL PROXIMITY IS REFUTED AND MUST NOT COME BACK. Run #9's --explain pass
 * showed this page puts ALL the labels first and ALL the values after, so the
 * first percentage following "Net Expense Ratio" is the DAY'S PRICE CHANGE:
 *
 *   Net Expense Ratio YTD Return <help text> $263.13 +0.96 (0.37%) 0.015% 12.73%
 *
 * A proximity read gave FXAIX er=0.37 and ytd=0.37 where the truth is 0.015
 * and 12.73, and it was WRONG THE SAME WAY on all four funds it reached --
 * every one plausible, dated and sourced. So the anchor is the VALUE GROUP's
 * own structure: price, change, change-in-parens, then expense ratio, then YTD.
 * Position is the only thing here that distinguishes a fee from a day's move.
 *
 * There is deliberately NO fallback to proximity. A refuted pattern kept as a
 * fallback is a refuted pattern that still ships, and this one fails in the
 * direction that publishes a confident wrong number. A page that does not match
 * is reported as a miss instead. */
const QUOTE_GROUP = /\$\s?([\d,]+\.\d{2})\s+([-+]?[\d.]+)\s+\(\s*([-+]?[\d.]+)\s*%\s*\)\s+([\d.]+)\s*%\s+([-+]?[\d.]+)\s*%/;
const AS_OF = /Quote\s+data\s+as\s+of\s+(?:close\s+)?(\d{2}\/\d{2}\/\d{4})/i;
const DATE_ANY = /(?:as\s+of\s*)?(\d{2}\/\d{2}\/\d{4})|(\d{4}-\d{2}-\d{2})|([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/;
/* An index fund's expense ratio is basis points, not tens of percent. The bound
 * is loose on purpose -- some retail classes really do charge over 2% -- and it
 * exists to catch a column shift rather than to judge a fee. */
const ER_MAX = 5;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function isoDate(m) {
  if (!m) return null;
  if (m[1]) { const [mm, dd, yy] = m[1].split("/"); return `${yy}-${mm}-${dd}`; }
  if (m[2]) return m[2];
  if (m[3]) {
    const p = /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/.exec(m[3]);
    const mo = MONTHS[p[1].slice(0, 3).toLowerCase()];
    if (!mo) return null;
    return `${p[3]}-${String(mo).padStart(2, "0")}-${String(+p[2]).padStart(2, "0")}`;
  }
  return null;
}

function extract(text, url) {
  const out = { src: url };
  const g = QUOTE_GROUP.exec(text);
  if (!g) {
    out._win = "(the quote value group did not match — layout may have changed)";
    return out;
  }
  const [, price, chg, chgPct, erPct, ytdPct] = g;
  out._win = text.slice(Math.max(0, g.index - 150), g.index + g[0].length + 60);
  const date = isoDate(AS_OF.exec(text) || DATE_ANY.exec(out._win));
  const er = +erPct, ytd = +ytdPct;
  out._er = er; out._ytd = ytd; out._chgPct = +chgPct; out._price = price;

  /* THE CONTROL THAT THE COLUMNS ARE THE COLUMNS. If the "expense ratio" we
   * read equals the day's price change, we are reading the quote again -- the
   * exact run #9 defect -- so refuse rather than publish it. */
  if (er === +chgPct && ytd === +chgPct) { out._reject = "er and ytd both equal the day's change — reading the quote, not the table"; return out; }
  if (!(er >= 0 && er <= ER_MAX)) { out._reject = `expense ratio ${er}% outside 0-${ER_MAX}% — probably a column shift`; return out; }

  /* A FIGURE WITHOUT A DATE IS NOT WRITTEN. Kept under `_` so the report can
   * say "read it but dropped it", which is a different finding from "the page
   * does not carry it" -- and the two have different remedies. */
  if (date) { out.er = er; out.erAsOf = date; out.ytd = ytd; out.ytdAsOf = date; }
  out._erAsOf = date; out._ytdAsOf = date;
  return out;
}

/* ---- the run -------------------------------------------------------------- */
const rep = { names: 0, noTicker: 0, tried: 0, reached: 0, blocked: 0,
  er: 0, ytd: 0, erNoDate: 0, ytdNoDate: 0, rejected: 0, wrote: 0, byGrade: {} };
const today = new Date().toISOString().slice(0, 10);
const misses = [];

const QUEUE = ONLY
  ? ONLY.map((tk) => ({ name: `(--tickers ${tk})`, readers: 0, _tk: tk }))
  : work.slice(0, LIMIT);
for (const w of QUEUE) {
  rep.names++;
  const hit = w._tk ? { grade: "exact", series: w.name, classes: [] } : resolve(reg, w.name);
  rep.byGrade[hit.grade || "none"] = (rep.byGrade[hit.grade || "none"] || 0) + 1;
  const t = w._tk ? { tk: w._tk, why: "named on the command line" }
    : hit.series ? tickerFor(hit, w.name) : null;
  if (!t) {
    rep.noTicker++;
    misses.push({ name: w.name, readers: w.readers,
      why: !hit.series ? `registry: ${hit.grade || "no match"}`
        : `${hit.classes.length} classes and the filing states none` });
    continue;
  }
  rep.tried++;
  const url = schwab(t.tk);
  const r = await get(url);
  if (r.blocked) { rep.blocked++; misses.push({ name: w.name, readers: w.readers, why: `blocked here (${r.err})` }); continue; }
  if (!r.ok || r.bytes < 500) { misses.push({ name: w.name, readers: w.readers, why: `http ${r.status} / ${r.bytes}B for ${t.tk}` }); continue; }
  rep.reached++;

  const text = detag(r.body);
  const e = extract(text, url);
  if (e._er != null) { if (e.er != null) rep.er++; else rep.erNoDate++; }
  if (e._ytd != null) { if (e.ytd != null) rep.ytd++; else rep.ytdNoDate++; }

  if (e._reject) rep.rejected++;
  if (VERBOSE) {
    console.log(`${String(w.readers).padStart(10)} ppl  ${t.tk.padEnd(6)} ${hit.grade.padEnd(8)} er=${e.er ?? (e._er != null ? e._er + "(held)" : "-")}@${e.erAsOf ?? "-"}  ytd=${e.ytd ?? (e._ytd != null ? e._ytd + "(held)" : "-")}@${e.ytdAsOf ?? "-"}  ${w.name.slice(0, 40)}`);
    if (e._reject) console.log(`      REFUSED: ${e._reject}`);
  }
  if (EXPLAIN) {
    /* The day's change is printed BESIDE the figures on purpose: it is the
     * value a label-proximity read mistook for the fee, so showing all three
     * is what makes a future regression obvious at a glance. */
    console.log(`      price=${e._price ?? "-"} dayChange=${e._chgPct ?? "-"}%  ->  er=${e._er ?? "-"}% ytd=${e._ytd ?? "-"}%`);
    console.log(`      window: ${String(e._win).slice(0, 200)}`);
  }

  if (!DRY && (e.er != null || e.ytd != null)) {
    /* SEVERAL FILED NAMES RESOLVE TO ONE TICKER -- run #11 wrote 50 times and
     * produced 22 entries, about 2.3 spellings per fund. The first version let
     * the LAST write win, which is wrong twice over: the worklist is sorted by
     * readers DESCENDING, so overwriting keeps the SMALLEST name, and it also
     * kept the LAST grade rather than the best. FXAIX ended up labelled
     * `nearest` under "Fidelity 500 Index" when "Fidelity 500 Index Fund" --
     * 11.4M readers -- had matched it EXACTLY.
     *
     * That understates our own confidence, which is the safe direction and
     * still wrong: `matchGrade` is published provenance and must describe the
     * STRONGEST evidence tying this ticker to a filed name, not the most
     * recent. So keep the best grade and the name that earned it, and record
     * how many spellings arrived -- which is a fact about the filings worth
     * having rather than a detail to discard. */
    const RANK = { exact: 3, subset: 2, nearest: 1 };
    const ent = facts.funds[t.tk.toUpperCase()] ||= { name: w.name, updated: today };
    ent.updated = today;
    if (!ent.matchGrade || (RANK[hit.grade] || 0) > (RANK[ent.matchGrade] || 0)) {
      ent.name = w.name; ent.matchGrade = hit.grade; ent.matchWhy = t.why;
    }
    ent.filedNames = (ent.filedNames || 0) + 1;
    if (e.er != null) { ent.er = e.er; ent.erAsOf = e.erAsOf; ent.erSource = e.src; }
    if (e.ytd != null) { ent.ytd = e.ytd; ent.ytdAsOf = e.ytdAsOf; ent.ytdSource = e.src; }
    rep.wrote++;
  }
  await new Promise((s) => setTimeout(s, 600));   // politeness
}

if (!DRY && rep.wrote) {
  facts.generated = today;
  writeFileSync(factsPath, JSON.stringify(facts, null, 1) + "\n");
}

console.log(`\nnames ${rep.names} · no usable ticker ${rep.noTicker} · fetched ${rep.tried} · reached ${rep.reached} · blocked ${rep.blocked}`);
console.log(`match grades: ${Object.entries(rep.byGrade).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`extracted WITH a date: er ${rep.er} · ytd ${rep.ytd}`);
console.log(`read but DROPPED for having no date: er ${rep.erNoDate} · ytd ${rep.ytdNoDate}`);
console.log(`REFUSED by the column controls: ${rep.rejected}`);
console.log(`wrote ${rep.wrote} entries${DRY ? " (DRY — nothing written)" : " to data/fund-facts.json"}`);
if (rep.blocked) {
  console.log(`\n${rep.blocked} host(s) unreachable. If this ran in the CCR sandbox that is EXPECTED`);
  console.log(`and the result says NOTHING about the source — re-run it on a runner.`);
}
if ((rep.erNoDate || rep.ytdNoDate) && !rep.er && !rep.ytd) {
  console.log(`\nEVERY figure was read and DROPPED for lack of a date. That is a pattern`);
  console.log(`problem on OUR side, not an empty source: re-run with --explain and fix`);
  console.log(`DATE_ANY against the windows it prints.`);
}
for (const m of misses.slice(0, 20)) console.log(`   miss: ${String(m.readers).padStart(9)} ppl — ${m.why} — ${m.name.slice(0, 44)}`);
if (misses.length > 20) console.log(`   ... and ${misses.length - 20} more`);
