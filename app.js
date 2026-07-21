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
    filters: { brokerage: false, megaBackdoor: false, immediateVesting: false },
    provider: "",
    industry: "",
    planType: "",
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
    const balCnt = plan.partBalances || plan.participants;
    plan.avgBal = plan.assetsB != null && balCnt
      ? (plan.assetsB * 1e9) / balCnt : null;
    const f = plan.flows || {};
    const contrib = (f.deferralsM || 0) + (f.employerM || 0);
    plan.avgContrib = contrib && plan.activeParticipants
      ? (contrib * 1e6) / plan.activeParticipants : null;
    return plan;
  }

  function mergePlan(curated, filed) {
    if (!filed) return derive({ ...curated, industry: curated.industry || "", dataStatus: "sample", source: "Community-sourced sample data" });
    const c = curated || {};
    const yoy = filed.assetsBOY && filed.assetsEOY ? (filed.assetsEOY / filed.assetsBOY - 1) * 100 : null;
    return derive({
      ticker: filed.ticker,
      company: filed.company,
      provider: c.provider || filed.recordkeeper || null,
      providerFiled: !c.provider && !!filed.recordkeeper,
      planName: titlePlanName(filed.planName),
      city: filed.city, state: filed.state, zip: filed.zip,
      planTypes: planTypesFromCode(filed.pensionCode || ""),
      industry: industryOf(filed.businessCode),
      planYear: filed.planYear,
      participants: filed.participants,
      activeParticipants: filed.activeParticipants,
      partBalances: filed.partBalances || 0,
      assetsB: filed.assetsEOY ? filed.assetsEOY / 1e9 : null,
      assetsYoY: yoy == null ? null : +yoy.toFixed(1),
      ein: filed.ein,
      pyb: filed.pyb || "",
      filed: fmtFiledDate(filed.filedDate),
      flows: {
        benefitsM: filed.benefitsPaid ? filed.benefitsPaid / 1e6 : null,
        feeProfM: filed.feeProf ? filed.feeProf / 1e6 : null,
        feeAdminM: filed.feeAdmin ? filed.feeAdmin / 1e6 : null,
        feeInvM: filed.feeInvMgmt ? filed.feeInvMgmt / 1e6 : null,
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
    let filedList = [];
    // Full universe: every 401(k) plan with ≥100 participants (compact arrays)
    try {
      const res = await fetch("plans-all.json", { cache: "no-cache" });
      if (res.ok) {
        const j = await res.json();
        const F = j.fields;
        filedList = j.plans.map((a) => {
          const p = {};
          for (let i = 0; i < F.length; i++) p[F[i]] = a[i];
          p.company = p.sponsorName;
          p.pensionCode = p.codes || "2J"; // full 8a code string drives the badges
          p.isSF = !!p.sf;
          p.ein = p.ein ? String(p.ein).slice(0, 2) + "-" + String(p.ein).slice(2) : "";
          p.source = `Form 5500, plan year ${p.planYear} (DOL EFAST2 public dataset)`;
          return p;
        });
      }
    } catch { /* fall through */ }

    // Lineups: a small index says which plans have parsed data; the holdings
    // and features live in shard files fetched per-plan on demand.
    let lineupIndex = null;
    try {
      const res = await fetch("lineups-index.json", { cache: "no-cache" });
      if (res.ok) lineupIndex = await res.json();
    } catch { /* none yet */ }
    // master-trust registry: names and totals for labeling trust-sourced lineups
    state.trusts = {};
    try {
      const res = await fetch("mtias.json", { cache: "no-cache" });
      if (res.ok) for (const t of (await res.json()).trusts) state.trusts[t.ack] = t;
    } catch { /* optional */ }
    state.shardCount = lineupIndex ? lineupIndex.shards : 0;

    const curatedByTicker = new Map(PLANS.map((p) => [p.ticker, p]));
    const merged = [];
    for (const f of filedList) {
      const plan = mergePlan(f.ticker ? curatedByTicker.get(f.ticker) : null, f);
      plan.id = (f.ein || "") + "|" + (f.pn || "") + "|" + (f.ticker || "");
      // Form 5500 plan-characteristic codes (field 8a) — filed, universe-wide
      const codes = f.codes || "";
      plan.matchCode = /2K/.test(codes); // employer contributions based on deferrals
      if (plan.autoEnroll == null && /2S/.test(codes)) plan.autoEnroll = "enrollment is automatic (Form 5500 code 2S)";
      if (plan.brokerage == null && /2R/.test(codes)) plan.brokerage = "Self-directed brokerage";
      if (plan.pretax == null) plan.pretax = true; // 401(k)/403(b) elective deferrals are pre-tax
      if (lineupIndex) {
        let flag = f.ack ? lineupIndex.plans[f.ack] || 0 : 0;
        if (flag === 2) flag = 3; // legacy encoding: 2 meant lineup+sdba
        if (flag) {
          plan.lineupKey = f.ack;
          plan.hasLineup = !!(flag & 1);
          if (plan.brokerage == null && (flag & 2)) plan.brokerage = "Self-directed brokerage";
          if (plan.megaBackdoor == null && (flag & 8)) plan.megaBackdoor = true;
          if (!plan.vesting && (flag & 16)) plan.vesting = "Immediate";
          if (plan.afterTax == null && (flag & 32)) plan.afterTax = true;
          if (plan.roth == null && (flag & 64)) plan.roth = true;
        }
        plan.mtiaAck = f.mtiaAck || null;
        // keep the trust key whenever the trust has a lineup — ensureLineup
        // decides between the plan's own schedule and the trust's (a plan
        // whose own 4i is just "Investment in Master Trust" gets the trust)
        if (f.mtiaAck && (lineupIndex.plans[f.mtiaAck] || 0) & 1) {
          plan.trustKey = f.mtiaAck;
          plan.hasLineup = true;
        }
        if (flag & 4) plan.featKey = f.ack;
      }
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
  async function ensureLineup(plan) {
    if (!plan || (!plan.lineupKey && !plan.trustKey) || plan.filedLineup || plan.lineupLoading || !state.shardCount) return;
    plan.lineupLoading = true;
    try {
      const lu = plan.lineupKey ? await fetchEntry(plan.lineupKey) : null;
      // use the plan's own schedule unless it is missing or majority
      // "Investment in Master Trust" — then the trust's real holdings win
      let ownUsable = !!(lu && lu.confident && lu.funds && lu.funds.length);
      if (ownUsable && plan.trustKey) {
        const tot = lu.funds.reduce((a, f) => a + f.value, 0) || 1;
        const mti = lu.funds.filter((f) => f.type === "Master trust interest" || /master trust/i.test(f.name))
          .reduce((a, f) => a + f.value, 0);
        if (mti / tot > 0.5) ownUsable = false;
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
      if (!plan.filedLineup && lu && lu.confident && lu.funds && lu.funds.length) plan.filedLineup = lu;
      if (lu && lu.features) {
        const ff = lu.features;
        plan.filedFeatures = ff;
        if (plan.roth == null && ff.roth) plan.roth = true;
        if (plan.afterTax == null && ff.afterTax) plan.afterTax = true;
        if ((plan.autoEnroll == null || /code 2S/.test(plan.autoEnroll)) && ff.autoEnroll) {
          plan.autoEnroll = ff.autoEnroll === true ? "enrollment is automatic (per filing)" : ff.autoEnroll;
        }
        if (!plan.vesting && ff.vesting) {
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
        if (ff.sdbaBrand && (plan.brokerage == null || plan.brokerage === "Self-directed brokerage")) plan.brokerage = ff.sdbaBrand;
      }
      if (!plan.filedLineup) plan.hasLineup = false;
      if (!plan.filedLineup && !plan.filedFeatures) { plan.lineupKey = null; plan.trustKey = null; }
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
    if (state.provider && plan.provider !== state.provider) return false;
    if (state.industry && plan.industry !== state.industry) return false;
    if (state.planType && !(plan.planTypes || []).includes(state.planType)) return false;
    return true;
  }

  function visiblePlans() {
    const q = state.query.trim().toLowerCase();
    const out = state.plans.filter((p) => matchesQuery(p, q) && passesFilters(p));
    const { key, dir } = state.tableSort;
    out.sort((a, b) => {
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
    const total = plan.flows.employerM != null
      ? `${plan.planYear} total: <strong>${money(plan.flows.employerM)}</strong>` : "";
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

  function filedContributionCard(plan) {
    const ff = plan.filedFeatures;
    const total = plan.flows.employerM != null
      ? `${plan.planYear} total: <strong>${money(plan.flows.employerM)}</strong>` : "";
    return `
    <div class="contrib-card">
      <div class="contrib-head">
        <span class="contrib-title">Employer Match</span>
        <span class="badge badge-green">FORM 5500 AUDIT NOTES</span>
        <span class="contrib-total">${total}</span>
      </div>
      ${ff.match ? `<p class="max-benefit">Formula: <strong>${esc(ff.match)}</strong>${ff.safeHarbor === "match" ? " · safe harbor" : ""}${ff.trueUp ? " · with annual true-up" : ""}</p>` : ""}
      ${ff.matchText ? `<blockquote class="quote">“${esc(ff.matchText)}”</blockquote>` : ""}
      ${ff.nec ? `<p class="max-benefit">Employer nonelective contribution: <strong>${esc(ff.nec)}</strong>${ff.safeHarbor === "nonelective" ? " · safe harbor" : ""}</p>` : ""}
      ${ff.necText ? `<blockquote class="quote">“${esc(ff.necText)}”</blockquote>` : ""}
      ${ff.vesting ? `<p class="max-benefit">Employer-money vesting: <strong>${esc(ff.vesting)}</strong></p>` : ""}
      ${ff.vestingText ? `<blockquote class="quote">“${esc(ff.vestingText)}”</blockquote>` : ""}
      <p class="contrib-note">ⓘ Quoted from the audited financial statements attached to this plan's Form 5500 filing.</p>
    </div>`;
  }

  function unknownContributionCard(plan) {
    const filedLine = plan.flows.employerM != null
      ? `The employer contributed <strong>${money(plan.flows.employerM)}</strong> in plan year ${plan.planYear} (Form 5500).`
      : "";
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
    </div>`;
  }

  function taxRow(label, on, blurb) {
    if (on == null) return `<div class="feat-row"><span>${esc(label)}</span><span class="feat-unknown">— Not yet verified</span></div>`;
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
    rows.push(taxRow("Pre-Tax (Traditional)", plan.pretax,
      "Contributions reduce current taxable income. Taxes paid upon withdrawal in retirement."));
    rows.push(taxRow("Roth (After-Tax Designated)", plan.roth,
      "Contributions made with after-tax dollars. Qualified withdrawals in retirement are tax-free."));
    rows.push(taxRow("Voluntary After-Tax", plan.afterTax,
      plan.megaBackdoor ? "Supports in-plan Roth conversion — the “mega backdoor Roth”." : ""));
    rows.push(`<div class="feat-row"><span>Self-Directed Brokerage</span>${plan.brokerage == null
      ? `<span class="feat-unknown">— Not yet verified</span>`
      : plan.brokerage !== "None"
        ? `<span class="feat-on">✓ ${esc(plan.brokerage)}</span>` : `<span class="feat-off">✗ Not offered</span>`}</div>`);
    const ff = plan.filedFeatures || {};
    if (ff.eligibility) {
      rows.push(`<div class="feat-block"><div class="feat-row"><span>Eligibility</span><span class="feat-on">✓ ${esc(ff.eligibility)}</span></div>
        ${ff.eligibilityText ? `<div class="feat-blurb">“${esc(ff.eligibilityText)}”</div>` : ""}</div>`);
    }
    if (ff.loans) {
      rows.push(`<div class="feat-row"><span>Participant Loans</span><span class="feat-on">✓ Permitted</span></div>`);
    }
    for (const h of plan.highlights) {
      rows.push(`<div class="feat-row"><span>Feature</span><span class="feat-on">✓ ${esc(h)}</span></div>`);
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
      const er = fundER(f.name);
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
    const rows = list.map((f) => {
      const er = tab === "menu" ? fundER(f.name) : null;
      const tk = tab === "menu" ? fundTicker(f.name) : null;
      return `
      <tr>
        <td class="fund-name-col"><div class="fund-name">${esc(f.name)}</div>${tk ? `<div class="fund-ticker">${esc(tk)}</div>` : ""}</td>
        <td class="fund-type">${esc(f.type || "—")}</td>
        <td class="num">${er != null ? er.toFixed(er < 0.1 ? 3 : 2) + "%" : "—"}</td>
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
        : `${esc(lu.source)} · values as filed · tickers shown where the filed name identifies a registered fund · expense ratios are estimates from public fund data`;
    return `
    <div class="section-label">${lu.fromTrust && tab !== "sma" ? `MASTER TRUST HOLDINGS — ${lu.funds.length}` : `FUND HOLDINGS — ${tab === "sma" ? lu.sma.length + " SECURITIES" : lu.funds.length + " FILED"}`}
      <span class="section-sub">${sub}</span></div>
    ${tabs}
    <div class="fund-scroll">
      <table class="fund-table">
        <thead><tr><th class="fund-name-col">Holding</th><th>Type</th><th>Est. ER</th><th>Value</th><th>% of ${tab === "sma" ? "account" : (lu.fromTrust ? "trust" : "holdings")}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
      <p class="max-benefit">Fund lineup not parsed from this filing yet (some plans hold assets in a master
      trust and don't itemize funds). <a href="https://github.com/evwes/no-app/issues">Contribute it</a>.</p>`;
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
              if (m <= 1) return `Plan Year ${plan.planYear}`;
              const MO = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
        <div class="stat"><p class="stat-label">Recordkeeper</p><p class="stat-value stat-small">${esc(plan.provider || "—")}</p><p class="stat-sub">${esc(plan.filed || "")}</p></div>
      </div>

      <div class="section-label">EMPLOYER CONTRIBUTIONS <span class="section-sub">${plan.filedFeatures ? "Source: Form 5500 filing (audit notes) — verify details with HR" : "Source: Form 5500 codes + plan document / SPD — verify with HR"}</span></div>
      ${plan.contributions ? plan.contributions.map((c) => contributionCard(c, plan)).join("")
        : plan.filedFeatures && (plan.filedFeatures.match || plan.filedFeatures.matchText || plan.filedFeatures.vesting)
          ? filedContributionCard(plan) : unknownContributionCard(plan)}

      <div class="two-col">
        <div>
          <div class="section-label">${(() => {
            const m = plan.pyb ? +plan.pyb.slice(5, 7) : 1;
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

  function renderHero() {
    const filed = state.plans.filter((p) => p.dataStatus === "filed");
    const ppl = filed.reduce((s, p) => s + (p.participants || 0), 0);
    const assets = filed.reduce((s, p) => s + (p.assetsB || 0), 0);
    $("statPlans").textContent = fmtInt.format(state.plans.length);
    $("statPpl").textContent = fmtCompact.format(ppl);
    $("statAssets").textContent = "$" + (assets / 1000).toFixed(2) + "T";
    $("statAvgBal").textContent = ppl ? "$" + fmtCompact.format((assets * 1e9) / ppl) : "—";
  }

  function render() {
    const plans = visiblePlans();
    const limit = state.rowLimit || MAX_ROWS;
    $("tbody").innerHTML = plans.slice(0, limit).map(planRow).join("");
    $("empty").hidden = plans.length > 0;
    const more = plans.length - limit;
    $("showMore").hidden = more <= 0;
    if (more > 0) $("showMore").textContent = `Show ${fmtInt.format(Math.min(more, 500))} more of ${fmtInt.format(more)}`;
    $("resultCount").textContent =
      `${fmtInt.format(plans.length)} of ${fmtInt.format(state.plans.length)} plans` +
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
    if (state.expanded.has(id)) ensureLineup(state.plans.find((p) => p.id === id));
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
        ensureLineup(plan);
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
      ensureLineup(plan);
      render();
      const tr = document.querySelector(".plan-tr.open") || document.querySelector(".detail-tr");
      if (tr) tr.scrollIntoView({ block: "start" });
    });
  });
})();
