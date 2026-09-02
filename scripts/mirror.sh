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
  [ "${1:-}" = "--force" ] || exit 1
  echo "  --force given: proceeding anyway."
fi

BEFORE=$(git rev-parse --short origin/main)
git push --force-with-lease=main origin "$BRANCH:main" || { echo "push failed"; exit 1; }
git fetch -q origin main
echo "mirrored: $BEFORE -> $(git rev-parse --short origin/main)"
