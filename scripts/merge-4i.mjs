#!/usr/bin/env node
/* Merge matrix parse deltas (results-*.json) into the lineup stores:
 * lineups-status.json, data/lineups/ shards, lineups-index.json. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { indexFlags } from "./lib-4i.mjs";

const SHARDS = 64;
const shardOf = (ack) => {
  let h = 0;
  for (const c of ack) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % SHARDS;
};
const shardName = (i) => `data/lineups/${String(i).padStart(2, "0")}.json`;
mkdirSync("data/lineups", { recursive: true });

const buckets = Array.from({ length: SHARDS }, () => ({}));
for (let i = 0; i < SHARDS; i++) {
  try { Object.assign(buckets[i], JSON.parse(readFileSync(shardName(i), "utf8"))); } catch { /* first run */ }
}
let status = { plans: {} };
try { status = JSON.parse(readFileSync("lineups-status.json", "utf8")); } catch { /* first run */ }
// snapshot pre-merge confidence for the post-merge diff report
const prevConfident = new Set(Object.entries(status.plans).filter(([, m]) => m.c).map(([a]) => a));
// snapshot the SHAPE of every confident entry too: a loss whose old parse
// looked like a real menu (many rows, sane ratio) is a regression candidate
// that must be triaged, not scrolled past — v49 lost 754 real menus and
// only a by-hand classification caught it (accuracy log 2026-08-11)
const prevShape = {};
for (let i = 0; i < SHARDS; i++) {
  for (const [a, e] of Object.entries(buckets[i])) {
    if (e.confident && e.funds) prevShape[a] = { n: e.funds.length, r: e.coverageRatio || 0 };
  }
}

const files = readdirSync(".").filter((f) => /^results-\d+\.json$/.test(f));
console.log(`merging ${files.length} delta files`);
let applied = 0;
for (const f of files) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  for (const [ack, meta] of Object.entries(d.status)) {
    status.plans[ack] = meta;
    const b = buckets[shardOf(ack)];
    // an ack absent from d.entries means "leave the stored entry alone"
    // (download failures preserve the previous parse); an explicit null
    // means "remove it" (parse produced nothing worth keeping)
    if (ack in d.entries) {
      const entry = d.entries[ack];
      if (entry) b[ack] = entry;
      else delete b[ack];
    }
    applied++;
  }
}

// purge entries for superseded filings: when a newer filing replaces an
// ack in plans-all, the old entry is never displayed again but its stale
// data (parsed under years-old rules) polluted the audit and the payload —
// 6,132 orphans found 2026-07-26
try {
  const pd = JSON.parse(readFileSync("plans-all.json", "utf8"));
  const ai = pd.fields.indexOf("ack");
  const current = new Set(pd.plans.map((r) => r[ai]));
  for (const t of JSON.parse(readFileSync("mtias.json", "utf8")).trusts) current.add(t.ack);
  let purged = 0;
  for (const ack of Object.keys(status.plans)) {
    if (!current.has(ack)) { delete status.plans[ack]; delete buckets[shardOf(ack)][ack]; purged++; }
  }
  if (purged) console.log(`purged ${purged} orphaned entries (superseded filings)`);
} catch { /* plans-all absent in some local invocations — skip the purge */ }

status.generated = new Date().toISOString();
writeFileSync("lineups-status.json", JSON.stringify(status));
const index = {};
for (let i = 0; i < SHARDS; i++) {
  writeFileSync(shardName(i), JSON.stringify(buckets[i]));
  for (const [ack, e] of Object.entries(buckets[i])) index[ack] = indexFlags(e);
}
writeFileSync("lineups-index.json", JSON.stringify({ generated: new Date().toISOString(), shards: SHARDS, plans: index }));

// Row-aligned effective bits for the site's boot (plans-list.json order ==
// plans-all order): the browser no longer knows acks at boot, so the flags
// are positional. Extra bits beyond indexFlags: 2048 = this plan's linked
// master trust has a confident lineup (the trust ack itself arrives with
// the detail shard on expand).
try {
  const pa = JSON.parse(readFileSync("plans-all.json", "utf8"));
  const ai = pa.fields.indexOf("ack"), mi = pa.fields.indexOf("mtiaAck");
  const bits = pa.plans.map((r) => {
    let b = index[r[ai]] || 0;
    if (r[mi] && (index[r[mi]] || 0) & 1) b |= 2048;
    return b;
  });
  writeFileSync("plans-index.json", JSON.stringify({ generated: new Date().toISOString(), count: bits.length, bits }));
  console.log(`wrote plans-index.json: ${bits.length} rows, ${bits.filter((b) => b & 2048).length} trust-lineup plans`);
} catch (e) { console.warn("plans-index skipped (plans-all absent?): " + e.message); }

const vals = Object.values(status.plans);
console.log(`merged ${applied} entries; totals: ${vals.length} parsed, ${vals.filter((p) => p.c).length} confident lineups, ${vals.filter((p) => p.f).length} with features`);

// confidence diff report: every run prints WHAT moved, so a regression is
// visible in the log without a by-hand diff (v39 shipped +13/-38 that only
// a manual diff caught — see accuracy log 2026-08-04). LOSSES especially
// must be sampled against filing text before the next parser change.
{
  const gained = [], lost = [];
  for (const [a, m] of Object.entries(status.plans)) {
    if (m.c && !prevConfident.has(a)) gained.push(a);
    if (!m.c && prevConfident.has(a)) lost.push(a);
  }
  for (const a of prevConfident) if (!(a in status.plans)) lost.push(a + " (entry purged)");
  console.log(`\n== CONFIDENCE DIFF vs previous data: +${gained.length} / -${lost.length}`);
  if (gained.length) console.log(`  gained: ${gained.slice(0, 25).join(", ")}${gained.length > 25 ? ` … +${gained.length - 25} more` : ""}`);
  if (lost.length) console.log(`  LOST:   ${lost.slice(0, 25).join(", ")}${lost.length > 25 ? ` … +${lost.length - 25} more` : ""}`);
  const fb = vals.filter((p) => p.fb).length;
  if (fb) console.log(`  prior-year fallback lineups in store: ${fb}`);
  // LOSS TRIAGE: losses whose OLD parse was real-menu-shaped go to the
  // audit as HIGH findings — junk-cleanup losses (tiny/edge-band parses)
  // are expected on guard changes, but a lost 20-row ratio-1.0 menu means
  // the new version broke something real. audit-data reads this file.
  const realish = lost.filter((a) => {
    const s = prevShape[a.split(" ")[0]];
    return s && (s.n >= 7 || (s.n >= 5 && s.r >= 0.7 && s.r <= 1.3));
  });
  console.log(`  real-menu-shaped losses (auto-triage → audit HIGH): ${realish.length}`);
  writeFileSync("losses-triage.txt", realish.join("\n") + (realish.length ? "\n" : ""));
}
