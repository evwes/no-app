#!/usr/bin/env node
/* wampo — READ ONE ISSUER PAGE AND HARVEST ITS SIBLINGS.
 *
 * WHY. The 2026-11-04 probe had J.P. Morgan at 404 on both guessed paths while
 * the body still carried an expense ratio -- the signature of a site that is
 * wide open behind a wrong URL. The owner then supplied a real one:
 *
 *   .../adv/products/jpmorgan-smartretirement-2060-fund-a-46641u473
 *
 * and the tail of that slug is a CUSIP (46641U473). So the path is
 * `/products/<slug>-<cusip>` and the OTHER vintages CANNOT be derived by
 * changing the year -- every fund and share class has its own CUSIP. Guessing
 * would produce 404s indistinguishable from a hostile host, which is the exact
 * mistake this script exists to stop making twice. CONFIRMED by run #5: the
 * owner's path answered 200 / 232,923B / er=0.440% while both guesses 404'd on
 * the same host, same UA, same minute.
 *
 * WHAT RUN #5 THEN SHOWED, and why this file is now a second pass: harvesting
 * `/products/` HREFS found exactly ONE link -- the page itself -- so the
 * vintage selector is drawn by JavaScript and the ladder is not in the markup
 * as links. But the first version only fell back to scanning the body for loose
 * identifiers when it found ZERO links, and it had found one. That condition
 * was wrong: what matters is whether any SIBLING was found, not whether any
 * link was. So this pass ALWAYS scans the body for CUSIP-shaped tokens and
 * validates each against the check digit, because a SPA that renders a selector
 * usually ships the selector's data in the page as JSON.
 *
 * It WRITES NOTHING. Its output is evidence for what the fetcher should request.
 * Must run on a runner: in the sandbox every host is ENOTFOUND, and `http=000`
 * reports on the query, not the source.
 *
 * Run: node scripts/issuer-page-probe.mjs [<url> ...]
 */
import { cusipValid, CUSIP_TOKEN, falsePositiveRate } from "./lib-cusip.mjs";

const UA = "wampo-fund-facts/1.0 (+https://github.com/evwes/no-app)";
const urls = process.argv.slice(2);
if (!urls.length) {
  urls.push("https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-smartretirement-2060-fund-a-46641u473");
}

const PRODUCT_LINK = /["'(]([^"'()\s]*\/products\/[a-z0-9-]*-([0-9a-z]{9}))["')]/gi;
console.log(`cusip check digit admits ${(falsePositiveRate() * 100).toFixed(1)}% of random 9-digit runs — the floor under every count below\n`);

for (const url of urls) {
  console.log(`=== ${url}`);
  let r, body = "";
  try {
    r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(30000), redirect: "follow" });
    body = await r.text();
  } catch (e) {
    /* Node's fetch reports a bare "fetch failed" and buries the real reason in
     * `cause`, so testing only `message` mislabels a sandbox DNS block as an
     * unexplained ERROR -- the exact confusion this script exists to prevent. */
    const why = `${e.message} ${e.cause?.code || ""} ${e.cause?.message || ""}`;
    const blocked = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|CERT|timeout|aborted|fetch failed/i.test(why);
    console.log(blocked
      ? `BLOCKED HERE — says NOTHING about the source. Run this on a runner. (${why.trim().slice(0, 70)})`
      : `ERROR ${why.trim().slice(0, 80)}`);
    continue;
  }
  console.log(`http=${r.status} bytes=${body.length}`);
  const er = /(acquired fund fees|net expense ratio|expense ratio)[\s\S]{0,400}?(\d{1,2}\.\d{1,3})\s*%/i.exec(body);
  const ytd = /(ytd|year[- ]to[- ]date)[\s\S]{0,400}?(-?\d{1,3}\.\d{1,2})\s*%/i.exec(body);
  console.log(`carries: expense-ratio=${er ? er[2] + "%" : "-"}  ytd=${ytd ? ytd[2] + "%" : "-"}`);

  /* PASS 1 -- links. Dedupe by CUSIP, because one fund appears under several
   * share-class slugs and the CUSIP is what distinguishes them. */
  const self = (url.match(/([0-9a-z]{9})\/?$/i) || [])[1]?.toUpperCase() || "";
  const byCusip = new Map();
  for (const m of body.matchAll(PRODUCT_LINK)) {
    const c = m[2].toUpperCase();
    if (!byCusip.has(c)) byCusip.set(c, m[1]);
  }
  const siblings = [...byCusip.keys()].filter((c) => c !== self);
  console.log(`product links in the markup: ${byCusip.size} (siblings, excluding this page: ${siblings.length})`);
  for (const c of siblings.slice(0, 40)) console.log(`   LINK ${c}  ${byCusip.get(c).split("/").pop()}`);

  /* PASS 2 -- ALWAYS. A JS-rendered selector normally ships its data in the
   * page, so the identifiers can be present with no href anywhere. Validated
   * against the check digit; the shape alone would measure the shape. */
  const loose = [...new Set([...body.matchAll(CUSIP_TOKEN())].map((m) => m[0].toUpperCase()))];
  const valid = loose.filter(cusipValid).filter((c) => c !== self && !byCusip.has(c));
  console.log(`CUSIP-shaped tokens in the body: ${loose.length}, of which ${valid.length} validate and are NEW`);
  for (const c of valid.slice(0, 60)) {
    /* print a little context, because a validated token is still only a token
     * until something nearby says it names a fund */
    const i = body.toUpperCase().indexOf(c);
    const ctx = body.slice(Math.max(0, i - 90), i + 60).replace(/\s+/g, " ").replace(/["'<>{}]/g, " ").trim();
    console.log(`   BODY ${c}  …${ctx.slice(-120)}`);
  }
  if (!siblings.length && !valid.length) {
    console.log(`\nNO SIBLINGS BY EITHER ROUTE. With ${body.length} real bytes that is not a closed`);
    console.log(`host -- it is a page whose list is fetched after load. The remedy is headless`);
    console.log(`Chromium (pre-installed at /opt/pw-browsers/chromium) or the XHR it calls,`);
    console.log(`NOT another guessed URL. A CUSIP cannot be derived, so it must be sourced.`);
  }
  console.log("");
}
