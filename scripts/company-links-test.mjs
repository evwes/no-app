#!/usr/bin/env node
/* wampo — the tether for scripts/company-links-check.mjs.
 *
 * A checker that only ever passes is decorative. This project's record is
 * explicit that every condition needs a case where it is the ONLY protection,
 * and that a control which cannot fail proves nothing. So each refusal below
 * starts from a VALID entry and breaks exactly one thing, and the checker must
 * fail BY NAME. The suite also asserts the valid entry passes, because a
 * checker that rejects everything would satisfy every must-fail case.
 *
 * Usage: node scripts/company-links-test.mjs    (exit 1 if any case misbehaves)
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHECK = path.join(here, "company-links-check.mjs");
const dir = mkdtempSync(path.join(tmpdir(), "cl-"));
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const daysAgo = (n) => iso(Date.now() - n * 86400000);

/* the control: a fully valid entry. Every must-fail case below is this object
 * with ONE field broken, so a failure can only be attributed to that field. */
const good = () => ({
  company: "Example Corporation",
  site: {
    url: "https://www.example.com", asOf: daysAgo(10), method: "fetched",
    evidence: "The page's footer reads 'Example Corporation'.",
  },
  benefits: {
    url: "https://benefits.example.com/guide", asOf: daysAgo(30), method: "fetched",
    evidence: "Page titled 'Example Corporation Benefits Guide'.", gated: false,
  },
});
const doc = (companies) => ({ companies });

function run(obj) {
  const f = path.join(dir, "t.json");
  writeFileSync(f, JSON.stringify(obj, null, 1));
  try {
    return { code: 0, out: execFileSync("node", [CHECK, f], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

let bad = 0;
const must = (label, obj, wantFail, needle) => {
  const r = run(obj);
  const failed = r.code !== 0;
  if (failed !== wantFail) {
    console.log(`MISBEHAVED ${label}: expected ${wantFail ? "FAIL" : "PASS"}, got exit ${r.code}`);
    console.log(r.out.split("\n").slice(0, 4).map((l) => "    " + l).join("\n"));
    bad++; return;
  }
  if (wantFail && needle && !r.out.includes(needle)) {
    console.log(`MISBEHAVED ${label}: failed, but not by name — wanted ${JSON.stringify(needle)}`);
    console.log(r.out.split("\n").slice(0, 4).map((l) => "    " + l).join("\n"));
    bad++; return;
  }
  console.log(`ok   ${label}`);
};

const mut = (f) => { const c = good(); f(c); return doc({ "123456789": c }); };

// the control FIRST: if this does not pass, every must-fail below is worthless
must("a valid entry passes", doc({ "123456789": good() }), false);

// --- structural ------------------------------------------------------------
must("missing companies object", { funds: {} }, true, "companies");
must("key is not a 9-digit EIN", doc({ "12-3456789": good() }), true, "9-digit EIN");
must("company name missing", mut((c) => { c.company = ""; }), true, "company name missing");

// --- the website -----------------------------------------------------------
must("site url is http, not https", mut((c) => { c.site.url = "http://www.example.com"; }), true, "https URL");
must("site url is an aggregator", mut((c) => { c.site.url = "https://www.glassdoor.com/example"; }), true, "aggregator");
must("site asOf missing", mut((c) => { delete c.site.asOf; }), true, "site.asOf");
must("site asOf in the future", mut((c) => { c.site.asOf = iso(Date.now() + 5 * 86400000); }), true, "future");
must("site method invalid", mut((c) => { c.site.method = "recalled"; }), true, "fetched");
must("site evidence missing", mut((c) => { c.site.evidence = "short"; }), true, "evidence missing");

// --- the benefits guide and THE TWO-YEAR RULE ------------------------------
must("benefits url is an aggregator", mut((c) => { c.benefits.url = "https://www.indeed.com/cmp/example/benefits"; }), true, "aggregator");
must("benefits asOf missing", mut((c) => { delete c.benefits.asOf; }), true, "benefits.asOf");
/* the owner's requirement, mechanically: 731 days must fail and 729 must not,
 * so the boundary itself is pinned rather than the general idea */
must("benefits link 731 days old FAILS the two-year rule",
  mut((c) => { c.benefits.asOf = daysAgo(731); }), true, "limit 730");
must("benefits link 729 days old still passes",
  mut((c) => { c.benefits.asOf = daysAgo(729); }), false);
must("benefits method invalid", mut((c) => { c.benefits.method = "guessed"; }), true, "fetched");
must("benefits evidence missing", mut((c) => { delete c.benefits.evidence; }), true, "evidence missing");
must("coversYear implausible", mut((c) => { c.benefits.coversYear = 1983; }), true, "coversYear implausible");
must("gated is not a boolean", mut((c) => { c.benefits.gated = "yes"; }), true, "gated must be true or false");

/* a gated portal is LABELLED, not refused: it is real, it is just unopenable,
 * and refusing it would push the agent toward recording something worse */
must("a gated portal warns but passes", mut((c) => { c.benefits.gated = true; }), false);
/* an entry with NO benefits link at all is honest and must pass -- the agent is
 * told to leave it empty rather than record an aggregator */
must("no benefits link at all passes", mut((c) => { delete c.benefits; }), false);

/* and the committed file itself must be valid, or the suite is testing a
 * fixture while the real data rots */
const r = (() => {
  try { return { code: 0, out: execFileSync("node", [CHECK], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") }; }
})();
if (r.code !== 0) { console.log("MISBEHAVED the committed data/company-links.json does not validate"); console.log(r.out); bad++; }
else console.log("ok   the committed data/company-links.json validates");

rmSync(dir, { recursive: true, force: true });
console.log(bad ? `company-links-test: ${bad} case(s) misbehaved` : "company-links-test: OK — every refusal fires by name, and the valid cases pass");
process.exit(bad ? 1 : 0);
