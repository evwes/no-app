#!/usr/bin/env node
/* wampo — what is IN the filings that wampo does not report, and why.
 *
 * The confirmed-instance count of a defect we already understand is not the
 * useful measurement. The useful measurement is the INVENTORY: for every class
 * of information a Form 5500 filing actually carries, does wampo surface it,
 * and if not, what is the reason. A gap with a reason is a roadmap; a gap
 * without one is just an absence nobody noticed.
 *
 * This samples filings, detects which information classes are present in each,
 * and prints them against what wampo stores. The "captured" column is written
 * from the actual field lists:
 *
 *   lineup entry:  ack confident coverageRatio fb features funds ocr planYear
 *                  sdba sma smaKind source thousands ticker trustPtr
 *   funds[]:       name type value cit ownType          <- no cost, no units
 *   features:      match vesting eligibility roth afterTax inPlanRoth nec
 *                  autoEnroll autoEscalate loans trueUp safeHarbor sdbaBrand
 *                  frozen noEmployer nonPartDirected menu
 * TWO KINDS OF EVIDENCE, and conflating them produces nonsense. Every filing
 * embeds the blank Form 5500 pages, so the QUESTION "were there any nonexempt
 * prohibited transactions?" appears in 100% of filings whether or not the
 * answer is yes. The first version of this script matched those question
 * strings and reported prohibited transactions, fidelity bonds and blackouts
 * in 100% of filings, which is meaningless. Detectors here must match an
 * AFFIRMATIVE disclosure in the audited notes. For the yes/no compliance
 * answers the right source is not the PDF at all: they are structured
 * indicator columns in the EFAST2 dataset the pipeline already downloads, and
 * build-data.mjs reads only the money columns from Schedule H (verified by
 * inspection). Those are marked "dataset" below -- an ingest gap, not a
 * parsing problem.
 *
 *   plan detail:   ack codes planYear pyb pye filedDate city zip planName
 *                  activeParticipants partBalances assetsBOY assetsEOY
 *                  contribEmployer contribParticipant rollovers benefitsPaid
 *                  adminExpenses feeAdmin feeInvMgmt feeOther feeSal mtiaAck
 *
 * Usage: node scripts/gap-inventory.mjs [--n 15] [--worklist docs/filing-worklist.json]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("--n", 15);
const WORKLIST = arg("--worklist", path.join(root, "docs/filing-worklist.json"));
const TMP = "/tmp/wampo-gap";
fs.mkdirSync(TMP, { recursive: true });

/* Each entry: [id, label, detector, captured, why]
 *   captured: "yes" | "partial" | "no"
 *   why: for anything not fully captured, the reason it is not — the point of
 *        the exercise. "Not extracted" is not a reason; the reason names what
 *        would have to change. */
