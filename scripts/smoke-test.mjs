/* wampo — deploy smoke test. Boots the site exactly as a visitor would and
 * asserts the four plan archetypes render: a big full-form plan with filed
 * features, a master-trust plan whose lineup comes from the trust, a
 * short-form filer (which must EXPLAIN its gaps, not just show dashes), and a
 * FILED-IN-AGGREGATE plan whose own filing reports investments in one line
 * (MetLife's class) — that page must say so rather than leave a blank a
 * reader would take for "nothing was filed".
 * Specimen plans are picked from the shipped data at runtime so the test
 * never goes stale as filings roll over. Run: node scripts/smoke-test.mjs
 * (requires playwright; serves the repo root on :8901). */
import { readFileSync } from "fs";
import { spawn } from "child_process";
import vm from "node:vm";
import { chromium } from "playwright";

const PORT = 8901;
const fail = (msg) => { console.error("SMOKE FAIL: " + msg); process.exit(1); };

// pick specimens from the data
const d = JSON.parse(readFileSync("plans-all.json", "utf8"));
const F = d.fields; const ix = Object.fromEntries(F.map((f, i) => [f, i]));
const g = (r, f) => r[ix[f]];
const idx = JSON.parse(readFileSync("lineups-index.json", "utf8")).plans;
const dash = (ein) => String(ein).slice(0, 2) + "-" + String(ein).slice(2);
const id = (r) => `${dash(g(r, "ein"))}|${g(r, "pn")}|${g(r, "ticker") || ""}`;

const byAssets = [...d.plans].sort((a, b) => (g(b, "assetsEOY") || 0) - (g(a, "assetsEOY") || 0));
const fullPlan = byAssets.find((r) => !g(r, "sf") && ((idx[g(r, "ack")] || 0) & 5) === 5);
const trustPlan = byAssets.find((r) => !g(r, "sf") && g(r, "mtiaAck") && ((idx[g(r, "mtiaAck")] || 0) & 1) && !((idx[g(r, "ack")] || 0) & 1));
/* Prefer a short-form specimen that CARRIES 2K and reports employer money, so
 * the 401(m) assertion below is actually exercised: a $0-employer plan returns
 * from the earlier "NONE FILED" branch and never renders the SF card. Falls
 * back to any SF filer so the test still runs on a store without one. */
const sf2k = byAssets.find((r) => g(r, "sf") && /2K/.test(String(g(r, "codes") || "")) &&
  (g(r, "contribEmployer") || 0) > 0);
const sfPlan = sf2k || byAssets.find((r) => g(r, "sf"));
/* plans-index.json is ROW-aligned to plans-all, unlike the ack-keyed
 * lineups-index the three picks above use. Bit 4096 = the filing reports
 * investments in aggregate (dx=stmt). */
const bootBits = JSON.parse(readFileSync("plans-index.json", "utf8")).bits;
if (bootBits.length !== d.plans.length)
  fail(`plans-index.json is not row-aligned to plans-all (${bootBits.length} vs ${d.plans.length})`);
const rowOf = new Map(d.plans.map((r, i) => [r, i]));
const aggPlan = byAssets.find((r) =>
  !g(r, "sf") && ((bootBits[rowOf.get(r)] || 0) & 4096) && (g(r, "assetsEOY") || 0) > 0);
if (!fullPlan || !trustPlan || !sfPlan) fail("could not pick specimen plans from data");
if (!aggPlan) fail("could not pick a filed-in-aggregate specimen — no live plan carries bit 4096");
/* PARTICIPANT LOANS, 2026-09-28. 482 published menus carry a row named `LOAN
 * FUND` / `Loans` / `Participant Loans` — a plan ASSET that Schedule H line 4i
 * correctly reports, but not something a participant can pick off a menu.
 * app.js types and tints it. The specimen is chosen by a PROPERTY IT HAS (its
 * lineup shard carries a loan-named row) rather than by a remembered ack,
 * because addressing a control by a recalled identifier has read as a control
 * FAILING twice on this record. */
const LOAN_FIND = /^(?:participant[- ]?)?loans?\b|^notes? receivable from participants?\b/i;
const shardOf = (a) => { let h = 0; for (const c of a) h = (h * 31 + c.charCodeAt(0)) >>> 0; return String(h % 64).padStart(2, "0"); };
const loanPlan = byAssets.find((r) => {
  const ack = g(r, "ack");
  if (!ack || g(r, "sf") || !((idx[ack] || 0) & 1)) return false;
  try {
    const e = JSON.parse(readFileSync(`data/lineups/${shardOf(ack)}.json`, "utf8"))[ack];
    return !!(e && (e.funds || []).some((f) => LOAN_FIND.test(String(f.name || "").trim())));
  } catch { return false; }
});
if (!loanPlan) fail("could not pick a participant-loan specimen — no published menu carries a loan row");
/* bit 65536: the plan's own rows say its money is an interest in a master
 * trust we could not link. Six plans, 75,808 participants - small, but they
 * were being told something false about their filing, so the page they get
 * instead has to be checked. */
/* TWO populations carry 65536 and they get DIFFERENT endings, so pick one of
 * each. Testing only the larger would leave the other wording unexercised -
 * and the larger one flipped from unlinked to linked the moment bit 131072
 * shipped, which is exactly how a specimen silently stops covering a case. */
const trustUnlinkedPlan = byAssets.find((r) =>
  !g(r, "sf") && ((bootBits[rowOf.get(r)] || 0) & 65536) && !((bootBits[rowOf.get(r)] || 0) & 131072));
const trustOpaquePlan = byAssets.find((r) =>
  !g(r, "sf") && ((bootBits[rowOf.get(r)] || 0) & 131072));
if (!trustUnlinkedPlan) fail("could not pick a trust-held-but-UNLINKED specimen — no live plan carries 65536 without 131072");
if (!trustOpaquePlan) fail("could not pick a trust-linked-but-OPAQUE specimen — no live plan carries bit 131072");

