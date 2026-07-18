/* wampo — parser for "Schedule H, line 4i — Schedule of Assets" sections
 * extracted from Form 5500 filing PDFs (pdftotext -layout output).
 * Shared by fetch-4i.mjs (production) and local test harnesses. */

// Bump to invalidate previously parsed lineups.json entries and force a reparse.
export const PARSER_VERSION = 8;

const TYPE_PATTERNS = [
  [/self[- ]directed brokerage|brokerage ?link|brokeragelink|\bSDBA\b|self[- ]directed\b/i, "SDBA"],
  [/publicly[- ]traded stock/i, "Stock"],
  [/interest in (the )?master trust/i, "Master trust interest"],
  [/collective trust|common\/collective|common collective|collective investment trust|commingled/i, "Collective trust"],
  [/mutual fund|registered investment/i, "Mutual fund"],
  [/pooled separate/i, "Pooled separate account"],
  [/common stock|company stock|employer securit/i, "Company stock"],
  [/interest[- ]bearing cash|short[- ]term investment|money market/i, "Cash / short-term"],
  [/participant loans?|loans to participants|participant notes/i, "Participant loans"],
  [/government securit|u\.?s\.? treasur/i, "Government securities"],
  [/corporate debt|corporate bond/i, "Corporate debt"],
  [/guaranteed investment|synthetic|wrapper/i, "Stable value / GIC"],
  [/separate account/i, "Separate account"],
];

export function classify(text) {
  for (const [re, label] of TYPE_PATTERNS) if (re.test(text)) return label;
  return "";
}

const SKIP_ROW = new RegExp("^(total|subtotal|grand total|schedule|page \\d|form 5500|ein[: ]|employer id|sponsor name|plan number|as of|see accompanying|\\(thousands|identity of issue|description of investment|rate of|maturity|cost\\b|current value|sales\\b|purchases\\b|dividends\\b|assets in.transit|investments? at fair value)|" +
  // financial-statement lines that are not 4i holdings
  "(net assets|benefits paid|investment (income|gain|loss)|interest and dividends|realized|unrealized|appreciat|depreciat|transfers?\\b|contributions?\\b|deemed distribut|administrative expense|beginning of year|end of year|financial statements|indirect compensation|reconcil|adjustment|level [123]\\b|liabilit|receivable|payable|expenses\\b|distribution|net (increase|decrease|change)|due (to|from)|notes? (to|receivable)|similar party|description of investment|current value)", "i");

// "December 31, 2024" style heading lines — the year parses as a value otherwise
const DATE_LINE = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?(\s+(19|20)\d\d)?(\s+and)?\s*$/i;

/* Strip trailing column values (cost, shares, rates) from a row body without
 * eating year-like name tails such as "RETIREMENT 2045". */
function stripTrailingColumns(body) {
  // trim token-by-token from the end WITHOUT re-joining — internal column
  // gaps (3+ spaces) must survive for splitNameDesc
  let b = body;
  const tail = /\s+(?:[*$-]+|\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|\d+\.\d+%?|\d+%)\s*$/;
  for (let m = b.match(tail); m; m = b.match(tail)) b = b.slice(0, b.length - m[0].length);
  return b.trim();
}

/* Split a row into the identity-of-issuer column and the description column.
 * -layout preserves column gaps (3+ spaces); when the columns run together,
 * fall back on a mixed-case issuer followed by an ALL-CAPS description. */
