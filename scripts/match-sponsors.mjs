#!/usr/bin/env node
/* wampo — map Form 5500 sponsor names to listed-company tickers.
 *
 * WHY THIS IS NOT A LOOKUP. A Form 5500 is filed by a legal entity, and that
 * entity is routinely not the listed company:
 *   GE Vernova's plan is filed by "Ropcor, Inc."
 *   Alphabet's is filed by "Google LLC"
 * and the reverse trap is worse — an entity whose name merely BEGINS with a
 * listed company's is often a different institution entirely:
 *   "General Electric Credit Union"    is not General Electric
 *   "McGraw-Hill Education Holdings"   was divested from S&P Global in 2013
 *   "Target Foundation"                is not Target
 * The old matcher ended in a bare startsWith and produced exactly those.
 *
 * So this is built the way the fund matcher was built, and for the same reason:
 * coverage is easy and precision is the product. Every rule below exists to
 * refuse a match, and the script's real output is the SAMPLE it prints for
 * hand review, not the count.
 *
 * The curated list in companies.json stays. It is not redundant: it carries the
 * cases name matching CANNOT reach (Ropcor -> GEV, Google -> GOOGL), each of
 * which is a fact about corporate structure that no string comparison knows.
 *
 * Usage:
 *   node scripts/match-sponsors.mjs [--companies sec-companies.json] [--sample 40]
 *   node scripts/match-sponsors.mjs --min-participants 5000   (the review slice)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const COMPANIES = arg("--companies", path.join(root, "sec-companies.json"));
const SAMPLE = +arg("--sample", 40);
const MIN_PARTS = +arg("--min-participants", 0);

/* ---- normalization ---------------------------------------------------------
 * Corporate suffixes carry no identity and differ freely between the SEC title
 * and the Form 5500 sponsor name ("APPLE INC" vs "Apple Inc."). Everything else
 * is kept, because everything else is what tells two entities apart. */
const SUFFIX = new Set(["inc", "incorporated", "corp", "corporation", "co", "company",
  "companies", "holding", "holdings", "group", "llc", "llp", "lp", "plc", "ltd", "limited",
  "sa", "nv", "ag", "se", "the", "and", "of", "&"]);
const norm = (s) => String(s).toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => norm(s).split(" ").filter((w) => w && !SUFFIX.has(w));

/* An entity whose name begins with a listed company's but which is NOT that
 * company. This is the guard that matters, and it is about the KIND of
 * institution named, not about extra words: most extra words are innocent
 * ("UnitedHealth Group Incorporated", "Union Pacific Railroad Company",
 * "Medtronic Puerto Rico Operations" are all the same employer). */
const NOT_THE_SAME_EMPLOYER = /\b(credit union|federal credit|savings bank|foundation|charitable|trust|university|college|school|academy|hospital|health system|medical center|clinic|church|ministries|diocese|synagogue|temple|municipal|county|city of|state of|township|authority|cooperative|co op|mutual insurance|fraternal|union local|local \d+|district council|pension|welfare fund|association|society|institute|museum|library)\b/i;

/* A company name that is an ordinary word matches ordinary employers. "BOX",
 * "GAP", "SQUARE" and friends need an exact match or nothing — a prefix rule on
 * a one-word common name is a licence to mis-attribute. */
const COMMON_WORD = /^(box|gap|square|target|apple|shell|arch|axis|bond|cage|core|edge|era|fair|fast|five|flex|four|gold|grid|hope|key|life|link|live|loop|main|match|maxi|next|node|nova|one|open|park|peak|pine|plus|post|prime|pure|rise|rock|root|sage|salt|shift|sky|snap|solo|sun|talk|tech|tree|true|unit|vault|wave|well|west|wing|zip)$/i;

const raw = JSON.parse(fs.readFileSync(COMPANIES, "utf8"));
const companies = raw.companies.map(([ticker, title, cik]) => ({ ticker, title, cik, key: tokens(title) }))
  .filter((c) => c.key.length);

/* Index by leading token so a sponsor only considers plausible companies.
 * Without it this is 110k sponsors x 10k companies and does not finish. */
const byLead = new Map();
for (const c of companies) {
  const arr = byLead.get(c.key[0]) || [];
  arr.push(c);
  byLead.set(c.key[0], arr);
}
for (const arr of byLead.values()) arr.sort((a, b) => b.key.length - a.key.length);

export function matchSponsor(sponsorName) {
  const st = tokens(sponsorName);
  if (!st.length) return null;
  const cands = byLead.get(st[0]);
  if (!cands) return null;

  const hits = [];
  for (const c of cands) {
    if (c.key.length > st.length) continue;
    let all = true;
    for (let i = 0; i < c.key.length; i++) if (st[i] !== c.key[i]) { all = false; break; }
    if (!all) continue;                                  // must match from the START
    const rest = st.slice(c.key.length);
    // a one-word ordinary name is only ever an exact match
    if (c.key.length === 1 && COMMON_WORD.test(c.key[0]) && rest.length) continue;
    if (NOT_THE_SAME_EMPLOYER.test(rest.join(" "))) continue;
    hits.push({ c, extra: rest.length, exact: rest.length === 0 });
  }
  if (!hits.length) return null;

  // Prefer the longest company name matched (most specific), then exactness.
  hits.sort((a, b) => b.c.key.length - a.c.key.length || a.extra - b.extra);
  const best = hits[0];
  // AMBIGUITY: two different companies matching equally well means the sponsor
  // name does not identify one of them. Refuse rather than pick.
  const tied = hits.filter((h) => h.c.key.length === best.c.key.length && h.c.ticker !== best.c.ticker);
  if (tied.length) return null;
  return { ticker: best.c.ticker, title: best.c.title, cik: best.c.cik,
    why: best.exact ? "exact" : "prefix+" + best.extra };
}

if (process.argv[1] && process.argv[1].endsWith("match-sponsors.mjs")) {
  const j = JSON.parse(fs.readFileSync(path.join(root, "plans-list.json"), "utf8"));
  const c = j.cols, n = c.name.length;
  const curated = new Set();
  try {
    for (const x of JSON.parse(fs.readFileSync(path.join(root, "scripts/companies.json"), "utf8")).companies)
      curated.add(x.ticker);
  } catch { /* optional */ }

  let scanned = 0, matched = 0, already = 0, newTk = 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    if (c.parts[i] < MIN_PARTS) continue;
    scanned++;
    const r = matchSponsor(c.name[i] || "");
    if (!r) continue;
    matched++;
    if (c.tk[i]) { already++; continue; }
    newTk++;
    rows.push({ name: c.name[i], ticker: r.ticker, title: r.title, why: r.why,
      parts: c.parts[i], curated: curated.has(r.ticker) });
  }
  console.log(`sponsors scanned      : ${scanned.toLocaleString()}${MIN_PARTS ? ` (>= ${MIN_PARTS} participants)` : ""}`);
  console.log(`  matched a registrant: ${matched.toLocaleString()}`);
  console.log(`  already had a ticker: ${already.toLocaleString()}`);
  console.log(`  NEW attributions    : ${newTk.toLocaleString()}\n`);

  rows.sort((a, b) => b.parts - a.parts);
  console.log(`Largest new attributions — READ THESE. A wrong one is a wrong company on a live page.\n`);
  for (const r of rows.slice(0, SAMPLE)) {
    console.log(`  ${r.ticker.padEnd(6)} ${String(r.parts).padStart(7)}p  ${r.name.slice(0, 44).padEnd(46)} -> ${r.title.slice(0, 40)}  [${r.why}]`);
  }
}
