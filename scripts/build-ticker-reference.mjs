#!/usr/bin/env node
/* wampo — build docs/fund-ticker-reference.md: every ticker wampo resolves,
 * the SEC registered name behind it, and the filed spellings that reach it.
 *
 * WHAT IT IS FOR. When reading a Schedule H line 4i by hand, the filed name is
 * whatever the recordkeeper's system printed — "VNGRD TOT STK MK IDX FD AD",
 * "American Funds 2050 Trgt Date Retire R6", "Spartan 500 Index Pool C". This
 * file is the lookup in both directions: what a ticker's fund is actually
 * called in filings, and which spellings are already known to resolve.
 *
 * It is GENERATED. Regenerate with:
 *   node scripts/build-ticker-reference.mjs --index <sec-funds.json>
 * Never hand-edit it — corrections belong in fund-er.js (curated patterns) or
 * scripts/match-sec-tickers.mjs (the SEC lookup), which is what this reads.
 *
 * The unresolved section at the end is not padding. It is the honest gap, in
 * the order worth working, and it is the reason the coverage figure at the top
 * carries its denominator.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildIndex, resolve } from "./match-sec-tickers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", path.join(root, "docs/fund-ticker-reference.md"));
const idx = buildIndex(arg("--index", path.join(root, "sec-funds.json")));

/* fund-er.js is read from git HEAD, not the working tree: this script is often
 * run while that file is being edited, and half a regex is not a fund table. */
let src;
try { src = execFileSync("git", ["show", "HEAD:fund-er.js"], { cwd: root, encoding: "utf8" }); }
catch { src = fs.readFileSync(path.join(root, "fund-er.js"), "utf8"); }
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + "\nglobalThis.__t = fundTickerInfo;", ctx);
const patternTicker = ctx.__t;

const NO_TICKER = /participant loan|loans? to participants|maturing through|notes? receivable|company stock|employer (?:security|stock)|common stock fund|esop|stable value|guaranteed|\bgic\b|annuity|tiaa traditional|general account|brokerage|self-directed|\bsdba\b|brokeragelink|^\s*cash\b|cash equivalent|money market|short.?term investment fund|\bstif\b|^managed account holdings|^managed by |\(\d+ positions\)/i;

const byTicker = new Map();
const unresolved = new Map();
let rows = 0, skipped = 0, matched = 0;

for (let i = 0; i < 64; i++) {
  const p = path.join(root, "data/lineups", String(i).padStart(2, "0") + ".json");
  if (!fs.existsSync(p)) continue;
  const shard = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const ack of Object.keys(shard)) {
    const e = shard[ack];
    if (!e.confident || !e.funds) continue;
    for (const f of e.funds) {
      const name = String(f.name || "").trim();
      if (!name) continue;
      if (NO_TICKER.test((f.type || "") + " " + name)) { skipped++; continue; }
      rows++;
      const pat = patternTicker(name, f.type);
      const r = pat || resolve(idx, name);
      if (!r) {
        const u = unresolved.get(name) || { n: 0, v: 0 };
        u.n++; u.v += f.value || 0;
        unresolved.set(name, u);
        continue;
      }
      // fund-er.js returns {tk,...}; the SEC matcher returns {ticker,...}
      const tick = r.ticker || r.tk;
      if (!tick) continue;
      matched++;
      const g = byTicker.get(tick) || {
        series: r.series || "", n: 0, v: 0, acks: new Set(), spell: new Map(),
        comparable: 0, exact: 0, className: r.className || "",
      };
      if (!g.series && r.series) { g.series = r.series; g.className = r.className || ""; }
      g.n++; g.v += f.value || 0;
      if (g.acks.size < 100000) g.acks.add(ack);
      g[r.comparable ? "comparable" : "exact"]++;
      g.spell.set(name, (g.spell.get(name) || 0) + 1);
      byTicker.set(tick, g);
    }
  }
}

