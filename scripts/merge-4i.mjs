#!/usr/bin/env node
/* Merge matrix parse deltas (results-*.json) into the lineup stores:
 * lineups-status.json, data/lineups/ shards, lineups-index.json. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { indexFlags, JUNK_NAME_RE, AGG_DISCLOSURE, GENERIC_TYPE_NAME } from "./lib-4i.mjs";

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
    if (e.confident && e.funds) {
      // agg: the OLD lineup was dominated (>=90% of its sum) by rows named
      // like accounting categories — losing it is a cleanup, not a broken
      // menu, and the triage below skips it. Added after v111's withdrawal
      // of five REAL 3-4 row Vanguard menus sailed under the old n>=5
      // floor: the floor can only drop to n>=3 with this discriminator,
      // or every justified 3-row aggregate cleanup floods the audit.
      const sum = e.funds.reduce((x, f) => x + (f.value || 0), 0);
      // AGG_DISCLOSURE, never NOT_FUND_SHAPED: the broad list's total-prefix
      // arm reads "Total Stock Market Index" menus as aggregates — the exact
      // v110 regression this floor-lowering exists to catch (the unit check
      // caught the same reuse HERE before it shipped)
      const aggSum = e.funds.reduce((x, f) => {
        const nm = String(f.name || "").trim();
        return x + (AGG_DISCLOSURE.test(nm) || GENERIC_TYPE_NAME.test(nm) ? (f.value || 0) : 0);
      }, 0);
      prevShape[a] = { n: e.funds.length, r: e.coverageRatio || 0, agg: sum > 0 && aggSum / sum >= 0.9, fb: e.fb || null };
    }
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
/* Also used by the loss triage below, which is why it is hoisted out of the
 * try block: an ack that is no longer any plan's CURRENT filing cannot be a
 * parser regression, whatever its old lineup looked like. */
let currentAcks = null;
try {
  const pd = JSON.parse(readFileSync("plans-all.json", "utf8"));
  const ai = pd.fields.indexOf("ack");
  const current = new Set(pd.plans.map((r) => r[ai]));
  for (const t of JSON.parse(readFileSync("mtias.json", "utf8")).trusts) current.add(t.ack);
  currentAcks = current;
  let purged = 0;
  for (const ack of Object.keys(status.plans)) {
    if (!current.has(ack)) { delete status.plans[ack]; delete buckets[shardOf(ack)][ack]; purged++; }
  }
  if (purged) console.log(`purged ${purged} orphaned entries (superseded filings)`);
} catch { /* plans-all absent in some local invocations — skip the purge */ }

// COLLECTIVE-TRUST typing from Schedule D. Filers routinely describe CIT
// holdings as "Mutual Fund" in the schedule-of-assets description column —
// R.H. White did it for 13 Great Gray T. Rowe Price trusts worth $49.0M, 70%
// of the plan. Schedule D reports those same trusts with exact dollar values,
// so an exact value match retypes the row and marks it `cit`, which stops the
// site pricing it off a mutual-fund share class it does not hold.
try {
  const pa = JSON.parse(readFileSync("plans-all.json", "utf8"));
  const ai = pa.fields.indexOf("ack"), ci = pa.fields.indexOf("cctVals");
  if (ci !== -1) {
    const byAck = new Map();
    for (const r of pa.plans) if (r[ci]) byAck.set(r[ai], new Set(String(r[ci]).split(" ").map(Number)));
    let plansTyped = 0, rowsTyped = 0;
    for (let i = 0; i < SHARDS; i++) {
      for (const [ack, e] of Object.entries(buckets[i])) {
        const vals = byAck.get(ack);
        if (!vals || !e.funds) continue;
        let hit = 0;
        for (const f of e.funds) {
          if (!vals.has(f.value) || f.cit) continue;
          f.cit = 1;
          f.type = "Collective trust";
          hit++;
        }
        if (hit) { plansTyped++; rowsTyped += hit; }
      }
    }
    console.log(`Schedule D collective-trust typing: ${rowsTyped} holdings retyped across ${plansTyped} plans`);
  }
} catch (e) { console.warn("CIT typing skipped: " + e.message); }