function splitNameDesc(body) {
  const segs = body.split(/\s{3,}/).filter(Boolean);
  if (segs.length >= 2) return { nameCol: segs[0], descCol: segs.slice(1).join(" ") };
  const m = body.match(/^(.*?[a-z][^A-Z]*?)\s+([A-Z][A-Z0-9 &.,/'()%-]{10,})$/);
  if (m && /[A-Z]\s+[A-Z]/.test(m[2])) return { nameCol: m[1].trim(), descCol: m[2].trim() };
  return { nameCol: body, descCol: "" };
}

/* Remove share counts, rates, and cost markers from a description column so
 * only the investment's name remains. */
function cleanDesc(desc) {
  let d = desc.replace(/\*+/g, " ");
  d = d.replace(/\b[\d,]+(\.\d+)?\s*(shares?|units?|interests?)\b/gi, " ");
  d = d.replace(/\b(interest )?rates? (of|from|ranging).*$/i, " ");
  d = d.replace(/\bmaturit(y|ies).*$/i, " ");
  return d.replace(/[\s,;:-]+$/g, "").replace(/\s{2,}/g, " ").trim();
}

/* True when a description column only states the investment TYPE ("Registered
 * Investment Company", "Common/Collective Trust") rather than naming a fund. */
function typeOnly(desc) {
  let r = desc;
  for (const [re] of TYPE_PATTERNS) r = r.replace(re, " ");
  r = r.replace(/\b(value of|interest in|the|a|an|of|in|at|held|funds?|accounts?|companies|company|end of year|publicly[- ]traded|common)\b/gi, " ");
  return r.replace(/[^a-z0-9]/gi, "").length < 6;
}

export function parseRows(section, opts = {}) {
  const rows = [];
  let sdba = false;
  let nameBuf = [];
  const valueRe = /\$?\s*([0-9][0-9,]{2,})\s*$/;

  for (const raw of section) {
    // leading "*" is the party-in-interest marker on holding rows — drop it
    // before matching so starred holdings aren't mistaken for footnotes
    let t = raw.trim().replace(/^\*+\s*/, "");
    if (!t) { nameBuf = []; continue; }
    // "Current Value | Shares Par" layouts put the share count LAST — strip
    // the shares column and the currency code so the dollar value is trailing
    if (opts.sharesLast) {
      const sp = t.match(/^(.*?)\s+(?:USD|EUR|GBP|CAD)\s+(-|\$? ?[0-9][0-9,]*(?:\.\d{2})?)\s+[0-9][0-9,]*(?:\.\d+)?\s*$/);
      if (sp) {
        if (sp[2] === "-") { nameBuf = []; continue; } // stale zero-value holding
        t = sp[1] + "   " + sp[2].replace(/\.\d+$/, "");
      }
    }
    if (SKIP_ROW.test(t) || DATE_LINE.test(t)) { nameBuf = []; continue; }
    if (/:\s*$/.test(t)) { nameBuf = []; continue; } // section subheading

    const vm = t.match(valueRe);
    if (!vm) {
      // short ALL-CAPS lines and bare type phrases ("MUTUAL FUNDS",
      // "Publicly-traded Common Stock") are section headers, not wrapped
      // fund names — don't glue them onto the next row
      if (/^[A-Z][A-Z\s/&,-]*$/.test(t) && t.split(/\s+/).length <= 4) { nameBuf = []; continue; }
      if (t.split(/\s+/).length <= 5 && classify(t) && typeOnly(t)) { nameBuf = []; continue; }
      if (t.length < 90 && !/^\d+$/.test(t)) nameBuf.push(t);
      if (nameBuf.length > 3) nameBuf = nameBuf.slice(-3);
      continue;
    }

    const value = +vm[1].replace(/,/g, "");
    // prose sentences that happen to end in a number are not holdings
    if (t.split(/\s+/).length > 14 && !/\$/.test(t)) { nameBuf = []; continue; }
    let body = t.slice(0, t.length - vm[0].length).trim().replace(/^\*+\s*/, "");
    body = stripTrailingColumns(body);
    // a bare number with no name on the same line is a leaked year/page/column
    if (!body) { nameBuf = []; continue; }

    const { nameCol, descCol } = splitNameDesc(body);
    const full = (nameBuf.join(" ") + " " + nameCol).trim();
    nameBuf = [];
    const type = classify(descCol ? descCol + " " + full : full);
    if (type === "SDBA") { sdba = true; rows.push({ name: "Self-Directed Brokerage Account", type: "Brokerage window", value }); continue; }
    if (type === "Participant loans") continue;

    // Prefer the description column when it names the fund; many filings put
    // the manager in the issuer column and the actual fund in the description.
    const dClean = cleanDesc(descCol);
    let name;
    if (dClean && dClean.split(/\s+/).length >= 2 &&
        dClean.replace(/[^a-z]/gi, "").length >= 8 && !typeOnly(dClean)) {
      name = dClean;
    } else {
      name = full;
      for (const [re] of TYPE_PATTERNS) {
        const m = full.match(re);
        if (m && m.index > 3) {
          const cut = full.slice(0, m.index).replace(/[-–—,\s]+$/, "");
          // only strip a type phrase when a real name remains — "BlackRock
          // Short-Term Investment Fund" must not shrink to "BlackRock"
          if (cut.split(/\s+/).length >= 2) { name = cut; break; }
        }
      }
      if (name.length < 3) name = full;
    }
    // Drop non-name residue like "9.50 percent" (wrapped loan-rate lines)
    if (name.replace(/\bpercent\b|\bto\b/gi, "").replace(/[^a-z]/gi, "").length < 3) continue;
    if (!name || name.length < 4) continue;
    // date fragments assembled from wrapped heading lines
    if (/(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i.test(name)) continue;
    // "Artisan Mid Cap Account Total" style subtotal rows would double-count
    // the component rows above them
    if (/\btotal\s*$/i.test(name)) { nameBuf = []; continue; }
    name = name.replace(/\s*\*+\s*$/, ""); // trailing footnote markers
    rows.push({ name: name.slice(0, 90), type, value });
  }

  const seen = new Map();
  let totalValue = 0;
  for (const r of rows) {
    if (!r.value) continue;
    totalValue += r.value;
    const k = r.name.toLowerCase();
    if (seen.has(k)) seen.get(k).value += r.value;
    else seen.set(k, r);
  }
  // totalValue covers every row, not just the displayed top 80 — huge filings
  // list thousands of individual securities and the ratio must reflect all.
  return { funds: [...seen.values()].sort((a, b) => b.value - a.value).slice(0, 80), sdba, totalValue };
}

/* The full filing contains several look-alike headings (financial-statement
 * TOC, statement pages, the real 4i table). Parse every candidate region and
 * keep the one whose total best matches the plan's Schedule H assets, testing
 * both as-filed dollars and (thousands) scaling. */
export function parse4i(text, assetsEOY, sponsorName = "") {
  const lines = text.split("\n");
  const headRe = /(schedule\s+h.{0,40}line\s*4i|schedule\s+of\s+assets\s*\(held|schedule\s+of\s+assets\s+held)/i;
  const endRe = /(line\s*4j|acquired\s+and\s+disposed|signature of)/i;

  const starts = [];
  for (let i = 0; i < lines.length; i++) if (headRe.test(lines[i])) starts.push(i);
  if (!starts.length) return { found: false };

  // single-heading regions
  const candidates = [];
  for (let s = 0; s < starts.length; s++) {
    let end = s + 1 < starts.length ? starts[s + 1] : Math.min(lines.length, starts[s] + 4000);
    for (let i = starts[s] + 3; i < end; i++) {
      if (endRe.test(lines[i])) { end = i; break; }
    }
    candidates.push([starts[s], end]);
  }
  // merged regions: multi-page attachments repeat the 4i header on every page,
  // so cluster nearby headings and score the whole span as one table too
  const clusters = [[starts[0]]];
  for (let k = 1; k < starts.length; k++) {
    if (starts[k] - starts[k - 1] < 400) clusters[clusters.length - 1].push(starts[k]);
    else clusters.push([starts[k]]);
  }
  for (const cl of clusters) {
    if (cl.length < 2) continue;
    const lastStart = cl[cl.length - 1];
    let end = Math.min(lines.length, lastStart + 4000);
    const nxt = starts.find((x) => x > lastStart);
    if (nxt) end = Math.min(end, nxt);
    for (let i = lastStart + 3; i < end; i++) {
      if (endRe.test(lines[i])) { end = i; break; }
    }
    candidates.push([cl[0], end]);
  }

  let best = null;
  for (const [s, end] of candidates) {
    const region = lines.slice(s, end);
    const regionText = region.join("\n");
    const sharesLast = /current\s+value\s+shares(\s*\/?\s*par)?|shares\s+par\s*$/im.test(regionText);
    const parsed = parseRows(region, { sharesLast });
    if (parsed.funds.length < 2) continue;
    const raw = parsed.totalValue;
    // only consider (thousands) scaling when the region says so — otherwise a
    // page of small full-dollar rows can fake a good ratio at 1000x
    const marked = /thousands? of dollars|\(in thousands|\(thousands|\(\$000|000s? omitted|dollars in thousands/i.test(region.join("\n"));
    for (const scale of marked ? [1, 1000] : [1]) {
      const ratio = assetsEOY ? (raw * scale) / assetsEOY : 0;
      if (!ratio) continue;
      const closeness = Math.abs(Math.log(ratio));
      const score = -closeness + Math.min(parsed.funds.length, 40) * 0.005;
      if (!best || score > best.score) {
        best = { score, ratio, scale, ...parsed };
      }
    }
  }
  if (!best) return { found: false };
  let funds = best.scale === 1000 ? best.funds.map((f) => ({ ...f, value: f.value * 1000 })) : best.funds;

  // sub-$10k rows are residue (leaked years, currency cents), not menu options
  funds = funds.filter((f) => f.value >= 10000);

  // Some filings itemize every security inside a separately managed account
  // or stock window. Those aren't investment choices — roll them into one
  // line. The sponsor's own stock IS a menu option and stays separate.
  const spTokens = sponsorName.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2).slice(0, 3);
  const isEmployer = (n) => spTokens.some((tok) => n.toLowerCase().includes(tok));
  const itemized = funds.filter((f) => (f.type === "Stock" || f.type === "Company stock") && !isEmployer(f.name));
  let sma = null;
  if (itemized.length >= 3) {
    const sum = itemized.reduce((a, f) => a + f.value, 0);
    const keep = funds.filter((f) => !itemized.includes(f));
    keep.push({ name: `Individually listed securities (${itemized.length} positions)`, type: "Managed account holdings", value: sum });
    funds = keep.sort((a, b) => b.value - a.value);
    sma = itemized.slice(0, 150); // keep the detail for the securities tab
  }

  return { found: true, thousands: best.scale === 1000, sdba: best.sdba, funds, ratio: best.ratio, ...(sma ? { sma } : {}) };
}

/* ---- plan-feature extraction from the filing's audit notes ---------------- */

/* The "Notes to Financial Statements — Description of the Plan" section of
 * the audited statements (attached to every 100+ participant filing) spells
 * out the match formula, vesting schedule, Roth/after-tax options, and
 * auto-enrollment in prose. Extract what's stated; stay silent otherwise. */
export function extractPlanFeatures(text) {
  const t = text.replace(/\s+/g, " ");
  const out = {};
  // form-page boilerplate that must never pass as a plan-description note
  const BOILER = /_{3,}|provide explanation|part [ivx]+\b|schedule [a-z]\b|check(?:box| the box)|see instructions|yes ?\/ ?no/i;
  const clean = (s) => s
    .replace(/\b[\w .,]{0,60}Notes? to Financial Statements\b/gi, " ")
    .replace(/\bNote \d+ ?[-–—] ?[^.]{0,60}\((?:Continued|concluded)\)/gi, " ")
    .replace(/\bDecember 31, 20\d\d(?: and 20\d\d)?\b/g, " ")
    .replace(/\s{2,}/g, " ").trim();
  const cap = (s) => (s.length > 300 ? s.slice(0, 297) + "…" : s);
  const sentence = (idx) => {
    let a = t.lastIndexOf(". ", idx); a = a === -1 ? Math.max(0, idx - 220) : a + 2;
    let b = t.indexOf(". ", idx); b = b === -1 ? Math.min(t.length, idx + 280) : b + 1;
    return cap(clean(t.slice(a, b)).replace(/^[a-z]/, (c) => c.toUpperCase()));
  };

  // ---- employer match formula ----
  const mf =
    t.match(/match(?:ing)?[^.]{0,140}?(\d{1,3})(?:\.\d+)? ?(?:percent|%) of (?:the )?first (\d{1,2})(?:\.\d+)? ?(?:percent|%)/i) ||
    t.match(/(\d{1,3})(?:\.\d+)? ?(?:percent|%) match(?:ing)?[^.]{0,80}?(?:up to|on the first) (\d{1,2})(?:\.\d+)? ?(?:percent|%)/i);
  // dollar-phrased formulas: "dollar-for-dollar up to 4%", "50 cents per dollar on the first 6%"
  const df = !mf && (t.match(/dollar[- ]for[- ]dollar[^.]{0,80}?(?:up to|on the first) (\d{1,2})(?:\.\d+)? ?(?:percent|%)/i)
    ? { pct: 100, cap: null } : null);
  const cents = !mf && !df && t.match(/(\d{1,3})(?:\.\d+)? ?cents (?:for|per|on) (?:each |every )?(?:\$1(?:\.00)?|dollar)[^.]{0,80}?(?:up to|on the first) (\d{1,2})(?:\.\d+)? ?(?:percent|%)/i);
  if (mf) {
    out.match = `${+mf[1]}% of the first ${+mf[2]}% of pay`;
    const tier2 = t.slice(mf.index, mf.index + 300).match(/(?:and|plus) (\d{1,3})(?:\.\d+)? ?(?:percent|%) of the next (\d{1,2})(?:\.\d+)? ?(?:percent|%)/i);
    if (tier2) out.match += ` + ${+tier2[1]}% of the next ${+tier2[2]}%`;
    out.matchText = sentence(mf.index);
  } else if (df) {
    const m2 = t.match(/dollar[- ]for[- ]dollar[^.]{0,80}?(?:up to|on the first) (\d{1,2})(?:\.\d+)? ?(?:percent|%)/i);
    out.match = `100% of the first ${+m2[1]}% of pay`;
    out.matchText = sentence(m2.index);
  } else if (cents) {
    out.match = `${+cents[1]}% of the first ${+cents[2]}% of pay`;
    out.matchText = sentence(cents.index);
  } else {
    // fall back to the descriptive sentence, skipping form-page boilerplate
    const mre = /(?:employer|company) match(?:ing)? contributions?|matching contributions? (?:is|are|equal|of|based|provided)/gi;
    let mm;
    while ((mm = mre.exec(t))) {
      const s = sentence(mm.index);
      if (!BOILER.test(s) && s.length > 60) { out.matchText = s; break; }
    }
  }

  // ---- vesting of EMPLOYER money (employee deferrals are always immediate) ----
  const vestSentences = [];
  const vre = /[^.]{0,220}\bvest(?:ed|ing)?\b[^.]{0,220}\./gi;
  let vm; let guard = 0;
  while ((vm = vre.exec(t)) && guard++ < 40) {
    const s = clean(vm[0]);
    if (!BOILER.test(s) && !/defined benefit|pension benefit/i.test(s)) vestSentences.push(s);
  }
  // graded/cliff language always describes employer money — check it FIRST
  for (const s of vestSentences) {
    const graded = s.match(/(\d{1,2}) ?(?:percent|%) (?:per|each|for each) year|graded vesting|graduated vesting/i);
    const cliff = s.match(/(?:(\w{3,5}|\d)[- ]year cliff|cliff vesting[^.]{0,40}?(\w{3,5}|\d) years?|(?:100 ?(?:percent|%)|fully) vested (?:only )?(?:after|upon completing) (\w{3,5}|\d) years?)/i);
    if (graded) { out.vesting = "Graded schedule"; out.vestingText = cap(s); break; }
    if (cliff) {
      const n = cliff[1] || cliff[2] || cliff[3];
      const num = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[String(n).toLowerCase()] || +n;
      if (num >= 1 && num <= 6) { out.vesting = `${num}-year cliff`; out.vestingText = cap(s); break; }
    }
  }
  // "immediate" only counts when the sentence explicitly covers employer money
  if (!out.vesting) {
    for (const s of vestSentences) {
      if (!/(matching|employer|company|non.?elective|profit.?sharing) (?:contributions?|accounts?)|company match/i.test(s)) continue;
      if (/immediately? (?:100 ?(?:percent|%) )?(?:fully )?vested|fully vested (?:at all times|immediately|upon)|100 ?(?:percent|%) vested (?:at all times|immediately|in all)/i.test(s)) {
        out.vesting = "Immediate"; out.vestingText = cap(s); break;
      }
      if (!out.vestingText) out.vestingText = cap(s);
    }
  }

  // ---- Roth / voluntary after-tax (only positive evidence counts) ----
  const roth = t.match(/\broth\b[^.]{0,120}(contribut|deferral|option|401)/i) || t.match(/(designated|make) \broth\b/i);
  if (roth) { out.roth = true; out.rothText = sentence(roth.index); }
  if (/in.?plan.{0,40}(roth )?(conversion|rollover)|convert.{0,40}(to )?(a )?roth/i.test(t)) out.inPlanRoth = true;
  const at = t.match(/(?:voluntary |additional )?after[- ]tax contributions?/i);
  if (at && !/roth/i.test(t.slice(Math.max(0, at.index - 40), at.index))) {
    out.afterTax = true; out.afterTaxText = sentence(at.index);
  }

  // ---- safe harbor & true-up ----
  if (/safe harbor match/i.test(t)) out.safeHarbor = "match";
  else if (/safe harbor non.?elective|non.?elective safe harbor/i.test(t)) out.safeHarbor = "nonelective";
  if (/true[- ]?up/i.test(t)) out.trueUp = true;

  // ---- employer nonelective / core contribution ----
  const nec = t.match(/non.?(?:contributory|elective)[^.]{0,80}?contribution[^.]{0,60}?(\d{1,2})(?:\.\d+)? ?(?:percent|%)/i) ||
    t.match(/(?:employer|company) (?:core|automatic|basic|retirement) contribution[^.]{0,60}?(\d{1,2})(?:\.\d+)? ?(?:percent|%)/i) ||
    t.match(/contribut\w+ (\d{1,2})(?:\.\d+)? ?(?:percent|%) of (?:each |eligible |annual )?(?:participant|employee)s?'? (?:eligible )?(?:compensation|pay)[^.]{0,60}?regardless of/i);
  if (nec && +nec[1] >= 1 && +nec[1] <= 15) { out.nec = `${+nec[1]}% of pay`; out.necText = sentence(nec.index); }

  // ---- auto-escalation ----
  const esc = t.match(/(?:automatic(?:ally)? increas\w+|escalat\w+)[^.]{0,120}?(\d{1,2})(?:\.\d+)? ?(?:percent|%)[^.]{0,80}?(?:maximum|up to|cap|not to exceed)[^.]{0,40}?(\d{1,2})(?:\.\d+)? ?(?:percent|%)/i);
  const esc2 = esc || t.match(/annual(?:ly)? [^.]{0,40}?automatic(?:ally)? increas\w+|automatic escalation/i);
  if (esc2) {
    out.autoEscalate = esc ? `+${+esc[1]}%/year up to ${+esc[2]}%` : true;
    out.autoEscalateText = sentence(esc2.index);
  }

  // ---- eligibility ----
  const elig = t.match(/eligib\w+[^.]{0,140}?(?:(\d{1,4}) ?(days?|months?|years?|hours?) of (?:service|employment|continuous)|(?:upon|on) (?:their )?(?:date of )?hire|first day of (?:employment|the month)|immediately)/i);
  if (elig) {
    out.eligibility = elig[1] ? `${elig[1]} ${elig[2]} of service` : "Upon hire / immediate";
    out.eligibilityText = sentence(elig.index);
  }

  // ---- participant loans ----
  const loan = t.match(/participants? may (?:borrow|obtain (?:a )?loans?)|loans? (?:are|is) (?:permitted|available|allowed)|loan provision/i);
  if (loan) { out.loans = true; out.loansText = sentence(loan.index); }

  // ---- brokerage window brand ----
  const brand = t.match(/brokerage ?link/i) ? "Fidelity BrokerageLink"
    : t.match(/personal choice retirement|pcra/i) ? "Schwab PCRA"
    : t.match(/td ameritrade self.?directed/i) ? "TD Ameritrade SDBA" : null;
  if (brand) out.sdbaBrand = brand;

  // ---- automatic enrollment ----
  const ae = t.match(/automatic(?:ally)? enroll(?:ed|ment|s)?[^.]{0,100}?(\d{1,2})(?:\.\d+)? ?(?:percent|%)/i);
  const ae2 = ae || t.match(/automatic(?:ally)? enroll(?:ed|ment|s)?/i);
  if (ae2) {
    out.autoEnroll = ae ? `${+ae[1]}% default deferral` : true;
    out.autoEnrollText = sentence(ae2.index);
  }

  return Object.keys(out).length ? out : null;
}

/* Boot-time index bitmask for a shard entry — the app filters the whole
 * universe on these without fetching shards: 1 lineup, 2 brokerage window,
 * 4 has features, 8 mega backdoor, 16 immediate vesting, 32 after-tax, 64 Roth. */
export function indexFlags(e) {
  const hasLineup = e.confident && e.funds && e.funds.length ? 1 : 0;
  let f = hasLineup | (hasLineup && e.sdba ? 2 : 0);
  const ff = e.features;
  if (ff) {
    f |= 4;
    if (ff.afterTax) f |= 32;
    if (ff.roth) f |= 64;
    if (ff.afterTax && (ff.inPlanRoth || /in.?plan.{0,30}(roth )?(conversion|rollover)/i.test((ff.rothText || "") + " " + (ff.afterTaxText || "")))) f |= 8;
    if (ff.vesting === "Immediate") f |= 16;
    if (ff.sdbaBrand) f |= 2;
  }
  if (e.sdba) f |= 2;
  return f;
}
