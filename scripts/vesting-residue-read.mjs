#!/usr/bin/env node
/* READ the residue: every selected vesting sentence for named acks, with the
 * shipped scope gate's verdict per sentence and the shipped predicates'
 * verdicts, so a refusal can be judged against the filing rather than guessed.
 *
 * Takes acks on the command line, or `--from <dump.json> --head N` to walk the
 * largest N members of a fork dump. Prints the FULL sentence, never a
 * truncation: *a truncated print can turn a complete answer into a defect*.
 */
import { readFileSync } from "node:fs";
import { read } from "./lib-filingtext.mjs";
import { vestingSelection, scopeGate } from "./lib-vestslice.mjs";
import { wholeAccountVested, employeeScopedAccount, SPONSOR_TWO_CLAIM, extractPlanFeatures } from "./lib-4i.mjs";
import { isFormSentence } from "./lib-formsentence.mjs";

const argv = process.argv.slice(2);
const flag = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };  // >= 0: a flag in position 0 is still a flag — `i > 0` made `--from` at argv[0] read as absent
const FROM = flag("--from", null);
const HEAD = +flag("--head", 10);
const BUCKET = flag("--bucket", null);
const GREP = flag("--grep", null);

let targets = argv.filter((a) => /^\d{14}[A-Z]/.test(a)).map((a) => ({ ack: a, name: "", ppl: 0 }));
if (FROM) {
  let rows = JSON.parse(readFileSync(FROM, "utf8"));
  if (BUCKET) rows = rows.filter((r) => r.head === BUCKET);
  if (GREP) {
    const re = new RegExp(GREP, "i");
    rows = rows.filter((r) => (r.sentences || []).some((s) => re.test(s)));
  }
  rows.sort((a, b) => b.ppl - a.ppl);
  targets = rows.slice(0, HEAD);
  console.log(`# ${rows.length} members match${BUCKET ? ` bucket=${BUCKET}` : ""}${GREP ? ` grep=${GREP}` : ""}`
    + ` / ${rows.reduce((s, r) => s + r.ppl, 0).toLocaleString()} readers; showing ${targets.length}\n`);
}
if (!targets.length) { console.error("no acks given"); process.exit(2); }

for (const t of targets) {
  const raw = read(t.ack);
  if (!raw) { console.log(`\n=== ${t.ack}  ${t.name}  — NO CACHED TEXT`); continue; }
  const sel = vestingSelection(raw);
  let ft = null;
  try { ft = extractPlanFeatures(raw, t.name || ""); } catch (e) { ft = { err: String(e) }; }
  console.log(`\n=== ${t.ppl ? t.ppl.toLocaleString() : "?"} ppl  ${t.name}  ${t.ack}`);
  console.log(`    instrument: vesting=${JSON.stringify(ft && ft.vesting)} text=${JSON.stringify((ft && ft.vestingText || "").slice(0, 90))}`);
  sel.vestSentences.forEach((s, i) => {
    const g = scopeGate(s, sel.t, t.name || "");
    const f = isFormSentence(s);
    console.log(`  [${i}] ${f ? "FORM " : ""}gate=${g.passes ? "PASS" : "fail"}`
      + ` emp=${g.employerMoney ? 1 : 0} univ=${g.universal ? 1 : 0} strict=${g.strictGate ? 1 : 0} wa=${g.wholeAcctOnly ? 1 : 0}`
      + ` | WA=${wholeAccountVested(s) ? 1 : 0} empAcct=${employeeScopedAccount(s) ? 1 : 0} two=${SPONSOR_TWO_CLAIM.test(s) ? 1 : 0}`);
    if (!f) console.log(`      ${JSON.stringify(s)}`);
  });
}
