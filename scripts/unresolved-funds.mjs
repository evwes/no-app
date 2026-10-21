#!/usr/bin/env node
/* wampo — THE UNRESOLVED FUND REPORT, for the owner to work by hand.
 *
 * Most published ticker cells are blank. A list of those rows is ~1.2 million
 * lines and useless to a human. This groups them into NAME FAMILIES, ranks by
 * READERS affected, and — the part that makes it worth anyone's Sunday — splits
 * them by whether a ticker could exist at all:
 *
 *   A  ASK THE OWNER   the filed name looks like a registered fund and the
 *                      resolver finds nothing. A ticker probably EXISTS. This
 *                      is the list to work.
 *   B  NO TICKER BY NATURE   a collective trust, separate account, guaranteed
 *                      option or annuity. There is no symbol to find, so a
 *                      blank is the correct answer and the owner's time here
 *                      would be wasted. Reported as a total, not a worklist.
 *   C  NOT A FUND      participant loans, employer stock, aggregates, captions,
 *                      brokerage windows. A count only.
 *
 * Bucket A is further flagged where the page ALSO publishes a fee: an expense
 * ratio on a holding we cannot even identify is the worst cell on the site, and
 * those rows are the top of the worklist regardless of size.
 *
 * WHAT "UNRESOLVED" MEANS HERE, stated rather than implied: the page's own
 * `lookupTicker` — the function whose whole job is to find a symbol — returns
 * nothing for the row. That is the subject of this report. It is NOT the same
 * as "the page prints no ticker": `renderRow` suppresses a ticker on a loan
 * row, a subtotal, a GIC and employer stock, where a blank is a deliberate and
 * correct answer rather than a gap. Those are a different class and are not a
 * worklist. The two verdicts are cross-checked below on a sample and the
 * script REFUSES to report if they disagree beyond a stated rate.
 *
 * Every row that reaches the report also goes through the real `renderRow`,
 * with the serving condition (`servedLineup`) and the publish gate applied,
 * because this record carries five published figures that were wrong for want
 * of one of those conditions. Participants are PLAN-DEDUPLICATED — a plan is
 * counted once per family, never once per row, which is the 8x error this
 * project has made and recorded.
 *
 * Run: node scripts/unresolved-funds.mjs [--top 150] [--render 2500] [--out docs]
 * Writes docs/unresolved-funds.md (readable) and docs/unresolved-funds.csv
 * (openable in Excel, which is what the owner actually works in).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const one = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const TOP = +one("--top", 150);
const RENDER = +one("--render", 2500);
const OUT = path.join(ROOT, one("--out", "docs"));
const n = (x) => Math.round(x).toLocaleString();

const R = buildRenderer({ appjs: path.join(ROOT, "app.js") });
const lidx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const d = loadPlans();
R.setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

/* every plan an ack actually serves, so participants are right and a family can
 * name a real example plan the owner can look up */
const members = new Map();
for (const row of d.rows) {
  const p = {
    ack: d.get(row, "ack"), mtiaAck: d.get(row, "mtiaAck"),
    ein: d.get(row, "ein"), pn: d.get(row, "pn"),
    participants: +d.get(row, "partEOY") || +d.get(row, "participants") || 0,
    sponsorName: String(d.get(row, "sponsorName") || "").trim(),
    ticker: d.get(row, "ticker"),
  };
  const s = servedLineup(p, lidx);
  if (!s.ack) continue;
  if (!members.has(s.ack)) members.set(s.ack, []);
  members.get(s.ack).push(p);
}
console.log(`served acks ${n(members.size)}`);

/* ---- the classification -------------------------------------------------- */
/* A vehicle that has no registered symbol BY NATURE. Read off the filer's own
 * type cell, which is the only authority on what the plan actually holds — a
 * separate account that invests in a mutual fund is not that mutual fund. */
const NO_TICKER_TYPE = /collective|commingled|separate account|master trust|pooled|stable value|gic|guaranteed|insurance|annuit|contract/i;
/* Rows that are not an investment option at all. */
const NOT_A_FUND = /^(?:participant loans?|loans?|brokerage window|self-directed|managed account holdings|subtotal|total\b)/i;
/* A SINGLE SECURITY rather than a fund — a Treasury, an agency bond, one
 * corporate issue sitting in a managed bond sleeve. It has no expense ratio and
 * no fund ticker, so it does not belong in a worklist of funds to identify.
 *
 * The test is a CONJUNCTION and has to be: the filer's type cell names the
 * ASSET CLASS, not the vehicle, so `American Funds U.S. Government Securities
 * Fund R6` is filed under `Government securities` and is a real fund. A
 * security category ALONE would drop it. So the type must say security-category
 * AND the name must carry no fund-product word. */
