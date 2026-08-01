/* wampo — parser for "Schedule H, line 4i — Schedule of Assets" sections
 * extracted from Form 5500 filing PDFs (pdftotext -layout output).
 * Shared by fetch-4i.mjs (production) and local test harnesses. */

// Bump to invalidate previously parsed lineups.json entries and force a reparse.
export const PARSER_VERSION = 33;

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
  [/separately managed|separate account/i, "Separate account"],
];

export function classify(text) {
  for (const [re, label] of TYPE_PATTERNS) if (re.test(text)) return label;
  return "";
}

const SKIP_ROW = new RegExp("^(total|subtotal|grand total|schedule|page \\d|form 5500|ein[: ]|employer id|sponsor name|plan number|as of|see accompanying|\\(thousands|identity of issue|description of investment|rate of|maturity|cost\\b|current value|sales\\b|purchases\\b|dividends\\b|assets in.transit|investments? at fair value|dividend income|other income|administrative fees)|" +
  // financial-statement lines that are not 4i holdings
  "(net assets|benefits paid|investment (income|gain|loss)|interest and dividends|realized|unrealized|appreciat|depreciat|transfers?\\b|contributions?\\b|deemed distribut|administrative expense|beginning of year|end of year|financial statements|indirect compensation|reconcil|adjustment|level [123]\\b|liabilit|receivable|payable|expenses\\b|distribution|net (increase|decrease|change)|due (to|from)|notes? (to|receivable)|similar party|description of investment|current value)|" +
  // form-page boilerplate: a filing with NO 4i attachment can still seed a
  // region from the Schedule H checkbox line, and the parser then reads phone
  // numbers and zip codes off address/signature pages as \"values\" (Aramark)
  "(mailing address|include room|city or town|telephone|preparer|acknowledg|,\\s*[A-Za-z]{2}\\s+\\d{5}(-\\d{4})?\\s*$)", "i");

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
  r = r.replace(/\b(value of|interest in|the|a|an|of|in|at|held|funds?|accounts?|companies|company|end of year|publicly[- ]traded|common|trusts?|securit(y|ies)|contracts?|investments?)\b/gi, " ");
  return r.replace(/[^a-z0-9]/gi, "").length < 6;
}

