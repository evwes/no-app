/* wampo — estimated expense ratios for funds commonly found in 401(k)
 * lineups. Values are approximate published net expense ratios (percent) for
 * the named fund or its typical institutional share class; collective trusts
 * vary by plan pricing. Everything shown from this table is labeled "est."
 * Order matters: first match wins, so specific patterns come first. */
const FUND_ER = [
  // --- Fidelity index ---
  [/fidelity (500|s&p 500) index/i, 0.015],
  [/fidelity total market index/i, 0.015],
  [/fidelity extended market index/i, 0.035],
  [/fidelity mid ?cap index/i, 0.025],
  [/fidelity small ?cap index/i, 0.025],
  [/fidelity total international index/i, 0.06],
  [/fidelity international index/i, 0.035],
  [/fidelity (us|u\.s\.) bond index/i, 0.025],
  [/fidelity freedom index/i, 0.12],
  // --- Fidelity active ---
  [/fidelity freedom/i, 0.5],
  [/fidelity contrafund/i, 0.45],
  [/fidelity growth company/i, 0.5],
  [/fidelity balanced/i, 0.39],
  [/fidelity low[- ]priced stock/i, 0.6],
  [/fidelity diversified international/i, 0.65],
  [/fidelity blue chip growth/i, 0.55],
  [/fidelity otc/i, 0.6],
  [/fidelity puritan/i, 0.47],
  [/fidelity managed income/i, 0.4],
  [/fidelity government cash reserves|fidelity treasury/i, 0.25],
  // --- Vanguard ---
  [/vanguard target retire(ment)?.*trust/i, 0.045],
  [/vanguard target retire(ment)?/i, 0.08],
  [/metwest total return/i, 0.45],
  [/vanguard (500|institutional) index/i, 0.02],
  [/vanguard russell \d+ .*(index|trust)/i, 0.05],
  [/vanguard total (stock|bond|international)/i, 0.04],
  [/vanguard (extended|mid[- ]?cap|small[- ]?cap|developed|growth|value) .*index/i, 0.05],
  [/vanguard short[- ]term bond index/i, 0.05],
  [/vanguard wellington/i, 0.17],
  [/vanguard primecap/i, 0.31],
  [/vanguard windsor/i, 0.3],
  [/vanguard cash reserves federal money market/i, 0.10],
  [/vanguard federal money market/i, 0.11],
  [/vanguard explorer/i, 0.30],
  [/vanguard ftse social index/i, 0.12],
  [/vanguard small[- ]?(cap )?value index/i, 0.06],
  // --- BlackRock ---
  [/blackrock lifepath index/i, 0.09],
  [/blackrock lifepath/i, 0.2],
  [/blackrock (equity|russell \d+|s&p 500|acwi|msci) .*index/i, 0.03],
  [/blackrock (short[- ]term investment|stif|liquidity)/i, 0.1],
  [/blackrock (us|u\.s\.) debt index/i, 0.03],
  [/blackrock total return/i, 0.4],
  [/blackrock high yield/i, 0.5],
  // --- State Street / SSGA / Northern Trust / Geode ---
  [/(ssga|ssg?a|state street).*(s&p 500|500 index|equity index)/i, 0.02],
  [/(ssga|state st(reet)?).*target (retire(ment)?|date)/i, 0.09],
  [/(ssga|state street).*(bond|aggregate).*index/i, 0.04],
  [/(ssga|state street).*index/i, 0.05],
  [/(northern trust|nt |ntgi).*index/i, 0.05],
  [/(northern trust|ntgi).*(government|short[- ]term|stif)/i, 0.15],
  [/geode/i, 0.05],
  // --- T. Rowe Price ---
  [/t\.? ?rowe price retirement.*trust/i, 0.37],
  [/t\.? ?rowe price retirement/i, 0.49],
  [/t\.? ?rowe price (blue chip|growth stock|large[- ]cap growth)/i, 0.57],
  [/t\.? ?rowe price mid[- ]cap growth/i, 0.61],
  [/t\.? ?rowe price mid[- ]cap value/i, 0.65],
  [/t\.? ?rowe price small[- ]cap/i, 0.66],
  [/t\.? ?rowe price spectrum conservative/i, 0.62],
  [/t\.? ?rowe price stable value/i, 0.3],
  // --- American Funds (R6) ---
  [/american funds.*europacific/i, 0.46],
  [/american funds.*new world/i, 0.57],
  [/american funds.*washington mutual/i, 0.26],
  [/american funds.*growth fund of america/i, 0.3],
  [/american funds.*target date/i, 0.32],
  // filings sometimes drop the n ("America Funds American Balanced") —
  // match on the fund name itself
  [/american balanced/i, 0.28],
  [/american funds/i, 0.4],
  // --- other managers ---
  [/dodge & cox stock/i, 0.51],
  [/dodge & cox international/i, 0.62],
  [/dodge & cox income/i, 0.41],
  [/mfs value/i, 0.44],
  [/mfs .*(growth|international)/i, 0.6],
  [/undiscovered managers behavioral value/i, 0.8],
  [/jpmorgan .*(smartretirement|target)/i, 0.29],
  [/jpmorgan .*core bond/i, 0.34],
  [/pimco (total return|income)/i, 0.51],
  [/pimco inflation/i, 0.45],
  [/pimco all asset/i, 0.87],
  [/victory sycamore/i, 0.55],
  [/clearbridge international growth/i, 0.85],
  [/janus henderson/i, 0.7],
  [/principal high yield/i, 0.61],
  [/boston partners large cap value/i, 0.45],
  [/dfa |dimensional/i, 0.3],
  [/schwab .*index/i, 0.04],
  [/schwab .*money/i, 0.26],
  [/galliard|putnam stable|invesco stable/i, 0.35],
  [/harbor capital appreciation/i, 0.59],
  [/artisan (mid cap|international)/i, 0.95],
  [/neuberger berman/i, 0.65],
  [/wells fargo|allspring/i, 0.45],
  [/eagle|carillon/i, 0.75],
  [/oakmark/i, 0.8],
  [/hartford core equity/i, 0.39],
  [/baird (aggregate|core)/i, 0.3],
  [/metropolitan west total return/i, 0.44],
  [/loomis sayles/i, 0.6],
  [/columbia (dividend|contrarian)/i, 0.65],
  [/columbia emerging markets/i, 1.0],
  [/lord abbett growth leaders/i, 0.55],
  [/diamond hill large cap/i, 0.55],
  [/goldman sachs stable value/i, 0.35],
  // --- generic fallbacks (keep last) ---
  [/target (retirement|date) .*index|index target/i, 0.1],
  [/s&p ?500 index|500 index/i, 0.03],
  [/equity index|stock index|bond index|aggregate index|russell \d+ index|msci .*index|acwi/i, 0.06],
  [/\bindex\b/i, 0.1],
  [/money market|cash reserves|treasury only/i, 0.2],
  [/stable value|managed income|guaranteed|gic\b/i, 0.35],
];