const server = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
try {
  // CHROMIUM_PATH: run against a system chromium when the pinned Playwright
  // version's own browser download isn't present (e.g. the CCR sandbox)
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  page.on("pageerror", (e) => fail("page JS error: " + e.message));

  const openPlan = async (r, label) => {
    await page.goto(`http://localhost:${PORT}/#plan=${encodeURIComponent(id(r))}`);
    await page.waitForFunction(() => /\d{4,}/.test((document.getElementById("statPlans") || {}).textContent?.replace(/,/g, "") || ""), { timeout: 45000 });
    // imitate a real visitor: some headless environments (CCR sandbox) freeze
    // the renderer ~1s after load absent user activation — timers stop and
    // in-flight response bodies never reach page JS, so on-demand shard
    // fetches stall forever without this
    await page.mouse.click(2, 2);
    await page.waitForTimeout(2500);
    const txt = await page.evaluate(() => (document.querySelector(".detail-clamp") || {}).innerText || "");
    if (!txt) fail(`${label}: report did not render (id ${id(r)})`);
    if (/\bundefined\b|\bNaN\b|\[object /.test(txt)) fail(`${label}: leaked undefined/NaN into the page`);
    // the on-demand fee fetch must have settled — a stuck placeholder means
    // the async data-layer rebuild orphaned the fetch (deep-link race)
    if (txt.includes("Loading the provider fee table")) fail(`${label}: fee table never resolved (deep-link race)`);
    if (!txt.includes("PLAN FEATURES")) fail(`${label}: features panel missing`);
    if (!txt.includes("ESPP")) fail(`${label}: ESPP status row missing`);
    return txt;
  };

  const t1 = await openPlan(fullPlan, "full-form");
  if (!/FORM 5500 AUDIT NOTES|FUND HOLDINGS|INVESTMENT OPTIONS/.test(t1)) fail("full-form: no filed content section rendered");

  const t2 = await openPlan(trustPlan, "master-trust");
  if (!/trust/i.test(t2)) fail("master-trust: no trust-sourced content or explanation");

  const t3 = await openPlan(sfPlan, "short-form");
  if (!/short[- ]form|SHORT-FORM|doesn't collect|DOL/i.test(t3)) fail("short-form: page does not explain the SF gap");
  /* The filed fact, not just the list of things the DOL does not collect.
   * Code 2K is on line 8a of the form itself, so it exists for short-form
   * filers by law and there is no excuse for withholding it. */
  if (sf2k && !/401\(m\) arrangement \(code 2K\)/.test(t3))
    fail("short-form: page does not report the filing's own 401(m) code — the generic SF sentence is shadowing it");

  /* FILED IN AGGREGATE. The plan filed a schedule; it just reports one line
   * instead of a fund list. Suppressing the menu is right — publishing a
   * "participant-directed investments" row at 99.5% of the plan would be the
   * v105 dominant-row shape — but suppressing it SILENTLY would read as "no
   * schedule was filed", which is false and is the exact confusion the
   * standing rule forbids. */
  /* TRUST-HELD BUT UNLINKED. The filing is fine and we read it; the fund
   * detail is in the trust's separate return. The page must not blame this
   * filing, which is exactly what the document-shape sentence used to do. */
  const t5 = await openPlan(trustUnlinkedPlan, "trust-held-unlinked");
  /* Every plan in this population carries a Schedule D trust NAME, so the page
   * must print that name rather than the generic "we could not match this plan
   * to that return". Asserting the generic sentence is what let a regression
   * that removed the name pass unnoticed: the weaker claim was still true. */
  const t5Name = g(trustUnlinkedPlan, "mtiaName");
  const t5flat = t5.replace(/\s+/g, " ");
  if (t5Name) {
    /* Schedule D gives the trust's name, so the page must NAME it. */
    if (!t5.includes(t5Name))
      fail(`trust-held-unlinked: page does not name the trust (${t5Name}) — the generic sentence is shadowing the specific one`);
    if (!/not a gap in our reading of the filing/i.test(t5flat))
      fail("trust-held-unlinked (named): page does not clear our reading of the plan's own filing");
  } else {
    if (!/interest in a master trust/i.test(t5))
      fail("trust-held-unlinked: page does not say the assets are an interest in a master trust");
    if (!/plan's own filing was read without trouble/i.test(t5flat))
      fail("trust-held-unlinked: page no longer clears the plan's own filing of the gap");
    if (!/we could not match this plan to that return/i.test(t5flat))
      fail("trust-held-unlinked: page does not say we failed to MATCH the plan to a trust return");
  }
  /* Applies to BOTH shapes: the document-shape sentence blames the filing and
   * is false for every plan in this population. */
  if (/could not read it — that's our gap|pages are not present in the public copy/i.test(t5))
    fail("trust-held-unlinked: the false document-shape sentence is still being rendered");

  /* LINKED but the trust's own return is opaque. The page must NOT say we
   * failed to match a trust we did match - that would be a second false
   * claim replacing the first. */
  const t6 = await openPlan(trustOpaquePlan, "trust-linked-opaque");
  if (!/interest in a master trust/i.test(t6))
    fail("trust-linked-opaque: page does not say the assets are an interest in a master trust");
  if (!/that return does not publish a fund-by-fund list we can read either/i.test(t6.replace(/\s+/g, " ")))
    fail("trust-linked-opaque: page does not say it is the TRUST's return that lacks a readable fund list");
  if (/we could not match this plan to that return/i.test(t6.replace(/\s+/g, " ")))
    fail("trust-linked-opaque: page claims we could not match a trust we DID match");

  /* A loan row must READ as a loan: labelled, and carrying no expense ratio.
   * The predicate lives once, in app.js; this asserts the RENDER instead of a
   * second copy of the rule — and it asserts it on the page, because a
   * store-side count called a live regression an improvement earlier today. */
  const tL = await openPlan(loanPlan, "participant-loan");
  const loanCells = await page.evaluate(() => [...document.querySelectorAll("tr")]
    .map((tr) => [...tr.querySelectorAll("td")].map((x) => x.innerText.replace(/\s+/g, " ").trim()))
    .filter((td) => td.length >= 5 && /^(?:participant[- ]?)?loans?\b|^notes? receivable from participants?\b/i.test(td[0]))
    .map((td) => ({ name: td[0], type: td[1], er: td[2] })));
  if (!loanCells.length) fail("participant-loan: specimen rendered no loan row at all");
  for (const c of loanCells) {
    if (!/not a menu choice/i.test(c.type))
      fail(`participant-loan: ${JSON.stringify(c.name)} renders type ${JSON.stringify(c.type)} — it is a plan asset, not a menu choice`);
    if (c.er !== "\u2014")
      fail(`participant-loan: ${JSON.stringify(c.name)} publishes an expense ratio (${JSON.stringify(c.er)}) — a loan has none`);
  }

  const t4 = await openPlan(aggPlan, "filed-in-aggregate");
  if (!/in aggregate/i.test(t4))
    fail("filed-in-aggregate: page does not explain that the FILING reports investments in aggregate");
  if (!/That's how\s+the plan filed, not a gap in our reading of it/i.test(t4.replace(/\s+/g, " ")))
    fail("filed-in-aggregate: the explanation no longer distinguishes the filing's choice from our gap");

  /* The match-quote guard exists twice — scripts/lib-quote.mjs for the static
   * pages, a twin inside app.js for the interactive report — because one is a
   * module and the other is a plain browser script. It has already drifted
   * between two homes once, and the static pages published a false heading on
   * 615 pages for as long as it did. Run the BROWSER copy, in the real page,
   * against the same pinned filings the module's --selftest uses. */
  const cases = JSON.parse(readFileSync("docs/quote-guard-cases.json", "utf8")).cases;
  const verdicts = await page.evaluate((cs) => {
    if (typeof window.__wampoMatchQuoteOk !== "function") return null;
    return cs.map((c) => window.__wampoMatchQuoteOk(c.text, c.hasFormula));
  }, cases);
  if (!verdicts) fail("app.js no longer exposes __wampoMatchQuoteOk — the guard cannot be cross-checked");
  const drift = cases.map((c, i) => [c, verdicts[i]]).filter(([c, got]) => got !== c.expect);
  if (drift.length) {
    for (const [c, got] of drift) console.error(`  app.js guard: expected ${c.expect}, got ${got} — ${c.why}`);
    fail(`match-quote guard in app.js disagrees with docs/quote-guard-cases.json on ${drift.length} of ${cases.length} filings`);
  }

  /* Same drift protection for the coverage band: scripts/lib-disclose.mjs is
   * canonical, app.js carries a twin because it is a plain browser script.
   * Run the BROWSER copy against the module's own boundary cases. */
  const { coverageBand, frozenClaimOk, cleanFiledName, isParticipantLoanRow, isLoanDescriptionRow,
    isAnnuityContractRow, annuityFeeIsGuaranteeOnly, isCollectiveTrustName, isLoanAnswerRow, isLoanMaturityRow,
    isDirectionCaptionRow,
    isInvestmentContractRow, isMistypedStockRow,
    mistypedStockFeeIsGuaranteeOnly, issuerPricedER, leadingHouse } = await import("./lib-disclose.mjs");
  const frozCases = [
    [true, "The Plan was terminated effective December 31, 2023.", "Capital Region Medical"],
    [true, "As amended on December 31, 2024, the Plan was frozen and all participants of the Plan became fully vested.", "Hanes Companies, Inc."],
    [true, "As of December 31, 2024, the Hanes Retirement Plan was frozen.", "Leggett & Platt, Incorporated"],
    [true, "The Solar Energy World 401k plan was frozen to new contributions as of January 31, 2025.", "Comcast Corporation"],
    [true, "A participant will become 100 percent vested in the event the Company permanently discontinues contributions to the Plan.", "Honeywell International Inc"],
    [true, "As of January 1, 2025, the Plan was frozen, and employees became eligible to participate in the Cayuga Health 401(k).", "Cayuga Medical Associates"],
    [true, "", "Anyone"],
    [false, "The Plan was terminated effective July 31, 2024.", "Macatawa Bank"],
  ];
  const frozGot = await page.evaluate((cs) => {
    if (typeof window.__wampoFrozenClaimOk !== "function") return null;
    return cs.map(([f, t, sp]) => window.__wampoFrozenClaimOk(f, t, sp));
  }, frozCases);
  if (!frozGot) fail("app.js no longer exposes __wampoFrozenClaimOk — the frozen guard cannot be cross-checked");
  const frozDrift = frozCases.filter(([f, t, sp], i) => frozenClaimOk(f, t, sp) !== frozGot[i]);
  if (frozDrift.length) fail(`frozen guard in app.js disagrees with scripts/lib-disclose.mjs on ${frozDrift.length} of ${frozCases.length} cases`);

  const covCases = [[95, 100, false], [100, 100, false], [949, 1000, false], [950, 1000, false],
    [1050, 1000, false], [1051, 1000, false], [3491, 5291, false], [400, 1000, false],
    [1000, 1000, true], [0, 1000, false], [1000, 0, false]];
  const covGot = await page.evaluate((cs) => {
    if (typeof window.__wampoCoverageBand !== "function") return null;
    return cs.map(([t, a, tr]) => { const r = window.__wampoCoverageBand(t, a, tr); return r ? `${r.kind}:${r.severe}` : null; });
  }, covCases);
  if (!covGot) fail("app.js no longer exposes __wampoCoverageBand — the coverage band cannot be cross-checked");
  const covDrift = covCases.filter(([t, a, tr], i) => {
    const r = coverageBand(t, a, tr);
    return (r ? `${r.kind}:${r.severe}` : null) !== covGot[i];
  });
  if (covDrift.length) fail(`coverage band in app.js disagrees with scripts/lib-disclose.mjs on ${covDrift.length} of ${covCases.length} cases`);

  /* THE FILED-NAME CLEANER, tethered 2026-09-27. The static pages rendered the
   * RAW stored name for their whole existence — 2,790 rows on pages serving
   * 9,689,129 participants showed what a report reader never saw — so
   * build-seo-pages now calls scripts/lib-disclose.mjs's copy. app.js keeps its
   * own because it is a plain browser script, and THIS is what stops the two
   * drifting: every case below is a real filed name from the store, plus the
   * three controls that must come back UNCHANGED. */
  const nameCases = [
    /* 2026-09-30, the TRAILING PLUS MARKER. Checked before adding, for the
     * reason this comment keeps being written: not one case below reaches
     * either plus arm, so the twin would agree whether or not it carried
     * them. The first four must STRIP; the last five must come back WHOLE,
     * because their plus is part of the name — `INST+` is Institutional PLUS,
     * a different share class from `-INST`, and `iShares TR 20+` is the 20+
     * Year Treasury ETF. `… Idx | +e` also tests the ORDER: it must recover
     * its share class as `… Idx I`, not end at a bare bar. */
    "Vanguard Extended Market Idx | +e",
    "Vngrd Wlsly Inc Adml +",
    "Fidelity 500 Index +a",
    "LgCap S&P 500 Index Sep Acct+",
    "VANGUARD EXT MKT INDX-INST+",
    "VANGUARD TOT BD MKT IDX-INS+",
    "iShares TR 20+",
    "Target Date 2065+",
    "GOVERNMENT NAT MTG AS REMIC PT SOFR30A+",
    /* THE TWO NOISE SCREENS, 2026-09-29. Added for the same reason as
     * everything below: not one existing case reaches `bwNoise` or the two
     * new furniture participles, so the twin would agree whether or not it
     * carried them. All six must be KEPT WHOLE, and every one of them is a
     * string the arm STRIPPED before this change — a share-count column, the
     * OCR'd N/A column in two spellings, an OCR'd measurement basis, and two
     * prose continuations that were publishing as holdings named after a
     * relative pronoun. */
    "Mutual Fund 99,566.045 shs",
    "Mutual fund NIA NIA 233,946 dy",
    "Mutual Fund nla nla nla 945",
    "Investments measure at NAV",
    "Mutual Fund that invests at least 80% of",
    "Mutual Fund investing in the domestic",
    /* 2026-09-29, added for the reason every previous cycle's were: not one
     * case above reaches the `investments` caption or the initial guard, so
     * the twin would agree whether or not it carried them. */
    "Investments Vanguard Bond Index Fund",
    "INVESTMENT CO OF AMERICA Class R-4",
    "Registered Investment Company T. Rowe Price Overseas",
    "Investments using NAV (CCT funds)",
    "MUTUAL FUNDS SHARES / UNITS Fidelity 500 Index",
    /* 2026-09-29, the LEADING SINGLE QUOTE. Checked before adding, for the
     * reason this comment keeps being written: NOT ONE of the 27 cases above
     * leads with a quote of any kind, so the twin agreed whether or not it
     * carried this arm. The last two must come back WHOLE — a balanced
     * double-quoted term, and a remainder of one word. */
    "‘Vanguard 500 Index Fund Admiral Shares",
    "'VANGUARD EXPLORER ADM",
    "‘TIAA Access Lifecycle 2050 T'4",
    "\"Brokerage\" Account",
    "‘Uncoln",
    "Mutual Funds, at Fair Value Schwab S&P 500 Index",
    "MUTUAL FUNDS SHARES I UNITS Vanguard 500 Index Admiral Fund",
    "Money market fund - Vanguard Federal Money Market Fund",
    "POOLED SEPARATE ACCOUNT, AT FAIR VALUE TIAA Real Estate",
    "922908371 VANGUARD EXT MKT INDX-INST+",
    "AB Global Fixed Income Collective Trust",
    "T Rowe Price Blue Chip Growth - Class |",
    "JP Morgan JP Morgan Mid Cap Growth Fund",
    "Fidelity 500 Index \u00ab",
    "V an gu ard Targe t Re tire m e nt 2045 Tru st II",
    /* the comma family, 2026-09-28 */
    "Mutual Fund, Freedom Index 2030",
    "Pooled Separate Account, TIAA Real Estate",
    "Money market fund, Fidelity Govt Money Market Fund",
    "Mutual Fund, The Growth Fund of America",
    /* TYPE_SUFFIX must not leave a dangling fragment, 2026-09-28 */
    "Shares of registered investment companies",
    "Vanguard Institutional Index Fund Mutual Fund",
    /* TYPE_SUFFIX widened 2026-09-28, and these six exist because the negative
     * control FAILED TO FAIL without them: drifting the twin's DANGLING_TAIL
     * from case-sensitive to `/i` left every one of the cases above green, so
     * the tether was decorative for the newest rule in it. Each of these
     * reaches an arm the older cases cannot.
     *   - a trailing ` funds` on `collective trust`, and the bare
     *     `separate account`: the two vocabulary gaps;
     *   - `Common and Collective Trust Fund`, which the space-less
     *     `common/collective` arm could only cut the tail off;
     *   - `Global A …`, where a trailing share-class `A` must NOT read as an
     *     article — the case-sensitivity the drift test flips;
     *   - `… Fund of mutual fund`, which the dangling guard must now REFUSE
     *     to strip where the old code produced `… Fund of`;
     *   - `Korn Ferry Master Trust`, which must never be stripped at all. */
    "PIMCO RealPath Blend 2030 Collective Trust Funds",
    "BLACKROCK SP 500 IDX (IS) Separate Account",
    "Retirement 2055 Common and Collective Trust Fund",
    "Global A Pooled separate accounts",
    "Fidelity 500 Index Fund of mutual fund",
    "Korn Ferry Master Trust",
    /* the leading-parenthetical family, 2026-09-28 */
    "Mutual funds (continued) Dodge & Cox International Stock Fund",
    "MUTUAL FUNDS (Continued) FID FREEDOM 2060 K",
    "Mutual Funds (at fair value) American Century Value Fund",
    "Stable Value Fund (i)",
    "Mutual Funds (TIAA-CREF, not certified) CREF Stock R1",
    /* the bare-whitespace family, 2026-09-28 */
    "Registered Investment Company Vanguard Inter-Term Bnd Index Fd Adm",
    "Common/Collective Trust Prin LifeTime Hybr 2035 CIT Z",
    "Registered Investment Company PGIM Ttl Ret Bond R2 Fund",
    "Registered Investment Company Am Fds EuroPacific Grth R6 Fd",
    "Pooled Separate Accounts Prin LgCp S&P 500 Index SA-Z",
    /* the page-break `(continued)` family in the NAME column, 2026-09-28 —
     * captions the earlier arm cannot reach because they open with a firm, a
     * heading or a model portfolio rather than a vehicle type. The last two
     * are the ARTICLE cases, which the shared remainder screen refused until
     * it was told to look past a leading `the`. */
    "Fidelity Management Trust Company (continued) VANG SM CP IDX IS PL",
    "Exchange Traded Funds: (continued) iShares U.S. Home Construction ETF",
    "Stock (Continued) Wingstop Inc",
    "John Hancock sub-accounts (continued) The Growth Fund of America",
    "Renasant Growth Model Fund - (Continued) The Hartford Dividend and Growth Fund",
    /* controls: a real name whose vehicle word is part of it, a bare type that
     * must stay visible to the generic-name audit, and a real quoted class */
    "Index Fund invested in stocks included in the S&P 500",
    "Mutual funds",
    "Stable Value Fund",
    /* controls for the arm above: a caption with NOTHING after it, and one
     * whose remainder is a bare share class. Neither may be cut — a strip that
     * leaves a dangling fragment is the defect this record shipped a fix for
     * once already ("Shares of"). */
    "Common/Collective Trust Funds (Continued)",
    "Common/Collective Trust Funds (Continued) Class R6",
    /* THE DOUBLED SHARE CLASS, 2026-09-30, added because NOT ONE of the 67
     * cases above reaches the new arm — the tether agreed whether or not
     * app.js carried it, the decorative-control failure this record has now
     * paid for three times. Six must-STRIP: */
    "Class K Fidelity Contrafund Class K",
    "Class R-6 EuroPacific Growth Fund Class R-6",
    "R6 American Funds Wash Mutual R6",
    "Class K6 Fidelity Contrafund Class K6",
    "Class IS ClearBridge Small Cap Growth fund, Class IS",
    "R6 Hartford Balanced Inc-R6",
    /* …and seven must-KEEP, one per way the arm can be wrong. The first two
     * are the class-first STYLE, where the lead is the ONLY statement of the
     * class and stripping destroys it. The next two state two DIFFERENT
     * classes, where nothing says which is wrong — and the second of them is
     * the row that FOUND this defect (Innovative Employee Solutions, 5,856
     * ppl), deliberately pinned on the refused side. Then the three generic
     * remainders, where the letter is a real designation of the employer's
     * own stock: QuikTrip files the first at $3,535,256,080 and Moog the
     * second at $369,929,005. The last is the reason the bare single-letter
     * head needs the word "Class" in front of it — an initial is not a
     * share class. */
    "Class R6 Fidelity Global ex U.S. Index Fund",
    "Class R6 American Funds 2040 Target Date Retirement Fund",
    "Class R1 Macquarie Mid Cap Growth R6",
    "II Class R1 Blackrock LifePath Index 2030 Fund S",
    "Class E Common Stock",
    "Class B Common Stock",
    "T. Rowe Price Retirement 2030 Fund Class R",
  ];
  const nameGot = await page.evaluate((cs) => {
    if (typeof window.__wampoCleanFiledName !== "function") return null;
    return cs.map((n) => window.__wampoCleanFiledName(n));
  }, nameCases);
  if (!nameGot) fail("app.js no longer exposes __wampoCleanFiledName — the filed-name cleaner cannot be cross-checked");

  /* THE GENERIC-NAME PREDICATE, tethered 2026-09-28, and this one is GENERATED
   * rather than hand-twinned. lib-4i derives GENERIC_TYPE_ANY from
   * GENERIC_TYPE_NAME by two asserted string replacements, so it is a DERIVED
   * pattern; app.js carries the COMPILED source written in by a script. That
   * removes the transcription risk and leaves exactly one risk in its place —
   * that the derivation in lib-4i changes and the generated copy is not
   * regenerated. This is the check for that, and it is why the copy may be
   * generated at all.
   *
   * The cases are the ones v188 pinned as decoys plus the real funds that must
   * survive: a strip that removes only non-identifying wrappers cannot reach a
   * name that identifies something. */
  const { isGenericTypeName } = await import("./lib-4i.mjs");
  const genCases = ["Mutual funds", "Mutual Fund Shares", "Registered Investment Company",
    "Common collective trust", "Shares of registered investment companies",
    "Sub-total: Registered Investment Companies", "DESCRIPTION: POOLED SEPARATE ACCOUNT",
    "Mutual fund shares", "Pooled separate accounts", "Guaranteed investment contract",
    /* THE DERIVED ARMS, and these are the whole point. My first draft of this
     * tether was GREEN when the v187 `commingled` arm was deleted from the
     * generated copy, because not one case exercised it — a check that cannot
     * fail is decorative, which this record has paid for before. GENERIC_TYPE_ANY
     * differs from GENERIC_TYPE_NAME in exactly two ways and both are pinned
     * here: v137's PLURALISATION (`trusts`, `collective trust funds`) and
     * v187's EXTRAS (`commingled … funds`, `pooled separate account funds`). */
    "Commingled funds", "Commingled trust funds", "Commingled investment funds",
    "Pooled separate account funds", "Collective trust funds", "Common collective trusts",
    /* v189's DESPACED arm, and these exist because the tether did NOT fail when
     * that arm was added: not one of the cases above reaches it, so the check
     * was decorative for the newest rule in it. A kerned font sprays spaces
     * through an asset-class label and the vocabulary sees a string no arm
     * matches; the comparison strips the spaces from both sides. Removing the
     * arm from the generated twin must fail HERE. */
    "M utual Fund", "Mutua l Fund", "Regi s tered i nves tment compa ni es",
    "Colle ctive Trust", "Registered Investm ent Com pany", "Group Annuity C ontrac t",
    /* must NOT be generic — real funds, including v188's pinned controls */
    "Fidelity 500 Index Fund", "Vanguard Target Retirement 2030",
    "AMERICAN FUNDS BLANC MUTUAL FUND", "Mutual of America MUTUAL FUND",
    "Separate Account A, at fair value", "Fidelity Government Money Market Fund",
    "Vanguard tax-Managed Balanced Fund Admiral Shares Registered Investment Company"];
  const genGot = await page.evaluate((cs) => {
    if (typeof window.__wampoGenericName !== "function") return null;
    return cs.map((n) => window.__wampoGenericName(n));
  }, genCases);
  if (!genGot) fail("app.js no longer exposes __wampoGenericName — the generated generic-name twin cannot be cross-checked");
  const genDrift = genCases.filter((n, i) => isGenericTypeName(n) !== genGot[i]);
  if (genDrift.length) {
    for (const n of genDrift) console.error(`  ${JSON.stringify(n)}  app.js=${genGot[genCases.indexOf(n)]}  lib-4i=${isGenericTypeName(n)}`);
    fail(`the generated generic-name twin in app.js disagrees with scripts/lib-4i.mjs on ${genDrift.length} of ${genCases.length} names — regenerate it`);
  }
  for (const n of genCases.slice(0, 22))
    if (!isGenericTypeName(n)) fail(`generic-name predicate no longer recognises an asset-class label: ${JSON.stringify(n)}`);
  for (const n of genCases.slice(22))
    if (isGenericTypeName(n)) fail(`generic-name predicate now calls a REAL FUND generic: ${JSON.stringify(n)}`);

  /* AND THE ROW DECISION, which is the half the name test cannot see. Whether
   * a row is "nameless" is the generic-name question MINUS four exclusions —
   * employer stock, participant loans, a filed subtotal, a brokerage window —
   * and each of those is the difference between a true qualifier and a false
   * one. The rule is canonical in lib-disclose and extracted verbatim into
   * app.js; the static generator imports it directly, so these three surfaces
   * cannot disagree without this failing.
   *
   * Every case below is chosen to exercise ONE arm, and the last two are the
   * pair that matters most: the same name, generic on its own, excluded by the
   * type in one row and not the other. */
  const rowCases = [
    { name: "Mutual funds", type: "Mutual fund" },
    { name: "Common/collective trust funds", type: "" },
    { name: "Sub-total: Registered Investment Companies", type: "" },
    { name: "Registered Investment Companies", type: "Mutual fund" },
    { name: "Fidelity 500 Index Fund", type: "Mutual fund" },
    { name: "Vanguard Target Retirement 2030", type: "Mutual fund" },
    { name: "COMMON STOCK", type: "Employer security" },
    { name: "Company stock fund", type: "" },
    { name: "Participant loans", type: "" },
    { name: "Notes receivable from participants", type: "" },
    { name: "Self-Directed Brokerage Account", type: "" },
    { name: "BrokerageLink", type: "" },
    { name: "Mutual funds", type: "Subtotal (not a holding)" },
    { name: "Mutual funds", type: "Brokerage window" },
  ];
  const { isNamelessFundRow } = await import("./lib-disclose.mjs");
  const rowGot = await page.evaluate((cs) => {
    if (typeof window.__wampoNamelessRow !== "function" || typeof window.__wampoGenericName !== "function") return null;
    return cs.map((r) => window.__wampoNamelessRow(r, r.name, window.__wampoGenericName));
  }, rowCases);
  if (!rowGot) fail("app.js no longer exposes __wampoNamelessRow — the nameless-row twin cannot be cross-checked");
  const rowDrift = rowCases.filter((r, i) => isNamelessFundRow(r, r.name, isGenericTypeName) !== rowGot[i]);
  if (rowDrift.length) {
    for (const r of rowDrift) console.error(`  ${JSON.stringify(r)}  app.js=${rowGot[rowCases.indexOf(r)]}  lib-disclose=${isNamelessFundRow(r, r.name, isGenericTypeName)}`);
    fail(`the nameless-row twin in app.js disagrees with scripts/lib-disclose.mjs on ${rowDrift.length} of ${rowCases.length} rows — regenerate it`);
  }
  for (const r of rowCases.slice(0, 4))
    if (!isNamelessFundRow(r, r.name, isGenericTypeName)) fail(`nameless-row rule no longer flags a filing that names no fund: ${JSON.stringify(r)}`);
  for (const r of rowCases.slice(4))
    if (isNamelessFundRow(r, r.name, isGenericTypeName)) fail(`nameless-row rule would tell a reader "no specific fund" about a row that IS identified: ${JSON.stringify(r)}`);

  /* THE PARTICIPANT-LOAN PREDICATE, tethered 2026-09-28. It lives twice —
   * canonical in scripts/lib-disclose.mjs for the crawlable pages, twinned in
   * app.js for the report — so the two are held together the way the filed-name
   * cleaner is. Eight of these are REAL FUNDS whose names contain "loan" and
   * must come back false, including J&J's `Loans Secured By Mtges-Resid.`,
   * which my own first measurement of this class wrongly counted as a loan. */
  const loanCases = ["LOAN FUND", "Loan Fund", "Loans", "Loan", "Participant Loans",
    "Notes Receivable from Participants", "Loan Fund (4.25% - 9.5%)", "Loans to Participants",
    "LOAN FUND, 4.25%-9.50%", "Participant note",
    "Bank Loan Fund", "Floating Rate Loan Fund", "Senior Loan Portfolio",
    "Loans Secured By Mtges-Resid.", "Loomis Sayles Core Plus Bond",
    "Invesco Senior Loan ETF", "Loan Participation Fund", "Eaton Vance Floating Rate"];
  const loanGot = await page.evaluate((cs) => {
    if (typeof window.__wampoLoanRow !== "function") return null;
    return cs.map((n) => window.__wampoLoanRow(n));
  }, loanCases);
  if (!loanGot) fail("app.js no longer exposes __wampoLoanRow — the participant-loan predicate cannot be cross-checked");
  const loanDrift = loanCases.filter((n, i) => isParticipantLoanRow(n) !== loanGot[i]);
  if (loanDrift.length) {
    for (const n of loanDrift) console.error(`  ${JSON.stringify(n)}  app.js=${loanGot[loanCases.indexOf(n)]}  module=${isParticipantLoanRow(n)}`);
    fail(`the participant-loan predicate in app.js disagrees with scripts/lib-disclose.mjs on ${loanDrift.length} of ${loanCases.length} names`);
  }
  for (const n of loanCases.slice(0, 10))
    if (!isParticipantLoanRow(n)) fail(`participant-loan predicate no longer recognises a loan row: ${JSON.stringify(n)}`);
  for (const n of loanCases.slice(10))
    if (isParticipantLoanRow(n)) fail(`participant-loan predicate now damages a REAL FUND: ${JSON.stringify(n)}`);

  /* THE LOAN-DESCRIPTION PREDICATE, tethered the same way. It is the rule for
   * rows whose name is the CONTINUATION LINE of a wrapped loan description and
   * never says "loan" at all — Nissan's `at rates of interest ranging from
   * 4.25% to` at $63,385,312, Dollar General's `from 3.21% to`.
   *
   * Nine of these must come back FALSE and that half is where the cost lives,
   * because this rule REPLACES the displayed name rather than only qualifying
   * it. Two of the nine are Griswold Industries' rows, which my own draft
   * accepted: `Interest Rate of 0.15% to 0.62% (Maturing in 2023) Principal`
   * is a Principal Guaranteed Interest Account crediting rate, and the strip
   * vocabulary was deleting the house name because it listed `principal` for
   * the phrase `principal residence`. Reading the accepted names is what
   * caught it; no count could have. */
  const descCases = [
    "at rates of interest ranging from 4.25% to", "from 3.21% to", "Rates from 4.25% to",
    "3.25% to 9.50% with maturities ranging until 2035", "4.25% to 9.50% (cost $0)",
    "INTEREST RATES BETWEEN 4.25% AND 9.50% ANNUALLY",
    "Promissory notes* Varying maturity dates with interest rates ranging from 4.25% to",
    "rates ranging from 4.25 to 9.50 percent", "Interest-bearing at 4.25 - 9.5%, maturing through November 2030",
    /* 2026-09-30: the residue is a loan word CUT MID-TOKEN by the column width.
     * Aimbridge Parent's is `per an`; Hyatt's `various mat`; Intercos America's
     * `Col`; Metro CU's OCR-split `Inte re st`. Every one a proper prefix of a
     * word this rule already strips, so the arm needs no new vocabulary. */
    "Plan participants Notes with interest rates ranging from 3.25% to 10.50%, with various mat",
    "Bear interest at 5.0\u20149.50% at varying maturity dates",
    "by vested interest, various terms, interest rates of 3.25% to 8.50%; maturities through Ap",
    "62 Participants Notes - interest rates of 4.25% - 9.50%; Maturities from 2025 to 2029; Col",
    "Inte re st from 4.25% to",
    "participants secured by vested balances, 4.25% to 9.50% fixed interest, maturing in 1\u20135 ye",
    /* must stay real, from here down */
    /* the prefix arm must not reach a house or vehicle word that arrived WHOLE:
     * `Stearns` and `Columbia` are the named risks, and what refuses them is
     * that the rest of the name survives the strip intact. */
    "Bear Stearns High Yield 4.25% to 9.50%",
    "Columbia Short Term Bond rates ranging from 4.25% to 9.50%",
    "State Street Global Wrap 4.25% to 9.50%",
    "MetLife, Contract #1071020 rates 4.25% to 9.50%",
    "GUARANTEED LONG TERM FUND General Account (CONTRACT INTEREST RATE: 1/1-6/30 Contract PRIAC",
    "General Account (interest at 3.05%)", "Short term investment fund (interest rate 4.4393%)",
    "Fixed annuity at 1.41% interest rate -0", "Interest rate 1.75%",
    "(Interest rates up to 5.56%; maturing 2024 - 2030) Morley Stable Value VI Fund",
    "Interest Rate of 0.15% to 0.62% (Maturing in 2023) Principal",
    "Interest Rate of 4.18% to 5.89% (Maturing in 2024) Principal",
    "Bank Loan Fund", "Fidelity 500 Index Fund"];
  const descGot = await page.evaluate((cs) => {
    if (typeof window.__wampoLoanDescRow !== "function") return null;
    return cs.map((n) => window.__wampoLoanDescRow(n));
  }, descCases);
  if (!descGot) fail("app.js no longer exposes __wampoLoanDescRow — the loan-description predicate cannot be cross-checked");
  const descDrift = descCases.filter((n, i) => isLoanDescriptionRow(n) !== descGot[i]);
  if (descDrift.length) {
    for (const n of descDrift) console.error(`  ${JSON.stringify(n)}  app.js=${descGot[descCases.indexOf(n)]}  module=${isLoanDescriptionRow(n)}`);
    fail(`the loan-description predicate in app.js disagrees with scripts/lib-disclose.mjs on ${descDrift.length} of ${descCases.length} names`);
  }
  for (const n of descCases.slice(0, 15))
    if (!isLoanDescriptionRow(n)) fail(`loan-description predicate no longer recognises a wrapped loan description: ${JSON.stringify(n)}`);
  for (const n of descCases.slice(15))
    if (isLoanDescriptionRow(n)) fail(`loan-description predicate would RENAME a real holding "Participant loans": ${JSON.stringify(n)}`);

  /* THE ANNUITY-CONTRACT PREDICATE, tethered the same way, 2026-09-29. It is a
   * TWO-CELL rule — the filed NAME against the stored TYPE — so every case here
   * carries both, and passing a bare string would silently test nothing.
   *
   * Eight of the fourteen must come back FALSE and that half is the whole
   * safety argument, in three kinds:
   *   - the type is already honest or MORE specific (`Stable value / GIC`,
   *     `Collective trust`, `Cash / short-term`, blank) and must not be
   *     flattened to "Annuity contract";
   *   - the name does NOT say "annuity contract", so a real registered fund is
   *     never reached — `TIAA Traditional Annuity` and `Vanguard Variable
   *     Annuity Balanced Portfolio` contain the word "annuity" and must be
   *     KEPT, which is what makes the two-word phrase load-bearing rather than
   *     decorative;
   *   - `Schwab Government Money Market Portfolio` is the series of the ONE
   *     SEC registrant (SCHWAB ANNUITY PORTFOLIOS) whose name contains
   *     "annuity" at all, pinned so the single real collision stays visible.
   *
   * Two of the must-FLAG cases are deliberately fund-shaped — `Group Annuity
   * Contract PRIAC Guaranteed Income Fund` and the Lincoln Multi-Fund VA row
   * naming American Funds Global Growth. Both END in something that reads like
   * a fund and neither is one: the holding is the contract, and the filing says
   * so in its own words. */
  const annuityCases = [
    /* must FLAG */
    { name: "Traditional Fixed Annuity Contracts - Non-Fully Benefit Responsive", type: "Mutual fund" },
    { name: "TIAA Traditional Annuity Contract - Nonbenefit-Responsive", type: "Mutual fund" },
    { name: "Group annuity contract - TIAA Traditional Annuity", type: "Mutual fund" },
    { name: "Variable Annuity Contracts CREF", type: "Mutual fund" },
    { name: "Group Annuity Contract PRIAC Guaranteed Income Fund", type: "Mutual fund" },
    { name: "Lincoln Financial Multi-Fund Group Variable Annuity Contract American Funds Global Growth", type: "Mutual fund" },
    /* must stay as filed, from here down */
    { name: "TIAA Traditional Annuity Contract - Fully Benefit-Responsive", type: "Stable value / GIC" },
    { name: "MetLife Group Annuity Contract", type: "Collective trust" },
    { name: ". GROUP ANNUITY CONTRACT Mutual of America", type: "Cash / short-term" },
    { name: "Fidelity VIP Contrafund Portfolio GROUP ANNUITY CONTRACT", type: "" },
    { name: "TIAA Traditional Annuity", type: "Mutual fund" },
    { name: "Vanguard Variable Annuity Balanced Portfolio", type: "Mutual fund" },
    { name: "Schwab Government Money Market Portfolio", type: "Mutual fund" },
    { name: "Fidelity 500 Index Fund", type: "Mutual fund" }];
  const annGot = await page.evaluate((cs) => {
    if (typeof window.__wampoAnnuityRow !== "function") return null;
    return cs.map((r) => window.__wampoAnnuityRow(r, r.name));
  }, annuityCases);
  if (!annGot) fail("app.js no longer exposes __wampoAnnuityRow — the annuity-contract predicate cannot be cross-checked");
  const annDrift = annuityCases.filter((r, i) => isAnnuityContractRow(r, r.name) !== annGot[i]);
  if (annDrift.length) {
    for (const r of annDrift) console.error(`  ${JSON.stringify(r)}  app.js=${annGot[annuityCases.indexOf(r)]}  module=${isAnnuityContractRow(r, r.name)}`);
    fail(`the annuity-contract predicate in app.js disagrees with scripts/lib-disclose.mjs on ${annDrift.length} of ${annuityCases.length} rows — regenerate it`);
  }
  for (const r of annuityCases.slice(0, 6))
    if (!isAnnuityContractRow(r, r.name)) fail(`annuity-contract rule no longer catches an insurance contract typed a mutual fund: ${JSON.stringify(r)}`);
  for (const r of annuityCases.slice(6))
    if (isAnnuityContractRow(r, r.name)) fail(`annuity-contract rule would retype a row whose filed type is honest, or a real fund: ${JSON.stringify(r)}`);

  /* THE LOAN-REPAYMENT ANSWER LINE, tethered the same way, 2026-09-30. Six must
   * FLAG — three the restored v195 phrase, three the remnant v194 left in the
   * store — and eight must be KEPT. The must-keeps are why both arms are
   * anchored on the WHOLE name: `Included Value Fund` and `Yes Bank Ltd` open
   * with the remnant words, `Bank Loan Fund` and `Loan Repayment (Interest)`
   * are not answer lines, and `Participant loans` / `Loan Fund` are already
   * typed by `LOAN_ROW` and must not be claimed twice. */
  /* WIDENED 02:5xZ: the first ten must FLAG. `Repayments are …` is the same
   * answer line with its leading `Loan` on the ROW ABOVE, which happens
   * whenever the layout gives each fragment its own value — Kentucky Rebuild
   * publishes `Included:` and `Repayments are` as two rows with two figures.
   * The `are` is what keeps the loan-DESCRIPTION family out, so the
   * `repayment schedules through …` case below is a must-KEEP and not an
   * oversight: it is a separate queued item. */
  const loanAnsCases = [
    "Loan Repayments are included:", "Loan Repayments are Included Yes", "included",
    "Included", "Yes", "included:",
    "Repayments are Included", "Repayments are", "repayments are included: X",
    "Repayments are Included Yes",
    "Loan Repayment (Interest)", "Participant loans", "Loan Fund",
    "Included Value Fund", "Yes Bank Ltd", "Bank Loan Fund",
    "Fidelity 500 Index Fund", "Loans to participants",
    "repayment schedules through August 2029 with interest rates ranging from 2.88% to",
    "Repayment Holdings Ltd"];
  const loanAnsGot = await page.evaluate((cs) => {
    if (typeof window.__wampoLoanAnswerRow !== "function") return null;
    return cs.map((n) => window.__wampoLoanAnswerRow(n));
  }, loanAnsCases);
  if (!loanAnsGot) fail("app.js no longer exposes __wampoLoanAnswerRow — the loan-answer predicate cannot be cross-checked");
  const loanAnsDrift = loanAnsCases.filter((n, i) => isLoanAnswerRow(n) !== loanAnsGot[i]);
  if (loanAnsDrift.length) {
    for (const n of loanAnsDrift) console.error(`  ${JSON.stringify(n)}  app.js=${loanAnsGot[loanAnsCases.indexOf(n)]}  module=${isLoanAnswerRow(n)}`);
    fail(`the loan-answer predicate in app.js disagrees with scripts/lib-disclose.mjs on ${loanAnsDrift.length} of ${loanAnsCases.length} names`);
  }
  for (const n of loanAnsCases.slice(0, 10))
    if (!isLoanAnswerRow(n)) fail(`loan-answer rule no longer types a recordkeeper answer line, so it reads as a fund: ${JSON.stringify(n)}`);
  for (const n of loanAnsCases.slice(10))
    if (isLoanAnswerRow(n)) fail(`loan-answer rule would claim a real fund or an already-typed loan row: ${JSON.stringify(n)}`);

  /* THE SCHEDULE H PARTICIPANT-DIRECTION CAPTION, 2026-09-30 (14:4xZ). The
   * first ten must FLAG — every one is a real published name from the class,
   * Microsoft's own row among them. The last eight must be KEPT, and they are
   * the whole safety argument: `Participant-Directed Brokerage Accounts` and
   * its siblings are a REAL self-directed window (174 rows / 851,690 ppl),
   * refused because the tail vocabulary is POSITIVE and `brokerage` is not in
   * it; `Directed Share Program` and `Participant Loans` are not the caption
   * at all; and a real fund's name is never the bare caption. */
  const dirCases = [
    "Participant-directed", "participant directed", "PARTICIPANT DIRECTED",
    "Participant Directed", "Participant-directed investments",
    "Participant Directed Investments", "Participant Directed Account",
    "Participant Directed Accounts", "Nonparticipant Directed",
    "Non-Participant Directed",
    "Participant-Directed Brokerage Accounts", "Participant Directed Brokerage Account",
    "participant directed brokerage accounts", "Participant-Directed Brokerage Account",
    "Directed Share Program", "Participant Loans",
    "Participant Directed Retirement Fund", "Vanguard 500 Index Fund",
  ];
  const dirGot = await page.evaluate((cs) => {
    if (typeof window.__wampoDirectionCaptionRow !== "function") return null;
    return cs.map((n) => window.__wampoDirectionCaptionRow(n));
  }, dirCases);
  if (!dirGot) fail("app.js no longer exposes __wampoDirectionCaptionRow — the direction-caption predicate cannot be cross-checked");
  const dirDrift = dirCases.filter((n, i) => isDirectionCaptionRow(n) !== dirGot[i]);
  if (dirDrift.length) {
    for (const n of dirDrift) console.error(`  ${JSON.stringify(n)}  app.js=${dirGot[dirCases.indexOf(n)]}  module=${isDirectionCaptionRow(n)}`);
    fail(`the direction-caption predicate in app.js disagrees with scripts/lib-disclose.mjs on ${dirDrift.length} of ${dirCases.length} names`);
  }
  for (const n of dirCases.slice(0, 10))
    if (!isDirectionCaptionRow(n)) fail(`direction-caption rule no longer types a Schedule H caption, so it reads as a fund: ${JSON.stringify(n)}`);
  for (const n of dirCases.slice(10))
    if (isDirectionCaptionRow(n)) fail(`direction-caption rule would claim a real brokerage window or a real fund: ${JSON.stringify(n)}`);

  /* THE BARE MATURITY DATE, tethered the same way, 2026-09-30 (07:3xZ). The
   * first eight must FLAG — every one is a real published name from the class,
   * including the three whose filings were read (Kodak, Baylor Scott & White,
   * TotalEnergies) and the trailing-punctuation shapes the wrap leaves behind.
   * The last nine must be KEPT, and they are the whole safety argument: a
   * target-date VINTAGE is a year with words in front of it, and a bare year
   * with no month is deliberately outside the rule because `2065` alone is a
   * vintage far more often than a maturity. */
  const loanMatCases = [
    "November 2029", "December 2034", "March, 2032)", "October 2054).",
    "December-30", "June 2031", "Sept. 2028", "(August 2049)",
    "Target Retirement 2030", "Fidelity Freedom 2035", "LifePath Index 2040",
    "2065", "Class 2029", "May Department Stores Common Stock",
    "American Funds 2030 Target Date R6", "T. Rowe Price Retirement 2035",
    "Maturities through November 2039"];
  const loanMatGot = await page.evaluate((cs) => {
    if (typeof window.__wampoLoanMaturityRow !== "function") return null;
    return cs.map((n) => window.__wampoLoanMaturityRow(n));
  }, loanMatCases);
  if (!loanMatGot) fail("app.js no longer exposes __wampoLoanMaturityRow — the maturity-date predicate cannot be cross-checked");
  const loanMatDrift = loanMatCases.filter((n, i) => isLoanMaturityRow(n) !== loanMatGot[i]);
  if (loanMatDrift.length) {
    for (const n of loanMatDrift) console.error(`  ${JSON.stringify(n)}  app.js=${loanMatGot[loanMatCases.indexOf(n)]}  module=${isLoanMaturityRow(n)}`);
    fail(`the maturity-date predicate in app.js disagrees with scripts/lib-disclose.mjs on ${loanMatDrift.length} of ${loanMatCases.length} names`);
  }
  for (const n of loanMatCases.slice(0, 8))
    if (!isLoanMaturityRow(n)) fail(`maturity-date rule no longer types a wrapped loan row, so it reads as a fund: ${JSON.stringify(n)}`);
  for (const n of loanMatCases.slice(8))
    if (isLoanMaturityRow(n)) fail(`maturity-date rule would claim a real fund or a target-date vintage: ${JSON.stringify(n)}`);

  /* THE COLLECTIVE-TRUST NAME RULE, tethered the same way, 2026-09-30. The
   * first six must FLAG (a fee is withdrawn); the last nine must be KEPT, and
   * they are the whole reason the vocabulary is narrow: `American Funds
   * American High-Income Trust` is a REGISTERED fund whose name ends in that
   * word, `Trust Class` is Neuberger Berman's own retail share-class name,
   * `CIT Group` is a lender, and a registrant's SERIES trust puts the trust
   * words at the front. A bare terminal `Trust` reaches 201 rows dominated by
   * the American Funds family, so it is deliberately not matched. */
  const citCases = [
    "BlackRock Lifepath Index 2035 CIT",
    "Vanguard Group Target Retirement 2050 Trust II",
    "Invesco Stable Value Trust V",
    "Common/Colle ctive Trust Invesco Stable Value Trust I",
    "Voya Stable Value Fund 20 CIT",
    "Target Retirement Income Trust II",
    "American Funds American High-Income Trust",
    "American Funds American High-Income Trust Class R-6",
    "Neuberger Berman Genesis Fund Trust Class",
    "Target Retirement 2035 Trust",
    "SPDR Series Trust",
    "AIM Counselor Series Trust Fund",
    "MFS Series Trust II - MFS Growth Fund",
    "CIT Group Inc",
    "Fidelity 500 Index Fund"];
  const citGot = await page.evaluate((cs) => {
    if (typeof window.__wampoCitName !== "function") return null;
    return cs.map((n) => window.__wampoCitName(n));
  }, citCases);
  if (!citGot) fail("app.js no longer exposes __wampoCitName — the collective-trust name predicate cannot be cross-checked");
  const citDrift = citCases.filter((n, i) => isCollectiveTrustName(n) !== citGot[i]);
  if (citDrift.length) {
    for (const n of citDrift) console.error(`  ${JSON.stringify(n)}  app.js=${citGot[citCases.indexOf(n)]}  module=${isCollectiveTrustName(n)}`);
    fail(`the collective-trust name predicate in app.js disagrees with scripts/lib-disclose.mjs on ${citDrift.length} of ${citCases.length} names`);
  }
  for (const n of citCases.slice(0, 6))
    if (!isCollectiveTrustName(n)) fail(`collective-trust rule no longer catches a CIT unit class, so a retail fee publishes on it: ${JSON.stringify(n)}`);
  for (const n of citCases.slice(6))
    if (isCollectiveTrustName(n)) fail(`collective-trust rule would withdraw the fee of a REGISTERED fund or a series trust: ${JSON.stringify(n)}`);

  /* THE GUARANTEE-ONLY FEE RULE, tethered the same way, 2026-09-29. It needed
   * its own cases for the fifth cycle running: NOT ONE case above reaches it,
   * because the rule above reads the TYPE cell first and this one never reads
   * a type at all — so without these the twin would agree whether or not it
   * carried the rule, the decorative-guard failure this record has caught at
   * v189, v190, v191 and v192.
   *
   * Eight of the fourteen must come back FALSE, in two kinds, and that half is
   * the whole safety argument:
   *   - four name a REAL insurance-dedicated fund held THROUGH a group annuity
   *     contract. Their published fee (0.06 / 0.2 / 0.65 / 0.1) comes from the
   *     fund's own name and must survive; the strip is a NO-OP on every one of
   *     them, because none contains a guarantee word at all;
   *   - four never say "annuity contract", so the gate is shut before the
   *     strip is reached. `Guaranteed Income Fund`, `Key Guaranteed Portfolio
   *     Fund` and `Principal Stable Value Preferred Fund` are pinned precisely
   *     because they WOULD be stripped to nothing if the gate ever came off —
   *     they are the cost of widening this rule, sitting in the test.
   *
   * Both copies are given the bare fee TABLE, which is what app.js passes at
   * the call site, so the two sides are comparable without reconstructing
   * `fundERFiled` here. */
  const erCtx = vm.createContext({ console });
  vm.runInContext(readFileSync("fund-er.js", "utf8"), erCtx);
  const tableER = erCtx.fundER;
  if (typeof tableER !== "function") fail("fund-er.js no longer defines fundER — the guarantee-only fee rule cannot be cross-checked");
  const guarFeeCases = [
    /* must SUPPRESS the fee */
    "Guaranteed Annuity Contract", "Guaranteed annuity contract - contract value",
    "Group Annuity Contract Lincoln Stable Value Account",
    "Group fixed annuity contracts Empower Select Guaranteed Fund",
    "SAGIC Group Annuity Contract 21016", "Annuity Contracts TIAA Stable Value",
    /* must KEEP the fee, from here down */
    "Vanguard VIF Real Estate Index Portfolio GROUP ANNUITY CONTRACT",
    "Mutual of America Group Annuity Contract Equity Index Fund",
    "Neuberger Berman AMT Sustainable Equity Portfolio GROUP ANNUITY CONTRACT",
    "MoA US Government Money Market Fund GROUP ANNUITY CONTRACT",
    "Guaranteed Income Fund", "Key Guaranteed Portfolio Fund",
    "Principal Stable Value Preferred Fund", "Fidelity 500 Index Fund"];
  const guarGot = await page.evaluate((cs) => {
    if (typeof window.__wampoGuaranteeOnlyFee !== "function") return null;
    return cs.map((n) => window.__wampoGuaranteeOnlyFee(n));
  }, guarFeeCases);
  if (!guarGot) fail("app.js no longer exposes __wampoGuaranteeOnlyFee — the guarantee-only fee rule cannot be cross-checked");
  const guarDrift = guarFeeCases.filter((n, i) => annuityFeeIsGuaranteeOnly(n, tableER) !== guarGot[i]);
  if (guarDrift.length) {
    for (const n of guarDrift) console.error(`  ${JSON.stringify(n)}  app.js=${guarGot[guarFeeCases.indexOf(n)]}  module=${annuityFeeIsGuaranteeOnly(n, tableER)}`);
    fail(`the guarantee-only fee rule in app.js disagrees with scripts/lib-disclose.mjs on ${guarDrift.length} of ${guarFeeCases.length} names — regenerate it`);
  }
  for (const n of guarFeeCases.slice(0, 6))
    if (!annuityFeeIsGuaranteeOnly(n, tableER)) fail(`guarantee-only fee rule no longer suppresses a fabricated annuity fee: ${JSON.stringify(n)}`);
  for (const n of guarFeeCases.slice(6))
    if (annuityFeeIsGuaranteeOnly(n, tableER)) fail(`guarantee-only fee rule would withdraw a fee a fund's own name supports: ${JSON.stringify(n)}`);

  /* THE INVESTMENT-CONTRACT PREDICATE, tethered the same way, 2026-09-29. It
   * needed its OWN cases for the sixth cycle running: not one case above
   * reaches it, because every annuity case's name says `annuity contract` and
   * none says `investment contract` or `insurance contract`, so without these
   * the twin would agree whether or not it carried the rule — the
   * decorative-guard failure caught at v189, v190, v191 and v192.
   *
   * Eleven of the eighteen must come back FALSE, in three kinds, and that half
   * is the entire safety argument:
   *   - THREE name a real registered fund behind a welded caption
   *     (`investment contract Dodge & Cox Income Fund Class X` -> DODIX,
   *     `Investment Contract American Funds Europacific GR R6` -> RERGX,
   *     `... American Funds The Bond Fund of America`, which resolves to NO
   *     ticker and is priced by name — it is why the identity probe needs both
   *     halves and why a ticker-only test would delete a real fund's fee);
   *   - THREE say a contract and are typed something already honest or more
   *     specific, so the gate must stay shut on the type;
   *   - FIVE never say either phrase. `at contract value Fidelity 500 Index`,
   *     `Contract Vanguard Value Index Fund Adm` and `Lincoln Stable Value (at
   *     contract value)` are pinned precisely because they are the cost of
   *     widening the vocabulary to the bare word `contract`: a measurement
   *     basis is not a vehicle, and 103 distinct published names carry the
   *     word that way. They are the price of that widening, sitting in the
   *     test.
   *
   * The identity probe is built HERE from fund-er.js, mirroring what app.js's
   * `namesAFund` passes at the call site, so the two sides are comparable. */
  const namesAFund = (n) => tableER(n) != null || !!erCtx.fundTickerInfo(n);
  if (typeof erCtx.fundTickerInfo !== "function") fail("fund-er.js no longer defines fundTickerInfo — the investment-contract rule cannot be cross-checked");
  const contractCases = [
    /* must FLAG — typed `Mutual fund`, and the filing names a contract */
    { name: "Fully benefit responsive investment contracts American General Life Insurance", type: "Mutual fund" },
    { name: "Unallocated Insurance Contracts", type: "Mutual fund" },
    { name: "Investment contract - Empower Guaranteed Income Fund", type: "Mutual fund" },
    { name: "Investment Contracts with Insurance Companies", type: "Mutual fund" },
    { name: "Unallocated investment contract - Key Guaranteed Portfolio Fund", type: "Mutual fund" },
    { name: "Investment Contract with Insurance Company Great-West Funds", type: "Mutual fund" },
    { name: "Insurance contracts", type: "Mutual fund" },
    /* must KEEP, from here down */
    { name: "investment contract Dodge & Cox Income Fund Class X", type: "Mutual fund" },
    { name: "Investment Contract American Funds Europacific GR R6", type: "Mutual fund" },
    { name: "Responsive Investment Contract American Funds The Bond Fund of America", type: "Mutual fund" },
    { name: "Unallocated Insurance Contracts", type: "Stable value / GIC" },
    { name: "Investment contract - Lincoln Stable Value Account", type: "Collective trust" },
    { name: "Fully Benefit-Responsive Investment Contract VALIC", type: "" },
    { name: "Fidelity 500 Index Fund", type: "Mutual fund" },
    { name: "at contract value Fidelity 500 Index", type: "Mutual fund" },
    { name: "Contract Vanguard Value Index Fund Adm", type: "Mutual fund" },
    { name: "Lincoln Stable Value (at contract value)", type: "Mutual fund" },
    { name: "Group Annuity Contract PRIAC Guaranteed Income Fund", type: "Mutual fund" },
  ];
  const conGot = await page.evaluate((cs) => {
    if (typeof window.__wampoInvestmentContractRow !== "function") return null;
    return cs.map((r) => window.__wampoInvestmentContractRow(r));
  }, contractCases);
  if (!conGot) fail("app.js no longer exposes __wampoInvestmentContractRow — the investment-contract predicate cannot be cross-checked");
  const conDrift = contractCases.filter((r, i) => isInvestmentContractRow(r, r.name, namesAFund) !== conGot[i]);
  if (conDrift.length) {
    for (const r of conDrift) console.error(`  ${JSON.stringify(r)}  app.js=${conGot[contractCases.indexOf(r)]}  module=${isInvestmentContractRow(r, r.name, namesAFund)}`);
    fail(`the investment-contract rule in app.js disagrees with scripts/lib-disclose.mjs on ${conDrift.length} of ${contractCases.length} rows — regenerate it`);
  }
  for (const r of contractCases.slice(0, 7))
    if (!isInvestmentContractRow(r, r.name, namesAFund)) fail(`investment-contract rule no longer types a contract the filing names: ${JSON.stringify(r)}`);
  for (const r of contractCases.slice(7))
    if (isInvestmentContractRow(r, r.name, namesAFund)) fail(`investment-contract rule would retype a row it must leave alone: ${JSON.stringify(r)}`);

  /* THE MISTYPED-EMPLOYER-STOCK PREDICATE, tethered the same way, 2026-09-29.
   * It needed its OWN cases for the seventh cycle running: every case above is
   * typed `Mutual fund` and this rule gates on `Company stock`, so not one of
   * them reaches it and without these the twin would agree whether or not it
   * carried the rule.
   *
   * THIRTEEN OF THE TWENTY-TWO MUST COME BACK FALSE, in three kinds, and that
   * half is the entire safety argument:
   *   - SEVEN are REAL employer stock whose name happens to carry a word that
   *     also describes a portfolio. `JOHNSON CONTROLS INTERNATIONAL`,
   *     `Oceaneering International, Inc.`, `Titan International, Inc.`,
   *     `S&P GLOBAL INC`, `Dine Brands Global, Inc.`, `Freedom Bank Unitized
   *     Stock` and Charles Schwab's own `Schwab 401(k) Equity Unit Fund` are
   *     exactly why `equity`, `international`, `global`, `real estate`,
   *     `value` and a bare `freedom` are NOT in the vocabulary. They are the
   *     price of a wider list, sitting in the test.
   *   - THREE say company/employer stock in the NAME, where the shipped name
   *     arm of `stockRow` must go on deciding and this rule must stand aside —
   *     which is what keeps `Fidelity Leveraged Company Stock Fund`, a real
   *     registered fund, behaving exactly as it did.
   *   - THREE are not typed employer stock at all, so the gate is shut.
   *
   * `EQ/Common Stock Index` is pinned on the FLAG side deliberately: it is
   * Equitable's S&P 500 separate account, it says `Common Stock` and not
   * `company stock`, and 24 published rows of it were tagged with their
   * sponsor's symbol. */
  const stockCases = [
    /* must FLAG — a maturity vintage, a tracked index or an asset class */
    { name: "Target Retirement Date Fund 2045", type: "Company stock" },
    { name: "Non-US Equity Index Fund", type: "Company stock" },
    { name: "Non-US Equity Blend Fund", type: "Company stock" },
    { name: "US Equity Small/Midcap Index Fund", type: "Company stock" },
    { name: "Fidelity Freedom 2040 Fund Class K", type: "Company stock" },
    { name: "American Funds 2050 Target", type: "Company stock" },
    { name: "Vanguard Total Bond Market Index Fund", type: "Company stock" },
    { name: "NOV Stable Value Fund", type: "Company stock" },
    { name: "EQ/Common Stock Index", type: "Employer security" },
    /* must KEEP, from here down */
    { name: "JOHNSON CONTROLS INTERNATIONAL", type: "Company stock" },
    { name: "Freedom Bank Unitized Stock", type: "Company stock" },
    { name: "Schwab 401(k) Equity Unit Fund", type: "Company stock" },
    { name: "S&P GLOBAL INC", type: "Company stock" },
    { name: "Dine Brands Global, Inc.", type: "Company stock" },
    { name: "Oceaneering International, Inc.", type: "Company stock" },
    { name: "Titan International, Inc.", type: "Company stock" },
    { name: "Fidelity Leveraged Company Stock Fund", type: "Company stock" },
    { name: "Marriott International, Inc. Common Stock Fund", type: "Company stock" },
    { name: "Employer Security Knight Stock", type: "Company stock" },
    { name: "Vanguard Target Retirement 2045 Fund", type: "Mutual fund" },
    { name: "Fidelity 500 Index Fund", type: "" },
    { name: "US Equity S&P 500 Index Fund", type: "Collective trust" },
  ];
  const stkGot = await page.evaluate((cs) => {
    if (typeof window.__wampoMistypedStockRow !== "function") return null;
    return cs.map((r) => window.__wampoMistypedStockRow(r));
  }, stockCases);
  if (!stkGot) fail("app.js no longer exposes __wampoMistypedStockRow — the mistyped-employer-stock predicate cannot be cross-checked");
  const stkDrift = stockCases.filter((r, i) => isMistypedStockRow(r, r.name) !== stkGot[i]);
  if (stkDrift.length) {
    for (const r of stkDrift) console.error(`  ${JSON.stringify(r)}  app.js=${stkGot[stockCases.indexOf(r)]}  module=${isMistypedStockRow(r, r.name)}`);
    fail(`the mistyped-employer-stock rule in app.js disagrees with scripts/lib-disclose.mjs on ${stkDrift.length} of ${stockCases.length} rows — regenerate it`);
  }
  for (const r of stockCases.slice(0, 9))
    if (!isMistypedStockRow(r, r.name)) fail(`mistyped-employer-stock rule no longer withdraws the claim from a pooled fund: ${JSON.stringify(r)}`);
  for (const r of stockCases.slice(9))
    if (isMistypedStockRow(r, r.name)) fail(`mistyped-employer-stock rule would withdraw a claim it must leave alone: ${JSON.stringify(r)}`);

  /* ...and its FEE half, which is a separate function over the same rows and
   * therefore needs separate cases: not one row above reaches it, because it
   * reads no type at all. Seven of the thirteen must come back FALSE, and
   * three of those carry a guarantee word AND still name a fund — that is
   * where the cost of this rule being wrong lands, and all three are real
   * published names rather than invented ones. */
  const stockFeeCases = [
    /* must SUPPRESS — the guarantee is the only thing that priced the row */
    "NOV Stable Value Fund", "Lincoln Stable Value Fund",
    "Principal Fixed Income Guaranteed Option", "Fixed Income Guarantee Option",
    "Managed Income Portfolio", "Principal Stable Value Preferred Fund",
    /* must KEEP — a guarantee word is present and the remainder names a fund */
    "TRP BLUE CHIP GR T2 Stable value",
    "Vanguard Total Bond Market Index Admiral 1TRSV-A T. Rowe Price Stable Value Common Trst A",
    "PIMCO INCOME INSTL $35.42 GUARANTEED INCOME FUND",
    /* must KEEP — no guarantee word at all, so the rule must be INERT */
    "Vanguard 500 Index Admiral", "Fidelity 500 Index Fund",
    "Vanguard Total Bond Market Index Fund", "Target Retirement Date Fund 2045",
  ];
  const stkFeeGot = await page.evaluate((cs) => {
    if (typeof window.__wampoMistypedStockGuaranteeFee !== "function") return null;
    return cs.map((n) => window.__wampoMistypedStockGuaranteeFee(n));
  }, stockFeeCases);
  if (!stkFeeGot) fail("app.js no longer exposes __wampoMistypedStockGuaranteeFee — the mistyped-stock fee rule cannot be cross-checked");
  const stkFeeDrift = stockFeeCases.filter((n, i) => mistypedStockFeeIsGuaranteeOnly(n, tableER) !== stkFeeGot[i]);
  if (stkFeeDrift.length) {
    for (const n of stkFeeDrift) console.error(`  ${JSON.stringify(n)}  app.js=${stkFeeGot[stockFeeCases.indexOf(n)]}  module=${mistypedStockFeeIsGuaranteeOnly(n, tableER)}`);
    fail(`the mistyped-stock fee rule in app.js disagrees with scripts/lib-disclose.mjs on ${stkFeeDrift.length} of ${stockFeeCases.length} names — regenerate it`);
  }
  for (const n of stockFeeCases.slice(0, 6))
    if (!mistypedStockFeeIsGuaranteeOnly(n, tableER)) fail(`mistyped-stock fee rule would publish a fabricated guarantee fee: ${JSON.stringify(n)}`);
  for (const n of stockFeeCases.slice(6))
    if (mistypedStockFeeIsGuaranteeOnly(n, tableER)) fail(`mistyped-stock fee rule would withdraw a fee a fund's own name supports: ${JSON.stringify(n)}`);

  /* THE ISSUER-PRICED FEE RULE, tethered the same way, 2026-09-29. It needed
   * its OWN cases, and this time the reason is structural rather than merely
   * habitual: NOT ONE probe anywhere above this line passes an ISSUER at all,
   * so a probe set reused from them could not reach this arm in principle. A
   * control that cannot fail is decorative — caught at v189, v190, v191, v192
   * and twice since.
   *
   * The must-REFUSE half is the whole safety argument, and every case in it was
   * READ out of the store: three where the issuer's own house arm answers by
   * itself, five where a SECOND HOUSE leads the filed name while a
   * house-anchored arm ignores it, one where the trustee's corporate form
   * supplied a pattern's VEHICLE word and published the collective-trust price
   * for a registered fund, and two where a caption in the identity cell fires
   * fund-er.js's generic guarantee fallback — the exact 0.35% this record
   * withdrew from 89 rows and from 34 before that.
   * `{Vanguard} Wellington Fund` is in the must-PRICE half on purpose: it is a
   * REAL Vanguard fund whose name carries its SUB-ADVISER, and it is 274 of the
   * 282 rows a house vocabulary would wrongly flag. */
  const issuerFeeCases = [
    /* must PRICE — the identity column supplies the house and nothing else */
    ["Retirement 2030 Active Fund", "T. Rowe Price", 0.55],
    ["Explorer Value Fund Investor Shares", "Vanguard", 0.3],
    ["Europac Growth R6", "American Funds", 0.46],
    ["2040 Target Date Retirement Fund", "American Funds", 0.32],
    ["The Growth Fund of America", "American Funds", 0.3],
    ["Advisor Total Bond Z", "Fidelity", 0.45],
    ["International Stock Fund", "Dodge & Cox", 0.62],
    ["Wellington Fund", "Vanguard", 0.17],
    /* must REFUSE from here */
    ["American Century Small Cap Growth R6", "American Funds", null],
    ["DODGE & COX GLOBAL BOND - I", "American Funds Plans", null],
    ["Schwab Fundamental International", "Dimensional Fund Advisors", null],
    ["MFS Mid Cap Value R6", "T. Rowe Price", null],
    ["AB Large Cap Growth I", "JP Morgan", null],
    ["American Century Equity Income", "JPMorgan", null],
    ["Parnassus Equity Income Inst", "T. Rowe Price", null],
    ["Western Asset Core Plus Bond Fund", "JP Morgan", null],
    ["Class R6 PGIM New World Fund Class R6", "American Funds", null],
    ["Vanguard Retirement Target 2045", "Fidelity Management Trust Company", null],
    ["UNALLOCATED INSURANCE CONTRACTS", "GUARANTEED INTEREST OPTION", null],
    ["Traditional", "Guaranteed Annuity Contracts TIAA", null],
    ["Fidelity 500 Index Fund", "", null],
  ];
  const issFeeGot = await page.evaluate((cs) => {
    if (typeof window.__wampoIssuerPricedER !== "function") return null;
    return cs.map(([n, iss]) => window.__wampoIssuerPricedER(n, iss));
  }, issuerFeeCases.map(([n, iss]) => [n, iss]));
  if (!issFeeGot) fail("app.js no longer exposes __wampoIssuerPricedER — the issuer-priced fee rule cannot be cross-checked");
  const issFeeDrift = issuerFeeCases.filter(([n, iss], i) => {
    const lib = issuerPricedER(tableER, n, iss);
    return (lib == null ? null : lib) !== (issFeeGot[i] == null ? null : issFeeGot[i]);
  });
  if (issFeeDrift.length) {
    for (const [n, iss] of issFeeDrift) {
      const i = issuerFeeCases.findIndex((c) => c[0] === n && c[1] === iss);
      console.error(`  {${iss}} ${JSON.stringify(n)}  app.js=${issFeeGot[i]}  module=${issuerPricedER(tableER, n, iss)}`);
    }
    fail(`the issuer-priced fee rule in app.js disagrees with scripts/lib-disclose.mjs on ${issFeeDrift.length} of ${issuerFeeCases.length} cases — regenerate it`);
  }
  for (const [n, iss, want] of issuerFeeCases) {
    const got = issuerPricedER(tableER, n, iss);
    if ((got == null ? null : got) !== want)
      fail(`issuer-priced fee rule moved: {${iss}} ${JSON.stringify(n)} want=${want} got=${got}`);
  }

  /* THE LEADING HOUSE, tethered 2026-09-30. `lookupTicker` prepends the 4i
   * IDENTITY cell and tries that string FIRST, so a contradicting issuer does
   * not merely fill a blank — it OVERRIDES, and `{Fidelity} Vanguard Total Bond
   * Market Institutional` published FTBFX, Fidelity's own Total Bond Fund, as
   * fact. `leadingHouse` is what lets the two sides be compared.
   *
   * Every case was READ out of the store. The must-DETECT half is the four
   * shapes that actually occur: the house alone, a TRUSTEE's full corporate
   * name, the filer's own misspelling, and a party-in-interest marker welded on.
   * The must-be-NULL half is the whole safety argument, because a null on the
   * NAME side means no contradiction and the issuer arm keeps firing:
   * `Wellington Admiral Fund` is the recorded false positive — a REAL Vanguard
   * fund carrying its SUB-ADVISER — and it is safe here only because the test
   * is anchored `^`, which is exactly the property this pins. A trustee or
   * platform that is not a fund house (Empower, Great Gray, Matrix) must also
   * read null, or the guard would block a correct answer for every plan on that
   * platform. Omissions from the list are additive and harmless: an unknown
   * house reads null, no contradiction is found, and nothing changes. */
  const houseCases = [
    /* must DETECT */
    ["Fidelity Management Trust Company", "fidelity"],
    ["Charles Schwab Trust Bank", "schwab"],
    ["T. Rowe Price", "t rowe price"],
    ["TIAA-Cref Vanguard Target Retire Income TIAA-Cref", "tiaa"],
    ["Vangaurd Target Retirement 2020 Inv", "vanguard"],
    ["JP Morgan", "jpmorgan"],
    ["American Funds Plans", "american funds"],
    ["Fidelity**", "fidelity"],
    ["The Hartford Balanced Income", "hartford"],
    /* must be NULL — nothing may be read as a house from here.
     * The first two are THE ANCHOR CONTROL and they are here because the
     * negative control for this block found the anchoring untested: dropping
     * the `^` was caught by nothing until a case existed where a real house
     * sits INSIDE the string and a non-house leads it. Great Gray is a real
     * trustee of Vanguard-branded collective trusts, so the string occurs. */
    ["Great Gray Trust Company Vanguard Target Retirement 2030 Trust", null],
    ["Sentinel Benefits Fidelity 500 Index Pool", null],
    ["Wellington Admiral Fund", null],
    ["Empower Trust Company, LLC", null],
    ["Great Gray Trust Company", null],
    ["Matrix Trust Company", null],
    ["Principal Trust Company", "principal"],
    ["Retirement 2030 Active Fund", null],
    ["", null],
  ];
  const houseGot = await page.evaluate((cs) => {
    if (typeof window.__wampoLeadingHouse !== "function") return null;
    return cs.map((s) => window.__wampoLeadingHouse(s));
  }, houseCases.map(([s]) => s));
  if (!houseGot) fail("app.js no longer exposes __wampoLeadingHouse — the leading-house test cannot be cross-checked");
  const houseDrift = houseCases.filter(([s], i) => (leadingHouse(s) || null) !== (houseGot[i] || null));
  if (houseDrift.length) {
    for (const [s] of houseDrift) {
      const i = houseCases.findIndex((c) => c[0] === s);
      console.error(`  ${JSON.stringify(s)}  app.js=${houseGot[i]}  module=${leadingHouse(s)}`);
    }
    fail(`the leading-house test in app.js disagrees with scripts/lib-disclose.mjs on ${houseDrift.length} of ${houseCases.length} cases`);
  }
  for (const [s, want] of houseCases) {
    const got = leadingHouse(s) || null;
    if (got !== want) fail(`leading-house test moved: ${JSON.stringify(s)} want=${want} got=${got}`);
  }

  const nameDrift = nameCases.filter((n, i) => cleanFiledName(n) !== nameGot[i]);
  if (nameDrift.length) {
    for (const n of nameDrift) console.error(`  ${JSON.stringify(n)}\n    app.js: ${JSON.stringify(nameGot[nameCases.indexOf(n)])}\n    module: ${JSON.stringify(cleanFiledName(n))}`);
    fail(`filed-name cleaner in app.js disagrees with scripts/lib-disclose.mjs on ${nameDrift.length} of ${nameCases.length} filed names`);
  }
  for (const [n, want] of [["Index Fund invested in stocks included in the S&P 500", "Index Fund invested in stocks included in the S&P 500"],
    ["Mutual funds", "Mutual funds"], ["Stable Value Fund", "Stable Value Fund"],
    /* the comma arm's own screen: a measurement BASIS, a bare CLASS designation,
     * a unit PRICE, and the bare-whitespace family it deliberately leaves alone */
    ["Guaranteed investment contract, at contract value", "Guaranteed investment contract, at contract value"],
    ["Stable Value Fund, Class M", "Stable Value Fund, Class M"],
    ["Mutual Funds, @ $688.090000", "Mutual Funds, @ $688.090000"],
    ["Stable Value Fund Fee Class R1", "Stable Value Fund Fee Class R1"],
    /* and a real fund whose name opens with "The" — the first draft of the
     * screen flagged this one, which is why `the` is not in it */
    ["Mutual Fund, The Growth Fund of America", "The Growth Fund of America"],
    /* the bare-whitespace arm's own screen, every entry a suspect that was READ:
     * a class designation, a bare code (the v188 Affinity Plus DECOY, which
     * survives only because the comma comes off before `A` is judged), a
     * furniture opener, a GIC's contract NUMBER, a parenthetical that IS the
     * description, a designation-only four-token remainder, and an issuer that
     * stands alone nowhere */
    ["Mutual Fund Shares", "Mutual Fund Shares"],
    ["Separate Account A, at fair value", "Separate Account A, at fair value"],
    ["Money Market Funds Value of Interest in", "Money Market Funds Value of Interest in"],
    ["GUARANTEED INVESTMENT CONTRACT GA 29013 DTD 04/28/11", "GUARANTEED INVESTMENT CONTRACT GA 29013 DTD 04/28/11"],
    ["Stable Value Fund (Group Annuity Contract), at contract value", "Stable Value Fund (Group Annuity Contract), at contract value"],
    ["Stable Value Fund Class 25 - I", "Stable Value Fund Class 25 - I"],
    ["Stable Value Fund Standard Insurance Company", "Stable Value Fund Standard Insurance Company"],
    /* the two noise screens, 2026-09-29 — each of these was STRIPPED before
     * the change and must now be kept whole. The first two are what the
     * four-token floor had been standing in front of without being a screen
     * about either shape; the last two were live on the page as holdings
     * named after a relative pronoun. */
    ["Mutual Fund 99,566.045 shs", "Mutual Fund 99,566.045 shs"],
    ["Mutual fund NIA NIA 233,946 dy", "Mutual fund NIA NIA 233,946 dy"],
    ["Mutual Fund nla nla nla 945", "Mutual Fund nla nla nla 945"],
    ["Investments measure at NAV", "Investments measure at NAV"],
    ["Mutual Fund that invests at least 80% of", "Mutual Fund that invests at least 80% of"],
    ["Mutual Fund investing in the domestic", "Mutual Fund investing in the domestic"],
    /* and the screens must not reach a real name. The seven-digit lead is
     * the case that DISCRIMINATES (`code` already refuses six or fewer); the
     * four-digit VINTAGE beside it is pinned because my first draft of this
     * screen was written believing it was at risk, and it never was. */
    ["Registered Investment Company Vanguard Institutional Index Fund", "Vanguard Institutional Index Fund"],
    ["Mutual Fund 1234567 Retirement Trust Select", "Mutual Fund 1234567 Retirement Trust Select"],
    ["Mutual Fund 2045 Retirement Trust Select", "Mutual Fund 2045 Retirement Trust Select"],
    /* BACKTRACKING. `Common/Collective Trust Funds (Continued) …` matched the
     * arm's optional `(?: funds?)?`, failed the `(?=[A-Za-z0-9])` lookahead on
     * `(`, and the engine gave the optional group back — satisfying the anchor
     * one word early and making `Funds` the remainder's first token. 4 rows on
     * the v188 store, found by reading a regenerated PAGE, not by any count. */
    ["Common/Collective Trust Funds (Continued) T. Rowe Price Retire 2030 Trust Fund", "Common/Collective Trust Funds (Continued) T. Rowe Price Retire 2030 Trust Fund"],
    ["Mutual Funds Trust Growth Fund Investor", "Mutual Funds Trust Growth Fund Investor"],
    ["Index Fund account T. Rowe Price Retirement Balanced I", "Index Fund account T. Rowe Price Retirement Balanced I"],
    /* A DANGLING REMAINDER IS WORSE THAN THE NAME IT REPLACED. TYPE_SUFFIX was
     * cutting `Shares of registered investment companies` to "Shares of" — a
     * holding named after a preposition, 70 rows / 63 plans / 94,634 ppl of
     * such fragments on the v188 store, about half of them this arm's doing.
     * The guard asks whether ANY identifying token survives, not whether the
     * last one does: the first draft asked the last, and `Vanguard
     * Institutional Index Fund Mutual Fund` stopped stripping because `fund`
     * is furniture and nearly every fund name ends in it. Both directions are
     * pinned here for that reason. */
    ["Shares of registered investment companies", "Shares of registered investment companies"],
    ["Shares of mutual funds", "Shares of mutual funds"],
    ["Units of mutual funds", "Units of mutual funds"],
    ["Vanguard Institutional Index Fund Mutual Fund", "Vanguard Institutional Index Fund"],
    ["Harbor Capital Appreciation Registered Investment Company", "Harbor Capital Appreciation"],
    ["Dodge & Cox Income Fund Mutual Fund", "Dodge & Cox Income Fund"],
    /* THE LEADING-PARENTHETICAL ARM, and every control here came out of reading
     * all 125 distinct members rather than out of a guess. The strippable half
     * is page furniture in front of a real fund name; the refused half either
     * IS the parenthetical (strip it and a bare vehicle type is all that is
     * left) or carries information the remainder never repeats — the HOUSE in
     * `(TIAA-CREF, not certified)`, a vehicle designation in `(Stable Value
     * Fund)` and `(Group Annuity Contract)`. That is why the arm allowlists
     * what may be stripped instead of blocklisting what may not. */
    ["Mutual funds (continued) Dodge & Cox International Stock Fund", "Dodge & Cox International Stock Fund"],
    ["MUTUAL FUNDS (Continued) FID FREEDOM 2060 K", "FID FREEDOM 2060 K"],
    ["Mutual Funds (at fair value) American Century Value Fund", "American Century Value Fund"],
    ["Mutual Funds (Certified) Fidelity Advisor New Insights Z", "Fidelity Advisor New Insights Z"],
    ["Collective Investment Trust (Net Asset Value Practical Expedient) Fidelity Managed Income", "Fidelity Managed Income"],
    ["Stable Value Fund (i)", "Stable Value Fund (i)"],
    ["Stable Value Fund (at fair value)", "Stable Value Fund (at fair value)"],
    ["Stable Value Fund (Class R1)", "Stable Value Fund (Class R1)"],
    ["Stable Value Fund (75 BPS)", "Stable Value Fund (75 BPS)"],
    ["Collective investment trusts (NAV)", "Collective investment trusts (NAV)"],
    ["Money Market Fund (GMZXX)", "Money Market Fund (GMZXX)"],
    ["Stable Value Fund (Group Annuity Contract), at contract value", "Stable Value Fund (Group Annuity Contract), at contract value"],
    ["Mutual Funds (TIAA-CREF, not certified) CREF Stock R1", "Mutual Funds (TIAA-CREF, not certified) CREF Stock R1"],
    ["Collective Investment Trust (Stable Value Fund) - Federated Capital Preservation Fund", "Collective Investment Trust (Stable Value Fund) - Federated Capital Preservation Fund"],
    /* and the three the typed house list of the previous cycle would have missed */
    ["Registered Investment Company PGIM Ttl Ret Bond R2 Fund", "PGIM Ttl Ret Bond R2 Fund"],
    ["Registered Investment Company Am Fds EuroPacific Grth R6 Fd", "Am Fds EuroPacific Grth R6 Fd"],
    ["Registered Investment Company JP Morgan Large Cap Growth Fd", "JP Morgan Large Cap Growth Fd"],
    /* 2026-09-29: `Investments` PLURAL is a caption; the bare SINGULAR is the
     * first word of real funds and must never be stripped. The must-KEEPs
     * below are the exact rows a singular arm would have destroyed, each one
     * a ticker this store publishes today. */
    ["Investments Vanguard Bond Index Fund", "Vanguard Bond Index Fund"],
    ["Investments American Funds EuroPacific Growth Fund", "American Funds EuroPacific Growth Fund"],
    ["Investments Walmart Inc. Equity Securities", "Walmart Inc. Equity Securities"],
    ["INVESTMENT CO OF AMERICA Class R-4", "INVESTMENT CO OF AMERICA Class R-4"],
    ["Investment Grade Bond Fund - Class A", "Investment Grade Bond Fund - Class A"],
    /* an INITIAL is not a share-class code — the period is the discriminator */
    ["Registered Investment Company T. Rowe Price Overseas", "T. Rowe Price Overseas"],
    ["Common/Collective Trust T. Rowe Price BC Gr Tr CI T2", "T. Rowe Price BC Gr Tr CI T2"],
    /* …and the remainder must still NAME something: two participles caught by
     * reading the whole-store diff, which the counts called clean */
    ["Investments using NAV (CCT funds)", "Investments using NAV (CCT funds)"],
    ["Investments valued at NAV Morley Stable Value", "Investments valued at NAV Morley Stable Value"],
    /* A LEADING SINGLE QUOTE IS OCR NOISE, 2026-09-29. The strip is anchored
     * `^`, which is what lets the third case keep its INTERIOR apostrophe —
     * and is why the balanced-quote test beside it stays on double quotes
     * only. The last two are that test and the two-word floor doing their
     * jobs: a balanced quoted term the filer meant, and a remainder that is
     * one word and therefore names nothing on its own. */
    ["‘Vanguard 500 Index Fund Admiral Shares", "Vanguard 500 Index Fund Admiral Shares"],
    ["'VANGUARD EXPLORER ADM", "VANGUARD EXPLORER ADM"],
    ["‘TIAA Access Lifecycle 2050 T'4", "TIAA Access Lifecycle 2050 T'4"],
    ["‘American Funds New Perspective R6", "American Funds New Perspective R6"],
    ["\"Brokerage\" Account", "\"Brokerage\" Account"],
    ["‘Uncoln", "‘Uncoln"],
    /* A TRAILING PLUS IS A FOOTNOTE MARKER — EXCEPT WHEN IT IS THE NAME,
     * 2026-09-30. The first three strip it. The fourth is the ORDER test: with
     * the plus stripped after the column-bar repair it ended at a bare bar, so
     * the expectation here is the recovered share class. The no-space arm needs
     * a vehicle noun in front, which is why the fifth strips and the last four
     * are kept WHOLE: `INST+` is Institutional PLUS, a different and cheaper
     * class than `-INST`; `iShares TR 20+` is the 20+ Year Treasury ETF; and a
     * store-wide "does the remainder stand alone?" test said 388 of 388 were
     * safe, which was false unanimity — a stem stands alone because ANOTHER row
     * carries the same damage. */
    ["Vngrd Wlsly Inc Adml +", "Vngrd Wlsly Inc Adml"],
    ["Fidelity 500 Index +a", "Fidelity 500 Index"],
    ["American Funds Amer Mutual R6 +k", "American Funds Amer Mutual R6"],
    ["Vanguard Extended Market Idx | +e", "Vanguard Extended Market Idx I"],
    ["LgCap S&P 500 Index Sep Acct+", "LgCap S&P 500 Index Sep Acct"],
    ["VANGUARD EXT MKT INDX-INST+", "VANGUARD EXT MKT INDX-INST+"],
    ["VANGUARD TOT BD MKT IDX-INS+", "VANGUARD TOT BD MKT IDX-INS+"],
    ["iShares TR 20+", "iShares TR 20+"],
    ["Target Date 2065+", "Target Date 2065+"]]) {
    if (cleanFiledName(n) !== want) fail(`the filed-name cleaner now damages a control: ${JSON.stringify(n)} -> ${JSON.stringify(cleanFiledName(n))}`);
  }

  await browser.close();
  console.log("SMOKE OK — full-form, master-trust, short-form, filed-in-aggregate and both trust-held pages all render honestly");
} finally {
  server.kill();
}