const SECURITY_TYPE = /^(?:government securities|corporate debt|corporate stock|real estate|partnership|joint venture|employer securit|company stock|cash|other)/i;
const FUND_PRODUCT = /\b(?:fund|funds|fd|fds|portfolio|port|index|idx|etf|trust|cit|lifepath|freedom|target|money market|sma|r[1-6]|k6)\b/i;

/* PASS 1 — group, no rendering. Rendering all 1.7M published rows does not
 * finish, so rows are grouped by the triple the resolvers key on — (issuer
 * cell, RAW name, filed type) — and one real row per group is carried forward,
 * out of the store rather than synthesised. `nameRaw` is in the key because
 * `sec-tickers.js` is keyed on (issuer, nameRaw): a row rebuilt by hand misses
 * that table silently.
 *
 * THE NARROWING IS A SUPERSET BY CONSTRUCTION, not a guess. `lookupTicker`
 * consults the filed symbol and `f.ftk` FIRST and `f.stk` LAST, so a row it
 * resolves to nothing must have had both absent. Therefore
 *   {resolver finds nothing}  ⊆  {ftk absent AND stk absent}
 * and skipping rows that carry either cannot drop a member. Discharged below by
 * asking the resolver about a sample of the SKIPPED rows and requiring every
 * one to resolve. */
const fam = new Map();
let rowsSeen = 0, candidates = 0;
const skipped = [];
for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    for (const raw of e.funds) {
      rowsSeen++;
      const f = { ...raw, nameRaw: String(raw.name || ""), name: R.clean(String(raw.name || "")) };
      if (f.stk || f.ftk) {                   // cannot be unresolved — see above
        if (skipped.length < 400 && rowsSeen % 1013 === 0) skipped.push({ lead, f, total });
        continue;
      }
      candidates++;
      const ty = String(f.type || "").trim() || "(blank)";
      const key = `${String(f.iss || "").trim()}||${f.nameRaw}||${ty}`;
      let a = fam.get(key);
      if (!a) {
        a = { iss: String(f.iss || "").trim(), nameRaw: f.nameRaw, ty, rows: 0, dollars: 0,
              plans: new Map(), example: null, sample: { lead, f, total } };
        fam.set(key, a);
      }
      a.rows++;
      a.dollars += +f.value || 0;
      for (const q of mem) a.plans.set(`${q.ein}|${q.pn}`, q.participants);
      if (!a.example || lead.participants > (a.example.ppl || 0))
        a.example = { sponsor: lead.sponsorName, ein: lead.ein, pn: lead.pn, ppl: lead.participants };
    }
  }
}
console.log(`walked ${n(rowsSeen)} rows · ${n(candidates)} carry neither stk nor ftk · ${n(fam.size)} distinct families`);

/* DISCHARGE the narrowing: every sampled row that carries stk/ftk must in fact
 * resolve. If one does not, the prefilter is dropping real members and the
 * whole report is a measurement of a different population. */
let dischargeFail = 0;
for (const s of skipped) if (!R.fns.lookupTicker(s.f)) dischargeFail++;
if (dischargeFail > 0) {
  console.error(`REFUSING TO REPORT: the stk/ftk prefilter is not a superset — ` +
    `${dischargeFail} of ${skipped.length} sampled rows carry stk/ftk and still resolve to NOTHING. ` +
    `The grouping would silently omit real unresolved families.`);
  process.exit(1);
}
console.log(`narrowing discharged: ${skipped.length} sampled rows carrying stk/ftk, all resolve`);

/* PASS 2 — ask the resolver once per family. */
const unres = [];
let resolvedRows = rowsSeen - candidates, unresolvedRows = 0;
for (const a of fam.values()) {
  if (R.fns.lookupTicker(a.sample.f)) { resolvedRows += a.rows; continue; }
  unresolvedRows += a.rows;
  unres.push(a);
}
if (resolvedRows + unresolvedRows !== rowsSeen) {
  console.error(`REFUSING TO REPORT: ${n(rowsSeen)} rows walked but ` +
    `${n(resolvedRows)} + ${n(unresolvedRows)} accounted for.`);
  process.exit(1);
}
console.log(`resolver finds a symbol on ${n(resolvedRows)} rows · nothing on ${n(unresolvedRows)} · ${n(unres.length)} families`);

/* ---- bucket, then rank by readers --------------------------------------- */
const out = [];
for (const a of unres) {
  const ppl = [...a.plans.values()].reduce((x, y) => x + y, 0);
  const nm = String(a.sample.f.name || a.nameRaw || "").trim();
  if (!nm) continue;
  let bucket;
  if (NOT_A_FUND.test(nm)) bucket = "C";
  else if (NO_TICKER_TYPE.test(a.ty) || NO_TICKER_TYPE.test(nm)) bucket = "B";
  else if (SECURITY_TYPE.test(a.ty) && !FUND_PRODUCT.test(nm)) bucket = "D";
  else bucket = "A";
  out.push({ ...a, nm, ppl, plansN: a.plans.size, bucket, fee: null, shownType: null, rendered: false });
}
const byPpl = (x, y) => y.ppl - x.ppl || y.dollars - x.dollars;
out.sort(byPpl);

