/* wampo — plan directory dataset.
 * SAMPLE DATA to demonstrate the product: figures are plausible, not verified.
 * A production version sources assets/participants/recordkeeper from public
 * Form 5500 filings and match/vesting/features from plan documents.
 */

/* ---- deterministic jitter so the numbers are stable between loads ------- */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
function jit(base, key, spread) {
  return base + (hashStr(key) - 0.5) * 2 * spread;
}

/* Fund entries carry only the verifiable facts: name and ticker. Performance
 * and pricing are never displayed from this file — returns aren't in filings,
 * and expense ratios shown in the app are pattern-based estimates
 * (fund-er.js) labeled as such. The cls/er/estVia args remain in call sites
 * as documentation but are intentionally unused. */
function makeFund(name, ticker, cls, er, estVia) {
  return { name, ticker };
}

function makeTdFund(family, year, ticker, er, estVia) {
  return { name: `${family} ${year} CP D`, ticker };
}

const TD_TICKERS = {
  fidelity: { 2015: "FFVFX", 2020: "FFFDX", 2025: "FFDVX", 2030: "FFFEX", 2035: "FFTHX", 2040: "FFFFX", 2045: "FFFGX", 2050: "FFFHX", 2055: "FDEEX", 2060: "FDKVX" },
  vanguard: { 2015: "VTXVX", 2020: "VTWNX", 2025: "VTTVX", 2030: "VTHRX", 2035: "VTTHX", 2040: "VFORX", 2045: "VTIVX", 2050: "VFIFX", 2055: "VFFVX", 2060: "VTTSX" },
  state:    { 2015: "SSBHX", 2020: "SSBOX", 2025: "SSBSX", 2030: "SSBYX", 2035: "SSCKX", 2040: "SSCQX", 2045: "SSDEX", 2050: "SSDLX", 2055: "SSDQX", 2060: "SSDYX" },
};

