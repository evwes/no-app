/* wampo — post-merge data sanity audit.
 * Filings are internally redundant (participant counts appear three ways,
 * schedule sums must match Schedule H, contribution averages are bounded by
 * law). Every production bug so far — 6g(2) typos, gain-columns-as-values,
 * doubled summary pages — was visible as a violated identity long before a
 * human noticed it on the site. This prints violations after each merge so
 * the run log surfaces them. Informational: it never fails the build. */
import { readFileSync, writeFileSync, appendFileSync } from "fs";

const d = JSON.parse(readFileSync("plans-all.json", "utf8"));
const F = d.fields; const ix = Object.fromEntries(F.map((f, i) => [f, i]));
const g = (r, f) => r[ix[f]];

const findings = { high: [], warn: [] };
const flag = (sev, rule, msg) => findings[sev].push(`[${rule}] ${msg}`);

let statTotal = 0;
for (const r of d.plans) {
  statTotal++;
  const name = `${g(r, "sponsorName")} (${g(r, "ein")}|${g(r, "pn")})`;
  const pt = g(r, "participants") || 0, pb = g(r, "partBalances") || 0;
  const a = g(r, "assetsEOY") || 0, boy = g(r, "assetsBOY") || 0;
  const defer = g(r, "contribParticipant") || 0, er = g(r, "contribEmployer") || 0;
  const act = g(r, "activeParticipants") || 0;

  // average balance: flag when BOTH candidate denominators give an absurd
  // figure, or the site's chosen denominator still crosses $5M (Cravath-class
  // legit plans top out under $3M)
  if (a && pt) {
    const balCnt = pb && pb >= pt * 0.05 && (pb >= pt * 0.5 || a / pb <= 1e6) ? pb : pt;
    const avg = a / balCnt;
    if (avg > 5e6) flag("high", "avg-balance", `${name}: $${(avg / 1e6).toFixed(1)}M avg (assets ${(a / 1e6).toFixed(0)}M / ${balCnt})`);
    else if (avg > 2.5e6) flag("warn", "avg-balance", `${name}: $${(avg / 1e6).toFixed(1)}M avg — verify against the filing`);
  }
  // participant-count identities from the form itself
  if (pb > pt * 1.25 && pt >= 100) flag("warn", "counts", `${name}: ${pb} with balances vs ${pt} total participants`);
  // per-active-participant contributions are bounded by IRC 415(c)/402(g);
  // an average above the annual additions limit means a units or column bug
  if (act >= 100 && defer / act > 80000) flag("high", "contrib", `${name}: avg deferral $${Math.round(defer / act / 1000)}K/active exceeds the legal limit`);
  if (act >= 100 && er / act > 120000) flag("warn", "contrib", `${name}: avg employer contribution $${Math.round(er / act / 1000)}K/active`);
  // year-over-year swings beyond market plausibility (mergers excepted — warn only)
  if (boy > 1e7 && a > boy * 4) flag("warn", "yoy", `${name}: assets grew ${(a / boy).toFixed(1)}x in one year`);
}

