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

const files = readdirSync(".").filter((f) => /^results-\d+\.json$/.test(f));
console.log(`merging ${files.length} delta files`);
let applied = 0;
for (const f of files) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  for (const [ack, meta] of Object.entries(d.status)) {
    status.plans[ack] = meta;
    const entry = d.entries[ack];
    const b = buckets[shardOf(ack)];
    if (entry) b[ack] = entry;
    else delete b[ack];
    applied++;
  }
}

status.generated = new Date().toISOString();
writeFileSync("lineups-status.json", JSON.stringify(status));
const index = {};
for (let i = 0; i < SHARDS; i++) {
  writeFileSync(shardName(i), JSON.stringify(buckets[i]));
  for (const [ack, e] of Object.entries(buckets[i])) index[ack] = indexFlags(e);
}
writeFileSync("lineups-index.json", JSON.stringify({ generated: new Date().toISOString(), shards: SHARDS, plans: index }));

const vals = Object.values(status.plans);
console.log(`merged ${applied} entries; totals: ${vals.length} parsed, ${vals.filter((p) => p.c).length} confident lineups, ${vals.filter((p) => p.f).length} with features`);
