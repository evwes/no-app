/* wampo — static plan pages for search engines (the growth engine).
 * Generates real, crawlable URLs for the largest plans: everything a
 * "[employer] 401k match/fees/funds" searcher wants, inline in the HTML,
 * no JS required. Runs in the merge job after the data lands; output is
 * committed with the data (p/, sitemap.xml, robots.txt).
 *
 * Honesty rules carry over verbatim: only filed facts render; extracted
 * formulas appear WITH their verbatim filing quotes; absent fields say
 * "not stated in the public filings" — never a guess. Filenames are
 * EIN-PN (stable forever, no orphans when a sponsor renames). */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://evwes.github.io/no-app"; // becomes the custom domain when DNS lands
const TOP_N = 5000;

const d = JSON.parse(readFileSync("plans-all.json", "utf8"));
const F = Object.fromEntries(d.fields.map((f, i) => [f, i]));
const g = (r, f) => r[F[f]];
const index = JSON.parse(readFileSync("lineups-index.json", "utf8")).plans;
const trusts = Object.fromEntries(JSON.parse(readFileSync("mtias.json", "utf8")).trusts.map((t) => [t.ack, t]));
let pctl = null;
try { pctl = JSON.parse(readFileSync("fee-percentiles.json", "utf8")); } catch { /* comparison omitted */ }

