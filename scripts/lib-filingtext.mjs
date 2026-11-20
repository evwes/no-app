/* wampo — ONE cached, parallel reader for filing TEXT, shared by the harnesses
 * that need a population of filings rather than one.
 *
 * WHY IT EXISTS. `trace-filing.mjs` and `parse-replay.mjs` each carry their own
 * copy of "look in CORPUS_DIR, else curl the S3 PDF and pdftotext it". Both are
 * shipped gates and are left alone. The two instruments added 2026-11-20 — the
 * tax-flag gate and the subsequent-events sizing — need the identical thing
 * over thousands of acks, in parallel, and this record's standing rule is that
 * a construction is SHARED rather than retyped: a harness that re-types a
 * mechanism measures the re-typing.
 *
 * THREE PROPERTIES, each the reason a number came out wrong somewhere on this
 * record:
 *
 *  1. A MISSING TEXT IS NOT A FALSE FLAG. `read()` returns null, never "". A
 *     caller that treats an empty string as a parse yields `roth: false` for
 *     every unreachable filing and reports the whole download failure as a
 *     regression. Callers must count nulls separately and say so.
 *  2. THE CACHE IS WRITE-THROUGH AND KEYED BY ACK, so a second pass over the
 *     same population costs nothing. The pipeline's own politeness delay is
 *     respected by a concurrency cap, not by trusting the caller.
 *  3. IT IS pdftotext -layout, WHICH IS WHAT PRODUCTION RUNS, and it does NOT
 *     do OCR. A filing production reads through OCR yields little or nothing
 *     here; that is a property of this instrument and every caller has to
 *     report it rather than count it as a finding.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileP = promisify(execFile);

export const CORPUS = process.env.CORPUS_DIR || "/tmp/wampo-corpus";
const WORK = process.env.FILINGTEXT_WORK || "/tmp/wampo-filingtext";

export function cachedAcks(dir = CORPUS) {
  if (!existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).filter((f) => f.endsWith(".txt")).map((f) => f.slice(0, -4)));
}

export function pdfUrl(ack) {
  return `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
}

/** Text for one ack from the cache, or null. Never returns "". */
export function read(ack, dir = CORPUS) {
  const f = path.join(dir, `${ack}.txt`);
  if (!existsSync(f)) return null;
  const t = readFileSync(f, "utf8");
  return t && t.trim() ? t : null;
}

async function fetchOne(ack, dir) {
  if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });
  const pdf = path.join(WORK, `${ack}.pdf`);
  try {
    await execFileP("curl", ["-sfL", "--max-time", "180", "-o", pdf, pdfUrl(ack)], { timeout: 200000 });
    const { stdout } = await execFileP("pdftotext", ["-layout", "-q", pdf, "-"],
      { encoding: "utf8", maxBuffer: 300 * 1024 * 1024, timeout: 180000 });
    if (!stdout || !stdout.trim()) return null;
    writeFileSync(path.join(dir, `${ack}.txt`), stdout);
    return stdout;
  } catch {
    return null;
  } finally {
    try { unlinkSync(pdf); } catch { /* ignore */ }
  }
}

/**
 * Ensure texts for `acks` are in the cache. Returns {have, missing, fetched}.
 * `onProgress(done, total)` is called as it goes; nothing is printed here.
 */
export async function ensure(acks, { dir = CORPUS, download = false, concurrency = 6, onProgress = null } = {}) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const want = [...new Set(acks)];
  const missing = want.filter((a) => !existsSync(path.join(dir, `${a}.txt`)));
  const out = { have: want.length - missing.length, missing: missing.length, fetched: 0, failed: [] };
  if (!download || !missing.length) return out;
  let i = 0, done = 0;
  const worker = async () => {
    for (;;) {
      const k = i++;
      if (k >= missing.length) return;
      const t = await fetchOne(missing[k], dir);
      if (t) out.fetched++; else out.failed.push(missing[k]);
      done++;
      if (onProgress && done % 25 === 0) onProgress(done, missing.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  if (onProgress) onProgress(done, missing.length);
  return out;
}

/* A seeded, reproducible uniform draw. Written here so both instruments draw
 * the same way from the same seed: a sample that cannot be re-drawn is not a
 * measurement anyone else can check. mulberry32, same as the other draws on
 * this record. */
export function seededShuffle(arr, seed) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Wilson 95% interval for a binomial rate — reported rather than a bare
 * fraction, because a sampled rate quoted as a point estimate is how a class
 * gets sized 25x wrong on this record. */
export function wilson95(k, n) {
  if (!n) return [0, 1];
  const z = 1.959964, p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}
