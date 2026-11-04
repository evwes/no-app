#!/usr/bin/env node
/* wampo — WHICH FUND-DATA SOURCE ANSWERS A GITHUB RUNNER?
 *
 * WHY THIS EXISTS. `fetch-fund-facts.mjs` is Yahoo-only and the schedule in
 * `.github/workflows/fund-facts.yml` was disabled 2026-09-18 because runs #1
 * and #2 took HTTP 429 from Yahoo on EVERY call -- Yahoo rate-limits GitHub's
 * runner IP range outright. So "a runner has open network" is true and useless
 * on its own: the question is which HOST will talk to one.
 *
 * Building a second fetcher before answering that would be the same mistake
 * twice. This probes candidates and reports, in one run of a couple of minutes,
 * so the real fetcher is written against a source already shown to work.
 *
 * It WRITES NOTHING. It is a measurement, and its output is the evidence for
 * what to build next.
 *
 * Run it on a runner (open egress). In the CCR sandbox every host returns
 * ENOTFOUND, which is a fact about the sandbox and NOT about the source --
 * `http=000` is a report on the query, so this script labels an unreachable
 * host "BLOCKED HERE" rather than "dead".
 */
const UA = "wampo-fund-facts/1.0 (+https://github.com/evwes/no-app)";
const t0 = Date.now();

/* Probe funds chosen because they are the top of the actual worklist:
 *   FXAIX  Fidelity 500 Index -- 11.4M readers, a registered mutual fund
 *   VTTVX  Vanguard Target Retirement 2025 FUND -- the registered fund the
 *          page currently shows as a COMPARABLE for the Trust
 *   92202V583  Vanguard Target Retirement 2025 TRUST I -- a collective trust.
 *          No ticker exists; a CUSIP does. This is the owner's example and the
 *          hardest case, because no SEC filing covers a CIT. */
const CANDIDATES = [
  { name: "SEC company_tickers_mf (ticker <-> series/class)",
    url: "https://www.sec.gov/files/company_tickers_mf.json",
    want: "identity", note: "SEC permits automated access with a declared UA" },
  { name: "SEC submissions API (fund registrant filings)",
    url: "https://data.sec.gov/submissions/CIK0000036405.json",
    want: "identity" },
  { name: "Vanguard public fund profile API",
    url: "https://investor.vanguard.com/investment-products/mutual-funds/profile/api/VTTVX/price",
    want: "er+ytd" },
  { name: "Vanguard investor profile page (VTTVX)",
    url: "https://investor.vanguard.com/investment-products/mutual-funds/profile/vttvx",
    want: "er+ytd" },
  { name: "Vanguard TRUST profile page (the owner's example, CUSIP 92202V583)",
    url: "https://investor.vanguard.com/investment-products/mutual-funds/profile/1465",
    want: "er+ytd" },
  { name: "Fidelity fund profile page (FXAIX)",
    url: "https://fundresearch.fidelity.com/mutual-funds/summary/315911750",
    want: "er+ytd" },
  { name: "Yahoo quoteSummary (the source that 429'd runs #1 and #2)",
    url: "https://query2.finance.yahoo.com/v10/finance/quoteSummary/FXAIX?modules=fundProfile",
    want: "er+ytd", note: "expected to fail -- kept as the CONTROL" },
  { name: "Stooq daily CSV (no key, no auth)",
    url: "https://stooq.com/q/d/l/?s=fxaix.us&i=d",
    want: "price-only" },
];

const out = [];
for (const c of CANDIDATES) {
  const started = Date.now();
  let line;
  try {
    const ctl = AbortSignal.timeout(20000);
    const r = await fetch(c.url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: ctl });
    const body = await r.text();
    const ms = Date.now() - started;
    /* a 200 with an empty or tiny body is not an answer -- the bytes matter,
     * which is the same reason a curl probe must print size_download */
    const bytes = body.length;
    const verdict = r.ok && bytes > 200 ? "ANSWERS" : r.ok ? "200 BUT EMPTY" : `HTTP ${r.status}`;
    /* does the payload plausibly carry what we need? cheap, honest sniff */
    const hasEr = /expense\s*ratio|expenseRatio|netExpRatio|"er"|acquired fund fees/i.test(body);
    const hasYtd = /ytd|year[- ]to[- ]date/i.test(body);
    line = { src: c.name, verdict, http: r.status, bytes, ms, hasEr, hasYtd, want: c.want, note: c.note || "" };
  } catch (e) {
    const ms = Date.now() - started;
    const blocked = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|certificate|timeout|aborted/i.test(e.message);
    line = { src: c.name, verdict: blocked ? "BLOCKED HERE (says nothing about the source)" : "ERROR",
      http: 0, bytes: 0, ms, hasEr: false, hasYtd: false, want: c.want, note: e.message.slice(0, 70) };
  }
  out.push(line);
  console.log(
    `${line.verdict.padEnd(44)} ${String(line.http).padStart(3)} ${String(line.bytes).padStart(9)}B ` +
    `${String(line.ms).padStart(6)}ms  er=${line.hasEr ? "Y" : "-"} ytd=${line.hasYtd ? "Y" : "-"}  ${line.src}`);
  if (line.note) console.log(`${" ".repeat(20)}note: ${line.note}`);
  await new Promise((r) => setTimeout(r, 400));   // politeness between hosts
}

const answering = out.filter((x) => x.verdict === "ANSWERS");
const usable = answering.filter((x) => x.want !== "price-only" && (x.hasEr || x.want === "identity"));
console.log(`\n${answering.length} of ${out.length} candidates answered; ${usable.length} carry what fund-facts needs.`);
if (!answering.length) {
  console.log("NOTHING ANSWERED. If this ran on a runner, every candidate is blocked and the next");
  console.log("step is an API key as a repo secret. If it ran in the sandbox, that is expected and");
  console.log("the result says nothing -- re-run it on a runner.");
}
console.log(`probe finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