const CLASSES = [
  ["late-deposits", "Delinquent participant contributions (Sch H 4a)",
    /delinquent (?:participant )?contribution|late (?:remittance|deposit)s? of (?:participant )?contribution|contributions were not (?:remitted|deposited) (?:timely|within)/i,
    "dataset", "Schedule H line 4a is a yes/no plus amount indicator column in the EFAST2 dataset the pipeline already downloads; build-data.mjs reads only the money columns from that file. An ingest gap, not a parsing problem -- and a fiduciary red flag, because the employer held participant deferrals past the deadline."],

  ["limited-scope", "ERISA 103(a)(3)(C) limited-scope audit election",
    /(?:we were not (?:required|engaged) to audit|did not audit)[^.]{0,120}(?:103\(a\)\(3\)\(C\)|certif)|permitted by ERISA Section 103\(a\)\(3\)\(C\)/i,
    "no", "When elected, the auditor does NOT audit the investment information -- the custodian certifies it and the opinion is scoped out. It changes what the audited numbers mean, and wampo presents every audited figure identically. Also carried as an accountant-opinion column in the dataset."],

  ["prohibited-txn", "Nonexempt prohibited transactions (Sch H 4d)",
    /prohibited transaction[^\n]{0,80}(?:occurred|in the amount of|\$[\d,]+)|Schedule G[^\n]{0,40}Part III[^\n]{0,200}\$[\d,]+/i,
    "dataset", "Schedule G Part III, carried as an indicator column in the dataset. Rare but material when present. Not ingested."],

  ["corrective", "Corrective distributions / ADP-ACP refunds / excess deferrals",
    /corrective distribution|excess (?:contribution|deferral|aggregate)|refund(?:ed)? to (?:highly compensated|participants)|failed the (?:ADP|ACP)/i,
    "no", "Indicates the plan failed nondiscrimination testing and refunded money to highly-compensated participants. Directly relevant to whether a plan is well run. Not extracted."],

  ["forfeitures", "Forfeiture balance and how forfeitures are used",
    /forfeit/i,
    "no", "Notes routinely state the unused forfeiture balance and whether forfeitures reduce employer contributions or pay plan expenses. That is real money and a live litigation topic. No extractor exists."],

  ["revenue-share", "Revenue sharing / ERISA budget / expense reimbursement account",
    /revenue shar|erisa (?:budget|expense) account|expense reimbursement account|12b-1/i,
    "no", "Determines who actually bears recordkeeping cost. wampo shows Schedule C provider fees but not the revenue-sharing offsets against them, so the net cost picture is incomplete."],

  ["fair-value-levels", "Fair value hierarchy (Level 1/2/3)",
    /level 1|level 2|level 3|fair value hierarchy/i,
    "no", "Level 3 holdings are illiquid and hard to value. Present in nearly every audited filing; never surfaced."],

  ["units-shares", "Shares / units held per holding (4i column c)",
    /shares?\/units|number of (?:shares|units)|units held/i,
    "partial", "The parser reads column (c) values to pick the right money column but stores only `value` on funds[]. Units would let a reader reconcile to a NAV and detect a mis-scaled row."],

  ["cost-column", "Cost column (4i column d)",
    /\bcost\b\s*\*{0,2}\s*$|\(d\)\s*cost|cost \*\*/im,
    "partial", "Often marked 'not presented — participant directed', but when present it gives unrealized gain. funds[] has no cost field."],

  ["sched-d-trusts", "Schedule D Part I — collective trust names, sponsors, EINs",
    /Name of MTIA, CCT, PSA|103-12 IE|Dollar value of interest in MTIA/i,
    "partial", "Used today only to link MASTER TRUSTS. The same page names every CCT/PSA the plan holds, with sponsor and EIN — the one public source that identifies collective trusts by name. Not used as a lineup source."],

  ["mt-allocation", "Plan's percentage interest in a master trust",
    /(?:plan's )?(?:interest|share) in (?:the )?master trust[^\n]{0,60}(?:\d+(?:\.\d+)?\s*%|percent)|approximately \d+(?:\.\d+)?% of the master trust/i,
    "no", "A plan holding 3% of a master trust is shown the trust's whole lineup with no indication of its share. Not extracted."],

  ["auditor", "Auditor name and opinion type",
    /report of independent registered public accounting firm|opinion[^\n]{0,40}financial statements|LLP\b/i,
    "no", "Who audited it and whether the opinion was clean. A going-concern or modified opinion is a signal; wampo shows none."],

  ["loan-terms", "Participant loan interest-rate range and count",
    /interest rates? rang|bearing interest at rates? (?:of|from)|loans? (?:outstanding|receivable)[^\n]{0,40}\d+(?:\.\d+)?%/i,
    "partial", "features.loans records THAT loans exist. The filed rate range and outstanding balance are not captured."],

  ["fidelity-bond", "Fidelity bond coverage",
    /(?:fidelity|ERISA) bond[^\n]{0,60}\$\s?[\d,]{4,}|bond(?:ed)? in the amount of \$\s?[\d,]{4,}/i,
    "dataset", "Form 5500 line 4e is an amount column in the dataset. A plan bonded below the statutory 10% minimum is a compliance issue worth flagging. Not ingested."],

  ["plan-termination", "Plan termination, partial termination, or freeze",
    /plan (?:was |has been )?(?:terminat|frozen|froze)|partial termination|discontinu(?:e|ance) of contributions/i,
    "partial", "features.frozen catches some freeze language. Termination and partial termination are not distinguished."],

  ["blackout", "Blackout period / recordkeeper conversion",
    /blackout period (?:began|commenced|occurred|from|during)|blackout notice was (?:provided|sent)|during the blackout/i,
    "no", "A recordkeeper conversion explains discontinuities in the numbers. Without it a reader sees an unexplained jump between years and has no way to know why."],

  ["investment-adviser", "Named investment manager / 3(38) fiduciary",
    /investment (?:manager|adviser|advisor) (?:is|are|named|appointed)|3\(38\)|3\(21\)|discretionary investment manage/i,
    "no", "Who chooses the menu. Distinct from the recordkeeper, which wampo does show."],

  ["party-in-interest", "Party-in-interest holdings (the leading *)",
    /party[- ]in[- ]interest/i,
    "partial", "The parser strips the leading '*' so it does not corrupt names, and discards the flag. It marks holdings with the recordkeeper's own funds — the classic conflict-of-interest signal."],
];

const work = JSON.parse(fs.readFileSync(WORKLIST, "utf8"));
const pdfUrl = (ack) => `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;

// spread the sample across the queue rather than taking the head, so the
// inventory is not just a portrait of the most broken filings
const step = Math.max(1, Math.floor(work.length / N));
const sample = [];
for (let i = 0; sample.length < N && i < work.length; i += step) sample.push(work[i]);

const present = Object.fromEntries(CLASSES.map((c) => [c[0], 0]));
let ok = 0;
for (const w of sample) {
  const pdf = path.join(TMP, w.ack + ".pdf"), txt = path.join(TMP, w.ack + ".txt");
  let text = "";
  try {
    execFileSync("curl", ["-sS", "--max-time", "120", "-o", pdf, pdfUrl(w.ack)], { stdio: "ignore" });
    execFileSync("pdftotext", ["-layout", pdf, txt], { stdio: "ignore" });
    text = fs.readFileSync(txt, "utf8");
  } catch { /* unreadable */ }
  try { fs.unlinkSync(pdf); fs.unlinkSync(txt); } catch { /* best effort */ }
  if (text.length < 4000) continue;
  ok++;
  for (const [id, , re] of CLASSES) if (re.test(text)) present[id]++;
}

console.log(`gap inventory over ${ok} readable filings (sampled across the queue)\n`);
const rows = CLASSES.map((c) => ({ id: c[0], label: c[1], captured: c[3], why: c[4], n: present[c[0]] }))
  .sort((a, b) => b.n - a.n);
console.log("| present in | wampo | information class |");
console.log("|---|---|---|");
for (const r of rows) {
  console.log(`| ${String(r.n).padStart(2)}/${ok} (${String(Math.round(100 * r.n / ok)).padStart(3)}%) | ${r.captured.padEnd(7)} | ${r.label} |`);
}
console.log("\nWHY EACH GAP EXISTS\n");
for (const r of rows) {
  if (r.captured === "yes") continue;
  console.log(`${r.label}  [${r.captured}, in ${Math.round(100 * r.n / ok)}% of filings]`);
  console.log(`   ${r.why}\n`);
}