/* ---- recordkeeper abbreviations ---------------------------------------------
 * Big plans file the recordkeeper's SHORT name, not the fund's: Amazon's 4i
 * lists "VANG EXPLORER ADM", "VANG FTSE SOC IDX IS", "AF EUROPAC GROWTH R6".
 * Every pattern below expects the written-out name, so these rows matched
 * nothing and showed a blank ticker and no ER. Expansion happens only for
 * LOOKUP — the filed name is what the table still displays.
 * Only unambiguous contractions are listed. "IS" is expanded solely at the end
 * of a name (a share class there, but the verb anywhere else), and no entry
 * invents a share class the filed name doesn't state. */
const ABBREV = [
  [/\bVANG\b|\bVG\b/gi, "Vanguard"],
  [/\bAF\b/gi, "American Funds"],
  [/\bAM ?FDS\b/gi, "American Funds"],
  [/\bTRP\b/gi, "T. Rowe Price"],
  [/\bOAKMRK\b/gi, "Oakmark"],
  [/\bSVNG\b/gi, "Savings"],
  [/\bRET\b/gi, "Retirement"],
  [/\bIDX\b/gi, "Index"],
  [/\bINTL\b/gi, "International"],
  [/\bMKT\b|\bMK\b/gi, "Market"],
  [/\bTL\b/gi, "Total"],
  [/\bTOT\b/gi, "Total"],
  [/\bBD\b/gi, "Bond"],
  [/\bSM\b/gi, "Small"],
  [/\bLG\b/gi, "Large"],
  [/\bVAL\b/gi, "Value"],
  [/\bGRWTH\b|\bGRTH\b/gi, "Growth"],
  [/\bSOC\b/gi, "Social"],
  [/\bSTK\b/gi, "Stock"],
  [/\bRTN\b/gi, "Return"],
  // "INC" is Incorporated almost everywhere; inside a target-date name it is
  // the Income vintage ("VANGUARD TARGET INC")
  [/\bTARGET INC\b/gi, "Target Retirement Income"],
  [/\bEUROPAC\b/gi, "EuroPacific"],
  [/\bCR FED MM\b/gi, "Cash Reserves Federal Money Market"],
  [/\bMM\b/gi, "Money Market"],
  [/\bADM\b/gi, "Admiral"],
  [/\bINST\b/gi, "Institutional"],
  [/\bIS$/i, "Institutional Shares"],
];
// eslint-disable-next-line no-unused-vars
function expandFundName(name) {
  let s = String(name);
  for (const [re, full] of ABBREV) s = s.replace(re, full);
  return s.replace(/\s{2,}/g, " ").trim();
}