// junk-name demotion: a stored entry whose fund names carry form/statement
// vocabulary must not STAY confident just because its PDF became
// undownloadable — S3-withdrawn filings keep their last parse forever, so
// parser-side junk guards can never reach them (the 2026-08-18 audit
// carried the same 8 lineup-junk HIGHs across every run; all 8 were
// e:'download' at pv 36-43). A future successful re-parse writes a fresh
// entry and is judged on its own merits.
let demoted = 0;
const demotedAcks = new Set();
for (let i = 0; i < SHARDS; i++) {
  for (const [ack, e] of Object.entries(buckets[i])) {
    if (!e.confident || !e.funds) continue;
    const junk = e.funds.find((f) => JUNK_NAME_RE.test(f.name || ""));
    if (!junk) continue;
    e.confident = false;
    if (status.plans[ack]) status.plans[ack].c = 0;
    demoted++;
    demotedAcks.add(ack);
    console.log(`junk-name demotion: ${ack} — "${String(junk.name).slice(0, 60)}"`);
  }
}
if (demoted) console.log(`demoted ${demoted} junk-named confident entries (stored, unfetchable)`);

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
// the detail shard on expand); bits 13-15 = document-shape enum (DS_ENUM,
// frozen order); 4096 = the parser found the filing's
// schedule but it reports investments in AGGREGATE (dx=stmt: MetLife,
// Comcast, Albertsons class, plus the generic-dominant lineups v111
// withdrew) — the frontend explains that instead of implying an unread
// schedule.
/* `few` that is really an AGGREGATE FILING (2026-09-09). A plan whose whole
 * schedule is one or two lines summing to the plan's own assets did not defeat
 * our reading — it reported in aggregate, exactly like the `stmt` class, and
 * saying "we could not read it" of such a filing is false. The test is the
 * DOMINANT row: >=80% of the parsed sum, under a name that is a whole-plan
 * wrapper rather than a fund.
 *
 * The dominant-row form is deliberate and measured. Requiring EVERY row to be
 * aggregate-shaped labelled 35 plans; the dominant form labels 63 (61,976
 * participants, $3.3B) and the rows it admits are "Master Pooled Separate
 * Account [99%]", "403(b) annuity contracts and custodial accounts [100%]",
 * "Value of Int in Regist Invest Co. [91%]". What it still refuses is the
 * parser's own debris — "of participation [91%]", "PNC Bank [96%]",
 * "Beginning of the year - End of the year [100%]" — which is the whole point:
 * the page makes a claim about the FILING here, so a junk row must never be
 * allowed to stand in for one.
 *
 * AGG_VEHICLE is narrow on purpose and lives here because this is merge's
 * question. GENERIC_TYPE_NAME and AGG_DISCLOSURE are imported rather than
 * re-typed — three copies of a vocabulary have drifted apart once already. */
const AGG_VEHICLE = /^(?:master |group |unallocated )?(?:pooled )?separate account.*|^.*annuity contracts?(?: and custodial accounts?)?$|^(?:self[- ]?directed|individually directed|self managed) brokerage accounts?$|^403\(b\) .*(?:contracts?|accounts?)$|^interest in .*|^value of int(?:erest)? in .*/i;
function filedAggregate(st, ack) {
  if (st.dx !== "few" || !(st.rt >= 90 && st.rt <= 110)) return false;
  const e = buckets[shardOf(ack)][ack];
  const funds = (e && e.funds) || [];
  if (!funds.length) return false;
  const sum = funds.reduce((a, f) => a + (+f.value || 0), 0);
  if (!(sum > 0)) return false;
  const dom = funds.reduce((a, f) => ((+f.value || 0) > (+a.value || 0) ? f : a), funds[0]);
  if ((+dom.value || 0) / sum < 0.8) return false;
  const n = String(dom.name || "").trim();
  return AGG_DISCLOSURE.test(n) || GENERIC_TYPE_NAME.test(n) || AGG_VEHICLE.test(n);
}