// lineup shards: sums vs Schedule H, single-holding dominance
const byAck = new Map(d.plans.map((r) => [g(r, "ack"), r]));
const entriesByAckCov = {};
let entries = 0, confident = 0;
for (let i = 0; i < 64; i++) {
  let sh;
  try { sh = JSON.parse(readFileSync(`data/lineups/${String(i).padStart(2, "0")}.json`, "utf8")); } catch { continue; }
  for (const [ack, e] of Object.entries(sh)) {
    entries++;
    entriesByAckCov[ack] = e;
    if (!e.confident || !e.funds || !e.funds.length) continue;
    confident++;
    const row = byAck.get(ack);
    const schH = row ? g(row, "assetsEOY") : 0;
    const sum = e.funds.reduce((x, f) => x + (f.value || 0), 0);
    // full ack, not the 14-char timestamp — three different filings can
    // share one submission timestamp and the truncated label sent an
    // investigation to the wrong plan (Ross School, 2026-08-11)
    const label = row ? `${g(row, "sponsorName")} ${ack}` : ack;
    // a confident lineup whose sum strays far from Schedule H usually means a
    // wrong value column, a doubled summary page, or (thousands) mis-scaling
    if (schH > 1e7 && (sum > schH * 1.6 || sum < schH * 0.25))
      flag("warn", "lineup-sum", `${label}: funds sum $${(sum / 1e6).toFixed(0)}M vs Sch H $${(schH / 1e6).toFixed(0)}M`);
    if (schH > 1e7 && e.funds[0] && e.funds[0].value > schH * 1.5)
      flag("high", "lineup-row", `${label}: top holding $${(e.funds[0].value / 1e6).toFixed(0)}M exceeds plan assets`);
    // form-instruction vocabulary displayed as a fund name = OCR'd form
    // pages or statement text leaked into a confident lineup (Galliano
    // shipped "K Net income (loss). Subtract lime 2j..." as a $55M fund —
    // its sum was plausible so no identity check fired; only the NAME
    // gives it away)
    const junkName = e.funds.find((f) => /subtract li[nm]e|add lines? \d|net income \(loss\)|\(e\.?g\.?[,.]|total (additions|deductions)\b|\(specify\)|type of contract|disbursed from|to pay benefits\b|[sce]{8,}|employe{1,2}r? identification|identification number|name of plan sponsor|^plan name\b|^\W*ranging from\b|schedule\s+h\b|\bform\s+\$?5?500\b/i.test(f.name || ""));
    if (junkName)
      flag("high", "lineup-junk", `${label}: fund name reads as form/statement text: "${junkName.name.slice(0, 60)}"`);
  }
}

// ---- extraction correctness: formula must agree with its own quote -----
// A WRONG formula is worse than a missing one. Every structured value we
// display was derived from a quoted sentence — so every number in the
// formula must appear in that quote (digits, or spelled out for vesting).
const WORDS = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" };
let checked = 0, mismatches = 0;
const mmList = [];
// "Immediate" vesting quoting plan-TERMINATION text is the IRC-required
// acceleration boilerplate misread as a schedule (Sempra shipped a 1-year
// cliff as Immediate; 43 stored cases found on first scan)
for (const [ack, e] of Object.entries(entriesByAckCov)) {
  const f = e && e.features;
  // narrow to ACCELERATION phrasings — a terminated plan truthfully
  // describing its immediate vesting ("Prior to the Plan's termination,
  // participants were immediately vested…") is correct extraction
  if (f && f.vesting === "Immediate" && f.vestingText &&
      /(?:in the event of|upon|would become|will become|shall become)[^.]{0,50}?(?:termination|discontinuation)|termination or discontinuation/i.test(f.vestingText)) {
    mismatches++;
    if (mmList.length < 12) mmList.push(`${ack.slice(0, 20)}: vesting "Immediate" quotes plan-termination boilerplate`);
  }
}
for (const [ack, e] of Object.entries(entriesByAckCov)) {
  const f = e && e.features;
  if (!f) continue;
  if (f.match && f.matchText && !/discretionary|up to/i.test(f.match)) {
    checked++;
    // the era label's year ("… (formula in effect prior to 2024 per the
    // filing)") is annotation, not formula — strip it before number checks
    const mFormula = f.match.replace(/(?: \([^)]*per the filing\))+$/i, "");
    const nums = (mFormula.match(/\d+(?:\.\d+)?/g) || []).filter((n) => +n !== 100 || !/dollar[- ]for[- ]dollar/i.test(f.matchText));
    // "next N%" tiers derived from cumulative caps ("exceeds 1% up to 6%" →
    // next 5%) are consistent when the quote shows the cumulative number
    const first = +(f.match.match(/first (\d+)/) || [])[1] || 0;
    // spelled-fraction rates ("one-half of the first 8%") display as
    // digits, as do fully spelled numbers ("one hundred percent of the
    // first one percent", O'Neal Steel)
    const RATE_WORDS = { 50: /one[- ]half|\bfifty\b/i, 33: /one[- ]third/i, 25: /one[- ]quarter|twenty[- ]five/i, 67: /two[- ]thirds/i,
      100: /one hundred/i, 75: /seventy[- ]five/i, 20: /\btwenty\b/i, 15: /\bfifteen\b/i, 10: /\bten\b/i,
      30: /\bthirty\b/i, 40: /\bforty\b/i, 60: /\bsixty\b/i, 70: /\bseventy\b/i, 80: /\beighty\b/i, 90: /\bninety\b/i,
      1: /\bone\b/i, 2: /\btwo\b/i, 3: /\bthree\b/i, 4: /\bfour\b/i, 5: /\bfive\b/i, 6: /\bsix\b/i, 7: /\bseven\b/i, 8: /\beight\b/i, 9: /\bnine\b/i };
    const bad = nums.filter((n) => !f.matchText.includes(n) &&
      !(RATE_WORDS[n] && RATE_WORDS[n].test(f.matchText)) &&
      !(first && f.match.includes(`next ${n}%`) && f.matchText.includes(String(first + +n))));
    if (bad.length) { mismatches++; if (mmList.length < 12) mmList.push(`${ack.slice(0, 14)}: match "${f.match}" but quote lacks [${bad}]`); }
  }
  if (f.vesting && /([4-9])-year cliff/.test(f.vesting)) {
    mismatches++; if (mmList.length < 12) mmList.push(`${ack.slice(0, 14)}: "${f.vesting}" exceeds the IRC 3-year DC cliff limit — misparse`);
  }
  if (f.vesting && f.vestingText && /(\d)-year cliff/.test(f.vesting)) {
    checked++;
    const n = +f.vesting.match(/(\d)-year/)[1];
    if (!f.vestingText.includes(String(n)) && !new RegExp(`\\b${WORDS[n]}\\b`, "i").test(f.vestingText)) {
      mismatches++; if (mmList.length < 12) mmList.push(`${ack.slice(0, 14)}: vesting "${f.vesting}" not in its quote`);
    }
  }
}
// form-question text must never appear as an audit-note quote (30,795
// false quotes shipped before this check existed)
let formQuotes = 0;
for (const e of Object.values(entriesByAckCov)) {
  const f = e && e.features;
  if (f && f.matchText && /permissive aggregation|check all boxes|design[- ]based safe harbor|complete this item/i.test(f.matchText)) formQuotes++;
}
if (formQuotes) { mismatches += formQuotes; mmList.unshift(formQuotes + " quotes contain FORM-QUESTION text (must be zero)"); }