const B = (n) => n >= 1e9 ? "$" + (n / 1e9).toFixed(1) + "B"
  : n >= 1e6 ? "$" + (n / 1e6).toFixed(0) + "M" : "$" + Math.round(n / 1e3) + "k";
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

const ranked = [...byTicker].sort((a, b) => b[1].v - a[1].v);
const out = [];
out.push("# Fund ticker reference");
out.push("");
out.push("**Generated — do not hand-edit.** Rebuild with");
out.push("`node scripts/build-ticker-reference.mjs --index <sec-funds.json>`.");
out.push("Corrections belong in `fund-er.js` (curated patterns and comparables) or");
out.push("`scripts/match-sec-tickers.mjs` (the SEC series/class lookup).");
out.push("");
out.push(`Built ${new Date().toISOString().slice(0, 10)} from ${ranked.length.toLocaleString()} distinct tickers across the confident lineups.`);
out.push("");
out.push("## How to read this");
out.push("");
out.push("- **Ticker** — the registered fund. A row marked `*` in the site's holdings");
out.push("  table is a *comparable*: the plan holds a collective trust or an unnamed");
out.push("  share class, and this is the registered analogue, not the vehicle itself.");
out.push("  Its expense ratio is the analogue's, and a collective trust's real fee is");
out.push("  negotiated per plan and is not public.");
out.push("- **Registered name** — the SEC series name, from the Investment Company");
out.push("  Series and Class information file. This is the fund's legal name, which is");
out.push("  often not what appears on a Schedule H line 4i.");
out.push("- **Filed as** — spellings actually seen in filings, most common first. This");
out.push("  is the column to search when a 4i line is unrecognisable.");
out.push("- **exact / comp** — how many holdings resolved as a stated fact versus as a");
out.push("  comparable.");
out.push("");
out.push(`Coverage: **${matched.toLocaleString()} of ${rows.toLocaleString()}** fund-like holdings resolve (${(100 * matched / rows).toFixed(1)}%).`);
out.push(`A further ${skipped.toLocaleString()} rows are excluded from that denominator because no ticker exists for them —`);
out.push("participant loans, employer stock, stable-value and guaranteed contracts,");
out.push("brokerage windows, cash sweeps, and managed-account aggregates.");
out.push("");
out.push("## Tickers, by assets held across all plans");
out.push("");
out.push("| Ticker | Registered name | Plans | Holdings | Assets | exact / comp | Filed as |");
out.push("|---|---|---:|---:|---:|---|---|");
for (const [tk, g] of ranked) {
  const spell = [...g.spell].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => esc(s));
  out.push(`| \`${tk}\` | ${esc(g.series || "—")} | ${g.acks.size.toLocaleString()} | ${g.n.toLocaleString()} | ${B(g.v)} | ${g.exact.toLocaleString()} / ${g.comparable.toLocaleString()} | ${spell.join(" · ")} |`);
}

out.push("");
out.push("## Unresolved filed names, by assets");
out.push("");
out.push("These carry no ticker today. Most are collective trusts with no registered");
out.push("analogue established yet, or names too terse to identify a manager. A name");
out.push("here is **not** a claim that no fund exists — only that wampo will not guess.");
out.push("");
out.push("| Filed name | Holdings | Assets |");
out.push("|---|---:|---:|");
const ur = [...unresolved].sort((a, b) => b[1].v - a[1].v).slice(0, 400);
for (const [name, u] of ur) out.push(`| ${esc(name)} | ${u.n.toLocaleString()} | ${B(u.v)} |`);
out.push("");
out.push(`_${unresolved.size.toLocaleString()} distinct unresolved names in total; the ${ur.length} largest by assets are listed._`);
out.push("");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.join("\n"));
console.log(`wrote ${OUT}`);
console.log(`  ${ranked.length.toLocaleString()} tickers, ${matched.toLocaleString()}/${rows.toLocaleString()} holdings resolved (${(100 * matched / rows).toFixed(1)}%)`);
console.log(`  ${unresolved.size.toLocaleString()} distinct unresolved names`);
