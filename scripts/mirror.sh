#!/bin/bash
# wampo — mirror the dev branch to main, refusing when main carries work the
# branch does not have.
#
# WHY THIS EXISTS. The mirror is a FORCE push: anything on main that is not in
# the branch is destroyed. Scheduled pipeline runs execute on the default
# branch and commit their data straight to main, so this is a real and now
# DAILY hazard, not a theoretical one.
#
# The documented procedure was to run the check by eye. On 2026-09-02 I did
# exactly that, printed the offending commit, followed it with an echo line
# reading "(nothing above = main has nothing the branch lacks)", read my own
# reassurance instead of the output, and force-pushed over run #194's data
# commit. Nothing was lost that time only because the scheduled run had found
# no new filings overnight. Luck is not a control.
#
# So the check is no longer advisory. This script exits non-zero and refuses
# to push when main is ahead, and it prints what would be destroyed.
#
# Usage: scripts/mirror.sh [--force] [--force-data]
#   --force       proceed even when main is ahead. Use ONLY after rebasing
#                 those commits into the branch or confirming they carry
#                 nothing.
#   --force-data  proceed even when scripts/mirror-gate.mjs refuses the DATA
#                 (partial store, or a confident lineup that main has and the
#                 branch does not). Use ONLY after sampling the losses against
#                 their filings and finding the withdrawal correct.
#
# THE TWO FLAGS ARE DELIBERATELY SEPARATE. They override different judgements:
# one is "I have reconciled the git history", the other is "I have read the
# filings and these menus deserve to disappear". A single flag covering both
# would mean that forcing past a routine scheduled-run commit — the common,
# almost-clerical case — would silently switch off the check that exists to
# stop a 295,951-participant fund menu vanishing from the live site.
set -uo pipefail

FORCE_GIT=""
FORCE_DATA=""
for a in "$@"; do
  case "$a" in
    --force) FORCE_GIT=1 ;;
    --force-data) FORCE_DATA=1 ;;
    *) echo "mirror.sh: unknown option '$a'"; exit 2 ;;
  esac
done

BRANCH="claude/wampo-401k-live-nx1t4o"
cd "$(git rev-parse --show-toplevel)" || exit 1

git fetch -q origin main "$BRANCH" || { echo "fetch failed"; exit 1; }

# The push below uses the LOCAL branch ref, so local and origin disagreeing is
# not cosmetic: mirroring while a commit sits unpushed puts work on main that
# is not on the dev branch, and every later mirror then refuses. This is the
# other half of the 2026-09-02 near-miss — the main-ahead check passed, but a
# commit had not been pushed yet and only a stop-hook caught it.
LOCAL=$(git rev-parse "$BRANCH" 2>/dev/null)
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "REFUSING TO MIRROR — local $BRANCH and origin/$BRANCH disagree:"
  echo "    local  $(git rev-parse --short "$BRANCH")"
  echo "    origin $(git rev-parse --short "origin/$BRANCH")"
  git log --oneline "$BRANCH" --not "origin/$BRANCH" 2>/dev/null | sed 's/^/    unpushed: /'
  git log --oneline "origin/$BRANCH" --not "$BRANCH" 2>/dev/null | sed 's/^/    unpulled: /'
  echo
  echo "  Push the branch first (git push -u origin $BRANCH), then re-run."
  exit 1
fi

AHEAD=$(git log --oneline "origin/main" --not "origin/$BRANCH" 2>/dev/null)
if [ -n "$AHEAD" ]; then
  echo "REFUSING TO MIRROR — main carries commits the branch does not have:"
  echo "$AHEAD" | sed 's/^/    /'
  echo
  echo "  These would be DESTROYED by a force push. Almost always this is a"
  echo "  scheduled pipeline run that committed data straight to main."
  echo
  echo "  Do this instead:"
  echo "    git fetch origin main && git rebase origin/main"
  echo "  then re-run this script. Use --force only after confirming those"
  echo "  commits carry nothing the branch lacks (compare plans-all acks)."
  [ -n "$FORCE_GIT" ] || exit 1
  echo "  --force given: proceeding anyway."