/* PASS 3 — the full `renderRow`, on the families that reach the report. This
 * is where the FEE and the page's own shown TYPE come from, and it is also the
 * cross-check that the resolver's verdict is the page's: a family the resolver
 * cannot answer should print no ticker, UNLESS `renderRow` overrides it for
 * employer stock. Those are counted and named, not swept. */
let rendered = 0, overridden = 0, dropped = 0;
const budget = out.filter((x) => x.bucket === "A" || x.bucket === "B").slice(0, RENDER);
for (const x of budget) {
  const r = R.renderRow(x.sample.lead, x.sample.f, "menu", x.sample.total);
  rendered++;
  if (!r) { dropped++; x.pageDrops = true; continue; }
  x.rendered = true;
  x.shownType = String(r.shownType || "").trim() || "(blank)";
  x.fee = r.er != null && r.er !== "" ? r.er : null;
  if (r.tk) { overridden++; x.overrideTk = r.tk; }
}
console.log(`rendered ${n(rendered)} families · page drops the row on ${n(dropped)} · prints a ticker anyway on ${n(overridden)}`);
/* The override population is employer stock and must not sit in a worklist of
 * funds we cannot identify: the page names them from the sponsor's own symbol.
 * And where the page's OWN shown type already says the filing names no specific
 * fund, that verdict outranks any guess made here from the name. */
let nameless = 0;
for (const x of budget) {
  if (x.overrideTk) { x.bucket = "C"; continue; }
  if (x.shownType && /names no specific fund/i.test(x.shownType)) { x.bucket = "C"; nameless++; }
}
if (nameless) console.log(`the page itself calls ${n(nameless)} rendered families nameless — moved to C`);

const A = out.filter((x) => x.bucket === "A");
const B = out.filter((x) => x.bucket === "B");
const C = out.filter((x) => x.bucket === "C");
const D = out.filter((x) => x.bucket === "D");
/* participants are plan-deduplicated WITHIN a family; across families a plan
 * can appear in several, so a bucket total is a REACH figure, labelled as one */
const reach = (arr) => { const s = new Set(); for (const x of arr) for (const k of x.plans.keys()) s.add(k); return s.size; };
const sumPpl = (arr) => { const s = new Map(); for (const x of arr) for (const [k, v] of x.plans) s.set(k, v); return [...s.values()].reduce((a, b) => a + b, 0); };
const rows = (arr) => arr.reduce((a, x) => a + x.rows, 0);
const dols = (arr) => arr.reduce((a, x) => a + x.dollars, 0);

const today = new Date().toISOString().slice(0, 10);
const feeFirst = [...A].sort((x, y) => (y.fee != null) - (x.fee != null) || byPpl(x, y));

