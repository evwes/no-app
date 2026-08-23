/* wampo — estimated expense ratios for funds commonly found in 401(k)
 * lineups. Values are approximate published net expense ratios (percent) for
 * the named fund or its typical institutional share class; collective trusts
 * vary by plan pricing. Everything shown from this table is labeled "est."
 * Order matters: first match wins, so specific patterns come first. */

/* ---- T. Rowe Price name shapes ----------------------------------------------
 * TRP is the largest single family in the filed universe ($273B of holdings
 * matched nothing before these rows) and every recordkeeper spells it
 * differently: "T. Rowe Price Retirement 2035 Fund", "T ROWE PRICE RETIRE
 * 2035 TR B", "TROWEPRICE RETRMNT 2035 TRST K", "T. ROWE PRICE RTMT 2035 I
 * FD", "TRP Ret 2035 Active Trust K". One builder per series keeps a row per
 * vintage readable and puts the share-class rules in a single place.
 *
 * A name is REJECTED (left blank) rather than given the Investor ticker when
 * it names:
 *   another sponsor — see TRP_SPONSOR below
 *   advisor / adv, trailing "-R"/" R" — a different share class of the same
 *                fund. Only Investor and I Class tickers were verified, and
 *                a wrong class misstates the fee a participant pays
 *   blend / hybrid / target — separate TRP series with their own tickers
 *                (Blend has its own rows; Hybrid is trust-only, no
 *                registered analogue exists, so it stays blank)
 * The I Class is filed at the END of a name ("... Fund I Class", "... 2040
 * I", "... Bl Chip Gr I Fd"), which is what I_CLASS matches. */
const TRP_MGR = "t\\.? ?rowe(?: ?pr\\w*)?";
/* Another sponsor's fund that merely hires T. Rowe Price as sub-adviser is a
 * DIFFERENT registered fund with its own ticker: "Empower T. Rowe Price Mid
 * Cap Growth Fund", "MM Select T. Rowe Price Rtmt 2040 Fund", "JNL/T. Rowe
 * Price MidCap Growth", "SA/T. Rowe Price Equity Income Strategy". Those get
 * nothing — the universe sweep caught all four claiming TRP's own tickers.
 * A collective trust that names its TRUSTEE first ("Great Gray Trust T. Rowe
 * Price Retirement 2040", "Empower Trust Company, LLC T. Rowe Price
 * Retirement 2040 Fund") IS the TRP strategy in a wrapper, so a sponsor name
 * only disqualifies when no trust word follows it. */
const TRP_SPONSOR = "^(?!.*(?:empower|emp\\b|mm\\b|s(?:el(?:ect|ct)?|lct)\\b|massmutual"
  + "|jnl|sa/|lvip|lincoln|jackson|transamerica|nationwide|voya|vy\\b|john hancock"
  + "|brighthouse|met ?life|pacific life|great.?west)(?![\\s\\S]*\\b(?:tr|trust)\\b))";
const TRP_NOT = TRP_SPONSOR + "(?!.*(?:adv|hybrid|hyb\\b|blend|target|trgt))";
const I_CLASS = "(?:[^a-z0-9]|fund|fd|cl|class|shares?)*i\\b";
// a name ENDING in "- R" / "Class R" is the R share class ("T. ROWE PRICE
// GRTH STK FD - R"), whose ticker is not verified here
const NOT_R_TAIL = "(?![\\s\\S]*(?:[-\\s]r|\\bclass\\s+r|\\br\\s+class(?:es)?)\\s*$)";
const TRP_RET = "(?:retire(?:ment)?|retrmnt|rtmt|rtm)\\s*(?:i |date )?";
// " 2040-R" / " 2040 R" is the R share class; "2040 R1" is a trust class
const NOT_R = "\\b(?!\\s*-?\\s*r\\b)";
// a few recordkeepers file the vintage first ("T. Rowe Price 2030 Retirement Fund")
const trpRet = (y) => new RegExp(TRP_NOT + NOT_R_TAIL + ".*?" + TRP_MGR + ".{0,24}(?:" + TRP_RET + y + NOT_R
  + "|" + y + "\\s+retire(?:ment)?\\b)", "i");
