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
  [/vanguard federal money market/i, 0.11],
  // --- BlackRock ---
  [/blackrock lifepath index/i, 0.09],
  [/blackrock lifepath/i, 0.2],
  [/blackrock (equity|russell \d+|s&p 500|acwi|msci) .*index/i, 0.03],
  [/blackrock (short[- ]term investment|stif|liquidity)/i, 0.1],
  [/blackrock (us|u\.s\.) debt index/i, 0.03],
  [/blackrock total return/i, 0.4],
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
  [/t\.? ?rowe price small[- ]cap/i, 0.66],
  [/t\.? ?rowe price stable value/i, 0.3],
  // --- American Funds (R6) ---
  [/american funds.*europacific/i, 0.46],
  [/american funds.*new world/i, 0.57],
  [/american funds.*washington mutual/i, 0.26],
  [/american funds.*growth fund of america/i, 0.3],
  [/american funds.*target date/i, 0.32],
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
  [/goldman sachs stable value/i, 0.35],
  // --- generic fallbacks (keep last) ---
  [/target (retirement|date) .*index|index target/i, 0.1],
  [/s&p ?500 index|500 index/i, 0.03],
  [/equity index|stock index|bond index|aggregate index|russell \d+ index|msci .*index|acwi/i, 0.06],
  [/\bindex\b/i, 0.1],
  [/money market|cash reserves|treasury only/i, 0.2],
  [/stable value|managed income|guaranteed|gic\b/i, 0.35],
];

// eslint-disable-next-line no-unused-vars
function fundER(name) {
  if (!name) return null;
  if (/self-directed|brokerage|individually listed|participant loan/i.test(name)) return null;
  if (/common stock|company stock|employer stock/i.test(name)) return null;
  for (const [re, er] of FUND_ER) if (re.test(name)) return er;
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
  [/vanguard 500 index (adm|admiral)/i, "VFIAX"],
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
  [/vanguard federal money market/i, "VMFXX"],
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
  [/oakmark international/i, "OAKIX"],
  [/mfs value fund/i, "MEIKX"],
];

// eslint-disable-next-line no-unused-vars
function fundTicker(name) {
  if (!name) return null;
  // institutional vehicles and non-fund rows never get a ticker
  if (/trust|commingled|collective|pool\b|unitized|separate account|\bcit\b|annuity|tiaa traditional|guaranteed|\bgic\b|stable value|separately managed|brokerage|self-directed|common stock|company stock|participant loan/i.test(name)) return null;
  for (const [re, tk] of FUND_TICKER) if (re.test(name)) return tk;
  return null;
}
