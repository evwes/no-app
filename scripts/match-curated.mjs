#!/usr/bin/env node
/* wampo — the CURATED sponsor->company match.
 *
 * Lifted out of build-data.mjs on 2026-08-24 so that apply-sponsor-tickers.mjs
 * uses the same function rather than a copy of it. Two copies of a matching
 * rule drift, and a drifted copy shows a different company on the live site
 * than the pipeline would.
 *
 * This list carries what string comparison cannot know — that GE Vernova's plan
 * is filed by "Ropcor, Inc.", that Alphabet's is filed by "Google LLC" — plus
 * the display names shown on a plan card. It always wins over the SEC-registrant
 * match in scripts/match-sponsors.mjs.
 */
import { readFileSync } from "node:fs";

export function norm(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export const { companies } = JSON.parse(readFileSync(new URL("./companies.json", import.meta.url), "utf8"));
for (const c of companies) c.aliasNorms = c.aliases.map(norm);
export const curatedTickers = new Set(companies.map((c) => c.ticker));

/* Entities whose name begins with a public company's but which are NOT that
 * company. The old rule ended in a bare `startsWith(a)`, so any sponsor whose
 * name merely opened with an alias inherited its ticker:
 *   "GENERAL ELECTRIC CREDIT UNION"  -> GE    (a credit union, not GE)
 *   "MCGRAW-HILL EDUCATION HOLDINGS" -> SPGI  (divested from S&P Global, 2013)
 *
 * The distinction is not "extra words" — most extra words are innocent:
 * "UnitedHealth Group Incorporated", "United Parcel Service Of America",
 * "Union Pacific Railroad Company", "Medtronic Puerto Rico Operations" are all
 * the same employer group. What disqualifies a match is a token naming a
 * DIFFERENT KIND OF INSTITUTION, which no amount of corporate-suffix stripping
 * will turn back into the parent. */
export const NOT_THE_SAME_EMPLOYER = /\b(credit union|federal credit|savings bank|foundation|charitable|university|college|school district|academy|hospital|health system|medical center|clinic|church|ministries|diocese|synagogue|temple|municipal|county of|city of|state of|township|authority|cooperative|co-?op|mutual insurance|fraternal|union local|local \d+|district council|pension fund|welfare fund)\b/i;

export function matchCurated(sponsorNorm) {
  for (const c of companies) {
    for (const a of c.aliasNorms) {
      if (sponsorNorm === a) return c;
      // a prefix match is only the same employer when what FOLLOWS the alias
      // does not name a different kind of institution
      if (sponsorNorm.startsWith(a)) {
        const rest = sponsorNorm.slice(a.length);
        if (!NOT_THE_SAME_EMPLOYER.test(rest)) return c;
      }
    }
  }
  return null;
}