function makeLineup(provider) {
  const funds = [];
  const years = [2015, 2020, 2025, 2030, 2035, 2040, 2045, 2050, 2055, 2060];

  if (provider === "Vanguard") {
    for (const y of years) funds.push(makeTdFund("Vanguard Target Retire", y, TD_TICKERS.vanguard[y], 0.08));
    funds.push(
      makeFund("Vanguard 500 Index ADM", "VFIAX", "usLarge", 0.04),
      makeFund("Vanguard Extended MKT IDX", "VEXAX", "usMid", 0.06),
      makeFund("Vanguard SM CAP Index", "VSMAX", "usSmall", 0.05),
      makeFund("Vanguard Total INTL Stock", "VTIAX", "intl", 0.11),
      makeFund("Vanguard Total Bond MKT", "VBTLX", "bond", 0.05),
      makeFund("Vanguard Total International Bond", "VTABX", "intlBond", 0.07),
      makeFund("Vanguard Inflation-Protected", "VIPSX", "tips", 0.20),
      makeFund("Vanguard PRIMECAP ADM", "VPMAX", "usGrowth", 0.31),
      makeFund("Vanguard Windsor II ADM", "VWNAX", "usValue", 0.26),
      makeFund("Vanguard Emerging Markets", "VEMAX", "emerging", 0.14),
      makeFund("Vanguard Real Estate IDX", "VGSLX", "realEst", 0.12),
      makeFund("Vanguard Retirement Savings Trust", "VRST", "stable", 0.13, "VMFXX"),
      makeFund("PIMCO Income INST", "PIMIX", "highYield", 0.62),
      makeFund("Dodge & Cox Stock X", "DODGX", "usValue", 0.52),
      makeFund("American Funds Europac Growth R6", "RERGX", "intl", 0.46),
    );
  } else if (provider === "Fidelity") {
    for (const y of years) funds.push(makeTdFund("Fidelity Freedom", y, TD_TICKERS.fidelity[y], 0.42, TD_TICKERS.fidelity[y]));
    funds.push(
      makeFund("Fidelity Freedom INC CP D", "FFFAX", "bond", 0.42, "FFFAX"),
      makeFund("Fidelity 500 Index", "FXAIX", "usLarge", 0.015),
      makeFund("Fidelity MID CAP IDX", "FSMDX", "usMid", 0.025),
      makeFund("Fidelity SM CAP IDX", "FSSNX", "usSmall", 0.025),
      makeFund("Fidelity INTL Index", "FZILX", "intl", 0.035),
      makeFund("Fidelity US Bond Index", "FXNAX", "bond", 0.025),
      makeFund("Fidelity INFL PR BD IDX", "FIPDX", "tips", 0.05),
      makeFund("Fidelity Contrafund K6", "FLCNX", "usGrowth", 0.45),
      makeFund("Fidelity Low-Priced ST K6", "FLKSX", "usMid", 0.46),
      makeFund("Morley Stable Value", "VMFXX", "stable", 0.11, "VMFXX"),
      makeFund("Pioneer LG CAP GR TR", "FGKFX", "usGrowth", 0.45, "FGKFX"),
      makeFund("TCW MetWest Total Return Bond", "MWTRX", "bond", 0.67),
      makeFund("PIMCO High Yield INST", "PHIYX", "highYield", 0.55),
      makeFund("Dodge & Cox Stock X", "DODGX", "usValue", 0.52),
      makeFund("American Funds Europac Growth R6", "RERGX", "intl", 0.46),
      makeFund("Baron Small Cap R6", "BSCRX", "usSmall", 0.95),
      makeFund("DFA US SM CAP Value", "DFSVX", "smValue", 0.52),
      makeFund("DFA Glob Real Estate", "DFGEX", "realEst", 0.28),
      makeFund("Vanguard Total International Bond", "VTABX", "intlBond", 0.07),
    );
  } else {
    for (const y of years) funds.push(makeTdFund("State St Target Retire", y, TD_TICKERS.state[y], 0.09, TD_TICKERS.state[y]));
    funds.push(
      makeFund("State St S&P 500 Index", "SVSPX", "usLarge", 0.02),
      makeFund("Vanguard Extended MKT IDX", "VEXAX", "usMid", 0.06),
      makeFund("Vanguard Total INTL Stock", "VTIAX", "intl", 0.11),
      makeFund("Vanguard Total Bond MKT", "VBTLX", "bond", 0.05),
      makeFund("Galliard Stable Value", "GSVF", "stable", 0.28, "VMFXX"),
      makeFund("T. Rowe Price Blue Chip Growth", "TRBCX", "usGrowth", 0.68),
      makeFund("JPMorgan Equity Income R6", "OIEJX", "usValue", 0.45),
      makeFund("American Funds Europac Growth R6", "RERGX", "intl", 0.46),
      makeFund("TCW MetWest Total Return Bond", "MWTRX", "bond", 0.67),
      makeFund("PIMCO Real Return INST", "PRRIX", "tips", 0.47),
      makeFund("BlackRock High Yield BD INST", "BHYIX", "highYield", 0.60),
      makeFund("DFA Emerging Markets Core", "DFCEX", "emerging", 0.39),
    );
  }
  return funds;
}

const LINEUPS = {};
function lineupFor(provider) {
  const key = provider === "Fidelity" || provider === "Vanguard" ? provider : "generic";
  if (!LINEUPS[key]) LINEUPS[key] = makeLineup(key === "generic" ? "generic" : provider);
  return LINEUPS[key];
}

/* ---- filed lineups -------------------------------------------------------
 * Fund names transcribed from the plan's own Form 5500 "Schedule H, line 4i —
 * Schedule of Assets" attachment. Names only — no performance or pricing.
 */
function makeTdTrust(name, year, estVia) {
  return { name, ticker: "" };
}