// eslint-disable-next-line no-unused-vars
function fundER(name) {
  if (!name) return null;
  if (/self-directed|brokerage|individually listed|participant loan/i.test(name)) return null;
  if (/common stock|company stock|employer stock/i.test(name)) return null;
  const n = expandFundName(name);
  for (const [re, er] of FUND_ER) if (re.test(name) || re.test(n)) return er;
  return null;
}

/* ---- ticker identification --------------------------------------------------
 * A ticker is attached ONLY when the filed name identifies a specific
 * registered fund (mutual fund/ETF). Institutional vehicles — collective
 * trusts, commingled pools, separate accounts, annuity contracts — have no
 * public ticker and never get one. First match wins. */
const FUND_TICKER = [
  // Fidelity index funds (single retail class)
  [/fidelity (500|s&p 500) index/i, "FXAIX"],
  [/fidelity total market index/i, "FSKAX"],
  [/fidelity extended market index/i, "FSMAX"],
  [/fidelity mid ?cap index/i, "FSMDX"],
  [/fidelity small ?cap index/i, "FSSNX"],
  [/fidelity total international index/i, "FTIHX"],
  [/fidelity international index/i, "FSPSX"],
  [/fidelity global ex.?u\.?s\.? index/i, "FSGGX"],
  [/fidelity (us|u\.s\.) bond index/i, "FXNAX"],
  [/fidelity infl.*(protected|pr).*(bond|bd).*(index|idx)/i, "FIPDX"],
  // Fidelity active (name = one fund; class suffixes K/K6 share the strategy)
  [/fidelity contrafund/i, "FCNTX"],
  [/fidelity growth company/i, "FDGRX"],
  [/fidelity blue chip growth/i, "FBGRX"],
  [/fidelity low[- ]priced stock/i, "FLPSX"],
  [/fidelity puritan/i, "FPURX"],
  [/fidelity balanced/i, "FBALX"],
  [/fidelity diversified international/i, "FDIVX"],
  [/fidelity otc/i, "FOCPX"],
  // Vanguard — only class-explicit or single-purpose names
  [/vanguard 500 index.{0,12}(adm|admiral)/i, "VFIAX"],
  [/vanguard institutional index/i, "VINIX"],
  [/vanguard total stock market index/i, "VTSAX"],
  [/vanguard total international stock (index|market)/i, "VTIAX"],
  [/vanguard total bond market index/i, "VBTLX"],
  [/vanguard extended market index/i, "VEXAX"],
  [/vanguard small[- ]cap index/i, "VSMAX"],
  [/vanguard mid[- ]cap index/i, "VIMAX"],
  [/vanguard wellington/i, "VWENX"],
  [/vanguard primecap/i, "VPMAX"],
  [/vanguard windsor ii/i, "VWNAX"],
  [/vanguard cash reserves federal money market.{0,12}(adm|admiral)/i, "VMRXX"],
  [/vanguard federal money market/i, "VMFXX"],
  [/vanguard explorer.{0,12}(adm|admiral)/i, "VEXRX"],
  [/vanguard ftse social index.{0,24}institutional/i, "VFTNX"],
  [/vanguard small[- ]?(cap )?value index.{0,16}institutional/i, "VSIIX"],
  // other managers with distinctive single-strategy names
  [/dodge & cox stock/i, "DODGX"],
  [/dodge & cox income/i, "DODIX"],
  [/dodge & cox international/i, "DODFX"],
  [/american funds.*europacific.*r6|europacific growth r6/i, "RERGX"],
  [/american funds.*washington mutual.*r6/i, "RWMGX"],
  [/american funds.*growth fund of america.*r6/i, "RGAGX"],
  [/pimco income (inst|institutional)/i, "PIMIX"],
  [/pimco total return (inst|institutional)/i, "PTTRX"],
  [/metropolitan west total return|metwest total return/i, "MWTIX"],
  [/baird aggregate bond/i, "BAGIX"],
  [/baird core plus/i, "BCOIX"],
  [/t\.? ?rowe price blue chip growth fund/i, "TRBCX"],
  [/harbor capital appreciation/i, "HACAX"],
  // "Oakmark International Small Cap" is a different fund (OAKEX); the
  // unqualified pattern claimed it as OAKIX until the universe sweep
  [/oakmark international(?!\s+small)/i, "OAKIX"],
  [/mfs value fund/i, "MEIKX"],
];