/* TRUST-HELD BUT UNLINKED (bit 65536, v-index 2026-09-11).
 *
 * A plan whose Schedule D names a master trust we could not follow still tells
 * us so in its own 4i rows: "Plan Interest in Master Trust at Fair Value".
 * Without this, such a plan falls through to the document-shape sentence and
 * is told something FALSE about its filing — Conagra (28,863 participants) was
 * shown "those pages are not present in the public copy" while we had read six
 * rows from exactly those pages, and Genentech ($14.35B) was shown "we could
 * not read it" when the real cause is that no MTIA filing exists under the EIN
 * its Schedule D names.
 *
 * The pattern demands the row say the PLAN HOLDS AN INTEREST in a trust. A
 * bare mention of "trust" is not enough: fund names like "Collective Trust
 * Fund" contain the word and are ordinary holdings, and this bit makes a claim
 * on the page. Measured over the live store: 6 plans, 75,808 participants,
 * $16.8B — 4 band-hi, 1 trust, 1 few, so it is deliberately NOT keyed to dx. */
const TRUST_INTEREST_ROW =
  /\b(?:interest in|participation in|investment in)\b[^|]{0,40}\bmaster trust\b|\bmaster trust\b[^|]{0,30}\bat (?:fair|contract) value\b|^plan(?:'s)? interest\b/i;
function trustHeldUnlinked(ack) {
  const e = buckets[shardOf(ack)][ack];
  const funds = (e && e.funds) || [];
  return funds.some((f) => TRUST_INTEREST_ROW.test(String(f.name || "").trim()));
}

/* Document-shape enum for plans-index bits 13-15. Order is FROZEN: the
 * frontend decodes by number, so appending is safe and reordering is not. */
const DS_ENUM = { noattach: 1, notable: 2, omitted: 3, absent: 4, scanned: 5, readfail: 6, unread: 7 };
try {
  const pa = JSON.parse(readFileSync("plans-all.json", "utf8"));
  const ai = pa.fields.indexOf("ack"), mi = pa.fields.indexOf("mtiaAck");
  const bits = pa.plans.map((r) => {
    let b = index[r[ai]] || 0;
    if (r[mi] && (index[r[mi]] || 0) & 1) b |= 2048;
    const st = status.plans[r[ai]];
    if (st && !st.c && (st.dx === "stmt" || filedAggregate(st, r[ai])) && !(b & (1 | 2048))) b |= 4096;
    /* v113 data: bits 13-15 carry the DOCUMENT SHAPE as a 3-bit enum so a
     * plan with no lineup can state the real reason instead of the hedge
     * "scanned/absent, or held through a trust". Read ONLY when there is no
     * lineup to show — `ds` describes the FILING, not our success, and must
     * be conditioned (a band-hi plan legitimately carries ds=readfail). */
    /* Trust-held-but-unlinked outranks the document-shape sentence, because
     * that sentence would describe the FILING when the filing is fine and the
     * gap is the missing trust return. Gated on having no lineup from any
     * source and no trust link of its own. */
    if (st && !st.c && !(b & (1 | 2048 | 4096)) && !r[mi] && trustHeldUnlinked(r[ai])) b |= 65536;
    if (st && !st.c && !(b & (1 | 2048 | 4096 | 65536)) && DS_ENUM[st.ds]) b |= DS_ENUM[st.ds] << 13;
    return b;
  });
  writeFileSync("plans-index.json", JSON.stringify({ generated: new Date().toISOString(), count: bits.length, bits }));
  console.log(`wrote plans-index.json: ${bits.length} rows, ${bits.filter((b) => b & 2048).length} trust-lineup plans, ${bits.filter((b) => b & 4096).length} filed-in-aggregate, ${bits.filter((b) => (b >> 13) & 7).length} with a document-shape reason, ${bits.filter((b) => b & 65536).length} trust-held-but-unlinked`);
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
  // junk-name demotions are excluded: the demotion IS the triage verdict
  // (the entry's own fund names prove it was never a real menu)
  /* SUPERSESSION IS NOT REGRESSION — the fix for run #186, which raised 4,741
   * HIGH findings of which 4,737 were false and buried the four real ones.
   *
   * That run ingested a new filing season, so thousands of plans moved to a
   * newer ack. The triage compared ack to ack and never asked whether the
   * PLAN had moved, so every superseded filing looked like a lineup that had
   * "lost confidence". Triaged by hand afterwards: 4,505 were replaced by a
   * newer filing that is itself confident, 250 by a newer filing that is not
   * yet, 12 were master-trust acks, and ZERO were the only shape that is
   * actually a regression — the same ack still current with its lineup gone.
   *
   * An ack that is no longer any plan's current filing is never displayed
   * again, so its lineup cannot have regressed for a reader. Only acks still
   * in plans-all (or mtias.json) can. When plans-all is unavailable the set is
   * null and the filter is skipped rather than silently passing everything. */
  let superseded = 0;
  const realish = lost.filter((a) => {
    const ack = a.split(" ")[0];
    if (demotedAcks.has(ack)) return false;
    if (currentAcks && !currentAcks.has(ack)) { superseded++; return false; }
    const s = prevShape[ack];
    // floor lowered n>=5 -> n>=3 in-band, gated on !agg (see the capture
    // comment above): a lost 3-fund Vanguard menu at ratio 1.0 is exactly
    // as much a regression as a lost 20-fund one
    return s && !s.agg && (s.n >= 7 || (s.n >= 3 && s.r >= 0.7 && s.r <= 1.3));
  });
  if (superseded) console.log(`  of those losses, ${superseded} are superseded filings (the plan moved to a newer ack) — not regressions, not triaged`);
  else if (!currentAcks) console.log("  supersession filter SKIPPED (plans-all unavailable) — losses may include superseded filings");
  console.log(`  real-menu-shaped losses (auto-triage → audit HIGH): ${realish.length}`);
  writeFileSync("losses-triage.txt", realish.join("\n") + (realish.length ? "\n" : ""));

  /* SOURCE SWAPS — the blind spot the loss triage cannot see.
   *
   * Everything above compares CONFIDENT to NOT-CONFIDENT. A plan that stays
   * confident while its lineup SOURCE changes — served from its prior-year
   * filing one run, from its own newest filing the next — moves no count at
   * all: `c` stays 1, the totals do not budge, the triage never looks.
   *
   * Measured on run #254 (2026-09-10), which swapped 157 plans that way:
   * 94 held or grew their row count, and the 10 that shrank were FINE because
   * their ratio moved TOWARD 1.0 (Extron 55 rows @ 0.81 -> 7 @ 0.97) — the
   * signature of the prior year having carried extra rows, not of lost
   * detail. Row count alone would have flagged all ten and been wrong ten
   * times. What actually discriminates is the ratio moving AWAY from 1.0, and
   * exactly 2 did: Prevost Car 15 rows @ 0.90 -> 15 @ 0.46 and Pediatrics
   * West 33 @ 0.95 -> 37 @ 0.51. Nothing fabricated — the rows are real — but
   * each now publishes a menu accounting for about half the plan's money,
   * clearing isConfident only because the floor is 0.45.
   *
   * WARN, not HIGH: a swap is usually an upgrade and the population is tiny,
   * so this must not drown the four known-baseline HIGHs. It exists so the
   * next one is seen at all. */
  {
    const swaps = [];
    for (const [a, m] of Object.entries(status.plans)) {
      if (!m.c) continue;
      const before = prevShape[a];
      if (!before || !before.fb) continue;       // was NOT served from a prior year
      if (m.fb) continue;                         // still is: not a swap
      const e = buckets[shardOf(a)][a];
      if (!e || !e.funds) continue;
      const r = e.coverageRatio || 0;
      const drift = Math.abs(1 - r) - Math.abs(1 - before.r);
      if (drift > 0.25) {
        swaps.push(`${a} ${before.n} rows @ ${before.r.toFixed(2)} (from ${before.fb}) -> ${e.funds.length} rows @ ${r.toFixed(2)}`);
      }
    }
    console.log(`  source swaps that DEGRADED coverage (prior-year -> own filing, ratio >0.25 further from 1.0): ${swaps.length}`);
    for (const line of swaps.slice(0, 15)) console.log(`    ${line}`);
    writeFileSync("swaps-degraded.txt", swaps.join("\n") + (swaps.length ? "\n" : ""));
  }
}
