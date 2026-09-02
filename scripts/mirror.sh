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
# Usage: scripts/mirror.sh [--force]
#   --force  proceed even when main is ahead. Use ONLY after rebasing those
#            commits into the branch or confirming they carry nothing.
set -uo pipefail

BRANCH="claude/wampo-401k-live-nx1t4o"
cd "$(git rev-parse --show-toplevel)" || exit 1

git fetch -q origin main "$BRANCH" || { echo "fetch failed"; exit 1; }

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
  [ "${1:-}" = "--force" ] || exit 1
  echo "  --force given: proceeding anyway."
fi

BEFORE=$(git rev-parse --short origin/main)
git push --force-with-lease=main origin "$BRANCH:main" || { echo "push failed"; exit 1; }
git fetch -q origin main
echo "mirrored: $BEFORE -> $(git rev-parse --short origin/main)"
