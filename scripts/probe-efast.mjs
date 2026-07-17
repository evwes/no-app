#!/usr/bin/env node
/* EFAST2 probe #3 — main.js config gave us:
 *   serviceAwsHostname = https://www.efast.dol.gov/services/   (CloudSearch)
 *   serviceAwsParser   = ?q.parser=lucene
 *   servicePdfPath     = https://efast2-filings-public.s3.amazonaws.com/prd
 * Now mine how the app composes (a) search request paths and (b) the PDF key,
 * then try live search queries.
 */
import { readFileSync } from "node:fs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) wampo-research/1.0";

async function get(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const type = res.headers.get("content-type") || "";
    let body = "";
    if (!/pdf|octet|zip|image/.test(type)) body = await res.text();
    else body = `<binary ${res.headers.get("content-length")} bytes>`;
    return { status: res.status, type, body };
  } catch (e) {
    return { status: 0, type: "", body: String(e.message || e) };
  }
}

const filed = JSON.parse(readFileSync("plans-filed.json", "utf8"));
const pfe = filed.plans.find((p) => p.ticker === "PFE") || filed.plans[0];
const ack = pfe.ack;
console.log("sample ack:", ack);

const js = (await get("https://www.efast.dol.gov/5500Search/main.js")).body;
console.log("main.js len:", js.length);

function contexts(needle, span = 900, max = 4) {
  let i = 0, n = 0;
  while ((i = js.indexOf(needle, i)) !== -1 && n < max) {
    console.log(`\n--- "${needle}" @${i} ---`);
    console.log(js.slice(Math.max(0, i - span), i + span));
    i += needle.length; n++;
  }
  if (n === 0) console.log(`\n--- "${needle}" not found ---`);
}

contexts("servicePdfPath", 700);
contexts("getServicePdfPath", 700);
contexts("q.parser", 500, 2);
contexts("getServiceBaseUrl()+", 500, 4);
contexts("search?", 400, 3);

// live query attempts against the CloudSearch proxy
const base = "https://www.efast.dol.gov/services/";
const tries = [
  `${base}afs?q.parser=lucene&q=${encodeURIComponent(`ack_id:'${ack}'`)}`,
  `${base}afs/search?q.parser=lucene&q=${encodeURIComponent(`ack_id:'${ack}'`)}`,
  `${base}search?q.parser=lucene&q=${encodeURIComponent(`ack_id:'${ack}'`)}`,
  `${base}afs?q.parser=lucene&q=${encodeURIComponent("sponsor_dfe_name:'PFIZER INC.'")}&size=2`,
  `${base}afs?q.parser=lucene&q=pfizer&size=1`,
];
for (const t of tries) {
  const r = await get(t);
  console.log(`\n### GET ${t}\n    status=${r.status} type=${r.type}`);
  console.log("    " + r.body.slice(0, 700).replace(/\n/g, "\n    "));
}

console.log("\nprobe3 complete");