const shardOf = (k) => { let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 64; };
const shardCache = {};
const shardGet = (dir, ack) => {
  const sid = String(shardOf(ack)).padStart(2, "0");
  const key = dir + sid;
  if (!(key in shardCache)) {
    try { shardCache[key] = JSON.parse(readFileSync(`data/${dir}/${sid}.json`, "utf8")); }
    catch { shardCache[key] = {}; }
  }
  return shardCache[key][ack];
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const titleCase = (s) => String(s || "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const titlePlanName = (s) => titleCase(s).replace(/401\(K\)/gi, "401(k)").replace(/403\(B\)/gi, "403(b)")
  .replace(/\b(Llc|Llp|Esop|Ira|Us|Usa)\b/g, (m) => m.toUpperCase());
const usd = (v) => "$" + Math.round(v).toLocaleString("en-US");
const usdB = (v) => v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + " billion" : v >= 1e6 ? "$" + (v / 1e6).toFixed(0) + " million" : usd(v);

const SERVICE_CODES = { 10: "Accounting / audit", 11: "Actuarial", 12: "Claims processing", 13: "Contract administrator",
  14: "Plan administrator", 15: "Recordkeeping", 16: "Consulting (general)", 17: "Consulting (pension)",
  18: "Custodial (non-securities)", 19: "Custodial (securities)", 20: "Trustee (individual)", 21: "Trustee (bank/trust co.)",
  22: "Insurance agent / broker", 23: "Insurance services", 24: "Trustee (discretionary)", 25: "Trustee (directed)",
  26: "Investment advisory (participants)", 27: "Investment advisory (plan)", 28: "Investment management", 29: "Legal",
  30: "Employee (plan)", 31: "Named fiduciary", 32: "Real estate brokerage", 33: "Securities brokerage",
  34: "Valuation / appraisal", 35: "Employee (sponsor)", 36: "Copying / duplicating", 37: "Participant loan processing",
  38: "Participant communication", 40: "Foreign entity", 49: "Other services", 50: "Direct payment from plan",
  51: "Inv. mgmt fees (paid directly)", 52: "Inv. mgmt fees (paid indirectly)", 53: "Insurance brokerage commissions",
  54: "Sales loads", 55: "Other commissions", 56: "Non-monetary compensation", 57: "Redemption fees",
  58: "Product termination fees", 59: "Shareholder servicing fees", 60: "Sub-transfer agency fees",
  61: "Finders' / placement fees", 62: "Float revenue", 63: "12b-1 distribution fees", 64: "Recordkeeping fees",
  65: "Account maintenance fees", 66: "Insurance M&E charge", 67: "Other insurance wrap fees", 68: "Soft-dollar commissions",
  70: "Consulting fees", 71: "Securities brokerage fees", 72: "Other investment fees", 73: "Other insurance fees", 99: "Other fees" };
const decodeServices = (codeStr) => {
  const seen = [];
  for (const c of String(codeStr || "").match(/\d{2}/g) || []) {
    const label = SERVICE_CODES[+c];
    if (label && !seen.includes(label)) seen.push(label);
  }
  return seen;
};

const peerNote = (participants, adminRaw) => {
  if (!pctl || !(participants > 0)) return "";
  const c = pctl.cohorts.find((x) => participants >= x.min && (x.max == null || participants < x.max));
  if (!c || !c.n) return "";
  if (!(adminRaw > 0)) {
    return `No administrative expenses were charged to plan assets in this filing — costs were either paid by
      the employer or netted inside fund expense ratios. ${(100 * c.zeroShare).toFixed(0)}% of plans with
      ${c.label} also report $0.`;
  }
  const perHead = adminRaw / participants;
  let r;
  if (perHead <= c.p[0]) r = c.qs[0];
  else if (perHead >= c.p[c.p.length - 1]) r = c.qs[c.qs.length - 1];
  else { let i = 0; while (perHead > c.p[i + 1]) i++; const span = c.p[i + 1] - c.p[i]; r = c.qs[i] + (span > 0 ? (perHead - c.p[i]) / span : 0) * (c.qs[i + 1] - c.qs[i]); }
  const cheaper = r <= 0.5;
  const pct = Math.round(100 * (cheaper ? 1 - r : r));
  return `${usd(perHead)} per participant — ${cheaper ? "lower" : "higher"} than ≈${pct}% of comparable plans
    (${c.label}; median ≈ ${usd(c.p[3])}/participant). Same Schedule H line compared across all filings;
    fund expense ratios are separate.`;
};

const CSS = `body{font-family:Georgia,serif;max-width:720px;margin:0 auto;padding:24px 18px 60px;color:#222;line-height:1.6}
h1{font-size:26px;line-height:1.25;margin:8px 0}h2{font-size:18px;margin:26px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:4px 8px 4px 0;vertical-align:top;border-bottom:1px solid #eee}
.num{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#666;font-size:13px}blockquote{margin:6px 0;padding:6px 12px;border-left:3px solid #ccc;color:#444;font-size:14px;font-style:italic}
a{color:#1a4d8f}.facts td:first-child{color:#666;width:45%}`;

const nStat = (label) => `<span class="muted">not stated in the public filings</span>`;

mkdirSync("p", { recursive: true });
const urls = [];
let written = 0;
for (const r of d.plans.slice(0, TOP_N)) {
  const ein = String(g(r, "ein")), pn = String(g(r, "pn"));
  const company = titleCase(g(r, "sponsorName"));
  const planName = titlePlanName(g(r, "planName"));
  const ack = g(r, "ack"), mtia = g(r, "mtiaAck");
  const bits = index[ack] || 0;
  let entry = shardGet("lineups", ack);
  let lineupVia = "";
  if ((!entry || !entry.confident || !entry.funds || !entry.funds.length) && mtia && (index[mtia] || 0) & 1) {
    const t = shardGet("lineups", mtia);
    if (t && t.funds && t.funds.length) { entry = { ...t, features: entry && entry.features }; lineupVia = trusts[mtia] ? titleCase(trusts[mtia].name) : "its master trust"; }
  }
  const ff = (entry && entry.features) || {};
  const fee = g(r, "sf") ? null : shardGet("fees", ack);
  const participants = g(r, "participants") || 0, assets = g(r, "assetsEOY") || 0;
  const adminRaw = g(r, "adminExpenses") || 0;
  const planYear = g(r, "planYear");
  const funds = entry && entry.confident && entry.funds ? entry.funds.slice(0, 12) : null;
  const planType = /2L|2M/.test(g(r, "codes") || "") ? "403(b)" : "401(k)";

  const facts = [
    ["Plan year filed", planYear],
    ["Participants", participants.toLocaleString("en-US")],
    ["Plan assets", usdB(assets)],
    ["Recordkeeper", g(r, "recordkeeper") ? esc(g(r, "recordkeeper")) : nStat()],
    ["Employer match", ff.match ? esc(ff.match) : ff.matchText ? "See the filed formula below" : (g(r, "shr") || "").includes("D") ? "Safe-harbor design (Schedule R)" : nStat()],
    ["Vesting", ff.vesting ? esc(ff.vesting) : nStat()],
    ["Roth option", ff.roth ? "Yes (per the filing)" : nStat()],
    ["After-tax contributions", ff.afterTax ? "Yes (per the filing)" : nStat()],
    ["Auto-enrollment", ff.autoEnroll ? esc(String(ff.autoEnroll === true ? "Yes (per the filing)" : ff.autoEnroll)) : /2S/.test(g(r, "codes") || "") ? "Yes (Form 5500 code 2S)" : nStat()],
  ];

  const fundRows = funds ? funds.map((f) => `<tr><td>${esc(titleCase(f.name))}</td><td class="num">${usd(f.value || 0)}</td></tr>`).join("") : "";
  const provRows = fee && fee.p ? fee.p.slice(0, 6).map((p) =>
    `<tr><td>${esc(titleCase(p.n))}</td><td>${esc(decodeServices(p.c).slice(0, 3).join(", ") || "—")}</td><td class="num">${usd(p.d || 0)}</td></tr>`).join("") : "";
  const peers = peerNote(participants, adminRaw);
  /* The app builds plan.id as `ein|pn|ticker` with NO punctuation in the EIN.
   * Writing a dashed EIN here made every "Open the interactive report" link on
   * all 5,062 published pages resolve to nothing — the app matched the id
   * exactly and silently fell back to the homepage. The app now resolves these
   * tolerantly too, so already-indexed pages work, but the generator must emit
   * the real id. */
  const deepLink = `${BASE}/#plan=${encodeURIComponent(ein + "|" + pn + "|" + (g(r, "ticker") || ""))}`;
  const url = `${BASE}/p/${ein}-${pn}.html`;
  const desc = `${company} ${planType}: ${participants.toLocaleString("en-US")} participants, ` +
    `${usdB(assets)} in assets${ff.match ? `, employer match ${ff.match}` : ""}. From the plan's own Form 5500 filing.`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(company)} ${planType} — match, funds &amp; fees | wampo</title>
<meta name="description" content="${esc(desc.slice(0, 300))}">
<link rel="canonical" href="${url}">
<style>${CSS}</style>
</head>
<body>
<p class="muted"><a href="${BASE}/">wampo</a> › plan filings</p>
<h1>${esc(company)} — ${esc(planName)}</h1>
<p class="muted">Everything below comes from the plan's own Form 5500 filing (plan year ${planYear},
DOL EFAST2 public data). Fields the filing doesn't state are shown as not stated — never guessed.
<a href="${deepLink}">Open the interactive report</a>.</p>
${entry && entry.featFb ? `<p class="muted"><strong>Note:</strong> the ${planYear} filing's public copy could not be read
(withdrawn from the EFAST2 document bucket, or filed without readable notes), so the plan-feature details below —
match, vesting, Roth — are quoted from this plan's ${entry.featFb} filing. Participants, assets and fees are from the
${planYear} filing.</p>` : ""}
<h2>Plan facts</h2>
<table class="facts">${facts.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>
${ff.matchText ? `<h2>Match formula, as filed</h2><blockquote>${esc(ff.matchText)}</blockquote>` : ""}
${ff.vestingText ? `<h2>Vesting, as filed</h2><blockquote>${esc(ff.vestingText)}</blockquote>` : ""}
${funds ? `<h2>Fund lineup${lineupVia ? ` (via ${esc(lineupVia)})` : ""} — top holdings</h2>
<table><tr><th>Fund</th><th class="num">Value</th></tr>${fundRows}</table>
${entry.funds.length > 12 ? `<p class="muted">${entry.funds.length - 12} more holdings in the interactive report.</p>` : ""}` : ""}
${adminRaw > 0 || peers ? `<h2>Plan fees</h2>
${adminRaw > 0 ? `<p>Administrative expenses paid from plan assets: <strong>${usd(adminRaw)}</strong>.</p>` : ""}
${peers ? `<p>${peers}</p>` : ""}` : ""}
${provRows ? `<h2>Service providers (Schedule C, as filed)</h2>
<table><tr><th>Provider</th><th>Services</th><th class="num">Paid by plan</th></tr>${provRows}</table>` : ""}
<p class="muted">EIN ${ein.slice(0, 2)}-${ein.slice(2)} · Plan ${pn} · Source: Form 5500 (DOL EFAST2).
Informational only — not financial advice. Verify details against your plan documents.
<a href="${BASE}/about.html">Methodology</a>.</p>
</body>
</html>`;
  writeFileSync(`p/${ein}-${pn}.html`, html);
  urls.push(url);
  written++;
}

writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${BASE}/</loc></url>
<url><loc>${BASE}/about.html</loc></url>
${urls.map((u) => `<url><loc>${u}</loc></url>`).join("\n")}
</urlset>`);
writeFileSync("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
console.log(`wrote ${written} static plan pages + sitemap.xml (${urls.length + 2} URLs) + robots.txt`);
