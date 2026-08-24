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

  const state = {
    query: "",
    filters: { brokerage: false, megaBackdoor: false, immediateVesting: false, fullFiling: false },
    provider: "",
    industry: "",
    planType: "",
    matchType: "",
    tableSort: { key: "assets", dir: -1 },
    expanded: new Set(),
    lineupTab: {},
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
      ticker: filed.ticker,
      company: filed.company,
      // FILED beats curated wherever both exist — the overlay predates the
      // extraction pipeline and can go stale; filings are re-pulled weekly
      provider: filed.recordkeeper || c.provider || null,
      providerFiled: !!filed.recordkeeper,
      planName: titlePlanName(filed.planName),
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
    return (await shardCache.get(sid))[key];
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
      const lu = ownKey ? await fetchEntry(ownKey) : null;
      // use the plan's own schedule unless it is missing or majority
      // "Investment in Master Trust" — then the trust's real holdings win
      let ownUsable = !!(lu && lu.confident && lu.funds && lu.funds.length);
      let trustPointer = !!(lu && lu.trustPtr);
      if (ownUsable && plan.trustKey) {
        const tot = lu.funds.reduce((a, f) => a + f.value, 0) || 1;
        const mti = lu.funds.filter((f) => f.type === "Master trust interest" || /master trust/i.test(f.name))
          .reduce((a, f) => a + f.value, 0);
        if (mti / tot > 0.5) { ownUsable = false; trustPointer = true; }
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
        // filed evidence overrides curated values (curated can be stale)
        if (ff.roth) plan.roth = true;
        if (ff.afterTax) plan.afterTax = true;
        if (ff.autoEnroll) {
          plan.autoEnroll = ff.autoEnroll === true ? "enrollment is automatic (per filing)" : ff.autoEnroll;
        }
        if (ff.vesting) {
          plan.vesting = ff.vesting;
          // enrich a bare "Graded schedule" with the rate stated in the quote
          const g = ff.vesting === "Graded schedule" && ff.vestingText &&
            ff.vestingText.match(/(\d{1,2}) ?(?:percent|%) (?:per|each|for each) year/i);
          if (g) plan.vesting = `Graded — ${g[1]}%/year`;
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

  function matchesQuery(plan, q) {
    if (!q) return true;
    if (!plan.hay) {
      plan.hay = (plan.company + " " + plan.ticker + " " + (plan.provider || "") + " " + plan.planName +
        " " + plan.planTypes.join(" ") + " " + (plan.city || "") + " " + (plan.state || "") + " " + (plan.ein || "")).toLowerCase();
      plan.hayNorm = plan.hay.replace(/[^a-z0-9]/g, "");
    }
    // bare two-letter query = state filter ("wa", "tx")
    if (q.length === 2 && plan.state && plan.state.toLowerCase() === q) return true;
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
    const out = [];
    for (const p of state.plans) {
      if (!matchesQuery(p, q) || !passesFilters(p)) continue;
      p.rank = q ? searchRank(p, q) : 0;
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
    /* A match quote is only evidence of a match. Measured across all 62,377
     * lineups carrying features: 52,514 have a match quote, 8,704 of those have
     * NO extracted formula, and 4,350 of those quotes contain no digit at all.
     * A match formula cannot be stated without a number, so those paragraphs
     * are something else entirely -- "Participant Accounts Each participant's
     * account is credited with...", "Description of the Plan (continued)" --
     * and rendering them under the Employer Match heading asserts the filing
     * said something it did not. A further 669 lineups use one sentence as the
     * evidence for both the match and the vesting schedule; where that sentence
     * leads with "Vesting" it is the vesting note, not the match.
     *
     * Suppressed rather than hedged: a quote with no number in it cannot be
     * made true by a caveat. Where nothing survives, the card says so, which is
     * the same three-state honesty the vesting line below already uses. */
    const matchQuote = ff.matchText
      && /\d/.test(ff.matchText)
      && !/^\s*Vesting\b/i.test(ff.matchText)
      ? ff.matchText : null;
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
      ${ff.frozen ? `<p class="max-benefit"><strong>⚠ Plan frozen or terminated</strong> — the filing states contributions have been discontinued; details below describe the plan as it operated.</p>${ff.frozenText ? `<blockquote class="quote">“${esc(ff.frozenText)}”</blockquote>` : ""}` : ""}
      ${ff.match ? `<p class="max-benefit">Formula: <strong>${esc(ff.match)}</strong>${ff.safeHarbor === "match" ? " · safe harbor" : ""}${ff.trueUp ? " · with annual true-up" : ""}${/discretionary/i.test(ff.match) && plan.flows.employerM === 0 ? " · <strong>none made this plan year</strong>" : ""}</p>` : ""}
      ${matchQuote ? `<blockquote class="quote">“${esc(matchQuote)}”</blockquote>` : ""}
      ${!ff.match && !matchQuote ? `<p class="max-benefit">Employer match: <span class="feat-unknown">no formula stated in the audited notes</span> — check the plan's SPD.</p>` : ""}
      ${ff.nec ? `<p class="max-benefit">Employer nonelective contribution: <strong>${esc(ff.nec)}</strong>${ff.safeHarbor === "nonelective" ? " · safe harbor" : ""}</p>` : ""}
      ${ff.necText ? `<blockquote class="quote">“${esc(ff.necText)}”</blockquote>` : ""}
      ${schRLine(plan)}
      ${ff.vesting ? `<p class="max-benefit">Employer-money vesting: <strong>${esc(ff.vesting)}</strong></p>` : ""}
      ${ff.vestingText ? `<blockquote class="quote">“${esc(ff.vestingText)}”</blockquote>` : ""}
      ${!ff.vesting && !ff.vestingText ? (
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
      return `
      <div class="contrib-card">
        <div class="contrib-head">
          <span class="contrib-title">Employer Contributions</span>
          <span class="badge badge-gray">SHORT-FORM FILING</span>
        </div>
        <p class="max-benefit">${filedLine}
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
   * didn't state it, or the attachment couldn't be read at all. */
  function whyUnknown(plan) {
    if (plan.isSF) return "Not collected — DOL short-form filing";
    if (plan.filedFeatures) return "Not stated in the audited notes";
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
      rows.push(`<div class="feat-block"><div class="feat-row"><span>Eligibility</span><span class="feat-on">✓ ${esc(ff.eligibility)}</span></div>
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
  function filedAvgER(plan) {
    const lu = plan.filedLineup;
    if (!lu) return null;
    let total = 0, matchedVal = 0, weighted = 0, matched = 0;
    for (const f of lu.funds) {
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
      const noPublicPrice = f.cit || /collective trust|pooled separate/i.test(f.type || "");
      // A collective trust has no ticker and no published fee. Where its name
      // identifies the trust edition of a specific registered fund, that fund
      // is shown with a "*" — what the holding tracks, not what it is; its
      // expense ratio is the RETAIL class, an upper bound on the plan's own.
      const info = tab === "menu" ? fundTickerInfo(f.name, f.type) : null;
      // employer stock IS a listed security: the plan's own ticker names it
      const stockRow = /company stock|employer (security|stock)/i.test((f.type || "") + " " + f.name);
      const tk = stockRow ? (plan.ticker || null) : (info ? info.tk : null);
      const star = !stockRow && info && info.comparable;
      if (star) starred = true;
      const er = tab !== "menu" || stockRow ? null
        : star ? info.er : (noPublicPrice ? null : fundER(f.name));
      return `
      <tr>
        <td class="fund-name-col"><div class="fund-name">${esc(f.name)}</div>${tk ? `<div class="fund-ticker">${esc(tk)}${star ? "*" : ""}</div>` : ""}</td>
        <td class="fund-type">${esc(f.type || "—")}</td>
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
    const covPct = tab === "menu" && !lu.fromTrust && planAssets && total
      ? (total / planAssets) * 100 : null;
    const coverage = covPct == null || (covPct >= 95 && covPct <= 105) ? "" : `
    <p class="max-benefit">${covPct < 95
      ? `<strong>This table is ${covPct < 50 ? "a small part of" : "not all of"} the plan.</strong> The holdings below total ${money(total / 1e6)}, about ${covPct.toFixed(0)}% of the ${money(planAssets / 1e6)} this plan reports on its Schedule H. The rest is money the filing accounts for that its schedule of assets does not itemise here.`
      : `<strong>These holdings exceed the plan's reported assets.</strong> They total ${money(total / 1e6)} against ${money(planAssets / 1e6)} reported on Schedule H — about ${covPct.toFixed(0)}%. Treat the table as unreconciled.`}</p>`;
    const npd = tab === "menu" && !lu.fromTrust && ffl && ffl.nonPartDirected ? `
    <p class="max-benefit"><strong>Part of these holdings is employer-directed.</strong> The filing states some of this plan's assets are not participant-directed — those holdings are listed here with the menu, so their share of the table is not a share of what participants chose.</p>
    <blockquote class="quote">“${esc(ffl.nonPartDirectedText)}”</blockquote>
    ${ffl.nonPartDirectedDiversify ? `<blockquote class="quote">“${esc(ffl.nonPartDirectedDiversify)}”</blockquote>` : ""}` : "";
    return `
    <div class="section-label">${lu.fromTrust && tab !== "sma" ? `MASTER TRUST HOLDINGS — ${lu.funds.length}` : `FUND HOLDINGS — ${tab === "sma" ? lu.sma.length + " SECURITIES" : lu.funds.length + " FILED"}`}
      <span class="section-sub">${sub}</span></div>
    ${tabs}
    ${coverage}
    ${npd}
    <div class="fund-scroll">
      <table class="fund-table">
        <thead><tr><th class="fund-name-col">Holding</th><th>Type</th><th>Est. ER</th><th>Value</th><th>% of ${tab === "sma" ? "account" : (lu.fromTrust ? "trust" : "holdings")}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${starred ? `<p class="fund-note"><strong>*Comparable fund.</strong> That holding is a collective trust or separate account — it has no ticker and no published expense ratio, because its fee is negotiated by the plan. The fund shown is its registered equivalent, so you can look up what it holds; the plan's trust class is normally <em>cheaper</em> than the retail fee shown, so read it as a ceiling, not the plan's price.</p>` : ""}
    ${tab === "menu" && list.some((f) => !fundTickerInfo(f.name, f.type) && !/company stock|employer (security|stock)|brokerage/i.test((f.type || "") + " " + f.name)) ? `<p class="fund-note">Holdings with no ticker are pooled vehicles whose filed name doesn't identify a specific registered fund — naming one would be a guess.</p>` : ""}`;
  }

  function fundTable(plan) {
    if (plan.filedLineup) return filedLineupTable(plan);
    if (plan.lineupKey && plan.hasLineup) {
      return `
      <div class="section-label">FUND HOLDINGS</div>
      <p class="max-benefit">Loading fund holdings from the filing…</p>`;
    }
    if (!plan.funds) {
      // no parsed lineup, but the audited notes NAME the options (common for
      // master-trust plans whose per-fund schedule isn't public)
      const menu = plan.filedFeatures && plan.filedFeatures.menu;
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
      return `
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
      ? `Financial figures from ${esc(plan.source)}. ${plan.filedFeatures ? "Match, vesting, and feature details quoted from the filing's audited statements — verify with your plan documents." : "Plan features from the filing's characteristic codes where shown — verify details with your plan documents."}`
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
        <div class="stat"><p class="stat-label">Participants</p><p class="stat-value">${plan.participants ? fmtInt.format(plan.participants) : "—"}</p><p class="stat-sub">${plan.activeParticipants ? fmtInt.format(plan.activeParticipants) + " active" : "&nbsp;"}</p></div>
        <div class="stat"><p class="stat-label">Avg expense ratio</p>${(() => {
          const fe = filedAvgER(plan);
          if (fe) return `<p class="stat-value">${fe.er.toFixed(2)}% <span class="est-chip">est.</span></p><p class="stat-sub">weighted, ${fe.matched} of ${fe.of} holdings</p>`;
          const ce = curatedAvgER(plan);
          if (ce) return `<p class="stat-value">${ce.er.toFixed(2)}% <span class="est-chip">est.</span></p><p class="stat-sub">${ce.matched} of ${ce.of} menu funds</p>`;
          return `<p class="stat-value">—</p><p class="stat-sub">${plan.filedLineup ? plan.filedLineup.funds.length + " filed holdings" : plan.funds ? plan.funds.length + " fund options" : plan.filedFeatures && plan.filedFeatures.menu ? plan.filedFeatures.menu.length + " named options" : "lineup not added"}</p>`;
        })()}</div>
        <div class="stat"><p class="stat-label">Recordkeeper</p><p class="stat-value stat-small">${esc(plan.provider || "—")}</p><p class="stat-sub">${plan.provider
          ? esc(plan.filed || "")
          : plan.isSF
            ? "Short-form filers don't file Schedule C, which names service providers"
            : "No recordkeeping provider identified in this filing's Schedule C"}</p></div>
      </div>

      <div class="section-label">EMPLOYER CONTRIBUTIONS <span class="section-sub">${plan.filedFeatures ? "Source: Form 5500 filing (audit notes) — verify details with HR" : "Source: Form 5500 codes + plan document / SPD — verify with HR"}</span></div>
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
        <div class="sponsor-name">${esc(plan.company)} ${plan.ticker ? `<span class="plan-ticker">${esc(plan.ticker)}</span>` : ""}</div>
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
    $("statPpl").textContent = fmtCompact.format(ppl);
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
    const plans = visiblePlans();
    const limit = state.rowLimit || MAX_ROWS;
    $("tbody").innerHTML = plans.slice(0, limit).map(planRow).join("");
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
      (state.query.trim() ? ` for “${state.query.trim()}”` : "");
    document.querySelectorAll(".col-sort").forEach((b) => {
      b.classList.toggle("sorted", b.dataset.sort === state.tableSort.key);
      b.dataset.dir = state.tableSort.dir > 0 ? "asc" : "desc";
    });
  }

  /* ---- events -------------------------------------------------------------- */

  $("search").addEventListener("input", (ev) => {
    state.query = ev.target.value;
    state.rowLimit = MAX_ROWS;
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
    // deep link: #plan=<id> opens that plan's report directly
    const m = location.hash.match(/^#plan=(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const plan = state.plans.find((p) => p.id === id);
      if (plan) {
        state.query = plan.company || "";
        $("search").value = state.query;
        state.expanded.add(id);
        ensureDetail(plan);
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
      const id = decodeURIComponent(hm[1]);
      const plan = state.plans.find((p) => p.id === id);
      if (!plan) return;
      state.query = plan.company || "";
      $("search").value = state.query;
      state.expanded.clear();
      state.expanded.add(id);
      ensureDetail(plan);
      render();
      const tr = document.querySelector(".plan-tr.open") || document.querySelector(".detail-tr");
      if (tr) tr.scrollIntoView({ block: "start" });
    });
  });
})();
