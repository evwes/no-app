/* wampo — 401(k) plan intelligence.
 * Data layers per company:
 *   FILED   — plans-filed.json (Form 5500 main + Schedule H) and lineups.json
 *             (Schedule H line 4i attachment): EIN, participants, assets,
 *             flows, business code, fund holdings, brokerage account.
 *   CURATED — data.js overlay (match formula, vesting, tax options) — not in
 *             public filings, community-maintained and labeled as such.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* ---- match-quote guard -------------------------------------------------
   * CANONICAL COPY: scripts/lib-quote.mjs, which carries the reasoning and the
   * measurements. This is the browser twin; scripts/smoke-test.mjs runs both
   * against docs/quote-guard-cases.json and fails when they disagree, because
   * this rule has already drifted between its two homes once. */
  const QG_WORDNUM = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one hundred|hundred)(?:[- ](?:five|hundred))?";
  const QG_N = `(?:\\d+(?:\\.\\d+)?\\s?(?:%|percent)|${QG_WORDNUM}\\s+percent)`;
  const QG_PCT_THEN_OF = new RegExp(`(?:${QG_N})[^.]{0,15}?\\b(?:of|on|for each|for every|up to|not to exceed|to a maximum)\\b`, "i");
  const QG_LEADIN = new RegExp(`\\b(?:up to|not to exceed|equal(?:s|ling)? to|equals|equal|a maximum of|maximum of|lesser of)\\b[^.]{0,25}?(?:${QG_N}|\\$\\s?[\\d,]+)`, "i");
  const QG_DOLLAR = /\$\s?[\d,]+(?:\.\d+)?\s*(?:per|each|a)\s+(?:year|month|pay period|payroll|participant|annum)/i;
  const QG_WORD = /\bdollar[- ]for[- ]dollar\b|\b\d+\s?cents?\s+(?:for|on|per)\b|\bone[- ](?:half|third|quarter)\s+of\b/i;

  function matchQuoteOk(text, hasFormula = false) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (/^Vesting\b/i.test(t)) return false;
    if (QG_PCT_THEN_OF.test(t) || QG_LEADIN.test(t) || QG_DOLLAR.test(t) || QG_WORD.test(t)) return true;
    if (/\bvest(?:s|ed|ing)?\b/i.test(t)) return false;
    if (/\b(?:is|are) credited with\b|\bare recorded when\b|\bon the accrual basis\b/i.test(t)) return false;
    if (/\b(?:not eligible for|(?:are|is) eligible to (?:receive|participate)|becomes? eligible for|to be eligible (?:for|to))\b/i.test(t)) return false;
    return hasFormula;
  }
  window.__wampoMatchQuoteOk = matchQuoteOk;   // read by the smoke test only

  /* ---- vesting-quote guard ------------------------------------------------
   * CANONICAL COPY: scripts/lib-quote.mjs, which carries the six measurement
   * passes and the five refutations. This is the browser twin, SLICED VERBATIM
   * from that file by scratchpad/slice-vq.mjs and never typed by hand;
   * scripts/smoke-test.mjs runs both against docs/quote-guard-cases.json and
   * fails when they disagree. */
  const VQ_RULE_WORD = String.raw`(?:based upon|based on|dependent upon|dependent on|determined by|determined based|according to|as follows|following (?:table|schedule)|years of (?:credited |vesting |continuous )?service|increments of|anniversar|cliff|graded)`;
  /* (b) ANY vesting rule. Generous on purpose — see the note above. */
  const VQ_VESTS = new RegExp([
    String.raw`\bvests?\b`,
    String.raw`\bvesting\b`,
    String.raw`\bforfeit`,
    /* a copula before the participle, with anything in the gap: "are 100%
     * immediately vested", "is one hundred percent (100%) vested" */
    String.raw`\b(?:are|is|was|were|be|become|becomes|became|been|have|has|had)\b[^.]{0,40}?\bvested\b`,
    String.raw`\bvested\s+(?:in|after|upon|at|according|based|immediately|when|once|following)\b`,
    String.raw`\bvested\s*(?:\d{1,3}\s?%|percent)`,
    String.raw`(?:\d{1,3}\s?%|percent)\s*\)?\s*vested\b`,
    String.raw`\bvested\s+(?:interest|percentage|portion|percent|value|service)\b[\s\S]{0,200}?${VQ_RULE_WORD}`,
    String.raw`${VQ_RULE_WORD}[\s\S]{0,200}?\bvested\s+(?:interest|percentage|portion|percent|value)\b`,
    /* a ladder, with or without percent signs */
    String.raw`\d{1,3}\s?%[\s\S]{0,40}?(?:year|anniversar)`,
    String.raw`(?:year|anniversar)[\s\S]{0,40}?\d{1,3}\s?%`,
    String.raw`\d\s+years?\b[\s\S]{0,8}\d{2,3}\b[\s\S]{0,40}?\d\s+years?\b`,
  ].join("|"), "i");

  /* (a) the other named rule. Each arm is anchored on vocabulary that rule owns,
   * not on a word it merely contains: "loan" alone would catch "one-half of the
   * participant's vested balance" inside a real vesting sentence. */
  const VQ_OTHER_RULE = new RegExp([
    /* loan limit */
    String.raw`\b(?:participant loans?|loans? (?:are|from|under|permitted|secured)|may borrow|minimum loan|maximum loan|outstanding (?:loan|balance of any previous loan))\b`,
    /* raw Form 5500 table text bled into the notes */
    String.raw`\b2[a-d]\b[\s\S]{0,60}\bEIN\b`,
    String.raw`Name of Participating`,
    /* a merger or an amendment */
    String.raw`\b(?:was|been) (?:amended|merged)`,
    String.raw`merged into the Plan`,
    String.raw`transferred in full to the receiving plan`,
    String.raw`In-Plan Roth Conversions`,
    /* an in-service withdrawal or a distribution.
     * `withdraws` is here because without it THE MOTIVATING CASE ESCAPED. The
     * first store-wide count of this class — 39 entries — did not contain PSEG,
     * whose sentence opens "If a Participant WITHDRAWS", third person singular,
     * where every arm written from the sample said "may withdraw". That is the
     * SECOND time in this one investigation that a measurement could not see its
     * own motivating example, and it was caught by a pinned fixture failing
     * rather than by re-reading the count. */
    String.raw`\b(?:may (?:elect to )?withdraw|may withdrawal|withdraws|in-service (?:withdrawal|distribution)|allows for in-service|available for distribution|must take a distribution|may (?:elect to )?receive (?:a |all|either|the )|entitled to (?:receive|the (?:full|total) value)|Payments of Benefits|payable upon|reallocated to supplement)\b`,
  ].join("|"), "i");

  /**
   * True when `text` may be shown to a reader under a vesting heading.
   * @param {string} text the stored vestingText
   */
  function vestingQuoteOk(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (VQ_VESTS.test(t)) return true;          /* (b) states a vesting rule */
    return !VQ_OTHER_RULE.test(t);              /* (a) states another one */
  }
  window.__wampoVestingQuoteOk = vestingQuoteOk;   // read by the smoke test only

  /* TABLE DEBRIS LEADING A PUBLISHED QUOTE. The two guards above decide WHETHER
   * a quote may be published; nothing decided what its first character is, so
   * Lithia Motors (30,021 ppl) published "| Contributions — The Plan provides
   * for employee contributions…" with the Schedule-H column bar intact. 64
   * quotes / 64 plans / 129,653 participants. The gate is "a sentence must
   * remain": a leading-glyph repair and a mid-sentence truncation look
   * identical from the first character. A COMMA is deliberately absent from
   * Q_LEAD (Yusen's ",000 (indexed)" is the inside of $23,000) and so is the
   * BULLET (the audited notes' own list formatting). Trimming changes NEITHER
   * guard's verdict on any of the 64, measured store-wide.
   * CANONICAL COPY, with the case and the refusals: scripts/lib-quote.mjs. */
  const Q_LEAD = /^(?:[|│┃]|[)\]}]|[;:]|_)+[\s|)\]};:_.\-–]*/;
  const Q_SENTENCE = /^(?:[A-Z]|\d+(?:\.\d+)?\s*%|["“(])/;
  function quoteTrim(text) {
    const t = String(text || "").trim();
    if (!Q_LEAD.test(t)) return t;
    const rest = t.replace(Q_LEAD, "").trim();
    return Q_SENTENCE.test(rest) ? rest : t;
  }
  window.__wampoQuoteTrim = quoteTrim;             // read by the smoke test only

  /* Coverage band — canonical copy in scripts/lib-disclose.mjs, which carries
   * the measurements. Same drift risk as the quote guard, same protection:
   * the smoke test runs this copy against the module's own boundary cases.
   * The static pages went without this note on 533 of 5,000 pages until
   * 2026-09-10, JPMorgan Chase's among them at 66% of the plan. */
  function coverageBand(total, planAssets, fromTrust = false) {
    if (fromTrust) return null;
    if (!total || !planAssets || total <= 0 || planAssets <= 0) return null;
    const pct = (total / planAssets) * 100;
    if (pct >= 95 && pct <= 105) return null;
    return { kind: pct < 95 ? "under" : "over", pct, severe: pct < 50 };
  }
  window.__wampoCoverageBand = coverageBand;   // read by the smoke test only

  /* Frozen claim — canonical copy, reasoning and measurements in
   * scripts/lib-disclose.mjs. Judge WHICH PLAN is the subject of the freeze
   * verb: Comcast's notes say "The Solar Energy World 401k plan was frozen",
   * Leggett & Platt's say "the Hanes Retirement Plan was frozen", while Hanes'
   * OWN filing says "the Plan was frozen" and is kept. Conditional clauses —
   * Honeywell's "in the event the Company ... permanently discontinues
   * contributions" — are the ERISA boilerplate and never a statement of fact.
   * An earlier version of this guard keyed on employer contributions instead
   * and hid 750 genuine terminations to catch 80 false ones; a plan that
   * terminates in June pays January to June. Suppresses only, never asserts. */
  const FROZEN_CONDITIONAL = /\b(?:in the event|if the (?:plan|company|employer|sponsor)\b|should the (?:plan|company|employer)\b|were the plan\b|reserves the right|although it has not expressed|may (?:be |elect to )?(?:freeze|terminate))/i;
  const FROZEN_ARTICLES = new Set(["the", "this", "a", "an", "its", "such", "and", "that", "said"]);
  function frozenSubjectName(text, sponsorName = "") {
    const t = String(text || "").replace(/\s+/g, " ");
    const sponsorWords = new Set(String(sponsorName || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ")
      .split(/\s+/).filter((w) => w.length > 3));
    const re = /((?:[A-Za-z0-9&.'’()-]+\s+){0,5})((?:401\(?k\)?|403\(?b\)?|Retirement|Savings|Pension|Thrift)?\s*[Pp]lan)\s+(?:was|were|has been|have been|is|are)\s+(?:frozen|terminated)/g;
    let m, best = null;
    while ((m = re.exec(t))) {
      const pre = m[1].trim().split(/\s+/).filter(Boolean);
      const names = [];
      for (let i = pre.length - 1; i >= 0; i--) {
        const w = pre[i];
        if (FROZEN_ARTICLES.has(w.toLowerCase())) break;
        if (!/^[A-Z0-9]/.test(w)) break;
        names.unshift(w);
      }
      const proper = names.filter((w) => /^[A-Z][a-z]|^[A-Z]{2,}/.test(w) && !sponsorWords.has(w.toUpperCase()));
      if (proper.length) best = proper.join(" ");
      else return null;
    }
    return best;
  }
  function frozenClaimOk(frozen, frozenText, sponsorName = "") {
    if (!frozen) return false;
    const t = String(frozenText || "");
    if (!t.trim()) return true;
    if (FROZEN_CONDITIONAL.test(t)) return false;
    return frozenSubjectName(t, sponsorName) === null;
  }
  window.__wampoFrozenClaimOk = frozenClaimOk;  // read by the smoke test only

  const state = {
    deepLinkMiss: null,   // a #plan= link that matched nothing, surfaced instead of ignored
    query: "",
    filters: { brokerage: false, megaBackdoor: false, immediateVesting: false, fullFiling: false },
    provider: "",
    industry: "",
    planType: "",
    matchType: "",
    tableSort: { key: "assets", dir: -1 },
    expanded: new Set(),
    lineupTab: {},
    dotPick: null, // Set of plan ids from a clicked map dot; narrows the table
    plans: [],
  };

  const fmtInt = new Intl.NumberFormat("en-US");
  const fmtCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function money(m) {
    if (m == null) return "—";
    const sign = m < 0 ? "−" : "";
    const a = Math.abs(m);
    if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(2) + "T";
    if (a >= 1000) return sign + "$" + (a / 1000).toFixed(1) + "B";
    if (a >= 1) return sign + "$" + a.toFixed(1) + "M";
    return sign + "$" + Math.round(a * 1000) + "K";
  }

  function titlePlanName(s) {
    return String(s || "").toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
      .replace(/401\(K\)/gi, "401(k)")
      .replace(/403\(B\)/gi, "403(b)")
      .replace(/\b(Llc|Llp|Esop|Ira|Us|Usa)\b/g, (m) => m.toUpperCase());
  }

  const NAICS = {
    11: "Agriculture", 21: "Energy & Mining", 22: "Utilities", 23: "Construction",
    31: "Manufacturing", 32: "Manufacturing", 33: "Manufacturing", 42: "Wholesale",
    44: "Retail", 45: "Retail", 48: "Transportation", 49: "Transportation",
    51: "Information & Media", 52: "Finance & Insurance", 53: "Real Estate",
    54: "Professional Services", 55: "Management", 56: "Admin Services",
    61: "Education", 62: "Health Care", 71: "Entertainment", 72: "Hospitality",
    81: "Other Services", 92: "Public Admin",
  };
  function industryOf(code) {
    return NAICS[String(code || "").slice(0, 2)] || "";
  }

  /* ---- merge filed + curated -------------------------------------------- */

  function planTypesFromCode(code) {
    // 8a characteristic codes per the official Form 5500 instructions:
    // 2J=401(k), 2L=403(b)(1) annuity, 2M=403(b)(7) custodial, 2O/2P=ESOP
    const types = [];
    if (/2J/.test(code)) types.push("401(k)");
    if (/2L|2M/.test(code)) types.push("403(b)");
    if (/2E/.test(code)) types.push("Profit Sharing");
    if (/2O|2P/.test(code)) types.push("ESOP");
    return types.length ? types : ["Pension"];
  }

  function fmtFiledDate(d) {
    if (!d) return "Filed date —";
    const dt = new Date(d);
    if (isNaN(dt)) return "Filed " + d;
    return "Filed " + dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function derive(plan) {
    // line 6g(2) is filer-entered and occasionally absurd: Union Savings
    // Bank filed 3 with-balance participants against 500 total ($26M
    // "average"), Verizon Management filed 12,068 against 119,145 ($2.6M
    // "average"). Distrust it when it's under 5% of participants, or under
    // half of them while implying a >$1M average — genuine $1M+ plans
    // (Cravath, Lone Pine, anesthesia groups) have counts that agree, so
    // they keep the filed figure. Threshold adjustable as cases surface.
    const pb = plan.partBalances, pt = plan.participants || 0;
    const balCnt = pb && pb >= pt * 0.05 &&
      (pb >= pt * 0.5 || plan.assetsB == null || (plan.assetsB * 1e9) / pb <= 1e6)
      ? pb : pt;
    plan.avgBal = plan.assetsB != null && balCnt
      ? (plan.assetsB * 1e9) / balCnt : null;
    const f = plan.flows || {};
    const contrib = (f.deferralsM || 0) + (f.employerM || 0);
    plan.avgContrib = contrib && plan.activeParticipants
      ? (contrib * 1e6) / plan.activeParticipants : null;
    // IRC 415(c) caps annual additions (~$77.5K with catch-up in 2025); an
    // average above that means the filed contribution line includes merger
    // transfers or similar — the true average is unknowable, so show none
    if (plan.avgContrib > 80000) plan.avgContrib = null;
    // boot-time rows carry prep-precomputed averages (same rules, rounded to
    // $100); the exact re-derivation above takes over once the detail shard
    // supplies the raw components
    if (plan.avgBal == null && plan.avgBalPre) plan.avgBal = plan.avgBalPre;
    if (plan.avgContrib == null && plan.avgContribPre) plan.avgContrib = plan.avgContribPre;
    return plan;
  }

  function mergePlan(curated, filed) {
    if (!filed) return derive({ ...curated, industry: curated.industry || "", dataStatus: "sample", source: "Community-sourced sample data" });
    const c = curated || {};
    const yoy = filed.assetsBOY && filed.assetsEOY ? (filed.assetsEOY / filed.assetsBOY - 1) * 100 : null;
    return derive({
      // the boot file's ROW INDEX, carried through so row-aligned side files
      // (map-points.json) can be looked up without shipping coordinates at
      // boot. Dropping it here is what made the first map draw zero dots.
      row: filed.row,
      ticker: filed.ticker,
      company: filed.company,
      // FILED beats curated wherever both exist — the overlay predates the
      // extraction pipeline and can go stale; filings are re-pulled weekly
      provider: filed.recordkeeper || c.provider || null,
      providerFiled: !!filed.recordkeeper,
      planName: titlePlanName(filed.planName),
      // "Shiel Sexton Company Inc" on a plan now filed by Structure Man Holding:
      // searchable, and shown on the report so the reader knows why it matched
      alias: filed.alias || "",
      city: filed.city, state: filed.state, zip: filed.zip,
      planTypes: planTypesFromCode(filed.pensionCode || ""),
      industry: industryOf(filed.businessCode),
      planYear: filed.planYear,
      participants: filed.participants,
      activeParticipants: filed.activeParticipants,
      partBalances: filed.partBalances || 0,
      avgBalPre: filed.avgBalPre ?? null,
      avgContribPre: filed.avgContribPre ?? null,
      assetsB: filed.assetsEOY ? filed.assetsEOY / 1e9 : null,
      assetsYoY: yoy == null ? null : +yoy.toFixed(1),
      ein: filed.ein,
      isSF: !!filed.isSF,
      shr: filed.shr || "", // Schedule R line 21b: D design-based safe harbor, A ADP-tested, N n/a
      pyb: filed.pyb || "",
      filed: fmtFiledDate(filed.filedDate),
      feeKey: filed.ack || null, // fee-schedule shard lookup (never nulled)
      flows: {
        benefitsM: filed.benefitsPaid ? filed.benefitsPaid / 1e6 : null,
        feeProfM: filed.feeProf ? filed.feeProf / 1e6 : null,
        feeAdminM: filed.feeAdmin ? filed.feeAdmin / 1e6 : null,
        feeInvM: filed.feeInvMgmt ? filed.feeInvMgmt / 1e6 : null,
        feeOtherM: filed.feeOther ? filed.feeOther / 1e6 : null,
        feeSalM: filed.feeSal ? filed.feeSal / 1e6 : null,
        adminRaw: filed.adminExpenses || null,
        deferralsM: filed.contribParticipant != null ? filed.contribParticipant / 1e6 : null,
        employerM: filed.contribEmployer != null ? filed.contribEmployer / 1e6 : null,
        rolloversM: filed.rollovers != null ? filed.rollovers / 1e6 : null,
        adminM: filed.adminExpenses != null ? filed.adminExpenses / 1e6 : null,
        priorAssetsM: filed.assetsBOY != null ? filed.assetsBOY / 1e6 : null,
      },
      match: c.match || null,
      vesting: c.vesting || null,
      contributions: c.contributions || null,
      pretax: c.pretax ?? null, roth: c.roth ?? null,
      afterTax: c.afterTax ?? null, megaBackdoor: c.megaBackdoor ?? null,
      brokerage: c.brokerage || null,
      autoEnroll: c.autoEnroll || null, autoEscalate: c.autoEscalate || null,
      highlights: c.highlights || [],
      funds: c.funds || null,
      fundsSource: c.fundsSource || null,
      notes: c.notes || "",
      dataStatus: "filed",
      source: filed.source,
    });
  }

  async function loadPlans() {
    const rc = $("resultCount");
    if (rc) rc.textContent = "Loading 110,000+ plans (about 3 MB)…";
    let filedList = [];
    // Columnar list file: just enough for the table, search, and filters.
    // Full filing detail (financial lines, codes, dates, acks) arrives
    // per-plan on expand from data/plans shards — the site never downloads
    // the pipeline's 33 MB universe file.
    try {
      const res = await fetch("plans-list.json", { cache: "no-cache" });
      if (res.ok) {
        const j = await res.json();
        const c = j.cols;
        for (let i = 0; i < j.count; i++) {
          const cf = c.cf[i] || 0;
          filedList.push({
            row: i,
            einRaw: c.ein[i],
            ein: c.ein[i] ? String(c.ein[i]).slice(0, 2) + "-" + String(c.ein[i]).slice(2) : "",
            pn: String(c.pn[i]).padStart(3, "0"),
            sponsorName: c.name[i], company: c.name[i],
            planName: c.plan[i] || "", // only multi-plan sponsors ship a name at boot
            state: c.st[i], businessCode: c.bc[i],
            participants: c.parts[i],
            assetsEOY: c.am[i] ? c.am[i] * 1e5 : 0, // display precision; exact on expand
            avgBalPre: c.ab[i] ? c.ab[i] * 100 : null,
            avgContribPre: c.ac[i] ? c.ac[i] * 100 : null,
            recordkeeper: c.rk[i], ticker: c.tk[i] || "",
            // former names from Form 5500 line 4 / older filings (prep 2026-09-16);
            // absent from list files built before then, so guard the column
            alias: (c.al && c.al[i]) || "",
            cf, isSF: !!(cf & 8), sf: cf & 8 ? 1 : 0,
            shr: c.shr[i] || "",
            pensionCode: cf & 32 ? "2L" : "2J", // refined from full 8a codes on expand
            source: "Form 5500 (DOL EFAST2 public dataset)",
          });
        }
      }
    } catch { /* fall through */ }

    // Row-aligned lineup/feature bits (positional — acks live in the detail
    // shards); shape mirrors what merge-4i writes alongside the list file.
    let bootBits = null, lineupIndex = null;
    try {
      const res = await fetch("plans-index.json", { cache: "no-cache" });
      if (res.ok) {
        lineupIndex = await res.json();
        bootBits = lineupIndex.bits || null;
      }
    } catch { /* none yet */ }
    // master-trust registry: names and totals for labeling trust-sourced lineups
    state.trusts = {};
    try {
      const res = await fetch("mtias.json", { cache: "no-cache" });
      if (res.ok) for (const t of (await res.json()).trusts) state.trusts[t.ack] = t;
    } catch { /* optional */ }
    state.shardCount = bootBits ? 64 : 0; // lineup/fee shard fanout is fixed
    // tell visitors how fresh the data is — the pipeline stamps every merge
    if (lineupIndex && lineupIndex.generated) {
      const el = $("dataAsOf");
      if (el) el.textContent = " Data refreshed " + new Date(lineupIndex.generated)
        .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) + ".";
    }

    const curatedByTicker = new Map(PLANS.map((p) => [p.ticker, p]));
    const merged = [];
    for (const f of filedList) {
      const plan = mergePlan(f.ticker ? curatedByTicker.get(f.ticker) : null, f);
      plan.id = (f.ein || "") + "|" + (f.pn || "") + "|" + (f.ticker || "");
      plan.einRaw = f.einRaw;
      plan.pn = f.pn;
      // cf bits (from the 8a codes at prep): 1=2R brokerage, 2=2S auto-enroll,
      // 4=2K match, 8=short-form, 16=no employer contributions, 32=403(b)
      const cf = f.cf || 0;
      plan.cf = cf;
      plan.matchCode = !!(cf & 4); // employer contributions based on deferrals
      if (plan.autoEnroll == null && (cf & 2)) plan.autoEnroll = "enrollment is automatic (Form 5500 code 2S)";
      if (plan.brokerage == null && (cf & 1)) plan.brokerage = "Self-directed brokerage";
      if (plan.pretax == null) plan.pretax = true; // 401(k)/403(b) elective deferrals are pre-tax
      // positional lineup/feature bits; the acks they refer to arrive with
      // the detail shard on expand (ensureDetail sets lineupKey/trustKey)
      const b = bootBits ? bootBits[f.row] || 0 : 0;
      plan.bits = b;
      if (b) {
        plan.hasLineup = !!(b & 1) || !!(b & 2048); // own confident 4i, or linked trust's
        // 4096: the schedule was found but reports investments in AGGREGATE
        // (dx=stmt) — say so instead of implying an unread schedule
        plan.filedAggregate = !!(b & 4096);
        // 65536: the plan's OWN rows say its assets are an interest in a
        // master trust we could not link. Outranks docShape, which would
        // otherwise blame the filing for a gap that belongs to the missing
        // trust return.
        plan.trustUnlinked = !!(b & 65536);
        // 131072: we DID identify the trust; its own return is the one with no
        // readable fund list. Without this the page would claim we failed to
        // match a trust we actually matched.
        plan.trustLinkedOpaque = !!(b & 131072);
        // bits 13-15: why the FILING yields no schedule (v113 `ds`). Set only
        // for plans with no lineup, so it always describes a gap the reader
        // is actually looking at. Enum order is frozen in merge-4i's DS_ENUM.
        plan.docShape = (b >> 13) & 7;
        if (plan.brokerage == null && (b & 2)) plan.brokerage = "Self-directed brokerage";
        if (plan.megaBackdoor == null && (b & 8)) plan.megaBackdoor = true;
        if (!plan.vesting && (b & 16)) plan.vesting = "Immediate";
        if (plan.afterTax == null && (b & 32)) plan.afterTax = true;
        if (plan.roth == null && (b & 64)) plan.roth = true;
      }
      // brokerage three-state: the plan's OWN confident 4i parsed with no
      // SDBA row AND no 2R code → the filing indicates no brokerage window.
      if (plan.brokerage == null && (b & 1) && !(b & 2) && !(cf & 1)) {
        plan.brokerage = "None";
        plan.brokerageInferred = true;
      }
      // match-type facet: Schedule R line 21b (structured, filed) beats the
      // audited-note bits; each is filed truth, shown with its source
      plan.matchTypes = [];
      if ((plan.shr || "").includes("D") || (b & 1024)) plan.matchTypes.push("safe-harbor");
      if (b & 128) plan.matchTypes.push("scheduled");
      if (b & 256) plan.matchTypes.push("discretionary");
      if ((b & 512) || (cf & 16)) plan.matchTypes.push("none");
      merged.push(plan);
    }
    state.plans = merged;
  }

  /* Fetch the shard holding this plan's parsed lineup, then re-render. */
  const shardCache = new Map();
  function shardOf(ack, n) {
    let h = 0;
    for (const c of ack) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % n;
  }
  async function fetchEntry(key) {
    const sid = String(shardOf(key, state.shardCount)).padStart(2, "0");
    if (!shardCache.has(sid)) {
      shardCache.set(sid, fetch(`data/lineups/${sid}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})));
    }
    const e = (await shardCache.get(sid))[key];
    return cleanCostMarkers(e);
  }
  /* "N/R" IS THE COST COLUMN, NOT PART OF THE FUND'S NAME.
   *
   * A 4i schedule's column (d) is Cost, and for participant-directed money it
   * is not required, so auditors print a marker there — most often "N/R", with
   * the legend "N/R - cost omitted for participant directed investments".
   * Where that marker sits between the name and the value the parser keeps it,
   * and the holding is stored — and displayed — as "500 Index Fund N/R".
   *
   * Measured 2026-08-24 over all 1,636,130 stored fund rows: 32,346 rows in
   * 1,286 lineups end in "N/R", holding $150.7B; 949 rows in 35 lineups end in
   * "$0.00" (the same defect with a zero cost printed instead of a marker).
   * Specimen: ACI Worldwide 20250923101453NAL0005573025001, every one of whose
   * 27 holdings carries the suffix.
   *
   * Stripping it at display is not cosmetic — the name is also the key for the
   * ticker index and the expense-ratio patterns, and neither can match a name
   * with a cost marker glued to it. Only these two exact markers are removed;
   * "NR" without the slash is left alone, because it can be a share class.
   * Idempotent and marked, since shard entries are cached and shared. */
  /* A SECURITIES ID IS NOT A HOLDING EITHER.
   *
   * Custodian statements print each security over two lines — name, shares,
   * cost and value on the first, "CUSIP: 00724F101" alone on the second. Where
   * the parser reads one of those identifier lines as a row, the whole class of
   * them reduces to the same residual name and dedup sums them into one
   * enormous holding called "CUSIP:".
   *
   * Measured 2026-08-24: 58 such rows in 31 lineups carrying $85,445,244,635.
   * By what a reader actually sees — the lineup each plan displays, own entry
   * or master trust — **30 plans covering 1,356,613 participants and $134.2B of
   * plan assets** show a table containing one, and in 25 of them it is more than
   * half the table:
   *
   *   Kroger 401(k) Retirement Savings Account Plan   160,358 participants
   *     one holding, named "CUSIP:", $8,696,053,053, 100% of the table
   *   Marriott Retirement Savings Plan                137,769 participants   99%
   *   Kohl's Savings Plan                              68,903 participants   54%
   *   Caterpillar 401(k) Savings Plan                  60,484 participants   61%
   *   HCA 401(k) Plan                                 377,504 participants   32%
   *
   * The Kroger figure is a fabrication, not a mis-labelled real total: it does
   * not appear anywhere in the trust's filing (checked over the full text
   * extraction of 20251013091841NAL0001583216001, whose 4i is a 206-page
   * Northern Trust security-detail statement with 1,165 "CUSIP:" lines).
   *
   * Dropped rather than renamed: there is no name to recover. What remains is
   * the statement's individual stock rows, which the coverage note will then
   * correctly describe as a fraction of the plan — an honest thin table instead
   * of a confident wrong one. The pattern matches ONLY a name made entirely of
   * identifier labels and codes, so a real security whose name happens to carry
   * a CUSIP keeps its row. */
  const ID_ONLY = /^(?:\s*(?:CUSIP|SEDOL|ISIN)\s*[:#]?\s*[A-Z0-9]{0,12}\s*)+$/i;
  /* THREE MORE THINGS THAT ARE NOT PART OF A FUND'S NAME (2026-09-18, sized
   * on the v135 store by the hourly draws, queue item (j)):
   *   1. the schedule's TYPE column glued to the end — "VANGUARD 500 INDEX ADM
   *      MUTUAL FUND SHARES", "… Pooled Separate Account": 1,237 plans /
   *      4,418,181 participants / 17,033 rows;
   *   2. a trailing comma, semicolon or colon from a wrapped cell — "Vanguard
   *      S&P 500 Index Trust,": 268 plans / 1,004,405 participants;
   *   3. a share count glued on either end — "132,545,334 Vanguard Mid Cap
   *      Index Fund" (CVS), "Vanguard Small-Cap Index Fund - 522,008 shares"
   *      (Comerica), "Galliard Stable Return Fund (3,684,067 shares)": 84
   *      plans / 191,052 participants / 797 rows.
   * Values are right; the name is noise, and — as with N/R — the name is the
   * key for the ticker index, so an end-anchored pattern can miss it. Each strip
   * is guarded so a real name is never emptied: a type phrase is removed only
   * when at least two words remain (a row that IS just "Mutual funds" stays,
   * and stays visible to the generic-name audit), and every strip falls back to
   * the original when it would leave fewer than three letters. Display and
   * lookup only; the store is unchanged, and the parser-side strip is queued.
   * Leading dashes from a wrapped bullet ("— Vanguard U.S. Growth Fund") go too. */
  /* WIDENED 2026-09-28 — the MECHANISM and the guard below were already right
   * and only the VOCABULARY was narrow, the third time that is the diagnosis.
   * `collective trust` allowed no trailing ` funds` (Waste Management's nine
   * `PIMCO RealPath Blend 2030 Collective Trust Funds` rows, 47,426 ppl), the
   * bare `separate account` was missing, and `common/collective` allowed a
   * SLASH but not a SPACE — so `Common Collective Trust Fund` was never matched
   * whole and only its tail was cut, leaving `… Common` dangling.
   *
   * `MASTER TRUST` IS DELIBERATELY ABSENT: it is a meaningful DESIGNATION, not
   * a column caption, so stripping it destroys meaning — `Investment in BNSF
   * 401(k) Plans Master Trust` ($3.52B) and `Korn Ferry Master Trust` are
   * pinned controls. Kept in sync with scripts/lib-disclose.mjs by the smoke
   * test, which fails on drift. */
  const TYPE_SUFFIX = /\s+(?:mutual funds?(?: shares?)?|common(?:[\/ ]|\s+and\s+)?collective trusts?(?: funds?)?|collective (?:investment )?trusts?(?: funds?)?|registered investment compan(?:y|ies)(?: shares?)?|(?:pooled )?separate accounts?|units? of participation)\s*$/i;
  /* A remainder may not END in a connective. CASE-SENSITIVE, lowercase only:
   * an `/i` first draft refused real strips because a trailing share-class `A`
   * (`Global A Pooled separate accounts`) and `IN` read as function words —
   * the v188 decoy lesson, that case is the only signal, arriving from the
   * side where the cost is a refused repair rather than a damaged name. */
  const DANGLING_TAIL = /\b(?:and|or|of|the|a|an|in|for|with|at|to|from|on|by|&)$/;
  /* The same column glued to the FRONT with a separator — "Mutual Fund -
   * Fidelity 500 Index Fund", "Separate Account - JPMorgan Equity Income
   * Fund R6" (Texas Health Resources, 13:1xZ draw 2026-09-18). Sized on the
   * v138 store: 733 plans / 1,464,661 ppl / 3,191 rows; the separator is
   * required so "Stable Value Fund" alone is never touched.
   *
   * WIDENED 2026-09-27, and the diagnosis is v188's one level up: the
   * VOCABULARY was right and the CONNECTIVE was the hole. Only `- – :` were
   * allowed, so the three forms the store actually uses all escaped —
   * "MUTUAL FUNDS SHARES / UNITS Fidelity 500 Index" (the column caption, no
   * separator at all), "Mutual Funds, at Fair Value Schwab S&P 500 Index" (a
   * measurement basis) and "Money Market SHARES Fidelity Government Money
   * Market Fund". Measured through this function on the v188 store: 169 rows /
   * 139 plans / 174,852 participants read better, 0 rows gain a ticker and
   * 0 LOSE one, so it is an honesty fix and not a fee-coverage one.
   *
   * `invested in` was in the first draft and is DELIBERATELY ABSENT: it wins
   * one row ("Pooled Separate Account invested in Amerfds 2030 Trgt Date")
   * and DAMAGES three, where the filed name really is "Index Fund invested in
   * stocks included in the S&P 500" and the vehicle word is part of it.
   * Printing every distinct before/after is what showed that; a count would
   * have shipped it.
   *
   * Named residue, measured not guessed: 1 row keeps a doubled caption
   * ("MUTUAL FUNDS, AT FAIR VALUE SHARES / UNITS Vanguard Target Ret 2030
   * Inst" → "SHARES / UNITS Vanguard …", because the remainder no longer
   * STARTS with a type word) and 5 keep a leading accounting parenthetical
   * ("(Net Asset Value Practical Expedient) MetLife Stabl"). Both are strictly
   * better than before and neither is widened for without its own measurement.
   * The `I` in the shares/units alternation is OCR's reading of the slash. */
  /* verbatim twin of lib-disclose's leadingHouse — see there for why the
   * test is anchored on BOTH sides and what it may not be used for.
   * Tethered by smoke-test.mjs, which fails on drift. */
  const LEADING_HOUSE = [
  ["american funds", /^(?:the\s+)?american funds\b/i],
  ["american century", /^american century\b/i],
  ["tiaa", /^tiaa[- ]?cref\b|^tiaa\b/i],
  ["nuveen", /^nuveen\b/i],
  ["vanguard", /^vanguard\b|^vangaurd\b/i],
  ["fidelity", /^fidelity\b|^fid\b/i],
  ["t rowe price", /^t\.?\s*rowe\s+price\b/i],
  ["blackrock", /^blackrock\b/i],
  ["pimco", /^pimco\b/i],
  ["mfs", /^mfs\b/i],
  ["jpmorgan", /^jp\s?morgan\b|^jpmorgan\b/i],
  ["invesco", /^invesco\b/i],
  ["janus", /^janus\b/i],
  ["franklin", /^franklin\b/i],
  ["dodge & cox", /^dodge\s*&?\s*cox\b/i],
  ["putnam", /^putnam\b/i],
  ["allspring", /^allspring\b/i],
  ["pgim", /^pgim\b/i],
  ["schwab", /^(?:charles\s+)?schwab\b/i],
  ["state street", /^state street\b|^ssga\b/i],
  ["dimensional", /^dimensional\b|^dfa\b/i],
  ["columbia", /^columbia\b/i],
  ["hartford", /^(?:the\s+)?hartford\b/i],
  ["voya", /^voya\b/i],
  ["principal", /^principal\b/i],
  ["lord abbett", /^lord abbett\b/i],
  ["neuberger", /^neuberger\b/i],
  ["goldman", /^goldman\b/i],
  ["federated", /^federated\b/i],
  ["victory", /^victory\b/i],
  ["macquarie", /^macquarie\b/i],
  ["transamerica", /^transamerica\b/i],
  ["eaton vance", /^eaton vance\b/i],
  ["metwest", /^metropolitan west\b|^metwest\b/i],
  ["western asset", /^western asset\b/i],
  ];
  function leadingHouse(s) {
  const t = String(s || "").replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  for (const [k, re] of LEADING_HOUSE) if (re.test(t)) return k;
  return null;
  }
  /* verbatim twins of lib-disclose's doubled-class constants — see there. */
  /* TWIN of scripts/lib-disclose.mjs — SLICED VERBATIM, never hand-edited.
 * The canonical copy carries the measurement; smoke-test compares the two. */
/* A TRUSTEE'S CORPORATE STYLE, at either end of a welded name. See the arm in
 * cleanFiledName for the measurement and for why the remainder must keep its
 * house. Built from string fragments, so it is exercised on fixtures before it
 * is believed: a regex assembled from concatenated strings has no syntax check
 * until it runs.
 *
 * A HOUSE TOKEN IS REQUIRED IN FRONT OF THE DESIGNATOR. Without one the
 * designator alone matches the tail of real fund names — `… Collective
 * Investment Trust`, `… Group Trust` — and a bare `Trust` is a vehicle word
 * every CIT carries. The firm's name is what makes it a corporate style.
 *
 * The charter abbreviations (`FSB`, `N.A.`, `NA`, `FA`) are consumed as part of
 * the entity, because an earlier gate that stopped at the designator left `FSB`
 * standing in front of the fund. */
const ENTITY_STYLE_SRC = "(?:"
  + "(?:fiduciary|management|investment|institutional|national|savings|personal)?\\s*"
  + "(?:bank(?:ing)?(?:\\s*(?:&|and)\\s*trust)?|trust)\\s+(?:compan(?:y|ies)|co\\.?|n\\.?a\\.?)"
  + "|trust\\s+compan(?:y|ies)"
  + "|(?:investment\\s+)?(?:advisors?|advisers?|management|mgmt)\\s*,?\\s*(?:l\\.?l\\.?c\\.?|inc\\.?|llp|lp|ltd\\.?|plc)"
  + "|(?:insurance|annuity)\\s+(?:and\\s+annuity\\s+)?compan(?:y|ies)"
  + "|life\\s+insurance\\s+compan(?:y|ies)"
  + ")";
const ENTITY_TRAIL = "(?:\\s*,?\\s*(?:f\\.?s\\.?b\\.?|n\\.?a\\.?|f\\.?a\\.?))?";
/* THE STYLE ALONE, found anywhere; the SPAN is then grown leftward to a start
 * where `leadingHouse` answers. That is deliberate and replaces a single
 * assembled pattern whose firm clause was a 1-to-5-token wildcard: with the `i`
 * flag its `[A-Z]` matched lowercase too, so on `Fidelity 500 Index Fund
 * Fidelity Management Trust Company` the leftmost match ate `Index Fund` and
 * published `Fidelity 500`. A pin caught it.
 *
 * SO THE CONDITION IS SYMMETRIC: the entity span must LEAD with a house and
 * the remainder must LEAD with a house. The same shipped, anchored predicate
 * answers both, and requiring the firm's own name is what distinguishes a
 * trustee's corporate style from a CIT's vehicle words (`… Collective
 * Investment Trust`, `… Group Trust`). */
const ENTITY_STYLE_AT = new RegExp("\\b" + ENTITY_STYLE_SRC + ENTITY_TRAIL + "(?=\\s|$|[,;:.])", "gi");
const WORD_START = /(?:^|\s)\S/g;
/* LEADING WITH A HOUSE IS NOT THE SAME AS NAMING A FUND, and the whole-store
 * diff is what found the difference. Blue Cross Blue Shield (8,058 ppl) files
 * `Geode Capital Management Trust Company Fidelity Investments`, and stripping
 * the trustee leaves `Fidelity Investments` — a bare firm, which passes
 * `leadingHouse`, carries no fund, and dropped the row's 0.05. Linklaters' two
 * rows leave `Charles Schwab Investment` the same way. No shipped predicate
 * separates these: `hasNoFundIdentity` answers false on all of them, because
 * its filler vocabulary was built for rows with no house at all.
 *
 * So: beyond its own house the remainder must keep at least one word that is
 * not firm boilerplate. `VANGUARD FEDERAL` keeps `FEDERAL`, a product word, and
 * is a real fund (=VMFXX); `Fidelity Investments` keeps only `Investments`.
 * The vocabulary is deliberately tiny and closed — a wider one would start
 * refusing product words — and its live population is 3 rows / 8,390 ppl, all
 * of them real fee losses this arm would otherwise cause. */
/* `fiduciary` IS BOILERPLATE AND ONLY THE PAGE SAID SO. Every other gate
 * passed — 16 pins, five measured guards, a whole-store diff reading 0 tickers
 * lost and 0 swapped, the twin agreeing on all 1.73M rows, smoke-test green —
 * and regenerating the crawlable pages showed one row publishing `Vanguard
 * Fiduciary` on $70,452,841 where the filing says `Vanguard Fiduciary Vanguard
 * Retirement Savings Trust Company`. That row is ITSELF a welded name, so the
 * arm removed the trailing entity and left the leading fragment of one.
 * `Fiduciary` is a word no fund is named after. A diff cannot tell a wanted
 * change from an unwanted one; only reading the output can. */
const FIRM_GENERIC = /^(?:investments?|advisors?|advisers?|management|mgmt|fiduciary|capital|group|company|co|companies|trust|trustee|asset|assets|financial|services|service|institutional|inc|llc|na|fsb|the|of|and|&)$/i;
function beyondHouse(rest) {
  const t = String(rest || "").replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
  for (const [, re] of LEADING_HOUSE) {
    const m = re.exec(t);
    if (!m) continue;
    return t.slice(m[0].length).split(/[\s,;:.()\-–—/]+/).filter(Boolean).some((w) => !FIRM_GENERIC.test(w));
  }
  return false;
}
/* A PUBLISHED NAME THAT CONTAINS ITSELF TWICE — 2026-10-04.
 *
 * Automatic Data Processing (46,258 participants) publishes `Northern Trust
 * S&P 500 Index Fund NORTHERN TRUST S&P 500 INDEX FUND` on $1,512,757,156,
 * 21.3% of its menu, and six more rows of the same shape; Illinois Auto Truck
 * publishes `Vanguard Target Retirement 2045 Vanguard Target Retirement 2045`.
 * The auditor's schedule carries the holding's name in two columns and the
 * parser reads the row as one string.
 *
 * THIS IS MORE THAN LEGIBILITY, which is why it is a repair and not a shrug:
 * the resolvers read the NAME, so which half they reach decides the published
 * share class. Redlands Christian's `T. Rowe Price Retirement 2030 Fund T. Rowe
 * Price Retirement 2030 Fund-I Class` publishes TRFHX, the I class, out of the
 * second copy, while Giorgio Armani's identically-shaped 2045 row publishes
 * ~TRRKX — a COMPARABLE of the investor class — out of the first. One filed
 * shape, two answers, one of them an approximation where the filing states the
 * class exactly.
 *
 * THE CONDITION IS SELF-EVIDENCE AND NOTHING ELSE: the name must OPEN on a
 * phrase whose normalised form is a prefix of everything after it. No
 * vocabulary, no resolver, no registry. Three protections, each with a case
 * where it is the only one:
 *   - at least THREE words and TEN normalised characters, so `Class A Class A
 *     Shares` and a repeated single word are refused;
 *   - the repeat runs FORWARD from the start of the remainder, so two members
 *     of one series cannot match — the vintage or class characters fall inside
 *     the compared span (`…2045` vs `…2050`), which is what keeps `Mfo Depot
 *     Lifepath 2030 Mfo Depot Lifepath 2045` intact;
 *   - the longest candidate is tried first, so the split lands between the two
 *     copies rather than inside one.
 * A PREFIX TEST IS THE SHAPE THIS RECORD WAS BURNED BY ONCE (it read 7,315
 * artifacts as the same-menu orientation witness). What is different here is
 * that both halves are inside ONE name: the evidence is not drawn from a
 * sibling row that the same damage could have produced.
 *
 * WHICH COPY SURVIVES IS DECIDED BY EVIDENCE, NOT BY POSITION. When the
 * boundary falls INSIDE a token the second copy carries more characters than
 * the first, so it is the more specific spelling and it wins — that is the
 * T. Rowe `Fund-I Class` case, and taking the first copy there would publish
 * the investor class's comparable in place of the stated class. When the
 * boundary is clean and exactly one copy is ALL CAPS, the mixed-case copy wins,
 * because the schedule's second column is upper-cased boilerplate — that is
 * ADP, where keeping the second copy would shout `NORTHERN TRUST S&P 500 INDEX
 * FUND` at 46,258 readers. Otherwise the second copy plus whatever trails it
 * wins, which is where a share class sits when one is present.
 *
 * ACCEPTED RESIDUE, named rather than rounded away: an INTERLEAVED duplication
 * (`State Street Global All Cap State Street Global All Cap Equity Equity`,
 * Lubrizol) collapses its leading phrase and leaves `Equity Equity`, because
 * the trailing repeat is below the three-word floor. Lowering the floor to
 * reach it is a separate measurement, not a free widening.
 *
 * MEASURED whole-store before shipping, through the page's own renderer: 224
 * rows / 129 plans / 232,595 participants / $5,036,058,631, with ticker,
 * asterisk and fee moving on ZERO rows and the shown type on one. */
const REPEAT_NORM = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "");
const ALL_CAPS = (t) => /[A-Z]/.test(t) && t === t.toUpperCase();
function collapseSelfRepeat(name) {
  const s = String(name == null ? "" : name).trim();
  const w = s.split(/\s+/).filter(Boolean);
  for (let k = Math.floor(w.length / 2); k >= 3; k--) {
    const first = w.slice(0, k).join(" ");
    const a = REPEAT_NORM(first);
    if (a.length < 10) continue;
    const rest = w.slice(k);
    if (!REPEAT_NORM(rest.join(" ")).startsWith(a)) continue;
    let acc = 0, j = 0;
    for (; j < rest.length; j++) {
      const n = REPEAT_NORM(rest[j]);
      if (acc + n.length > a.length) break;
      acc += n.length;
      if (acc === a.length) { j++; break; }
    }
    if (acc !== a.length) return rest.join(" ");
    const second = rest.slice(0, j).join(" ");
    const trail = rest.slice(j).join(" ");
    const keep = ALL_CAPS(second) && !ALL_CAPS(first) ? first : second;
    return (keep + (trail ? " " + trail : "")).trim();
  }
  return null;
}

const DOUBLED_CLASS_HEAD = /^(?:(?:class(?:es)?|cl)\b[\s.\-]*([a-z]{1,2}\d?|\d{1,2}|r-?[1-9])|(r-?[1-9]))\b[\s.,()\-]+(?=[A-Za-z])/i;
  const DOUBLED_CLASS_TAIL = /(?:\b(?:class(?:es)?|cl)\b[\s.\-]*([a-z]{1,2}\d?|\d{1,2}|r-?[1-9])|\b(r-?[1-9]))\s*$/i;
  /* A PAGE BREAK'S CAPTION IN THE LEADING POSITION, and the page-carry
   * subtotal line that travels with it. The vocabulary is counted rather than
   * imagined, `Cont.` is deliberately absent because it collides with
   * CONTRACT, and the page reference is stripped in a SECOND step so an
   * optional trailing group cannot backtrack into a second anchor position —
   * all of it, with the measurements, in scripts/lib-disclose.mjs. */
  const PAGE_BREAK_LEAD = /^\(?\s*(?:continu(?:ed|ation|ing)|cont['’]d)\b/i;
  const PAGE_BREAK_SEP = /^\s*\)?\s*(?:[-–—:,;.]\s*)?/;
  const PAGE_BREAK_REF = /^(?:from|on)\s+(?:the\s+)?(?:previous|preceding|prior|last|next)?\s*pages?(?:\s+\d{1,3})?\s*\)?\s*(?:[-–—:,;.]\s*)?/i;
  const CARRIED_FORWARD = /^(?:\S+\s+){0,2}(?:brought|carried)\s+forwards?(?:\s+(?:from|to)\s+(?:the\s+)?(?:previous|preceding|prior|next)?\s*pages?(?:\s+\d{1,3})?)?$/i;
  const classCode = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const TYPE_PREFIX = /^(?:mutual funds?|common[\/ ]?collective (?:trust )?funds?|collective (?:investment )?trusts?(?: funds?)?|common[\/ ]?collective trusts?|pooled separate accounts?|separate accounts?|registered investment compan(?:y|ies)|stable value(?: funds?)?|money market(?: funds?)?|guaranteed (?:investment|interest) contracts?|target date funds?|index funds?)(?:\s*[-–:]\s+|[,;]?\s*(?:at\s+)?fair value[,;]?\s+|\s*(?:shares?|units?)(?:\s*[\/&I]\s*(?:shares?|units?))*\s*[-–:,]?\s+)(?=\S)/i;
  const KERN_WORDS = new Set(("vanguard fidelity blackrock schwab invesco pimco putnam principal prudential nuveen tiaa cref dodge cox american funds franklin templeton mfs jpmorgan jp morgan jpmcb wellington wells fargo allspring columbia janus henderson federated hermes goldman sachs galliard artisan harbor oakmark loomis sayles neuberger berman dimensional dfa ishares spdr state street ssga northern trust voya empower lincoln transamerica john hancock massmutual nationwide metlife great west securian tiaa-cref " +
    "target retirement trust trusts fund funds index institutional instl inst admiral adm investor inv shares share class cl plus select premium growth value blend core total stock market mkt intl international global emerging markets developed world equity equities bond bonds fixed income high yield short term intermediate long treasury government govt inflation protected securities tips real estate reit mid cap small large extended balanced moderate conservative aggressive money mutual common collective commingled pooled separate account accounts stable capital preservation guaranteed interest contract contracts insurance company general portfolio portfolios lifepath lifecycle freedom smartretirement retire strategic allocation dividend appreciation opportunities opportunity health sciences technology sector explorer windsor primecap wellesley star " +
    "interests option options unit units series contributions participant participants loans notes receivable " +
    "us u.s. ii iii iv r6 r5 r4 r3 r2 r1 k6 k a b c d e f g h i j l m n o p q r s t u v w x y z z6 z3 cit cits ret rtmt idx fd tr blnd").split(/\s+/));
  function despaceKerned(name) {
    const toks = name.trim().split(/\s+/);
    // the kerning signature is a word broken INSIDE: a lowercase-initial
    // fragment after the first token ("V an", "Targe t", "Fu nd"). Real names
    // start their words with capitals, apart from a few connectives.
    const STOP = /^(?:of|and|the|ex|at|in|for|to|on|by|de|du|la|le|von|van|di|del|der|et|a|an)$/;
    const fragList = toks.slice(1).filter((t) => /^[a-z]{1,7}$/.test(t) && !STOP.test(t));
    const frags = fragList.length;
    // a lowercase-initial token that is itself a whole word ("Fidelity mid cap
    // index") is a lowercase filing, not a kerned one; at least one fragment
    // must be a piece of nothing
    const broken = fragList.filter((t) => !KERN_WORDS.has(t)).length;
    const short = toks.filter((t) => /^[A-Za-z]{1,2}$/.test(t)).length;
    if (toks.length < 3 || broken < 1 || frags < 2 && short < 3) return name;
    const flat = name.replace(/\s+/g, "");
    const lower = flat.toLowerCase();
    const out = []; let i = 0; let shortSegs = 0;
    while (i < lower.length) {
      let best = 0;
      for (let len = Math.min(18, lower.length - i); len >= 1; len--) {
        const w = lower.slice(i, i + len);
        if (KERN_WORDS.has(w) || /^(?:19|20)\d\d$/.test(w) || (len >= 2 && /^\d+$/.test(w) && !/^\d/.test(lower[i + len] || ""))) { best = len; break; }
      }
      if (!best) return name;
      if (best <= 2 && !/^\d+$/.test(lower.slice(i, i + best))) shortSegs++;
      out.push(flat.slice(i, i + best)); i += best;
    }
    if (shortSegs > Math.max(2, out.length * 0.25)) return name;
    // two single letters in a row ("L L", "A L") is a share-class fragment
    // the word list could not read, never a repaired word
    for (let k = 1; k < out.length; k++) if (out[k].length === 1 && out[k - 1].length === 1 && !/\d/.test(out[k] + out[k - 1])) return name;
    return out.map((w) => /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
  }
  function cleanFiledName(name) {
    let s = String(name).trim();
    /* A CONTROL CHARACTER WHERE A SPACE BELONGS: a broken font shifts its run
     * by +29, so the space (0x20) arrives as 0x03 and the browser renders
     * nothing for it — the reader sees `VanguardTargetRet2065`. It is NOT a
     * decode: 100 of 114 such rows are ordinary legible names whose spaces
     * alone were shifted. Runs first, because every arm below reasons about
     * word boundaries. scripts/lib-disclose.mjs holds the measurement and the
     * whole-population check that no control character sits inside a word. */
    s = s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
    s = s.replace(/^[—–-]+\s*/, "");
    /* AN EMPTY PARENTHETICAL — a column that held nothing, captured as bare
     * parens and welded to the name: Parker Hannifin publishes `Parker Stock
     * Match Fund ( )` at 23.4% of its menu. 1,161 rows / 63 plans / 138,083
     * ppl / $8.9B. Legibility only — priced through fundTickerInfo and
     * fundER at 0 tickers and 0 fees gained, lost or changed.
     * scripts/lib-disclose.mjs holds the measurement and how three earlier
     * attempts at that price each reported on the query. */
    s = s.replace(/\s*\(\s*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
    // OCR noise glued to the END: stray quote / trademark glyphs ("Trust II
    // CIT ”", "R6 ™", "…Fund®" — 674 plans / 1.08M ppl / 4,454 rows on the
    // v138 store) and a footnote letter or fragment after a share-class or
    // vintage token ("CREF Stock R1 a", "Trust Il CIT ial" — 881 plans /
    // 839k ppl / 6,383 rows). 14:1xZ draw 2026-09-18 (Weis Markets, Mutual
    // Trading). The fragment strip needs the class token before it, so a
    // real name's last word is never taken.
    s = s.replace(/[\s\-–]*[”“"'’‘™®©]+\s*$/, "").trim();
    // the recordkeeper's PROVIDER-DIRECTORY fields welded onto the fund name:
    // an expense ratio or unit price, then a literal ADDRESS label and the
    // firm's street address. UnitedHealth Group (274,906 participants) is the
    // whole of it on the v184 store — 92 of its 95 rows read
    // "AMERICAN NEW PERSPECTIVE CLASS F1 0.37% USADDRESS 3500 WISEMAN BLVD SAN
    // ANTONIO TX 7825143". Anchored on the ADDRESS LABEL, never on the number:
    // a bare percentage in a holding name is usually a real COUPON ("REPUBLIC
    // OF COLOMBIA 7.75%", "GNMAII POOL MA5878 5.0%", 266 rows / 122 plans that
    // must not be touched), and a bare dollar figure is usually a real par
    // value ("EQUINIX INC COM PAR $0.001"). 2026-09-27.
    const am = s.match(/\s*(?:\$\s?\d[\d,]*(?:\.\d+)?|\d{1,3}(?:\.\d+)?\s*%)?\s*\b[A-Z]{0,3}ADDRESS\b[\s\S]*$/);
    if (am) { const rest = s.slice(0, am.index).trim(); if (rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest)) s = rest; }
    // a stray double-quote glyph the scan left in the name. Two arms, both
    // anchored so a REAL quoted share class survives — Vanguard's
    // "Institutional \"Plus\" Shares" (FMC Corporation) is the control, and it
    // is untouched because the last quote there is followed by a whole word.
    // (a) a LEADING quote: "“Vanguard Federal", "\"EQ/GAMCO Small Company
    // Value" — 56 rows. (b) a quote near the END followed only by OCR crumbs
    // that are not a word: "Fidelity 500 Index “«", "…2065 Trust IX ”",
    // "…Index Plus “x", "BNY Mellon Bond Market Index Shares ” i" — the
    // trailing strip above only reaches the ones with nothing after them.
    // single quotes added 2026-09-29 — see lib-disclose for why the balanced
    // test below stays on double quotes only (an interior apostrophe is
    // ordinary inside a real name).
    const qlead = s.replace(/^[”“"'’‘`´]+\s*/, "").trim();
    // …unless a CLOSING quote follows with more name after it — that is a
    // balanced quoted term the filer meant ("\"Brokerage\" Account"), the same
    // shape as the FMC control, and it is left exactly as filed.
    if (qlead !== s && !/["”].*\S/.test(qlead) &&
        qlead.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(qlead)) s = qlead;
    for (let pass = 0; pass < 2; pass++) {
      const qi = Math.max(s.lastIndexOf("“"), s.lastIndexOf("”"), s.lastIndexOf('"'));
      if (qi <= 0) break;
      const tail = s.slice(qi + 1);
      // crumbs only: at most three characters, and NO CAPITAL — an uppercase
      // tail can be a real share class ("Hotchkis Wiley High yield \"Z") and
      // those rows are left exactly as filed rather than guessed at.
      if (tail.length > 3 || /[A-Z]/.test(tail) || /[a-z]{4}/.test(tail)) break;
      const rest = s.slice(0, qi).replace(/[\s\-–]+$/, "").trim();
      if (!(rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest))) break;
      s = rest;
    }
    s = s.replace(/\b(R\d|[A-Z]|I{1,3}|CIT|Adm|Inv|Instl?|Fund|Trust|Class)\s+[a-z]{1,3}$/, "$1");
    // a trailing footnote marker "(1)" (FMR's whole 119-row menu, 560 plans /
    // 1.95M ppl / 7,503 rows) and a trailing column bar, which is OCR's
    // reading of a share-class "I" ("PGI CIT US REIT Tier |", "TRP BLUE CIP
    // GRTH |" — 743 plans / 683k ppl / 1,723 rows), repaired to the letter
    // rather than deleted so the class survives. 15:1xZ draw 2026-09-18.
    /* GREEDY as of 2026-10-03 — a filing can carry TWO markers and stripping
     * one leaves the other reading as a SHARE CLASS. Reasoning, the whole-store
     * population and the two live cases are in scripts/lib-disclose.mjs, which
     * is canonical; the smoke test compares this twin against it. */
    s = s.replace(/(?:\s*\(\s*\d{1,2}\s*\))+\s*$/, "").trim();
    // a trailing footnote marker spelled with a PLUS — `Vanguard Extended
    // Market Idx | +e`, `Vngrd Wlsly Inc Adml +`, `LgCap S&P 500 Index Sep
    // Acct+`. 861 rows / 289 lineups / 195,234 ppl, +0 tickers gained and −0
    // lost, so it is an honesty fix and not a coverage one. The SPACE arm is
    // unconditional; the NO-SPACE arm fires only after a vehicle noun, because
    // `VANGUARD EXT MKT INDX-INST+` is Institutional PLUS and `iShares TR 20+`
    // is the 20+ Year Treasury ETF — see lib-disclose.mjs for the measurement.
    // Both run BEFORE the column-bar repair: order is load-bearing, or
    // `… Idx | +e` ends at `… Idx |` instead of recovering its class.
    s = s.replace(/\s+\+{1,3}\s*[a-z]?\s*$/i, "").trim();
    s = s.replace(/((?:sep(?:arate)?\s*acc?t|separate\s+accounts?|\bSA|funds?|trusts?|accounts?|portfolios?))\+{1,3}\s*$/i, "$1").trim();
    // THE COLUMN RULE, WITNESSED BY THE TYPE LABEL BEHIND IT. The arm below
    // reads a TRAILING bar as the letter I; it cannot reach a bar with the
    // type column's own label behind it, so 126 rows / 47,289 ppl publish the
    // bar (`T.Rowe Blue Chip Growth | Fund`). A type label behind the bar
    // witnesses it as the table's column rule, so it becomes a SPACE and
    // TYPE_SUFFIX below judges the tail. JOIN not truncate: 87 of the 126
    // tails are the fund's own last word `Fund`. Name-only — 0 tickers and 0
    // fees move. A designation-ending head keeps the letter reading, as the
    // arm below already does on the 293 rows of that shape it can reach.
    // EXACTLY ONE BAR: a column rule is one vertical line, and a DOUBLED bar is
    // the Roman numeral II -- `… Vanguard Windsor || Fund` is Windsor II
    // (VWNFX), a DIFFERENT FUND from Windsor (VWNDX), and the greedy version
    // published the wrong one. Witnessed by our own store, which also holds
    // `… Co. | Vanguard Windsor II` with ONE bar as the real column rule.
    // Canonical, with the full case: scripts/lib-disclose.mjs.
    {
      const cr = s.match(new RegExp("^([\\s\\S]*[A-Za-z0-9)])\\s*\\|\\s*((?:"
        + "(?:pooled\\s+)?(?:common[\\s/]*)?(?:collective\\s+)?(?:investment\\s+)?"
        + "(?:trusts?|funds?|accounts?|compan(?:y|ies))"
        + "|mutual\\s+funds?(?:\\s+shares?)?|(?:pooled\\s+)?separate\\s+accounts?"
        + "|common[\\s/]*collective\\s+trusts?|collective\\s+(?:investment\\s+)?trusts?"
        + "|registered\\s+investment\\s+compan(?:y|ies)|variable\\s+annuity\\s+contracts?"
        + "|money\\s+market\\s+funds?|stable\\s+value\\s+funds?|insurance\\s+general\\s+accounts?"
        + "|guaranteed\\s+investment\\s+contracts?|common\\s*/"
        + ")(?:[\\s\\-–]*[A-Za-z0-9™“”]{1,3})?)\\s*$", "i"));
      if (cr) {
        const head = cr[1].trim();
        s = (/\b(?:class|cl|cls|series)$/i.test(head) ? head + " I " : head + " ") + cr[2].trim();
      }
    }
    s = s.replace(/\s+\|+\s*$/, " I");
    // the 4i column caption's wrapped tail glued to the FRONT of a page's
    // first holding ("maturity date American Funds EuroPacific R6", "Par or
    // Maturity Value Vanguard Total Stock Mkt Idx Adm", "of Investment Cost
    // Value EMPOWER …") — 478 plans / 409,634 ppl / 480 rows on the v138
    // store, 440 of them "maturity date". 18:1xZ draw 2026-09-18 (Nebraska
    // Medicine). The parser drops the caption line from v139; this covers
    // the store until that re-parse lands.
    const hm = s.match(/^(?:\(?[a-e]\)\s*)?(?:(?:including\s+)?maturity date|par,?\s+or\s+maturity value|(?:description\s+)?of investment(?:\s+cost)?(?:\s+value)?|identity of issuer?,?|rate of interest|collateral,?\s+par)[\s,]*/i);
    if (hm) { const rest = s.slice(hm[0].length).trim(); if (rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest)) s = rest; }
    // a KERNED font that pdftotext split into fragments — "V an gu ard Targe t
    // Re tire m e nt 2045 Tru st II" (Nelnet, 11,248 ppl; 167 plans / 559k
    // ppl carry such a row, 20 lineups are mostly such rows). Rejoin the
    // fragments and re-segment against a fund-vocabulary word list; the
    // repair is used only when EVERY character segments into a known word
    // (numbers and roman numerals pass), so a name that merely has short
    // tokens ("AB US Lg Cp Grw CIT W Sr P1") is left exactly as filed.
    // 23:1xZ 2026-09-18, the display half of v141.
    s = despaceKerned(s);
    // the identity column's house glued in front of a description that
    // already names it — "JP Morgan JP Morgan Mid Cap Growth Fund", "Dodge &
    // Cox Dodge & Cox Global Bond Fund": the first 1-3 words repeated
    // verbatim. 239 plans / 486,173 ppl / 1,183 rows on the v139 store
    // (queue item f, the doubled-house half). 20:1xZ 2026-09-18. A trustee
    // before a DIFFERENT house ("Empower T. Rowe Price …") is left alone —
    // "BlackRock iShares …" is a real name.
    s = s.replace(/^((?:\S+\s+){0,2}\S+)\s+\1(?=\s+\S)/i, "$1");
    /* A SHARE CLASS STATED AT BOTH ENDS OF ONE NAME IS STATED ONCE,
     * 2026-09-30. 57 rows / 47 plans / 77,331 ppl. Canonical in
     * scripts/lib-disclose.mjs, which carries the full reasoning and the two
     * refused neighbours (the class-first STYLE, 331 rows, where the lead is
     * the only statement of the class; and two DIFFERENT classes, 80 rows,
     * where nothing in the string says which is wrong). Verbatim twin —
     * tethered by smoke-test.mjs, which fails on drift. */
    {
      const h = DOUBLED_CLASS_HEAD.exec(s);
      if (h) {
        const hc = classCode(h[1] || h[2]);
        const rest = s.slice(h[0].length).trim();
        const t = hc && rest.length >= 12 && rest.split(/\s+/).length >= 2
          ? DOUBLED_CLASS_TAIL.exec(rest) : null;
        if (t && hc === classCode(t[1] || t[2]) && !isGenericTypeName(rest)) s = rest;
      }
    }
    /* A TRUSTEE'S CORPORATE STYLE WELDED ONTO A FUND NAME, 2026-10-03.
   *
   * Target Corporation (495,482 participants) publishes `State Street Bank &
   * Trust Company SSGA S+P 500 INDEX SER A S+P 500 FLAGSHIP NON LENDING` at
   * 21.1% of its menu; Helen of Troy `Fidelity Management Trust Company FID
   * FDM IDX 2045 IPR`; JetBlue `VANGUARD FIDUCIARY TRUST COMPANY VANGUARD
   * FEDERAL`. The 4i identity column holds the TRUSTEE and the parser welds it
   * to the description column's fund name. 5,168 rows / 1,348 plans /
   * 3,744,810 ppl on the pv-199 store.
   *
   * THE SCREEN IS A CORPORATE ENTITY DESIGNATION, NOT A SECOND HOUSE. A
   * sub-advised fund legitimately names two firms (`Principal/BlackRock S&P
   * 500 Index Fund`, `Empower Columbia Dividend Value Fund`), so a two-house
   * screen reads 6,059 rows that are mostly CORRECT AS FILED. What no fund's
   * registered name carries is the trustee's corporate style — `Trust
   * Company`, `Fiduciary Trust Company`, `Bank & Trust Company`, `Advisors,
   * LLC`, `Investment Management Inc.`
   *
   * THE GATE IS THE FEE, AND IT IS WHY A PREVIOUS VERSION OF THIS ARM WAS
   * REVERTED RATHER THAN SHIPPED. `fundER` is a NAME-pattern table, so the
   * house token inside the trustee's name is part of what priced the row. The
   * reverted arm's ticker outcome was ideal — 308 rows gained a symbol, 0 lost,
   * 0 swapped — beside 23 rows / 41,582 ppl LOSING a fee and 42 / 18,480
   * SWAPPING one. Reading the losses named the mechanism exactly: every one
   * leaves a remainder with NO HOUSE IN IT. D.R. Horton (17,416 ppl) files
   * `JP Morgan Investment Management Large Cap Growth`, and `Large Cap Growth`
   * alone is a bare strategy label that prices to nothing.
   *
   * SO THE CONDITION IS THAT THE REMAINDER MUST STILL LEAD WITH A HOUSE.
   * `leadingHouse` is the shipped, anchored test for exactly that, and it is
   * the fee's own witness: keep the house and the fee that was matched on the
   * house survives the strip. It is NOT "the two houses must differ" — that
   * version would refuse JetBlue's `VANGUARD FIDUCIARY TRUST COMPANY VANGUARD
   * FEDERAL`, whose remainder keeps Vanguard and whose =VMFXX gain is real.
   * And the condition earns its place twice over, because a remainder with no
   * house is a WORSE published name than the verbose one it replaced: `Large
   * Cap Growth` tells a reader less than `JP Morgan … Large Cap Growth` does.
   *
   * ORIENTATION IS SETTLED FOR THIS FAMILY AND UNSETTLED FOR ITS NEIGHBOUR.
   * Here the entity side is stray by construction — a corporate style is never
   * part of a fund's name — and Helen of Troy's menu witnesses it directly, in
   * one plan, by publishing `FID FDM IDX 2035 IPR` bare beside `Fidelity
   * Management Trust Company FID FDM IDX 2045 IPR`. The mid-name-HOUSE class is
   * a different problem with three orientations and no such witness, and this
   * arm must not be widened toward it.
   *
   * `FSB`, `N.A.` AND THE OTHER CHARTER ABBREVIATIONS ARE PART OF THE ENTITY.
   * An earlier gate anchored on the first character after the designation, and
   * `Nationwide Trust Company, FSB Vanguard …` satisfied it while leaving
   * `FSB` behind — a residue of the same defect wearing the repair's clothes. */
  {
    /* FOUR CONDITIONS WERE REMOVED HERE BECAUSE THE STORE SAID THEY WERE
     * SUBSUMED, not because they looked redundant. `beyondHouse` runs
     * LEADING_HOUSE itself and returns false when no house matches, so it
     * implies `leadingHouse(rest)`; and a remainder that keeps a
     * non-boilerplate word beyond its house necessarily has two tokens and
     * three letters. Measured one at a time against all 1.73M rows, each of
     * `leadingHouse(rest)`, the two-token floor and the three-letter test
     * blocked ZERO rows that `beyondHouse` did not already block — and a
     * condition that can never be the only protection proves nothing, which is
     * the same trap as a fixture protected twice, met here at store scale.
     * `isGenericTypeName` is kept and labelled: its live population is also 0,
     * but it is the display's own composition at the two render call sites and
     * costs one call. */
    const ok = (rest) => rest && beyondHouse(rest) && !isGenericTypeName(rest);
    ENTITY_STYLE_AT.lastIndex = 0;
    let m;
    while ((m = ENTITY_STYLE_AT.exec(s))) {
      const styleEnd = m.index + m[0].length;
      const firmLen = (a, b) => s.slice(a, b).split(/\s+/).filter((t) => /[A-Za-z]{2}/.test(t)).length;
      /* THE FIRM'S BOUNDARY NEEDS A DIFFERENT WITNESS IN EACH POSITION, and
       * each position supplies one. Two earlier versions failed here and the
       * arm's own printed loop state is what settled it, not a theory:
       *
       *   LEAD — there is no boundary question at all. The firm is everything
       *     before the style, so the span starts at 0. `Nationwide Trust
       *     Company, FSB` works here and would fail any house test, because a
       *     BANK trustee is not a fund house, and bank trustees (Reliance,
       *     Matrix, Great Gray, Wells Fargo N.A.) are much of the class.
       *
       *   TAIL — the boundary is genuinely ambiguous and `leadingHouse` is the
       *     only thing that locates it. On `Fidelity 500 Index Fund Fidelity
       *     Management Trust Company` a nearest-token rule takes `Street`-style
       *     fragments and published `Fidelity 500`; the nearest start at which
       *     a HOUSE begins is the second `Fidelity`, which is right.
       *
       * A candidate start must also lie strictly before the style's own first
       * token — including it gave an EMPTY firm span and chose the boundary one
       * word into the firm (`State Street …` → span `Street Bank & Trust
       * Company`, remainder `State`). */
      let rest = null;
      if (m.index > 0 && firmLen(0, m.index) >= 1 && firmLen(0, m.index) <= 4) {
        rest = s.slice(styleEnd).replace(/^[\s,;:.\-–—]+/, "").trim();
        if (!ok(rest)) rest = null;
      }
      if (rest === null && styleEnd >= s.trimEnd().length) {
        const starts = [];
        WORD_START.lastIndex = 0;
        let w;
        while ((w = WORD_START.exec(s))) {
          const p = w.index === 0 ? 0 : w.index + 1;
          if (p >= m.index) break;
          starts.push(p);
        }
        const p = starts.reverse().find((q) => leadingHouse(s.slice(q, m.index)) && firmLen(q, m.index) <= 4);
        if (p !== undefined && p > 0) {
          const cand = s.slice(0, p).trim();
          if (ok(cand)) rest = cand;
        }
      }
      if (rest !== null) s = rest;
      break;
    }
  }
  const pm = s.match(TYPE_PREFIX);
    if (pm) { const rest = s.slice(pm[0].length).trim(); if (rest.split(/\s+/).length >= 2 && /[A-Za-z]{3}/.test(rest)) s = rest; }
    /* verbatim twin of lib-disclose's OCR'd N/A tail strip — see there for the
     * population, why `bwNoise` cannot reach a tail, and why one dropped token
     * must be an N/A. The smoke test caught this arm missing here on two cases
     * it already carried, which is the whole return on the tether. */
    {
      const toks = s.split(/\s+/);
      const isNA = (t) => /^n[il1y]a$/i.test(t.replace(/[^A-Za-z]/g, ""));
      const droppable = (t) => isNA(t) || /^[\d.,]{3,}$/.test(t)
        || /^[^A-Za-z]*[a-z]{0,3}[^A-Za-z]*$/.test(t);
      let k = toks.length, sawNA = false;
      while (k > 0 && droppable(toks[k - 1])) { if (isNA(toks[k - 1])) sawNA = true; k--; }
      const head = toks.slice(0, k);
      if (sawNA && head.filter((t) => /[A-Za-z]{3}/.test(t)).length >= 2) s = head.join(" ");
    }
    /* THE COMMA FAMILY, 2026-09-28. A comma after a COMPLETE vehicle type is a
     * caption separator, not part of a fund name: "Mutual Fund, Freedom Index
     * 2030", "Pooled Separate Account, TIAA Real Estate", "Money market fund,
     * Fidelity Govt Money Market Fund". 1,077 rows / 595 distinct names on the
     * v188 store. It needs its own arm rather than a comma in TYPE_PREFIX
     * because the remainder has to be SCREENED, and the screen is what the
     * members taught:
     *
     *   120 rows would be DAMAGED and are excluded — a measurement BASIS ("at
     *   contract value", "at fair value"), a bare CLASS or SERIES designation
     *   ("Stable Value Fund, Class M" -> "Class M"), and a UNIT PRICE with no
     *   letters at all ("Mutual Funds, @ $688.090000").
     *
     * `the` was in the first draft of that screen and came OUT, because it
     * flagged three real funds — "Mutual Fund, The Growth Fund of America",
     * "The Investment Company of America", "The Bond Fund of America". A leading
     * "The" is ordinary in a fund name. Printing the suspects is what showed it;
     * the screen was written to catch damage and its first version caused some. */
    const cm = s.match(/^(?:common\/?collective trusts?(?: funds?)?|collective investment trusts?(?: funds?)?|registered investment compan(?:y|ies)|pooled separate accounts?|separate accounts?|mutual funds?|money market funds?|stable value funds?|guaranteed (?:investment|interest) contracts?|index funds?|target date funds?)\s*,\s+(?=\S)/i);
    if (cm) {
      const rest = s.slice(cm[0].length).trim();
      const notAName = /^(?:at|of|in|on|for|and|as|to|with|per|net|@)\b|^(?:fee\s+)?class\b|^series\b|^unit/i;
      if (/[A-Za-z]{3}/.test(rest) && !notAName.test(rest)) s = rest;
    }
    /* THE BARE-WHITESPACE FAMILY, 2026-09-28 — caption class B's largest arm.
     * A vehicle type followed by nothing but a space: "Registered Investment
     * Company Vanguard Inter-Term Bnd Index Fd Adm", "Common/Collective Trust
     * Prin LifeTime Hybr 2035 CIT Z". Refused twice before, and the refusals
     * were right both times: a blanket strip turns "Stable Value Fund Fee Class
     * R1" into "Fee Class R1", and an outcome gate (strip only where the
     * remainder resolves through fund-er.js) reached 19 rows because that table
     * cannot name a Principal separate account or a CIT BY DESIGN.
     *
     * The last handoff proposed a HOUSE LIST and named its own weakness. It is
     * not needed: printing every distinct remainder split the family at FOUR
     * TOKENS. Below that sit `Shares`, `Fee Class R1`, `and`, `Omitted`, `III`,
     * `at fair value`; at or above it sit `Fidelity Freedom Index 2030`,
     * `T. Rowe Price Overseas`, `PGIM Ttl Ret Bond R2 Fund`, `Am Fds
     * EuroPacific Grth R6 Fd` — the last two exactly the names a typed house
     * list missed. LENGTH is the discriminator; the data said so, not me.
     *
     * Length alone is not enough — "Stable Value Fund Class 25 - I" is four
     * tokens of pure designation — so the remainder must also OPEN with a token
     * that carries naming content. Each exclusion below was earned by reading a
     * suspect, and one of them is the v188 pinned DECOY: `Separate Account A,
     * at fair value` survives only because the comma is stripped before `A` is
     * judged a bare code. GICs leave the vocabulary entirely, because a GIC's
     * filed name really is the type plus a CONTRACT NUMBER (`GA 29013 DTD
     * 04/28/11`). The participles are what saved the OTHER pinned control:
     * `Index Fund invested in stocks included in the S&P 500` was being cut to
     * `invested in stocks…` until `invested` joined the furniture — a control
     * written last cycle caught this cycle's draft, which is what controls are
     * for. 2,369 rows / 237 plans / 305,540 ppl, +10 tickers, 0 lost. */
    /* ONE remainder screen, asked by both the bare-whitespace arm and the
     * parenthetical arm below. A second copy of a shipped predicate has
     * produced a wrong answer on this record at least four times, so the two
     * arms share this rather than each carrying their own. */
    const bwOpensWithAName = (t0) => {
      const furniture = /^(?:class(?:es)?|cl|fee|fees|series|ser|shares?|sh|units?|tier|lot|level|at|of|in|on|for|and|or|as|to|with|per|net|the|a|an|value|values|fair|contract|market|cost|book|nav|bps|no|not|required|omitted|available|na|none|total|subtotal|held|directed|participant|participants|self|various|other|misc|continued|cont|certified|uncertified|approx|approximate|number|amount|wrapper|cit|gac|invested|issued|managed|measured|measure|valued|using|that|investing|consisting|comprised|including|investments|funds?|trusts?|accounts?|compan(?:y|ies)|portfolios?)$/i;
      const code = /^(?:[ivxl]{1,4}|[a-z]|[a-z]?\d{1,6}[a-z]?|[a-z]{1,2}\d{1,4}|\d+bps)$/i;
      return !!t0 && !furniture.test(t0) && !code.test(t0);
    };
    const bwTYPE = /^(?:common\/?collective trusts?(?: funds?)?|collective investment trusts?(?: funds?)?|registered investment compan(?:y|ies)|pooled separate accounts?|separate accounts?|mutual funds?|money market funds?|stable value funds?|index funds?|target date funds?|investments)/i;
    const bm = s.match(new RegExp(bwTYPE.source + "\\s+(?=[A-Za-z0-9])", "i"));
    if (bm) {
      const rest = s.slice(bm[0].length).trim();
      const toks = rest.split(/\s+/);
      const t0 = toks[0].replace(/[^A-Za-z0-9&]/g, "");
      // twin of lib-disclose's bwNoise: a pure number is not a name at any
      // length (the t0 code arm caps at six digits, so a share COUNT passes),
      // and NIA/nla is OCR of the N/A column
      const bwNoise = /^[\d.,]+$/.test(toks[0])
        || toks.some((t) => /^n[il]a$/i.test(t.replace(/[^A-Za-z]/g, "")));
      if (toks.length >= 4 && !bwNoise && (bwOpensWithAName(t0) || /^[A-Za-z]\.$/.test(toks[0]))
          && !bwTYPE.test(rest) && /[A-Za-z]{3}/.test(rest)) s = rest;
    }
    /* THE LEADING-PARENTHETICAL FAMILY, 2026-09-28. All 125 distinct members
     * were READ, not sampled — 132 rows / 118 plans / 363,990 ppl — and the
     * split is structural rather than lexical: does anything survive the
     * parenthetical?
     *
     *   98 rows / 236,197 ppl have a real fund name after it, almost always
     *      behind a page break's `(continued)` — `Mutual funds (continued)
     *      Dodge & Cox International Stock Fund`.
     *   34 rows / 127,793 ppl ARE the parenthetical — `Stable Value Fund (i)`,
     *      `(at fair value)`, `(NAV)`, `(Class R1)`, `(75 BPS)`. Stripping any
     *      of those leaves a bare vehicle type, which is strictly WORSE than
     *      what is published today, so they are refused by construction: the
     *      remainder screen below requires a name to follow.
     *
     * The parenthetical must be NON-IDENTIFYING, and that is an allowlist
     * rather than a blocklist because three members of the strippable half
     * would be damaged by a blanket rule and each carries real information a
     * blocklist would have to anticipate: `(TIAA-CREF, not certified)` holds
     * the HOUSE, `(Stable Value Fund)` and `(Group Annuity Contract)` hold a
     * vehicle designation the remainder never repeats. An allowlist refuses all
     * three without naming them. */
    const pm2 = s.match(new RegExp(bwTYPE.source + "\\s*\\(([^)]*)\\)\\s*(?=[A-Za-z0-9])", "i"));
    if (pm2) {
      const inner = pm2[1].trim();
      const nonIdentifying = /^(?:continued|continucd|cont\.?|certified|participant[- ]?directed|nonparticipant[- ]?directed|(?:at\s+)?fair value|net asset value practical expedient|nav|held by .+)$/i;
      const rest = s.slice(pm2[0].length).trim();
      const toks = rest.split(/\s+/);
      const t0 = toks[0].replace(/[^A-Za-z0-9&]/g, "");
      if (nonIdentifying.test(inner) && toks.length >= 2 && bwOpensWithAName(t0)
          && /[A-Za-z]{3}/.test(rest)) s = rest;
    }
    /* A PAGE BREAK'S `(continued)` MARKER, AND WHATEVER CAPTION CARRIES IT.
     *
     * Found by the 09:0xZ participant-weighted draw: Trustees of the University
     * of Pennsylvania (45,173 participants) publishes a clean 31-row Vanguard
     * menu with two rows reading `Fidelity Management Trust Company (continued)
     * VANG SM CP IDX IS PL`. The auditor repeats the section caption at the top
     * of the next page and the first holding under it absorbs the whole line.
     *
     * v173 closed this class in the ISSUER column and this record calls it
     * closed. It is closed THERE. The same words in the NAME column were never
     * touched by that fix: 100 rows / 83 plans / 476,960 participants.
     *
     * THE ARM ABOVE CANNOT REACH THEM because it requires the string to OPEN
     * with a vehicle type, and these captions open with a firm (`Fidelity
     * Management Trust Company`), a heading (`Exchange Traded Funds:`), a model
     * portfolio (`Renasant Moderate Growth Model -`) or nothing at all. What
     * makes a wider cut safe here is the marker itself: no fund is named
     * "(continued)", so everything before it is caption by construction — which
     * is exactly what caption class B's bare captions cannot claim.
     *
     * OUTCOME TEST: +1 ticker, 0 LOST. So this is an HONESTY fix for 476,960
     * readers, not a fee-coverage one, whatever the row count suggests.
     *
     * THE ARTICLE IS WHY THE REMAINDER SCREEN IS RELAXED HERE, and the two rows
     * that forced it are the same shape that damaged the comma family's first
     * draft: `John Hancock sub-accounts (continued) The Growth Fund of America`
     * and `Renasant Growth Model Fund - (Continued) The Hartford Dividend and
     * Growth Fund` were both REFUSED, because `the` is furniture in the shared
     * screen. It is furniture when a remainder has to prove it is a name; it is
     * not when `(continued)` has already proved it. So the article is skipped
     * for the screen and KEPT in the name. */
    const contM = s.match(/^.*?\((?:continued|continucd|cont\.?)\)\s*[-–—:,]?\s*(?=\S)/i);
    if (contM) {
      const rest = s.slice(contM[0].length).trim();
      const toks = rest.split(/\s+/);
      const probe = (/^(?:the|a|an)$/i.test(toks[0]) && toks.length >= 3 ? toks[1] : toks[0] || "")
        .replace(/[^A-Za-z0-9&]/g, "");
      if (toks.length >= 2 && /[A-Za-z]{3}/.test(rest) && bwOpensWithAName(probe)) s = rest;
    }
    // the leading-dash strip at the top of this function runs BEFORE the type
    // prefix above, so "Stable Value Fund- — John Hancock Life Insurance
    // Company" (Empower Electric) came out still wearing the dash. Re-run it
    // once the prefix is gone. Exactly 1 row on the v184 store — the other
    // 1,992 em-dash rows the census counts were already clean at display.
    const dl = s.replace(/^[—–-]+\s*/, "").trim();
    if (dl !== s && /[A-Za-z]{3}/.test(dl)) s = dl;
    /* ...AND THE SAME CAPTION WITH NO BRACKETS TO MARK IT, which the `contM`
     * arm further up cannot reach because it requires the marker to be
     * parenthesised. It sits AFTER the leading-dash re-run and that is
     * measured: placed beside `contM` it refused two rows whose caption
     * arrives behind a vehicle prefix, because TYPE_PREFIX leaves the dash
     * behind. 29 rows / 27 plans / 13,256 participants, all 29 distinct
     * transformations read.
     * The marker is what licenses a cut this wide — no fund is named
     * `Continued` — and the remainder screen is what keeps a holding named
     * `from page 10` off the page. A remainder that is a page-CARRY subtotal is
     * refused and TYPED instead (`isPageBreakCaptionRow` below), because
     * stripping `Continued` off `Continued Balance Brought Forward` would leave
     * the non-name standing as the name. Measurements, the one named cost and
     * the two loan rows this strip hands to a guard that was blind to them are
     * all in scripts/lib-disclose.mjs. */
    {
      const cl = PAGE_BREAK_LEAD.exec(s);
      if (cl) {
        const rest = s.slice(cl[0].length).replace(PAGE_BREAK_SEP, "")
          .replace(PAGE_BREAK_REF, "").trim();
        const toks = rest.split(/\s+/).filter(Boolean);
        const lead = /^(?:the|a|an)$/i.test(toks[0] || "") && toks.length >= 3 ? toks[1] : (toks[0] || "");
        const probe = lead.replace(/[^A-Za-z0-9&]/g, "");
        if (toks.length >= 2 && /[A-Za-z]{3}/.test(rest) && !CARRIED_FORWARD.test(rest)
            // `bwInitial` is inlined here as it is above, this twin having no
            // named helper for it; both reach 0 rows on this store.
            && (bwOpensWithAName(probe) || /^[A-Za-z]\.$/.test(lead))) s = rest;
      }
    }
    s = s.replace(/[,;:]+$/, "").trim();
    // a share COUNT is thousands or more (1,234 / 12345…); "Class R6 Shares"
    // is a share CLASS and must survive — the first draft of this cut it to
    // "Class R", measured as 26 lost tickers before it shipped
    s = s.replace(/(?:^|[\s,(-])[\s,(-]*(?:\d{1,3}(?:,\d{3})+|\d{4,})\s+shares?\)?\s*$/i, "").trim();
  /* AND THE SAME COUNT BEFORE `units`, WHICH THE LINE ABOVE WAS ONE NOUN SHORT
   * OF — 330 rows / 33 plans / 528,207 participants / $12,760,648,303.
   * JPMorgan Chase's own plan (300,272 ppl) publishes `JPMCINTERMEDT AGGREGATE
   * SEP ACCT — SEPARATE ACCT 2,271,585,254 UNITS` at 6.0% of its menu; Ford
   * Motor (140,681) does it on thirteen rows, every one a real fund wearing a
   * count (`BlackRock MSCI ACWI Ex-US IMI Index, 92,383,792 units`).
   *
   * IT IS A SEPARATE LINE WITH A HIGHER DIGIT FLOOR, AND THAT ASYMMETRY IS
   * MEASURED RATHER THAN cautious. The line above accepts a bare `\d{4,}`,
   * which at the TAIL is the VINTAGE exposure the LEADING-count arm below
   * already records ("a four-digit lead is a target-date VINTAGE and stays —
   * the first draft took 13,000 vintage-led rows"). Before `shares` that
   * exposure is live on **0 rows**, so the shipped line is clean and stays as
   * it is. Before `units` it is live on **NINE**, and all nine are the hazard:
   * HD Supply (14,491 ppl) files `Mfo Depot Lifepath 2030 Unit` and six more
   * vintages, $376,844,450, which a `\d{4,}` form would publish as `Mfo Depot
   * Lifepath` — the ladder collapsed to one name repeated seven times.
   *
   * So a unit count must be comma-grouped or seven digits. The cost of the
   * floor is 2 rows / 345 ppl / $694,054 of real bare counts left in place
   * (`Lifestyle Fund Aggressive Portfolio (3897 units)`, `Common Trust Fund;
   * 10381 units`) — 7 vintages against 2 counts, and $376.8M against $0.7M. */
  s = s.replace(/(?:^|[\s,(-])[\s,(-]*(?:\d{1,3}(?:,\d{3})+|\d{7,})\s+units?\)?\s*$/i, "").trim();
    // a leading count is comma-grouped or five-plus digits; a four-digit lead
    // is a target-date VINTAGE ("2045 Fund") and stays — the first draft took
    // 13,000 vintage-led rows with it, caught by the store-wide count
    const lead = s.replace(/^(?:\d{1,3}(?:,\d{3})+|\d{5,})\s+(?=[A-Za-z].*\s\S)/, "").trim();
    if (lead !== s && /[A-Za-z]{3}/.test(lead)) s = lead;
    const m = s.match(TYPE_SUFFIX);
    /* A DANGLING REMAINDER IS WORSE THAN THE NAME IT REPLACED. `Shares of
     * registered investment companies` was being cut to **"Shares of"** — a
     * holding named after a preposition. 70 rows / 63 plans / 94,634
     * participants / $2,160,606,167 displayed as such a fragment on the v188
     * store, and roughly half of those were this arm's doing rather than the
     * filing's (the rest were already fragments when parsed, which is a
     * separate item).
     *
     * The two-token floor did not catch it because "Shares of" IS two tokens.
     * What makes a remainder useless is not its length but that every token is
     * a function word, so the test is the shared `bwOpensWithAName` screen
     * asked of EVERY token: if not one identifying word survives, keep the
     * filed name.
     *
     * The first draft of this asked it of the LAST token and a spot-check
     * caught the regression before it shipped — `Vanguard Institutional Index
     * Fund Mutual Fund` stopped stripping, because `fund` is furniture and
     * almost every fund name ends in it. "Does anything identifying remain"
     * and "is the last word identifying" are different questions, and only the
     * first one is the one that matters here. Restoring `Shares of registered investment companies` is honest —
     * it is what the filing says — and it also returns those rows to
     * `audit-generic-names`, which reads the stored name and had been flagging
     * them for a reason the page no longer showed. */
    if (m) {
      const rest = s.slice(0, m.index).trim();
      const tk = rest.split(/\s+/);
      const keeps = tk.some((t) => bwOpensWithAName(t.replace(/[^A-Za-z0-9&]/g, "")));
      if (tk.length >= 2 && /[A-Za-z]{3}/.test(rest) && keeps && !DANGLING_TAIL.test(rest)) s = rest;
    }
    /* AN UNCLOSED PARENTHETICAL IS A TRUNCATION — the two conditions, the
     * OCR'd-letter family they refuse (`Vanguard Real (state Index Admiral`
     * is Real ESTATE), the outcome test that convicted the naive rule and the
     * five accepted share-class losses are all in scripts/lib-disclose.mjs.
     * This is its twin. */
    {
      const open = (s.match(/\(/g) || []).length, close = (s.match(/\)/g) || []).length;
      if (open > close) {
        const i = s.lastIndexOf("(");
        if (i > 0 && /\s/.test(s[i - 1]) && !/[()]/.test(s.slice(i + 1))) {
          const head = s.replace(/\s*\([^()]*$/, "").trim();
          if (head && head.length > s.length - i && head.split(/\s+/).length >= 3) s = head;
        }
      }
    }
    /* THE SELF-REPEAT COLLAPSE RUNS LAST and runs to a FIXED POINT. Last,
     * because every arm above it may change the string and a repeat is only
     * visible once both copies are in their final spelling; to a fixed point
     * because an interleaved duplication needs more than one pass, and this
     * record's own non-idempotence item is the standing warning that one pass is
     * a proxy for the question rather than the question. The bound is four
     * passes, which is three more than any live row needs. */
    for (let pass = 0; pass < 4; pass++) {
      const c = collapseSelfRepeat(s);
      if (c === null || c === s) break;
      s = c;
    }    s = s.replace(/[\s\-–,;:]+$/, "").trim();
    return /[A-Za-z]{3}/.test(s) ? s : String(name).trim();
  }
  /* GENERATED FROM scripts/lib-4i.mjs — DO NOT EDIT BY HAND.
   * lib-4i derives these patterns from GENERIC_TYPE_NAME by asserted
   * replacements, so they are DERIVED and transcribing one is the move this
   * record says produces wrong answers. The sources below are the COMPILED
   * regexes, written here by a script, and `smoke-test.mjs` compares this copy
   * against lib-4i's own export on every push — a change to the derivation
   * shows up as drift, not as silence.
   * Regenerate: node scripts/gen-generic-twin.mjs */
  const GENERIC_TYPE_ANY = new RegExp("^(?:total )?(?:registered investment compan(?:y|ies)|(?:common[\\/ ]?)?collective (?:investment )?trusts?(?: funds?| portfolios?)?|collective trust funds?|mutual funds?|common (?:and preferred )?stocks?|corporate stocks?|pooled separate accounts?|separate accounts?|guaranteed (?:investment|interest) contracts?|group annuity contracts?|commingled (?:trust |investment )?funds?|pooled separate account funds?|(?:plan )?(?:interest in )?master trusts?(?: funds?)?|trusts?|statements?|preferred stocks?|investments?|assets|(?:beginning |ending )?(?:fair|contract|market|net asset|book) values?)$", "i");
  const GENERIC_TYPE_DESPACED = new RegExp("^(?:total)?(?:registeredinvestmentcompan(?:y|ies)|(?:common[\\/]?)?collective(?:investment)?trusts?(?:funds?|portfolios?)?|collectivetrustfunds?|mutualfunds?|common(?:andpreferred)?stocks?|corporatestocks?|pooledseparateaccounts?|separateaccounts?|guaranteed(?:investment|interest)contracts?|groupannuitycontracts?|commingled(?:trust|investment)?funds?|pooledseparateaccountfunds?|(?:plan)?(?:interestin)?mastertrusts?(?:funds?)?|trusts?|statements?|preferredstocks?|investments?|assets|(?:beginning|ending)?(?:fair|contract|market|netasset|book)values?)$", "i");
  const GENERIC_DECO = [
    [/^(?:sub[- ]?total|total)\s*[:.]?\s+/i, ""],
    [/^description\s*:\s*/i, ""],
    [/^shares\s+(?:of|in)\s+/i, ""],
    /* v197 ARM B — ONE LEADING WORD DEFEATED THE ANCHOR, and the word is the
     * filing's own `Plan`. `isGenericTypeName("Master Trust")` is TRUE (v190
     * shipped exactly that name, for exactly this reason) and
     * `isGenericTypeName("Plans Master Trust")` is FALSE, so General Motors'
     * two plans publish `Plans Master Trust` at 12.9% and 14.4% of their menus
     * — $1,264,065,000 and $3,424,814,000 — with a blank type cell, read by
     * 136,838 participants. A fix for one FORM of a name is not a fix for the
     * name.
     *
     * IT IS A DECORATION AND NOT A VOCABULARY ENTRY, and the measurement is
     * what decided that. A general "strip one leading word" rule reaches 3,296
     * published rows and is dominated by REAL FUNDS — `Target Retirement 2035
     * Trust` (Vanguard, 222 rows), `American Mutual Fund` (216), `INVESCO QQQ
     * TRUST` (123), `Washington Mutual Fund` (67), `iShares Gold Trust` (32),
     * plus the firms `Northern Trust`, `Wilmington Trust`, `First Bank &
     * Trust`. So the leading word has to come from a CLOSED set of words that
     * cannot identify anything, which is what this arm already is.
     *
     * WHOLE-POPULATION COST, not a sample: of the 160 distinct published names
     * beginning with plan/plans/plan's, this reaches 5 and KEEPS 155 — among
     * them `Plan Loan Default Fund` (194 rows, a real TIAA fund), `Plan's
     * interest in the Hilton Stable Value Fund`, every `Plans Participating In
     * Master Trust: <numbers>` roster line and all the participant-loan prose.
     * The anchor is what does that: the remainder must be the WHOLE vocabulary
     * term, so `Plan Fidelity 500 Index` is untouched.
     *
     * The sibling candidate leads were measured and are NOT added: `other`
     * reaches 121 rows and all 121 are ALREADY `NOT_FUND_SHAPED`, so the guard
     * sees them today and nothing is gained. */
    [/^(?:individual|managed|master|annuity|variable annuity in|plan(?:'|’)?s?)\s+/i, ""],
    [/\s*[:;.]+$/, ""],
    [/[,;]?\s*at fair value$/i, ""],
    /* v196 — the MEASUREMENT BASIS in every spelling the store uses, and a
     * trailing footnote taken with it rather than through a general
     * parenthesised-letter arm, so v188's case-SENSITIVE caution above stays
     * exactly as narrow as it was. `(?:at|using)` is required: a bare `\bnav\b`
     * would eat `PIMCO Short-Term Floating NAV Portfolio II`. */
    [/[,;]?\s*\(?\s*practical expedient\s*\)?$/i, ""],
    [/[,;]?\s*(?:(?:as\s+)?(?:measured?|valued|stated|carried|reported)\s+)?(?:at|using)\s+(?:(?:fair|contract|market|net asset|book|redemption)\s+value|n\.?a\.?v\.?)\s*(?:\(\s*[a-z0-9]{1,2}\s*\)|\d{1,2})?$/i, ""],
    /* A parenthesised NUMBER is the footnote marker v174 removed from 7,429
     * welded rows; unlike a letter it cannot be a share class. */
    [/\s*\(\s*\d{1,2}\s*\)$/, ""],
    [/^(?:investments?|assets)\s+(?=\S)/i, ""],
    [/\s+shares$/i, ""],
    [/[,;]?\s*dividends?\s*\/\s*interest reinvested$/i, ""],
    [/\s+not required$/i, ""],
    [/\s+[a-z]$/, ""],
  ];
  function stripGenericDecoration(name) {
    let s = String(name || "").trim();
    for (let i = 0; i < 8; i++) {
      const before = s;
      for (const [re, to] of GENERIC_DECO) s = s.replace(re, to);
      s = s.trim();
      if (s === before) break;
    }
    return s;
  }
  const GTA_MIN_TYPO_LEN = 10;
  const GTA_TERMS = ["totalregisteredinvestmentcompany","totalregisteredinvestmentcompanies","totalcommoncollectiveinvestmenttrustsfunds","totalcommoncollectiveinvestmenttrustsfund","totalcommoncollectiveinvestmenttrustsportfolios","totalcommoncollectiveinvestmenttrustsportfolio","totalcommoncollectiveinvestmenttrusts","totalcommoncollectiveinvestmenttrustfunds","totalcommoncollectiveinvestmenttrustfund","totalcommoncollectiveinvestmenttrustportfolios","totalcommoncollectiveinvestmenttrustportfolio","totalcommoncollectiveinvestmenttrust","totalcommoncollectivetrustsfunds","totalcommoncollectivetrustsfund","totalcommoncollectivetrustsportfolios","totalcommoncollectivetrustsportfolio","totalcommoncollectivetrusts","totalcommoncollectivetrustfunds","totalcommoncollectivetrustfund","totalcommoncollectivetrustportfolios","totalcommoncollectivetrustportfolio","totalcommoncollectivetrust","totalcollectiveinvestmenttrustsfunds","totalcollectiveinvestmenttrustsfund","totalcollectiveinvestmenttrustsportfolios","totalcollectiveinvestmenttrustsportfolio","totalcollectiveinvestmenttrusts","totalcollectiveinvestmenttrustfunds","totalcollectiveinvestmenttrustfund","totalcollectiveinvestmenttrustportfolios","totalcollectiveinvestmenttrustportfolio","totalcollectiveinvestmenttrust","totalcollectivetrustsfunds","totalcollectivetrustsfund","totalcollectivetrustsportfolios","totalcollectivetrustsportfolio","totalcollectivetrusts","totalcollectivetrustfunds","totalcollectivetrustfund","totalcollectivetrustportfolios","totalcollectivetrustportfolio","totalcollectivetrust","totalmutualfunds","totalmutualfund","totalcommonandpreferredstocks","totalcommonandpreferredstock","totalcommonstocks","totalcommonstock","totalcorporatestocks","totalcorporatestock","totalpooledseparateaccounts","totalpooledseparateaccount","totalseparateaccounts","totalseparateaccount","totalguaranteedinvestmentcontracts","totalguaranteedinvestmentcontract","totalguaranteedinterestcontracts","totalguaranteedinterestcontract","totalgroupannuitycontracts","totalgroupannuitycontract","totalcommingledtrustfunds","totalcommingledtrustfund","totalcommingledinvestmentfunds","totalcommingledinvestmentfund","totalcommingledfunds","totalcommingledfund","totalpooledseparateaccountfunds","totalpooledseparateaccountfund","totalplaninterestinmastertrustsfunds","totalplaninterestinmastertrustsfund","totalplaninterestinmastertrusts","totalplaninterestinmastertrustfunds","totalplaninterestinmastertrustfund","totalplaninterestinmastertrust","totalplanmastertrustsfunds","totalplanmastertrustsfund","totalplanmastertrusts","totalplanmastertrustfunds","totalplanmastertrustfund","totalplanmastertrust","totalinterestinmastertrustsfunds","totalinterestinmastertrustsfund","totalinterestinmastertrusts","totalinterestinmastertrustfunds","totalinterestinmastertrustfund","totalinterestinmastertrust","totalmastertrustsfunds","totalmastertrustsfund","totalmastertrusts","totalmastertrustfunds","totalmastertrustfund","totalmastertrust","totaltrusts","totaltrust","totalstatements","totalstatement","totalpreferredstocks","totalpreferredstock","totalinvestments","totalinvestment","totalassets","totalbeginningfairvalues","totalbeginningfairvalue","totalbeginningcontractvalues","totalbeginningcontractvalue","totalbeginningmarketvalues","totalbeginningmarketvalue","totalbeginningnetassetvalues","totalbeginningnetassetvalue","totalbeginningbookvalues","totalbeginningbookvalue","totalendingfairvalues","totalendingfairvalue","totalendingcontractvalues","totalendingcontractvalue","totalendingmarketvalues","totalendingmarketvalue","totalendingnetassetvalues","totalendingnetassetvalue","totalendingbookvalues","totalendingbookvalue","totalfairvalues","totalfairvalue","totalcontractvalues","totalcontractvalue","totalmarketvalues","totalmarketvalue","totalnetassetvalues","totalnetassetvalue","totalbookvalues","totalbookvalue","registeredinvestmentcompany","registeredinvestmentcompanies","commoncollectiveinvestmenttrustsfunds","commoncollectiveinvestmenttrustsfund","commoncollectiveinvestmenttrustsportfolios","commoncollectiveinvestmenttrustsportfolio","commoncollectiveinvestmenttrusts","commoncollectiveinvestmenttrustfunds","commoncollectiveinvestmenttrustfund","commoncollectiveinvestmenttrustportfolios","commoncollectiveinvestmenttrustportfolio","commoncollectiveinvestmenttrust","commoncollectivetrustsfunds","commoncollectivetrustsfund","commoncollectivetrustsportfolios","commoncollectivetrustsportfolio","commoncollectivetrusts","commoncollectivetrustfunds","commoncollectivetrustfund","commoncollectivetrustportfolios","commoncollectivetrustportfolio","commoncollectivetrust","collectiveinvestmenttrustsfunds","collectiveinvestmenttrustsfund","collectiveinvestmenttrustsportfolios","collectiveinvestmenttrustsportfolio","collectiveinvestmenttrusts","collectiveinvestmenttrustfunds","collectiveinvestmenttrustfund","collectiveinvestmenttrustportfolios","collectiveinvestmenttrustportfolio","collectiveinvestmenttrust","collectivetrustsfunds","collectivetrustsfund","collectivetrustsportfolios","collectivetrustsportfolio","collectivetrusts","collectivetrustfunds","collectivetrustfund","collectivetrustportfolios","collectivetrustportfolio","collectivetrust","mutualfunds","mutualfund","commonandpreferredstocks","commonandpreferredstock","commonstocks","commonstock","corporatestocks","corporatestock","pooledseparateaccounts","pooledseparateaccount","separateaccounts","separateaccount","guaranteedinvestmentcontracts","guaranteedinvestmentcontract","guaranteedinterestcontracts","guaranteedinterestcontract","groupannuitycontracts","groupannuitycontract","commingledtrustfunds","commingledtrustfund","commingledinvestmentfunds","commingledinvestmentfund","commingledfunds","commingledfund","pooledseparateaccountfunds","pooledseparateaccountfund","planinterestinmastertrustsfunds","planinterestinmastertrustsfund","planinterestinmastertrusts","planinterestinmastertrustfunds","planinterestinmastertrustfund","planinterestinmastertrust","planmastertrustsfunds","planmastertrustsfund","planmastertrusts","planmastertrustfunds","planmastertrustfund","planmastertrust","interestinmastertrustsfunds","interestinmastertrustsfund","interestinmastertrusts","interestinmastertrustfunds","interestinmastertrustfund","interestinmastertrust","mastertrustsfunds","mastertrustsfund","mastertrusts","mastertrustfunds","mastertrustfund","mastertrust","statements","preferredstocks","preferredstock","investments","investment","beginningfairvalues","beginningfairvalue","beginningcontractvalues","beginningcontractvalue","beginningmarketvalues","beginningmarketvalue","beginningnetassetvalues","beginningnetassetvalue","beginningbookvalues","beginningbookvalue","endingfairvalues","endingfairvalue","endingcontractvalues","endingcontractvalue","endingmarketvalues","endingmarketvalue","endingnetassetvalues","endingnetassetvalue","endingbookvalues","endingbookvalue","fairvalues","contractvalues","contractvalue","marketvalues","marketvalue","netassetvalues","netassetvalue","bookvalues"];
  const GTA_TERM_SET = new Set(GTA_TERMS);
  function oneEdit(a, b) {
    if (a === b) return false;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    if (la === lb) {
      const d = [];
      for (let i = 0; i < la; i++) if (a[i] !== b[i]) { d.push(i); if (d.length > 2) return false; }
      if (d.length === 1) return true;
      return d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]];
    }
    const s = la < lb ? a : b, l = la < lb ? b : a;
    let i = 0, j = 0, skipped = false;
    while (i < s.length && j < l.length) {
      if (s[i] === l[j]) { i++; j++; continue; }
      if (skipped) return false;
      skipped = true; j++;
    }
    return true;
  }

  function isTypoGenericTypeName(n) {
    const s = String(n || "").trim();
    if (!s) return false;
    for (const cand of [s, stripGenericDecoration(s)]) {
      const tk = cand.split(/\s+/);
      if (tk.length > 1 && tk[tk.length - 1].replace(/[^A-Za-z0-9]/g, "").length <= 1) continue;
      const k = cand.toLowerCase().replace(/[^a-z]/g, "");
      if (k.length < GTA_MIN_TYPO_LEN) continue;
      if (GTA_TERM_SET.has(k)) continue;
      for (const t of GTA_TERMS) if (oneEdit(k, t)) return true;
    }
    return false;
  }

  function isGenericTypeName(n) {
    const s = String(n || "").trim();
    if (!s) return false;
    /* v189: the third arm asks the SAME question of the letters-only string, so
     * a kerned rendering of an asset-class label is recognised. It lives here
     * rather than in the dominance guard so that every caller — the guard, both
     * audits, diff-lineups and the browser twin — asks one question. The twin is
     * GENERATED from this file and `smoke-test.mjs` fails on drift, which is how
     * adding an arm here is prevented from silently splitting the two surfaces. */
    /* v196: A NAME THAT IS NOTHING BUT DECORATION escaped the decoration-aware
     * guard, and the arm that produced the hole is v188's own. `At fair value`
     * strips to the EMPTY STRING, and an empty remainder is in no vocabulary, so
     * the predicate asked its question of nothing and answered false — while
     * Northwood Investors published that row at 86.8% of its menu and Universal
     * Orlando at 75.3%. If the strip consumed the whole name, the name carried no
     * identity to begin with: there is no vocabulary to widen and nothing to
     * read, which is why this arm is stated structurally. */
    const bare = stripGenericDecoration(s);
    if (!bare) return true;
    /* v197: the fourth arm asks the SAME question of a name one KEYSTROKE away
     * from the vocabulary's own language. It lives here, beside the despaced
     * arm, rather than in GENERIC_TYPE_ANY — see isTypoGenericTypeName: putting
     * it in the vocabulary would move `isClassLabel` and so the region contest,
     * which is what cost v196 two lineups on a +0/-0 registration. */
    return GENERIC_TYPE_ANY.test(s) || GENERIC_TYPE_ANY.test(bare)
        || GENERIC_TYPE_DESPACED.test(s.toLowerCase().replace(/[^a-z]/g, ""))
        || isTypoGenericTypeName(s);
  }

  /* A NAME WITH NO FUND IDENTITY IN IT — `shares`, `Fund`, `UNIT`,
   * `Institutional Class`, `E.I.N. 23-`. isGenericTypeName is a closed
   * vocabulary of Schedule H TYPE LABELS and is blind to a FRAGMENT, and
   * widening that constant is refused because the parser's region selection
   * reads it. Display-only, composed into isGenericName below. 486 rows /
   * 325 plans / 1,131,917 ppl / $5.93B newly qualified; 343 rows carrying an
   * ISSUER are deliberately untouched. It tests the CLEANED form too because
   * this file passes f.name RAW where build-seo-pages passes the cleaned
   * string, and they differ on 16 rows. scripts/lib-disclose.mjs holds the
   * measurement and the list of all 309 distinct names, every one read. */
  const NO_IDENTITY_FILLER = /\b(?:class|cl|cls|series|ser|unit|units|share|shares|shs|institutional|instl|inst|investor|inv|adv|advisor|advisors|retirement|r[1-6]|[a-z]|\d{1,3}|common|collective|trust|trusts|fund|funds|the|at|nav|portfolio)\b/gi;
  const stripsToNothing = (s) =>
    String(s).replace(NO_IDENTITY_FILLER, " ").replace(/[^A-Za-z0-9]+/g, " ").trim().length === 0;
  /* An EMPLOYER-IDENTIFICATION NUMBER published as a holding. `E.I.N. 20-` is
   * caught by the filler strip, but the OCR'd I/L variant `E.LN. 81-` is NOT —
   * "LN" survives as a two-letter token and reads as an identity. Three rows /
   * 559 participants (The Alexander Group, St Henry Tile, Bblbc at 56.5% of its
   * own menu), and a form-field fragment is never a fund under any spelling. */
  const EIN_FRAGMENT = /^e\.?\s?[il]\.?\s?n\.?\s*[\d\s\-‐–—]*$/i;
  function hasNoFundIdentity(name) {
    const s = String(name || "").trim();
    if (!s) return false;              /* an empty name is a different case */
    if (EIN_FRAGMENT.test(s)) return true;
    return stripsToNothing(s) || stripsToNothing(cleanFiledName(s));
  }
  /* A NAME BUILT ENTIRELY OF TYPE-LABEL WORDS — canonical copy, 2026-10-04.
   *
   * 152 rows / 132 plans / 1,232,895 participants / $42,859,386,021, across 43
   * distinct names, EVERY ONE OF WHICH WAS READ rather than sampled. Providence
   * Health publishes `Registered investment company funds` at 48.0% of one
   * plan's menu ($12,474,349,571) and on three more plans; Trinet HR III and IV
   * publish `Registed Investment Co.` to 280,299 readers ($1,239,771,549); 3M
   * publishes a bare `companies` on 25 rows totalling $14,372,175,818; Ford
   * publishes `Separate Account`; Cigna a bare `account` on 15 rows.
   *
   * WHY `isGenericTypeName` CANNOT REACH THEM, and why the vocabulary must not be
   * widened to try: GENERIC_TYPE_NAME is a CLOSED list of Schedule H type labels
   * anchored `^...$`, so it answers `registered investment companies` and not
   * `registered investment company funds` — one trailing noun away. Its own
   * comment refuses widening because the PARSER reads it: `isClassLabel` ->
   * `isStatement` -> the region contest, which is what cost v196 two whole
   * lineups on a +0/-0 registration. And `hasNoFundIdentity` cannot reach them
   * either: its filler list holds `common|collective|trust|fund|the|at|nav` but
   * not `regist*`, `investment`, `company` or `account`, which is exactly why
   * `Collective trust fund` is already covered and these are not.
   *
   * SO THIS IS A THIRD DISPLAY-ONLY PREDICATE, kept OUT of both of those for a
   * measured reason rather than a stylistic one: `merge-4i.mjs:1394` guards its
   * share-count repair with `isGenericTypeName(head) || hasNoFundIdentity(head)`,
   * so widening either would make more heads read as generic and SILENTLY REFUSE
   * MORE NAME REPAIRS — a legibility fix priced against a guard that reads names.
   * Being a separate export, it bounds the blast radius to the two display call
   * sites BY CONSTRUCTION.
   *
   * THE INSTRUMENT WAS NARROWED TWICE BY READING ITS OWN OUTPUT, and that is the
   * whole of the safety argument. The queue sized this class at 88 rows inside a
   * `/regist/` screen — a count keyed on a vocabulary, which measures the
   * vocabulary. The general form of the discriminator ("remove the leading run of
   * label words and ask whether anything of substance remains") reads 611 rows /
   * 1,991,593 ppl, and reading THAT refused it as one class: it merges genuine
   * label-only names with four other remedies. So the shipped form demands that
   * EVERY word be a label word, with one tolerated exception.
   *
   * BOTH CONDITIONS HAVE A LIVE BLOCKING POPULATION, measured by neutering each
   * one separately over all 1,730,670 published rows:
   *
   *   - THE PAGE-REFERENCE TOLERANCE ADDS 2 rows / 80,475 ppl, both National
   *     Rural Electric's and both on its one crawlable page. A pointer into the
   *     filing is not a fund, and without this arm both rows are missed.
   *     ITS PLURAL/RANGE SPELLING WAS FOUND BY READING THE PAGE AND NOT BY A
   *     COUNT. The first version took a singular `(page 166)` only, so the
   *     regenerated page qualified `Registered Investment Companies (Page 166)`
   *     ($225,158,578) and left `Common Collective Trusts (Pages 165-166)` —
   *     **$9,284,475,171, 48.6% of that plan's menu and the LARGEST row on the
   *     page** — reading as a named holding two rows above it. The argument for
   *     the wider spelling is not symmetry but consistency with a predicate
   *     already shipped: `isGenericTypeName("Common Collective Trusts")` is
   *     TRUE, so the bare caption is qualified already and only the page pointer
   *     defeated it. Measured: the widening adds exactly that one row, and
   *     `Corporate Stocks (Pages 56-155)`, `U.S. Government Securities (Pages
   *     23-27)` and `Managed Account Holdings (985 Positions)` on the same page
   *     all stay out — the first two by the LABEL condition (`Stocks`,
   *     `Securities`) and the third because a POSITION count is not a pointer.
   *     *The page is the artifact: a diff of 13 files showed both halves of one
   *     caption family and a row count could not.*
   *   - REQUIRING EVERY WORD TO BE A LABEL BLOCKS 57 rows / 174,038 ppl, and all
   *     43 blocked names were read: each is a DIFFERENT remedy. A welded VINTAGE
   *     is identifying information (`Fund 2030` through `Fund 2065`, a whole
   *     Capital Manor ladder; `Investments VG 2030`); a real designation must
   *     stand (`SEPARATE ACCOUNT II`, `Separate Account - Z`); OCR debris is the
   *     welded-count class's business (`Pooled Separate Acct Ae`, `Company ba`,
   *     `Mutual fund ae`); and a trailing joiner is the truncated-name class
   *     (`Investment in`, `Shares in`).
   *
   * THE v188 PIN IS NOW RESPECTED BY CONSTRUCTION RATHER THAN BY EXCEPTION.
   * lib-4i deliberately leaves `Separate Account A` uncaught because a capital
   * `A` may be a real separate-account designation and case is the only signal —
   * Four Seasons Heating publishes it at 91.5% of its menu. `A` is not a label
   * word, so this predicate spares it without being told to, and that is a
   * single-protection negative control rather than a hand-written exemption.
   *
   * SEVEN ROWS IT REACHES ARE EMPLOYER STOCK, and the COMPOSITION is the only
   * thing that protects them — measured, not supposed. This predicate is
   * INJECTED INTO `isNamelessFundRow` as part of its generic-name test, never
   * added as a parallel disjunct at the call site, so all three of that
   * function's early returns — subtotal, brokerage window, employer stock —
   * guard the new arm. As a sibling disjunct it would have told readers that
   * these seven rows name no specific fund:
   *
   *     Altria Client Services  `Shares`      $1,456,691,207  26.6%  ticker MO
   *     Sealed Air Corporation  `Shares of`   $  136,743,941   9.0%
   *     Ford Motor Company x2   `Separate Account`             0.6% / 0.3%
   *     Gardiner Service Co.    `REGISTERED COMPANIES`         3.9%
   *     Integrated Mill Systems `Registered Companies`         1.0%
   *     Manganaro North America `Shares`                       0.2%
   *
   * Every one is typed `Company stock`, and Altria's carries a correct symbol on
   * $1.46B in front of 11,893 readers. *Where a predicate is composed decides
   * what protects it* — and the flat screen that sized this class counted six of
   * these seven, so the renderer diff reading 146 where the screen read 152 is
   * the protection working rather than a number to reconcile away.
   *
   * The ISSUER half of the call-site gate is left on the narrower
   * `isGenericName` on purpose: whether a label-only string in the ISSUER cell
   * should also stop a row reading as named is a separate measurement, recorded
   * rather than assumed. docs/accuracy-log.md 2026-10-04. */
  const LABEL_ONLY_WORD = /^(?:regist\w*|inv\s?estment|investments?|compan(?:y|ies)|co\.?|funds?|fds?\.?|mutual|common|collective|pooled|separate|sep\.?|account|accounts?|acct\.?s?|trust|trusts?|tr\.?|shares?|of|the|at|nav|[\(\)\[\],.:;-]+)$/i;
  const LABEL_ONLY_PAGE_REF = /^\(?(?:pages?|pgs?\.?|pp\.?|p\.?|notes?|lines?|items?)\s*\d+\s*(?:(?:[-–—]|to)\s*\d+\s*)?\)?$/i;
  function isLabelOnlyName(name) {
    const w = String(name == null ? "" : name).trim().split(/\s+/).filter(Boolean);
    if (!w.length) return false;
    let i = 0;
    while (i < w.length && LABEL_ONLY_WORD.test(w[i])) i++;
    if (!i) return false;                      /* does not even START with a label */
    const rest = w.slice(i).join(" ");
    return !rest || LABEL_ONLY_PAGE_REF.test(rest);
  }
  const isGenericName = (n) => isGenericTypeName(n) || hasNoFundIdentity(n);
  /* the NAME half of the call-site gate, widened by the predicate above.
   * Injected into `isNamelessFundRow` rather than added beside it so that
   * its subtotal / brokerage-window / EMPLOYER-STOCK early returns guard the
   * new arm too — Altria's bare `Shares` carries ticker MO on $1.46B and is
   * typed `Company stock`. The ISSUER half stays on `isGenericName`. */
  const nameIsGeneric = (n) => isGenericName(n) || isLabelOnlyName(n);
  window.__wampoLabelOnly = isLabelOnlyName;  // read by the smoke test only
  window.__wampoGenericName = isGenericName;  // read by the smoke test only
  function isNamelessFundRow(f, cleanedName, isGenericName) {
    const type = String((f && f.type) || "");
    const name = String(cleanedName || (f && f.name) || "");
    if (/^subtotal \(not a holding\)$/i.test(type)) return false;
    if (/brokerage window/i.test(type)) return false;
    if (/company stock|employer (security|stock)/i.test(type + " " + name)) return false;
    return !!isGenericName(name);
  }

  window.__wampoNamelessRow = isNamelessFundRow;  // read by the smoke test only
  const LOAN_DESC_RANGE = /\brates?\b[^.;]{0,40}?\b(?:rang(?:e|es|ing)|between|vary|varying|from)\b|\b\d+(?:\.\d+)?\s*%?\s*(?:to|[-–—])\s*\d+(?:\.\d+)?\s*%|\b(?:from|of)\s+\d+(?:\.\d+)?\s*%\s*(?:to|[-–—])/i;
  const LOAN_DESC_WORDS = /\b(?:participants?|participation|loans?|notes?|promissory|receivable|outstanding|balances?|interest|rates?|ranging|range|ranges|rang|between|varying|various|vary|varies|bearing|earning|carrying|accruing|maturing|maturity|maturities|due|payable|dated?|dates|through|until|to|from|at|with|of|and|or|the|a|an|per|annum|annually|percent|pct|secured|collateralized|collateral|by|vested|terms?|years?|months?|less|more|than|generally|stated|fixed|variable|cost|no|later|amounts?|extending|into|repayment|plan|in|on|all|up)\b/gi;
  const LOAN_DESC_MONTHS = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi;

  /* A TRUNCATED WORD IS NOT A SURVIVING FUND NAME — 2026-09-30.
   *
   * The residue test above is load-bearing and must stay: it is what keeps
   * Griswold's `Interest Rate of 0.15% to 0.62% … Principal` GIC, where the
   * surviving `Principal` is a house name. But thirteen rows survive it on a
   * residue that is not a name at all — it is one of the words this rule ALREADY
   * STRIPS, cut mid-token by the filing's column width. Aimbridge Parent (53,606
   * participants) publishes `with varying maturity dates through August 2034,
   * bearing interest at 4.25% to 9.50% per an` at $6,206,114; the residue is
   * `mat`, `thr`, `dat`, `matu`, `Bear`, `balan`, `partic`, `Ap`, `Col`, `bear`,
   * `par`, `matur`, `rangi` — every one a proper prefix of a stripped word.
   *
   * So the discriminator is structural and needs no new vocabulary: a residue
   * token that is a PROPER PREFIX of a word this rule strips is that word, and
   * the vocabulary is DERIVED from the two regexes above rather than retyped, so
   * a later widening of either cannot leave this arm behind. Month names are
   * spelled out because `LOAN_DESC_MONTHS` matches `apr[a-z]*` and therefore
   * strips `April` whole while leaving `Ap`.
   *
   * The risk is named rather than rounded away: `bear` could open `Bear Stearns`
   * and `Col` could open `Columbia`. What contains it is that this test is asked
   * ONLY of a row whose name already states a rate RANGE (`LOAN_DESC_RANGE`), and
   * every flagged row was read. */
  const LOAN_DESC_PREFIXABLE = (() => {
    const src = LOAN_DESC_WORDS.source.replace(/^\\b\(\?:/, "").replace(/\)\\b$/, "");
    if (src === LOAN_DESC_WORDS.source) {
      throw new Error("lib-disclose: LOAN_DESC_WORDS no longer has the \\b(?:…)\\b shape its prefix vocabulary is derived from — fix the derivation rather than shipping a quiet guard");
    }
    const out = new Set();
    for (const alt of src.split("|")) {
      const w = alt.trim();
      if (!w) continue;
      if (/^[a-z]+\?$/i.test(w)) { out.add(w.slice(0, -2)); out.add(w.slice(0, -1)); }
      else if (/^[a-z]+$/i.test(w)) out.add(w);
    }
    for (const m of ["january", "february", "march", "april", "may", "june", "july",
      "august", "september", "october", "november", "december"]) out.add(m);
    if (!out.has("maturing") || !out.has("through") || !out.has("april") || !out.has("date")) {
      throw new Error("lib-disclose: the loan-word prefix vocabulary lost an entry the shipped cases depend on — the derivation is broken");
    }
    return [...out];
  })();
  function isTruncatedLoanWord(tok) {
    const t = tok.toLowerCase();
    return LOAN_DESC_PREFIXABLE.some((w) => w.length > t.length && w.startsWith(t));
  }
  function loanDescriptionResidue(name) {
    return String(name || "")
      .replace(/\d+(?:\.\d+)?\s*%/g, " ")
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(/\b\d+(?:\.\d+)?\b/g, " ")
      .replace(LOAN_DESC_MONTHS, " ")
      .replace(LOAN_DESC_WORDS, " ")
      .replace(/[^A-Za-z]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !isTruncatedLoanWord(t));
  }
  function isLoanDescriptionRow(name) {
    const s = String(name || "").trim();
    if (!s || !/\d/.test(s) || !LOAN_DESC_RANGE.test(s)) return false;
    return loanDescriptionResidue(s).length === 0;
  }

  window.__wampoLoanDescRow = isLoanDescriptionRow;  // read by the smoke test only
  const ANNUITY_CONTRACT_NAME = /\bannuity contracts?\b/i;
  function isAnnuityContractRow(f, cleanedName) {
    const type = String((f && f.type) || "");
    if (!/^mutual fund/i.test(type)) return false;
    return ANNUITY_CONTRACT_NAME.test(String(cleanedName || (f && f.name) || ""));
  }

  window.__wampoAnnuityRow = isAnnuityContractRow;  // read by the smoke test only
  const GUARANTEE_PRICED_WORDS =
    /\bstable value\b|\bmanaged income\b|\bguarantee(?:d|s)?\b|\b(?:sa?)?gic\b/gi;
  /* THE FILING'S OWN WORD, AND NOT A LIST OF THE WORDINGS IT APPEARS IN —
   * 2026-10-02. See the reading in annuityFeeIsGuaranteeOnly below: a vocabulary
   * is the wrong SHAPE for this gate, and the gate's own second condition was
   * the safety all along. Declared here rather than beside its phrase-level
   * siblings so it travels INSIDE the generator's slice, which runs from
   * GUARANTEE_PRICED_WORDS to the end of the function. */
  const CONTRACT_WORD = /\bcontracts?\b/i;
  function annuityFeeIsGuaranteeOnly(cleanedName, priceOf) {
    const s = String(cleanedName || "");
    /* THE GATE READS ALL THREE CONTRACT WORDINGS AS OF 2026-10-01 (14:2xZ), AND
     * UNTIL NOW IT READ ONE — the eighth recorded instance of a fix for one
     * PHRASING of a class not being a fix for the class, and this time both
     * halves shipped in the SAME commit with different reach. On 2026-09-29 the
     * TYPE rule below was written for `investment contract` AND `insurance
     * contract` BECAUSE shipping only the phrase an item was filed under is a
     * recorded mistake; this FEE rule, four lines up, kept the annuity-only gate
     * and so was outside that class by construction.
     *
     * 117 rows / 117 plans / 191,275 participants / $749,120,771, EVERY ONE at
     * 0.35 — `fund-er.js`'s generic `/stable value|guaranteed|gic/` fallback,
     * the same number withdrawn from 89 rows on 2026-09-29 and refused again by
     * v196. `Fully benefit-responsive investment contract Principal Fixed Income
     * Guaranteed Option`, `… Key Guaranteed Portfolio Fund`, `Guaranteed
     * insurance contract`. Found by the 14:0xZ draw on Bob Evans Restaurants
     * (15,749 ppl), whose `Unallocated investment contract - Guaranteed Income
     * Fund` is 15.9% of its menu.
     *
     * THE PREDICATE IS REUSED AND NOT RETYPED: `CONTRACT_DESIGNATION_NAME` is the
     * TYPE rule's own constant, so the two halves cannot drift apart again — and
     * `ANNUITY_CONTRACT_NAME` stays separate because `isAnnuityContractRow` uses
     * it to TYPE a row `Annuity contract`, which an investment contract is not.
     *
     * IT IS NOT THE OWNER-GATED STABLE-VALUE ITEM AND MUST NOT BE READ AS A BITE
     * OUT OF IT. That one (4,669 rows / 7.39M ppl, re-derived the same cycle) is
     * a policy call about rows whose name says only `stable value`; these 117
     * additionally carry the filing's OWN word `contract`, which is the condition
     * the project already decided on. 0 of the 117 publish a ticker, so the whole
     * effect is the withdrawal of one fabricated number.
     *
     * AND THE FIRST NARROWING I PROPOSED WAS INERT, measured before it was
     * written up: feeding `namesAFund` a guarantee-only screen reaches 0 rows,
     * because this function answers FALSE on every one of them for the gate
     * reason above. The circularity is real — `fundER("Guaranteed Income Fund")`
     * is 0.35 with no ticker, so `namesAFund` is true on the fee alone — but the
     * tool for it was unreachable, not absent.
     *
     * ============================================================
     * AND THE NINTH INSTANCE ARRIVED ONE DAY LATER AND ENDED THE VOCABULARY —
     * 2026-10-02. Three wordings were still three, and the filings write 67.
     * `TIAA Stable Value Contract`, `Guaranteed Income Contract`, `Guaranteed
     * Interest Balance Contract`, `Key Guaranteed Portfolio Fund, at contract
     * value`: 226 published rows / 223 plans / 459,254 participants /
     * $2,453,384,524 publish the exact fabricated 0.35 this gate exists to
     * withhold, 225 of them at 0.35. Found by the 03:1xZ draw on Walsh
     * University (690 ppl), whose row is typed `Mutual fund` as well as priced.
     *
     * SO THE FIRST CONDITION IS NOW THE FILING'S OWN WORD, AND THE REASON IS
     * MEASURED RATHER THAN TIDY. Over the newly-reached names the phrase
     * immediately preceding `contract` takes **67 distinct forms**, and the word
     * `investment` is MISSPELLED SEVEN WAYS inside them — `Investement`,
     * `Invest`, `INVESTMNT`, `Intvestment`, `Investm ent`, `Inves tment`, plus
     * `annity` for `annuity` on 4 rows. *A vocabulary is defeated by a
     * keystroke*, and this one was defeated by seven of them: every widened list
     * would have shipped already one wording short of the next filing.
     *
     * WHAT MAKES THE BARE WORD SAFE IS THE SECOND CONDITION, WHICH WAS THE RULE
     * ALL ALONG — and that is a measurement, not an argument. 2026-09-29
     * deliberately refused the bare word for the TYPE rule below, having read
     * 103 names and found them "overwhelmingly REAL FUNDS wearing a caption"
     * (`at contract value Fidelity 500 Index`). That reading still holds and the
     * residue test absorbs them: with this condition widened, the gate REACHES
     * 86 such rows and REFUSES 30 of the 30 that publish a fee, because
     * `Fidelity International Index`, `Vanguard Value Index Fund Adm`, `MFS
     * Value R6`, `T. Rowe Price Retirement 2045 Fund` and `JPMorgan
     * SmartRetirement 2040 Fund R5` all still price once the guarantee words
     * come out. The caption is not what the gate reads; the remainder is.
     *
     * ALL 183 DISTINCT NEWLY-FLAGGED NAMES WERE READ and 182 are an insurance
     * guarantee, a stable-value contract, a bare legal designation or a filer's
     * table line welded into a name (`Change in contract value versus fair value
     * in Morley Stable Value Fund`, `259,569.72 Guaranteed Income Contract`).
     * NOT ONE names a registered fund. The 183rd is `Contract BlackRock Russell
     * 1000 Growth CIT` — a real collective trust publishing IWF's 0.18 as a
     * labelled comparable — and the CALL SITE keeps it, because this predicate
     * is purely about the NAME and app.js ANDs it with `!tk`, exactly as
     * `isBankDepositRow` is. Measured both halves before adding that: the
     * SHIPPED gate flags 2,915 published rows and **0 of them publish a
     * ticker**, so `!tk` moves no shipped verdict and is load-bearing on exactly
     * that one row. *A condition that changes one verdict is named as changing
     * one verdict.*
     *
     * THE DEFECT CANNOT RECUR IN THIS DIRECTION, and that is structural rather
     * than remembered: `CONTRACT_WORD` is provably WIDER than both phrase
     * regexes — every string either of them matches contains ` contract` with a
     * trailing word boundary — which is a stronger guarantee than the shared
     * constant it replaces. The import assertion below `isInvestmentContractRow`
     * checks that derivation on every load rather than trusting this sentence.
     *
     * WHAT IT STILL CANNOT REACH, named rather than rounded away: 5 rows whose
     * RAW filed name says `contract` and whose CLEANED name does not, because
     * the unclosed-parenthetical strip (2026-09-30) or a leading caption took
     * the word off the end — `Guaranteed Income Fund - Empower Annuity Insurance
     * Company (contract Insurance Company Gen`. The gate reads the cleaned name,
     * so no widening of a NAME condition can reach them; they are rows whose
     * name says only `guaranteed`, i.e. the owner-gated stable-value item, and
     * they are deliberately left there. */
    if (!CONTRACT_WORD.test(s)) return false;
    const rest = s.replace(GUARANTEE_PRICED_WORDS, " ").replace(/\s+/g, " ").trim();
    return priceOf(rest) == null;
  }

  window.__wampoGuaranteeOnlyFee = (n) => annuityFeeIsGuaranteeOnly(n, fundER);  // read by the smoke test only
  const CONTRACT_DESIGNATION_NAME = /\b(?:investment|insurance) contracts?\b/i;
  const CONTRACT_DESIGNATION_WORDS = /\b(?:investment|insurance) contracts?\b/gi;
  function isInvestmentContractRow(f, cleanedName, namesAFund) {
    const type = String((f && f.type) || "");
    if (!/^mutual fund/i.test(type)) return false;
    const s = String(cleanedName || (f && f.name) || "");
    if (!CONTRACT_DESIGNATION_NAME.test(s)) return false;
    const rest = s.replace(CONTRACT_DESIGNATION_WORDS, " ")
      .replace(GUARANTEE_PRICED_WORDS, " ").replace(/\s+/g, " ").trim();
    return !namesAFund(rest);
  }

  window.__wampoInvestmentContractRow = (f) => isInvestmentContractRow(f, (f && f.name) || "", namesAFund);  // read by the smoke test only
  const EMPLOYER_STOCK_CLAIM = /company stock|employer (security|stock)/i;
  const POOLED_CONSTRUCTION_NAME = new RegExp([
    /* a maturity vintage — a fund has one, a share of stock does not */
    "\\btarget(?:ed)?[- ](?:date|retirement)\\b", "\\bretirement date\\b",
    "\\b(?:freedom|target|retirement|lifecycle|lifepath)[- ]?\\s*20[0-7]\\d\\b",
    "\\b20[0-7]\\d[- ]?\\s*(?:target|retirement)\\b",
    /* a tracked index — a company's shares track nothing */
    "\\bindex\\b", "\\bidx\\b", "\\bs&p ?\\d", "\\brussell\\b", "\\bnasdaq\\b",
    "\\bmsci\\b", "\\bftse\\b", "\\bdow jones\\b",
    /* an asset class or a construction style — a pool, never one issuer */
    "\\bmoney market\\b", "\\bbonds?\\b", "\\btreasur",
    "\\bsmall.?cap\\b", "\\bmid.?cap\\b", "\\blarge.?cap\\b", "\\ball.?cap\\b",
    "\\bsmall/mid\\b", "\\bmidcap\\b", "\\bemerging markets?\\b",
    "\\bblend\\b", "\\bbalanced\\b", "\\binflation[- ](?:protected|response)\\b",
    "\\bgrowth fund\\b", "\\bstable value\\b", "\\bmanaged income\\b",
    "\\bguarantee(?:d|s)?\\b",
  ].join("|"), "i");
  function isMistypedStockRow(f, cleanedName) {
    const type = String((f && f.type) || "");
    if (!EMPLOYER_STOCK_CLAIM.test(type)) return false;
    const s = String(cleanedName || (f && f.name) || "");
    /* the NAME arm of the shipped predicate keeps deciding for itself */
    if (EMPLOYER_STOCK_CLAIM.test(s)) return false;
    return POOLED_CONSTRUCTION_NAME.test(s);
  }
  /* The fee a row may publish once the employer-stock claim is withdrawn — the
   * annuity rule's question asked of a different population, and kept as its own
   * function rather than folded into `annuityFeeIsGuaranteeOnly` because that one
   * is shipped, tethered on pinned names, and gates on the annuity phrase this
   * population does not carry. It requires a guarantee word to be PRESENT (the
   * strip must actually remove something), so it is inert on the 175 flagged rows
   * that carry none and cannot quietly blank a real fund's fee. */
  function mistypedStockFeeIsGuaranteeOnly(cleanedName, priceOf) {
    const s = String(cleanedName || "").replace(/\s+/g, " ").trim();
    const rest = s.replace(GUARANTEE_PRICED_WORDS, " ").replace(/\s+/g, " ").trim();
    if (rest === s) return false;
    return priceOf(rest) == null;
  }

  window.__wampoMistypedStockRow = (f) => isMistypedStockRow(f, (f && f.name) || "");  // read by the smoke test only
  window.__wampoMistypedStockGuaranteeFee = (n) => mistypedStockFeeIsGuaranteeOnly(n, fundER);  // read by the smoke test only
  const ISSUER_FORM_WORDS =
    /\b(?:trustee|trust|fiduciary|bank|banking|n\.?\s*a\.?|national association|custodian|custody|llc|l\.l\.c\.|inc|incorporated|corp|corporation|company|companies|co|l\.?p\.?|plc|ltd|limited)\b\.?/gi;
  /* Words that cannot name a fund house, so gate (2) is not asked of them. READ
   * off the first tokens the gate refuses; firm-capable words are absent on
   * purpose and that omission costs rows rather than correctness. */
  const NAME_LEAD_DESIGNATION =
    /^(?:\d+|[a-z]|[a-z]\d|r-?\d|f-?\d|k\d?|the|an?|class|cls?|series)$/i;
  const NAME_LEAD_NEVER_A_FIRM =
    new RegExp(NAME_LEAD_DESIGNATION.source.replace(/\)\$$/, "")
      + "|institutional|institutionl|instl|inst|admiral|adm|advisors?|adv|retail"
      + "|funds?|fds?|shares?|shs|shrs|units?|registered|target(?:ed)?|trgt"
      + "|retirement|retire)$", "i");

  function issuerPricedER(priceOf, cleanedName, issuer) {
    const name = String(cleanedName || "").replace(/\s+/g, " ").trim();
    /* (0) the firm, without its corporate form */
    const iss = String(issuer || "").replace(/\*+/g, " ")
      .replace(ISSUER_FORM_WORDS, " ").replace(/[^A-Za-z0-9&.\- ]+/g, " ")
      .replace(/\s+/g, " ").trim();
    if (!name || !iss) return null;
    const er = priceOf(iss + " " + name);
    if (er == null) return null;
    /* (1) the issuer must not supply the answer by itself */
    if (er === priceOf(iss)) return null;
    /* (2) past a leading share-class designation, the fund's own first word must
     * be load-bearing — unless that word is one that cannot name a firm */
    const parts = name.split(" ");
    if (parts.length < 2) return er;
    const word = (p) => String(p || "").replace(/[^A-Za-z0-9&.-]/g, "");
    let j = 0;
    while (j < parts.length && NAME_LEAD_DESIGNATION.test(word(parts[j]))) j++;
    if (j >= parts.length) return er;               // the name is designation only
    const w = word(parts[j]);
    if (!w || NAME_LEAD_NEVER_A_FIRM.test(w)) return er;
    const less = parts.slice(0, j).concat(parts.slice(j + 1)).join(" ").trim();
    if (less && priceOf(iss + " " + less) === er) return null;
    return er;
  }

  window.__wampoIssuerPricedER = (n, iss) => issuerPricedER(fundER, n, iss);  // read by the smoke test only
  const CIT_VEHICLE_NAME =
    /\b(?:collective(?:\s+investment)?\s+trusts?|common\s+collective\s+trusts?)\b|\bcits?\s*$|\btrust\s+(?:i{1,3}|iv|vi{0,3})\s*$/i;
  const CIT_SERIES_TRUST = /\bseries\s+trust\b|\btrust\s+(?:i{1,3}|\d)\s*[-–—:]\s*\S/i;
  function isCollectiveTrustName(name) {
    const s = String(name || "");
    if (CIT_SERIES_TRUST.test(s)) return false;
    return CIT_VEHICLE_NAME.test(s);
  }

  window.__wampoCitName = isCollectiveTrustName;  // read by the smoke test only
  const LOAN_ANSWER_PHRASE = /^(?:loan\s+)?repayments?\s+are\b|^loan\s+repayments?\s*:/i;
  const LOAN_ANSWER_REMNANT = /^(?:included|yes|no)[.:]?$/i;
  function isLoanAnswerRow(name) {
    const s = String(name || "").trim();
    return LOAN_ANSWER_PHRASE.test(s) || LOAN_ANSWER_REMNANT.test(s);
  }

  window.__wampoLoanAnswerRow = isLoanAnswerRow;  // read by the smoke test only
  const LOAN_NOTE_MARKER = /\b(?:participants?|receivable|rec|promissory)\b/i;
  function isLoanVocabularyRow(name) {
    const s = String(name || "").trim();
    if (!s) return false;
    const hasLoan = /\bloans?\b/i.test(s);
    const hasNote = /\bnotes?\b|\bpromissory\b/i.test(s);
    if (!hasLoan && !(hasNote && LOAN_NOTE_MARKER.test(s))) return false;
    return loanDescriptionResidue(s).length === 0;
  }

  window.__wampoLoanVocabRow = isLoanVocabularyRow;  // read by the smoke test only
  const BANK_DEPOSIT_NAME =
    /\bdep(?:os|so)its?\b|\bsavings\s+acc(?:oun)?ts?\b|\b(?:bank|money\s*market)\s*savings\b/i;
  /* ...and the fourth condition is a CONJUNCTION and cannot join the alternation
   * above, because `money market account` on its own is the filer's loose word
   * for a FUND position and not a deposit product: asked alone it reaches 189
   * fee-publishing rows / 486,616 participants, 41 of them `CREF Money Market
   * Account` (197,268 readers) and others `Vanguard Prime Money Market Account`,
   * `Prudential Government Money Market Account`, `Voya Government Money Market
   * Account` — variable-annuity accounts and registered money funds that have a
   * real expense ratio. Paired with a BANK word it reaches 9 rows, every one of
   * them read. */
  const BANK_DEPOSIT_MMA = /\bmoney\s*market\s+acc(?:oun)?ts?\b/i;
  const BANK_DEPOSIT_BANK = /\bbanks?\b/i;
  function isBankDepositRow(f, cleanedName) {
    /* the string the page PRINTS — `issuer · name`. A filing splits one program
     * name across the two cells at an arbitrary point, and the control-character
     * normalisation is `cleanFiledName`'s own (a broken font ships 0x03 where
     * the space belongs), applied here because the ISSUER cell never passes
     * through that function. */
    const s = (String((f && f.iss) || "").replace(/\*+/g, "") + " " + String(cleanedName || ""))
      .replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
    return BANK_DEPOSIT_NAME.test(s)
      || (BANK_DEPOSIT_MMA.test(s) && BANK_DEPOSIT_BANK.test(s));
  }

  window.__wampoBankDepositRow = (f) => isBankDepositRow(f, (f && f.name) || "");  // read by the smoke test only
  const ESP_FORM_WORD = new Set(["inc", "incorporated", "corp", "corporation", "co",
    "company", "companies", "holding", "holdings", "group", "llc", "llp", "lp", "plc",
    "ltd", "limited", "sa", "nv", "ag", "se", "the", "and", "of", "its",
    "participating", "subsidiaries", "subsidiary"]);
  /* Words an employer-stock row carries INSTEAD of naming anything — read off the
   * 463 rows this rule can reach, and used only to decide whether a SHORT token
   * is the whole identification. A word that could name a company is absent on
   * purpose, and that omission costs rows rather than correctness. */
  const ESP_CAPTION_WORD = new Set(["common", "stock", "stocks", "share", "shares",
    "employer", "employers", "employee", "employees", "security", "securities",
    "related", "corporate", "fund", "funds", "unit", "units", "unitized", "esop",
    "equity", "equities", "preferred", "par", "value", "values", "per", "class",
    "at", "fair", "held", "sponsor", "sponsors", "allocated", "unallocated",
    "nonparticipant", "participant", "directed", "pending", "qualifying",
    "investments", "in", "no", "adr", "interest"]);
  const espNorm = (s) => String(s || "").toLowerCase()
    .replace(/['’`]/g, "")          // DELETED, never spaced: Mcdonald's
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const espToks = (s) => espNorm(s).split(" ").filter(Boolean);
  const espContent = (s) => espToks(s).filter((w) => !ESP_FORM_WORD.has(w));
  /* every in-order subsequence of a company name's token initials, 3-5 long:
   * `UPC` for Union Pacific [Railroad] Company, `CFSI` for Community Financial
   * System Inc, `AIT` for Applied Industrial Technologies. A floor of three is
   * what keeps `GE` out of General Electric's initials. */
  function espInitials(words) {
    const out = new Set();
    const n = Math.min(words.length, 8);
    const rec = (i, acc) => {
      if (acc.length >= 3 && acc.length <= 5) out.add(acc);
      if (acc.length >= 5 || i >= n) return;
      for (let j = i; j < n; j++) rec(j + 1, acc + words[j][0]);
    };
    rec(0, "");
    return out;
  }
  const espRestIsCaption = (tokens, skip) => tokens.filter((w) => w !== skip)
    .every((w) => ESP_CAPTION_WORD.has(w) || ESP_FORM_WORD.has(w)
      || /^\d+$/.test(w) || w.length === 1);

  /** The index key for one sponsor name. Exported so the browser's index builder
   *  and arm II cannot normalise differently. */
  function sponsorNameKey(sponsorName) {
    return espContent(sponsorName).join(" ");
  }

  /** May this row publish the plan sponsor's own ticker?
   *  @param otherSponsors Map<sponsorNameKey, Set<ticker>> over the boot list, or
   *  a falsy value — in which case arm II is inert, which is the safe direction. */
  function employerStockSymbolOk(cleanedName, iss, sponsorName, ticker, publicName, otherSponsors) {
    const nameToks = espToks(cleanedName);
    const nt = nameToks.concat(espToks(iss));
    if (!nt.length) return true;                      // nothing to judge
    const tk = espNorm(ticker);
    let ok = false;
    /* (I) a content token of the company's name */
    const own = new Set(espContent(sponsorName).concat(espContent(publicName)));
    for (const w of nt) {
      if (w.length < 3) continue;
      if (own.has(w)) { ok = true; break; }
      let pref = false;
      for (const s of own) {
        if (w.length >= 4 && s.length >= 4 && (w.startsWith(s) || s.startsWith(w))) { pref = true; break; }
      }
      if (pref) { ok = true; break; }
    }
    /* (I) a SHORT FORM, but only where it is the WHOLE identification */
    if (!ok) {
      const ac = espInitials(espToks(sponsorName));
      for (const w of espInitials(espToks(publicName))) ac.add(w);
      const filed = espContent(sponsorName);
      for (const w of nt) {
        if (w.length < 2 || w.length > 5) continue;
        if (!espRestIsCaption(nameToks, w)) continue;
        if ((tk && w === tk) || ac.has(w)) { ok = true; break; }
        for (const s of filed) if (s.startsWith(w)) { ok = true; break; }
        if (ok) break;
      }
    }
    /* (I) a bare employer-stock caption identifies nothing and claims nothing */
    if (!ok && nameToks.length && espRestIsCaption(nameToks, null)) ok = true;
    if (!ok) return false;
    /* (II) ...and the name must not be ANOTHER listed company's */
    if (!otherSponsors || !otherSponsors.size) return true;
    const t = espContent(cleanedName);
    const max = Math.min(t.length, 6);
    for (let len = max; len >= 2; len--) {
      for (let i = 0; i + len <= t.length; i++) {
        const hit = otherSponsors.get(t.slice(i, i + len).join(" "));
        if (!hit) continue;
        return hit.has(String(ticker || ""));         // its own symbol: faithful
      }
    }
    return true;
  }

  window.__wampoEmployerStockSymbolOk = employerStockSymbolOk;  // read by the smoke test only
  window.__wampoSponsorNameKey = sponsorNameKey;  // read by the smoke test only
  const TRUST_MENU_MIN_FUNDS = 3;
  function trustScheduleDMenu(trust, hasOwnMenu, zeroEOY) {
    if (hasOwnMenu || zeroEOY) return null;
    const cct = trust && Array.isArray(trust.cct) ? trust.cct : [];
    if (cct.length < TRUST_MENU_MIN_FUNDS) return null;
    const rows = [];
    for (const x of cct) {
      const name = String((x && x.n) || "").replace(/\s+/g, " ").trim();
      const value = Number((x && x.v) || 0);
      if (name) rows.push({ name, value: value > 0 ? value : 0 });
    }
    if (rows.length < TRUST_MENU_MIN_FUNDS) return null;
    rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const total = rows.reduce((a, x) => a + x.value, 0);
    const assets = Number((trust && trust.assetsEOY) || 0);
    /* a share over 1 is rounding in the filing (one trust reports the list $2
     * above its own total), not a reason to withhold the list; clamp the CLAIM
     * at 100% rather than print an impossible number */
    const share = assets > 0 && total > 0 ? Math.min(1, total / assets) : null;
    return { rows, total, trustAssets: assets > 0 ? assets : 0, share };
  }

  window.__wampoTrustScheduleDMenu = trustScheduleDMenu;  // read by the smoke test only

  /* A SCHEDULE H PARTICIPANT-DIRECTION CAPTION IS NOT A HOLDING — the rule,
   * the Microsoft row that found it ($6,602,388,247 = 8.6% of a 50-row menu),
   * the positive tail vocabulary that refuses the 174-row BROKERAGE family by
   * construction, and the no-issuer gate that keeps the two rows whose
   * identity column names a real fund, are all in scripts/lib-disclose.mjs.
   * This is its twin. */
  const DIRECTION_CAPTION =
    /^(?:non-?\s?)?participant[-\s]?directed(?:\s+(?:investments?|accounts?|assets))?$/i;
  function isDirectionCaptionRow(name) {
    return DIRECTION_CAPTION.test(String(name || "").trim());
  }

  window.__wampoDirectionCaptionRow = isDirectionCaptionRow;  // read by the smoke test only

  /* AN AUDIT FIRM'S OFFICE LIST IS NOT A HOLDING — the whole seven-row
   * population, why TWO groups are required rather than one, and why the value
   * is left in place although it is not plan money, are all in
   * scripts/lib-disclose.mjs. This is its twin. */
  const OFFICE_GROUP = new RegExp(
    ",\\s*(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut" +
      "|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas" +
      "|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota" +
      "|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey" +
      "|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon" +
      "|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas" +
      "|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)" +
      "\\s+\\d{5}\\b",
    "gi");
  function isOfficeListRow(name) {
    const s = String(name || "");
    return (s.match(OFFICE_GROUP) || []).length >= 2;
  }

  window.__wampoOfficeListRow = isOfficeListRow;  // read by the smoke test only
  /* A BARE MATURITY DATE IS THE PARTICIPANT-LOAN ROW — the rule, the three
   * filings it was read in and the missing-sibling evidence are all in
   * scripts/lib-disclose.mjs; this is its twin. Anchored `^…$` on a name that
   * is nothing but a month and a year, so a target-date vintage cannot be
   * reached. TYPED, NOT DROPPED: the value is the loan balance and stays in
   * the denominator. */
  const BARE_MATURITY_DATE =
    /^[\s(,.-]*(?:\d{1,2}[\s,/-]*)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[\s,/-]*\d{1,4}[\s)\.,-]*$/i;
  function isLoanMaturityRow(name) {
    return BARE_MATURITY_DATE.test(String(name || "").trim());
  }

  window.__wampoLoanMaturityRow = isLoanMaturityRow;  // read by the smoke test only

  /* A ROW WHOSE WHOLE NAME IS A PAGE BREAK'S CAPTION — the twelve rows, why
   * the continuation word is NOT required (nine of the twelve carry none), the
   * Entergy master trust that no plan-keyed count could see, and the
   * whole-store measurement that the carry phrase occurs 10 times in 1,724,078
   * published rows are all in scripts/lib-disclose.mjs. This is its twin.
   * TYPED, NOT DROPPED: the value stays in the denominator. */
  function isPageBreakCaptionRow(name) {
    let s = String(name || "").trim();
    if (!s) return false;
    const m = PAGE_BREAK_LEAD.exec(s);
    if (m) {
      s = s.slice(m[0].length).replace(PAGE_BREAK_SEP, "").replace(PAGE_BREAK_REF, "")
        .replace(/^\s*\)?\s*$/, "").trim();
      if (!s) return true;
    }
    return CARRIED_FORWARD.test(s);
  }

  window.__wampoPageBreakCaptionRow = isPageBreakCaptionRow;  // read by the smoke test only
  window.__wampoLeadingHouse = leadingHouse;  // read by the smoke test only
  window.__wampoCleanFiledName = cleanFiledName;
  window.__wampoLoanRow = (n) => LOAN_ROW.test(String(n || "").trim());  // read by the smoke test only
  /* "does this string identify a fund at all?" — the identity probe
   * `isInvestmentContractRow` takes, injected for the same reason `priceOf` is:
   * lib-disclose has no dependency on fund-er.js. BOTH halves are needed and
   * that is measured, not belt-and-braces — `American Funds The Bond Fund of
   * America` resolves to no ticker and IS priced by name, so a ticker-only
   * probe would delete a real fund's published fee. `fundTickerInfo` is called
   * WITHOUT a type on purpose: the row's type is the thing in dispute, so it
   * cannot also be the evidence. Declared as a function so the generated twin
   * above can close over it whatever order the file is read in. */
  function namesAFund(n) { return fundER(n) != null || !!fundTickerInfo(n); }
  /* Misspellings of a fund HOUSE that appear in filed 4i schedules, each one
   * observed in the store rather than imagined, and each a transposition or
   * dropped letter in a house name — never a fund name, where a near-miss
   * could name the wrong fund. Used only by lookupTicker's last resort. */
  const HOUSE_MISSPELLINGS = [
    [/\bvangaurd\b/gi, "Vanguard"],
    [/\bvangard\b/gi, "Vanguard"],
    [/\bfidelty\b/gi, "Fidelity"],
    [/\bamercian\b/gi, "American"],
    [/\binvescoo\b/gi, "Invesco"],
  ];
  /* the repaired spelling, or null when no misspelling is present */
  function repairHouse(name) {
    const s = String(name || "");
    for (const [wrong, right] of HOUSE_MISSPELLINGS) {
      const rep = s.replace(wrong, right);
      if (rep !== s) return rep;
    }
    return null;
  }
  /* fundER with the same last-resort repair, and it is NOT optional garnish.
   * Repairing only the TICKER lookup published the fund's identity beside a
   * blank fee cell: the render of UMMS PN 005 showed all twelve rows gaining
   * VTWNX…VTINX while the expense-ratio column stayed "—", because the ER path
   * calls fundER(f.name) on the misspelled name. Reading the rendered page is
   * what caught it; the store-side measurement could not, because it only ever
   * asked fundTickerInfo. */
  function fundERFiled(name) {
    const direct = fundER(name);
    if (direct != null) return direct;
    const rep = repairHouse(name);
    return rep ? fundER(rep) : null;
  }
  /* THE FEE FOR ONE ROW, which until 2026-09-29 was `fundERFiled(f.name)` — the
   * cleaned name ALONE — while `lookupTicker` below has prepended the row's 4i
   * IDENTITY cell on every attempt since v67. A row whose house lives only in
   * that column therefore resolved a ticker and published a BLANK fee beside
   * it; Cardinal Services shows twelve clean Vanguard target-date tickers and
   * zero fees.
   *
   * STRICTLY ADDITIVE BY CONSTRUCTION: the issuer arm runs only once the bare
   * name has returned null, so a row that publishes a fee today publishes the
   * identical fee after. Measured whole-store before shipping — 59,521 rows
   * gained, 0 changed, 1 lost, and the one loss is not this arm at all: it is
   * the separate AF_LOAD_CLASS widening in fund-er.js, which withdraws exactly
   * one published cell (`AMERICAN BALANCED FUND A-CLASS`, 555 participants).
   * Replicated independently 2026-09-29: 59,521 rows and $171,674,834,061 to
   * the dollar, 0 gains at 0.35. This comment carried 59,526 / 0 lost, the
   * figure from before the A-CLASS arm was added — a measured number in a
   * comment has to be the number that shipped.
   *
   * The rule, its three gates and the whole safety argument live in
   * scripts/lib-disclose.mjs; this is the generated twin's call site. It takes
   * the bare fee TABLE and not `fundERFiled`, exactly as the annuity rule does:
   * the house-misspelling repair is a repair for a string believed to be a
   * fund's name, and two of the three gates ask about strings that are
   * explicitly not one. */
  function fundERRow(f) {
    const direct = fundERFiled(f.name);
    if (direct != null) return direct;
    return issuerPricedER(fundER, f.name, f.iss);
  }
  /* Ticker lookup order: the FILED name first (with and without the issuer),
   * the cleaned display name only as a fallback. Measured 2026-09-18 before
   * this order existed: looking up the cleaned name alone gained 37 tickers
   * but LOST 26 and FLIPPED 26 — "TROWEPRICE RET 2025 TR-F MUTUAL FUND SHARES"
   * is exact TRRHX as filed, and without its suffix the trailing "TR-F" reads
   * as a trust class and demotes it to a comparable. Raw-first means the strip
   * can only add. */
  function lookupTicker(f) {
    /* THE SYMBOL THE FILING PRINTS WINS, and it is the only thing in this
     * function that outranks `fund-er.js`.
     *
     * `VITSX - Vanguard Total Stock Market Index Inst.` published VTSAX, the
     * ADMIRAL class; `MWTSX - Metropolitan West Total Return Cl P` published
     * MWTIX, Class I; `MEIJX - MFS Value Fund Cl R4` published MEIKX, R6. The
     * filer typed the symbol of the exact share class the plan holds and we
     * answered with a different one — this record's own share-class defect with
     * the answer sitting in the filed text. 35 rows / 21 plans / 361,656
     * participants / $945,898,023 corrected, and 899 rows / 72 plans / 461,917
     * participants gain a symbol they had none for.
     *
     * It must run FIRST rather than last like `f.stk`, because the whole point
     * is that it CORRECTS a published answer; running it last would only ever
     * fill a blank and leave the 35 wrong. That is the one place a stored field
     * is allowed ahead of the hand table, and what licenses it is that the
     * claim is the FILING's and not ours.
     *
     * `ftk` is written by merge-4i from the SEC's own series/class file: the
     * symbol must LEAD the name, its registered series must share a word with
     * the remainder, and that word must be three letters or more. The rule, its
     * three conditions, its pinned table and a negative control per condition
     * are all in scripts/match-sec-tickers.mjs — there is no browser twin to
     * drift, because the predicate needs a 29,406-row index the page must never
     * download, so it is asked once at merge and the page only reads the field.
     *
     * FEE-NEUTRAL, which no other share-class fix on this record has been, and
     * it is MEASURED rather than argued: `fundERRow` is called on the NAME and
     * never on a symbol, and across all 2,166 rows the field reaches the fee
     * moves on 0 and 0 symbols are LOST.
     *
     * ONE ASTERISK DOES MOVE, where the comment first written here said none
     * could. `SSSYX STATE STREET EQUITY 500 INDEX FUND - CLASS K` resolved to
     * SSSYX as a labelled COMPARABLE and now asserts it — and that promotion is
     * correct: the SEC registers SSSYX as Class K of that fund, one of six
     * classes, and the filing states Class K and prints the symbol. The fee is
     * 0.02 on both sides of the `star ? info.er : fundERRow(f)` branch, so
     * nothing follows it. Recorded because this record's own rule is that a
     * guard which withdraws an assertion can also PROMOTE one, and a measured
     * number in a comment has to be the number that shipped.
     *
     * COST NAMED, 6 rows: `MVCKX ... CL R5` (4), `MFWLX ... R5` and `STRYX
     * Pioneer Strategic Income K Fund` print a symbol the SEC registers to a
     * different class than the name's own class word states. The filer wrote
     * both and they disagree; the symbol is the more precise of the two, so it
     * wins, and all 470 distinct gains plus all 16 corrections were read. */
    if (typeof f.ftk === "string" && f.ftk) return { tk: f.ftk, comparable: false };
    const raw = typeof f.nameRaw === "string" ? f.nameRaw : f.name;
    const iss = f.iss ? f.iss.replace(/\*+/g, "").trim() + " " : "";
    /* ONE EXCEPTION TO RAW-FIRST, and it is narrow on purpose. A trailing
     * column bar is OCR's reading of the share-class letter "I" (the strip
     * above repairs it, 743 plans / 683k ppl). On those rows the RAW name is
     * KNOWN CORRUPT: the bar is not part of any pattern, so the raw name
     * matches the BASE fund and publishes the investor class — TRBCX for a
     * row the filing calls Class I, whose answer is TBCIX, a cheaper share
     * class. The page then shows "Class I" as the name beside the investor
     * class's expense ratio. Raw-first still holds everywhere else, which is
     * what keeps "TROWEPRICE RET 2025 TR-F MUTUAL FUND SHARES" exact. */
    const order = /\s\|+\s*$/.test(raw) && raw !== f.name ? [f.name, raw] : [raw, f.name];
    /* THE ISSUER MAY ADD A MANAGER AND NEVER REPLACE ONE, 2026-09-30. That rule
     * reached `resolveHolding` (the SEC matcher, 2026-09-28) and
     * `issuerPricedER` (the fee, 2026-09-29) and never reached THIS path, which
     * has prepended the issuer since v67 and tries it FIRST — so a contradicting
     * issuer could not merely fill a blank, it could OVERRIDE a correct answer.
     *
     * 16 rows published a COMPETITOR'S fund as fact. `{Fidelity} Vanguard Total
     * Bond Market Institutional` resolved to FTBFX, Fidelity's own Total Bond
     * Fund — University of Miami's four plans (31,932 participants,
     * $52,478,012), Rochester Institute of Technology (8,365), Presbyterian
     * Health Plan (2,885) — and `{T. Rowe Price}` landed TRLGX, TRMCX, RPMGX,
     * PRFDX and OTCFX on JPMorgan, Putnam, MFS, Neuberger Berman, TIAA-CREF and
     * PIMCO holdings. All 16 read, not one right. Nine lose their ticker with
     * nothing to replace it, which is the accepted cost: a wrong number
     * outranks an absent one.
     *
     * THE ELEGANT FIX WAS WRITTEN AND KILLED BY THE WHOLE-STORE DIFF, which is
     * why this one carries a vocabulary. `issuerPricedER` is generic over its
     * resolver, so it can be reused verbatim with the ticker as its value — no
     * new words — and on a 15-case table it refused all ten wrong-house cases
     * and kept five legitimate ones. Whole-store it withdraws 3,470 rows that
     * are overwhelmingly CORRECT: `{State Street} S&P 500 Index` -> SSSYX,
     * `{Fidelity} S&P 500 Index` -> FXAIX. Its arm (2) drops the fund's first
     * load-bearing word and refuses when the answer is unchanged, which is right
     * for the FEE table and wrong for the TICKER table, because `State Street
     * 500 Index` still resolves. A PREDICATE THAT IS RIGHT FOR ONE CLASS IS NOT
     * THEREBY RIGHT FOR ITS NEIGHBOUR.
     *
     * So the test is a CONTRADICTION and not a repair: the issuer prefix is
     * refused only where the fund's own name already LEADS with a house and the
     * issuer leads with a DIFFERENT one. A house list is wrong in the unsafe
     * direction when used to find a second house INSIDE a name (`Vanguard
     * Wellington Admiral` carries its sub-adviser), so it is asked only of the
     * LEADING token on each side — and the blast radius is fully enumerated:
     * over all 535,864 rows carrying an issuer, 16 withdrawn, 2 changed,
     * 0 gained, 0 asterisks moved, 0 correct answers lost, every one of the 18
     * read. 17 entries / 17 plans / 52,838 participants / $78,246,497.
     *
     * BOTH CHANGES ARE CORRECTIONS, each verified against `sec-funds.json`
     * because a ticker is not a reading and the series is:
     * `{TIAA-Cref …} Vanguard Target Ret 2020 Inv` moves off VTINX, Target
     * Retirement INCOME, to VTWNX; `{Fidelity … J.P. Morgan} JPMORGAN MID CAP
     * GROWTH R6` moves off FTBFX to JMGMX, which the SEC registers as that
     * fund's Class R6.
     *
     * THIRTEEN FURTHER CORRECTIONS WERE MEASURED AND ARE DELIBERATELY NOT
     * TAKEN. Blocking a TRUSTEE prefix also let twelve `{Fidelity Management
     * Trust Company} T. Rowe Price Retirement <year> I Fund` rows move from the
     * base class to the -I Class the filing STATES, and TRBCX -> TBCIX twice.
     * Every one is right — and every one arrives by the same promotion that
     * gives Cleveland Clinic DODGX as fact, so they are refused with the 275.
     * REFUSING A REPAIR IS THE SAFE DIRECTION; they are recorded here so the
     * next reader knows the cost was counted rather than missed.
     *
     * REPORT path only — `build-seo-pages.mjs` never imports `fund-er.js`,
     * which is a guarantee rather than an observation. */
    const nameHouse = leadingHouse(f.name) || leadingHouse(raw);
    const issHouse = leadingHouse(f.iss);
    const issContradicts = !!nameHouse && !!issHouse && nameHouse !== issHouse;
    for (const n of order) {
      const issHit = iss ? fundTickerInfo(iss + n, f.type) : null;
      /* AND IT BLOCKS ONLY AN ASSERTION, which the whole-store diff is what
       * taught. A `comparable` answer is ALREADY labelled an approximation on
       * the page, so a contradicting issuer producing one is not publishing a
       * competitor's fund as fact — and refusing it does not withdraw a claim,
       * it PROMOTES the bare name's own answer out of that label. Measured on
       * the unnarrowed guard: 0 rows demoted and 275 rows / 68 entries /
       * 151,874 participants promoted from a labelled comparable to an
       * assertion, in the WRONG SHARE CLASS on the largest of them — Cleveland
       * Clinic's 81,999 participants would have been told `DODGE & COX STOCK
       * X A` is DODGX, which sec-funds.json registers as Class I where Class X
       * is DOXGX, and every `Vanguard Instl Target Ret <year> Instl` row would
       * have asserted the INVESTOR class. Larger in people than the 31 rows the
       * guard repairs, and in the unsafe direction. */
      const hit = (issHit && !(issContradicts && !issHit.comparable) ? issHit : null) || fundTickerInfo(n, f.type);
      if (hit) return hit;
      if (order[0] === order[1]) break;
    }
    /* LAST RESORT: the FILING ITSELF misspells the fund house, so no faithful
     * lookup can ever match. University of Maryland Medical System's PN 005
     * (23,496 participants) files "Vangaurd Target Retirement <year> Inv" on
     * TWELVE rows — $470,113,950, 65.2% of its menu — and every one shows a
     * blank fee cell. Read off the filing's own text layer, not OCR: it
     * contains "Vangaurd" 12 times and "Vanguard" zero times, so the typo is
     * the auditor's and our parse is faithful. That is why the repair belongs
     * HERE and not in the parser.
     *
     * Each misspelling is SPELLED OUT. A general edit-distance fallback would
     * be a licence to guess, and a guessed fund name reads as knowledge — the
     * standing rule that a blank is honest. This runs only after every
     * faithful attempt has failed, so it can only add, and the DISPLAYED name
     * stays exactly as filed; only the lookup is repaired.
     *
     * Measured whole-store 2026-09-26 against the v180 store: the condition is
     * 546 rows / 281 plans / 261,276 ppl; the OUTCOME — a ticker the reader
     * lacks today — is 326 rows / 158 plans / 150,335 ppl / $975,210,852 (287
     * exact, 39 comparable). The 220 rows that do NOT win are a table-coverage
     * gap wearing a misspelling's clothes: "Vangard Total International Bond
     * Index Fund Admiral Shares" resolves to nothing spelled correctly either.
     * Controlled on the same store, both directions: 0 flipped to a different
     * ticker, 0 lost a ticker they had, and all 1,719,837 rows the repair does
     * not touch came back unchanged. */
    const rep = repairHouse(raw);
    if (rep) {
      const hit = (iss ? fundTickerInfo(iss + rep, f.type) : null) || fundTickerInfo(rep, f.type);
      if (hit) return hit;
    }
    /* LAST OF ALL: the ticker the MERGE resolved from the SEC's own
     * series/class file and stored on the row. `fund-er.js` is a hand-written
     * pattern table and cannot finish the tail — measured 2026-09-28, 663,283
     * rows the FILING ITSELF types a registered mutual fund carry no ticker —
     * and `scripts/match-sec-tickers.mjs` names 147,835 of them EXACTLY
     * (29,979 plans / 43,455,784 participants / $297.2B).
     *
     * It runs LAST and only fills a blank, deliberately. On 3,844 rows the two
     * sources both name a fund exactly and name DIFFERENT ones — overwhelmingly
     * a share class the filing states and the pattern table ignores (`Fidelity
     * Total Bond K6` -> FTBFX where the K6 fund is FTKFX; `Vanguard 500 Index
     * Fund Investor Shares` -> VFIAX, the ADMIRAL class) — and every one of
     * those reads as the SEC being right. Overriding a published ticker is a
     * larger claim than filling a blank, so it is recorded with its numbers
     * and left to its own cycle; nothing here changes a value already shown.
     *
     * It carries NO FEE and cannot: `fundER` is called on the NAME
     * (app.js:1906/1919) and never on a ticker, so a row that gains a ticker
     * here still renders a blank expense ratio unless the name resolves. */
    if (typeof f.stk === "string" && f.stk) return { tk: f.stk, comparable: false };
    return null;
  }
  window.__wampoLookupTicker = lookupTicker;  // read by the smoke test only
  function cleanCostMarkers(e) {
    if (!e || !e.funds || e._nameClean) return e;
    e._nameClean = true;
    for (const f of e.funds) {
      if (typeof f.name === "string") {
        f.nameRaw = f.name.replace(/\s+(?:N\/R|\$?0\.00)$/i, "").trim();
        f.name = cleanFiledName(f.nameRaw);
      }
    }
    const keep = e.funds.filter((f) => !ID_ONLY.test(f.name || ""));
    if (keep.length !== e.funds.length) e.funds = keep;
    return e;
  }
  /* Per-plan fee schedule (Sch C provider table + Sch A commissions) lives in
   * data/fees shards, fetched on demand exactly like lineups. Fixed 64
   * shards, same ack hash. */
  const feeShardCache = new Map();
  // Peer context for the Sch H expense lines: per-participant percentiles by
  // plan-size cohort, computed across the whole universe in prep. Absence
  // just hides the comparison — never blocks the filed numbers.
  let feePctl = null, feePctlLoading = false;
  async function ensureFeePctl() {
    if (feePctl || feePctlLoading) return;
    feePctlLoading = true;
    try {
      const r = await fetch("fee-percentiles.json", { cache: "no-cache" });
      if (r.ok) { feePctl = await r.json(); render(); }
    } catch { /* comparison unavailable; filed numbers still shown */ }
  }
  function feePeerNote(plan, perHead, adminRaw) {
    if (!feePctl || !(plan.participants > 0)) return "";
    const c = feePctl.cohorts.find((x) => plan.participants >= x.min && (x.max == null || plan.participants < x.max));
    if (!c || !c.n) return "";
    if (perHead == null) {
      if (adminRaw > 0) return "";
      return `<p class="max-benefit">No administrative expenses were charged to plan assets in this filing —
        costs were either paid by the employer or netted inside fund expense ratios (the filing doesn't say which).
        ${(100 * c.zeroShare).toFixed(0)}% of plans with ${c.label} also report $0.</p>`;
    }
    // estimated share of peer plans charging LESS per participant
    let r;
    if (perHead <= c.p[0]) r = c.qs[0];
    else if (perHead >= c.p[c.p.length - 1]) r = c.qs[c.qs.length - 1];
    else {
      let i = 0;
      while (perHead > c.p[i + 1]) i++;
      const span = c.p[i + 1] - c.p[i];
      r = c.qs[i] + (span > 0 ? (perHead - c.p[i]) / span : 0) * (c.qs[i + 1] - c.qs[i]);
    }
    const cheaper = r <= 0.5;
    const pct = Math.round(100 * (cheaper ? 1 - r : r));
    return `<p class="max-benefit"><strong>${usd(perHead)} per participant is ${cheaper ? "lower" : "higher"} than
      ≈${pct}% of comparable plans</strong> (${c.label}; median ≈ ${usd(c.p[3])}/participant across ${c.n.toLocaleString()}
      filings). Peer figures compare the same Schedule H administrative-expense line; fund expense ratios are separate.</p>`;
  }
  async function ensureFees(plan) {
    ensureFeePctl();
    if (!plan || !plan.feeKey || plan.isSF || plan.feeSchedule !== undefined || plan.feeLoading) return;
    plan.feeLoading = true;
    try {
      const sid = String(shardOf(plan.feeKey, 64)).padStart(2, "0");
      if (!feeShardCache.has(sid)) {
        // a missing shard (pipeline hasn't produced fee data yet) must NOT
        // read as "this plan filed no providers" — null means the shard
        // exists and the plan isn't in it; unavailable hides the section
        feeShardCache.set(sid, fetch(`data/fees/${sid}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)));
      }
      const shard = await feeShardCache.get(sid);
      plan.feeSchedule = shard === null ? { unavailable: 1 } : shard[plan.feeKey] || null;
    } catch { plan.feeSchedule = undefined; }
    plan.feeLoading = false;
    render();
  }

  /* Per-plan filing detail (financial lines, dates, codes, acks) lives in
   * data/plans shards keyed "EIN|PN" — fetched on expand, then the lineup
   * and fee fetches chain off the acks it carries. */
  const detailShardCache = new Map();
  async function ensureDetail(plan) {
    if (!plan) return;
    if (plan.detailLoaded || plan.detailLoading || plan.dataStatus !== "filed") { ensureLineup(plan); return; }
    plan.detailLoading = true;
    try {
      const key = plan.einRaw + "|" + plan.pn;
      const sid = String(shardOf(key, 64)).padStart(2, "0");
      if (!detailShardCache.has(sid)) {
        detailShardCache.set(sid, fetch(`data/plans/${sid}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})));
      }
      const d = (await detailShardCache.get(sid))[key];
      if (d) {
        if (d.planName) plan.planName = titlePlanName(d.planName);
        plan.city = d.city || ""; plan.zip = d.zip || "";
        plan.planYear = d.planYear;
        plan.pyb = d.pyb || ""; plan.pye = d.pye || "";
        plan.filed = fmtFiledDate(d.filedDate);
        plan.codes = d.codes || "";
        plan.planTypes = planTypesFromCode(plan.codes || (plan.cf & 32 ? "2L" : "2J"));
        // assetsExact distinguishes the exact filed total from the boot
        // payload's display-precision one (assets ship in $100k units). Any
        // comparison AGAINST the plan total — the holdings-coverage note — must
        // require it: on a small plan, $100k of rounding alone can move the
        // ratio across a band boundary and make a correct table look short.
        if (d.assetsEOY) { plan.assetsB = d.assetsEOY / 1e9; plan.assetsExact = true; }
        // prep drops zero fields, so a missing assetsEOY on a filed detail
        // entry means Schedule H reported $0 year-end assets — a final or
        // transition-year filing of a plan that ended (terminated, merged,
        // or moved to a successor) during this plan year
        plan.zeroEOY = !d.assetsEOY;
        plan.assetsYoY = d.assetsBOY && d.assetsEOY ? +(((d.assetsEOY / d.assetsBOY) - 1) * 100).toFixed(1) : null;
        plan.activeParticipants = d.activeParticipants || 0;
        plan.partBalances = d.partBalances || 0;
        // same null semantics as mergePlan (prep omits zero fields)
        plan.flows = {
          benefitsM: d.benefitsPaid ? d.benefitsPaid / 1e6 : null,
          feeProfM: d.feeProf ? d.feeProf / 1e6 : null,
          feeAdminM: d.feeAdmin ? d.feeAdmin / 1e6 : null,
          feeInvM: d.feeInvMgmt ? d.feeInvMgmt / 1e6 : null,
          feeOtherM: d.feeOther ? d.feeOther / 1e6 : null,
          feeSalM: d.feeSal ? d.feeSal / 1e6 : null,
          adminRaw: d.adminExpenses || null,
          deferralsM: (d.contribParticipant || 0) / 1e6,
          employerM: (d.contribEmployer || 0) / 1e6,
          rolloversM: (d.rollovers || 0) / 1e6,
          adminM: (d.adminExpenses || 0) / 1e6,
          priorAssetsM: (d.assetsBOY || 0) / 1e6,
        };
        plan.source = `Form 5500, plan year ${d.planYear} (DOL EFAST2 public dataset)`;
        plan.feeKey = d.ack || null;
        plan.mtiaAck = d.mtiaAck || null;
        // the trust named on Schedule D when NO master-trust filing exists to
        // link to (Genentech -> Roche U.S. Retirement Plans Master Trust).
        // Naming it beats claiming we failed to read the schedule: the
        // schedule is one line and that line is the trust.
        plan.mtiaName = d.mtiaName || null;
        if (d.alias) plan.alias = d.alias;
        const b = plan.bits || 0;
        if ((b & 1) && d.ack) plan.lineupKey = d.ack;
        if ((b & 2048) && d.mtiaAck) plan.trustKey = d.mtiaAck;
        if ((b & 4) && d.ack) plan.featKey = d.ack;
        delete plan.avgBalPre; delete plan.avgContribPre; // exact components now present
        derive(plan);
        plan.detailLoaded = true;
      } else {
        plan.detailLoaded = true; // no entry: render the sparse row honestly
      }
    } catch { /* transient fetch failure — retried on next expand */ }
    plan.detailLoading = false;
    render();
    ensureLineup(plan);
  }

  /* THE SPONSOR'S EIN IS NOT A HOLDING.
   *
   * A 4i schedule's own header line carries the plan sponsor's EIN, and on
   * plenty of filings it is laid out so that the digits after the "NN-" prefix
   * sit where a value column belongs: "Plan Sponsor EIN: 23-" + "7268394".
   * The parser reads that as a $7,268,394 holding named "Plan Sponsor EIN: 23-".
   *
   * Measured 2026-08-24 over all 1,627,519 stored fund rows: 1,921 rows in
   * 1,802 lineups have a value exactly equal to their own sponsor's EIN (last
   * seven digits, or all nine) — $4,220,282,954 of money that does not exist.
   * 1,598 of those lineups are `confident`, i.e. shown to a reader as the
   * plan's fund lineup, carrying $2,989,639,761 of it; in 392 of them the
   * fabricated row is the LARGEST holding on the page. Every one of the 1,921
   * names was inspected for fund-shape: the 36 that matched a fund vocabulary
   * are plan names and header fragments ("BERGER CHEVROLET, INC. 401(K) PLAN &
   * TRUST 38-"), not funds. There are no true positives to lose.
   *
   * Coincidence is not a real risk: a specific seven-digit number appearing by
   * chance across 1.6M rows has an expectation near 0.2 rows, and we observe
   * 1,921. The ZIP-code variant of the same defect (address lines parsed as
   * values) is NOT filtered here — a five-digit ZIP collides with a plausible
   * small holding often enough to matter, and it is only $5.3M across 96
   * lineups. That one needs the parser, not a display guard.
   *
   * Applied to the plan's OWN entry only: a master trust files under a
   * different EIN, so the test does not transfer. */
  function dropFormNumberRows(lu, plan) {
    if (!lu || !lu.funds || !lu.funds.length || !plan || !plan.einRaw) return lu;
    const ein = String(plan.einRaw).padStart(9, "0");
    const t9 = +ein, t7 = +ein.slice(2);
    if (!t7) return lu;
    const funds = lu.funds.filter((f) => f.value !== t7 && f.value !== t9);
    return funds.length === lu.funds.length ? lu : { ...lu, funds };
  }

  async function ensureLineup(plan) {
    ensureFees(plan); // independent on-demand fetch; self-guarded, re-renders on arrival
    if (!plan || (!plan.lineupKey && !plan.trustKey && !plan.featKey) || plan.filedLineup ||
        plan.lineupLoading || plan.lineupTried || !state.shardCount) return;
    plan.lineupLoading = true;
    try {
      // A plan's own entry carries the audited-notes features (match formula,
      // vesting, loans, auto-enroll) even when its 4i schedule is NOT a usable
      // menu — a master-trust pointer, or a schedule that never parsed
      // confidently. Fetching it only when the lineup bit was set threw those
      // features away for 6,424 plans that had them stored, so Eaton showed
      // "the exact formula lives in the plan document / SPD" while its filing
      // states "a Company matching contribution of 50% of the first 6%".
      const ownKey = plan.lineupKey || plan.featKey;
      const lu = dropFormNumberRows(ownKey ? await fetchEntry(ownKey) : null, plan);
      // use the plan's own schedule unless it is missing or a POINTER at the
      // master trust — then the trust's real holdings win (or the honest gap).
      let ownUsable = !!(lu && lu.confident && lu.funds && lu.funds.length);
      let trustPointer = !!(lu && lu.trustPtr);
      if (ownUsable && plan.mtiaAck) {
        const tot = lu.funds.reduce((a, f) => a + f.value, 0) || 1;
        const mti = lu.funds.filter((f) => f.type === "Master trust interest" || /master trust/i.test((f.iss || "") + " " + f.name))
          .reduce((a, f) => a + f.value, 0);
        const top = Math.max(...lu.funds.map((f) => f.value));
        /* Two tests, and the second exists because the first is defeatable.
         * Harley-Davidson's 4i files "Interest Held in Master Trust" in column
         * (b) and "Various (includes Registered Investment Companies...)" in
         * column (c); the parser keeps (c), so the words "master trust" are in
         * the column it discarded and the name test sees an ordinary fund
         * worth $951M of $955M. A schedule of <=8 rows with one row >=60% of
         * the value is the parser's own trust-pointer shape, name-blind.
         * Measured over all 343 trust-linked plans with own confident
         * lineups: the shape test fires on 37, and a sample of 10 held zero
         * real menus — "At fair value" (Comcast), OCR cipher (Home Depot),
         * "Investments Held in the Trust" (United). This check also now runs
         * whenever a trust is LINKED (mtiaAck), not only when that trust
         * parsed confidently — a pointer at an unparsed trust is still not a
         * menu (Altria's $911M "Master Trust" row rendered as its top fund). */
        if (mti / tot > 0.5 || (lu.funds.length <= 8 && top / tot >= 0.6)) { ownUsable = false; trustPointer = true; }
      }
      if (!ownUsable && plan.trustKey) {
        const tlu = await fetchEntry(plan.trustKey);
        if (tlu && tlu.confident && tlu.funds && tlu.funds.length) {
          const tm = state.trusts[plan.trustKey];
          plan.filedLineup = { ...tlu, fromTrust: true,
            trustName: tm ? titlePlanName(tm.name) : "the plan's master trust",
            trustAssets: tm ? tm.assetsEOY : null,
            sisters: state.plans.filter((p) => p.mtiaAck === plan.trustKey).length,
            source: `master trust filing (${tlu.source || "Schedule H line 4i"})` };
        }
      }
      // a trust-POINTER page ("Interest in X Master Trust $8B") is never a
      // menu — when the trust's own filing isn't parsed, show the honest gap
      // rather than the pointer rows (Eaton showed 3 junk "funds" this way)
      if (!plan.filedLineup && !trustPointer && lu && lu.confident && lu.funds && lu.funds.length) plan.filedLineup = lu;
      if (lu && lu.features) {
        const ff = lu.features;
        plan.filedFeatures = ff;
        // features read from a PRIOR year's filing (the newest filing's public
        // copy is withdrawn from the EFAST2 bucket, or carries no readable
        // notes): a match formula can change between plan years, so the report
        // says which year it read. featFb marks the NOTES only — an entry's fb
        // marks the schedule, and the two can come from different filings.
        if (lu.featFb) plan.featuresFb = lu.featFb;
        // filed evidence overrides curated values (curated can be stale)
        if (ff.roth) plan.roth = true;
        if (ff.afterTax) plan.afterTax = true;
        if (ff.autoEnroll) {
          plan.autoEnroll = ff.autoEnroll === true ? "enrollment is automatic (per filing)" : ff.autoEnroll;
        }
        if (ff.vesting) {
          plan.vesting = ff.vesting;
          /* enrich a graded label with the rate stated in the quote. v88: the
           * extractor now also emits "N-year graded schedule" when the filing
           * states the horizon as well as the shape, so this test can no longer
           * be an exact match on "Graded schedule" — it would silently stop
           * firing on every row that gained a horizon. Keep the horizon when
           * there is one: "6-year graded — 20%/year" says both facts. */
          const isGraded = /^(?:\d-year )?[Gg]raded schedule$/.test(ff.vesting || "");
          const g = isGraded && ff.vestingText &&
            ff.vestingText.match(/(\d{1,2}) ?(?:percent|%) (?:per|a|each|for each) year/i);
          if (g) {
            const yr = (ff.vesting.match(/^(\d)-year/) || [])[1];
            plan.vesting = yr ? `${yr}-year graded — ${g[1]}%/year` : `Graded — ${g[1]}%/year`;
          }
        }
        // in-plan Roth conversion + after-tax contributions = mega backdoor Roth
        if (plan.megaBackdoor == null && ff.afterTax &&
            /in.?plan.{0,30}(roth )?(conversion|rollover)/i.test((ff.rothText || "") + " " + (ff.afterTaxText || ""))) {
          plan.megaBackdoor = true;
        }
        if (!plan.autoEscalate && ff.autoEscalate) plan.autoEscalate = ff.autoEscalate === true ? "Automatic annual increases (per filing)" : `${ff.autoEscalate} (per filing)`;
        if (ff.sdbaBrand) plan.brokerage = ff.sdbaBrand;
      }
      if (!plan.filedLineup) plan.hasLineup = false;
      if (!plan.filedLineup && !plan.filedFeatures) { plan.lineupKey = null; plan.trustKey = null; plan.featKey = null; }
      plan.lineupTried = true; // a thrown fetch skips this, so failures still retry
    } catch { /* leave the loading note; a retry happens on next expand */ }
    plan.lineupLoading = false;
    render();
  }

  /* ---- filtering / sorting ----------------------------------------------- */

  // Brand → legal-filing-name aliases: what people type vs what sponsors file as.
  const BRAND_ALIASES = {
    "p&g": "procter", "pg": "procter", "jnj": "johnson & johnson", "j&j": "johnson & johnson",
    "gm": "general motors", "chase": "jpmorgan", "citi": "citigroup", "amex": "american express",
    "coke": "coca-cola", "frito": "pepsico", "frito-lay": "pepsico", "frito lay": "pepsico",
    "google": "google", "youtube": "google", "waymo": "google", "alphabet": "google",
    "instagram": "meta platforms", "whatsapp": "meta platforms", "facebook": "meta platforms",
    "aws": "amazon", "xbox": "microsoft", "kfc": "yum brands", "taco bell": "yum brands",
    "pizza hut": "yum brands", "olive garden": "darden", "ben & jerry": "unilever",
    "band-aid": "johnson & johnson", "usps": "postal service", "mass mutual": "massachusetts mutual",
    "massmutual": "massachusetts mutual", "usaa": "united services automobile",
    "raytheon": "rtx", "exxon": "exxon mobil", "esso": "exxon mobil",
  };

  /* PUBLIC-COMPANY NAMES. A Form 5500 is filed by a legal entity, which is
   * often not the name anyone knows the company by: GE Vernova's plan is filed
   * by "Ropcor, Inc.", Alphabet's by "Google LLC". Searching GEV already
   * returned that plan ranked first — it just said "Ropcor, Inc.", so it read
   * as a miss.
   *
   * scripts/companies.json carries the public name and is a BUILD-time file the
   * browser never sees; the boot payload ships only the ticker. Embedding the
   * map here fixes the display against data already published, with no pipeline
   * run. It is small (~109 entries) and changes only when the curated list
   * does. */
  const TICKER_NAME = {"AAL": "American Airlines", "AAPL": "Apple", "ABBV": "AbbVie", "ABT": "Abbott", "ACN": "Accenture", "ADBE": "Adobe", "ADI": "Analog Devices", "ADP": "ADP", "ALL": "Allstate", "AMAT": "Applied Materials", "AMD": "AMD", "AMGN": "Amgen", "AMTM": "Amentum", "AMZN": "Amazon", "ARMK": "Aramark", "AVGO": "Broadcom", "AXP": "American Express", "BA": "Boeing", "BAC": "Bank of America", "BBY": "Best Buy", "BKNG": "Booking Holdings", "BLK": "BlackRock", "BMY": "Bristol Myers Squibb", "BRK.B": "Berkshire Hathaway", "BX": "Blackstone", "C": "Citigroup", "CAT": "Caterpillar", "CB": "Chubb", "CBRE": "CBRE", "CI": "Cigna", "CMCSA": "Comcast", "CME": "CME Group", "CMI": "Cummins", "CNXC": "Concentrix", "COP": "ConocoPhillips", "COST": "Costco", "CRM": "Salesforce", "CSCO": "Cisco", "CVX": "Chevron", "DDS": "Dillards", "DE": "John Deere", "DGX": "Quest Diagnostics", "DIS": "Disney", "DUK": "Duke Energy", "ELV": "Elevance Health", "ENSG": "Ensign Group", "EQIX": "Equinix", "ETN": "Eaton", "F": "Ford", "FDX": "FedEx", "GAP": "Gap", "GE": "GE Aerospace", "GEV": "GE Vernova", "GILD": "Gilead Sciences", "GM": "General Motors", "GOOGL": "Alphabet (Google)", "GS": "Goldman Sachs", "HD": "Home Depot", "HON": "Honeywell", "IBM": "IBM", "ICE": "Intercontinental Exchange", "INTC": "Intel", "INTU": "Intuit", "ISRG": "Intuitive Surgical", "JNJ": "Johnson & Johnson", "JPM": "JPMorgan Chase", "KLAC": "KLA", "KO": "Coca-Cola", "LIN": "Linde", "LLY": "Eli Lilly", "LMT": "Lockheed Martin", "LOW": "Lowe's", "LRCX": "Lam Research", "MA": "Mastercard", "MCD": "McDonald's", "MDLZ": "Mondelez", "MDT": "Medtronic", "META": "Meta", "MMC": "Marsh McLennan", "MMS": "Maximus", "MO": "Altria", "MRK": "Merck", "MS": "Morgan Stanley", "MSFT": "Microsoft", "MU": "Micron", "NEE": "NextEra Energy", "NFLX": "Netflix", "NKE": "Nike", "NOW": "ServiceNow", "NVDA": "NVIDIA", "ORCL": "Oracle", "PANW": "Palo Alto Networks", "PEP": "PepsiCo", "PFE": "Pfizer", "PG": "Procter & Gamble", "PLD": "Prologis", "PM": "Philip Morris", "PYPL": "PayPal", "QCOM": "Qualcomm", "REGN": "Regeneron", "RTX": "RTX (Raytheon)", "SBUX": "Starbucks", "SCHW": "Charles Schwab", "SO": "Southern Company", "SPGI": "S&P Global", "SYK": "Stryker", "T": "AT&T", "TAK": "Takeda", "TJX": "TJX", "TM": "Toyota", "TMO": "Thermo Fisher", "TRV": "Travelers", "TSLA": "Tesla", "TXN": "Texas Instruments", "UBER": "Uber", "UBS": "UBS", "UNH": "UnitedHealth Group", "UNP": "Union Pacific", "UPS": "UPS", "V": "Visa", "VRTX": "Vertex Pharmaceuticals", "VZ": "Verizon", "WFC": "Wells Fargo", "WM": "Waste Management", "WMT": "Walmart", "WPP": "WPP", "XOM": "ExxonMobil", "ZTS": "Zoetis"};

  function publicName(plan) {
    const n = plan.ticker && TICKER_NAME[plan.ticker];
    return n && n.toLowerCase() !== (plan.company || "").toLowerCase() ? n : null;
  }

  /* EVERY LISTED COMPANY WE CAN NAME, FROM A FILE THE PAGE ALREADY DOWNLOADS.
   * `employerStockSymbolOk`'s contradiction arm asks whether a holding row
   * names a DIFFERENT listed company, and this is the index it asks: the boot
   * payload's own (sponsor name, ticker) pairs, keyed by `sponsorNameKey` so
   * the builder and the lookup cannot normalise differently. Only
   * ticker-bearing sponsors are indexed — an unlisted employer's name cannot
   * be the wrong answer to "whose stock is this" — and only keys of two or more
   * content words, because a one-word key is a prefix of too much of the world
   * (the `match-sponsors.mjs` measurement that cost Banner Health and Citizens
   * Financial their matches). 1,190 keys over the live list.
   * Memoized: built on the first expanded plan that has an employer-stock row,
   * never at boot. */
  let _sponsorTickers = null;
  function sponsorTickerIndex() {
    if (_sponsorTickers) return _sponsorTickers;
    _sponsorTickers = new Map();
    for (const p of (state.plans || [])) {
      if (!p.ticker) continue;
      const k = sponsorNameKey(p.sponsorName || "");
      if (!k || k.indexOf(" ") < 0) continue;
      const set = _sponsorTickers.get(k);
      if (set) set.add(p.ticker); else _sponsorTickers.set(k, new Set([p.ticker]));
    }
    return _sponsorTickers;
  }

  // full state names -> postal codes, so "florida" and "fl" both select the
  // state. A bare code or full name is an EXCLUSIVE state filter: the old
  // behavior OR'd the code against the text search, so "fl" returned Florida
  // plus every "Flowers Foods" in the country.
  const US_STATES = { alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca", colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga", hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia", kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md", massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms", missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv", "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny", "north carolina": "nc", "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or", pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc", "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt", virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi", wyoming: "wy", "district of columbia": "dc", "puerto rico": "pr" };
  const STATE_CODES = new Set(Object.values(US_STATES));
  function stateFromQuery(q) {
    if (US_STATES[q]) return US_STATES[q];
    if (q.length === 2 && STATE_CODES.has(q)) return q;
    return null;
  }

  function matchesQuery(plan, q) {
    if (!q) return true;
    // "fl" / "florida" selects the state and nothing else
    const sc = stateFromQuery(q);
    if (sc) return (plan.state || "").toLowerCase() === sc;
    if (!plan.hay) {
      plan.hay = (plan.company + " " + (publicName(plan) || "") + " " + plan.ticker + " " + (plan.provider || "") + " " + plan.planName +
        " " + (plan.alias || "") + // former sponsor / plan names (line 4, older filings)
        " " + plan.planTypes.join(" ") + " " + (plan.city || "") + " " + (plan.state || "") + " " + (plan.ein || "")).toLowerCase();
      plan.hayNorm = plan.hay.replace(/[^a-z0-9]/g, "");
    }
    if (plan.hay.includes(q)) return true;
    // punctuation/space-insensitive: "fed ex" → fedex, "at&t" → att
    const qNorm = q.replace(/[^a-z0-9]/g, "");
    if (qNorm.length >= 3 && plan.hayNorm.includes(qNorm)) return true;
    // brand alias: "p&g" → procter
    const alias = BRAND_ALIASES[q] || BRAND_ALIASES[qNorm];
    if (alias && plan.hay.includes(alias)) return true;
    return false;
  }

  function passesFilters(plan) {
    const f = state.filters;
    if (f.brokerage && !(plan.brokerage && plan.brokerage !== "None")) return false;
    // after-tax contributions are the gate for the mega backdoor; audit notes
    // rarely spell out the conversion step, so the chip matches either signal
    if (f.megaBackdoor && !(plan.megaBackdoor || plan.afterTax === true)) return false;
    if (f.immediateVesting && plan.vesting !== "Immediate") return false;
    // Short-form (5500-SF) filers are exempt from attaching an audited
    // financial statement, so they can never carry a fund lineup, fee
    // schedule or plan-feature detail — 42,389 of the 110,555 plans. This
    // chip drops them so a search returns only plans with filed detail.
    if (f.fullFiling && (plan.cf & 8)) return false;
    if (state.provider && plan.provider !== state.provider) return false;
    if (state.industry && plan.industry !== state.industry) return false;
    if (state.planType && !(plan.planTypes || []).includes(state.planType)) return false;
    if (state.matchType && !(plan.matchTypes || []).includes(state.matchType)) return false;
    return true;
  }

  // relevance tier for an active search: 0 = the company the user named
  // (exact/word-prefix sponsor name, or exact ticker), 1 = name starts with
  // the query mid-word ("Eatontown"), 2 = substring/other-field match
  // ("Wheaton College"). Sorting applies tiers first so "eaton" can never
  // rank Wheaton above Eaton Corporation under ANY column sort.
  function searchRank(plan, q) {
    if ((plan.ticker || "").toLowerCase() === q) return 0;
    const pub = (publicName(plan) || "").toLowerCase();
    if (pub && (pub === q || pub.startsWith(q + " "))) return 0;
    const name = (plan.company || "").toLowerCase();
    const i = name.indexOf(q);
    if (i < 0) return 2;
    const before = i === 0 || /[^a-z0-9]/.test(name[i - 1]);
    const after = i + q.length >= name.length || /[^a-z0-9]/.test(name[i + q.length]);
    if (i === 0 && after) return 0;   // "eaton" → "Eaton Corporation"
    if (before && after) return 0;    // "chase" → "JPMorgan Chase & Co"
    if (before) return 1;             // prefix of a longer word: "Eatontown"
    return 2;                         // mid-word: "Wheaton"
  }

  function visiblePlans() {
    const q = state.query.trim().toLowerCase();
    const stateQ = !!stateFromQuery(q); // relevance tiers are meaningless for a state filter
    const out = [];
    for (const p of state.plans) {
      // a dot clicked on the map narrows the table to that dot's plans
      if (state.dotPick && !state.dotPick.has(p.id)) continue;
      if (!matchesQuery(p, q) || !passesFilters(p)) continue;
      p.rank = q && !stateQ ? searchRank(p, q) : 0;
      out.push(p);
    }
    const { key, dir } = state.tableSort;
    out.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (key === "company") return a.company.localeCompare(b.company) * -dir;
      const va = key === "assets" ? a.assetsB : key === "participants" ? a.participants : a[key];
      const vb = key === "assets" ? b.assetsB : key === "participants" ? b.participants : b[key];
      return ((vb || 0) - (va || 0)) * -dir;
    });
    return out;
  }

  /* ---- report pieces (detail view) ---------------------------------------- */

  function pill(on, label) {
    if (on == null) return "";
    return `<span class="pill ${on ? "pill-on" : "pill-off"}">${on ? "✓" : "✗"} ${label}</span>`;
  }

  function vestingBar(vest) {
    if (!vest.schedule) {
      return `
      <p class="vest-label">VESTING — ${esc(vest.label)}</p>
      <p class="vest-immediate">■ Immediately vested — no waiting period</p>
      <p class="vest-note">${esc(vest.note)}</p>`;
    }
    const cells = vest.schedule.map((pct, i) => `
      <div class="vest-cell">
        <div class="vest-fill ${pct === 100 ? "vest-full" : pct > 0 ? "vest-part" : ""}"
             ${pct > 0 && pct < 100 ? `style="background:linear-gradient(to right, var(--good) ${pct}%, var(--grid) ${pct}%)"` : ""}>${pct}%</div>
        <div class="vest-year">Yr ${i + 1}</div>
      </div>`).join("");
    return `
      <p class="vest-label">VESTING — ${esc(vest.label)}</p>
      <div class="vest-row">${cells}</div>
      <p class="vest-note">${esc(vest.note)}</p>`;
  }

  function contributionCard(c, plan) {
    // Schedule H 2a(1)(A) is ALL employer money — match plus profit sharing,
    // prevailing-wage QNECs, safe harbor. Labelling it "total" inside a card
    // headed "Employer Match" read as the match total: R.H. White's $3.2M is
    // $2.09M of prevailing-wage QNECs plus ~$1.08M of match.
    const total = plan.flows.employerM != null
      ? `${plan.planYear} employer contributions: <strong>${money(plan.flows.employerM)}</strong>` : "";
    return `
    <div class="contrib-card">
      <div class="contrib-head">
        <span class="contrib-title">${esc(c.title)}</span>
        <span class="badge ${c.kind === "ELECTIVE" ? "badge-blue" : "badge-green"}">${c.kind}</span>
        <span class="contrib-total">${total}</span>
      </div>
      <blockquote class="quote">${esc(c.formula)}</blockquote>
      <p class="max-benefit">Maximum benefit: <strong>${esc(c.maxBenefit)}</strong></p>
      ${vestingBar(c.vest)}
      <p class="contrib-note">ⓘ ${esc(c.note)}</p>
    </div>`;
  }

  /* Schedule R line 21b is the only STRUCTURED safe-harbor disclosure in the
   * filing: how the plan satisfies §401(k) nondiscrimination. "ADP-tested"
   * is an affirmative answer that the plan is NOT a safe-harbor design. */
  function schRLine(plan) {
    const s = plan.shr || "";
    const notesSH = !!(plan.filedFeatures && plan.filedFeatures.safeHarbor);
    if (s.includes("D")) return `<p class="max-benefit">Nondiscrimination: <strong>design-based safe harbor</strong> — Schedule R (line 21b) reports the plan satisfies §401(k) testing by design (safe harbor or QACA).</p>`;
    // a plan can be safe harbor for one employee group and ADP-tested for
    // another (the instructions' disaggregation example) — when the audited
    // notes describe a safe-harbor contribution, don't let the ADP box read
    // as a contradiction
    if (s.includes("A")) return notesSH
      ? `<p class="max-benefit">Nondiscrimination: Schedule R (line 21b) reports <strong>ADP testing</strong> while the audited notes describe a safe-harbor contribution — plans can be safe harbor for one employee group and tested for another.</p>`
      : `<p class="max-benefit">Nondiscrimination: <strong>ADP-tested</strong> — Schedule R (line 21b) reports annual ADP testing, meaning not a safe-harbor design.</p>`;
    if (s.includes("N")) return `<p class="max-benefit">Nondiscrimination: Schedule R (line 21b) reports §401(k) testing <strong>not applicable</strong> to this plan.</p>`;
    return "";
  }

  function filedContributionCard(plan) {
    const ff = plan.filedFeatures;
    /* A MULTIPLE-EMPLOYER or POOLED EMPLOYER PLAN has no single plan design.
     * Each participating employer adopts its own match, vesting and
     * eligibility; the audited notes describe one arrangement, or describe the
     * range, and wampo renders whatever it extracted as though it were the
     * plan's. Measured 2026-08-24: 289 plans self-identify as pooled or
     * multiple-employer by name and 111 of them carry an asserted match
     * formula -- "EQUITY HR, INC. 401(K) MULTIPLE EMPLOYER PLAN" is shown
     * "100% of the first 4% of pay", which is at best one employer's terms
     * presented as everyone's.
     *
     * The name is a proxy. The Form 5500 entity-type field is the real signal
     * and build-data.mjs does not ingest it (it reads TYPE_DFE_PLAN_ENTITY_CD
     * only to spot master trusts), so this matches only unambiguous markers --
     * "multiple employer plan", "pooled employer plan", MEP, PEP -- and says
     * the terms may differ rather than suppressing them. */
    const pooledPlan = /\bmultiple[- ]employer plan\b|\bpooled employer plan\b|\bMEP\b|\bPEP\b/i
      .test(plan.planName || "");
    /* A match quote is only evidence of a match, and the test differs by the
     * job the quote is doing. THE RULE LIVES IN scripts/lib-quote.mjs; this is
     * the browser copy, and scripts/smoke-test.mjs asserts the two agree on
     * docs/quote-guard-cases.json. Do not edit one without the other -- the
     * previous version of this rule existed only here, so the static page
     * generator never had it and published "Match formula, as filed" over a
     * sentence with no number in it on 269 of 5,000 pages.
     *
     * Suppressed rather than hedged: a quote with no formula in it cannot be
     * made true by a caveat. Where nothing survives, the card says so, which is
     * the same three-state honesty the vesting line below already uses. */
    const matchQuote = matchQuoteOk(ff.matchText, !!ff.match) ? quoteTrim(ff.matchText) : null;
    /* Same disease on the vesting line, same treatment. `vestingText` is picked
     * by proximity to vesting language, so 41 plans / 226,729 participants
     * publish a sentence stating some OTHER rule under "Employer-money
     * vesting": Charter Communications a loan limit (120,688 ppl), PSEG a
     * withdrawal-suspension rule, Vensure raw Form 5500 table text whose only
     * vest-word is inside VESTED METALS INTERNATIONAL LLC. All 41 publish the
     * quote with NO label above it, so the quote IS the whole answer, and
     * withholding falls back to the honest "not stated in the audited notes"
     * line below. The graded-label enrichment above reads vestingText too and
     * is deliberately NOT gated: it only runs when a graded label exists, and
     * the measurement says 0 of the 41 carry one. */
    const vestingQuote = vestingQuoteOk(ff.vestingText) ? quoteTrim(ff.vestingText) : null;
    // Schedule H 2a(1)(A) is ALL employer money — match plus profit sharing,
    // prevailing-wage QNECs, safe harbor. Labelling it "total" inside a card
    // headed "Employer Match" read as the match total: R.H. White's $3.2M is
    // $2.09M of prevailing-wage QNECs plus ~$1.08M of match.
    const total = plan.flows.employerM != null
      ? `${plan.planYear} employer contributions: <strong>${money(plan.flows.employerM)}</strong>` : "";
    return `
    <div class="contrib-card">
      <div class="contrib-head">
        <span class="contrib-title">Employer Match</span>
        <span class="badge badge-green">FORM 5500 AUDIT NOTES</span>
        <span class="contrib-total">${total}</span>
      </div>
      ${pooledPlan ? `<p class="max-benefit"><strong>This is a multiple-employer plan.</strong> Each participating employer adopts its own terms, so any formula below is what the audited notes describe — it may not be the arrangement that applies to a particular employer's staff.</p>` : ""}
      ${frozenClaimOk(ff.frozen, ff.frozenText, plan.sponsorName) ? `<p class="max-benefit"><strong>⚠ Plan frozen or terminated</strong> — the filing states contributions have been discontinued; details below describe the plan as it operated.</p>${ff.frozenText ? `<blockquote class="quote">“${esc(ff.frozenText)}”</blockquote>` : ""}` : ""}
      ${ff.match ? `<p class="max-benefit">Formula: <strong>${esc(ff.match)}</strong>${ff.safeHarbor === "match" ? " · safe harbor" : ""}${ff.trueUp ? " · with annual true-up" : ""}${/discretionary/i.test(ff.match) && plan.flows.employerM === 0 ? " · <strong>none made this plan year</strong>" : ""}</p>` : ""}
      ${matchQuote ? `<blockquote class="quote">“${esc(matchQuote)}”</blockquote>` : ""}
      ${!ff.match && !matchQuote ? `<p class="max-benefit">Employer match: <span class="feat-unknown">no formula stated in the audited notes</span> — check the plan's SPD.</p>` : ""}
      ${ff.nec ? `<p class="max-benefit">Employer nonelective contribution: <strong>${esc(ff.nec)}</strong>${ff.safeHarbor === "nonelective" ? " · safe harbor" : ""}</p>` : ""}
      ${ff.necText ? `<blockquote class="quote">“${esc(ff.necText)}”</blockquote>` : ""}
      ${schRLine(plan)}
      ${ff.vesting ? `<p class="max-benefit">Employer-money vesting: <strong>${esc(ff.vesting)}</strong></p>` : ""}
      ${vestingQuote ? `<blockquote class="quote">“${esc(vestingQuote)}”</blockquote>` : ""}
      ${!ff.vesting && !vestingQuote ? (
        ff.safeHarbor && !/QACA|qualified automatic/i.test((ff.matchText || "") + (ff.necText || ""))
          ? `<p class="max-benefit">Employer-money vesting: <strong>immediate for the safe-harbor contribution</strong> — required by law (IRC §401(k)(12)); the audited notes don't state a schedule for any other employer money.</p>`
          : `<p class="max-benefit">Employer-money vesting: <span class="feat-unknown">not stated in the audited notes</span> — check the plan's SPD.</p>`) : ""}
      <p class="contrib-note">ⓘ Quoted from the audited financial statements attached to this plan's Form 5500 filing.</p>
    </div>`;
  }

  function unknownContributionCard(plan) {
    // Schedule H/SF reports the actual dollars — $0 is an ANSWER, not a gap
    if (plan.flows.employerM === 0) {
      const fz = plan.filedFeatures && plan.filedFeatures.frozen;
      return `
      <div class="contrib-card">
        <div class="contrib-head">
          <span class="contrib-title">Employer Contributions</span>
          <span class="badge badge-gray">NONE FILED — FORM 5500</span>
        </div>
        <p class="max-benefit">The employer contributed <strong>$0</strong> in plan year ${plan.planYear} per the
        filing — no match or nonelective contribution was made this year.</p>
        ${schRLine(plan)}
        ${fz ? `<p class="max-benefit"><strong>⚠ Plan frozen or terminated</strong> — the filing states contributions have been discontinued.</p>${plan.filedFeatures.frozenText ? `<blockquote class="quote">“${esc(plan.filedFeatures.frozenText)}”</blockquote>` : ""}` : ""}
      </div>`;
    }
    const filedLine = plan.flows.employerM != null
      ? `The employer contributed <strong>${money(plan.flows.employerM)}</strong> in plan year ${plan.planYear} (Form 5500).`
      : "";
    if (plan.isSF) {
      /* The 401(m) card below is unreachable from here, so state the filed
       * fact in place rather than leaving 5.5M participants with only the
       * list of things the DOL does not collect. Code 2K is on the FORM
       * (line 8a), not in the attachment, so it exists for short-form filers
       * by law — 36,183 of the 43,523 SF filings carry it. */
      return `
      <div class="contrib-card">
        <div class="contrib-head">
          <span class="contrib-title">Employer Contributions</span>
          <span class="badge badge-gray">SHORT-FORM FILING</span>
        </div>
        <p class="max-benefit">${filedLine}
        ${plan.matchCode
          ? `The filing reports a <strong>401(m) arrangement (code 2K)</strong> — employer matching
             contributions and/or after-tax employee contributions. That much is stated on the form itself.`
          : `This filing's characteristic codes don't report a 401(m) arrangement (code 2K), which covers
             employer matching and after-tax employee contributions.`}
        This plan files the short Form 5500-SF, which carries no audited attachment — the DOL
        doesn't collect the match formula, vesting schedule, or fund lineup for it.
        Know this plan? <a href="https://github.com/evwes/no-app/issues">Add it</a>.</p>
      </div>`;
    }
    if (plan.matchCode) {
      return `
      <div class="contrib-card">
        <div class="contrib-head">
          <span class="contrib-title">Employer Match</span>
          <span class="badge badge-green">401(m) MATCH / AFTER-TAX — FORM 5500</span>
        </div>
        <p class="max-benefit">${filedLine}
        The filing reports a 401(m) arrangement (code 2K) — employer matching contributions
        and/or after-tax employee contributions. The exact formula lives in the plan document / SPD.
        Know it? <a href="https://github.com/evwes/no-app/issues">Add it</a>.</p>
        ${schRLine(plan)}
      </div>`;
    }
    return `
    <div class="contrib-card">
      <div class="contrib-head">
        <span class="contrib-title">Employer Contributions</span>
        <span class="badge badge-gray">FORMULA NOT YET VERIFIED</span>
      </div>
      <p class="max-benefit">${filedLine}
      This filing's characteristic codes don't report a deferral-based match, and the formula
      isn't published on Form 5500 — it lives in the plan document / SPD.
      Know this plan? <a href="https://github.com/evwes/no-app/issues">Add it</a>.</p>
      ${schRLine(plan)}
    </div>`;
  }

  /* Three kinds of "missing" deserve three different labels: the DOL never
   * collects it (short-form filers), the filing was parsed but the auditor
   * didn't state it, or the attachment couldn't be read at all.
   *
   * FOUR, and the fourth was being told the third one's sentence, which is
   * false (2026-09-27). A plan whose 4i schedule we READ and PUBLISHED but
   * whose filing yielded no features at all has no `filedFeatures`, so it fell
   * through to "filing attachment absent or unreadable" — printed three times
   * on the same page as "FUND HOLDINGS — 28 FILED · Schedule H line 4i
   * attachment". Verified by rendering: Dollar General (201,691 participants)
   * and IBEW Local 60 (4,544) both say it above their own filed menus.
   * The census's B1 bucket is exactly this population: 1,084 plans /
   * 1,196,101 participants, every one of them told the attachment could not be
   * read while its holdings are listed underneath.
   * A RANDOM 60 of the 1,050 whose own newest filing supplied the schedule
   * (seed 20260927) says the truth is split and we do not record which: 35
   * publish the form and the schedule only, 12 add the auditor's opinion
   * letter with the financial statements withheld, 12 do publish note prose
   * that simply never states this feature (1 withdrawn, 403). So the honest
   * sentence names both possibilities rather than asserting the one we cannot
   * tell apart — recording which would need a parse-time flag, and until that
   * exists the page must not pick. Excludes a lineup served from a PRIOR YEAR
   * (`fb`) or from the master TRUST (`fromTrust`): for those the newest
   * attachment really was unreadable or belongs to another filer, and the old
   * sentence is the true one. */
  function whyUnknown(plan) {
    if (plan.isSF) return "Not collected — DOL short-form filing";
    if (plan.filedFeatures) return "Not stated in the audited notes";
    if (plan.filedLineup && !plan.filedLineup.fromTrust && !plan.filedLineup.fb)
      return "Not stated — this filing's audit notes are absent or silent on it";
    return "Not stated — filing attachment absent or unreadable";
  }

  function taxRow(label, on, blurb, why) {
    if (on == null) return `<div class="feat-row"><span>${esc(label)}</span><span class="feat-unknown">— ${esc(why || "Not yet verified")}</span></div>`;
    if (!on) return `<div class="feat-row"><span>${esc(label)}</span><span class="feat-off">✗ Not offered</span></div>`;
    return `
    <div class="feat-block">
      <div class="feat-row"><span>${esc(label)}</span><span class="feat-on">✓ Available</span></div>
      ${blurb ? `<div class="feat-blurb">${esc(blurb)}</div>` : ""}
    </div>`;
  }

  function featuresPanel(plan) {
    const rows = [];
    rows.push(`<div class="feat-row"><span>Auto-Enroll</span>${plan.autoEnroll
      ? `<span class="feat-on">✓ Yes — ${esc(plan.autoEnroll)}</span>`
      : plan.pretax != null ? `<span class="feat-off">✗ No</span>` : `<span class="feat-unknown">— Not yet verified</span>`}</div>`);
    if (plan.autoEscalate) {
      rows.push(`<div class="feat-block"><div class="feat-row"><span>Auto-Escalate</span><span class="feat-on">✓ Yes</span></div>
        <div class="feat-blurb">${esc(plan.autoEscalate)}</div></div>`);
    }
    const why = whyUnknown(plan);
    rows.push(taxRow("Pre-Tax (Traditional)", plan.pretax,
      "Contributions reduce current taxable income. Taxes paid upon withdrawal in retirement.", why));
    rows.push(taxRow("Roth (After-Tax Designated)", plan.roth,
      "Contributions made with after-tax dollars. Qualified withdrawals in retirement are tax-free.", why));
    rows.push(taxRow("Voluntary After-Tax", plan.afterTax,
      plan.megaBackdoor ? "Supports in-plan Roth conversion — the “mega backdoor Roth”." : "", why));
    rows.push(`<div class="feat-row"><span>Self-Directed Brokerage</span>${plan.brokerage == null
      ? `<span class="feat-unknown">— ${esc(why)}</span>`
      : plan.brokerage !== "None"
        ? `<span class="feat-on">✓ ${esc(plan.brokerage)}</span>`
        : plan.brokerageInferred
          ? `<span class="feat-off">✗ None indicated — no brokerage window in the schedule of assets or plan codes</span>`
          : `<span class="feat-off">✗ Not offered</span>`}</div>`);
    const ff = plan.filedFeatures || {};
    if (ff.eligibility) {
      /* THE LABEL MUST NOT CONTRADICT THE QUOTE PRINTED UNDER IT.
       *
       * "Upon hire / immediate" is a derived label; the sentence below it is
       * the filed evidence. Measured 2026-08-24 over all 62,377 lineups that
       * carry features: 9,849 are labelled immediate, and 991 of those print a
       * quote that states a waiting period and never says entry is immediate —
       * Six Continents Hotels (20251015085526NAL0002047779001) is shown
       * "Eligibility ✓ Upon hire / immediate" above its own filing's words,
       * "eligible to join the Plan on the first day of the month following the
       * completion of 6 months of employment". Others in the class quote three
       * months, 90 days, 60 days, or an age-21 condition.
       *
       * When the two disagree the quote wins and the label goes: a reader is
       * better served by the filing's sentence with no headline than by a
       * headline the sentence denies. The extractor keeps its value in the
       * data; only the assertion is withheld. */
      const svc = /\b(\d+|one|two|three|six|twelve)\s*(month|day|year)s?\b/i;
      const immediate = /upon hire|immediate/i.test(ff.eligibility);
      const quoteSaysWait = ff.eligibilityText && svc.test(ff.eligibilityText) &&
        !/immediate|upon hire|date of hire|first day of employment/i.test(ff.eligibilityText);
      const label = immediate && quoteSaysWait
        ? `<span class="feat-unknown">— as stated in the filing, below</span>`
        : `<span class="feat-on">✓ ${esc(ff.eligibility)}</span>`;
      rows.push(`<div class="feat-block"><div class="feat-row"><span>Eligibility</span>${label}</div>
        ${ff.eligibilityText ? `<div class="feat-blurb">“${esc(ff.eligibilityText)}”</div>` : ""}</div>`);
    }
    rows.push(ff.loans
      ? `<div class="feat-row"><span>Participant Loans</span><span class="feat-on">✓ Permitted</span></div>`
      : `<div class="feat-row"><span>Participant Loans</span><span class="feat-unknown">— ${esc(why)}</span></div>`);
    // ESPPs are IRC §423 stock plans, not retirement plans — they never
    // appear in any Form 5500; say so instead of implying it's pending
    rows.push(`<div class="feat-row"><span>ESPP</span><span class="feat-unknown">— Not in retirement filings (source: SEC, planned)</span></div>`);
    for (const h of plan.highlights) {
      rows.push(`<div class="feat-row"><span>Feature</span><span class="feat-on">✓ ${esc(h)}</span></div>`);
    }
    return rows.join("");
  }

  /* ---- comprehensive fee schedule (Sch H lines + Sch C providers + Sch A) ---- */
  // Schedule C element (b) service codes, from the official Form 5500
  // instructions (docs/form5500-instructions-2025.txt)
  const SERVICE_CODES = {
    10: "Accounting / audit", 11: "Actuarial", 12: "Claims processing", 13: "Contract administrator",
    14: "Plan administrator", 15: "Recordkeeping", 16: "Consulting (general)", 17: "Consulting (pension)",
    18: "Custodial (non-securities)", 19: "Custodial (securities)", 20: "Trustee (individual)",
    21: "Trustee (bank/trust co.)", 22: "Insurance agent / broker", 23: "Insurance services",
    24: "Trustee (discretionary)", 25: "Trustee (directed)", 26: "Investment advisory (participants)",
    27: "Investment advisory (plan)", 28: "Investment management", 29: "Legal", 30: "Employee (plan)",
    31: "Named fiduciary", 32: "Real estate brokerage", 33: "Securities brokerage", 34: "Valuation / appraisal",
    35: "Employee (sponsor)", 36: "Copying / duplicating", 37: "Participant loan processing",
    38: "Participant communication", 40: "Foreign entity", 49: "Other services", 50: "Direct payment from plan",
    51: "Inv. mgmt fees (paid directly)", 52: "Inv. mgmt fees (paid indirectly)", 53: "Insurance brokerage commissions",
    54: "Sales loads", 55: "Other commissions", 56: "Non-monetary compensation", 57: "Redemption fees",
    58: "Product termination fees", 59: "Shareholder servicing fees", 60: "Sub-transfer agency fees",
    61: "Finders' / placement fees", 62: "Float revenue", 63: "12b-1 distribution fees", 64: "Recordkeeping fees",
    65: "Account maintenance fees", 66: "Insurance M&E charge", 67: "Other insurance wrap fees",
    68: "Soft-dollar commissions", 70: "Consulting fees", 71: "Securities brokerage fees",
    72: "Other investment fees", 73: "Other insurance fees", 99: "Other fees",
  };
  function decodeServices(codeStr) {
    const seen = [];
    for (const c of String(codeStr || "").match(/\d{2}/g) || []) {
      const label = SERVICE_CODES[+c];
      if (label && !seen.includes(label)) seen.push(label);
    }
    return seen;
  }
  const usd = (v) => "$" + Math.round(v).toLocaleString("en-US");

  function feeSection(plan) {
    if (plan.dataStatus !== "filed") return "";
    if (plan.isSF) {
      return `
      <div class="section-label">PLAN FEES <span class="section-sub">Form 5500-SF</span></div>
      <p class="max-benefit">Short-form filers don't file Schedule C or Schedule H, which itemize
      service-provider compensation and plan expenses — no fee detail is public for this plan.</p>`;
    }
    const rows = [];
    // what the plan paid out of assets (Schedule H expense lines)
    const f = plan.flows || {};
    const hLines = [
      ["Recordkeeping / contract administration", f.feeAdminM],
      ["Professional fees (audit, legal, actuarial)", f.feeProfM],
      ["Investment management fees", f.feeInvM],
      ["Salaries & allowances", f.feeSalM],
      ["Other administrative expenses", f.feeOtherM],
    ].filter(([, v]) => v > 0).map(([k, v]) => [k, v * 1e6]);
    if (hLines.length) {
      const perHead = f.adminRaw > 0 && plan.participants > 0 ? f.adminRaw / plan.participants : null;
      rows.push(`<div class="section-label">PLAN FEES — PAID FROM PLAN ASSETS <span class="section-sub">Form 5500 Schedule H expense lines</span></div>`);
      rows.push(hLines.map(([k, v]) => `<div class="flow-row"><span>${k}</span><span>${usd(v)}</span></div>`).join(""));
      rows.push(`<div class="flow-row"><span><strong>Total administrative expenses</strong>${perHead != null ? ` <span class="section-sub">≈ ${usd(perHead)} per participant</span>` : ""}</span><span><strong>${f.adminRaw > 0 ? usd(f.adminRaw) : "—"}</strong></span></div>`);
      rows.push(feePeerNote(plan, perHead, f.adminRaw));
      /* "per participant" is arithmetic, not a statement about whose money paid
       * it. Schedule H reports what left plan assets; it does not say whether
       * the source was participant balances, the employer, revenue sharing, or
       * forfeited employer contributions. Found on LNC's plan, where Sch H
       * 2i(12) is $182,511 and the notes say forfeitures of exactly $182,511
       * paid administrative expenses -- so no participant balance was charged,
       * while the page divided it across every participant and ranked it
       * against peers. wampo has no forfeiture extractor, so this cannot be
       * said per plan; saying it once, plainly, beats implying the opposite on
       * every plan. */
      rows.push(`<p class="contrib-note">ⓘ Schedule H reports what left plan assets, not whose money paid it. Some plans meet these costs from forfeited employer contributions, employer payments, or revenue sharing rather than from participant balances — the filing's notes say which, and wampo does not yet extract that.</p>`);
    }
    // who was paid (Schedule C provider table)
    const fsch = plan.feeSchedule;
    if (fsch && fsch.unavailable) {
      // fee shards not published yet — say nothing rather than something false
    } else if (fsch === undefined) {
      rows.push(`<div class="section-label">SERVICE PROVIDER COMPENSATION</div><p class="max-benefit">Loading the provider fee table from the filing…</p>`);
    } else if (fsch && fsch.p && fsch.p.length) {
      const provRows = fsch.p.map((p) => {
        const svcs = decodeServices(p.c);
        const indirect = p.t ? `Yes — ${usd(p.t)} reported` : p.i || p.e ? "Yes (revenue sharing / fund fees)" : p.fm ? "Formula disclosed" : "—";
        return `<tr><td class="fund-name-col">${esc(titlePlanName(p.n))}</td><td>${esc(svcs.slice(0, 3).join(", ") || "—")}${svcs.length > 3 ? ` +${svcs.length - 3}` : ""}</td><td style="text-align:right">${usd(p.d)}</td><td>${indirect}</td></tr>`;
      }).join("");
      rows.push(`
      <div class="section-label">SERVICE PROVIDER COMPENSATION <span class="section-sub">Schedule C — providers paid ≥$5,000, as filed</span></div>
      <div class="fund-scroll"><table class="fund-table">
        <thead><tr><th class="fund-name-col">Provider</th><th>Services</th><th style="text-align:right">Paid directly by plan</th><th>Indirect compensation</th></tr></thead>
        <tbody>${provRows}</tbody>
      </table></div>
      <p class="max-benefit">"Indirect" = revenue sharing, 12b-1 fees, float and similar amounts paid out of
      investments rather than by the plan. Providers receiving only disclosed eligible indirect
      compensation may be listed without amounts, per the form's rules.</p>`);
    } else {
      rows.push(`<div class="section-label">SERVICE PROVIDER COMPENSATION</div>
      <p class="max-benefit">No itemized provider compensation in this filing's Schedule C — providers paid
      under $5,000, or paid only via disclosed eligible indirect compensation (fund revenue sharing),
      aren't required to be itemized.</p>`);
    }
    // insurance commissions (Schedule A)
    if (fsch && fsch.a && (fsch.a.cm || fsch.a.fe)) {
      rows.push(`<div class="section-label">INSURANCE COMMISSIONS & FEES <span class="section-sub">Schedule A</span></div>
      <p class="max-benefit">Brokers and agents received ${fsch.a.cm ? usd(fsch.a.cm) + " in commissions" : ""}${fsch.a.cm && fsch.a.fe ? " and " : ""}${fsch.a.fe ? usd(fsch.a.fe) + " in fees" : ""}
      across ${fsch.a.cr} insurance contract${fsch.a.cr === 1 ? "" : "s"} — costs carried inside insurance products, on top of the expense lines above.</p>`);
    }
    return rows.join("");
  }

  function flowsTable(plan) {
    const f = plan.flows;
    const rows = [
      ["Employee Deferrals", money(f.deferralsM)],
      ["Employer Contributions", money(f.employerM)],
      ["Rollovers", money(f.rolloversM)],
      ...(f.benefitsM != null ? [["Benefits Paid", money(f.benefitsM)]] : []),
      ...(f.feeAdminM != null ? [["— Recordkeeping / Admin Fees", money(f.feeAdminM)]] : []),
      ...(f.feeInvM != null ? [["— Investment Mgmt Fees", money(f.feeInvM)]] : []),
      ...(f.feeProfM != null ? [["— Professional Fees", money(f.feeProfM)]] : []),
      ["Admin Expenses", money(f.adminM != null ? f.adminM : (f.adminK != null ? f.adminK / 1000 : null))],
      ["Prior Year Assets", money(f.priorAssetsM)],
    ];
    return rows.map(([k, v]) => `<div class="flow-row"><span>${k}</span><span>${v}</span></div>`).join("");
  }

  /* Order a lineup so target-date families appear as one block in year order
   * (2015, 2020, ...) instead of scattered by value. A family = 3+ funds whose
   * names differ only by a 4-digit year; the block sits where its largest
   * member would rank, and everything else stays sorted by value. */
  function tdBase(name) {
    const m = name.match(/\b(19|20)\d\d\b/);
    return m ? name.replace(/\b(19|20)\d\d\b/, "#").replace(/\s+/g, " ").trim().toLowerCase() : null;
  }
  function orderLineup(funds) {
    const fam = new Map();
    for (const f of funds) {
      const b = tdBase(f.name);
      if (b) { if (!fam.has(b)) fam.set(b, []); fam.get(b).push(f); }
    }
    const famMax = new Map();
    for (const [b, list] of fam) if (list.length >= 3) famMax.set(b, Math.max(...list.map((f) => f.value)));
    const key = (f) => { const b = tdBase(f.name); return b != null && famMax.has(b) ? b : null; };
    return [...funds].sort((a, b) => {
      const fa = key(a), fb = key(b);
      const ra = fa ? famMax.get(fa) : a.value;
      const rb = fb ? famMax.get(fb) : b.value;
      if (rb !== ra) return rb - ra;
      if (fa && fb && fa === fb) {
        const ya = +a.name.match(/\b(19|20)\d\d\b/)[0], yb = +b.name.match(/\b(19|20)\d\d\b/)[0];
        return ya - yb;
      }
      return b.value - a.value;
    });
  }

  /* Value-weighted estimated expense ratio across a filed lineup; null until
   * fund-er.js patterns cover at least half the lineup's value. */
  /* PARTICIPANT LOANS ARE A PLAN ASSET AND NOT A MENU CHOICE. Schedule H line
   * 4i lists them because they ARE plan assets, but nobody can pick `LOAN
   * FUND` off a menu, and printing it among the funds says they can. 483 rows
   * / 483 plans / 1,372,445 participants / $1,251,824,848 on the v188 store —
   * exactly one row per plan, which is what a clean class looks like.
   *
   * MEASURED BEFORE THIS WAS WRITTEN, and it NARROWED the defect: 0 of the 483
   * render a ticker and 0 render an expense ratio, so there is no fabricated
   * fee here and the queue entry that implied one was wrong. What remains is
   * presentational.
   *
   * ANCHORED on purpose — that is what keeps real funds safe. `Bank Loan
   * Fund`, `Floating Rate Loan Fund`, `Senior Loan Portfolio` and `Loomis
   * Sayles Core Plus Bond` are all refused, and all four are pinned controls.
   *
   * NOT what v131 fixed: that removed loan DESCRIPTION rows (`rates ranged
   * from 4.25% to 9.50%`, 7,052 rows → 9). A row literally NAMED `Loan Fund`
   * survived it untouched. A fix for one phrasing of a class is not a fix for
   * the class. */
  const LOAN_ROW = /^(?:participants?['’]?s?[- ]?)?loans?(?:\s*(?:fund|receivable|to participants?|account))?\b[\s.,;:()%\d-]*$|^(?:notes? receivable from |loans? to )participants?\b|^participant notes?\b/i;
  function filedAvgER(plan) {
    const lu = plan.filedLineup;
    if (!lu) return null;
    let total = 0, matchedVal = 0, weighted = 0, matched = 0;
    for (const f of lu.funds) {
      /* a loan is not a fund, so it must not count against fee COVERAGE. The
       * gate is matchedVal/total and loans never match, so they only ever
       * pushed plans below it. Strictly additive by construction — excluding
       * rows from `total` can only RAISE the ratio — and measured: 3 plans /
       * 2,255 ppl newly publish an average-ER line, 0 lose one, and not one
       * published ER VALUE changes, because loans were never in the numerator. */
      if (LOAN_ROW.test(f.name || "") || isLoanDescriptionRow(f.name || "")) continue;
      total += f.value;
      const er = (f.cit || /collective trust|pooled separate/i.test(f.type || "")) ? null : fundER(f.name);
      if (er != null) { matchedVal += f.value; weighted += er * f.value; matched++; }
    }
    if (!total || matchedVal / total < 0.5) return null;
    return { er: weighted / matchedVal, matched, of: lu.funds.length };
  }

  /* Equal-weight estimate for community-sourced menus (no filed values to
   * weight by); null until patterns cover at least half the menu. */
  function curatedAvgER(plan) {
    if (!plan.funds || !plan.funds.length) return null;
    let sum = 0, matched = 0;
    for (const f of plan.funds) {
      const er = fundER(f.name);
      if (er != null) { sum += er; matched++; }
    }
    if (!matched || matched / plan.funds.length < 0.5) return null;
    return { er: sum / matched, matched, of: plan.funds.length };
  }

  function filedLineupTable(plan) {
    const lu = plan.filedLineup;
    const hasSma = !!(lu.sma && lu.sma.length);
    const tab = hasSma ? (state.lineupTab[plan.id] || "menu") : "menu";
    const list = tab === "sma" ? lu.sma : orderLineup(lu.funds);
    const total = list.reduce((s, f) => s + f.value, 0);
    let starred = false;
    const rows = list.map((f) => {
      // a holding Schedule D reports as a collective trust is NOT the
      // same-named mutual fund: CIT pricing is negotiated per plan and is not
      // public, so no estimate is honest here. The same is true of any row
      // the FILING types as a collective trust or an insurance pooled
      // separate account, whether or not Schedule D happened to carry a
      // matching dollar value — keying only on the Sch D match priced some
      // flexPath vintages at 0.10% and left their siblings blank in one
      // table (Swinerton).
      // ...and the row's own NAME, which this test never asked until 2026-09-30.
      // 48 rows / 20 plans / 30,432 ppl published an estimated RETAIL fee on a
      // holding whose filed name states a collective-trust unit class, because
      // the type cell was blank or said `Mutual fund`. A Trust II unit class is
      // normally CHEAPER than the fund the pattern table prices, so the number
      // was wrong in the flattering direction. The vocabulary is narrow on
      // purpose: a BARE terminal `Trust` reaches 201 rows dominated by
      // `American Funds American High-Income Trust`, a REGISTERED fund, and
      // `Trust Class` is Neuberger Berman's own retail share-class name — see
      // lib-disclose.mjs for both refusals and the names behind them.
      const noPublicPrice = f.cit || /collective trust|pooled separate/i.test(f.type || "")
        || isCollectiveTrustName(f.name || "");
      // A collective trust has no ticker and no published fee. Where its name
      // identifies the trust edition of a specific registered fund, that fund
      // is shown with a "*" — what the holding tracks, not what it is; its
      // expense ratio is the RETAIL class, an upper bound on the plan's own.
      /* A row typed Stable value / GIC is a contract issuer or an individual
       * security inside the stable value option's synthetic-GIC portfolio —
       * "Wells Fargo & Co" there is a corporate BOND, and the Wells Fargo
       * fund-family pattern was pricing it at 0.45% (Westinghouse, owner
       * report 2026-08-24). Bonds have no expense ratio and no fund ticker. */
      const gicRow = /stable value|\bgic\b/i.test(f.type || "");
      /* v181: a row the FILING calls a subtotal is not a vehicle, so it has no
       * ticker and no expense ratio. Measured before this gate existed:
       * `fundER("Stable Value Fund Subtotal")` returns 0.35% and CVS Health's
       * $2,690,925,949 row was suppressed only because its old type said
       * "Stable value / GIC". Retyping it without this line would have started
       * publishing an estimated expense ratio for a subtotal — a new false
       * claim created by the fix. `fundTickerInfo` returns nothing for all ten
       * names in the class, with or without the type, so the ticker half is
       * belt-and-braces for future callers. */
      const subtotalRow = /^subtotal \(not a holding\)$/i.test(f.type || "");
      /* participant loans — see LOAN_ROW above. Treated exactly as v181 treats
       * a subtotal: typed and tinted, never dropped, and left in the
       * percentage denominator so the money stays accounted for. Their share
       * is at most 10.9% of a menu and usually 1-3%; removing them would
       * rewrite every other row's published percentage for 1.37M readers to
       * buy a cosmetic gain. */
      /* ...and the same row when the parse kept only the DESCRIPTION's
       * continuation line, so the name never says "loan" at all: Nissan's
       * `at rates of interest ranging from 4.25% to` at $63,385,312. LOAN_ROW
       * is anchored on the name beginning with loan words and cannot reach it;
       * `isLoanDescriptionRow` asks what is LEFT after the loan description is
       * stripped. 627 rows / 627 plans / 1,394,114 ppl, and in 626 of those
       * plans it is the menu's ONLY loan row — which is the filing's own
       * structure agreeing with the reading. */
      const descLoanRow = isLoanDescriptionRow(f.name || "");
      /* THE LOAN-REPAYMENT ANSWER LINE, 2026-09-30, and it is v194's own cost.
       * `Loan Repayments are included:` is a recordkeeper-report answer whose
       * value is the plan's loan balance. v194's SKIP_ROW arm is anchored `^`
       * and this family WRAPS, so it skipped `Loan Repayments are` and left the
       * continuation to name the row: 23 published rows / 23 plans / 33,695 ppl
       * now read `included`, and Northwood Investors' reads `Yes` (Keysight's
       * carries $4,160,976). v195 reverts the parser arm, so this answers for
       * BOTH spellings and a reader is served before and after the re-parse.
       * TYPED, NOT DROPPED (v181): the value stays in the denominator, so no
       * other row's published percentage moves; it loses the ticker and the fee,
       * neither of which a loan balance has. Rule and measurement in
       * lib-disclose.mjs. */
      const loanAnsRow = isLoanAnswerRow(f.name || "");
      /* ...and the THIRD member of that family, where the description wraps
       * over three lines and the VALUE lands on the third, so the row is named
       * by a bare month and year carrying neither the range words nor the
       * answer words. Read in three filings; 68 of 68 sit in a menu with no
       * loan row at all, which is the corroboration. lib-disclose.mjs. */
      const loanMatRow = isLoanMaturityRow(f.name || "");
      /* ...and the FOURTH, where the name is nothing but loan vocabulary but
       * opens with an ordinary adjective, so `LOAN_ROW`'s anchor — the thing
       * that keeps `Bank Loan Fund` safe — cannot reach it. lib-disclose.mjs. */
      const loanVocabRow = isLoanVocabularyRow(f.name || "");
      const loanRow = LOAN_ROW.test(f.name || "") || descLoanRow || loanAnsRow || loanMatRow || loanVocabRow;
      /* AN INSURANCE ANNUITY CONTRACT TYPED `Mutual fund` — the rule and its
       * whole safety argument live in scripts/lib-disclose.mjs; this is the
       * generated twin's call site. It suppresses the ticker and the fee for
       * exactly the reason `gicRow` does: an annuity's cost is inside the
       * crediting rate and is not a fund expense ratio. That half is NOT
       * belt-and-braces — 34 of these rows publish 0.35% today off
       * fund-er.js's generic /guaranteed|stable value/ fallback, and the only
       * reason they escape `gicRow` is the wrong type this line repairs. */
      const annuityRow = isAnnuityContractRow(f, f.name || "");
      /* ...and the SAME fabricated fee on the rows that rule cannot reach,
       * because it reads the TYPE cell and these types assert nothing: blank,
       * `Cash / short-term`, `Separate account`, ETF, `Corporate debt`. 144
       * rows publish exactly 0.35% off fund-er.js's last generic fallback for
       * a holding the filing names as an annuity contract and nothing else.
       * The rule and its whole safety argument — including why 40 rows naming
       * a real fund held THROUGH a group annuity contract keep their fee —
       * live in scripts/lib-disclose.mjs; this is the generated twin's call
       * site. It takes the bare fee TABLE, not `fundERFiled`: the
       * house-misspelling repair is for a string believed to be a fund's name
       * and the remainder here is explicitly not one (measured: the two agree
       * on all 1,405 rows this gate can reach). FEE ONLY — the ticker is left
       * alone, because 0 of the 1,361 rows it flags publish one.
       *
       * 2026-10-02: the predicate now reads the filing's own WORD `contract`
       * rather than a list of the three wordings it appears in, which reaches
       * a further 226 rows / 223 plans / 459,254 participants, 225 of them at
       * the same fabricated 0.35. The whole safety argument — including the 67
       * distinct phrases that precede `contract`, the SEVEN misspellings of
       * `investment` that killed the vocabulary, and the reading of all 183
       * newly-flagged names — lives in scripts/lib-disclose.mjs.
       *
       * AND THE `!tk` IS THE `isBankDepositRow` PATTERN, FOR THE SAME REASON:
       * the predicate is purely about the NAME, and the ticker the page has
       * ALREADY resolved is what separates a real fund wearing a `contract`
       * caption from a contract with an insurer. Priced before adding it: the
       * pre-2026-10-02 gate flags 2,915 published rows and **0 publish a
       * ticker**, so this moves no shipped verdict; across the widened
       * population it is load-bearing on exactly ONE row, `Contract BlackRock
       * Russell 1000 Growth CIT` (Wilson & Company, 1,009 ppl, $10,359,013),
       * a real collective trust publishing IWF's 0.18 as a labelled
       * comparable. A condition that changes one verdict is named as changing
       * one verdict; it is not decorative and it is not large. */
      const guaranteeOnlyFee = annuityFeeIsGuaranteeOnly(f.name || "", fundER);
      /* AN INVESTMENT CONTRACT TYPED `Mutual fund` — the annuity rule one legal
       * noun along, and larger. 267 rows / 264 plans / 388,683 participants say
       * `investment contract` or `insurance contract` in the filed name and are
       * typed `Mutual fund`, which tells those readers a contract with an
       * insurer is a registered mutual fund. 89 of them also publish a
       * fabricated 0.35% off fund-er.js's generic /guaranteed|stable value/
       * fallback. The rule, the escape hatch that keeps the five rows which
       * really do name a fund, and the whole safety argument live in
       * scripts/lib-disclose.mjs; this is the generated twin's call site. */
      const contractRow = isInvestmentContractRow(f, f.name || "", namesAFund);
      /* v67 entries carry the 4i identity column as f.iss ("Vanguard",
       * "Western Asset"). Ticker matching sees issuer + name together, which
       * is what makes "Core Bond IS" resolvable at all; entries parsed
       * before v67 simply lack the field and behave as before. */
      /* 2026-09-16: the issuer prefix cuts BOTH ways. It is what makes
       * "Core Bond IS" resolvable — and it is what makes "Vanguard Total
       * Stock Market Index Trust" UNresolvable when the identity column
       * holds the trustee ("Empower Trust Company, LLC") rather than the
       * house. Measured against the live store: 9,835 rows / 2,567 plans /
       * 3.10M participants resolve on the bare name and fail with the
       * prefix — blank fee cells since v67. Try issuer+name first (keeps
       * every existing win), then the bare name. Strict superset. */
      const info = tab === "menu" && !gicRow && !subtotalRow && !loanRow && !annuityRow
        && !contractRow
        ? lookupTicker(f)
        : null;
      /* A POOLED FUND TYPED `Company stock` — the rule, its vocabulary and its
       * whole safety argument live in scripts/lib-disclose.mjs; this is the
       * generated twin's call site. It is the ONE gate in this file that must
       * be asked before `stockRow`, because `stockRow` does not merely suppress
       * a ticker: it PUBLISHES the plan sponsor's own symbol in its place. Duke
       * Energy's SIXTEEN pooled funds — nine target-date vintages, three index
       * funds, four blend funds, $5,575,809,000 = 50.1% of its published menu
       * — each rendered with `DUK` beside it. A blank is honest; a symbol
       * reads as knowledge. */
      const mistypedStock = isMistypedStockRow(f, f.name || "");
      // employer stock IS a listed security: the plan's own ticker names it
      const stockRow = !mistypedStock
        && /company stock|employer (security|stock)/i.test((f.type || "") + " " + f.name);
      // v143: a row named from the SEC class index carries the ticker the
      // filing's own code stated; show it even when fund-er has no entry
      /* A PARTICIPANT-LOAN ROW NEVER CARRIES A SYMBOL, WHATEVER ITS TYPE CELL
       * SAYS — 2026-10-01 (14:5xZ). This line branched on `stockRow` first
       * while `shownType` below branches on `loanRow` first, so a row that is
       * BOTH — the type cell claiming employer stock, the name a loan balance
       * — printed one answer in each column: Nektar Therapeutics (775 ppl)
       * published `Outstanding Loan Balance` labelled *"Participant loans —
       * not a menu choice"* with **NKTR** beside it. One row store-wide, and
       * it is a structural disagreement rather than a missing vocabulary
       * entry: two columns asking the same predicates in a different ORDER.
       * Found by a whole-store cross-column audit, which is also what cleared
       * the other eight buckets. A loan balance is the only suppressor added
       * here, because it is the only one that can be true beside `stockRow`
       * and still mean the row is not a security. */
      /* A ROW TYPED EMPLOYER STOCK THAT NAMES A DIFFERENT COMPANY —
       * 2026-10-01. The branch below does not merely withhold a symbol where
       * `stockRow` is true: it PUBLISHES THE SPONSOR'S OWN. So Bank of
       * America's 250,040 participants were shown `INTERNATIONAL BUSINESS
       * MACHS` and `EXXON MOBIL CORP` as BAC, FedEx's two plans showed `Master
       * Trust` as FDX, and the GE spin-off read wrong in both directions. The
       * rule, its two arms, the 51 rows it withdraws and the residue it does
       * not reach are all in scripts/lib-disclose.mjs; this is the generated
       * twin's call site. It WITHDRAWS and never asserts — arm II identifies
       * the other company and its symbol is still not published, because the
       * row's `Company stock` type came from a section heading our own parse
       * inherited and what the holding IS remains unknown. `stockRow` itself is
       * untouched, so the fee stays suppressed exactly as before and the only
       * cell that changes is the symbol. */
      const stockSymbolOk = !stockRow || employerStockSymbolOk(f.name || "",
        f.iss || "", plan.sponsorName || "", plan.ticker || "",
        TICKER_NAME[plan.ticker] || "", sponsorTickerIndex());
      const tk = loanRow ? null
        : stockRow ? (stockSymbolOk ? (plan.ticker || null) : null)
        : (info ? info.tk : (f.tk || null));
      const star = !stockRow && info && info.comparable;
      if (star) starred = true;
      /* ...and the fee a mistyped row may publish once that claim is withdrawn.
       * 9 of the flagged rows would otherwise newly print fund-er.js's generic
       * /stable value|managed income|guaranteed|gic/ fallback — `NOV Stable
       * Value Fund`, `Principal Fixed Income Guaranteed Option` — which is the
       * exact fabricated 0.35% withdrawn from 89 rows this morning. The rule
       * asks its sibling's structural question and is inert on the 175 flagged
       * rows carrying no guarantee word at all. */
      const mistypedGuaranteeFee = mistypedStock
        && mistypedStockFeeIsGuaranteeOnly(f.name || "", fundER);
      /* THE FILING NAMED NO FUND, AND THE TYPE CELL WAS REPEATING THE NAME.
       * A bare vehicle type as the whole name — `Mutual funds`,
       * `Common/collective trust funds`, decorated variants such as
       * `Sub-total: Registered Investment Companies` — leaves a reader seeing
       * `Mutual funds` in the name column and `Mutual fund` in the type
       * column: the same word twice and nothing about what the money is in.
       * A large share of these rows are >=50% of their plan's published menu,
       * which is the v105 dominant-row shape sitting below the 90% guard.
       *
       * Nothing can be recovered — the filing says `Mutual funds` and stops.
       * So say THAT, which is itself a filed fact, in the cell that was
       * redundant. The name, the value and the percentage are untouched.
       *
       * The exclusions live in `isNamelessFundRow` in scripts/lib-disclose.mjs
       * because the static pages need exactly the same ones and a second copy
       * is how two surfaces drift. The ISSUER test stays HERE and deliberately
       * does not move into the shared rule: it is not a property of the row,
       * it is a property of THIS surface, which prints the issuer before the
       * name — so `Vanguard Target Retirement 2030 · Mutual Fund Shares` reads
       * as a named holding and must not be qualified. The generator prints the
       * issuer too as of this change, so the two agree; if one ever stopped,
       * the shared rule would still be right and only this line would move. */
      /* THE ISSUER GATE NOW TESTS ITS OWN PREMISE — 2026-10-04.
       *
       * The gate below asked whether an issuer is PRESENT and never whether
       * the issuer NAMES A FUND. Measured: 781 rows / 1,526,288 participants
       * sit behind it, and asking the SAME composed predicate of the ISSUER
       * separates them cleanly. **20 rows / 18 plans / 245,810 participants /
       * $51,048,548,123** have a generic name AND a generic issuer, so
       * `issuer · name` reads as nothing twice over:
       *   3M Company        40,574 ppl  74.7% of its menu  $18,418,583,395
       *                     `Common/collective trusts` · `Investments measured at NAV`
       *   General Motors    65,343 ppl  66.4%  $15,829,825,000  (and 63.6% / $6.2B)
       *   Union Pacific      8,460 ppl  60.9%  $8,096,901,069
       *   Baker Hughes      21,995 ppl  15.5%  $1,857,061,000
       *   Goodyear / Cooper Tire: seven rows at 52.1% to 90.4% of their menus
       * On every one the TYPE column says `Collective trust` as well, so the
       * reader is shown the same empty answer three times.
       *
       * THE OTHER 762 ARE THE GATE WORKING, and reading them is what kept this
       * change to one token: the issuer holds a real fund (`Vanguard Mid Cap
       * Index Admiral`, `Longview Core Bond Fund`, `UBC Russell 3000 Index
       * Trust`, `BNYM Mellon SL SmartPath 1D2050 Fd`) or a real insurer
       * (`PACIFIC LIFE`, `Voya Institutional Trust Company`). A wider
       * instrument than the shipped predicate would have qualified those too.
       * The gate's own comment handed over the negative control and it holds:
       * `isGenericName("Vanguard Target Retirement 2030")` is false, so
       * `Vanguard Target Retirement 2030 · Mutual Fund Shares` stays unqualified.
       *
       * Of the composition's two halves only `isGenericTypeName` fires here —
       * `hasNoFundIdentity(iss)` reaches 0 of the 781 — but the call site
       * already builds `isGenericName`, so reusing it is one token where
       * splitting it would be a new arm. Ticker and fee move on 0 rows. */
      const issuerText = String(f.iss || "").replace(/\*+/g, "").trim();
      const namelessRow = (!issuerText || isGenericName(issuerText))
        && (isNamelessFundRow(f, f.name, nameIsGeneric)
          /* ...or the row is a Schedule H PARTICIPANT-DIRECTION caption, which
           * `isNamelessFundRow` is blind to by construction because a caption
           * is not a vehicle type: 0 of the 18 candidates were already typed.
           * It shares the no-issuer gate above for the same reason that gate
           * exists at all. lib-disclose.mjs carries the measurement. */
          || isDirectionCaptionRow(f.name)
          /* ...or the row is an AUDIT FIRM'S OFFICE LIST read off the bottom of
           * a scanned page — seven rows and one string, all with a blank issuer
           * and a blank type, so neither the vehicle-type test nor the caption
           * test can reach it. lib-disclose.mjs carries the population. */
          || isOfficeListRow(f.name)
          /* ...or the row is a PAGE BREAK'S own caption, or the page-carry
           * subtotal that travels with it — `(continued)`, `Continued from
           * page 10`, `Balance Brought Forward`. 12 rows, $1,328,090,246, and
           * eight of them are 45-92% of their plan's published menu, which is
           * what a carry line is: the sum of everything above it. Same
           * no-issuer gate, same reason as its two siblings.
           * lib-disclose.mjs. */
          || isPageBreakCaptionRow(f.name));
      /* v196: AND `namelessRow` JOINS THE FEE SUPPRESSORS, which is why this
       * definition had to move above `er`. The two comments below say of their
       * own arms that "the fee suppression above is independent of this
       * ordering"; of THIS arm it was not true. A row the page itself declares
       * names no specific fund was still free to publish an estimated expense
       * ratio derived from that same non-name.
       *
       * Measured through the whole `er` expression over every published row:
       * 787 nameless rows are reached today, `fundER` prices 34 of them, and 32
       * are already suppressed because their TYPE cell reads `Stable value /
       * GIC`. So the guard withdraws NOTHING that publishes today — it exists
       * because v196's own widening creates the first two escapes, `Guaranteed
       * interest contract(s), at contract value` with a BLANK type at Mote
       * Marine (443 ppl) and Vernet US (232), each of which would print the
       * generic 0.35% guarantee fallback: the exact fabricated number withdrawn
       * from 89 rows on 2026-09-29. A widening that adds rows to a population
       * has to be measured against what that population publishes, not only
       * against what it says. */
      /* AN FDIC-INSURED BANK DEPOSIT HAS NO EXPENSE RATIO — a deposit pays
       * interest and charges no fund expenses, so the estimate does not describe
       * a cost imprecisely, it describes one that does not exist. 110 rows / 106
       * plans / 138,550 participants, 103 of them printing exactly 0.2 off
       * fund-er.js's generic unattributed money-market fallback. The gate is
       * `fundTickerInfo` and NOT `namesAFund`, because that predicate's fundER
       * arm answers 0.2 for any money-market remainder and so is true of this
       * whole class by construction. The discriminator is `tk`, the ticker THIS
       * PAGE has already resolved, which is why the condition lives here and not
       * inside the predicate: it separates the three rows that weld a real fund
       * onto the deposit caption, and asking a second resolver instead cost one
       * of those three, because lookupTicker prepends the ISSUER and a bare
       * fundTickerInfo on the name does not. lib-disclose.mjs carries the reading
       * of all 78 names and the one accepted cost. FEE ONLY — the ticker is left
       * alone, since the rows that publish one are exactly the rows that should.
       *
       * 2026-10-02: THE PREDICATE NOW READS THE ROW, not the name alone, and
       * takes the filing's own word `deposit` rather than the two wordings it
       * was first seen in. A further 90 rows / 90 plans / 81,444 participants /
       * $179,762,762 stop publishing a fabricated expense ratio (75 at the
       * generic 0.2, 10 at 0.26, 4 at 0.35, 1 at 0.45) — 61 of them the Charles
       * Schwab Bank Savings sweep, which matched on NEITHER column because the
       * program's name is `bank savings` and sits in the ISSUER cell for 36 of
       * them. Measured through this whole expression, before and after: 0 fees
       * gained, 0 changed, 0 tickers, 0 asterisks, 0 shown types, 0 cleaned
       * names. The `!tk` conjunct keeps a fee on 4 rows that weld a Vanguard
       * money fund onto a deposit caption, 1 of them newly reached here.
       * lib-disclose.mjs carries all four arms, the reading of every distinct
       * pair, and the residue this leaves. */
      const bankDepositFee = isBankDepositRow(f, f.name || "") && !tk;
      const er = tab !== "menu" || stockRow || gicRow || subtotalRow || loanRow || annuityRow
        || (guaranteeOnlyFee && !tk) || contractRow || mistypedGuaranteeFee || namelessRow
        || bankDepositFee ? null
        : star ? info.er : (noPublicPrice ? null : fundERRow(f));
      // the brokerage window is a menu choice with no holdings of its own —
      // tint it so it reads as a doorway, not a fund (owner request)
      const brokRow = /brokerage window/i.test(f.type || "")
        || /brokerage|self.?directed|self.?managed|brokeragelink|\bpcra\b/i.test(f.name);
      /* when the NAME cell has been replaced with `Participant loans`, the type
       * must not say it again — `Participant loans | Participant loans — not a
       * menu choice` is the same phrase twice, which is the exact redundancy
       * the nameless-row change removed one cycle ago. v181's rows keep their
       * filed names, so for those the full qualifier still carries the fact. */
      /* `namelessRow` is asked BEFORE the annuity arm on purpose. A row whose
       * whole name is `Group Annuity Contract` already reads "Filing names no
       * specific fund", which is the stronger true statement and says
       * something the name does not; putting "Annuity contract" there instead
       * would print the same phrase twice, the exact redundancy the
       * nameless-row change removed. So the annuity arm only reaches rows that
       * DO name something, and the fee suppression above is independent of
       * this ordering — it fires on every annuity row either way. */
      /* `contractRow` sits after `namelessRow` for the reason the annuity arm
       * does: a row whose whole name is `Insurance contracts` already reads
       * "Filing names no specific fund", the stronger true statement, and
       * printing "Investment contract" beside it would be the same phrase
       * twice. The fee suppression above is independent of this ordering and
       * fires on every contract row either way. ONE LABEL covers both
       * phrasings: 24 of the flagged names read "Investment contracts with
       * insurance companies" verbatim, and that is the category's own name. */
      /* THE MISTYPED EMPLOYER-STOCK CLAIM IS WITHDRAWN AND NOT REPLACED, which
       * is deliberate and is the narrowest honest move. Its siblings above put
       * a TRUE type in place of a false one because the filed name says which
       * one it is — `annuity contract`, `investment contract`. Here the name
       * says only that the holding is a POOL; whether the vehicle is a
       * collective trust, a separate account or a registered fund is exactly
       * what the inherited section heading destroyed, and Duke's fifteen rows
       * are in fact two different vehicles. So the cell reads what it reads for
       * every row whose filing states no type: nothing. A blank is honest. */
      const filedType = mistypedStock ? "" : (f.type || "");
      const shownType = descLoanRow ? "Not a menu choice"
        : loanRow ? "Participant loans — not a menu choice"
        : namelessRow ? "Filing names no specific fund"
        : annuityRow ? "Annuity contract"
        : contractRow ? "Investment contract"
        : filedType || (brokRow ? "Brokerage window" : "—");
      /* THE NAME IS REPLACED HERE AND NOWHERE ELSE IN THE LOAN FAMILY.
       * v181's rows are NAMED (`LOAN FUND`, `Notes receivable from
       * participants`) and keep their names — typing them was enough. These
       * rows are a wrapped description's second line, so `at rates of interest
       * ranging from 4.25% to` in a column headed "Fund" is not a fact about
       * the plan, it is an artefact of our own parse. Saying `Participant
       * loans` states what the filing's row IS; the value and the percentage
       * are untouched, so the money stays accounted for exactly as before. */
      const shownName = descLoanRow ? "Participant loans" : f.name;
      return `
      <tr${brokRow || subtotalRow || loanRow ? ` class="row-brokerage"` : ""}>
        <td class="fund-name-col"><div class="fund-name">${f.iss && !descLoanRow ? `<span class="fund-issuer">${esc(f.iss.replace(/\*+/g, "").trim())} · </span>` : ""}${esc(shownName)}</div>${tk ? `<div class="fund-ticker">${esc(tk)}${star ? "*" : ""}</div>` : ""}</td>
        <td class="fund-type">${esc(shownType)}</td>
        <td class="num">${er != null ? er.toFixed(er < 0.1 ? 3 : 2) + "%" + (star ? "*" : "") : "—"}</td>
        <td class="num">${money(f.value / 1e6)}</td>
        <td class="num">${total ? ((f.value / total) * 100).toFixed(1) + "%" : "—"}</td>
      </tr>`;
    }).join("");
    const smaTitle = lu.smaKind === "brokerage" ? "Brokerage window holdings"
      : lu.smaKind === "mixed" ? "Brokerage & managed-account holdings"
      : lu.smaKind === "managed" ? "Managed-account holdings" : "Individually held securities";
    const tabs = hasSma ? `
    <div class="lineup-tabs">
      <button class="lineup-tab ${tab === "menu" ? "tab-on" : ""}" data-tab="menu">Plan menu (${lu.funds.length})</button>
      <button class="lineup-tab ${tab === "sma" ? "tab-on" : ""}" data-tab="sma">${smaTitle} (${lu.sma.length})</button>
    </div>` : "";
    const sub = tab === "sma"
      ? (lu.smaKind === "brokerage"
        ? "Securities participants hold through the plan's self-directed brokerage window, reported individually in the filing"
        : lu.smaKind === "managed"
          ? "Securities held inside separately managed accounts — each account is a single menu choice for participants"
          : "Securities itemized in the filing — managed-account or participant-brokerage assets, not separate menu choices")
      : lu.fromTrust
        ? `Holdings of ${esc(lu.trustName)} — this plan invests through the master trust${lu.sisters > 1 ? ` alongside ${lu.sisters - 1} sister plan${lu.sisters > 2 ? "s" : ""}` : ""}${lu.trustAssets ? ` · trust total ${money(lu.trustAssets / 1e6)}` : ""} · percentages are of the trust, not this plan · tickers shown where the filed name identifies a registered fund · expense ratios are estimates`
        : `${esc(lu.source)} · values as filed · tickers are exact where the filed name identifies a registered fund, and marked * where a collective trust\u2019s registered equivalent is shown instead · expense ratios are estimates`;
    // Employer-directed money sits in the same 4i table as the menu. Where
    // the filing says so, say so — Swinerton's company stock is half the
    // table and no participant chose it, so a bare "% of holdings" column
    // reads as a menu weighting it isn't. Only on the plan's OWN table: a
    // master trust's holdings are a different pool.
    const ffl = plan.filedFeatures;
    /* WHAT SHARE OF THE PLAN IS THIS TABLE? The holdings table has always been
     * presented as though it were the whole plan. Measured 2026-08-24 across
     * 57,514 confident lineups with a comparable Schedule H total (master-trust
     * plans excluded, since a trust's holdings are a different pool):
     *
     *   displayed / Sch H assets   <50%      57     50-70%    378
     *                              70-85%  1,558    85-95%  6,033
     *                              95-105% 48,012   >105%   1,476
     *
     * 8,026 plans (14%) show less than 95% of what the filing accounts for --
     * $152B of money that is in the plan and not on the page -- and 1,476 show
     * MORE than the plan owns. A reader looking at a table covering 60% of a
     * plan has no way to know that today. coverageRatio is computed and stored
     * on every entry and used only inside merge-4i.mjs to compare runs; it has
     * never been shown to anyone.
     *
     * Bands, not a bare percentage: the comparison is a display-precision sum
     * against a filed total, so small differences are noise and only a material
     * gap is worth a reader's attention. */
    const planAssets = plan.assetsExact && plan.assetsB ? plan.assetsB * 1e9 : null;
    /* A filing that discloses only ASSET-CLASS totals is not a menu, and
     * listing "Common collective trust funds — $1.2B" under a HOLDINGS
     * heading tells a reader those are the choices. Measured 2026-08-25 on
     * the 03:11Z test cycle: five of ten filings were this shape, each a
     * billion-dollar plan whose whole table was four to eight class labels at
     * coverage ratio ~1.0 — so they pass every correctness check, because the
     * label really is printed and the class really is worth that much. The
     * rows are kept (deleting them would discard the only detail the filing
     * gives, and for master trusts class-level IS the filed detail — the
     * parser gate refused a parser-side fix for exactly that reason). What
     * changes is the claim made about them. */
    /* Widened 05:00Z after a batch showed variants the first version missed:
     * "Common Collective Trusts" (plural, no "funds"), "Collective Trust
     * Funds", "Shares of registered investment companies", "equity shares". */
    /* The trailing qualifier applies to EVERY alternative, not one of them.
     * It was added for "Mutual funds, at fair value" and an hour later
     * "Pooled separate accounts, at fair value" walked past — the same
     * too-narrow-fix pattern the parser guards kept hitting. Built once, at
     * the end, so a new class label inherits it automatically. */
    const CLASS_ROW = new RegExp("^(?:" + [
      "(?:common[ /-]?)?(?:collective|commingled) (?:trust|investment)s? (?:funds?|trusts?)?",
      "(?:common[ /-]?)?collective trusts?",
      "(?:shares of )?registered investment compan(?:y|ies)",
      "(?:common|preferred|corporate) stocks?",
      "mutual funds?",
      "(?:equity|debt|bond) shares?",
      "participant[- ]directed investments?",
      "pooled separate accounts?",
      "103-12 investments?",
      "government securities",
      "interest[- ]bearing cash",
    ].join("|") + ")(?:\\s*,?\\s*at (?:fair|contract) value)?\\s*$", "i");
    const classRows = tab === "menu" ? list.filter((f) => CLASS_ROW.test(String(f.name || "").trim())) : [];
    const classShare = classRows.length && total
      ? classRows.reduce((a, f) => a + f.value, 0) / total : 0;
    const classNote = classShare >= 0.5 ? `
    <p class="max-benefit"><strong>This filing reports asset-class totals, not individual funds.</strong>
    ${Math.round(classShare * 100)}% of the value below sits in rows like
    ${classRows.slice(0, 2).map((f) => `\u201c${esc(f.name)}\u201d`).join(" and ")} \u2014 categories, not choices a participant can pick.
    The plan's actual fund lineup is not public in this filing; the schedule of assets its auditor attached goes no deeper.</p>` : "";
    const covBand = tab === "menu" ? coverageBand(total, planAssets, lu.fromTrust) : null;
    const covPct = covBand ? covBand.pct : null;
    const coverage = covBand == null ? "" : `
    <p class="max-benefit">${covPct < 95
      ? `<strong>This table is ${covPct < 50 ? "a small part of" : "not all of"} the plan.</strong> The holdings below total ${money(total / 1e6)}, about ${covPct.toFixed(0)}% of the ${money(planAssets / 1e6)} this plan reports on its Schedule H. ${lu.cut && lu.cut.n ? `Part of the rest is the ${lu.cut.n.toLocaleString()} smaller holdings this table leaves out (see below).` : `The rest is money the filing accounts for that its schedule of assets does not itemise here.`}`
      : `<strong>These holdings exceed the plan's reported assets.</strong> They total ${money(total / 1e6)} against ${money(planAssets / 1e6)} reported on Schedule H — about ${covPct.toFixed(0)}%. Treat the table as unreconciled.`}</p>`;
    /* v138: the parser keeps the largest rows of a long schedule and records
     * what it cut. Say so — before this, Boeing's 217,061 participants read
     * "the schedule does not itemise the rest" about $15.5B their filing
     * itemises on the pages the table stopped short of. */
    const cutNote = tab === "menu" && lu.cut && lu.cut.n ? `
    <p class="max-benefit"><strong>${lu.cut.n.toLocaleString()} smaller holdings are not shown.</strong> The filing itemises ${(lu.funds.length + lu.cut.n).toLocaleString()} holdings; this table shows the largest ${lu.funds.length}, and the ${lu.cut.n.toLocaleString()} it leaves out total ${money(lu.cut.v / 1e6)}${planAssets && !lu.fromTrust ? ` — about ${(100 * lu.cut.v / planAssets).toFixed(0)}% of the plan` : ""}.</p>` : "";
    const npd = tab === "menu" && !lu.fromTrust && ffl && ffl.nonPartDirected ? `
    <p class="max-benefit"><strong>Part of these holdings is employer-directed.</strong> The filing states some of this plan's assets are not participant-directed — those holdings are listed here with the menu, so their share of the table is not a share of what participants chose.</p>
    <blockquote class="quote">“${esc(ffl.nonPartDirectedText)}”</blockquote>
    ${ffl.nonPartDirectedDiversify ? `<blockquote class="quote">“${esc(ffl.nonPartDirectedDiversify)}”</blockquote>` : ""}` : "";
    return `
    <div class="section-label">${lu.fromTrust && tab !== "sma" ? `MASTER TRUST HOLDINGS — ${lu.funds.length}` : `FUND HOLDINGS — ${tab === "sma" ? lu.sma.length + " SECURITIES" : lu.funds.length + " FILED"}`}
      <span class="section-sub">${sub}</span></div>
    ${tabs}
    ${coverage}
    ${cutNote}
    ${npd}
    <div class="fund-scroll">
      <table class="fund-table">
        <thead><tr><th class="fund-name-col">Holding</th><th>Type</th><th>Est. ER</th><th>Value</th><th>% of ${tab === "sma" ? "account" : (lu.fromTrust ? "trust" : "holdings")}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${starred ? `<p class="fund-note"><strong>*Comparable fund.</strong> That holding is a collective trust or separate account — it has no ticker and no published expense ratio, because its fee is negotiated by the plan. The fund shown is its registered equivalent, so you can look up what it holds; the plan's trust class is normally <em>cheaper</em> than the retail fee shown, so read it as a ceiling, not the plan's price.</p>` : ""}
    ${classNote}
    ${tab === "menu" && list.filter((f) => /stable value|\bgic\b/i.test(f.type || "")).length >= 5 ? `<p class="fund-note">The many <strong>Stable value / GIC</strong> rows are one menu option, itemized: plans file each piece of the stable value fund — the insurance-company contracts that wrap it and the individual securities inside its synthetic GICs (agency pools, corporate notes, asset-backed trusts). Participants choose the stable value fund as a single option; these securities are not separate choices, which is why they carry no expense ratio or ticker.</p>` : ""}
    ${tab === "menu" && list.some((f) => !lookupTicker(f) && !/company stock|employer (security|stock)|brokerage|stable value|\bgic\b/i.test((f.type || "") + " " + f.name)) ? `<p class="fund-note">Holdings with no ticker are ones we can't identify from the filed name alone: many are pooled vehicles — collective trusts, separate accounts — that have no ticker at all, and others are registered funds our reference table doesn't yet carry. Naming one on a guess would be worse than leaving it blank.</p>` : ""}`;
  }

  function fundTable(plan) {
    if (plan.filedLineup) return filedLineupTable(plan);
    if (plan.lineupKey && plan.hasLineup) {
      return `
      <div class="section-label">FUND HOLDINGS</div>
      <p class="max-benefit">Loading fund holdings from the filing…</p>`;
    }
    /* A filed FACT about this plan outranks the community-sourced sample menu.
     * Every honest explanation below used to be nested inside `!plan.funds`,
     * so a curated data.js entry suppressed ALL of them — and data.js calls
     * itself "SAMPLE DATA to demonstrate the product: figures are plausible,
     * not verified". UPS PN 004 (145,125 participants) filed its investments
     * IN AGGREGATE, carried bit 4096, had no notes menu, and was shown a
     * 22-fund synthetic menu with estimated expense ratios instead of being
     * told so. Measured whole-store: 2 plans / 145,246 ppl were masked this
     * way (the other 21 curated entries have a confident filed lineup and
     * return above). The standing rule this restores is already on the books —
     * the curated overlay never beats filed data.
     * Only the FILED-FACT branches are promoted. The docShape and generic
     * "no readable schedule" endings stay gated on `!plan.funds`, because
     * those describe OUR gap, and for a curated plan a labelled sample menu
     * is the better answer to that. */
    const filedFact = plan.filedAggregate || (plan.zeroEOY && plan.detailLoaded)
      || plan.trustUnlinked || plan.trustLinkedOpaque || (plan.mtiaName && plan.detailLoaded);
    if (!plan.funds || filedFact) {
      if (plan.zeroEOY && plan.detailLoaded) {
        // wound-down plan: explaining the wind-down beats implying a data gap
        // (a menu for a plan nobody is in anymore would be fabrication risk —
        // some of these filings are internally inconsistent, reporting $0 on
        // Schedule H while the attached audit still itemizes holdings)
        const boyM = plan.flows && plan.flows.priorAssetsM;
        return `
      <div class="section-label">FUND HOLDINGS</div>
      <p class="max-benefit">This is a final or transition-year filing: Schedule H reports <strong>$0 in year-end assets</strong>${boyM ? `, after beginning the year with ${money(boyM)}` : ""}. The plan terminated, merged, or moved its assets to a successor plan during this plan year, so there is no current fund menu to show. If your account was in this plan, it now lives with the successor plan or was distributed — check the successor's page or your own statements.</p>`;
      }
      // no parsed lineup, but the audited notes NAME the options (common for
      // master-trust plans whose per-fund schedule isn't public)
      const menu = plan.filedFeatures && plan.filedFeatures.menu;
      /* YIELD TO THE MORE SPECIFIC SENTENCE. When Schedule D gives us the
       * trust's NAME, the branch further down says which trust holds the
       * money, which is strictly more useful than saying we could not follow
       * the link. Shipping this bit without the guard silently downgraded
       * Genentech, Conagra and six others from the named sentence to the
       * generic one. */
      /* THE TRUST'S OWN SCHEDULE D NAMES FUNDS, AND IT WAS CAPTURED IN
       * SEPTEMBER AND RENDERED NOWHERE. Run #523 made prep scan a master
       * trust's own Schedule D; 379 of 508 trusts carry the resulting list on
       * `cct`, 231,260 of the 406,247 bytes of `mtias.json` that every visitor
       * already downloads at boot. It had ZERO readers. 61 plans / 874,136
       * participants / $105.6B were being told no fund-by-fund detail is
       * public by one of the three sentences below, while their trust's own
       * filing named between 3 and 25 funds with values.
       *
       * IT IS PLACED HERE ON PURPOSE, and the ordering is the same "yield to
       * the more specific sentence" rule that the trust-unlinked branch below
       * already follows: naming the funds beats every sentence beneath it,
       * and it YIELDS to the audited-notes option list, which is about THIS
       * PLAN rather than about the trust. Measured: 0 of the 61 have a notes
       * menu, so there is no contest today and the yield is for the next
       * filing that has both.
       *
       * AND THE SHARE IS NOT A CAVEAT, IT IS THE CLAIM. Schedule D reports
       * interests in COLLECTIVE TRUSTS and nothing else, so a trust that also
       * holds mutual funds, separate accounts or employer stock directly lists
       * none of it. Across the 29 trusts this reaches, the list accounts for
       * 39.6% to 100.0% of the trust's own assets — PSEG's is $2,006,425,398
       * of $4,417,985,729, so MORE THAN HALF of that trust is outside its own
       * list. Rendering this as "the funds" would be false for all 29. */
      const trustRec = plan.mtiaAck && state.trusts ? state.trusts[plan.mtiaAck] : null;
      const trustMenu = (menu && menu.length) ? null
        : trustScheduleDMenu(trustRec, !!(plan.funds && plan.funds.length), !!(plan.zeroEOY && plan.detailLoaded));
      if (trustMenu) {
        const sisters = state.plans.filter((p) => p.mtiaAck === plan.mtiaAck).length;
        const shareTxt = trustMenu.share == null ? null : (trustMenu.share * 100).toFixed(1) + "%";
        return `
      <div class="section-label">FUNDS HELD BY THE MASTER TRUST</div>
      <p class="max-benefit">This plan's money is pooled in <strong>${esc(trustRec.name)}</strong>${sisters > 1
        ? `, shared with ${sisters - 1} other plan${sisters - 1 === 1 ? "" : "s"} of the same employer` : ""}.
      That trust files no fund-by-fund schedule of assets, but it does report its
      <strong>collective&nbsp;trust interests on Schedule&nbsp;D</strong>, and those are the funds below.
      <strong>The amounts are the trust's, not this plan's</strong> — every member plan shares them, so no
      per-plan or per-participant balance is public for these funds.${shareTxt
        ? ` They account for <strong>${shareTxt}</strong> of the trust's ${money(trustMenu.trustAssets / 1e6)}; the rest is held
      in vehicles the trust does not itemize in its filing.` : ""}</p>
      <div class="fund-scroll">
        <table class="fund-table">
          <thead><tr><th class="fund-name-col">Fund (as filed on Schedule D)</th><th>Held by the trust</th><th>% of trust</th></tr></thead>
          <tbody>${trustMenu.rows.map((f) => `<tr>
            <td class="fund-name-col">${esc(f.name)}</td>
            <td>${f.value > 0 ? money(f.value / 1e6) : "—"}</td>
            <td>${trustMenu.trustAssets > 0 && f.value > 0 ? (f.value / trustMenu.trustAssets * 100).toFixed(1) + "%" : "—"}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
      }
      if (plan.trustUnlinked && !(menu && menu.length) && !(plan.mtiaName && plan.detailLoaded)) {
        // the filing is fine and we read it; the fund detail lives in a
        // SEPARATE return that we could not follow. Saying "we could not read
        // this filing" here was false for all six of these plans.
        return `
      <div class="section-label">FUND HOLDINGS</div>
      <p class="max-benefit">This plan's filing reports its assets as <strong>an interest in a master trust</strong> —
      a pooled fund shared with other plans of the same employer. The fund-by-fund detail is filed by that trust in its
      own separate return${plan.trustLinkedOpaque
        ? ", and that return does not publish a fund-by-fund list we can read either"
        : ", and we could not match this plan to that return"}, so no fund list can be shown here. The
      plan's own filing was read without trouble; what's missing is the trust's. Plan features from the audited notes
      still appear below where the filing states them.</p>`;
      }
      if (plan.filedAggregate && !(menu && menu.length)) {
        // the honest cause, not a generic gap: the filing itself reports
        // investments in aggregate (MetLife/Comcast/Albertsons class), so no
        // per-fund menu exists in the public copy to read
        return `
      <div class="section-label">FUND HOLDINGS</div>
      <p class="max-benefit">This plan's filing reports its investments <strong>in aggregate</strong> — a line like
      "participant-directed investments at fair value", or a single entry for a master separate account or group
      annuity contract — rather than fund by fund, so no per-fund menu is published in the public copy. That's how
      the plan filed, not a gap in our reading of it. Plan features from the audited notes still appear below where
      the filing states them.</p>`;
      }
      if (menu && menu.length) {
        return `
      <div class="section-label">INVESTMENT OPTIONS</div>
      <p class="max-benefit">Named in the plan's audited notes. Per-option balances aren't public —
      this plan's assets sit in a master trust whose fund-level schedule isn't published.</p>
      <div class="fund-scroll">
        <table class="fund-table">
          <thead><tr><th class="fund-name-col">Option (as filed)</th></tr></thead>
          <tbody>${menu.map((n) => `<tr><td class="fund-name-col">${esc(n)}</td></tr>`).join("")}</tbody>
        </table>
      </div>`;
      }
      /* The plan's Schedule D names a master trust, and no filing for that
       * trust exists in EFAST2 to follow (Genentech's $14.3B plan is the type
       * case: its whole schedule of assets is the single line "Plan Interest
       * in Roche U.S. Retirement Plans Master Trust"). Saying which trust
       * holds the money is both true and useful; "we could not read it" would
       * be neither. */
      if (plan.mtiaName && plan.detailLoaded) {
        return `
      <div class="section-label">FUND HOLDINGS</div>
      <p class="max-benefit">This plan holds its investments through <strong>${esc(plan.mtiaName)}</strong>,
      a master trust it reports on Schedule D. Its own schedule of assets is that single line, and the trust
      files no itemized schedule of its own with the DOL — so no fund-by-fund detail is public for this plan.
      That's how the money is held, not a gap in our reading of the filing.</p>`;
      }
      /* The DOCUMENT's own reason, when the pipeline recorded one (v113).
       * The old sentence hedged every one of these plans identically as
       * "scanned/absent, or held through a trust"; a random 30-filing sample
       * measured 77% as simply having no audited attachment published. Say
       * which it is. Codes 6/7 are OUR failure and keep honest wording. */
      const DOC_SHAPE_TEXT = [
        null,
        "This filing's public copy contains only the Form 5500 pages — no audited attachment was published with it, and the fund schedule lives in that attachment. That's what the DOL received, not something we failed to read.",
        "This filing includes its audited attachment, but that attachment contains no schedule of assets — so no fund-by-fund detail was published.",
        "This filing states that the schedule of assets was omitted as not applicable, so no fund detail was published.",
        "This filing references a schedule of assets, but those pages are not present in the public copy.",
        "This filing's attachment is image-only in the public copy, and the pages could not be read even after OCR.",
        "This filing does contain a schedule of assets, but we could not read it — that's our gap, not the filing's.",
        "This filing contains table pages that look like a schedule under a heading we don't yet recognise — our gap, not the filing's.",
      ];
      /* Belt and braces for the promotion above: a plan that entered this
       * block ONLY because of `filedFact` has a matching branch for every
       * disjunct and returns before here. If a future condition ever breaks
       * that, fall through to the curated menu rather than telling a curated
       * plan we could not read its filing. */
      const shapeText = !plan.funds && !plan.isSF && DOC_SHAPE_TEXT[plan.docShape || 0];
      if (shapeText) {
        return `
      <div class="section-label">FUND HOLDINGS</div>
      <p class="max-benefit">${shapeText}
      <a href="https://github.com/evwes/no-app/issues">Contribute it</a>.</p>`;
      }
      if (!plan.funds) return `
      <div class="section-label">FUND HOLDINGS</div>
      <p class="max-benefit">${plan.isSF
        ? "No fund schedule exists for this plan — short-form (5500-SF) filers don't attach audited statements, so the DOL never receives one."
        : "No readable fund schedule in this filing's public copy — the attachment is scanned/absent, or the plan holds assets through a trust that doesn't itemize funds."}
      <a href="https://github.com/evwes/no-app/issues">Contribute it</a>.</p>`;
    }
    // community-sourced fund menu: names and tickers only — returns aren't in
    // filings, so none are shown; ERs are pattern-based estimates like the
    // filed table's
    const funds = orderLineup(plan.funds.map((f) => ({ ...f, value: f.value ?? 0 })));
    const body = funds.map((f) => {
      const er = fundER(f.name);
      return `
      <tr>
        <td class="fund-name-col">
          <div class="fund-name">${esc(f.name)}</div>
          <div class="fund-ticker">${esc(f.ticker)}</div>
        </td>
        <td class="num">${er != null ? er.toFixed(er < 0.1 ? 3 : 2) + "%" : "—"}</td>
      </tr>`;
    }).join("");

    return `
    <div class="section-label">FUND HOLDINGS — ${plan.funds.length} OPTIONS
      <span class="section-sub">${plan.fundsSource ? esc(plan.fundsSource) : "Representative fund menu (community-sourced fund names)"} · performance is not reported in filings · expense ratios are estimates from public fund data</span></div>
    <div class="fund-scroll">
      <table class="fund-table">
        <thead><tr><th class="fund-name-col">Fund Name</th><th>Est. ER</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  }

  function report(plan) {
    // filed detail (financial lines, dates, codes) streams in per-plan; the
    // full report renders only from complete data — never NaN placeholders
    if (plan.dataStatus === "filed" && !plan.detailLoaded)
      return `<div class="report"><p class="max-benefit">Loading this plan's filing…</p></div>`;
    const yoy = plan.assetsYoY == null ? "" :
      `${plan.assetsYoY >= 0 ? "+" : "−"}${Math.abs(plan.assetsYoY)}% YoY`;
    const sourceNote = plan.dataStatus === "filed"
      ? `Financial figures from ${esc(plan.source)}. ${plan.filedFeatures ? (plan.featuresFb
          ? `Match, vesting, and feature details are quoted from the plan's ${plan.featuresFb} audited statements — the newest filing's public copy carries no readable audit notes of its own. A formula can change between plan years, so verify with your plan documents.`
          : "Match, vesting, and feature details quoted from the filing's audited statements — verify with your plan documents.") :"Plan features from the filing's characteristic codes where shown — verify details with your plan documents."}`
      : `Sample data for demonstration — figures are plausible, not filed values.`;
    return `
    <div class="report">
      <div class="report-head">
        <div class="avatar">${esc(plan.company[0])}</div>
        <div>
          <h3 class="report-title">${(() => {
            const first = plan.company.split(" ")[0];
            return plan.planName.toLowerCase().startsWith(first.toLowerCase())
              ? `<mark>${esc(plan.planName.slice(0, first.length))}</mark>${esc(plan.planName.slice(first.length))}`
              : esc(plan.planName);
          })()}</h3>
          ${plan.alias ? `<p class="report-meta">Previously filed as <strong>${esc(plan.alias)}</strong> <span class="muted">(Form 5500 line 4 or an earlier year's filing for this EIN and plan number)</span></p>` : ""}
          <p class="report-meta">EIN ${esc(plan.ein || "—")} · ${esc(plan.city || "—")}, ${esc(plan.state || "")} ${esc(plan.zip || "")}
            ${plan.planTypes.map((t) => `<span class="badge badge-blue">${esc(t)}</span>`).join(" ")}
            <span class="badge badge-gray">${(() => {
              const m = plan.pyb ? +plan.pyb.slice(5, 7) : 1;
              const MO = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              // pye is set only when the plan year ends off the natural
              // 12-month boundary — a short first or final year
              if (plan.pye) return `Plan Year ${MO[m]} ${plan.planYear}–${MO[+plan.pye.slice(5, 7)]} ${+plan.pye.slice(0, 4)} (short year)`;
              if (m <= 1) return `Plan Year ${plan.planYear}`;
              return `Plan Year ${MO[m]} ${plan.planYear}–${MO[m === 1 ? 12 : m - 1]} ${plan.planYear + 1} (fiscal)`;
            })()}</span>
            <span class="badge ${plan.dataStatus === "filed" ? "badge-green" : "badge-gray"}">${plan.dataStatus === "filed" ? "FORM 5500" : "SAMPLE"}</span></p>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat"><p class="stat-label">Plan assets</p><p class="stat-value stat-accent">${plan.assetsB != null ? money(plan.assetsB * 1000) : "—"}</p><p class="stat-sub">${yoy || "&nbsp;"}</p></div>
        <div class="stat"><p class="stat-label">Participants</p><p class="stat-value">${plan.participants ? fmtInt.format(plan.participants) : "—"}</p><p class="stat-sub">${plan.activeParticipants ? fmtInt.format(plan.activeParticipants) + " active · at plan year end" : "at plan year end"}</p></div>
        <div class="stat"><p class="stat-label">Avg expense ratio</p>${(() => {
          const fe = filedAvgER(plan);
          if (fe) return `<p class="stat-value">${fe.er.toFixed(2)}% <span class="est-chip">est.</span></p><p class="stat-sub">weighted, ${fe.matched} of ${fe.of} holdings</p>`;
          const ce = curatedAvgER(plan);
          if (ce) return `<p class="stat-value">${ce.er.toFixed(2)}% <span class="est-chip">est.</span></p><p class="stat-sub">${ce.matched} of ${ce.of} menu funds</p>`;
          if (plan.filedLineup) return `<p class="stat-value">—</p><p class="stat-sub">${plan.filedLineup.funds.length} filed holdings</p>`;
          if (plan.funds) return `<p class="stat-value">—</p><p class="stat-sub">${plan.funds.length} fund options</p>`;
          if (plan.filedFeatures && plan.filedFeatures.menu) return `<p class="stat-value">—</p><p class="stat-sub">${plan.filedFeatures.menu.length} named options</p>`;
          /* THE TRUST'S SCHEDULE D LIST, which the body already renders. Without
           * this the card said "lineup not added" on the SAME PAGE that lists
           * the trust's funds — 61 plans / 874,136 participants, Albertsons
           * 236,172 and Medtronic 55,692 among them. Asked through the canonical
           * predicate with the arguments the body passes, never re-derived. */
          const tsd = plan.mtiaAck && state.trusts
            ? trustScheduleDMenu(state.trusts[plan.mtiaAck],
                !!(plan.funds && plan.funds.length), !!(plan.zeroEOY && plan.detailLoaded))
            : null;
          if (tsd) return `<p class="stat-value">—</p><p class="stat-sub">${tsd.rows.length} funds held by its master trust</p>`;
          /* AND THE DEAD END SAYS WHAT IS TRUE OF THE FILING, NOT OF US.
           * "lineup not added" read as an unfinished database on 52,334 plans /
           * 15.7M participants — the exact label the owner directive condemns:
           * it describes US, not the filing. Each branch below is a fact the
           * store already carries. */
          if (plan.isSF) return `<p class="stat-value">—</p><p class="stat-sub">Short-form filers don't file a schedule of assets</p>`;
          if (plan.zeroEOY && plan.detailLoaded) return `<p class="stat-value">—</p><p class="stat-sub">No year-end assets to hold</p>`;
          return `<p class="stat-value">—</p><p class="stat-sub">No readable schedule of assets in this filing</p>`;
        })()}</div>
        <div class="stat"><p class="stat-label">Recordkeeper</p><p class="stat-value stat-small">${esc(plan.provider || "—")}</p><p class="stat-sub">${plan.provider
          ? esc(plan.filed || "")
          : plan.isSF
            ? "Short-form filers don't file Schedule C, which names service providers"
            : "No recordkeeping provider identified in this filing's Schedule C"}</p></div>
      </div>

      <div class="section-label">EMPLOYER CONTRIBUTIONS <span class="section-sub">${plan.filedFeatures ? `Source: Form 5500 filing${plan.featuresFb ? ` for ${plan.featuresFb}` : ""} (audit notes) — verify details with HR` : "Source: Form 5500 codes + plan document / SPD — verify with HR"}</span></div>
      ${plan.filedFeatures && (plan.filedFeatures.match
          || ((plan.filedFeatures.matchText || plan.filedFeatures.vesting || plan.filedFeatures.nec) && plan.flows.employerM !== 0))
        ? filedContributionCard(plan)
        : plan.contributions ? plan.contributions.map((c) => contributionCard(c, plan)).join("")
          : unknownContributionCard(plan)}

      <div class="two-col">
        <div>
          <div class="section-label">${(() => {
            const m = plan.pyb ? +plan.pyb.slice(5, 7) : 1;
            if (plan.pye) {
              const MO = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              return `${MO[m]}–${MO[+plan.pye.slice(5, 7)]} ${+plan.pye.slice(0, 4)}`;
            }
            return m > 1 ? `FY ${plan.planYear}–${String(plan.planYear + 1).slice(2)}` : plan.planYear;
          })()} CONTRIBUTIONS <span class="section-sub">${plan.dataStatus === "filed" ? "Form 5500 Schedule H" : "sample"}</span></div>
          ${flowsTable(plan)}
        </div>
        <div>
          <div class="section-label">PLAN FEATURES</div>
          ${featuresPanel(plan)}
        </div>
      </div>

      ${fundTable(plan)}

      ${feeSection(plan)}

      <p class="sample-note">${plan.dataStatus === "filed" ? "ⓘ" : "⚠"} ${sourceNote}</p>
    </div>`;
  }

  /* ---- table -------------------------------------------------------------- */

  const MAX_ROWS = 150;

  function planRow(plan) {
    const open = state.expanded.has(plan.id || plan.ticker);
    const pills = [
      pill(plan.megaBackdoor, "Mega backdoor"),
      plan.brokerage != null ? pill(plan.brokerage !== "None", "Brokerage") : "",
      plan.vesting === "Immediate" ? `<span class="pill pill-neutral">Immediate vesting</span>` : "",
    ].filter(Boolean).join("");
    return `
    <tr class="plan-tr ${open ? "plan-tr-open" : ""}" data-id="${esc(plan.id || plan.ticker)}">
      <td>
        <div class="sponsor-name">${esc(publicName(plan) || plan.company)} ${plan.ticker ? `<span class="plan-ticker">${esc(plan.ticker)}</span>` : ""}</div>${publicName(plan) ? `<div class="section-sub">filed by ${esc(plan.company)}</div>` : ""}
        <div class="sponsor-sub">${esc(plan.planName)}</div>
      </td>
      <td class="industry-col">${esc(plan.industry || "—")}</td>
      <td class="right mono">${plan.participants ? fmtCompact.format(plan.participants) : "—"}</td>
      <td class="right mono">${plan.assetsB != null ? money(plan.assetsB * 1000) : "—"}</td>
      <td class="right mono">${plan.avgBal != null ? money(plan.avgBal / 1e6) : "—"}</td>
      <td class="right mono">${plan.avgContrib != null ? money(plan.avgContrib / 1e6) : "—"}</td>
    </tr>
    ${open ? `<tr class="detail-tr"><td colspan="6"><div class="detail-clamp">${report(plan)}</div></td></tr>` : ""}`;
  }

  /* The hero totals describe the CATEGORY the filters select, so the
   * full-filing chip (and plan type / industry / recordkeeper / match type)
   * re-total all four figures. The free-text query is deliberately excluded:
   * searching one company should not turn a page-level summary into that
   * company's balance sheet — the result line under the toolbar already
   * reports the search. Money figures count only plans with filed financials,
   * as they always have. */
  let heroSig = null;
  function renderHero() {
    // filtering 110k plans is cheap but not free, and render() runs on every
    // keystroke — the totals only move when a FILTER moves, so memo on that
    const sig = JSON.stringify([state.filters, state.planType, state.industry,
      state.provider, state.matchType, state.plans.length]);
    if (sig === heroSig) return;
    heroSig = sig;
    const scoped = state.plans.filter(passesFilters);
    const filed = scoped.filter((p) => p.dataStatus === "filed");
    const ppl = filed.reduce((s, p) => s + (p.participants || 0), 0);
    const assets = filed.reduce((s, p) => s + (p.assetsB || 0), 0);
    $("statPlans").textContent = fmtInt.format(scoped.length);
    /* Say WHICH headcount this is. A Form 5500 reports participants at both
     * ends of the plan year, and the site uses the END-of-year count
     * (partEOY, falling back to the beginning-of-year figure when a filing
     * has no EOY subtotal). Summed over full-form filers the two bases differ
     * by 2.2M — 105.0M end-of-year against 102.8M beginning-of-year — so a
     * reader reconciling this against any other source cannot do it unless
     * the page says which one it is. Both numbers are honest; only the
     * silence was not. */
    $("statPpl").textContent = fmtCompact.format(ppl);
    $("statPpl").title = "Participants at the end of each plan's reported plan year, summed across the plans shown";
    // a filtered slice can fall well under a trillion — "$0.43T" reads worse
    // than "$434B", so the unit follows the number
    $("statAssets").textContent = assets >= 1000
      ? "$" + (assets / 1000).toFixed(2) + "T"
      : "$" + fmtCompact.format(assets * 1e9);
    $("statAvgBal").textContent = ppl ? "$" + fmtCompact.format((assets * 1e9) / ppl) : "—";
    // say plainly what the totals cover whenever they are not the whole universe
    const f = state.filters;
    const bits = [
      f.fullFiling ? "full-filing plans (audited financial statement attached)" : "",
      f.brokerage ? "with a brokerage window" : "",
      f.megaBackdoor ? "with after-tax / mega backdoor" : "",
      f.immediateVesting ? "with immediate vesting" : "",
      state.planType || "", state.industry || "",
      state.provider ? state.provider + " plans" : "",
      state.matchType ? state.matchType.replace(/-/g, " ") + " match" : "",
    ].filter(Boolean);
    const el = $("heroScope");
    el.textContent = bits.length ? "Totals cover " + bits.join(" · ") : "";
    el.hidden = !bits.length;
  }

  function render() {
    renderHero(); // no-op unless a filter changed (memoised)
    // the map reads the same filtered set, so it repaints with the table
    if (state.view === "map" && MAP.points) renderMap();
    const plans = visiblePlans();
    const limit = state.rowLimit || MAX_ROWS;
    $("tbody").innerHTML = plans.slice(0, limit).map(planRow).join("");
    $("mapPick").hidden = !state.dotPick;
    if (state.dotPick) $("mapPickText").textContent =
      `Showing ${fmtInt.format(plans.length)} plan${plans.length === 1 ? "" : "s"} from the dot selected on the map.`;
    $("empty").hidden = plans.length > 0;
    const more = plans.length - limit;
    $("showMore").hidden = more <= 0;
    if (more > 0) $("showMore").textContent = `Show ${fmtInt.format(Math.min(more, 500))} more of ${fmtInt.format(more)}`;
    // with the full-filing chip on, the denominator is the filtered universe,
    // not all 110,555 — "3 of 110,555" would misdescribe what was searched
    const universe = state.filters.fullFiling
      ? state.plans.reduce((n, p) => n + ((p.cf & 8) ? 0 : 1), 0)
      : state.plans.length;
    $("resultCount").textContent =
      `${fmtInt.format(plans.length)} of ${fmtInt.format(universe)}` +
      (state.filters.fullFiling ? " full-filing plans" : " plans") +
      (plans.length > limit ? ` · showing top ${fmtInt.format(limit)}` : "") +
      (state.query.trim() ? ` for “${state.query.trim()}”` : "") +
      (state.deepLinkMiss ? ` — the shared link named a plan (${state.deepLinkMiss}) that isn’t in the current filings; showing everything instead` : "");
    document.querySelectorAll(".col-sort").forEach((b) => {
      b.classList.toggle("sorted", b.dataset.sort === state.tableSort.key);
      b.dataset.dir = state.tableSort.dir > 0 ? "asc" : "desc";
    });
  }


  /* ---- map view -------------------------------------------------------------
   * Where each plan was FILED FROM, not where its participants are. A Form
   * 5500 carries the sponsor's address — usually a headquarters or a benefits
   * office — so a 250,000-participant plan filed from one Manhattan ZIP is one
   * dot in Manhattan, not 250,000 people there. The map says so on its face.
   *
   * Nothing here is in the boot payload: us-states.json (16 KB gz) and
   * map-points.json (231 KB gz) are fetched the first time a reader opens the
   * Map view. Points are row-aligned to the boot file, so the map reuses
   * passesFilters() exactly as the table does — one filter implementation, two
   * views, and no way for them to disagree.
   *
   * Short-form filers are excluded by construction: map-points.json only
   * carries full-form rows, which is also what the owner asked for. */
  const MAP = { states: null, points: null, loading: false, zoom: 1, cx: 0.5, cy: 0.5, autoState: null, groups: [] };
  const MAP_W = 960, MAP_H = 600;
  // projected bounding box per state, computed lazily from the outlines the
  // map already draws — so zoom-to-state can never disagree with the drawing
  const STATE_BBOX = {};
  function stateBBox(code) {
    if (STATE_BBOX[code]) return STATE_BBOX[code];
    if (!MAP.states) return null;
    const wanted = Object.keys(US_STATES).find((n) => US_STATES[n] === code);
    const f = MAP.states.features.find((x) => (x.properties.name || "").toLowerCase() === wanted);
    if (!f) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const ring of poly) for (const [lon, lat] of ring) {
      const q = project(lat, lon);
      if (!q) continue;
      if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
      if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
    }
    return (STATE_BBOX[code] = x0 < x1 ? [x0, y0, x1, y1] : null);
  }
  function fitState(code) {
    const b = stateBBox(code);
    if (!b) return;
    const pad = 1.35; // breathing room around the outline
    MAP.zoom = Math.max(1, Math.min(8, Math.min(MAP_W / ((b[2] - b[0]) * pad), MAP_H / ((b[3] - b[1]) * pad))));
    MAP.cx = (b[0] + b[2]) / 2 / MAP_W;
    MAP.cy = (b[1] + b[3]) / 2 / MAP_H;
  }

  /* Albers conic equal-area. One function, three parameter sets: the lower 48,
   * then Alaska and Hawaii projected on their own parallels and placed as
   * insets — dropping them would hide real plans, and stretching one projection
   * over Alaska would misplace them. */
  function albers(lat, lon, p) {
    const rad = Math.PI / 180;
    const n = (Math.sin(p.p1 * rad) + Math.sin(p.p2 * rad)) / 2;
    const C = Math.cos(p.p1 * rad) ** 2 + 2 * n * Math.sin(p.p1 * rad);
    const rho = Math.sqrt(C - 2 * n * Math.sin(lat * rad)) / n;
    const rho0 = Math.sqrt(C - 2 * n * Math.sin(p.lat0 * rad)) / n;
    const theta = n * ((lon - p.lon0) * rad);
    /* The textbook Albers y is `rho0 - rho*cos(theta)`, which increases going
     * NORTH because it assumes mathematical axes. SVG's y increases DOWNWARD,
     * so used as-is it draws the country upside down: Maine at the bottom,
     * Florida at the top. Measured before the fix — Portland ME landed at
     * y=494 and Miami at y=64 on a 600-tall canvas. Negating puts them at 106
     * and 536. The dots were always on the right plans and the state outlines
     * always matched the dots, which is exactly why this survived a map test
     * that checks alignment: both halves were flipped together, so they agreed
     * with each other and disagreed with the country. */
    return [rho * Math.sin(theta), -(rho0 - rho * Math.cos(theta))];
  }
  const CONUS = { p1: 29.5, p2: 45.5, lat0: 37.5, lon0: -96, k: 1280, dx: 480, dy: 300 };
  const ALASKA = { p1: 55, p2: 65, lat0: 60, lon0: -154, k: 380, dx: 150, dy: 500 };
  const HAWAII = { p1: 8, p2: 18, lat0: 20, lon0: -157, k: 900, dx: 320, dy: 520 };

  function project(lat, lon) {
    let p = CONUS;
    if (lat > 50 && lon < -128) p = ALASKA;          // Alaska
    else if (lat < 25 && lon < -140) p = HAWAII;      // Hawaii
    else if (lon > -70 && lat < 20) return null;      // Puerto Rico: no inset yet
    const [x, y] = albers(lat, lon, p);
    return [p.dx + x * p.k, p.dy + y * p.k];
  }

  async function ensureMapData() {
    if (MAP.points || MAP.loading) return;
    MAP.loading = true;
    try {
      const [st, pts] = await Promise.all([
        fetch("us-states.json").then((r) => r.ok ? r.json() : null),
        fetch("map-points.json").then((r) => r.ok ? r.json() : null),
      ]);
      MAP.states = st;
      MAP.points = pts;
    } catch { /* leave null; renderMap says so rather than drawing nothing */ }
    MAP.loading = false;
    renderMap();
  }

  function statePaths() {
    if (!MAP.states) return "";
    const out = [];
    for (const f of MAP.states.features) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      let d = "";
      for (const poly of polys) {
        for (const ring of poly) {
          let started = false;
          for (const [lon, lat] of ring) {
            const q = project(lat, lon);
            if (!q) { started = false; continue; }
            d += (started ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1);
            started = true;
          }
          if (started) d += "Z";
        }
      }
      if (d) {
        const code = US_STATES[(f.properties.name || "").toLowerCase()] || "";
        const sel = code && code === MAP.autoState ? " map-state-sel" : "";
        out.push(`<path class="map-state${sel}" data-state="${code}" d="${d}"><title>${esc(f.properties.name)}</title></path>`);
      }
    }
    return out.join("");
  }

  // asset bands, matching the legend
  const BANDS = [[5e6, "b1", "Under $5M"], [25e6, "b2", "$5M – $25M"],
    [100e6, "b3", "$25M – $100M"], [Infinity, "b4", "$100M+"]];
  const bandOf = (assets) => BANDS.find(([lim]) => assets < lim)[1];

  function renderMap() {
    const canvas = $("mapCanvas");
    if (!MAP.points || !MAP.states) {
      canvas.innerHTML = MAP.loading
        ? `<p class="map-loading">Loading the map…</p>`
        : `<p class="map-loading">The map data didn’t load. Reload the page to try again.</p>`;
      return;
    }
    const pts = MAP.points;
    /* map-points.json is POSITIONAL: rows[i] is the coordinate for plan i of
     * the boot payload. If it was built against a different universe, every
     * row after the first inserted plan names a different plan — and the map
     * still draws, confidently, in the wrong places. It happened once: a
     * pipeline run grew the universe by 1,227 plans while this file stayed
     * behind, and 23% of the dots moved to the wrong plan with nothing on
     * screen to say so.
     *
     * Drawing nothing is the honest failure. Drawing the wrong thing is not. */
    if (pts.universe != null && pts.universe !== state.plans.length) {
      canvas.innerHTML = `<p class="map-loading">The map is being rebuilt for the latest filings and is briefly unavailable. Every plan is still in the table.</p>`;
      $("mapStats").innerHTML = "";
      $("mapLegend").innerHTML = "";
      $("mapNote").textContent = "";
      return;
    }
    // cluster in PROJECTED space so a cluster is a fixed distance on screen at
    // the current zoom, not a fixed distance on the ground
    const cell = 26 / MAP.zoom;
    const cells = new Map();
    let shown = 0, unplaceable = 0;
    /* The panel says "Every filter above applies", and it has to be true.
     * passesFilters() covers the chips and the dropdowns but NOT the search
     * box, which visiblePlans() applies separately via matchesQuery — so a
     * search for "devon" listed 3 plans in the table while the map drew 67,914
     * and reported their totals underneath a sentence promising otherwise.
     * A caption that misdescribes what is drawn is a wrong statement on the
     * page, not a cosmetic bug. */
    const mapQ = state.query.trim().toLowerCase();
    /* typing a state selects it: zoom to its outline once per state change,
     * and reset to the whole country when the state query is cleared. Manual
     * zoom/pan afterwards is untouched — autoState only moves the view when
     * it CHANGES. */
    const sc = stateFromQuery(mapQ);
    if (sc !== MAP.autoState) {
      MAP.autoState = sc;
      if (sc) fitState(sc);
      else { MAP.zoom = 1; MAP.cx = 0.5; MAP.cy = 0.5; }
    }
    for (const plan of state.plans) {
      if (plan.cf & 8) continue;                    // short-form: not on this map
      if (!matchesQuery(plan, mapQ) || !passesFilters(plan)) continue;
      const ci = pts.rows[plan.row];
      if (ci == null || ci < 0) { unplaceable++; continue; }
      const c = pts.coords[ci];
      const q = project(c[0], c[1]);
      if (!q) { unplaceable++; continue; }
      shown++;
      const key = Math.round(q[0] / cell) + ":" + Math.round(q[1] / cell);
      let g = cells.get(key);
      if (!g) { g = { x: 0, y: 0, n: 0, ppl: 0, assets: 0, plans: [] }; cells.set(key, g); }
      g.x += q[0]; g.y += q[1]; g.n++;
      g.plans.push(plan);
      g.ppl += plan.participants || 0;
      // assetsB (billions) is the field the hero totals use; assetsEOY exists
      // only on the pre-merge boot record, so reading it here summed to $0
      g.assets += (plan.assetsB || 0) * 1e9;
    }

    const groups = [...cells.values()].sort((a, b) => b.n - a.n);
    MAP.groups = groups; // dot clicks resolve through this, by index
    const maxN = groups.length ? groups[0].n : 1;
    const circles = groups.map((g, gi) => {
      const x = g.x / g.n, y = g.y / g.n;
      // area ∝ plan count, floored so a single plan is still clickable
      const r = Math.max(4, Math.min(34, 4 + 30 * Math.sqrt(g.n / maxN)));
      const avg = g.assets / g.n;
      const label = g.n >= 3 ? `<text class="map-count" x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}">${g.n >= 1000 ? (g.n / 1000).toFixed(1) + "k" : g.n}</text>` : "";
      const one = g.n === 1 ? esc(g.plans[0].company) : `${fmtInt.format(g.n)} plans`;
      return `<g class="map-dot ${bandOf(avg)}" data-g="${gi}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}">` +
        `<title>${one} · ${fmtCompact.format(g.ppl)} participants · $${fmtCompact.format(g.assets)} — click to open in the table</title>` +
        `</circle>${label}</g>`;
    }).join("");

    const vw = MAP_W / MAP.zoom, vh = MAP_H / MAP.zoom;
    const vx = Math.max(0, Math.min(MAP_W - vw, MAP.cx * MAP_W - vw / 2));
    const vy = Math.max(0, Math.min(MAP_H - vh, MAP.cy * MAP_H - vh / 2));
    canvas.innerHTML =
      `<svg id="mapSvg" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" ` +
      `preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plans by filing location">` +
      `<g class="map-states">${statePaths()}</g><g class="map-dots">${circles}</g></svg>` +
      `<div class="map-zoom"><button id="mapIn" aria-label="Zoom in">+</button>` +
      `<button id="mapOut" aria-label="Zoom out">−</button></div>`;

    const ppl = groups.reduce((s, g) => s + g.ppl, 0);
    const assets = groups.reduce((s, g) => s + g.assets, 0);
    $("mapStats").innerHTML =
      `<div><span>Plans</span><strong>${fmtInt.format(shown)}</strong></div>` +
      `<div><span>Participants</span><strong>${fmtCompact.format(ppl)}</strong></div>` +
      `<div><span>Assets</span><strong>$${fmtCompact.format(assets)}</strong></div>` +
      `<div><span>Avg / plan</span><strong>${shown ? "$" + fmtCompact.format(assets / shown) : "—"}</strong></div>`;
    $("mapLegend").innerHTML = "<span class=\"legend-title\">Average plan assets</span>" +
      BANDS.map(([, cls, txt]) => `<span class="legend-item"><i class="dot ${cls}"></i>${txt}</span>`).join("");
    // the two honest caveats, always visible, never buried
    $("mapNote").textContent =
      `Each dot is where the plan was FILED FROM — the sponsor's address on the Form 5500, ` +
      `usually a headquarters or benefits office, not where participants live or work. ` +
      `Short-form filers are excluded: they file no audited attachment, so none of the filters above apply to them.` +
      (unplaceable ? ` ${fmtInt.format(unplaceable)} matching plan${unplaceable === 1 ? "" : "s"} could not be placed: ${unplaceable === 1 ? "its" : "their"} filed ZIP has no published centroid.` : "");

    $("mapIn").onclick = () => { MAP.zoom = Math.min(8, MAP.zoom * 1.6); renderMap(); };
    $("mapOut").onclick = () => { MAP.zoom = Math.max(1, MAP.zoom / 1.6); renderMap(); };
    const svg = $("mapSvg");
    let drag = null;
    /* Capture the pointer only once a DRAG has actually started. Capturing on
     * pointerdown retargets every later pointer event — including the derived
     * CLICK — to the svg element itself, so e.target was never a dot or a
     * state and every click handler below fell through silently. The map test
     * passed anyway because it dispatched synthetic MouseEvents, which skip
     * pointer capture; it now drives real mouse input for exactly this
     * reason. */
    svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: MAP.cx, cy: MAP.cy, moved: false, id: e.pointerId }; });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) {
        drag.moved = true;
        try { svg.setPointerCapture(drag.id); } catch { /* pointer already gone */ }
      }
      if (!drag.moved) return;
      const rect = svg.getBoundingClientRect();
      MAP.cx = Math.max(0, Math.min(1, drag.cx - (e.clientX - drag.x) / rect.width / MAP.zoom));
      MAP.cy = Math.max(0, Math.min(1, drag.cy - (e.clientY - drag.y) / rect.height / MAP.zoom));
      renderMap();
    });
    svg.addEventListener("pointerup", () => { const moved = drag && drag.moved; drag = null; if (moved) suppressClick = true; });
    // wheel zoom toward the cursor: the point under the pointer stays put
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
      const px = (vx + fx * vw) / MAP_W, py = (vy + fy * vh) / MAP_H; // map-space point under cursor
      const nz = Math.max(1, Math.min(8, MAP.zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
      if (nz === MAP.zoom) return;
      // keep (px,py) at the same screen fraction after the zoom
      MAP.cx = px + (0.5 - fx) / nz;
      MAP.cy = py + (0.5 - fy) / nz;
      MAP.zoom = nz;
      renderMap();
    }, { passive: false });
    /* click = select. A dot pulls its plans into the table (a single-plan dot
     * opens that plan's report); a state click types the state into the
     * search box, which filters everything and zooms here. A drag never
     * counts as a click. */
    svg.addEventListener("click", (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const dot = e.target.closest(".map-dot");
      if (dot) {
        const g = MAP.groups[+dot.dataset.g];
        if (!g) return;
        state.dotPick = new Set(g.plans.map((p) => p.id));
        if (g.n === 1) {
          const plan = g.plans[0];
          state.expanded.add(plan.id);
          ensureDetail(plan);
        }
        setView("table");
        render();
        window.scrollTo({ top: $("tableSection").offsetTop - 70, behavior: "smooth" });
        return;
      }
      const st = e.target.closest(".map-state");
      if (st && st.dataset.state) {
        $("search").value = st.dataset.state;
        state.query = st.dataset.state;
        state.dotPick = null;
        render();
      }
    });
  }
  let suppressClick = false; // a completed drag must not fire the click handler

  function setView(which) {
    const map = which === "map";
    $("mapSection").hidden = !map;
    $("tableSection").hidden = map;
    $("viewMap").classList.toggle("view-on", map);
    $("viewTable").classList.toggle("view-on", !map);
    $("viewMap").setAttribute("aria-pressed", String(map));
    $("viewTable").setAttribute("aria-pressed", String(!map));
    state.view = which;
    if (map) { ensureMapData(); if (MAP.points) renderMap(); }
  }
  $("viewMap").addEventListener("click", () => setView("map"));
  $("viewTable").addEventListener("click", () => setView("table"));

  /* ---- events -------------------------------------------------------------- */

  $("search").addEventListener("input", (ev) => {
    state.query = ev.target.value;
    state.rowLimit = MAX_ROWS;
    state.dotPick = null; // typing supersedes a map-dot selection
    render();
  });

  $("mapPickClear").addEventListener("click", () => {
    state.dotPick = null;
    render();
  });

  document.querySelectorAll(".chip[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.filter;
      state.filters[key] = !state.filters[key];
      btn.classList.toggle("chip-on", state.filters[key]);
      state.rowLimit = MAX_ROWS;
      render();
    });
  });

  $("providerFilter").addEventListener("change", (ev) => { state.provider = ev.target.value; state.rowLimit = MAX_ROWS; render(); });
  $("industryFilter").addEventListener("change", (ev) => { state.industry = ev.target.value; state.rowLimit = MAX_ROWS; render(); });
  $("typeFilter").addEventListener("change", (ev) => { state.planType = ev.target.value; state.rowLimit = MAX_ROWS; render(); });
  $("matchTypeFilter").addEventListener("change", (ev) => { state.matchType = ev.target.value; state.rowLimit = MAX_ROWS; render(); });

  $("showMore").addEventListener("click", () => {
    state.rowLimit = (state.rowLimit || MAX_ROWS) + 500;
    render();
  });

  document.querySelectorAll(".col-sort").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (state.tableSort.key === key) state.tableSort.dir = -state.tableSort.dir;
      else state.tableSort = { key, dir: key === "company" ? 1 : -1 };
      render();
    });
  });

  $("tbody").addEventListener("click", (ev) => {
    const tabBtn = ev.target.closest(".lineup-tab");
    if (tabBtn) {
      const tr = tabBtn.closest(".detail-tr");
      const prev = tr && tr.previousElementSibling;
      const id = prev ? prev.dataset.id : null;
      if (id) { state.lineupTab[id] = tabBtn.dataset.tab; render(); }
      return;
    }
    if (ev.target.closest("a") || ev.target.closest(".detail-tr")) return;
    const row = ev.target.closest(".plan-tr");
    if (!row) return;
    const id = row.dataset.id;
    state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
    if (state.expanded.has(id)) ensureDetail(state.plans.find((p) => p.id === id));
    // keep a shareable link to the open plan in the URL
    const last = [...state.expanded].pop();
    history.replaceState(null, "", last ? "#plan=" + encodeURIComponent(last) : location.pathname + location.search);
    render();
  });

  /* ---- init ----------------------------------------------------------------- */

  loadPlans().then(() => {
    // top recordkeepers by plan count
    const counts = new Map();
    for (const p of state.plans) if (p.provider) counts.set(p.provider, (counts.get(p.provider) || 0) + 1);
    const providers = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k]) => k);
    for (const p of providers) {
      const opt = document.createElement("option");
      opt.value = p; opt.textContent = p;
      $("providerFilter").appendChild(opt);
    }
    const industries = [...new Set(state.plans.map((p) => p.industry).filter(Boolean))].sort();
    for (const ind of industries) {
      const opt = document.createElement("option");
      opt.value = ind; opt.textContent = ind;
      $("industryFilter").appendChild(opt);
    }
    renderHero();
    /* Resolve a #plan= id TOLERANTLY. plan.id is `ein|pn|ticker`, and an exact
     * match was the only thing accepted — so any link whose id is not
     * byte-identical fell through to the homepage with no report and no
     * message. Two real ways that happens:
     *
     *  - scripts/build-seo-pages.mjs writes the EIN with a dash
     *    ("91-1144442|001|MSFT") while the app builds it without one. Every
     *    "Open the interactive report" link on all 5,062 published SEO pages —
     *    the crawlable pages that are the growth engine — pointed nowhere.
     *  - the id embeds the TICKER, so a company changing ticker or being
     *    acquired silently breaks every link ever shared to that plan.
     *
     * Fixing the generator only helps pages built after the next merge. This
     * repairs the links that are already published and indexed, and makes the
     * failure visible instead of silent when nothing matches at all. */
    function resolveHashId(raw) {
      const id = decodeURIComponent(raw);
      let hit = state.plans.find((p) => p.id === id);
      if (hit) return hit;
      const norm = (v) => String(v).replace(/[^0-9a-z|]/gi, "").toUpperCase();
      const want = norm(id);
      hit = state.plans.find((p) => norm(p.id) === want);
      if (hit) return hit;
      const [ein, pn] = want.split("|");
      if (!ein || !pn) return null;
      return state.plans.find((p) => {
        const parts = norm(p.id).split("|");
        return parts[0] === ein && parts[1] === pn;      // ticker may have changed
      }) || null;
    }

    // deep link: #plan=<id> opens that plan's report directly
    const m = location.hash.match(/^#plan=(.+)$/);
    if (m) {
      const plan = resolveHashId(m[1]);
      if (plan) {
        state.query = plan.company || "";
        $("search").value = state.query;
        state.expanded.add(plan.id);
        ensureDetail(plan);
      } else {
        // say so rather than showing the homepage as if nothing was asked for
        state.deepLinkMiss = decodeURIComponent(m[1]);
      }
    }
    render();
    if (state.expanded.size) {
      const tr = document.querySelector(".plan-tr.open") || document.querySelector(".detail-tr");
      if (tr) tr.scrollIntoView({ block: "start" });
    }
    // #plan= links must also work while the app is already open (shared links,
    // back/forward). replaceState doesn't fire hashchange, so no loop with the
    // hash bookkeeping done on manual expand/collapse.
    window.addEventListener("hashchange", () => {
      const hm = location.hash.match(/^#plan=(.+)$/);
      if (!hm) return;
      const plan = resolveHashId(hm[1]);
      if (!plan) {
        /* Clear what was on screen. Leaving the previously opened report up
         * beside "that link didn't resolve" invites the reader to take the
         * plan they can see for the plan they asked for — a different plan's
         * assets and match formula under someone else's link. */
        state.deepLinkMiss = decodeURIComponent(hm[1]);
        state.expanded.clear();
        state.query = "";
        $("search").value = "";
        render();
        return;
      }
      state.deepLinkMiss = null;
      state.query = plan.company || "";
      $("search").value = state.query;
      state.expanded.clear();
      state.expanded.add(plan.id);
      ensureDetail(plan);
      render();
      const tr = document.querySelector(".plan-tr.open") || document.querySelector(".detail-tr");
      if (tr) tr.scrollIntoView({ block: "start" });
    });
  });
})();