console.log(`\n== CORRECTNESS (formula-vs-quote): ${checked} checked, ${mismatches} mismatches${mismatches ? "" : " — all consistent"}`);
for (const l of mmList) console.log("  " + l);

// ---- per-field coverage: the completeness scorecard --------------------
// Printed every run so extractor progress is a number that moves and any
// regression shows the night it happens. "unextracted match" = plans where
// employer money demonstrably flowed but no formula came out — the
// correctable backlog, distinct from plans that genuinely have no match.
const covTot = { full: 0, rk: 0, match: 0, vesting: 0, roth: 0, afterTax: 0, lineup: 0, menu: 0, noMatchBacklog: 0, noEmployerMoney: 0 };
for (const r of d.plans) {
  if (g(r, "sf")) continue;
  covTot.full++;
  if (g(r, "recordkeeper")) covTot.rk++;
  const e = entriesByAckCov[g(r, "ack")];
  const f = e && e.features;
  if (e && e.confident && e.funds && e.funds.length) covTot.lineup++;
  if (!f) continue;
  // "covered" must not be inflated by boilerplate mentions in plans that
  // paid nothing — count $0-employer plans separately (their answer is
  // "none this year", which the site now states)
  const zeroEmp = (g(r, "contribEmployer") || 0) === 0;
  if (zeroEmp) covTot.noEmployerMoney++;
  else if (f.match || f.matchText) covTot.match++;
  else if (!f.nec && !f.safeHarbor) covTot.noMatchBacklog++;
  if (f.vesting || f.vestingText) covTot.vesting++;
  if (f.roth) covTot.roth++;
  if (f.afterTax) covTot.afterTax++;
  if (f.menu) covTot.menu++;
}
const pct = (n) => (100 * n / covTot.full).toFixed(1) + "%";
console.log(`\n== COVERAGE (of ${covTot.full} full-form filers; SF filers carry none of this by law)`);
console.log(`  recordkeeper ${covTot.rk} (${pct(covTot.rk)}) | match ${covTot.match} (${pct(covTot.match)}) | vesting ${covTot.vesting} (${pct(covTot.vesting)})`);
console.log(`  roth ${covTot.roth} | after-tax ${covTot.afterTax} | lineups ${covTot.lineup} (${pct(covTot.lineup)}) | named menus ${covTot.menu}`);
console.log(`  match backlog (employer money but no formula extracted): ${covTot.noMatchBacklog} | genuinely no employer money: ${covTot.noEmployerMoney}`);

// Fee-shard sanity: a structurally-present-but-empty column (the Sch C
// service codes shipped blank in every Latest ITEM2 extract, 2026-08-07)
// passes every row-level check — only an aggregate coverage floor sees it.
let feeCodesShare = null;
try {
  const { existsSync } = await import("fs");
  let provRows = 0, provWithCodes = 0, feePlans = 0;
  for (let i = 0; i < 64; i++) {
    const p = `data/fees/${String(i).padStart(2, "0")}.json`;
    if (!existsSync(p)) continue;
    for (const e of Object.values(JSON.parse(readFileSync(p, "utf8")))) {
      feePlans++;
      for (const pr of e.p || []) { provRows++; if (pr.c) provWithCodes++; }
    }
  }
  if (provRows) {
    const share = 100 * provWithCodes / provRows;
    feeCodesShare = +share.toFixed(1);
    console.log(`\n== FEES: ${feePlans} plans, ${provRows} provider rows, ${provWithCodes} with service codes (${share.toFixed(1)}%)`);
    if (share < 50) flag("high", "fee-codes", `only ${share.toFixed(1)}% of Sch C provider rows carry service codes — codes ingestion is broken (child-table join?)`);
  }
} catch (e) { console.warn("fee-shard audit skipped: " + e.message); }

