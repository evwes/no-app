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
  const pageList = text.split("\f");
  const pages = pageList.length;
  const perPage = Math.round(text.length / Math.max(pages, 1));

  /* The first ladder stopped at "form-only" for anything without the statutory
   * header, and a 57-page filing whose pages 29-56 were a Grant Thornton audit
   * report landed there — its OWN contents page said the DOL schedules "have
   * been omitted because they are not applicable". Three genuinely different
   * documents were sharing one verdict:
   *   - an attachment that states the schedule is omitted (nothing to fix)
   *   - an attachment with prose but no schedule (nothing to fix)
   *   - an attachment holding a TABLE under a heading we do not recognise
   *     (the only fixable shape, and the one worth finding)
   * So look at what the pages contain, not just what the regexes matched. */
  const isFormPage = (p) => /form 5500|schedule [a-z] \(form 5500\)|omb no\.? 1210/i.test(p.slice(0, 400));
  const hasAudit = /report of independent|independent (?:certified public )?(?:accountants?|auditors?)/i.test(text);
  const omitted = /schedules?[^.]{0,200}?omitted[^.]{0,120}?(?:not applicable|no such|none)/is.test(text) ||
    /omitted because they are not applicable/i.test(text);
  /* A page of money rows is NOT the signature of a holdings table — the first
   * version of this check fired on Statements of Changes in Net Assets
   * ("Total contributions … 16,018,341", "Benefits paid to participants …")
   * and on fair-value-hierarchy notes, three false positives out of three
   * inspected. What distinguishes a MENU is that its rows NAME PRODUCTS: a
   * real lineup page is dense with fund tokens, a financial statement carries
   * at most one or two. Require both. */
  const MONEY_ROW = /[A-Za-z]{4,}.{0,90}[\d,]{4,}(?:\.\d{2})?\s*$/;
  const FUNDISH = /\b(?:fund|trust|portfolio|index|target|instl?|admiral|shares|cl(?:ass)? [a-z0-9]|r[1-6]\b|equity|growth fund|value fund|bond fund|retirement 20\d\d)\b/i;
  let tableLikePages = 0;
  for (const p of pageList) {
    if (isFormPage(p)) continue;
    const rows = p.split("\n").map((l) => l.trim()).filter((l) => MONEY_ROW.test(l));
    if (rows.length < 12) continue;
    const fundy = rows.filter((l) => FUNDISH.test(l)).length;
    if (fundy >= 6) tableLikePages++;
  }
  out[ack] = {
    pages, chars: text.length, perPage, headers, titles, hasAudit, omitted, tableLikePages,
    verdict: headers > 0 ? "TABLE PRESENT — we cannot read it (parser gap)"
      : titles > 0 ? "referenced but ABSENT — the schedule pages are not in the public copy"
      : tableLikePages > 0 ? "TABLE-LIKE pages under an unrecognised heading — probable parser gap"
      : omitted ? "schedule EXPLICITLY OMITTED by the filing (stated in the attachment)"
      : hasAudit ? "audit attachment present, but it contains no schedule table"
      : perPage < 800 ? "little extractable text — likely scanned or image-only"
      : "no attachment at all — form pages only",
  };
  try { unlinkSync(pdf); } catch { /* ignore */ }
  console.error(`${ack} ${out[ack].verdict}`);
}
writeFileSync(process.argv[3] || `${WORK}/verdicts.json`, JSON.stringify(out, null, 1));
console.error(`\nwrote ${Object.keys(out).length} verdicts`);
