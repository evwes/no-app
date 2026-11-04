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
 * mistake this script exists to stop making twice.
 *
 * So: fetch the page the owner gave, prove it answers, and HARVEST every
 * sibling product link out of it. A target-date page normally carries a vintage
 * selector, which makes one known URL the key to the whole ladder.
 *
 * It WRITES NOTHING. Its output is evidence for what the fetcher should request.
 * Must run on a runner: in the sandbox every host is ENOTFOUND, and `http=000`
 * reports on the query, not the source.
 *
 * Run: node scripts/issuer-page-probe.mjs <url> [<url> ...]
 */
const UA = "wampo-fund-facts/1.0 (+https://github.com/evwes/no-app)";
const urls = process.argv.slice(2);
if (!urls.length) {
  urls.push("https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-smartretirement-2060-fund-a-46641u473");
}

/* a CUSIP is 9 alphanumerics; in these slugs it is the final segment */
const PRODUCT_LINK = /["'(]([^"'()\s]*\/products\/[a-z0-9-]*-([0-9a-z]{9}))["')]/gi;
const CUSIP_ANY = /\b([0-9A-Z]{6}[0-9A-Z]{2}[0-9A-Z])\b/g;

for (const url of urls) {
  console.log(`\n=== ${url}`);
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
      ? `BLOCKED HERE — says NOTHING about the source. Run this on a runner. (${e.message.slice(0, 60)})`
      : `ERROR ${why.trim().slice(0, 80)}`);
    continue;
  }
  console.log(`http=${r.status} bytes=${body.length}`);
  /* the figures we are after, sniffed only to say whether the page carries them */
  const er = /(acquired fund fees|net expense ratio|expense ratio)[\s\S]{0,400}?(\d{1,2}\.\d{1,3})\s*%/i.exec(body);
  const ytd = /(ytd|year[- ]to[- ]date)[\s\S]{0,400}?(-?\d{1,3}\.\d{1,2})\s*%/i.exec(body);
  console.log(`carries: expense-ratio=${er ? er[2] + "%" : "-"}  ytd=${ytd ? ytd[2] + "%" : "-"}`);

  /* HARVEST. The question the owner asked: does one known vintage lead to the
   * rest? Dedupe by CUSIP, because the same fund appears under several slugs
   * (share classes) and the CUSIP is what distinguishes them. */
  const byCusip = new Map();
  for (const m of body.matchAll(PRODUCT_LINK)) {
    const href = m[1], cusip = m[2].toUpperCase();
    if (!byCusip.has(cusip)) byCusip.set(cusip, href);
  }
  console.log(`sibling product links found: ${byCusip.size}`);
  const ladder = [...byCusip.entries()].filter(([, h]) => /smartretirement|target|retirement|20\d\d/i.test(h));
  console.log(`of which look like a target-date ladder: ${ladder.length}`);
  for (const [cusip, href] of ladder.slice(0, 40)) {
    const slug = href.split("/").pop();
    console.log(`   ${cusip}  ${slug}`);
  }
  if (!byCusip.size) {
    /* no links in the HTML usually means the list is fetched by JS afterwards.
     * Say so plainly rather than concluding the ladder is not published. */
    const loose = [...new Set([...body.matchAll(CUSIP_ANY)].map((m) => m[1]))]
      .filter((c) => /\d/.test(c) && /[A-Z]/.test(c));
    console.log(`no product links in the HTML. Loose CUSIP-shaped tokens in the body: ${loose.length}`);
    console.log(loose.slice(0, 20).join(" ") || "   (none)");
    console.log("If this is 200 with real bytes and no links, the list is JS-rendered:");
    console.log("the remedy is the embedded JSON blob or headless Chromium, NOT a different URL.");
  }
}