/* ---- comparable registered funds --------------------------------------------
 * A collective trust has NO ticker and NO public expense ratio — its fee is
 * negotiated per plan. But most large-plan CITs are the trust edition of a
 * named retail fund, and naming that fund tells a participant what they
 * actually hold. Those are marked "*" and labelled "comparable fund"; the
 * comparable's expense ratio is the RETAIL fund's, and a plan's CIT class is
 * usually cheaper, so it is shown as an upper-bound reference, never as the
 * plan's own fee.
 * Strict rule for entries here: the filed name must identify the same manager
 * AND the same strategy as one specific registered fund. Generic index trusts
 * whose benchmark the name never states (e.g. "SSGA LG CAP GROWTH") get
 * nothing — guessing their index would be invention. */
const FUND_COMPARABLE = [
  [/vanguard target (retirement )?income/i, ["VTINX", 0.08]],
  [/vanguard target (retirement )?2020/i, ["VTWNX", 0.08]],
  [/vanguard target (retirement )?2025/i, ["VTTVX", 0.08]],
  [/vanguard target (retirement )?2030/i, ["VTHRX", 0.08]],
  [/vanguard target (retirement )?2035/i, ["VTTHX", 0.08]],
  [/vanguard target (retirement )?2040/i, ["VFORX", 0.08]],
  [/vanguard target (retirement )?2045/i, ["VTIVX", 0.08]],
  [/vanguard target (retirement )?2050/i, ["VFIFX", 0.08]],
  [/vanguard target (retirement )?2055/i, ["VFFVX", 0.08]],
  [/vanguard target (retirement )?2060/i, ["VTTSX", 0.08]],
  [/vanguard target (retirement )?2065/i, ["VLXVX", 0.08]],
  [/vanguard target (retirement )?2070/i, ["VSVNX", 0.08]],
  [/vanguard (institutional )?(500|s&p 500) index/i, ["VFIAX", 0.04]],
  [/vanguard.*total international stock.*(index|market)/i, ["VTIAX", 0.09]],
  [/vanguard.*total bond market index/i, ["VBTLX", 0.05]],
  [/vanguard.*total stock market index/i, ["VTSAX", 0.04]],
  [/oakmark international(?!\s+small)|harris.*oakmark.*international(?!\s+small)/i, ["OAKIX", 0.98]],
  [/pimco total return/i, ["PTTRX", 0.46]],
  [/dodge & cox stock/i, ["DODGX", 0.51]],
];

/* Ticker for a holding. Returns {tk, comparable} or null.
 * comparable=true means "this is what the holding tracks", not "this is the
 * holding" — the caller must render the asterisk and the footnote. */
// eslint-disable-next-line no-unused-vars
function fundTickerInfo(name, type) {
  if (!name) return null;
  if (/brokerage|self-directed|common stock|company stock|employer (security|stock)|participant loan|maturing through/i.test(name)) return null;
  const n = expandFundName(name);
  const pooled = /trust|commingled|collective|pool\b|unitized|separate account|\bcit\b|annuity|tiaa traditional|guaranteed|\bgic\b|stable value|separately managed/i.test(name)
    || /collective trust|pooled separate/i.test(type || "");
  if (!pooled) {
    for (const [re, tk] of FUND_TICKER) if (re.test(name) || re.test(n)) return { tk, comparable: false };
    return null;
  }
  // a stable value / guaranteed vehicle has no registered analogue at all
  if (/stable value|guaranteed|\bgic\b|annuity|tiaa traditional|retirement savings trust/i.test(n)) return null;
  for (const [re, pair] of FUND_COMPARABLE) if (re.test(name) || re.test(n)) return { tk: pair[0], comparable: true, er: pair[1] };
  return null;
}

// eslint-disable-next-line no-unused-vars
function fundTicker(name) {
  const info = fundTickerInfo(name, "");
  return info && !info.comparable ? info.tk : null;
}