fi

# The two checks above are about GIT. Neither looks at the data, and the data
# is what the site serves. #244 was ready to mirror having lost 31 real fund
# menus (Lowe's, 295,951 participants) while its coverage line rose; #239 was
# ready to mirror as a half-finished store. Both were caught by reading numbers
# by hand, which is the control that failed on 2026-09-02. So the data check is
# a script too, and it runs here, before the push.
node scripts/mirror-gate.mjs ${FORCE_DATA:+--force} || {
  echo
  echo "  Refused by scripts/mirror-gate.mjs (above). Nothing was pushed."
  exit 1
}

# THE THIRD HAZARD, and it is neither git nor data: A SCHEDULED RUN ALREADY IN
# FLIGHT ON MAIN WILL COMMIT AFTER THIS PUSH, USING THE CODE IT CHECKED OUT
# WHEN IT STARTED.
#
# MEASURED 2026-10-02, and it silently reverted a shipped fix in front of the
# owner. Run #556 started 23:02:03 on main at d9041652 — main BEFORE the
# recordkeeper fix was mirrored. The mirror put the fix on main at 23:10:34.
# #556 then finished and committed its data at 23:15:23, regenerating
# plans-all.json and plans-list.json from the OLD build-data.mjs, so PSEG went
# back to "Invesco Advisors, Inc" on the live site while main's SOURCE carried
# the fix. Every check above passed: the git check ran before the clobber, and
# the data gate compared a store that was still correct.
#
# A FORCE PUSH CANNOT PROTECT AGAINST A WRITER THAT HAS NOT WRITTEN YET.
#
# It only matters when the mirror changes code that PRODUCES data, so that is
# exactly when this refuses.
DATA_CODE="scripts/build-data.mjs scripts/merge-4i.mjs scripts/lib-4i.mjs scripts/fetch-4i.mjs"
CHANGED=$(git diff --name-only origin/main "$BRANCH" -- $DATA_CODE 2>/dev/null)
if [ -n "$CHANGED" ]; then
  INFLIGHT=$(gh api "repos/evwes/no-app/actions/workflows/build-data.yml/runs?branch=main&per_page=5" \
    --jq '[.workflow_runs[] | select(.status=="in_progress" or .status=="queued")] | length' 2>/dev/null || echo "?")
  if [ "$INFLIGHT" != "0" ] && [ "$INFLIGHT" != "" ]; then
    echo "REFUSING TO MIRROR — this mirror changes data-producing code AND a run is already in flight on main:"
    echo "$CHANGED" | sed 's/^/    changed: /'
    echo "    in-flight or queued runs on main: $INFLIGHT"
    echo
    echo "  That run checked out main BEFORE this code. It will commit its data"
    echo "  AFTER this push and overwrite the output of the change you are"
    echo "  mirroring. This is not hypothetical: it reverted the recordkeeper"
    echo "  fix on 2026-10-02 and the owner saw the old value."
    echo
    echo "  Do this instead: wait for that run to finish, mirror, THEN dispatch"
    echo "  a run on main so the data is regenerated with the new code."
    [ -n "$FORCE_GIT" ] || exit 1
    echo "  --force given: proceeding anyway."
  fi
fi

