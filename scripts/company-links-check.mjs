#!/usr/bin/env node
/* wampo — validator for data/company-links.json (a sponsor's own website and,
 * where one exists publicly, a benefits guide no older than two years).
 *
 * WHY: everything else wampo publishes comes from a FILING and can be
 * re-parsed, re-audited and re-derived. A company website is not in Form 5500.
 * It is the first curated fact since `data.js`, which this project's record
 * says "predates the pipeline and goes stale" — so the discipline that keeps
 * `fund-facts.json` honest is applied here too: every claim carries its source
 * and the date it was true, and this checker refuses anything that does not.
 *
 * THE TWO-YEAR RULE IS THE POINT. A benefits guide is a dated artifact: the
 * motivating example is an "actives 2027 ae" annual-enrolment microsite, which
 * is replaced every autumn. A link nobody re-checks is worse than no link,
 * because the page goes on presenting it as current. So a benefits entry whose
 * `asOf` is over two years old FAILS rather than warns.
 *
 * Usage: node scripts/company-links-check.mjs [path]   (exit 1 on any failure)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2] || path.join(root, "data", "company-links.json");
const today = new Date().toISOString().slice(0, 10);
const MAX_BENEFITS_AGE_DAYS = 730;   // the owner's two years, mechanically
const SITE_STALE_DAYS = 365;         // a homepage is stable; a year is a warning

let doc;
try { doc = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (e) { console.log(`FAIL cannot read ${file}: ${e.message}`); process.exit(1); }

const companies = doc && doc.companies;
if (!companies || typeof companies !== "object" || Array.isArray(companies)) {
  console.log('FAIL top-level "companies" object missing'); process.exit(1);
}

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
/* HTTPS only: an http:// link on a benefits page is a live downgrade for a
 * reader who may type credentials into whatever it opens. */
const isUrl = (s) => typeof s === "string" && /^https:\/\/[^\s"']+$/.test(s);
const ageDays = (d) => Math.floor((Date.parse(today) - Date.parse(d)) / 86400000);

/* NOT the company, however high they rank. These dominate a search for any
 * employer's benefits and go stale invisibly, under someone else's byline. */
const AGGREGATOR = /(^|\.)(glassdoor|indeed|ziprecruiter|themuse|builtin[a-z]*|jobcase|levels\.fyi|comparably|payscale|salary|monster|simplyhired|linkedin|facebook|twitter|x|wikipedia|crunchbase|bloomberg|reuters|joingerald)\.(com|org|net|fyi|co\.uk)$/i;
/* A method must say how hard the evidence is. `fetched` means the page was
 * read; `search` means an index described it and the host was unreachable. */
const METHODS = new Set(["fetched", "search"]);

const fails = [], warns = [];
let n = 0, withSite = 0, withBenefits = 0, fetched = 0, searched = 0, gated = 0;

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

for (const [ein, c] of Object.entries(companies)) {
  n++;
  const bad = (m) => fails.push(`${ein}: ${m}`);
  const warn = (m) => warns.push(`${ein}: ${m}`);

  /* EIN is the key because one company files several plans and they share one
   * website. Nine digits, no dash -- the same spelling plans-all.json uses. */
  if (!/^\d{9}$/.test(ein)) bad("key is not a 9-digit EIN (no dash)");
  if (!c || typeof c !== "object") { bad("entry is not an object"); continue; }
  if (typeof c.company !== "string" || c.company.trim().length < 2) bad("company name missing");

  // ---- the website -------------------------------------------------------
  if (c.site != null) {
    withSite++;
    const s = c.site;
    if (!s || typeof s !== "object") bad("site is not an object");
    else {
      if (!isUrl(s.url)) bad(`site.url is not an https URL: ${JSON.stringify(s.url)}`);
      else if (AGGREGATOR.test(host(s.url))) bad(`site.url is an aggregator, not the company: ${host(s.url)}`);
      if (!isDate(s.asOf)) bad("site.asOf (YYYY-MM-DD) missing");
      else if (ageDays(s.asOf) < 0) bad(`site.asOf is in the future: ${s.asOf}`);
      else if (ageDays(s.asOf) > SITE_STALE_DAYS) warn(`site.asOf is ${ageDays(s.asOf)} days old — re-verify`);
      if (!METHODS.has(s.method)) bad(`site.method must be "fetched" or "search", got ${JSON.stringify(s.method)}`);
      else if (s.method === "fetched") fetched++; else searched++;
      /* The evidence is the whole point: a quote from the page, or the search
       * result that named it. An entry with no evidence is a recalled URL. */
      if (typeof s.evidence !== "string" || s.evidence.trim().length < 10)
        bad("site.evidence missing — record the quote or result that convinced you");
    }
  }

  // ---- the benefits guide, and the two-year rule --------------------------
  if (c.benefits != null) {
    withBenefits++;
    const b = c.benefits;
    if (!b || typeof b !== "object") bad("benefits is not an object");
    else {
      if (!isUrl(b.url)) bad(`benefits.url is not an https URL: ${JSON.stringify(b.url)}`);
      else if (AGGREGATOR.test(host(b.url))) bad(`benefits.url is an aggregator, not the company: ${host(b.url)}`);
      if (!isDate(b.asOf)) bad("benefits.asOf (YYYY-MM-DD) missing");
      else if (ageDays(b.asOf) < 0) bad(`benefits.asOf is in the future: ${b.asOf}`);
      else if (ageDays(b.asOf) > MAX_BENEFITS_AGE_DAYS)
        bad(`benefits link is ${ageDays(b.asOf)} days old (limit ${MAX_BENEFITS_AGE_DAYS}) — re-verify or remove it`);
      if (!METHODS.has(b.method)) bad(`benefits.method must be "fetched" or "search", got ${JSON.stringify(b.method)}`);
      if (typeof b.evidence !== "string" || b.evidence.trim().length < 10)
        bad("benefits.evidence missing — record the quote or result that convinced you");
      /* coversYear is the guide's OWN stated year, where it states one. It is
       * what makes an annual-enrolment microsite's rot visible a year early. */
      if (b.coversYear != null) {
        const y = +b.coversYear, thisYear = +today.slice(0, 4);
        if (!Number.isInteger(y) || y < 2000 || y > thisYear + 2) bad(`coversYear implausible: ${b.coversYear}`);
        else if (y < thisYear - 1) warn(`benefits guide covers ${y} — a newer edition probably exists`);
      }
      /* A gated portal is not a defect, but it must be LABELLED: an adviser
       * cannot open one, so presenting it unmarked wastes their click. */
      if (b.gated === true) { gated++; warn(`benefits link is login-gated (${host(b.url)}) — a reader cannot open it`); }
      else if (b.gated != null && b.gated !== false) bad("benefits.gated must be true or false");
    }
  }
}

for (const f of fails) console.log("FAIL " + f);
for (const w of warns) console.log("warn " + w);
console.log(`company-links: ${n} companies · ${withSite} with a site · ${withBenefits} with a benefits link` +
  ` · evidence ${fetched} fetched / ${searched} search` + (gated ? ` · ${gated} gated` : ""));
if (fails.length) { console.log(`company-links-check: ${fails.length} failure(s)`); process.exit(1); }
console.log("company-links-check: OK");
