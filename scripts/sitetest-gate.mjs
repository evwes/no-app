#!/usr/bin/env node
/* wampo — WOULD THIS MIRROR PUBLISH A COMMIT WHOSE GATES ARE RED?
 *
 * WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL. On 2026-11-14 I mirrored
 * db0c7cc2 to main, verified it two ways, and reported it live. Site-test run
 * #291 on that exact SHA had concluded **failure**, and so had #290 on the
 * commit before it. `mirror.sh` never looked: it checks the DATA through
 * `mirror-gate.mjs` and the DEPLOYMENT through `deploy-check.mjs`, and nothing
 * in it reads the verdict of the suite that tests the PAGE CODE. Three layers,
 * two watched.
 *
 * The failure was benign that time -- one step of thirty-seven, the
 * `sec-tickers.js` CODE fingerprint, reddened because a hashed input
 * (`lib-schema.mjs`) had changed while the generated table had not been
 * regenerated. The table's data was correct and every drift control passed.
 * But "it was benign" is a fact about that run, discovered afterwards by
 * reading the log, and the next one need not be: the suite that was red
 * includes the smoke test, the YTD render, the ledger and the map.
 *
 * This record already says a manual step in a verification path is the step
 * that gets skipped, and it says so about exactly this workflow. So the check
 * belongs in the script, not in the habit.
 *
 * WHAT IT DOES NOT DO. It does not require a run on the head SHA. `site-test`
 * carries a `paths` filter, so a docs-only or data-only commit creates no run
 * at all, and refusing on that would block every honest mirror of a data
 * commit. It reads the newest verdict available for the branch and says which
 * SHA that verdict belongs to -- a verdict inherited from an ancestor is
 * stated as inherited rather than presented as a verdict on the head.
 *
 * Exits 0 to allow, 1 to refuse. `--force` downgrades a refusal to a warning,
 * because a RED gate can be the thing the mirror is fixing.
 *
 * Testing: SITETEST_GATE_JSON replaces the API call with a literal runs array,
 * which is how the refusals get negative controls. Self-test:
 *   node scripts/sitetest-gate.mjs --selftest
 */
import { execSync } from "node:child_process";

const REPO = "evwes/no-app";
const WF = "site-test.yml";

export function verdict(runs, headSha) {
  /* runs: newest first, as the GitHub API returns them */
  const onHead = runs.filter((r) => r.head_sha === headSha);
  const completedOnHead = onHead.filter((r) => r.status === "completed");
  const pendingOnHead = onHead.filter((r) => r.status !== "completed");

  if (completedOnHead.length) {
    const r = completedOnHead[0];
    return { ok: r.conclusion === "success", kind: "head", run: r,
      why: `site-test run #${r.run_number} on this exact commit concluded ${r.conclusion}` };
  }
  if (pendingOnHead.length) {
    const r = pendingOnHead[0];
    return { ok: false, kind: "pending", run: r,
      why: `site-test run #${r.run_number} on this exact commit is still ${r.status} — its verdict is unknown` };
  }
  const completed = runs.filter((r) => r.status === "completed");
  if (!completed.length) {
    return { ok: true, kind: "none", run: null,
      why: "no completed site-test run on this branch at all — nothing to inherit, so nothing is refused" };
  }
  const r = completed[0];
  return { ok: r.conclusion === "success", kind: "inherited", run: r,
    why: `no site-test run on this commit (the paths filter did not fire), so the newest verdict on the branch is INHERITED: run #${r.run_number} on ${String(r.head_sha).slice(0, 8)} concluded ${r.conclusion}` };
}

