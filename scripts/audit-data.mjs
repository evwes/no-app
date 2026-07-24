/* wampo — post-merge data sanity audit.
 * Filings are internally redundant (participant counts appear three ways,
 * schedule sums must match Schedule H, contribution averages are bounded by
 * law). Every production bug so far — 6g(2) typos, gain-columns-as-values,
 * doubled summary pages — was visible as a violated identity long before a
 * human noticed it on the site. This prints violations after each merge so
 * the run log surfaces them. Informational: it never fails the build. */
import { readFileSync } from "fs";

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
    const label = row ? `${g(row, "sponsorName")} ${ack.slice(0, 14)}` : ack;
    // a confident lineup whose sum strays far from Schedule H usually means a
    // wrong value column, a doubled summary page, or (thousands) mis-scaling
    if (schH > 1e7 && (sum > schH * 1.6 || sum < schH * 0.25))
      flag("warn", "lineup-sum", `${label}: funds sum $${(sum / 1e6).toFixed(0)}M vs Sch H $${(schH / 1e6).toFixed(0)}M`);
    if (schH > 1e7 && e.funds[0] && e.funds[0].value > schH * 1.5)
      flag("high", "lineup-row", `${label}: top holding $${(e.funds[0].value / 1e6).toFixed(0)}M exceeds plan assets`);
  }
}

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
  if (f.match || f.matchText) covTot.match++;
  else if ((g(r, "contribEmployer") || 0) === 0) covTot.noEmployerMoney++;
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

console.log(`\naudit: ${statTotal} plans, ${entries} lineup entries (${confident} confident)`);
for (const sev of ["high", "warn"]) {
  console.log(`\n== ${sev.toUpperCase()} (${findings[sev].length})`);
  for (const f of findings[sev].slice(0, 40)) console.log("  " + f);
  if (findings[sev].length > 40) console.log(`  … and ${findings[sev].length - 40} more`);
}
