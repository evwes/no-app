#!/usr/bin/env node
/* One-shot probe (runs in Actions): find where EFAST2 stores the audited
 * financial statement ATTACHMENTS for filings whose main S3 PDF contains only
 * the form pages. Dumps the filing's full search document + URL probes. */

const ACKS = [
  "20250827060144NAL0016126496001", // Sargent Corp — no-section, form-only PDF
  "20251008093049NAL0005343377001", // TK Elevator — attachment IS embedded (control)
];

async function j(url, opts = {}) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), ...opts });
    const text = await r.text();
    return { status: r.status, body: text.slice(0, 4000) };
  } catch (e) { return { status: "ERR", body: e.message }; }
}

for (const ack of ACKS) {
  console.log(`\n########## ${ack}`);
  // 1. CloudSearch document — should list attachment metadata
  for (const q of [
    `https://www.efast.dol.gov/services/afs/search?q.parser=lucene&q=ack_id:${ack}&size=1`,
    `https://www.efast.dol.gov/services/afs/search?q.parser=lucene&q=${ack}&size=1`,
  ]) {
    const r = await j(q, { headers: { Accept: "application/json" } });
    console.log(`SEARCH ${r.status}: ${r.body.replace(/\s+/g, " ").slice(0, 2500)}`);
    if (String(r.status) === "200" && r.body.includes("hit")) break;
  }
  // 2. filing detail endpoints seen in the 5500Search bundle
  for (const path of [
    `https://www.efast.dol.gov/services/afs/filing/${ack}`,
    `https://www.efast.dol.gov/services/afs/filings/${ack}`,
    `https://www.efast.dol.gov/services/afs/attachments/${ack}`,
  ]) {
    const r = await j(path, { headers: { Accept: "application/json" } });
    console.log(`DETAIL ${path.split("/afs/")[1]} -> ${r.status}: ${r.body.replace(/\s+/g, " ").slice(0, 1200)}`);
  }
}
