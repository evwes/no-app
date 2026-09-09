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
import { classifyDocument } from "./lib-4i.mjs";

const WORK = "/tmp/gap-verify";
if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });

const acks = readFileSync(process.argv[2], "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const out = {};

/* The ladder itself now lives in lib-4i as classifyDocument() and is shared
 * with the pipeline, which records its verdict per ack at parse time. Two
 * copies of a classifier drift; this project has paid for that twice. */
const VERDICT = {
  readfail: "TABLE PRESENT — we cannot read it (parser gap)",
  absent: "referenced but ABSENT — the schedule pages are not in the public copy",
  unread: "TABLE-LIKE pages under an unrecognised heading — probable parser gap",
  omitted: "schedule EXPLICITLY OMITTED by the filing (stated in the attachment)",
  notable: "audit attachment present, but it contains no schedule table",
  scanned: "little extractable text — likely scanned or image-only",
  noattach: "no attachment at all — form pages only",
};

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
  const d = classifyDocument(text);
  out[ack] = { ...d, chars: text.length, verdict: VERDICT[d.code] || d.code };
  try { unlinkSync(pdf); } catch { /* ignore */ }
  console.error(`${ack} ${out[ack].verdict}`);
}
writeFileSync(process.argv[3] || `${WORK}/verdicts.json`, JSON.stringify(out, null, 1));
console.error(`\nwrote ${Object.keys(out).length} verdicts`);