export function parseRows(section, opts = {}) {
  const rows = [];
  let sdba = false;
  let nameBuf = [];
  let curSection = "";
  // a valueless "Total ..." line means the subtotal WRAPPED: its value arrives
  // on the next short line ("Total Registered Investment" ↵ "Companies  613,913,288")
  let totalWrap = false;
  const valueRe = /\$?\s*([0-9][0-9,]{2,})\s*$/;

  for (const raw of section) {
    // leading "*" is the party-in-interest marker on holding rows — drop it
    // before matching so starred holdings aren't mistaken for footnotes.
    // trailing "**" (assets >5% of plan) hides the line-terminal value.
    let t = raw.trim().replace(/^\*+\s*/, "").replace(/\s*\*{1,3}\s*$/, "");
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
    // "PAR/SHARES | COST | MARKET VALUE | UNREALIZED GAIN/LOSS" layouts
    // (Verizon Master Savings Trust) put the GAIN last — drop it (negatives
    // are parenthesized) so the market value becomes line-terminal
    if (opts.gainLast) {
      const gp = t.match(/^(.*?[0-9][0-9,]*(?:\.\d+)?)\s+(?:-|\(? ?-?[0-9][0-9,]*(?:\.\d+)?\)?)\s*$/);
      if (gp) {
        t = gp[1].replace(/\.\d+$/, "");
        if (/(^|\s)-$/.test(t)) { nameBuf = []; continue; } // worthless holding
      }
    }
    if (SKIP_ROW.test(t) || DATE_LINE.test(t)) {
      nameBuf = [];
      totalWrap = /^(sub|grand )?total\b/i.test(t) && !valueRe.test(t);
      continue;
    }
    if (/:\s*$/.test(t)) { curSection = t.replace(/:\s*$/, ""); nameBuf = []; totalWrap = false; continue; } // section subheading

    const vm = t.match(valueRe);
    if (vm && totalWrap && t.slice(0, t.length - vm[0].length).trim().split(/\s+/).length <= 3) {
      totalWrap = false;
      continue; // the wrapped subtotal's value line — not a holding
    }
    totalWrap = false;
    if (!vm) {
      // short ALL-CAPS lines and bare type phrases ("MUTUAL FUNDS",
      // "Publicly-traded Common Stock") are section headers, not wrapped
      // fund names — don't glue them onto the next row
      if (/^[A-Z][A-Z\s/&,-]*$/.test(t) && t.split(/\s+/).length <= 4) { curSection = t; nameBuf = []; continue; }
      if (t.split(/\s+/).length <= 5 && classify(t) && typeOnly(t)) { curSection = t; nameBuf = []; continue; }
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
    // wrapped subtotals ("Total Registered Investment" ↵ "Companies  613,913,288")
    // defeat the line-level ^total filter — catch them once assembled
    if (/^(sub|grand )?total\b/i.test(full)) continue;
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
          // Short-Term Investment Fund" must not shrink to "BlackRock".
          // "U. S. GOVERNMENT SECURITIES" splits into two "words" but its
          // cut is letter-poor punctuation — keep the full name so the
          // residue filter below doesn't silently drop the row (Verizon
          // Master Savings Trust summary lost its $2.77B govt row this way).
          // EXCEPT when the letter-poor cut is column glue swept into the
          // name cell ("6,793,341 $ 6,793,341 $ - $ -", "$ $ $ $",
          // "2020 2019 |"): those are statement fragments, and keeping them
          // let junk statement regions outscore real 4i tables — surface
          // the cut so the residue filter drops the row as it did pre-v32.
          if (cut.split(/\s+/).length >= 2) {
            if (cut.replace(/[^a-z]/gi, "").length >= 3) { name = cut; break; }
            if (/[$|]|\d,\d{3}/.test(cut)) { name = cut; break; }
          }
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
    // wrapped lines carry their column gaps into the assembled name
    name = name.replace(/\s{2,}/g, " ");
    // financial-statement rows ("Participants 41,200,000", "Company",
    // "Rollover", "From participants") leak in when a candidate region
    // sweeps a contributions schedule — bare finance nouns are never funds
    if (/^(participants?|company|employer|employee|rollovers?|forfeitures?|interest|dividends|other|contributions?|(?:from|to) participants?|other net disbursements?|net disbursements?)$/i.test(name.trim())) continue;
    // rows often carry no type of their own — it lives in the section header
    // ("Common/Collective Trusts"). SDBA/loans must not inherit: those section
    // types would wrongly collapse itemized rows.
    let rowType = type;
    if (!rowType && curSection) {
      const secType = classify(curSection);
      if (secType && secType !== "SDBA" && secType !== "Participant loans") rowType = secType;
    }
    rows.push({ name: name.slice(0, 90), type: rowType, value, sec: curSection });
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
export function parse4i(text, assetsEOY, sponsorName = "", codes = "") {
  const lines = text.split("\n");
  const headRe = /(schedule\s+h.{0,40}line\s*4i|schedule\s+of\s+assets\s*\(held|schedule\s+of\s+assets\s+held)/i;
  const endRe = /(line\s*4j|acquired\s+and\s+disposed|signature of)/i;
  // an SMA's attached security-level statement follows the 4i table and its
  // headers/totals leak junk rows — a standalone statement heading ends the
  // region. Anchored to the whole trimmed line so the in-table reference
  // "(see attached Portfolio Statement)" doesn't truncate the real table.
  const stopRe = /^portfolio (valuation|statement)s?$|^(schedule|statement) of (portfolio )?investments?$/i;
  const atStop = (line) => stopRe.test(line.trim());

  const starts = [];
  for (let i = 0; i < lines.length; i++) if (headRe.test(lines[i])) starts.push(i);
  if (!starts.length) return { found: false };

  // single-heading regions
  const candidates = [];
  for (let s = 0; s < starts.length; s++) {
    let end = s + 1 < starts.length ? starts[s + 1] : Math.min(lines.length, starts[s] + 4000);
    for (let i = starts[s] + 3; i < end; i++) {
      if (endRe.test(lines[i]) || atStop(lines[i])) { end = i; break; }
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
      if (endRe.test(lines[i]) || atStop(lines[i])) { end = i; break; }
    }
    candidates.push([cl[0], end]);
  }

  let best = null;
  for (const [s, end] of candidates) {
    const region = lines.slice(s, end);
    const regionText = region.join("\n");
    const sharesLast = /current\s+value\s+shares(\s*\/?\s*par)?|shares\s+par\s*$/im.test(regionText);
    // header ends with an unrealized gain/loss column AFTER the value column
    // — without this the parser reads each row's GAIN as its value
    const gainLast = /(?:market|current|fair) value unrealized (?:gain|appreciation)/i
      .test(regionText.replace(/[ \t]+/g, " "));
    const parsed = parseRows(region, { sharesLast, gainLast });
    if (parsed.funds.length < 2) continue;
    const raw = parsed.totalValue;
    // only consider (thousands) scaling when the region says so — otherwise a
    // page of small full-dollar rows can fake a good ratio at 1000x
    const marked = /thousands? of dollars|\(in thousands|\(thousands|\(\$000|000s? omitted|dollars in thousands/i.test(region.join("\n"));
    // trustee statements (Verizon Master Savings Trust) file a CLASS-LEVEL
    // summary page followed by thousands of per-security detail pages that
    // double-count it. Prefer the summary; penalize security floods in
    // gain-last statements so an arbitrary detail slice can't outscore it.
    const CLASS_STEM = /^(interest[- ]bearing cash|u\.? ?s\.? government securities|corporate debt|corporate stock|common\/?collective trust|pooled separate account|master trust|103[- ]12 investment|registered investment compan|insurance company general|other investments?|participant loans?|partnership\/joint venture|real estate|loans \(other|employer[- ]related securit)/i;
    const classy = parsed.funds.filter((f) => CLASS_STEM.test(f.name)).length;
    const isSummary = parsed.funds.length >= 4 && classy / parsed.funds.length >= 0.8;
    for (const scale of marked ? [1, 1000] : [1]) {
      const ratio = assetsEOY ? (raw * scale) / assetsEOY : 0;
      if (!ratio) continue;
      const closeness = Math.abs(Math.log(ratio));
      const score = -closeness + Math.min(parsed.funds.length, 40) * 0.005
        + (isSummary && closeness < 0.5 ? 0.1 : 0)
        - (gainLast && parsed.funds.length >= 60 ? 0.2 : 0);
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
  const GENERIC = new Set(["inc", "incorporated", "corp", "corporation", "company", "companies", "llc", "llp", "ltd", "group", "holdings", "holding", "the", "and", "trust", "master", "savings", "plan", "plans", "usa"]);
  const spTokens = sponsorName.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !GENERIC.has(w)).slice(0, 3);
  const isEmployer = (n) => spTokens.some((tok) => n.toLowerCase().includes(tok));
  const itemized = funds.filter((f) => (f.type === "Stock" || f.type === "Company stock") && !isEmployer(f.name));
  let sma = null, smaKind = null, sdbaOut = best.sdba;
  if (itemized.length >= 3) {
    // Are these the innards of a managed account (a single menu option) or
    // participants' own brokerage picks? Section headers say; failing that,
    // a plan with the 2R brokerage code and NO aggregate brokerage line is
    // reporting brokerage assets individually (allowed by the instructions).
    const brokRe = /brokerage|self.?directed|sdba|pcra/i;
    const brokRows = itemized.filter((f) => brokRe.test(f.sec || ""));
    const mgdRows = itemized.filter((f) => !brokRe.test(f.sec || ""));
    const hasAggSdba = funds.some((f) => f.type === "Brokerage window");
    const noSectionInfo = brokRows.length === 0 && !itemized.some((f) => brokRe.test(f.sec || ""));
    const treatAllAsBrok = noSectionInfo && !hasAggSdba && /2R/.test(codes);
    const keep = funds.filter((f) => !itemized.includes(f));
    const buckets = [];
    if (treatAllAsBrok) buckets.push(["Participant brokerage holdings", "Brokerage window", itemized]);
    else {
      if (brokRows.length) buckets.push(["Participant brokerage holdings", "Brokerage window", brokRows]);
      if (mgdRows.length) buckets.push(["Managed account holdings", "Managed account", mgdRows]);
    }
    for (const [label, type, list] of buckets) {
      keep.push({ name: `${label} (${list.length} positions)`, type, value: list.reduce((a, f) => a + f.value, 0) });
      if (type === "Brokerage window") sdbaOut = true;
    }
    funds = keep.sort((a, b) => b.value - a.value);
    sma = itemized.slice(0, 150).map((f) => ({ name: f.name, type: f.type, value: f.value }));
    smaKind = treatAllAsBrok || (brokRows.length && !mgdRows.length) ? "brokerage"
      : brokRows.length ? "mixed" : "managed";
  }
  for (const f of funds) delete f.sec;

  return { found: true, thousands: best.scale === 1000, sdba: sdbaOut, funds, ratio: best.ratio, ...(sma ? { sma, smaKind } : {}) };
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
  // form-question text mentions "matching contributions" as a checkbox
  // option (21b) — 30,795 false "quotes" shipped before these markers were
  // vetoed (found by hourly due diligence 2026-07-27)
  const BOILER = /_{3,}|provide explanation|part [ivx]+\b|schedule [a-z]\b|check(?:box| the box| all boxes)|see instructions|yes ?\/ ?no|permissive aggregation|design[- ]based safe harbor|\b2[01][abc]\b|complete this item|\bX\b ?(?:Yes|No)|(?:Yes|No) ?\bX\b/i;
  const clean = (s) => s
    // page-heading glue: strip the date ONLY as part of the heading block —
    // a blanket date removal ate real dates mid-sentence ("During the year
    // ended December 31, 2022, the Company…" became "the year ended ,")
    .replace(/\b[\w .,]{0,60}Notes? to Financial Statements\b(?:[\s,]*December 31, 20\d\d(?: and 20\d\d)?)?/gi, " ")
    .replace(/\bNote \d+ ?[-–—] ?[^.]{0,60}\((?:Continued|concluded)\)/gi, " ")
    .replace(/\s{2,}/g, " ").trim();
  const cap = (s) => (s.length > 300 ? s.slice(0, 297) + "…" : s);
  const sentence = (idx, span = 0) => {
    let a = t.lastIndexOf(". ", idx); a = a === -1 ? Math.max(0, idx - 220) : a + 2;
    let b = t.indexOf(". ", idx); b = b === -1 ? Math.min(t.length, idx + 280) : b + 1;
    // bullet lists parse as one endless "sentence" — window the excerpt so
    // the quote always contains the FULL matched span (through the last
    // tier), not just its start (audit-verified: formula ⊆ quote)
    const end = idx + span;
    if (end + 20 > b) b = Math.min(t.length, end + 20);
    let cut = false;
    if (end - a > 270) { a = Math.max(a, end - 250); cut = true; }
    const s = clean(t.slice(a, b)).replace(/^[a-z]/, (c) => c.toUpperCase());
    return cap((cut ? "…" : "") + s);
  };

  // ---- employer match formula ----
  // some auditors spell every number out — "a safe-harbor match of one
  // hundred percent of the first one percent and fifty percent of the next
  // five percent" (O'Neal Steel). The head/tier patterns accept the words
  // and W() renders them as digits; quotes stay verbatim from the filing.
  const W = (x) => ({ "one hundred": 100, "seventy five": 75, "twenty five": 25, fifteen: 15, fifty: 50, forty: 40, thirty: 30, twenty: 20, sixty: 60, ten: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }[String(x).toLowerCase().replace(/-/g, " ")] ?? +x);
  const mf =
    t.match(/match(?:ing|ed)?[^.]{0,140}?(\d{1,3}(?:\.\d+)?|one hundred|seventy[- ]five|twenty[- ]five|fifteen|fifty|forty|thirty|twenty|sixty|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%) (?:of|on) (?:the )?first (\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%)/i) ||
    t.match(/(\d{1,3}(?:\.\d+)?) ?(?:percent|%) match(?:ing)?[^.]{0,80}?(?:up to|on the first) (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
    // "matching contribution ... equal to 100% of ... deferral contributions
    // up to 6% of ... compensation" (Black Hills style — no "first")
    // "up to a 1%" — without the optional article the engine backtracks
    // into pairing the wrong numbers (QACA filings extracted "1% of the
    // first 6%" instead of "100% of the first 1%")
    // enumerated clauses — "a) a matching contribution of 100% of
    // participant contributions for the first 1% of … base compensation
    // and b) … 50% … up to the next 5%" (Rotary) — "for the first" binds
    // the head; without it the maximum-of shape below grabs clause b)'s
    // rate with the 6% total cap ("50% of the first 6%")
    t.match(/match(?:ing|ed)?[^.]{0,160}?(\d{1,3}(?:\.\d+)?|one hundred|seventy[- ]five|twenty[- ]five|fifty|twenty) ?(?:percent|%) of [^.]{0,80}?for the first (\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%)/i) ||
    t.match(/match(?:ing|ed)?[^.]{0,160}?(\d{1,3}(?:\.\d+)?|one hundred|seventy[- ]five|twenty[- ]five|fifty|twenty) ?(?:percent|%) of [^.]{0,140}?(?:up to|not to exceed|not in excess of|(?:that )?do(?:es)? not exceed|to a maximum of|maximum[^.]{0,60}? of) (?:an? |the first )?(\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%) of/i) ||
    // auditor template with no "match" word — "The Company contributed 25
    // percent of the first 3 percent of eligible compensation that a
    // participant contributed" (Rental One, Rabun Gap); the trailing
    // participant-deferral anchor is what makes it a match, not an NEC
    t.match(/(?:company|employer|school|organization|foundation|sponsor)[^.]{0,40}?contribut(?:es|ed) (\d{1,3}(?:\.\d+)?) ?(?:percent|%) of (?:the )?first (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of [^.]{0,90}?(?:that (?:a|the|each) participant contribut|compensation|pay|wages)/i);
  // spelled-out fraction rates: "one-half of the first 8% of base
  // compensation" (Opus Inspection) — map to a percentage
  const FRAC = { "one-half": 50, "one half": 50, "one-third": 33, "one third": 33, "one-quarter": 25, "one quarter": 25, "two-thirds": 67, "two thirds": 67 };
  const frac = !mf && t.match(/match(?:ing|ed)?[^.]{0,160}?\b(one[- ]half|one[- ]third|one[- ]quarter|two[- ]thirds)\b of the first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
  // dollar-phrased formulas: "dollar-for-dollar up to 4%", "50 cents per dollar on the first 6%"
  const df = !mf && (t.match(/dollar[- ]for[- ]dollar[^.]{0,80}?(?:up to|on the first) (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i)
    ? { pct: 100, cap: null } : null);
  const cents = !mf && !df && t.match(/(\d{1,3}(?:\.\d+)?) ?cents (?:for|per|on) (?:each |every )?(?:\$1(?:\.00)?|dollar)[^.]{0,80}?(?:up to|on the first) (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
  // match stated as a TABLE, not prose: "Employee Contribution | Employer
  // Match / First 2% of eligible compensation 100 % / Next 2% ... 50 %"
  // (Northrop Grumman). Table columns collapse onto one line in the
  // flattened text; require a nearby "match" so unrelated tables can't
  // masquerade as a formula.
  let mtab = null;
  if (!mf && !df && !cents) {
    const tabRe = /first (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of (?:eligible |annual |base )?(?:compensation|pay|earnings) (\d{1,3}) ?(?:percent|%)/gi;
    let c;
    while ((c = tabRe.exec(t))) {
      if (/match/i.test(t.slice(Math.max(0, c.index - 300), c.index))) { mtab = c; break; }
    }
  }
  // rate-after-tier prose: "the first 3% of salary deferrals are matched
  // 100%, and salary deferrals greater than 3% and up to 5% are matched at
  // a rate of 50%" (Berry Foundation) — mf's rate-first shapes can't bind it
  let minv = null;
  if (!mf && !df && !cents && !mtab) {
    minv = t.match(/first (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of [^.]{0,60}?(?:is|are) matched (?:at (?:a rate of )?)?(\d{1,3}(?:\.\d+)?) ?(?:percent|%)/i);
  }
  // a hedged "may contribute a discretionary match of 6% of the first 4%"
  // followed by a DEFINITE formula ("The Company makes a safe harbor
  // matching contribution equal to 100%…") must yield to the definite one
  // — the discretionary head once fused with the adjacent safe-harbor
  // sentence into "6% of the first 4% + 50% of the next 1%"
  if (mf) {
    const hedgePre = t.slice(Math.max(0, mf.index - 90), mf.index);
    if (/\bmay (?:elect to )?(?:make|contribute|provide)\b[^.]*?discretionary[^.]*$/i.test(hedgePre)) {
      const rest = t.slice(mf.index + mf[0].length, mf.index + mf[0].length + 600);
      const def = rest.match(/(?:makes|will make|provides)[^.]{0,60}?match(?:ing|ed)?[^.]{0,160}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) of [^.]{0,140}?(?:up to|not to exceed|not in excess of|(?:that )?do(?:es)? not exceed|to a maximum of) (?:an? |the first )?(\d{1,2}(?:\.\d+)?) ?(?:percent|%) of/i) ||
        rest.match(/(?:makes|will make|provides)[^.]{0,60}?match(?:ing|ed)?[^.]{0,140}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) (?:of|on) (?:the )?first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
      if (def) Object.assign(mf, { 1: def[1], 2: def[2], index: def.index + mf.index + mf[0].length, 0: def[0] });
    }
  }
  // "Effective January 1, 2022, the Plan changed the safe harbor
  // contribution formula to contribute 200% of the first 2%…" supersedes
  // a formula stated EARLIER in the paragraph — mirror of the "prior to"
  // era handling below, which only catches backward-looking phrasing
  if (mf) {
    const rest = t.slice(mf.index + mf[0].length, mf.index + mf[0].length + 700);
    const chg = rest.match(/(?:effective|beginning) [^.]{0,60}?\bchanged\b[^.]{0,80}?formula to (?:contribute|match|provide)[^.]{0,40}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) of (?:the )?first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
    if (chg) Object.assign(mf, { 1: chg[1], 2: chg[2], index: chg.index + mf.index + mf[0].length, 0: chg[0] });
  }
  // a formula introduced by "Prior to January 1, 2023 …" is DISCONTINUED
  // (Cooper Tire) — prefer a later-stated current formula; if none exists,
  // label the era so the site never presents an old formula as current
  let mfEra = "";
  if (mf) {
    const pre = t.slice(Math.max(0, mf.index - 130), mf.index + mf[0].length + 90);
    let era = pre.match(/((?:prior to|before|until|through)) (?:[A-Z][a-z]+ \d{1,2},? )?(\d{4})/i);
    // "the period from January 1, 2023 through March 17, 2023" is an
    // AUDIT-PERIOD range, not a formula expiry — H Enterprises' real 50%
    // match was swapped for a later discretionary sentence by this misfire
    if (era && /from (?:[A-Z][a-z]+ \d{1,2},? ?)?\d{0,4},? ?$/i.test(pre.slice(0, era.index))) era = null;
    // "The employer match for the year ended December 31, 2019 was 100%…"
    // in a plan-year-2023 filing is a STALE formula (Freedom Boat Club).
    // Two-year audit phrasing ("years ended 2023 and 2022") stays current;
    // a lone year ≥2 behind the filing's newest year gets the era label.
    if (!era) {
      const era2 = pre.match(/for the (?:plan )?year ended (?:[A-Z][a-z]+ \d{1,2},? )?(\d{4})\b(?!,? and)/i);
      // "…through March 17, 2023 AND for the year ended December 31, 2022"
      // enumerates a terminated plan's two audit periods — not staleness
      if (era2 && !/\band +$/i.test(pre.slice(0, era2.index))) {
        // newest year from DATED tokens only (month-name dates, mm/dd/yyyy,
        // "plan year YYYY") — bare years pollute (loan maturity ranges like
        // "2023-2027" made everything "stale")
        let maxYear = 0;
        for (const y of t.matchAll(/(?:(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2},? |\d{1,2}\/\d{1,2}\/|plan year )(20[0-4]\d)/gi)) maxYear = Math.max(maxYear, +y[1]);
        if (+era2[1] <= maxYear - 2) era = { 1: "for plan year", 2: era2[1], index: era2.index };
      }
    }
    if (era) {
      const rest = t.slice(mf.index + mf[0].length);
      const again = rest.match(/match(?:ing|ed)?[^.]{0,140}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) (?:of|on) (?:the )?first (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
        rest.match(/match(?:ing|ed)?[^.]{0,160}?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) of [^.]{0,140}?(?:up to|not to exceed|to a maximum of) (?:an? |the first )?(\d{1,2}(?:\.\d+)?) ?(?:percent|%) of/i);
      if (again) { again.index += mf.index + mf[0].length; Object.assign(mf, { 1: again[1], 2: again[2], index: again.index, 0: again[0] }); }
      else mfEra = ` (formula in effect ${era[1].toLowerCase()} ${era[2]} per the filing)`;
    }
  }
  if (mf) {
    // a formula prefixed "For participants of <entity>," is scoped to one
    // employer group — Continental Tire's plan pays Hoosier employees
    // 100%/5% and O'Sullivan employees 100%/6%; presenting either as THE
    // plan match is wrong. Say it varies and quote the group formulas.
    const scopePre = t.slice(Math.max(0, mf.index - 110), mf.index);
    // same-sentence test tolerates abbreviation periods ("Corp., the …");
    // only a period followed by a space and a capital ends the sentence
    const sm = scopePre.match(/for (?:participants|employees) (?:of|employed by|at) [A-Z]/i);
    if (sm && !/\. +[A-Z]/.test(scopePre.slice(sm.index))) {
      out.match = "Varies by employer group";
      out.matchText = sentence(mf.index);
    } else {
    // "limited to 50% of employee contributions with a maximum of up to 2%
    // of the participant's compensation" (Yesler) caps the MATCH, not the
    // matched-deferral tier — rendering it "50% of the first 2%" halves the
    // real benefit. State it the way the filing does.
    const capStyle = /with a maximum of up to|up to a maximum match(?:ing)? (?:contribution )?of/i.test(mf[0]) &&
      /(?:percent|%) of (?:the )?(?:employee|participant)s?'? (?:elective )?(?:deferral|contribution)/i.test(mf[0]);
    out.match = capStyle
      ? `${W(mf[1])}% of contributions, max match ${W(mf[2])}% of pay`
      : `${W(mf[1])}% of the first ${W(mf[2])}% of pay`;
    // capture EVERY additional tier — "75% of the first 1%, 50% of the next
    // 4%, and 25% of the next 1%" (Kohler) has a comma-joined middle tier;
    // "50% of a participant's contributions up to the next 2%" (Simmons
    // Foods) puts words between the rate and "next"
    // the gap must not cross another rate: '%' is excluded by character
    // class, spelled "percent" needs the lookahead (O'Neal double-bound
    // "one hundred" onto the second tier without it)
    const tierRe = /(\d{1,3}(?:\.\d+)?|one hundred|seventy[- ]five|twenty[- ]five|fifty|twenty) ?(?:percent|%) of (?:(?!percent\b)[^.%]){0,60}?next (\d{1,2}(?:\.\d+)?|ten|one|two|three|four|five|six|seven|eight|nine) ?(?:percent|%)/gi;
    // a NEW match head in the following sentence is a separate formula —
    // its tiers must not chain onto this head (5%−4% once fabricated
    // "+ 50% of the next 1%"). Legit continuations ("In addition, … 50%
    // of the next 2%") carry no head phrase and still chain.
    let tail = t.slice(mf.index, mf.index + 400);
    const sEnd = tail.slice(mf[0].length).search(/\. +[A-Z(]/);
    if (sEnd !== -1) {
      const cont = tail.slice(mf[0].length + sEnd);
      if (/(?:makes?|may (?:elect to )?(?:make|contribute)|will make)[^.]{0,90}?match(?:ing)?\b|match(?:ing)? contribution equal to/i.test(cont)) {
        tail = tail.slice(0, mf[0].length + sEnd + 1);
      }
    }
    let tm; let tguard = 0; let lastTierEnd = mf[0].length;
    while ((tm = tierRe.exec(tail)) && tguard++ < 4) {
      out.match += ` + ${W(tm[1])}% of the next ${W(tm[2])}%`;
      lastTierEnd = tm.index + tm[0].length;
    }
    // QACA/two-part safe harbor phrasing: "…and 50% of the deferral which
    // exceeds 1% up to 6% of compensation" → 50% of the next (6−1)%
    if (tguard === 0) {
      const ex = tail.match(/\b(?:and|plus) (?:an additional )?(\d{1,3}(?:\.\d+)?) ?(?:percent|%) (?:match )?of [^.]{0,140}?(?:(?:exceeds?|exceeding|in excess of|above)[^.]{0,100}?(?:up to|not to exceed|(?:but )?not?,? more than)|between [^.]{0,40}? and) (?:an? )?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
      if (ex && +ex[2] > W(mf[2])) {
        out.match += ` + ${+ex[1]}% of the next ${+ex[2] - W(mf[2])}%`;
        lastTierEnd = ex.index + ex[0].length;
      }
    }
    // era label goes after ALL tiers so the annotation reads as one unit
    // a dollar cap changes the real benefit — "25% of deferrals up to 6%,
    // not to exceed $2,500 on an annual basis" (Digirad) is NOT the same
    // match as an uncapped 25%/6% for anyone earning over ~$167k
    const capWin = t.slice(mf.index, mf.index + lastTierEnd + 160);
    // "not to exceed $2,250 per quarter for a total of $9,000 per year"
    // (VMware) — take the ANNUAL total, never a shorter-period figure
    const dcap = capWin.match(/total of \$([\d,]+) per year/i) ||
      capWin.match(/not to exceed \$([\d,]+)(?! per (?:quarter|month|pay))[^.]{0,40}?(?: on an annual basis| per year| per plan year| each year| annually)/i);
    if (dcap) out.match += ` (max $${dcap[1]}/yr per the filing)`;
    out.match += mfEra;
    // the quote must contain every tier the formula states
    out.matchText = sentence(mf.index, lastTierEnd);
    }
  } else if (frac) {
    out.match = `${FRAC[frac[1].toLowerCase().replace(/ /, "-")] || FRAC[frac[1].toLowerCase()]}% of the first ${+frac[2]}% of pay`;
    out.matchText = sentence(frac.index);
  } else if (df) {
    const m2 = t.match(/dollar[- ]for[- ]dollar[^.]{0,80}?(?:up to|on the first) (\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
    out.match = `100% of the first ${+m2[1]}% of pay`;
    out.matchText = sentence(m2.index);
  } else if (cents) {
    out.match = `${+cents[1]}% of the first ${+cents[2]}% of pay`;
    out.matchText = sentence(cents.index);
  } else if (minv) {
    out.match = `${+minv[2]}% of the first ${+minv[1]}% of pay`;
    const ex2 = t.slice(minv.index, minv.index + 300).match(/greater than (\d{1,2}(?:\.\d+)?) ?(?:percent|%) and up to (\d{1,2}(?:\.\d+)?) ?(?:percent|%) [^.]{0,60}?matched (?:at (?:a rate of )?)?(\d{1,3}(?:\.\d+)?) ?(?:percent|%)/i);
    let invEnd = minv[0].length;
    if (ex2 && +ex2[2] > +ex2[1]) { out.match += ` + ${+ex2[3]}% of the next ${+ex2[2] - +ex2[1]}%`; invEnd = ex2.index + ex2[0].length; }
    out.matchText = sentence(minv.index, invEnd);
  } else if (mtab) {
    out.match = `${+mtab[2]}% of the first ${+mtab[1]}% of pay`;
    const tierRe2 = /next (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of (?:eligible |annual |base )?(?:compensation|pay|earnings) (\d{1,3}) ?(?:percent|%)/gi;
    const tail = t.slice(mtab.index, mtab.index + 400);
    let tm2; let tg = 0;
    while ((tm2 = tierRe2.exec(tail)) && tg++ < 4) out.match += ` + ${+tm2[2]}% of the next ${+tm2[1]}%`;
    out.matchText = sentence(mtab.index);
  } else {
    // cumulative match tables — "When an Employee Contributes | Company
    // Will Match an Additional | Cumulative Company Match … 6% of their
    // pay … 3.00%" (Northcentral University): the last cumulative percent
    // is the total-match cap; the tier structure is non-linear, so state
    // the cap and let the quote carry the table
    const cumH = t.match(/when an employee contributes[^.]{0,60}?will match/i);
    if (cumH) {
      const win = t.slice(cumH.index, cumH.index + 700);
      const rows = [...win.matchAll(/(\d{1,2})(?:\.\d+)? ?% of (?:their|the employee'?s?) pay ([\d.]+) ?%[^%]{0,60}?([\d.]+) ?%/gi)];
      if (rows.length >= 3) {
        out.match = `Tiered schedule — up to ${+rows[rows.length - 1][3]}% of pay total match`;
        out.matchText = sentence(cumH.index, Math.min(700, win.length));
      }
    }
    // rate-only match with no stated cap: "The company contributed 10% of
    // the employee qualified contributions" (Exeter) — show the rate the
    // filing states rather than nothing
    const rateOnly = t.match(/(?:company|employer|plan sponsor)[^.]{0,40}?contribut(?:es|ed) (\d{1,3}(?:\.\d+)?) ?(?:percent|%) of the (?:employee|participant)s?'? ?(?:qualified |elective |eligible )?(?:deferral )?contributions/i);
    if (!out.match && rateOnly) {
      out.match = `${+rateOnly[1]}% of contributions`;
      out.matchText = sentence(rateOnly.index);
    }
    // "The Company made a match of up to 1% of compensation" (Columbia
    // Ford) — a stated cap with no rate is still a formula worth showing
    const upTo = t.match(/(?:made |makes )?a match of up to (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of (?:eligible |annual )?compensation/i);
    // "may elect to make discretionary matching contributions … determined
    // by the Board" — roughly half the no-formula backlog. There IS no
    // formula; discretionary is the answer, not a gap.
    const disc = t.match(/discretionary (?:401\(k\) )?match(?:ing)?(?: and profit[- ]sharing)? contributions?|match(?:ing)?(?: and profit[- ]sharing)? contributions? [^.]{0,80}?(?:discretionary|determined (?:annually |each year )?by (?:its |the )?(?:board|company|employer|trustees|firm|plan sponsor|management))|on a discretionary basis,? contribut[^.]{0,30}?match|(?:contribute|make) a discretionary match(?:ing)?\b|at (?:its|their) discretion,? (?:may )?contribut\w+ a match|(?:company|employer) contributions are (?:entirely )?discretionary/i);
    if (out.match) {
      // rate-only already answered it
    } else if (upTo) {
      out.match = `Up to ${+upTo[1]}% of pay`;
      out.matchText = sentence(upTo.index);
    } else if (disc) {
      out.match = "Discretionary — set year to year";
      out.matchText = sentence(disc.index);
    } else {
      // fall back to the descriptive sentence, skipping form-page boilerplate
      const mre = /(?:employer|company|plan sponsor|organization|school|firm)(?:['’]s)? (?:made |makes |will make |shall make |may make |also )?(?:safe harbor )?match(?:ing|ed)? (?:safe harbor )?(?:401\(k\) )?contributions?|matching contributions? (?:is|are|equal|of|based|provided)/gi;
      let mm;
      while ((mm = mre.exec(t))) {
        const s = sentence(mm.index);
        if (!BOILER.test(s) && s.length > 60) { out.matchText = s; break; }
      }
    }
  }

  // schedules split by hire date ("hired before September 1, 2016 are
  // immediately vested … hired after … after three years" — United Farmers
  // Cooperative): showing one cohort's schedule alone misstates the other's
  const hireSplitLabel = (which) => {
    if (out[which] && out[which + "Text"] && !/varies|hire date/i.test(out[which]) &&
        /hired (?:before|after|on or after|prior to)/i.test(out[which + "Text"]))
      out[which] += " (varies by hire date per the filing)";
  };

  // "There were no discretionary Plan Sponsor matching contributions for
  // the 2023 plan year. During 2022, the Plan Sponsor matched 100%…"
  // (American Physician Partners) — the extracted formula is the OLD one;
  // say so instead of presenting it as current
  if (out.match && out.matchText && !/\(formula in effect|\(none made/.test(out.match)) {
    const neg = t.match(/(?:there (?:were|was)|made) no [^.]{0,80}?match(?:ing)? contributions? [^.]{0,60}?(?:for|in|during) the (\d{4}) plan year/i);
    const dur = out.matchText.match(/\bDuring (20\d\d)\b/i);
    if (neg && dur && +dur[1] < +neg[1]) out.match += ` (none made for plan year ${neg[1]} per the filing)`;
  }

  // ---- vesting of EMPLOYER money (employee deferrals are always immediate) ----
  const vestSentences = [];
  const vre = /[^.]{0,220}\bvest(?:ed|ing)?\b[^.]{0,220}\./gi;
  let vm; let guard = 0;
  while ((vm = vre.exec(t)) && guard++ < 40) {
    const s = clean(vm[0]);
    // conditional/alternative schedules are not the plan's actual schedule:
    // top-heavy fallbacks and death/disability accelerations produced
    // "5-year cliff" claims that contradict the real graded schedule
    if (!BOILER.test(s) && !/defined benefit|pension benefit|top[- ]heavy|in the event (?:the plan|of death|of disab)|should the plan (?:be|become)|alternative vesting|if the plan (?:is|becomes)/i.test(s)) vestSentences.push(s);
  }
  // sentences describing a SUPERSEDED schedule ("prior to January 1, 2021,
  // vesting was based on…", Silvertip) rank behind current-tense ones
  // forfeiture-accounting sentences ("forfeited non-vested accounts …
  // were used to reduce Company contributions") mention vesting words but
  // never state the schedule — 3,582 of them shipped as the vesting quote
  const vRank = (s) =>
    (/(?:prior to|before|until|through) (?:[a-z]+ \d{1,2},? )?\d{4}/i.test(s) ? 2 : 0) +
    (/forfeit/i.test(s) ? 1 : 0);
  vestSentences.sort((a, b) => vRank(a) - vRank(b));
  // "are vested immediately" word order counts the same as "immediately
  // vested"; and when the MATCH is stated immediately vested, a graded/
  // cliff schedule scoped ONLY to discretionary non-elective / profit-
  // sharing money must not displace it (Kast: safe-harbor match immediate,
  // PS graded 2–6 yrs — the match is the plan's active employer money)
  const IMMED = /immediately? (?:(?:100|one hundred) ?(?:percent|%) )?(?:fully )?vested|vested immediately|fully vested (?:at all times|immediately|upon)|(?:100|one hundred) ?(?:percent|%) vested (?:at all times|immediately|in all)|always (?:fully |(?:100|one hundred) ?(?:percent|%) )?vested/i;
  const matchImmediate = vestSentences.some((s) =>
    /matching (?:contributions?|accounts?)|company match/i.test(s) && IMMED.test(s));
  // graded/cliff language always describes employer money — check it FIRST
  for (const s of vestSentences) {
    if (matchImmediate && /non.?elective|profit.?sharing/i.test(s) && !/match/i.test(s)) continue;
    const graded = s.match(/(\d{1,2}) ?(?:percent|%) (?:per|each|for each|after each) year|vests? (\d{1,2}) ?(?:percent|%) after each year|graded vesting|graduated vesting/i);
    // 3rd alternative tolerates intervening words — "fully vested in
    // employer matching contributions, and earnings thereon, upon
    // completion of three years of service" (Northrop Grumman)
    const cliff = s.match(/(?:(\w{3,5}|\d)[- ]year cliff|cliff vesting[^.]{0,40}?(\w{3,5}|\d) years?|(?:(?:100|one hundred) ?(?:percent|%)|fully) vest(?:ed)?[^.]{0,80}?(?:after|upon)(?: the)?(?: complet\w+(?: of)?)? (\w{3,5}|\d) years?|0 ?(?:percent|%) vested until (\w{3,5}|\d) years)/i);
    if (graded) { out.vesting = "Graded schedule"; out.vestingText = cap(s); break; }
    if (cliff) {
      const n = cliff[1] || cliff[2] || cliff[3] || cliff[4];
      const num = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[String(n).toLowerCase()] || +n;
      // IRC §411(a)(2)(B) caps DC cliff vesting at 3 years — a "5-year
      // cliff" reading is a misparsed graded schedule or service reference
      if (num >= 1 && num <= 3) { out.vesting = `${num}-year cliff`; out.vestingText = cap(s); break; }
    }
  }
  // vesting stated as a service-year TABLE rather than prose ("2 Years 20,
  // 3 Years 40, ... 5 Years 100" — Kohler style). Require 3+ pairs with
  // non-decreasing percentages ending at 100 within reach of a "vest" word.
  if (!out.vesting) {
    for (const m of t.matchAll(/\bvest(?:ed|ing)?\b/gi)) {
      const win = t.slice(m.index, m.index + 500);
      const pairs = [...win.matchAll(/(?<!than )\b(\d{1,2}) ?years? +(\d{1,3})(?: ?(?:percent|%))?(?=[ .,;)])/gi)]
        .map((p) => [+p[1], +p[2]]).filter(([y, pc]) => y >= 1 && y <= 10 && pc <= 100);
      if (pairs.length >= 3 && pairs[pairs.length - 1][1] === 100 &&
          pairs.every(([, pc], i2) => i2 === 0 || pc >= pairs[i2 - 1][1])) {
        out.vesting = "Graded schedule";
        out.vestingText = cap("Vesting schedule as filed — " + pairs.map(([y, pc]) => `${y} yr: ${pc}%`).join(", "));
        break;
      }
    }
  }
  // header-labeled tables with BARE digit rows — "Years of Service  Vesting
  // Percentage / Less than 1  0% / 1  20% / … / 5 or more  100%" (Simmons
  // Foods) carry no "years" word per row, so the pairs fallback misses them
  if (!out.vesting) {
    const th = t.match(/years of (?:credited |continuous )?(?:service|vesting service)\s+(?:vesting|vested) percentage|following vesting schedule:?\s+years\s+(?:employer|vested|vesting)/i);
    if (th) {
      const win = t.slice(th.index + th[0].length, th.index + th[0].length + 320);
      const pairs = [...win.matchAll(/(less than \d{1,2}|\d{1,2}(?: or more| ?\+)?) +(\d{1,3}) ?%/gi)]
        .map((p) => [p[1].toLowerCase(), +p[2]]).filter(([, pc]) => pc <= 100);
      if (pairs.length >= 3 && pairs[pairs.length - 1][1] === 100 &&
          pairs.every(([, pc], i2) => i2 === 0 || pc >= pairs[i2 - 1][1])) {
        out.vesting = "Graded schedule";
        out.vestingText = cap("Vesting schedule as filed — " + pairs.map(([y, pc]) => `${y} yr: ${pc}%`).join(", "));
      }
    }
  }
  // "immediate" only counts when the sentence explicitly covers employer money
  if (!out.vesting) {
    for (const s of vestSentences) {
      // "always 100% vested in ALL of their Plan accounts" (EP Energy)
      // covers employer money without naming it
      if (!/(matching|employer|company|non.?elective|profit.?sharing) (?:contributions?|accounts?)|company match|all (?:of (?:their|his|her) )?(?:plan )?accounts|all contribution sources/i.test(s)) continue;
      if (IMMED.test(s)) {
        out.vesting = "Immediate"; out.vestingText = cap(s); break;
      }
      if (!out.vestingText && !/forfeit/i.test(s)) out.vestingText = cap(s);
    }
  }
  hireSplitLabel("vesting");
  hireSplitLabel("match");

  // ---- Roth / voluntary after-tax (only positive evidence counts) ----
  // "designate … deferral contributions as after-tax contributions into a
  // Roth account" (Kast) puts Roth LAST — accept contribution words before
  // "into/to/as a Roth" as positive evidence too
  const roth = t.match(/\broth\b[^.]{0,120}(contribut|deferral|option|401)/i) || t.match(/(designated|make) \broth\b/i) ||
    t.match(/(?:contribut|deferral)\w*[^.]{0,80}?(?:into|to|as) an? \broth\b/i);
  if (roth) { out.roth = true; out.rothText = sentence(roth.index); }
  if (/in.?plan.{0,40}(roth )?(conversion|rollover)|convert.{0,40}(to )?(a )?roth/i.test(t)) out.inPlanRoth = true;
  // "after-tax [deferral] contributions", incl. enumerations like
  // "pre-tax, Roth and after-tax deferral contributions". Veto only the
  // "Roth contributions are made on an after-tax basis" phrasing, where
  // "roth" directly modifies the after-tax words with no list separator.
  // "after-tax contributions to a Roth 401(k) option" is ROTH, not
  // voluntary after-tax — Roth money IS after-tax and auditors say so.
  // 4,149 of 8,173 flags (51%) were this phrasing before the post-window
  // veto: a Roth within reach after the phrase, with no list separator
  // ("and"/"or"/comma) in between, means after-tax feeds Roth rather than
  // standing beside it ("Roth and after-tax contributions" still counts).
  for (const at of t.matchAll(/(?:voluntary |additional |employee )?after[- ]tax (?:deferral |employee |savings )?contributions?/gi)) {
    const pre = t.slice(Math.max(0, at.index - 40), at.index);
    const rothModifies = /roth\b[^.]{0,30}$/i.test(pre) && !/(?:,|\band\b|\bor\b)\s*$/i.test(pre);
    const post = t.slice(at.index + at[0].length, at.index + at[0].length + 45);
    const ri = post.search(/\broth\b/i);
    const rothTarget = ri >= 0 && !/[.,;]|\b(?:and|or)\b/i.test(post.slice(0, ri));
    if (rothModifies || rothTarget) continue;
    out.afterTax = true; out.afterTaxText = sentence(at.index); break;
  }
  // BASIS enumerations never say "after-tax contributions": "Contributions
  // can be made on a tax-deferred (pre-tax) basis, after-tax basis or to a
  // Roth 401(k) on an after-tax basis" (Northrop Grumman). Accept when a
  // contribution verb governs the phrase and Roth doesn't directly modify it.
  if (!out.afterTax) {
    for (const m2 of t.matchAll(/after[- ]tax basis/gi)) {
      const pre = t.slice(Math.max(0, m2.index - 90), m2.index);
      const rothMod = /roth\b[^.]{0,40}$/i.test(pre) && !/(?:,|\band\b|\bor\b)\s*$/i.test(pre);
      // "on an after-tax basis as a Roth contribution" is Roth — same
      // post-window veto as the contributions branch (list separators keep
      // NG's "after-tax basis or to a Roth 401(k)" enumeration genuine)
      const post2 = t.slice(m2.index + m2[0].length, m2.index + m2[0].length + 45);
      const ri2 = post2.search(/\broth\b/i);
      const rothTarget2 = ri2 >= 0 && !/[.,;]|\b(?:and|or)\b/i.test(post2.slice(0, ri2));
      if (rothMod || rothTarget2 || !/contribut\w+[^.]{0,80}$/i.test(pre)) continue;
      out.afterTax = true; out.afterTaxText = sentence(m2.index); break;
    }
  }

  // ---- affirmative no-employer-contribution statements ----
  // "The Plan does not provide for employer contributions." (Amphenol) is
  // stronger evidence than a $0 Schedule H line — it's by design, not a
  // skipped year
  const noer = t.match(/plan does not (?:currently )?provide for (?:any )?(?:employer|company|matching)(?: matching)? contributions|no employer (?:matching )?contributions are (?:provided|permitted|made under the plan)/i);
  if (noer) { out.noEmployer = true; out.noEmployerText = sentence(noer.index); }

  // ---- frozen plans: contributions permanently discontinued ----
  const froz = t.match(/(?:plan (?:was|has been|is) (?:amended to )?(?:frozen|freeze)|amended to freeze the plan|permanently discontinu\w+[^.]{0,60}?contributions|(?:board|company|sponsor)[^.]{0,60}?(?:resolved|elected|adopted a resolution|approved a resolution)[^.]{0,40}? to terminate the plan|plan was terminated effective|prior to the plan[’']?s termination)/i);
  if (froz) { out.frozen = true; out.frozenText = sentence(froz.index); }

  // ---- safe harbor & true-up ----
  if (/safe harbor match/i.test(t)) out.safeHarbor = "match";
  else if (/safe harbor non.?elective|non.?elective safe harbor/i.test(t)) out.safeHarbor = "nonelective";
  if (/true[- ]?up/i.test(t)) out.trueUp = true;

  // ---- employer nonelective / core contribution ----
  const nec = t.match(/non.?(?:contributory|elective)[^.]{0,80}?contribution[^.]{0,60}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
    t.match(/(?:employer|company|university|college|institution|organization|hospital|health system) (?:core|automatic|basic|retirement) contribution[^.]{0,60}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i) ||
    t.match(/(?:university|college|institution|organization|hospital|health system|employer|company) (?:also )?contribut(?:es|ed) (?:an amount )?(?:equal to )?(\d{1,2}(?:\.\d+)?) ?(?:percent|%) of/i) ||
    t.match(/contribut\w+ (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of (?:each |eligible |annual )?(?:participant|employee)s?'? (?:eligible )?(?:compensation|pay)[^.]{0,60}?regardless of/i) ||
    // "Company contributions under the safe harbor provision are equal to
    // 3% of compensation" (Eiwa) — a safe-harbor nonelective with neither
    // "nonelective" nor "safe harbor nonelective" in the sentence
    t.match(/(?:company|employer) contributions? under the safe harbor provision (?:is|are) equal to (\d{1,2}(?:\.\d+)?) ?(?:percent|%) of/i);
  if (nec && +nec[1] >= 1 && +nec[1] <= 15) { out.nec = `${+nec[1]}% of pay`; out.necText = sentence(nec.index); }
  // tenure-graded nonelective tables — "Employer contributes a percentage
  // of base compensation based on the following schedule: ≤7 yrs 6% … >10
  // yrs 10%" (Colorado Academy): state the range, quote the table
  if (!out.nec) {
    const svc = t.match(/(?:employer|company|school|academy|organization|university) contribut\w+ a percentage of [^.]{0,80}?compensation based on the following schedule/i);
    if (svc) {
      const pcts = [...t.slice(svc.index, svc.index + 420).matchAll(/(\d{1,2}(?:\.\d+)?) ?%/g)].map((m) => +m[1]).filter((p) => p > 0 && p <= 25);
      if (pcts.length >= 3) {
        out.nec = `${Math.min(...pcts)}%–${Math.max(...pcts)}% of pay, rising with years of service`;
        out.necText = sentence(svc.index, 380);
      }
    }
  }
  // multiemployer/union plans: the employer contribution is an hourly rate
  // set by the CBA, not a formula — say so instead of showing nothing
  if (!out.nec && !out.match && !out.matchText) {
    const cba = t.match(/(?:contribut\w+|amounts?) [^.]{0,120}?(?:collective bargaining agreements?|rates? specified in the (?:applicable )?(?:labor|bargaining) agreements?|per hour worked)/i) ||
      t.match(/signatory employers? [^.]{0,80}?(?:make|remit) contributions?/i);
    if (cba) {
      const s = sentence(cba.index);
      // Schedule R's multiemployer TABLE mentions the CBA too — only prose counts
      if (!BOILER.test(s) && !/name of contributing employer|dollar amount contributed|date collective bargaining agreement/i.test(s)) {
        out.nec = "Set by collective bargaining agreement"; out.necText = s;
      }
    }
  }

  // ---- auto-escalation ----
  const esc = t.match(/(?:automatic(?:ally)? increas\w+|escalat\w+)[^.]{0,120}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)[^.]{0,80}?(?:maximum|up to|cap|not to exceed)[^.]{0,40}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
  const esc2 = esc || t.match(/annual(?:ly)? [^.]{0,40}?automatic(?:ally)? increas\w+|automatic escalation/i);
  if (esc2) {
    out.autoEscalate = esc ? `+${+esc[1]}%/year up to ${+esc[2]}%` : true;
    out.autoEscalateText = sentence(esc2.index);
  }

  // ---- eligibility ----
  // window excludes % — a match/vesting TABLE ("First 4% of eligible
  // compensation 100 % ... less than 5 years of service") once bridged
  // "eligible" to an unrelated service count (Northrop Grumman); cohort
  // qualifiers like "less than N years" are never eligibility rules
  const elig = t.match(/eligib\w+[^.%]{0,140}?(?:(?<!(?:less|more|fewer) than )(\d{1,4}|one|two|three|six|nine|twelve) ?(days?|months?|years?|hours?) of (?:service|employment|continuous)|(?:upon|on) (?:their )?(?:date of )?hire|first day of (?:employment|the month)|immediately)/i);
  if (elig) {
    // "completing six months of service" (Simmons Foods) — spelled-out counts
    const W = { one: 1, two: 2, three: 3, six: 6, nine: 9, twelve: 12 };
    const n = elig[1] ? (W[elig[1].toLowerCase()] || elig[1]) : null;
    out.eligibility = n ? `${n} ${elig[2]} of service` : "Upon hire / immediate";
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

  // ---- named investment menu ----
  // Master-trust plans whose per-fund schedule isn't public still NAME their
  // options in the notes as "Fund Name — description" paragraphs under an
  // "Investment Options/Funds" heading (Northrop: "U.S. Equity Fund — The
  // U.S. Equity Fund primarily consists of..."). Names only, no values.
  const menuHead = t.match(/investment (?:options|funds|programs|line ?up)\b/i);
  if (menuHead) {
    const win = t.slice(menuHead.index, menuHead.index + 9000);
    const menu = [];
    const nameRe = /([A-Z][\w .,&/()'’-]{1,60}?(?:Funds?|Portfolios?|Accounts?|Pools?)) ?[—–] ?(?=["“A-Z(])/g;
    let nm;
    while ((nm = nameRe.exec(win)) && menu.length < 40) {
      // drop any earlier sentence the lazy match dragged in ("...common
      // stock. Balanced Fund" → "Balanced Fund"); lowercase-before-period
      // marks a sentence end, unlike abbreviations ("U.S. Equity Fund")
      const n = nm[1].split(/(?<=[a-z]{2})[.;:] /).pop()
        .replace(/^(?:The|A|An|Each|These|Certain) /, "").trim();
      // generic asset-class rows aren't menu entries
      if (/^(?:mutual|collective|common|pooled|master|trust|investment|the|other|various)\b/i.test(n)) continue;
      if (n.length >= 6 && !menu.includes(n)) menu.push(n);
    }
    if (menu.length >= 3) out.menu = menu;
  }

  // ---- automatic enrollment ----
  const ae = t.match(/automatic(?:ally)? enroll(?:ed|ment|s)?[^.]{0,100}?(\d{1,2}(?:\.\d+)?) ?(?:percent|%)/i);
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