console.log(`\naudit: ${statTotal} plans, ${entries} lineup entries (${confident} confident)`);
for (const sev of ["high", "warn"]) {
  console.log(`\n== ${sev.toUpperCase()} (${findings[sev].length})`);
  for (const f of findings[sev].slice(0, 40)) console.log("  " + f);
  if (findings[sev].length > 40) console.log(`  … and ${findings[sev].length - 40} more`);
}

// LOSS TRIAGE (from merge-4i): every confidence loss whose old parse was
// real-menu-shaped is a HIGH — junk-cleanup losses are expected on guard
// changes, but a lost real menu means the new version broke something.
// Owner directive 2026-08-12: every re-parse must use everything learned
// and produce a provably BETTER version — these two blocks are the proof.
try {
  const triage = readFileSync("losses-triage.txt", "utf8").trim().split("\n").filter(Boolean);
  if (triage.length) {
    for (const a of triage.slice(0, 20))
      flag("high", "reparse-loss", `real-menu-shaped lineup lost confidence this run: ${a} — pull the filing before accepting`);
    if (triage.length > 20)
      flag("high", "reparse-loss", `… and ${triage.length - 20} more real-menu-shaped losses (losses-triage.txt in the merge log)`);
  }
} catch { /* no triage file — merge didn't run in this invocation */ }

// REPARSE VERDICT: compare this run's coverage line to the previous one.
// Improvement is the contract; a regression beyond tolerance is a HIGH
// that demands diff-sampling before the data is mirrored to main.
let verdictNote = "";
try {
  const hist = readFileSync("docs/coverage-history.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  if (hist.length >= 1) {
    const p = hist[hist.length - 1];
    const c = { confident, match: covTot.match, vesting: covTot.vesting, lineups: covTot.lineup, entries };
    const d = (k, pv) => { const x = c[k] - pv; return `${k} ${x >= 0 ? "+" : ""}${x}`; };
    verdictNote = [d("confident", p.confident), d("match", p.match), d("vesting", p.vesting), d("lineups", p.lineups)].join(", ");
    const regress = [];
    if (c.confident - p.confident < -200) regress.push(`confident ${c.confident - p.confident}`);
    if (c.match - p.match < -150) regress.push(`match ${c.match - p.match}`);
    if (c.vesting - p.vesting < -150) regress.push(`vesting ${c.vesting - p.vesting}`);
    if (regress.length)
      flag("high", "reparse-regression", `coverage regressed vs previous run (${regress.join(", ")}) — justify with sampled losses or roll back before mirroring`);
    console.log(`\n== REPARSE VERDICT vs previous run: ${verdictNote}${regress.length ? "  ⚠ REGRESSED" : "  — improved or held"}`);
  }
} catch { /* first run — no history yet */ }

// Machine-readable accuracy trail: one JSONL line per pipeline run,
// committed with the data — coverage trends are diffable, and a silent
// regression shows up as a dip in the next line rather than needing
// someone to read run logs. audit-high.txt feeds the workflow step that
// keeps the auto-managed "HIGH findings" GitHub issue current.
try {
  appendFileSync("docs/coverage-history.jsonl", JSON.stringify({
    d: new Date().toISOString().slice(0, 10),
    plans: statTotal, fullForm: covTot.full, entries, confident,
    rk: covTot.rk, match: covTot.match, vesting: covTot.vesting,
    lineups: covTot.lineup, feeCodesPct: feeCodesShare,
    high: findings.high.length, warn: findings.warn.length,
  }) + "\n");
  // cap the issue feed — GitHub bodies max out at 65k chars, and a mass
  // finding (like the 500+ lineup-junk sweep) must not break the step
  const highLines = findings.high.length > 150
    ? [...findings.high.slice(0, 150), `… and ${findings.high.length - 150} more (full list in the run log)`]
    : findings.high;
  writeFileSync("audit-high.txt", highLines.join("\n") + (highLines.length ? "\n" : ""));
} catch (e) { console.warn("accuracy trail write skipped: " + e.message); }
