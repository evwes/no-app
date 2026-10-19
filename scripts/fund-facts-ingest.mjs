#!/usr/bin/env node
/* wampo — ingest a provider's published fund list into data/fund-facts.json.
 *
 * WHY THIS EXISTS: half of every expense ratio this site prints is a pattern
 * estimate keyed on the fund's NAME — 49.9% of published fee cells, $254B of
 * menu value — and 54,013 rows of Principal alone carry no symbol and no fee at
 * all. `data/fund-facts.json` is the only place a sourced figure may live, and
 * it sat EMPTY from 2026-09-24 because nothing in the build container can reach
 * a fund company: `principalam.com` and `sec.gov` both fail to resolve. The
 * missing piece was never the file or the agent, it was a way to get the data
 * IN from outside. This is that way.
 *
 * It takes a CSV the owner captured from the provider's own site, plus the
 * provenance of that capture, and writes entries that satisfy
 * `fund-facts-check.mjs` unchanged. It REFUSES to write anything whose source
 * URL or as-of date is missing, because a figure without its receipt is the
 * thing this file exists to prevent.
 *
 * Usage:
 *   node scripts/fund-facts-ingest.mjs <file.csv> \
 *     --provider "Principal Asset Management" \
 *     --source   "https://www.principalam.com/us/fund-finder" \
 *     --as-of    2026-10-19 \
 *     [--kind collective-trust] [--basis vehicle-stated] [--dry-run]
 *
 * The CSV needs a header row and two columns, under any of these spellings:
 *   name   | fund | fund name | marketing name | investment
 *   er     | expense ratio | expense | total annual operating expense | ter | net expense
 * Optional columns, used when present:
 *   ticker      -> the entry goes in `funds` (a real ticker) instead of `vehicles`
 *   kind        -> per-row override of --kind
 *   share class -> recorded on the entry
 *
 * A row whose expense ratio is blank, "n/a", "--" or unparseable is SKIPPED and
 * counted, never written as zero: a missing fee and a zero fee are different
 * claims, and conflating them is how a fabricated number gets published.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(root, "data", "fund-facts.json");
const today = new Date().toISOString().slice(0, 10);

/* ---- arguments ----------------------------------------------------------- */
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const has = (n) => argv.includes(`--${n}`);
const csvPath = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1]?.startsWith("--") !== true);
const provider = flag("provider");
const source = flag("source");
const asOf = flag("as-of");
const kindDefault = flag("kind") || "collective-trust";
const basis = flag("basis") || "vehicle-stated";
const dry = has("dry-run");

const die = (m) => { console.error(`fund-facts-ingest: ${m}`); process.exit(1); };
if (!csvPath) die("no CSV path given. See the header of this file for usage.");
if (!fs.existsSync(csvPath)) die(`cannot find ${csvPath}`);
if (!provider) die("--provider is required (the firm whose published figures these are)");
if (!/^https?:\/\/\S+$/.test(source || "")) die("--source must be the URL the figures were read from");
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || "")) die("--as-of must be the date the provider's page was current, as YYYY-MM-DD");
if (asOf > today) die(`--as-of ${asOf} is in the future`);

/* ---- CSV ----------------------------------------------------------------- */
/* a minimal RFC4180 reader: quoted fields, doubled quotes, embedded commas and
 * newlines. Written out rather than depending on a package, because this file
 * must run in a bare checkout. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  const src = text.replace(/^﻿/, "");               // strip a BOM Excel adds
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const NAME_COL = ["name", "fund", "fund name", "fundname", "marketing name", "marketingname", "investment", "investment option", "option"];
const ER_COL = ["er", "expense ratio", "expenseratio", "expense", "expenses", "total annual operating expense",
  "total annual operating expenses", "total expense ratio", "ter", "net expense", "net expense ratio",
  "net expenses", "gross expense ratio", "total annual fund operating expenses"];
const TK_COL = ["ticker", "symbol"];
const KIND_COL = ["kind", "vehicle", "type", "asset type"];
const SC_COL = ["share class", "shareclass", "class"];

const norm = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const pick = (header, names) => {
  for (const want of names) { const i = header.findIndex((h) => norm(h) === want); if (i >= 0) return i; }
  /* a second pass allowing the wanted label to be CONTAINED in the header cell,
   * because provider exports carry footnote markers and units in the heading
   * ("Total Annual Operating Expense (%)", "Expense Ratio 1") */
  for (const want of names) { const i = header.findIndex((h) => norm(h).includes(want)); if (i >= 0) return i; }
  return -1;
};

const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
if (rows.length < 2) die("the CSV has no data rows (a header row plus at least one fund is required)");
const header = rows[0];
const iName = pick(header, NAME_COL);
const iEr = pick(header, ER_COL);
const iTk = pick(header, TK_COL);
const iKind = pick(header, KIND_COL);
const iSc = pick(header, SC_COL);
if (iName < 0) die(`no fund-name column found. Header was: ${header.join(" | ")}\n  rename a column to one of: ${NAME_COL.join(", ")}`);
if (iEr < 0) die(`no expense-ratio column found. Header was: ${header.join(" | ")}\n  rename a column to one of: ${ER_COL.slice(0, 6).join(", ")}`);