BEFORE=$(git rev-parse --short origin/main)
git push --force-with-lease=main origin "$BRANCH:main" || { echo "push failed"; exit 1; }
git fetch -q origin main
echo "mirrored: $BEFORE -> $(git rev-parse --short origin/main)"
# Even with no run in flight, code that produces data has just reached main and
# main's DATA was produced by the previous code. The store is only correct once
# a run regenerates it, so say so rather than leaving the operator to assume
# the mirror finished the job.
#
# AND IT MUST NOT CRY WOLF ON THE NORMAL PATH. Until 2026-10-03 this warned
# after EVERY mirror that touched data-producing code, comparing the CODE on
# the two branches and never asking what produced the store it was shipping.
# The documented procedure is: dispatch on dev, verdict, mirror the matched
# pair — so the usual mirror ships code and the store that code produced, and
# the warning was wrong on exactly the case that happens every time. It fired
# on a mirror that left main with PARSER_VERSION 199 and a pv-199 store at
# 99.93%, advising a run that would have been a no-op.
#
# A check that is wrong on the normal path is worse than no check: an operator
# who has dismissed it four times dismisses the fifth, when it is right. So
# compare the mirrored code's PARSER_VERSION to the mirrored store's dominant
# pv, and warn only when the store really is behind.
# AND `PARSER_VERSION` IS SILENT ABOUT MERGE-SIDE CODE — found 2026-10-10 by a
# mirror whose own prediction was wrong. `merge-4i.mjs` carries six NAME REPAIR
# arms that rewrite the store at merge time and move no version at all, so for
# a change to that file the equality below holds BY CONSTRUCTION and the
# "matched pair" claim is unearned. Measured on the self-wrapping-duplication
# ship: main took the new code beside a store still carrying
# `LENDING (TIER J) NT COLLECTIVE S&P500 …`, and this block said the data was
# not stale. Benign there — the store was one improvement behind, not wrong —
# but a merge-side arm that WITHDREW a false claim would be mirrored with the
# claim still live under a message saying the pair matched.
#
# So the two classes are separated and each is told only what its own witness
# can establish. A parse-side change has `PARSER_VERSION` to compare; a
# merge-side change has nothing stored to compare against, and saying so is the
# honest answer. It still does not cry wolf: the next merge — the dev dispatch
# or the main cron — applies the arms, which is the normal path and not an
# action the operator must take. *A guard's claim must be keyed on a witness
# that can see the class of change it is describing.*
if [ -n "$CHANGED" ]; then
  PV_CODE=$(sed -n 's/^export const PARSER_VERSION = \([0-9]*\);.*/\1/p' scripts/lib-4i.mjs | head -1)
  PV_STORE=$(node scripts/store-pv.mjs 2>/dev/null | cut -d' ' -f1)
  PARSE_SIDE=$(echo "$CHANGED" | grep -v 'merge-4i\.mjs' | grep -v '^[[:space:]]*$' || true)
  MERGE_SIDE=$(echo "$CHANGED" | grep 'merge-4i\.mjs' || true)
  echo
  echo "  NOTE: this mirror changed data-producing code:"
  echo "$CHANGED" | sed 's/^/      /'
  if [ -n "$MERGE_SIDE" ]; then
    echo "  merge-4i.mjs is MERGE-side: its name-repair arms rewrite the store at"
    echo "  merge time and move no version, so PARSER_VERSION cannot tell you"
    echo "  whether the mirrored store already reflects this change. It very"
    echo "  likely does NOT — the store was written by the previous merge."
    echo "  The next merge (dev dispatch, or the main cron) applies it; nothing"
    echo "  to do, but do not read the line below as covering this file."
  fi
  if [ -z "$PARSE_SIDE" ]; then
    :
  elif [ -n "$PV_CODE" ] && [ "$PV_CODE" = "$PV_STORE" ]; then
    echo "  The parse-side code mirrored alongside it produced this store"
    echo "  (PARSER_VERSION $PV_CODE, dominant store pv $PV_STORE), so main holds a"
    echo "  MATCHED pair and its parsed data is NOT stale. No run on main is needed."
  else
    echo "  main's DATA was produced by DIFFERENT code — PARSER_VERSION is"
    echo "  ${PV_CODE:-unknown} and the store's dominant pv is ${PV_STORE:-unknown} — so it is stale."
    echo "  Dispatch a run and verify it, or the site keeps serving the old"
    echo "  values with the new source sitting beside them."
  fi
fi