const trpRetI = (y) => new RegExp(TRP_NOT + NOT_R_TAIL + ".*?" + TRP_MGR + ".{0,24}(?:" + TRP_RET + y
  + "|" + y + "\\s+retire(?:ment)?)\\b" + I_CLASS, "i");
const TRP_BL = TRP_SPONSOR + "(?!.*(?:adv|hybrid|hyb\\b)).*?" + TRP_MGR
  + ".{0,24}(?:retire(?:ment)?|ret)\\s*blend\\s*";
const trpBlend = (y) => new RegExp(NOT_R_TAIL + TRP_BL + y + NOT_R, "i");
const trpBlendI = (y) => new RegExp(NOT_R_TAIL + TRP_BL + y + "\\b" + I_CLASS, "i");
const TRP_TGT = TRP_SPONSOR + "(?!.*(?:adv|retire|hybrid|blend)).*?" + TRP_MGR + ".{0,16}target\\s*";
const trpTarget = (y) => new RegExp(NOT_R_TAIL + TRP_TGT + y + NOT_R, "i");
const trpTargetI = (y) => new RegExp(NOT_R_TAIL + TRP_TGT + y + "\\b" + I_CLASS, "i");
// single-strategy funds: "<strategy>" and "<strategy> I" / "... Fund I Class"
const trpFund = (s, no) => new RegExp(
  TRP_SPONSOR + "(?!.*adv)" + NOT_R_TAIL + (no ? "(?!.*" + no + ")" : "") + ".*?" + TRP_MGR + ".{0,24}" + s, "i");
const trpI = (s, no) => new RegExp(
  TRP_SPONSOR + "(?!.*adv)" + NOT_R_TAIL + (no ? "(?!.*" + no + ")" : "") + ".*?" + TRP_MGR + ".{0,16}" + s + I_CLASS, "i");
