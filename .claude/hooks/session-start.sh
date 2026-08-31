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