const PFE_FUNDS = [
  makeFund("Pfizer Inc. Common Stock", "PFE", "usValue", 0.01),
  makeFund("NTGI Collective Government Short-Term Investment Fund", "", "stable", 0.06, "NOIXX"),
  makeFund("Fidelity Large Cap Growth Fund", "", "usGrowth", 0.43, "FBGRX"),
  makeFund("Boston Partners Large Cap Value Fund", "", "usValue", 0.40, "VVIAX"),
  makeFund("SSGA S&P 500 Index Fund", "", "usLarge", 0.01, "VFIAX"),
  makeFund("SSGA International Equity Index Fund", "", "intl", 0.04, "VTIAX"),
  makeFund("SSGA Small-Mid Cap Equity Index Fund", "", "usMid", 0.03, "VEXAX"),
  makeFund("Wellington International Equity Fund", "", "intl", 0.42, "VWIGX"),
  makeFund("Jennison Small-Mid Cap Equity Fund", "", "usMid", 0.45, "VEXAX"),
  makeFund("Acadian International Equity Fund", "", "intl", 0.44, "VTIAX"),
  makeFund("SSGA Bond Index Fund", "", "bond", 0.02, "VBTLX"),
  makeTdTrust("Vanguard Target Retirement Income Trust Select", 2015, "VTINX"),
  makeTdTrust("Vanguard Target Retirement 2020 Trust Select", 2020, "VTWNX"),
  makeTdTrust("Vanguard Target Retirement 2025 Trust Select", 2025, "VTTVX"),
  makeTdTrust("Vanguard Target Retirement 2030 Trust Select", 2030, "VTHRX"),
  makeTdTrust("Vanguard Target Retirement 2035 Trust Select", 2035, "VTTHX"),
  makeTdTrust("Vanguard Target Retirement 2040 Trust Select", 2040, "VFORX"),
  makeTdTrust("Vanguard Target Retirement 2045 Trust Select", 2045, "VTIVX"),
  makeTdTrust("Vanguard Target Retirement 2050 Trust Select", 2050, "VFIFX"),
  makeTdTrust("Vanguard Target Retirement 2055 Trust Select", 2055, "VFFVX"),
  makeTdTrust("Vanguard Target Retirement 2060 Trust Select", 2060, "VTTSX"),
  makeTdTrust("Vanguard Target Retirement 2065 Trust Select", 2065, "VLXVX"),
  makeTdTrust("Vanguard Target Retirement 2070 Trust Select", 2070, "VSVNX"),
  makeFund("T. Rowe Price Small Cap Stock Fund", "OTCFX", "usSmall", 0.74),
  makeFund("SEI Diversified Bond Fund — Core", "", "bond", 0.40, "VBTLX"),
  makeFund("SEI Diversified Bond Fund — High Yield", "", "highYield", 0.50, "VWEHX"),
  makeFund("SEI Diversified Bond Fund — Emerging Markets", "", "intlBond", 0.55, "VGAVX"),
  makeFund("SEI Diversified Bond Fund — Opportunities Income", "", "highYield", 0.50, "PIMIX"),
];

/* ---- vesting schedule presets ------------------------------------------ */
const VEST = {
  immediate: { label: "IMMEDIATE", schedule: null, note: "Vests immediately upon contribution. No service requirement." },
  cliff3: { label: "CLIFF (3-YEAR)", schedule: [0, 0, 0, 100], note: "Match vests 100% after 3 years of service (cliff). Forfeitures prior to vesting are reallocated." },
  graded3: { label: "GRADED (3-YEAR)", schedule: [33, 67, 100], note: "Match vests one-third per year of service." },
  graded5: { label: "GRADED (5-YEAR)", schedule: [20, 40, 60, 80, 100], note: "Company contributions vest 20% per year of service." },
};

/* ---- plans --------------------------------------------------------------
 * matchCard(): most plans have one elective match card; some add a
 * nonelective/automatic contribution card.
 */
function matchCard(formula, maxBenefit, vest, note) {
  return { title: "Elective Match", kind: "ELECTIVE", formula, maxBenefit, vest, note: note || "Participant must contribute to receive this match." };
}
function necCard(title, formula, maxBenefit, vest) {
  return { title, kind: "NONELECTIVE", formula, maxBenefit, vest, note: "All eligible employees receive this contribution regardless of their own deferrals." };
}

