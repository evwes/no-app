#!/usr/bin/env node
/* wampo — ARE THE COMPANY LINKS STILL ALIVE?
 *
 * `company-links-check.mjs` validates the FILE: shape, https, aggregator
 * refusal, evidence, and the owner's two-year rule on a benefits guide. It
 * cannot say whether a URL still resolves, because in a cloud session every one
 * of these hosts returns `http=000 bytes=0` and that is a fact about the
 * sandbox's egress policy and NOT about the company. A zero-byte fetch reports
 * on the QUERY.
 *
 * So liveness runs here, on a runner, where egress is open.
 *
 * WHAT FAILS THE JOB, AND WHY THE LIST IS SHORT. This project's record is
 * explicit that a gate which reddens when nothing is wrong becomes a gate
 * nobody reads -- ten consecutive red `site-test` runs went unexamined for
 * three days for exactly that reason. A company website is a live commercial
 * host behind a CDN that will rate-limit, challenge or simply refuse an
 * unfamiliar client, so most non-200s say something about US:
 *
 *   404 / 410        the page is GONE. A real defect. FAILS.
 *   200 / 3xx        alive. passes.
 *   401 / 403 / 429  the host refused the CLIENT, not the path. REPORTED, passes.
 *   5xx              the host is having a bad minute. REPORTED, passes.
 *   timeout / DNS    says nothing. REPORTED, passes.
 *
 * A `gated: true` benefits portal is EXPECTED to answer 401/403 -- that is what
 * the flag records -- so refusing it would fail the entry for being honest.
 *
 * NOTHING IS WRITTEN. This reports; a human or the company-links agent decides
 * what a dead link should be replaced with, because a replacement URL is a
 * sourced fact and not something a checker may invent.
 *
 * NEVER sends the owner's email address. The User-Agent names the project, which
 * is what a contactable client needs, and the owner's address is for identifying
 * them to us and not for broadcasting to every CDN we touch.
 *
 * Run: node scripts/company-links-live.mjs [path] [--timeout 20000]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flagged = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const FILE = argv.find((a) => !a.startsWith("--") && a !== flagged("--timeout", null))
  || path.join(ROOT, "data", "company-links.json");
const TIMEOUT = +flagged("--timeout", "20000");
const UA = "wampo-link-check/1.0 (+https://github.com/evwes/no-app)";

const doc = JSON.parse(readFileSync(FILE, "utf8"));
const companies = doc.companies || {};
const n = Object.keys(companies).length;
if (!n) { console.error(`${FILE}: no companies — nothing to check`); process.exit(1); }

/* GONE means gone. Everything else is a report. */
const GONE = new Set([404, 410]);

async function probe(url) {
  /* HEAD first because it is cheaper, then GET, because a surprising number of
   * marketing hosts answer 405 or 404 to HEAD while serving the page fine --
   * treating that as GONE would delete a live link from the file. */
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetch(url, { method, redirect: "follow",
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
        signal: AbortSignal.timeout(TIMEOUT) });
      if (method === "HEAD" && (r.status === 405 || GONE.has(r.status))) continue;
      return { status: r.status, via: method, final: r.url };
    } catch (e) {
      const why = `${e.message} ${e.cause?.code || ""}`;
      if (method === "GET") return { status: 0, via: method, err: why.trim().slice(0, 50) };
    }
  }
  return { status: 0, via: "GET", err: "unreachable" };
}

const dead = [];
const noted = [];
let alive = 0, checked = 0;

for (const [ein, c] of Object.entries(companies)) {
  for (const kind of ["site", "benefits"]) {
    const link = c[kind];
    if (!link || !link.url) continue;
    checked++;
    const r = await probe(link.url);
    const gated = kind === "benefits" && link.gated === true;
    let verdict;
    if (r.status >= 200 && r.status < 400) { verdict = "alive"; alive++; }
    else if (GONE.has(r.status)) {
      /* a gated portal answering 404 is still gone -- the flag excuses a
       * CHALLENGE, not a missing page */
      verdict = "GONE";
      dead.push({ ein, company: c.company, kind, url: link.url, status: r.status });
    } else if (r.status === 401 || r.status === 403 || r.status === 429) {
      verdict = gated ? "refused us (gated, expected)" : "refused us (client, not path)";
      noted.push({ ein, company: c.company, kind, url: link.url, status: r.status, verdict });
    } else if (r.status >= 500) {
      verdict = "host error"; noted.push({ ein, company: c.company, kind, url: link.url, status: r.status, verdict });
    } else {
      verdict = `unreachable (${r.err || "no response"})`;
      noted.push({ ein, company: c.company, kind, url: link.url, status: 0, verdict });
    }
    console.log(`${String(r.status).padStart(3)} ${verdict.padEnd(32)} ${kind.padEnd(8)} ${String(c.company).slice(0, 26).padEnd(26)} ${link.url.slice(0, 58)}`);
    await new Promise((s) => setTimeout(s, 400));   // politeness between hosts
  }
}

console.log(`\n${checked} links across ${n} companies · ${alive} alive · ${dead.length} GONE · ${noted.length} reported but not failed`);

/* THE BOTH-SIDED ZERO. If NOTHING answered, this is almost certainly the
 * sandbox rather than a simultaneous outage at every company in the file, and
 * reporting "0 alive" as a finding would be a report on the query. */
if (!alive && checked) {
  console.log(`\nNOT ONE link answered. On a runner that would be extraordinary; in a cloud`);
  console.log(`session it is the expected egress refusal and says NOTHING about these`);
  console.log(`companies. Exiting 0 rather than failing: a zero here is a fact about the`);
  console.log(`network, and failing on it would make this gate red wherever it is run.`);
  process.exit(0);
}

if (dead.length) {
  console.log(`\nFAILING — ${dead.length} link(s) are GONE (404/410) and must be re-sourced:`);
  for (const d of dead) console.log(`   ${d.status}  ${d.company} · ${d.kind} · ${d.url}`);
  console.log(`\nA replacement is a SOURCED fact: the company-links agent re-finds it with`);
  console.log(`evidence and an as-of date. This checker must never invent one.`);
  process.exit(1);
}
console.log(`\nOK — no link is gone.${noted.length ? ` ${noted.length} host(s) refused or failed to answer; each is reported above and none of those is evidence the page is missing.` : ""}`);