/* a percent as the provider prints it: "0.28", "0.28%", "28 bps", "0,28" */
function parseEr(raw) {
  const s = String(raw || "").trim();
  if (!s || /^(n\/?a|na|none|-+|—|–|\.|not available)$/i.test(s)) return null;
  const bps = /^([\d.,]+)\s*(?:bps|bp|basis points?)$/i.exec(s);
  if (bps) { const v = Number(bps[1].replace(/,/g, "")); return Number.isFinite(v) ? v / 100 : null; }
  const m = /-?[\d.,]+/.exec(s.replace(/,(\d{2})\b/, ".$1"));
  if (!m) return null;
  const v = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

const slug = (s) => String(s).toLowerCase().replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/* ---- build --------------------------------------------------------------- */
const doc = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
doc.funds = doc.funds || {};
doc.vehicles = doc.vehicles || {};
const pSlug = slug(provider);
if (!pSlug) die(`--provider ${JSON.stringify(provider)} does not slugify to anything usable`);

const skipped = [];
let wroteV = 0, wroteF = 0, updated = 0;
for (const r of rows.slice(1)) {
  const name = String(r[iName] ?? "").trim();
  if (name.length < 3) { skipped.push([name || "(blank)", "name too short"]); continue; }
  const er = parseEr(r[iEr]);
  if (er === null) { skipped.push([name, `no usable expense ratio (${JSON.stringify(String(r[iEr] ?? "").trim())})`]); continue; }
  if (!(er >= 0 && er <= 3)) { skipped.push([name, `expense ratio ${er} outside 0..3 percent — check the units`]); continue; }
  const ticker = iTk >= 0 ? String(r[iTk] ?? "").trim().toUpperCase() : "";
  const shareClass = iSc >= 0 ? String(r[iSc] ?? "").trim() : "";

  if (/^[A-Z0-9.]{1,10}$/.test(ticker)) {
    const prev = doc.funds[ticker];
    doc.funds[ticker] = { ...(prev || {}), name, er, erAsOf: asOf, erSource: source, updated: today };
    prev ? updated++ : wroteF++;
    continue;
  }
  const kindRaw = iKind >= 0 ? norm(r[iKind]) : "";
  const kind = /collective|cit|trust/.test(kindRaw) ? "collective-trust"
    : /separate/.test(kindRaw) ? "separate-account"
    : /guarantee/.test(kindRaw) ? "guaranteed-option"
    : /stable/.test(kindRaw) ? "stable-value"
    : kindRaw ? "other" : kindDefault;
  const key = `${pSlug}::${slug(name)}`;
  if (!/^[a-z0-9][a-z0-9-]*::[a-z0-9][a-z0-9-]*$/.test(key)) { skipped.push([name, "name does not slugify to a usable key"]); continue; }
  const prev = doc.vehicles[key];
  doc.vehicles[key] = {
    ...(prev || {}), name, provider, kind, er, erAsOf: asOf, erSource: source,
    erBasis: basis, updated: today, ...(shareClass ? { shareClass } : {}),
  };
  prev ? updated++ : wroteV++;
}

doc._schema = doc._schema || "one entry per ticker (upper-case key) in `funds`, one per `provider::fund` slug pair in `vehicles`; every figure carries its as-of date and its source URL; validated by node scripts/fund-facts-check.mjs; nothing from memory, nothing undated";
const ordered = {
  _schema: doc._schema,
  funds: Object.fromEntries(Object.entries(doc.funds).sort()),
  vehicles: Object.fromEntries(Object.entries(doc.vehicles).sort()),
};

console.log(`${path.basename(csvPath)}: ${rows.length - 1} data rows`);
console.log(`  provider ${JSON.stringify(provider)}  source ${source}  as of ${asOf}  basis ${basis}`);
console.log(`  new: ${wroteV} vehicles, ${wroteF} tickers   updated: ${updated}   skipped: ${skipped.length}`);
for (const [n, why] of skipped.slice(0, 15)) console.log(`    SKIP ${JSON.stringify(n.slice(0, 54))} — ${why}`);
if (skipped.length > 15) console.log(`    ... and ${skipped.length - 15} more`);
console.log(`  file now holds ${Object.keys(ordered.funds).length} ticker and ${Object.keys(ordered.vehicles).length} vehicle entries`);

if (dry) { console.log("\n--dry-run: nothing written. Drop the flag to write."); process.exit(0); }
fs.writeFileSync(FILE, JSON.stringify(ordered, null, 2) + "\n");
console.log(`\nwrote ${path.relative(root, FILE)} — now run: node scripts/fund-facts-check.mjs`);