const PLANS = [
  {
    company: "Microsoft", ticker: "MSFT", provider: "Fidelity",
    planName: "Microsoft Corporation 401(k) Plan", city: "Redmond", state: "WA", zip: "98052",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 152000, activePct: 0.78, assetsB: 45.2, assetsYoY: 14.2,
    match: { formula: "50% of every dollar you contribute, up to the IRS employee limit", maxPct: "≈ 3–5% of pay for most" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: true,
    brokerage: "BrokerageLink",
    autoEnroll: "3% default deferral", autoEscalate: null,
    contributions: [matchCard('"50% of the first dollar of every eligible dollar a participant contributes to the Plan, up to the annual IRS employee limit"', "Up to ~3.4% of eligible compensation", VEST.immediate)],
    highlights: ["Auto-enroll @ 3%", "Mega backdoor Roth", "50% match uncapped by pay %"],
    notes: "One of the most flexible large plans: after-tax contributions with automatic in-plan Roth conversion (mega backdoor).",
  },
  {
    company: "Alphabet (Google)", ticker: "GOOGL", provider: "Vanguard",
    planName: "Google LLC 401(k) Savings Plan", city: "Mountain View", state: "CA", zip: "94043",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 135000, activePct: 0.81, assetsB: 42.0, assetsYoY: 15.8,
    match: { formula: "The greater of 100% of your first $3,000 or 50% of your contributions", maxPct: "up to ~$11,750/yr" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: true,
    brokerage: "None",
    autoEnroll: "3% default deferral", autoEscalate: "Increases deferral 1%/yr up to 10%. Opt out anytime.",
    contributions: [matchCard('"The greater of (a) 100% of the first $3,000 deferred or (b) 50% of participant deferrals, up to the annual IRS employee limit"', "Up to ~$11,750 of eligible compensation", VEST.immediate)],
    highlights: ["Auto-enroll @ 3%", "Mega backdoor Roth", "$3,000 floor match"],
    notes: "",
  },
  {
    company: "Meta", ticker: "META", provider: "Fidelity",
    planName: "Meta Platforms, Inc. 401(k) Plan", city: "Menlo Park", state: "CA", zip: "94025",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 62000, activePct: 0.83, assetsB: 18.5, assetsYoY: 16.5,
    match: { formula: "50% of contributions up to the IRS employee limit", maxPct: "≈ 3.5% of pay for most" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: true,
    brokerage: "BrokerageLink",
    autoEnroll: "4% default deferral", autoEscalate: null,
    contributions: [matchCard('"50% of each dollar a participant contributes, up to the annual IRS employee limit"', "Up to ~3.5% of eligible compensation", VEST.immediate)],
    highlights: ["Auto-enroll @ 4%", "Mega backdoor Roth", "BrokerageLink window"],
    notes: "",
  },
  {
    company: "Apple", ticker: "AAPL", provider: "Empower",
    planName: "Apple Inc. 401(k) Plan", city: "Cupertino", state: "CA", zip: "95014",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 120000, activePct: 0.74, assetsB: 22.0, assetsYoY: 12.1,
    match: { formula: "50–100% of your first 6%, based on years of service", maxPct: "3–6% of pay" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "None",
    autoEnroll: "3% default deferral", autoEscalate: null,
    contributions: [matchCard('"50% of the first 6% of eligible pay (under 3 years of service); 75% (3–5 years); 100% (5+ years)"', "3–6% of eligible compensation, by tenure", VEST.immediate)],
    highlights: ["Auto-enroll @ 3%", "Tenure-tiered match", "Immediate vesting"],
    notes: "Match rate steps up with tenure: 50% (<3 yrs), 75% (3–5 yrs), 100% (5+ yrs).",
  },
  {
    company: "Amazon", ticker: "AMZN", provider: "Fidelity",
    planName: "Amazon.com 401(k) Plan", city: "Seattle", state: "WA", zip: "98109",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 900000, activePct: 0.62, assetsB: 30.0, assetsYoY: 10.4,
    match: { formula: "50% of your first 4% of pay", maxPct: "2% of pay" },
    vesting: "3-year cliff",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "BrokerageLink",
    autoEnroll: "3% default deferral", autoEscalate: null,
    contributions: [matchCard('"50% of the first 4% of eligible compensation deferred by the participant"', "Up to 2% of eligible compensation", VEST.cliff3)],
    highlights: ["Auto-enroll @ 3%", "3-year cliff vesting", "BrokerageLink window"],
    notes: "Largest participant count in the dataset; match is modest and cliff-vested.",
  },
  {
    company: "Netflix", ticker: "NFLX", provider: "Schwab",
    planName: "Netflix, Inc. 401(k) Plan", city: "Los Gatos", state: "CA", zip: "95032",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 13000, activePct: 0.86, assetsB: 3.2, assetsYoY: 18.9,
    match: { formula: "Dollar-for-dollar up to 4% of pay", maxPct: "4% of pay" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "Schwab PCRA",
    autoEnroll: null, autoEscalate: null,
    contributions: [matchCard('"100% of the first 4% of eligible compensation deferred by the participant"', "Up to 4% of eligible compensation", VEST.immediate)],
    highlights: ["Dollar-for-dollar match", "Schwab PCRA window", "Immediate vesting"],
    notes: "",
  },
  {
    company: "NVIDIA", ticker: "NVDA", provider: "Fidelity",
    planName: "NVIDIA Corporation 401(k) Plan", city: "Santa Clara", state: "CA", zip: "95051",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 26000, activePct: 0.88, assetsB: 9.8, assetsYoY: 24.6,
    match: { formula: "Dollar-for-dollar on your first contributions, capped yearly", maxPct: "capped ≈ $10,500/yr" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: true,
    brokerage: "BrokerageLink",
    autoEnroll: "3% default deferral", autoEscalate: null,
    contributions: [matchCard('"100% of participant contributions up to the annual company cap"', "Capped ≈ $10,500 per year", VEST.immediate)],
    highlights: ["Dollar-for-dollar match", "Mega backdoor Roth", "BrokerageLink window"],
    notes: "",
  },
  {
    company: "Tesla", ticker: "TSLA", provider: "Fidelity",
    planName: "Tesla, Inc. 401(k) Plan", city: "Austin", state: "TX", zip: "78725",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 110000, activePct: 0.71, assetsB: 8.4, assetsYoY: 13.7,
    match: { formula: "50% of your first 6% of pay", maxPct: "3% of pay" },
    vesting: "3-year graded",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "BrokerageLink",
    autoEnroll: null, autoEscalate: null,
    contributions: [matchCard('"50% of the first 6% of eligible compensation deferred by the participant"', "Up to 3% of eligible compensation", VEST.graded3)],
    highlights: ["BrokerageLink window", "Roth available"],
    notes: "Match paid in cash (historically was partly in stock).",
  },
  {
    company: "JPMorgan Chase", ticker: "JPM", provider: "Empower",
    planName: "JPMorgan Chase 401(k) Savings Plan", city: "New York", state: "NY", zip: "10179",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 280000, activePct: 0.69, assetsB: 40.5, assetsYoY: 11.2,
    match: { formula: "Dollar-for-dollar up to 5% of pay (after 1 year)", maxPct: "5% of pay" },
    vesting: "3-year cliff",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "None",
    autoEnroll: "3% default deferral", autoEscalate: "Increases deferral 1%/yr up to 10%. Opt out anytime.",
    contributions: [
      matchCard('"100% of the first 5% of eligible compensation deferred, after one year of service"', "Up to 5% of eligible compensation", VEST.cliff3),
      necCard("Automatic Pay Credit", '"Annual pay credit for eligible employees regardless of whether they defer"', "Varies by pay band", VEST.cliff3),
    ],
    highlights: ["Auto-enroll @ 3%", "Automatic pay credit", "Dollar-for-dollar match"],
    notes: "",
  },
  {
    company: "Goldman Sachs", ticker: "GS", provider: "Fidelity",
    planName: "The Goldman Sachs 401(k) Plan", city: "New York", state: "NY", zip: "10282",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 45000, activePct: 0.77, assetsB: 12.1, assetsYoY: 12.9,
    match: { formula: "Dollar-for-dollar up to 4% of pay (higher for some tenures)", maxPct: "4%+ of pay" },
    vesting: "3-year cliff",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "BrokerageLink",
    autoEnroll: null, autoEscalate: null,
    contributions: [matchCard('"100% of the first 4% of eligible compensation deferred by the participant"', "Up to 4%+ of eligible compensation", VEST.cliff3)],
    highlights: ["Dollar-for-dollar match", "BrokerageLink window"],
    notes: "",
  },
  {
    company: "Boeing", ticker: "BA", provider: "Fidelity",
    planName: "The Boeing Company Voluntary Investment Plan", city: "Arlington", state: "VA", zip: "22202",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 210000, activePct: 0.64, assetsB: 60.0, assetsYoY: 9.8,
    match: { formula: "Dollar-for-dollar up to 10% of pay (union agreement dependent)", maxPct: "up to 10% of pay" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: true,
    brokerage: "BrokerageLink",
    autoEnroll: "4% default deferral", autoEscalate: "Increases deferral 1%/yr up to 8%. Opt out anytime.",
    contributions: [matchCard('"100% of the first 10% of eligible compensation deferred (varies by union agreement)"', "Up to 10% of eligible compensation", VEST.immediate)],
    highlights: ["Up to 10% match", "Mega backdoor Roth", "Auto-enroll @ 4%"],
    notes: "One of the richest matches among large employers after pension freeze.",
  },
  {
    company: "Walmart", ticker: "WMT", provider: "Bank of America",
    planName: "Walmart 401(k) Plan", city: "Bentonville", state: "AR", zip: "72716",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 1600000, activePct: 0.58, assetsB: 45.0, assetsYoY: 8.7,
    match: { formula: "Dollar-for-dollar up to 6% of pay (after 1 year)", maxPct: "6% of pay" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "None",
    autoEnroll: null, autoEscalate: null,
    contributions: [matchCard('"100% of the first 6% of eligible compensation deferred, after one year of service"', "Up to 6% of eligible compensation", VEST.immediate)],
    highlights: ["Dollar-for-dollar to 6%", "Immediate vesting", "Largest plan in the US"],
    notes: "Biggest plan in the US by participant count.",
  },
  {
    company: "Costco", ticker: "COST", provider: "T. Rowe Price",
    planName: "Costco 401(k) Retirement Plan", city: "Issaquah", state: "WA", zip: "98027",
    planTypes: ["401(k)", "Profit Sharing"], planYear: 2024,
    participants: 220000, activePct: 0.72, assetsB: 32.0, assetsYoY: 11.9,
    match: { formula: "50% of your first $1,000/yr, plus an annual company contribution that grows with tenure", maxPct: "3–9% of pay incl. discretionary" },
    vesting: "5-year graded",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "None",
    autoEnroll: null, autoEscalate: null,
    contributions: [
      matchCard('"50% of the first $1,000 a participant contributes each year"', "Up to $500 per year", VEST.graded5),
      necCard("Discretionary Company Contribution", '"Annual company contribution based on years of service, made to all eligible employees"', "3–9% of eligible compensation by tenure", VEST.graded5),
    ],
    highlights: ["Generous automatic contribution", "Profit sharing", "Tenure-based"],
    notes: "Unusual structure: small match, generous automatic contribution.",
  },
  {
    company: "Home Depot", ticker: "HD", provider: "Alight",
    planName: "The Home Depot FutureBuilder Plan", city: "Atlanta", state: "GA", zip: "30339",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 350000, activePct: 0.61, assetsB: 12.0, assetsYoY: 9.2,
    match: { formula: "150% of your first 1%, 50% of the next 2–5%", maxPct: "3.5% of pay" },
    vesting: "3-year cliff",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "None",
    autoEnroll: null, autoEscalate: null,
    contributions: [matchCard('"150% of the first 1% of eligible compensation deferred, plus 50% of the next 2–5%"', "Up to 3.5% of eligible compensation", VEST.cliff3)],
    highlights: ["Front-loaded match on first 1%"],
    notes: "",
  },
  {
    company: "Johnson & Johnson", ticker: "JNJ", provider: "Fidelity",
    planName: "Johnson & Johnson Savings Plan", city: "New Brunswick", state: "NJ", zip: "08933",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 55000, activePct: 0.75, assetsB: 22.5, assetsYoY: 10.8,
    match: { formula: "75% of your first 6% of pay", maxPct: "4.5% of pay" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "BrokerageLink",
    autoEnroll: "3% default deferral", autoEscalate: null,
    contributions: [matchCard('"75% of the first 6% of eligible compensation deferred by the participant"', "Up to 4.5% of eligible compensation", VEST.immediate)],
    highlights: ["Auto-enroll @ 3%", "Immediate vesting", "BrokerageLink window"],
    notes: "",
  },
  {
    company: "ExxonMobil", ticker: "XOM", provider: "Voya",
    planName: "ExxonMobil Savings Plan", city: "Spring", state: "TX", zip: "77389",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 42000, activePct: 0.70, assetsB: 25.0, assetsYoY: 8.4,
    match: { formula: "7% company contribution when you contribute 6%", maxPct: "7% of pay" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: false,
    brokerage: "None",
    autoEnroll: null, autoEscalate: null,
    contributions: [necCard("Company Contribution", '"7% of eligible compensation contributed when the participant defers at least 6%"', "7% of eligible compensation", VEST.immediate)],
    highlights: ["7% company contribution", "After-tax available", "Immediate vesting"],
    notes: "",
  },
  {
    company: "Lockheed Martin", ticker: "LMT", provider: "Empower",
    planName: "Lockheed Martin Salaried Savings Plan", city: "Bethesda", state: "MD", zip: "20817",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 120000, activePct: 0.66, assetsB: 48.0, assetsYoY: 9.5,
    match: { formula: "50% of your first 8%, plus 4% automatic company contribution", maxPct: "8% of pay incl. automatic" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: true,
    brokerage: "None",
    autoEnroll: "4% default deferral", autoEscalate: null,
    contributions: [
      matchCard('"50% of the first 8% of eligible compensation deferred by the participant"', "Up to 4% of eligible compensation", VEST.immediate),
      necCard("Automatic Company Contribution", '"4% of eligible compensation contributed for all eligible employees regardless of deferrals"', "4% of eligible compensation — all eligible employees", VEST.immediate),
    ],
    highlights: ["4% automatic contribution", "Mega backdoor Roth", "Auto-enroll @ 4%"],
    notes: "",
  },
  {
    company: "Starbucks", ticker: "SBUX", provider: "Fidelity",
    planName: "Starbucks Corporation 401(k) Plan", city: "Seattle", state: "WA", zip: "98134",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 200000, activePct: 0.55, assetsB: 4.5, assetsYoY: 12.3,
    match: { formula: "Dollar-for-dollar up to 5% of pay", maxPct: "5% of pay" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: false, megaBackdoor: false,
    brokerage: "None",
    autoEnroll: null, autoEscalate: null,
    contributions: [matchCard('"100% of the first 5% of eligible compensation deferred by the participant"', "Up to 5% of eligible compensation", VEST.immediate)],
    highlights: ["Day-one eligibility incl. part-time", "Dollar-for-dollar to 5%"],
    notes: "Eligible from day one, including part-time partners.",
  },
  {
    company: "Salesforce", ticker: "CRM", provider: "Fidelity",
    planName: "Salesforce 401(k) Plan", city: "San Francisco", state: "CA", zip: "94105",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 45000, activePct: 0.82, assetsB: 7.8, assetsYoY: 15.1,
    match: { formula: "Dollar-for-dollar up to 6% of pay, capped yearly", maxPct: "capped ≈ $5,000/yr" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: true,
    brokerage: "BrokerageLink",
    autoEnroll: "3% default deferral", autoEscalate: null,
    contributions: [matchCard('"100% of the first 6% of eligible compensation deferred, up to the annual company cap"', "Capped ≈ $5,000 per year", VEST.immediate)],
    highlights: ["Auto-enroll @ 3%", "Mega backdoor Roth", "BrokerageLink window"],
    notes: "",
  },
  {
    company: "UPS", ticker: "UPS", provider: "Voya",
    planName: "UPS 401(k) Savings Plan", city: "Atlanta", state: "GA", zip: "30328",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 400000, activePct: 0.60, assetsB: 30.0, assetsYoY: 8.1,
    match: { formula: "50% of your first 6% (non-union); union plans vary", maxPct: "3% of pay" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: false,
    brokerage: "None",
    autoEnroll: null, autoEscalate: null,
    contributions: [matchCard('"50% of the first 6% of eligible compensation deferred (non-union employees; union agreements vary)"', "Up to 3% of eligible compensation", VEST.immediate)],
    highlights: ["After-tax available", "Immediate vesting"],
    notes: "",
  },
  {
    company: "Intel", ticker: "INTC", provider: "Fidelity",
    planName: "Intel 401(k) Savings Plan", city: "Santa Clara", state: "CA", zip: "95054",
    planTypes: ["401(k)", "Profit Sharing"], planYear: 2024,
    participants: 60000, activePct: 0.68, assetsB: 20.0, assetsYoY: 7.6,
    match: { formula: "Discretionary annual contribution (no per-paycheck match)", maxPct: "varies by year" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: true,
    brokerage: "BrokerageLink",
    autoEnroll: "3% default deferral", autoEscalate: null,
    contributions: [necCard("Discretionary Retirement Contribution", '"Annual discretionary contribution determined by the company each plan year"', "Varies by year — all eligible employees", VEST.immediate)],
    highlights: ["Discretionary annual contribution", "Mega backdoor Roth", "BrokerageLink window"],
    notes: "",
  },
  {
    company: "Chevron", ticker: "CVX", provider: "Fidelity",
    planName: "Chevron Employee Savings Investment Plan", city: "Houston", state: "TX", zip: "77002",
    planTypes: ["401(k)"], planYear: 2024,
    participants: 30000, activePct: 0.73, assetsB: 21.0, assetsYoY: 8.9,
    match: { formula: "8% company contribution when you contribute 2%", maxPct: "8% of pay" },
    vesting: "Immediate",
    pretax: true, roth: true, afterTax: true, megaBackdoor: true,
    brokerage: "BrokerageLink",
    autoEnroll: null, autoEscalate: null,
    contributions: [necCard("Company Contribution", '"8% of eligible compensation contributed when the participant defers at least 2%"', "8% of eligible compensation", VEST.immediate)],
    highlights: ["8% company contribution", "Mega backdoor Roth", "BrokerageLink window"],
    notes: "",
  },
  {
    // Overlay only — filed figures come from plans-filed.json. The lineup and
    // brokerage account are transcribed from Pfizer's 2024 Schedule H line 4i.
    company: "Pfizer", ticker: "PFE", provider: "Fidelity",
    brokerage: "Self-directed brokerage",
    funds: PFE_FUNDS,
    fundsSource: "From the plan's filed Schedule H line 4i (2024). Fund names and the self-directed brokerage account are filed facts",
  },
];

/* ---- derived 5500-style figures (sample; deterministic per company) ----- */
for (const p of PLANS) {
  const h = (k, lo, hi) => lo + hashStr(p.ticker + k) * (hi - lo);
  p.ein = `${String(Math.floor(h("e1", 10, 99))).padStart(2, "0")}-${String(Math.floor(h("e2", 1000000, 9999999)))}`;
  p.activeParticipants = Math.round(p.participants * p.activePct);
  if (!p.funds) p.funds = lineupFor(p.provider);
  const assetsM = p.assetsB * 1000;
  p.flows = {
    deferralsM: +(assetsM * h("d", 0.05, 0.07)).toFixed(1),
    employerM: +(assetsM * h("m", 0.018, 0.03)).toFixed(1),
    rolloversM: +(assetsM * h("r", 0.008, 0.016)).toFixed(1),
    adminK: Math.round(p.participants * h("a", 120, 220)),
    priorAssetsM: +(assetsM / (1 + p.assetsYoY / 100)).toFixed(1),
  };
  const day = Math.floor(h("f", 1, 28));
  p.filed = `Filed Oct ${day}, ${p.planYear + 1}`;
}