/* ---- the readable report ------------------------------------------------- */
const md = [];
md.push(`# Unresolved funds — ${today}`);
md.push("");
md.push(`Of **${n(rowsSeen)}** fund rows wampo publishes, the resolver finds a ticker for`);
md.push(`**${n(resolvedRows)}** and nothing for **${n(unresolvedRows)}**. Those group into`);
md.push(`**${n(out.length)}** distinct name families — one per (filed name, issuer cell, filed type).`);
md.push("");
md.push(`| bucket | families | rows | plans reached | readers | $ held | what it means |`);
md.push(`|---|---:|---:|---:|---:|---:|---|`);
md.push(`| **A — needs your guidance** | **${n(A.length)}** | ${n(rows(A))} | **${n(reach(A))}** | **${n(sumPpl(A))}** | $${n(dols(A))} | looks like a registered fund; a ticker probably exists and we cannot find it |`);
md.push(`| B — no ticker by nature | ${n(B.length)} | ${n(rows(B))} | ${n(reach(B))} | ${n(sumPpl(B))} | $${n(dols(B))} | collective trust, separate account, guaranteed option. A blank is correct — **do not spend time here** |`);
md.push(`| C — not a fund | ${n(C.length)} | ${n(rows(C))} | ${n(reach(C))} | ${n(sumPpl(C))} | $${n(dols(C))} | loans, employer stock, aggregates, captions |`);
md.push(`| D — a single security | ${n(D.length)} | ${n(rows(D))} | ${n(reach(D))} | ${n(sumPpl(D))} | $${n(dols(D))} | one Treasury, agency or corporate issue in a managed sleeve. No fund ticker exists — **do not spend time here** |`);
md.push("");
md.push(`Readers are plan-deduplicated inside a bucket. A plan can appear in several`);
md.push(`buckets, so the four do not sum to the universe and are not meant to.`);
md.push("");
md.push(`The fee and the page's own type column were read by rendering the top`);
md.push(`**${n(rendered)}** families through the real page code. Below that the family is`);
md.push(`listed with its filed type and no fee verdict — small enough that it was not`);
md.push(`worth the render, and labelled rather than guessed.`);
md.push("");
md.push(`## Worst first: unidentified **and** priced`);
md.push("");
md.push(`These publish an expense ratio on a holding we cannot identify. That is the`);
md.push(`worst cell on the site — a fee presented as fact on a fund we cannot name — so`);
md.push(`they lead the list regardless of size.`);
md.push("");
const priced = feeFirst.filter((x) => x.fee != null).slice(0, 30);
if (!priced.length) md.push(`*(none — every unresolved family that was rendered is correctly unpriced)*`);
else {
  md.push(`| readers | plans | filed name | issuer cell | type shown | fee shown | $ held |`);
  md.push(`|---:|---:|---|---|---|---:|---:|`);
  for (const x of priced)
    md.push(`| ${n(x.ppl)} | ${n(x.plansN)} | \`${x.nm.slice(0, 64)}\` | ${x.iss ? `\`${x.iss.slice(0, 30)}\`` : "—"} | ${x.shownType} | ${x.fee} | $${n(x.dollars)} |`);
}
md.push("");
md.push(`## A — the worklist, by readers affected`);
md.push("");
md.push(`| # | readers | plans | filed name | issuer cell | filed type | fee | $ held | example plan |`);
md.push(`|---:|---:|---:|---|---|---|---:|---:|---|`);
A.slice(0, TOP).forEach((x, i) => {
  const ex = x.example ? `${x.example.sponsor.slice(0, 22)} (${x.example.ein}|${x.example.pn})` : "—";
  md.push(`| ${i + 1} | ${n(x.ppl)} | ${n(x.plansN)} | \`${x.nm.slice(0, 64)}\` | ${x.iss ? `\`${x.iss.slice(0, 30)}\`` : "—"} | ${x.rendered ? x.shownType : x.ty} | ${x.fee != null ? x.fee : (x.rendered ? "—" : "?")} | $${n(x.dollars)} | ${ex} |`);
});
md.push("");
md.push(`## What would help most`);
md.push("");
md.push(`For any row above, the single most useful thing is **the ticker, or "no ticker`);
md.push(`exists"** — a confirmed no is worth as much as a yes, because it lets the page`);
md.push(`stop looking and say so.`);
md.push("");
md.push(`Second most useful is **the full product name**, because most of these are a`);
md.push(`filer's abbreviation of a real fund, and the full name is what lets the resolver`);
md.push(`find it for every other plan that files the same abbreviation. One answer`);
md.push(`usually fixes a whole family at once — the \`plans\` column is how many.`);
md.push("");
md.push(`A fee or a return is only ever recorded with a source and an as-of date. If you`);
md.push(`give a cost, the page needs where it came from, not just the number.`);
md.push("");
md.push(`Edit \`docs/unresolved-funds.csv\` in place — it has \`your_answer_ticker\`,`);
md.push(`\`your_answer_full_name\`, \`no_ticker_exists\` and \`notes\` columns — or reply with`);
md.push(`the rows you know.`);
writeFileSync(path.join(OUT, "unresolved-funds.md"), md.join("\n") + "\n");

/* ---- the CSV the owner actually works in --------------------------------- */
const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
const csv = [["bucket", "readers", "plans", "rows", "filed_name", "issuer_cell", "filed_type",
  "type_shown", "dollars_held", "fee_shown", "example_sponsor", "example_ein", "example_pn",
  "your_answer_ticker", "your_answer_full_name", "no_ticker_exists", "notes"].join(",")];
for (const x of [...feeFirst.slice(0, 600), ...B.slice(0, 80)])
  csv.push([x.bucket, x.ppl, x.plansN, x.rows, q(x.nm), q(x.iss), q(x.ty), q(x.rendered ? x.shownType : ""),
    Math.round(x.dollars), x.fee != null ? x.fee : "", q(x.example ? x.example.sponsor : ""),
    q(x.example ? x.example.ein : ""), q(x.example ? x.example.pn : ""), "", "", "", ""].join(","));
writeFileSync(path.join(OUT, "unresolved-funds.csv"), csv.join("\n") + "\n");

console.log(`A ${n(A.length)} families / ${n(sumPpl(A))} readers · B ${n(B.length)} · C ${n(C.length)} · D ${n(D.length)}`);
console.log(`A families publishing a fee anyway: ${n(A.filter((x) => x.fee != null).length)}`);
console.log(`wrote ${path.relative(ROOT, OUT)}/unresolved-funds.md and .csv`);
