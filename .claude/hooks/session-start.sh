#!/bin/bash
# wampo — make a fresh container productive without rediscovery.
#
# Claude Code on the web runs in an ephemeral container that is reclaimed after
# a period of inactivity. The repository survives; /tmp and anything apt or npm
# installed does not. Without this hook every session began the same way: a
# filing download reported "UNREACHABLE" because poppler was gone, the smoke
# test died on a missing playwright, and the review corpus had to be rebuilt by
# hand. That is rediscovery work paid for out of the project's time.
#
# What this installs, and why each one is needed:
#   poppler-utils  pdftotext / pdftoppm — the parser reads every filing through
#                  these, and the OCR fallback rasterises with pdftoppm
#   tesseract-ocr  the OCR fallback for scanned attachments
#   unzip          scripts/build-map-points.mjs unpacks the Census gazetteer
#   playwright     scripts/smoke-test.mjs and scripts/map-test.mjs boot the site
#
# Chromium is preinstalled in this image, so the browser download is skipped and
# CHROMIUM_PATH is exported for the tests that take it.
set -uo pipefail

# local machines have their own toolchains; only the web container needs this
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

need_apt=""
for bin in pdftotext pdftoppm tesseract unzip; do
  command -v "$bin" >/dev/null 2>&1 || need_apt="yes"
done

if [ -n "$need_apt" ]; then
  echo "installing PDF and OCR tools…"
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -qq poppler-utils tesseract-ocr unzip >/dev/null 2>&1 || true
fi

# playwright is only needed for the two site tests; --no-save keeps it out of a
# package.json the project deliberately does not carry
if [ ! -d node_modules/playwright ]; then
  echo "installing playwright…"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-save --silent playwright >/dev/null 2>&1 || true
fi

# the image ships chromium; point the tests at it rather than downloading one
CHROME="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)"
if [ -n "$CHROME" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export CHROMIUM_PATH=$CHROME" >> "$CLAUDE_ENV_FILE"
fi

# report what is actually present, so a missing tool is visible at session start
# rather than surfacing later as a misleading "filing unreachable"
missing=""
for bin in pdftotext pdftoppm tesseract unzip; do
  command -v "$bin" >/dev/null 2>&1 || missing="$missing $bin"
done
[ -d node_modules/playwright ] || missing="$missing playwright"

if [ -n "$missing" ]; then
  echo "session-start: STILL MISSING:$missing — filing parsing or site tests will fail"
else
  echo "session-start: pdftotext, pdftoppm, tesseract, unzip, playwright ready${CHROME:+; chromium at $CHROME}"
fi

# the filing corpus lives outside the repo and does not survive a recycle.
# Rebuilding it is minutes of downloads, so it is NOT done automatically —
# just say how, so the next session does not rediscover the command.
if [ ! -d /tmp/wampo-corpus ]; then
  echo "session-start: no local filing corpus — rebuild with: node scripts/build-review-corpus.mjs 200"
fi

# ---------------------------------------------------------------------------
# OPERATING STATE. Everything above makes the container work; this makes the
# session know where the project stands without spending turns finding out.
#
# Why it is here and not in a document: hook output is the only channel that
# reaches a session before it acts, and container restarts are the recurring
# fact of this project. The hourly agent cron is held in memory and has now
# died four times; on 2026-09-02 a force-mirror nearly destroyed a scheduled
# run's data commit. Both are checks that must happen FIRST or not at all, so
# a session cannot be trusted to remember them — print them instead.
BR="claude/wampo-401k-live-nx1t4o"
echo "---- wampo operating state ----"

git fetch -q origin main "$BR" 2>/dev/null || echo "  (fetch failed — refs below may be stale)"

if [ -n "$(git log --oneline "origin/main" --not "origin/$BR" 2>/dev/null)" ]; then
  echo "  MAIN IS AHEAD of $BR — a scheduled run committed data to main."
  git log --oneline "origin/main" --not "origin/$BR" 2>/dev/null | sed 's/^/    /'
  echo "  Rebase it in BEFORE any mirror. Always mirror via scripts/mirror.sh."
else
  echo "  main: nothing the dev branch lacks"
fi

UNPUSHED=$(git log --oneline "$BR" --not "origin/$BR" 2>/dev/null | wc -l | tr -d ' ')
[ "$UNPUSHED" != "0" ] && echo "  $UNPUSHED UNPUSHED commit(s) on $BR — push before mirroring"
[ -n "$(git status --porcelain 2>/dev/null)" ] && echo "  working tree is DIRTY"

echo "  RUN 'CronList' NOW. If it says \"No scheduled jobs\", the hourly agent"
echo "  cycle died with the last container — re-create it from"
echo "  docs/hourly-cycle-prompt.md (cron '7 * * * *', recurring). It has died"
echo "  four times; this is expected, not a surprise."
echo "  Before pushing scripts/** or the workflow: confirm no pipeline run is"
echo "  in flight, or concurrency cancels it and hours of wall clock are lost."
echo "-------------------------------"
