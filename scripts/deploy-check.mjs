#!/usr/bin/env node
/* wampo — DID THE MIRROR ACTUALLY REACH READERS?
 *
 * This is the one layer that had no gate. Every other check watches the DATA
 * (`audit-data`, the loss and swap triage, `mirror-gate`) or the PAGE CODE
 * (`site-test`); none of them watches whether what was mirrored was SERVED.
 *
 * It cost something on the day it was found, 2026-11-06:
 *   #1214  `syncing_files` for 12 minutes -> `Timeout reached, aborting!`
 *          the live site served a ~4.5-hour stale store, unnoticed
 *   #1216  `deployment_queued` 90s -> `Deployment failed, try again later.`
 *          a ship was mirrored, verified on the tree, and SERVED TO NOBODY
 *          for twenty minutes
 * Both cleared on a re-run. Two genuine failures in one day with two different
 * causes, against 8 `cancelled` runs over 30 days that are merely superseded
 * deployments — so A FAILURE RATE OVER THIS WORKFLOW MEASURES CANCELLATIONS
 * unless duration is read beside conclusion, which is why this prints both.
 *
 * `evwes.github.io` is DENIED by this sandbox's egress proxy, so the live page
 * cannot be fetched from here: a `curl` returns HTTP 000 and ZERO BYTES, and a
 * grep of that prints a perfectly plausible 0. The only two things that verify
 * a deployment are reading the mirrored TREE and reading `conclusion` on the
 * Pages run whose `head_sha` IS main's HEAD. This does the second.
 *
 * EXIT CODES, so a caller can branch:
 *   0  the SHA is deployed (conclusion success)
 *   1  the deployment FAILED or was cancelled — re-run it
 *   2  no run for this SHA yet, or still in flight (with --wait, timed out)
 *   3  could not ask (no network, no token, API shape changed)
 *
 * Usage:  node scripts/deploy-check.mjs [--sha <sha>] [--wait] [--timeout <s>]
 * Default SHA is origin/main's HEAD, because that is what Pages serves.
 */
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REPO = val("--repo", "evwes/no-app");
const WAIT = flag("--wait");
const TIMEOUT = +val("--timeout", "900") * 1000;

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 24 }).trim();

let SHA = val("--sha", "");
if (!SHA) {
  try {
    sh("git", ["fetch", "origin", "main", "--quiet"]);
    SHA = sh("git", ["rev-parse", "origin/main"]);
  } catch (e) {
    console.error(`deploy-check: cannot read origin/main — ${String(e.message).split("\n")[0]}`);
    process.exit(3);
  }
}

/* The Pages workflow is a `dynamic` event with no file in .github/workflows, so
 * it cannot be fetched by filename. Ask the repo's runs and filter by NAME —
 * and assert the listing is the shape expected rather than trusting it, because
 * a guessed shape returns a clean empty where a guessed field throws. */
const api = (p) => {
  const out = sh("curl", ["-sS", "-H", "Accept: application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN ? ["-H", `Authorization: Bearer ${process.env.GITHUB_TOKEN}`] : []),
    `https://api.github.com/repos/${REPO}${p}`]);
  const j = JSON.parse(out);
  if (j && j.message && !j.workflow_runs) throw new Error(`API said: ${j.message}`);
  return j;
};

function look() {
  const j = api(`/actions/runs?per_page=40&head_sha=${SHA}`);
  if (!Array.isArray(j.workflow_runs)) throw new Error("API returned no workflow_runs array");
  const pages = j.workflow_runs.filter((r) => /pages build and deployment/i.test(r.name || ""));
  return { total: j.workflow_runs.length, pages };
}

const mins = (r) => ((new Date(r.updated_at) - new Date(r.created_at)) / 60000);
let last = null;
const t0 = Date.now();
for (;;) {
  let got;
  try { got = look(); } catch (e) {
    console.error(`deploy-check: could not ask GitHub — ${e.message}`);
    process.exit(3);
  }
  const runs = got.pages;
  if (!runs.length) {
    /* No Pages run for this SHA. That is NOT automatically a failure: Pages is
     * triggered by the push and can take a minute to appear. But if other
     * workflows DID run on this SHA, the push certainly landed. */
    last = `no 'pages build and deployment' run for ${SHA.slice(0, 8)} yet (${got.total} other run(s) on that SHA)`;
  } else {
    const r = runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const d = mins(r).toFixed(1);
    if (r.status !== "completed") {
      last = `pages run ${r.run_number} on ${SHA.slice(0, 8)}: ${r.status} (attempt ${r.run_attempt}, ${d} min so far)`;
    } else if (r.conclusion === "success") {
      console.log(`deploy-check: DEPLOYED — pages run ${r.run_number} on ${SHA.slice(0, 8)} ` +
        `concluded success in ${d} min (attempt ${r.run_attempt})`);
      process.exit(0);
    } else {
      /* duration beside conclusion, because `cancelled` at ~1 minute is a
       * SUPERSEDED deployment and not a break */
      const superseded = r.conclusion === "cancelled" && mins(r) < 3;
      console.log(`deploy-check: NOT DEPLOYED — pages run ${r.run_number} on ${SHA.slice(0, 8)} ` +
        `concluded ${r.conclusion} after ${d} min (attempt ${r.run_attempt})`);
      console.log(`  ${r.html_url}`);
      if (superseded) {
        console.log(`  ${d} min and 'cancelled' reads as SUPERSEDED — a newer commit's deployment`);
        console.log(`  replaced it. Check the newer SHA rather than re-running this one.`);
      } else {
        console.log(`  Re-run it: the failures seen on 2026-11-06 both cleared on attempt 2.`);
        console.log(`  mcp__github__actions_run_trigger  rerun_failed_jobs  run_id ${r.id}`);
      }
      process.exit(1);
    }
  }
  if (!WAIT || Date.now() - t0 > TIMEOUT) break;
  await new Promise((r) => setTimeout(r, 20000));
}
console.log(`deploy-check: UNSETTLED — ${last}`);
console.log(`  Not a failure yet. Re-run this, or with --wait to block until it settles.`);
process.exit(2);