/* ---- self-test: every refusal must fire, and every allowance must not ----- */
if (process.argv.includes("--selftest")) {
  let fails = 0;
  const t = (label, got, want) => {
    const okk = got.ok === want.ok && got.kind === want.kind;
    console.log(`${okk ? "ok   " : "FAIL "} ${label} — ok=${got.ok} kind=${got.kind}${okk ? "" : `  (wanted ok=${want.ok} kind=${want.kind})`}`);
    if (!okk) fails++;
  };
  const H = "aaaaaaaa";
  const run = (o) => ({ id: 1234, head_sha: H, status: "completed", conclusion: "success", run_number: 1, ...o });
  /* THE CASE THAT MOTIVATED THIS, by its real numbers */
  t("red on the head SHA is REFUSED (db0c7cc2 / #291)",
    verdict([run({ conclusion: "failure", run_number: 291 })], H), { ok: false, kind: "head" });
  t("green on the head SHA is allowed",
    verdict([run({})], H), { ok: true, kind: "head" });
  t("still running on the head SHA is REFUSED — an unknown verdict is not a pass",
    verdict([run({ status: "in_progress", conclusion: null })], H), { ok: false, kind: "pending" });
  t("a COMPLETED run on the head outranks a pending one",
    verdict([run({ status: "in_progress", conclusion: null }), run({})], H), { ok: true, kind: "head" });
  t("cancelled on the head SHA is REFUSED — only success passes",
    verdict([run({ conclusion: "cancelled" })], H), { ok: false, kind: "head" });
  /* the paths filter: a data-only commit creates no run, so the verdict is
   * inherited from an ancestor and must be LABELLED as inherited */
  t("no run on the head, green ancestor -> allowed as INHERITED",
    verdict([run({ head_sha: "bbbbbbbb" })], H), { ok: true, kind: "inherited" });
  t("no run on the head, RED ancestor -> REFUSED as inherited",
    verdict([run({ head_sha: "bbbbbbbb", conclusion: "failure" })], H), { ok: false, kind: "inherited" });
  /* and the empty case must not refuse: a fresh branch has no history, and a
   * gate that cannot be satisfied is not protecting anything */
  t("no completed run anywhere -> allowed, stated as nothing to inherit",
    verdict([], H), { ok: true, kind: "none" });
  t("only a pending run on another SHA -> allowed, nothing to inherit",
    verdict([run({ head_sha: "bbbbbbbb", status: "queued", conclusion: null })], H), { ok: true, kind: "none" });
  console.log(fails ? `\nsitetest-gate: ${fails} FAILED` : "\nsitetest-gate: all cases hold");
  process.exit(fails ? 1 : 0);
}

/* ---- the gate ------------------------------------------------------------- */
const force = process.argv.includes("--force");
const branch = process.argv.find((a) => a.startsWith("--branch="))?.slice(9)
  || execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
const headSha = execSync(`git rev-parse ${branch}`).toString().trim();

let runs;
if (process.env.SITETEST_GATE_JSON) {
  runs = JSON.parse(process.env.SITETEST_GATE_JSON);
} else {
  try {
    const out = execSync(
      `gh api "repos/${REPO}/actions/workflows/${WF}/runs?branch=${branch}&per_page=20" ` +
      `--jq '[.workflow_runs[] | {id, head_sha, status, conclusion, run_number}]'`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    runs = JSON.parse(out);
  } catch (e) {
    /* A GATE THAT CANNOT READ ITS INPUT MUST SAY SO AND NOT PASS SILENTLY.
     * An unreachable API is not a green verdict. It is also not a reason to
     * block a mirror outright, so this warns and allows -- and names the fact
     * that the verdict is unknown, which is the thing that was missing. */
    console.log(`sitetest-gate: COULD NOT READ site-test's verdict (${String(e.message).split("\n")[0]})`);
    console.log(`               Proceeding, but NOTHING here has checked the page gates.`);
    process.exit(0);
  }
}

const v = verdict(runs, headSha);
const tag = { head: "on this commit", pending: "on this commit", inherited: "INHERITED from an ancestor", none: "unavailable" }[v.kind];
if (v.ok) {
  console.log(`sitetest-gate: ok — ${v.why}`);
  process.exit(0);
}
console.log(`REFUSING TO MIRROR — site-test is not green for what you are about to publish.`);
console.log(`  verdict ${tag}: ${v.why}`);
if (v.run && v.run.id) console.log(`  https://github.com/${REPO}/actions/runs/${v.run.id}  (run #${v.run.run_number})`);
else if (v.run) console.log(`  run #${v.run.run_number} (no id in this payload)`);
console.log(``);
if (v.kind === "pending") {
  console.log(`  WAIT FOR IT. An unknown verdict is not a pass, and this is precisely the`);
  console.log(`  state in which db0c7cc2 was mirrored and reported live while its own run`);
  console.log(`  was heading for a failure.`);
} else {
  console.log(`  Read the failing STEP before deciding. One red step is not one failure:`);
  console.log(`  every step after it is unverified rather than passing. If the red step is`);
  console.log(`  the sec-tickers CODE fingerprint, the remedy is to dispatch sec-tickers.yml`);
  console.log(`  and mirror once its own site-test run is green.`);
}
console.log(``);
console.log(`  --force proceeds anyway, which is right only when this mirror is the FIX.`);
if (!force) process.exit(1);
console.log(`  --force given: proceeding anyway.`);
process.exit(0);
