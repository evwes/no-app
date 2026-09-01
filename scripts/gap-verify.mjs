#!/usr/bin/env node
/* wampo — verify each gap against the actual filing PDF before handing the
 * list to a human.
 *
 * The status store says whether WE found a schedule. It does not say whether
 * the DOCUMENT contains one. Those are different claims, and only the second
 * is useful to someone about to open the PDF:
 *
 *   - the document has a schedule table and we cannot read it  -> a parser bug,
 *     and the reviewer can point at the page that breaks us
 *   - the document has no schedule table at all                -> nothing to
 *     extract; the gap is in the public copy, not in our code
 *
 * Labelling the second as "no schedule found" sends someone to look at a
 * filing where the data is plainly present. State Farm was exactly that.
 *
 * Usage: node scripts/gap-verify.mjs <acks-file> [outfile]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

const WORK = "/tmp/gap-verify";
if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });

const acks = readFileSync(process.argv[2], "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const out = {};

// a real 4i table always carries the statutory column header; a table of
// contents entry or an auditor's reference to the schedule does not
const HEADER = /identity of issue|description of investment/i;
const TITLE = /schedule of assets|schedule h.{0,40}line\s*4i|sch\.? h.{0,10}4i/i;

for (const ack of acks) {
  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
  const pdf = `${WORK}/${ack}.pdf`;
  let text = "";
  try {
    execFileSync("curl", ["-sfL", "--max-time", "120", "-o", pdf, url], { stdio: "ignore" });
    text = execFileSync("pdftotext", ["-layout", "-q", pdf, "-"], { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
  } catch {
    out[ack] = { verdict: "unreachable", note: "the public copy could not be downloaded or read" };
    try { unlinkSync(pdf); } catch { /* ignore */ }
    continue;
  }
  const headers = (text.match(new RegExp(HEADER, "gi")) || []).length;
  const titles = (text.match(new RegExp(TITLE, "gi")) || []).length;
  const pages = (text.match(/\f/g) || []).length + 1;
  const perPage = Math.round(text.length / Math.max(pages, 1));
  out[ack] = {
    pages, chars: text.length, perPage, headers, titles,
    verdict: headers > 0 ? "TABLE PRESENT — we cannot read it (parser gap)"
      : titles > 0 ? "referenced but ABSENT — the schedule pages are not in the public copy"
      : perPage < 800 ? "little extractable text — likely scanned or image-only"
      : "no schedule table and no reference — form-only filing",
  };
  try { unlinkSync(pdf); } catch { /* ignore */ }
  console.error(`${ack} ${out[ack].verdict}`);
}
writeFileSync(process.argv[3] || `${WORK}/verdicts.json`, JSON.stringify(out, null, 1));
console.error(`\nwrote ${Object.keys(out).length} verdicts`);
