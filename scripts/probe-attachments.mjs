#!/usr/bin/env node
/* Probe #2: how does 5500Search expose the audited-statement ATTACHMENTS?
 * (a) full CloudSearch doc for a form-only filing vs an embedded one
 * (b) mine main.js for attachment URL composition */

const UA = "Mozilla/5.0 (X11; Linux x86_64) wampo-research/1.0";
async function get(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    const type = res.headers.get("content-type") || "";
    const body = /pdf|octet|zip/.test(type) ? `<binary ${res.headers.get("content-length")}b>` : await res.text();
    return { status: res.status, type, body };
  } catch (e) { return { status: 0, type: "", body: String(e.message || e) }; }
}

const ACKS = [
  "20250827060144NAL0016126496001", // form-only PDF (no audit attachment embedded)
  "20251008093049NAL0005343377001", // control: attachment embedded
];

const base = "https://www.efast.dol.gov/services/";
for (const ack of ACKS) {
  const r = await get(`${base}afs?q.parser=lucene&q=${encodeURIComponent(`ack_id:'${ack}'`)}`);
  console.log(`\n##### ${ack} -> ${r.status}`);
  console.log(r.body.slice(0, 3500).replace(/\s+/g, " "));
}

// mine main.js for attachment handling
const js = (await get("https://www.efast.dol.gov/5500Search/main.js")).body;
console.log(`\nmain.js len: ${js.length}`);
for (const needle of ["ttachment", "atch", "accountant", "Opinion", "getPdf", "pdfPath", "sched_db"]) {
  let i = 0, n = 0;
  while ((i = js.indexOf(needle, i)) !== -1 && n < 3) {
    console.log(`\n--- "${needle}" @${i}:`);
    console.log(js.slice(Math.max(0, i - 350), i + 450).replace(/\s+/g, " "));
    i += needle.length; n++;
  }
  if (!n) console.log(`\n--- "${needle}": not found`);
}
