#!/usr/bin/env node
/* Print the store's DOMINANT PARSER_VERSION and the share of acks at it.
 *
 * WHY THIS EXISTS. `mirror.sh` warns, after any mirror that changes
 * data-producing code, that "main's DATA was produced by the PREVIOUS code and
 * is now stale". On 2026-10-03 that warning fired on a mirror where main ended
 * up with PARSER_VERSION 199 AND a pv-199 store — a matched pair, because the
 * documented procedure is dispatch on dev, verdict, then mirror the pair. The
 * warning could not tell the difference: it compared CODE between the branches
 * and never asked what produced the store it was shipping.
 *
 * A check that cries wolf on the normal path is worse than no check, because an
 * operator who has dismissed it four times will dismiss the fifth time, when it
 * is right. So the warning now asks this script, and only fires when the store
 * really is behind its code.
 *
 * Usage:
 *   node scripts/store-pv.mjs            -> "199 99.93"
 *   node scripts/store-pv.mjs --verbose  -> a human line
 */
import { loadStatus } from "./lib-schema.mjs";

const st = loadStatus();
const counts = new Map();
for (const ack of Object.keys(st.plans)) {
  const pv = st.at(ack).pv;
  counts.set(pv, (counts.get(pv) || 0) + 1);
}
const total = [...counts.values()].reduce((a, b) => a + b, 0);
if (!total) { console.error("store-pv: no acks in lineups-status.json"); process.exit(1); }
const [pv, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
const share = ((n / total) * 100).toFixed(2);
if (process.argv.includes("--verbose"))
  console.log(`dominant pv ${pv} covers ${n.toLocaleString()} of ${total.toLocaleString()} acks (${share}%)`);
else console.log(`${pv} ${share}`);
