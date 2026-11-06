#!/usr/bin/env node
/* wampo — DIFFERENTIAL for the valuation-note label, through BOTH copies of
 * renderRow: origin/main's app.js against the working tree's, one renderer per
 * copy, everything else held fixed.
 *
 * NARROWING is a superset BY CONSTRUCTION: `isValuationNoteRow` opens with
 * VN_TRIGGER, so a row whose name lacks the trigger cannot change verdict. The
 * narrowing gates the RENDER and not only the comparison. A sampled
 * non-candidate control discharges it.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.VALNOTE_BASE || "origin/main";
const TMP = process.env.TMPDIR || "/tmp";
const baseApp = path.join(TMP, "valnote-base-app.js");
writeFileSync(baseApp, execFileSync("git", ["-C", ROOT, "show", `${BASE}:app.js`], { encoding: "utf8", maxBuffer: 1 << 28 }));

/* CONTROLS on the two sides, anchored on the whole declaration — a token keyed
 * on a name matches every name it is a prefix of. */
const ARM = "function isValuationNoteRow(";
const live = readFileSync(path.join(ROOT, "app.js"), "utf8");
if (!live.includes(ARM)) throw new Error("CONTROL FAILED: the working tree does not carry the twin");
if (readFileSync(baseApp, "utf8").includes(ARM)) throw new Error(`CONTROL FAILED: ${BASE} ALREADY carries the twin`);
if (!readFileSync(baseApp, "utf8").includes("function isNamelessFundRow(")) throw new Error(`CONTROL FAILED: ${BASE} lacks the host predicate`);

const A = buildRenderer({ appjs: baseApp });                       // before
const B = buildRenderer({ appjs: path.join(ROOT, "app.js") });     // after
const lidx = JSON.parse(readFileSync(path.join(ROOT, "lineups-index.json"), "utf8")).plans;
const d = loadPlans();
const plansArg = d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") }));
A.setPlans(plansArg); B.setPlans(plansArg);
/* CONTROL: the two renderers must actually be different programs */
const probe = { name: "Instruments measured at NAV", nameRaw: "Instruments measured at NAV", type: "", value: 1 };
const pa = A.renderRow({ sponsorName: "x" }, { ...probe }, "menu", 1), pb = B.renderRow({ sponsorName: "x" }, { ...probe }, "menu", 1);
if (String(pa && pa.shownType) === String(pb && pb.shownType))
  throw new Error("CONTROL FAILED: both renderers answer the same on the motivating row — one copy did not load");

const TRIGGER = /(fair\s*valu\w*\s+hierarch|measured\s+(at|in)\b|at\s+net\s+asset\s+valu|at\s+nav\b|\bnav\b|\bN[\s.]*A[\s.]*V\b)/i;
const members = new Map();
for (const row of d.rows) {
  const p = { ack: d.get(row, "ack"), mtiaAck: d.get(row, "mtiaAck"), ein: d.get(row, "ein"), pn: d.get(row, "pn"),
    participants: +d.get(row, "partEOY") || +d.get(row, "participants") || 0,
    sponsorName: String(d.get(row, "sponsorName") || "").trim(), ticker: d.get(row, "ticker") };
  const s = servedLineup(p, lidx);
  if (!s.ack) continue;
  if (!members.has(s.ack)) members.set(s.ack, []);
  members.get(s.ack).push(p);
}

const moved = [];
let rows = 0, cand = 0, ctrl = 0, ctrlDiff = 0, memberBefore = 0, memberAfter = 0;
const cells = ["name", "tk", "er", "star", "shownType"];
for (const sh of readdirSync(path.join(ROOT, "data/lineups")).sort()) {
  if (!sh.endsWith(".json")) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(path.join(ROOT, "data/lineups", sh), "utf8")))) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    for (const raw of e.funds) {
      rows++;
      const nm = String(raw.name || "");
      const isCand = TRIGGER.test(nm);
      if (isCand) cand++; else { ctrl++; if (ctrl % 83 !== 0) continue; }
      const f = { ...raw, nameRaw: nm, name: null };
      const fa = { ...f, name: A.clean(nm) }, fb = { ...f, name: B.clean(nm) };
      const a = A.renderRow(lead, fa, "menu", total), b = B.renderRow(lead, fb, "menu", total);
      if (a) memberBefore++; if (b) memberAfter++;
      if (!a || !b) { if (!!a !== !!b) moved.push({ ack, nm, why: "ROW MEMBERSHIP", ppl: mem.reduce((x,m)=>x+m.participants,0) }); continue; }
      const diff = cells.filter((k) => String(a[k] ?? "") !== String(b[k] ?? ""));
      if (!diff.length) continue;
      if (!isCand) { ctrlDiff++; console.log(`  CONTROL DIFFERS ${JSON.stringify(nm)} ${diff.join(",")}`); continue; }
      moved.push({ ack, nm, diff, ppl: mem.reduce((x,m)=>x+m.participants,0),
        pct: total ? (+raw.value||0)/total*100 : 0,
        before: Object.fromEntries(diff.map((k)=>[k, a[k]])), after: Object.fromEntries(diff.map((k)=>[k, b[k]])) });
    }
  }
}
const f = (x) => x.toLocaleString();
const byCell = {}; for (const m of moved) for (const k of (m.diff || ["membership"])) byCell[k] = (byCell[k] || 0) + 1;
const plans = new Map(moved.map((m) => [m.ack, m.ppl]));
console.log(`\nrows ${f(rows)}  candidates ${f(cand)}  non-candidates sampled ${f(Math.floor(ctrl/83))} of ${f(ctrl)}`);
console.log(`row membership: ${f(memberBefore)} -> ${f(memberAfter)}`);
console.log(`CONTROL (non-candidate rows differing): ${ctrlDiff}`);
console.log(`\nMOVED: ${f(moved.length)} rows / ${f(plans.size)} served entries / ${f([...plans.values()].reduce((a,b)=>a+b,0))} readers`);
console.log(`  by cell: ${Object.entries(byCell).map(([k,v])=>`${k} ${v}`).join(" · ") || "(none)"}`);
const feeW = moved.filter((m) => m.diff && m.diff.includes("er") && (m.after.er == null || m.after.er === ""));
const feeG = moved.filter((m) => m.diff && m.diff.includes("er") && m.before.er == null && m.after.er != null);
console.log(`  fee WITHDRAWN ${feeW.length}   fee GAINED ${feeG.length}   ticker moved ${byCell.tk || 0}   name moved ${byCell.name || 0}`);
moved.sort((a, b) => b.ppl - a.ppl);
console.log(`\nALL MOVED, by readers:`);
for (const m of moved) console.log(`  ${String(m.ppl).padStart(7)}p ${(m.pct||0).toFixed(1).padStart(5)}%  ${(m.diff||["membership"]).join(",").padEnd(14)} ${m.nm.slice(0, 56)}`);
if (ctrlDiff) { console.error(`\nCONTROL FAILED: ${ctrlDiff} non-candidate rows differ — the narrowing is not a superset`); process.exit(1); }