// "Value" must follow the manager name directly: "Large Cap Value",
// "Mid-Cap Value", "U.S. Value Equity" and "Stable Value" are other funds
const trpValue = (tail) => new RegExp(
  TRP_SPONSOR + "(?!.*adv)" + NOT_R_TAIL + ".*?" + TRP_MGR + "\\s+value\\b" + tail, "i");

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
  // Retirement Blend is priced as ONE all-inclusive fee across every vintage:
  // 0.41% Investor, 0.24% I Class (2035/2040 prospectus + fact sheets).
  [trpI("(?:retire(?:ment)?|ret)\\s*blend\\s*(?:20\\d\\d)?", null), 0.24],
  [/t\.? ?rowe(?: ?pr\w*)?.{0,24}(?:retire(?:ment)?|ret)\s*blend/i, 0.41],
  // Retirement (active) collective-trust editions — negotiated per plan class
  [/t\.? ?rowe price retirement.*trust/i, 0.37],
  // Retirement (active) mutual funds — Investor class net ER, per vintage
  // (fact sheets; the series runs 0.49 short-dated to 0.64 long-dated).
  // I Class names get the Investor figure as an upper bound: only the 2060
  // I Class ER (0.46) could be verified, so no I-class row is asserted.
  [trpRet("2005"), 0.49],
  [trpRet("2020"), 0.51],
  [trpRet("2025"), 0.53],
  [trpRet("2030"), 0.55],
  [trpRet("2035"), 0.58],
  [trpRet("2040"), 0.59],
  [trpRet("2045"), 0.60],
  [trpRet("2050"), 0.62],
  [trpRet("2055"), 0.64],
  [trpRet("2060"), 0.64],
  [trpRet("2065"), 0.64],
  // Retirement Balanced / 2010 / 2015 all file 0.49 (fact sheets)
  [new RegExp(TRP_SPONSOR + ".*?t\\.? ?rowe price retirement", "i"), 0.49],
  [trpI("bl(?:ue)? chip\\s*(?:growth|gr\\w*)"), 0.57],        // I Class TBCIX
  [trpFund("(?:bl(?:ue)? chip|bc grwth)"), 0.70],  // Investor TRBCX
  [trpI("growth stock"), 0.52],                          // I Class PRUFX
  [trpFund("growth stock"), 0.66],  // Investor PRGFX
  [trpFund("large[- ]?cap core growth"), 0.56],  // TPLGX
  [trpFund("(?:large|lrg)[- ]?ca?p growth"), 0.55],  // TRLGX
  [trpI("mid[- ]?cap growth", "diversified"), 0.63],                    // I Class RPTIX
  [trpFund("mid[- ]?cap growth", "diversified"), 0.77],  // Investor RPMGX
  [trpFund("mid[- ]?cap value"), 0.65],
  [trpFund("new horizons"), 0.64],
  [trpFund("equity income"), 0.68],
  [trpFund("institutional small[-. ]?\\s*cap stock"), 0.66],
  [trpFund("small[-. ]?\\s*cap value"), 0.79],
  [trpFund("small[-. ]?\\s*cap stock"), 0.92],
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
  // (R)/(TM)/(SM) marks sit mid-name in recordkeeper feeds and broke every
  // contiguous pattern: "Fidelity(R) Growth Company" never matched
  // /fidelity growth company/ -- $43.5B of holdings across the universe.
  let s = String(name).replace(/[\u00ae\u2122\u2120]/g, " ");
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
  // --- T. Rowe Price, I Class (verified per vintage/fund; these must sit
  // above the Investor-class rows in FUND_COMPARABLE, which double as the
  // exact match for a mutual fund that does not state a class) ---
  [trpRetI("2005"), "TRAJX"],
  [trpRetI("2010"), "TRPUX"],
  [trpRetI("2015"), "TRUBX"],
  [trpRetI("2020"), "TRDBX"],
  [trpRetI("2025"), "TREHX"],
  [trpRetI("2030"), "TRFHX"],
  [trpRetI("2035"), "TRFJX"],
  [trpRetI("2040"), "TRHDX"],
  [trpRetI("2045"), "TRIKX"],
  [trpRetI("2050"), "TRJLX"],
  [trpRetI("2055"), "TRJMX"],
  [trpRetI("2060"), "TRLNX"],
  [trpRetI("2065"), "TRMOX"],
  [trpI("retirement balanced"), "TRJWX"],
  [trpBlendI("2020"), "TBLDX"],
  [trpBlendI("2025"), "TBLEX"],
  [trpBlendI("2030"), "TBLGX"],
  [trpBlendI("2035"), "TBLHX"],
  [trpBlendI("2040"), "TBLJX"],
  [trpBlendI("2045"), "TBLKX"],
  [trpBlendI("2050"), "TBLLX"],
  [trpBlendI("2055"), "TBLMX"],
  [trpBlendI("2060"), "TBLNX"],
  // Target series (a lower-equity glide path than Retirement — different
  // funds, different tickers). Only the vintages whose ticker was verified
  // appear; the rest stay blank.
  [trpTargetI("2015"), "TTRTX"],
  [trpTargetI("2025"), "TRVVX"],
  [trpTargetI("2030"), "TWRRX"],
  [trpTargetI("2035"), "TPGPX"],
  [trpTargetI("2040"), "TRXRX"],
  [trpTargetI("2045"), "TRFWX"],
  [trpTargetI("2050"), "TOORX"],
  [trpTargetI("2055"), "TRPPX"],
  [trpTargetI("2060"), "TTOIX"],
  [trpTarget("2010"), "TRROX"],
  [trpTarget("2015"), "TRRTX"],
  [trpTarget("2035"), "RPGRX"],
  [trpTarget("2040"), "TRHRX"],
  [trpTarget("2050"), "TRFOX"],
  [trpTarget("2060"), "TRTFX"],
  // Single-strategy funds, I Class
  [trpI("bl(?:ue)? chip\\s*(?:growth|gr\\w*)"), "TBCIX"],
  [trpI("growth stock"), "PRUFX"],
  [trpI("mid[- ]?cap growth", "diversified"), "RPTIX"],
  [trpI("mid[- ]?cap value"), "TRMIX"],
  [trpI("new horizons"), "PRJIX"],
  [trpI("equity income"), "REIPX"],
  [trpI("dividend growth"), "PDGIX"],
  [trpI("small[-. ]?\\s*cap value"), "PRVIX"],
  [trpI("small[-. ]?\\s*cap stock"), "OTIIX"],
  [trpI("overseas stock"), "TROIX"],
  [trpI("all[- ]?cap opportunities"), "PNAIX"],
  [trpI("capital appreciation"), "TRAIX"],
  [trpI("equity index 500"), "PRUIX"],
  // Value Fund I Class — "value" must follow the manager name directly, or
  // this eats "Large Cap Value I" (a different fund)
  [trpValue(I_CLASS), "TRPIX"],
  // Single-strategy funds with no collective-trust edition in the filed
  // universe (and so no comparable row): Investor class.
  [trpFund("mid[- ]?cap value"), "TRMCX"],
  [trpFund("dividend growth"), "PRDGX"],
  [trpFund("overseas stock"), "TROSX"],
  [trpFund("all[- ]?cap opportunities"), "PRWAX"],
  [trpFund("capital appreciation(?! equity etf)"), "PRWCX"],
  [trpFund("equity index 500"), "PREIX"],
  [trpFund("health sciences"), "PRHSX"],
  // "Value Fund" only when Value follows the manager name — "Large Cap
  // Value", "Mid-Cap Value", "U.S. Value Equity" and "Stable Value" are
  // different funds (or no fund at all)
  [trpValue(""), "TRVLX"],
  // plain Balanced Fund, never "Retirement Balanced"
  [/^(?!.*retire).*?t\.? ?rowe(?: ?pr\w*)?\s+balanced(?:[^a-z0-9]|fund|fd|cl|class|shares?)*i\b/i, "RBAIX"],
  [/^(?!.*retire).*?t\.? ?rowe(?: ?pr\w*)?\s+balanced/i, "RPBAX"],
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
  // Fidelity files its CIT editions as "... Pool Class S/K" — same manager and
  // same strategy as the registered fund, which is the bar for a comparable
  [/fidelity.{0,4} ?contrafund/i, ["FCNTX", 0.39]],
  [/fidelity.{0,4} ?growth company/i, ["FDGRX", 0.61]],
  [/fidelity.{0,4} ?low[- ]priced stock/i, ["FLPSX", 0.58]],
  [/fidelity.{0,4} ?diversified international/i, ["FDIVX", 0.60]],
  [/fidelity.{0,4} ?blue chip growth/i, ["FBGRX", 0.48]],
  // Vanguard's Russell index trusts map 1:1 to the institutional funds
  [/vanguard russell 1000 growth/i, ["VRGWX", 0.07]],
  [/vanguard russell 1000 value/i, ["VRVIX", 0.07]],
  [/vanguard russell 1000(?! growth| value)/i, ["VRNIX", 0.07]],
  [/vanguard russell 2000 growth/i, ["VRTGX", 0.08]],
  [/vanguard russell 2000 value/i, ["VRTVX", 0.08]],
  [/vanguard russell 2000(?! growth| value)/i, ["VRTIX", 0.08]],
  [/dodge & cox stock/i, ["DODGX", 0.51]],
  /* T. Rowe Price. The Retirement / Retirement Blend collective trusts are
   * the trust editions of the identically named registered funds — same
   * manager, same strategy, same vintage — so they are comparables; the
   * mutual funds themselves match here too and are returned as exact.
   * Investor class throughout: these rows are only reached when the filed
   * name states no share class (I Class is handled in FUND_TICKER above).
   * NOT here, deliberately: Retirement HYBRID trusts (no registered
   * edition exists), stable value / common trust vehicles, and bare
   * "Retirement 2045 Class T6" names that never say who manages them. */
  // 2005 reuses the 0.49 the 2010/2015 fact sheets show (same short-dated
  // end of one fee schedule); its own current figure was not published
  [trpRet("2005"), ["TRRFX", 0.49]],
  [trpRet("2010"), ["TRRAX", 0.49]],
  [trpRet("2015"), ["TRRGX", 0.49]],
  [trpRet("2020"), ["TRRBX", 0.51]],
  [trpRet("2025"), ["TRRHX", 0.53]],
  [trpRet("2030"), ["TRRCX", 0.55]],
  [trpRet("2035"), ["TRRJX", 0.58]],
  [trpRet("2040"), ["TRRDX", 0.59]],
  [trpRet("2045"), ["TRRKX", 0.60]],
  [trpRet("2050"), ["TRRMX", 0.62]],
  [trpRet("2055"), ["TRRNX", 0.64]],
  [trpRet("2060"), ["TRRLX", 0.64]],
  [trpRet("2065"), ["TRSJX", 0.64]],
  [new RegExp(TRP_NOT + NOT_R_TAIL + ".*?" + TRP_MGR + "\\s+retirement balanced", "i"), ["TRRIX", 0.49]],
  [trpBlend("2020"), ["TSBAX", 0.41]],
  [trpBlend("2025"), ["TBLVX", 0.41]],
  [trpBlend("2030"), ["TBLWX", 0.41]],
  [trpBlend("2035"), ["TBLYX", 0.41]],
  [trpBlend("2040"), ["TRBLX", 0.41]],
  [trpBlend("2045"), ["TRBQX", 0.41]],
  [trpBlend("2050"), ["TRBSX", 0.41]],
  [trpBlend("2055"), ["TRBOX", 0.41]],
  [trpBlend("2060"), ["TRBNX", 0.41]],
  [trpBlend("2065"), ["TRBPX", 0.41]],
  // single-strategy funds whose CIT editions show up in filings
  // ("Blue Chip Growth Trust T4", "US Mid Cap Growth Equity Trust Z")
  [trpFund("(?:bl(?:ue)? chip|bc grwth)"), ["TRBCX", 0.70]],
  [trpFund("growth stock"), ["PRGFX", 0.66]],
  [trpFund("large[- ]?cap core growth"), ["TPLGX", 0.56]],
  // the Large-Cap Growth Fund was the Institutional Large-Cap Growth Fund
  // until 2020 and TRLGX is still the class plans hold
  [trpFund("(?:large|lrg)[- ]?ca?p growth"), ["TRLGX", 0.55]],
  [trpFund("mid[- ]?cap growth", "diversified"), ["RPMGX", 0.77]],
  [trpFund("new horizons"), ["PRNHX", 0.64]],
  [trpFund("equity income"), ["PRFDX", 0.68]],
  [trpFund("institutional small[-. ]?\\s*cap stock"), ["TRSSX", 0.66]],
  [trpFund("small[-. ]?\\s*cap value"), ["PRSVX", 0.79]],
  [trpFund("small[-. ]?\\s*cap stock"), ["OTCFX", 0.92]],
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
    // The comparable table lists retail funds. When the holding is NOT a
    // pooled vehicle, a match there is the fund itself, not an analogue --
    // exact, no asterisk. Without this, every target-date MUTUAL fund
    // ("Vanguard Target Retirement 2040 Fund", $197B universe-wide) fell
    // through to nothing while its trust edition resolved fine.
    for (const [re, pair] of FUND_COMPARABLE) if (re.test(name) || re.test(n)) return { tk: pair[0], comparable: false };
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
