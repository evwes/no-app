/* wampo — CUSIP validation, shared.
 *
 * WHY A SHARED MODULE. Two callers need it (`cusip-census.mjs` counts the
 * identifiers our own filings carry; `issuer-page-probe.mjs` harvests them off
 * an issuer page) and this record's standing rule is that a transcribed copy of
 * a predicate measures the transcription. One definition, one self-test.
 *
 * WHY A CHECK DIGIT AT ALL. A 9-character alphanumeric run is also the shape of
 * a dollar amount, an EIN, a plan number and a custodian's internal code, and a
 * count keyed on a character shape measures the character shape. The check
 * digit is arithmetic from the CUSIP standard, so it cannot go stale the way a
 * vocabulary does -- but it is WEAK, admitting about one coincidence in ten,
 * which is why `falsePositiveRate()` exists and why every population reported
 * through this module should carry its floor.
 */

/* CUSIP standard: value each character (0-9 = 0-9, A-Z = 10-35, * = 36,
 * @ = 37, # = 38), double every second value from the left, sum the DIGITS of
 * each result, and the check digit is (10 - sum % 10) % 10. */
export function cusipValid(s) {
  if (typeof s !== "string" || !/^[0-9A-Z*@#]{9}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const c = s[i];
    let v;
    if (c >= "0" && c <= "9") v = c.charCodeAt(0) - 48;
    else if (c >= "A" && c <= "Z") v = c.charCodeAt(0) - 55;
    else v = { "*": 36, "@": 37, "#": 38 }[c];
    if (i % 2 === 1) v *= 2;
    sum += Math.floor(v / 10) + (v % 10);
  }
  return ((10 - (sum % 10)) % 10) === Number(s[8]);
}

/* The token shape, as a source for `matchAll`. Deliberately requires the final
 * character to be a DIGIT, which the standard's check digit always is. */
export const CUSIP_TOKEN = () => /\b[0-9A-Z][0-9A-Z*@#]{7}[0-9]\b/g;

/* MEASURED, not asserted: how often does the shape alone pass? Reported beside
 * any population so a reader can discount it. */
export function falsePositiveRate(n = 100000) {
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const s = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    if (cusipValid(s)) hit++;
  }
  return hit / n;
}

/* A BROKEN CHECKER READS AS A CLEAN ZERO, and a census built on one is a single
 * number with nothing behind it. So the self-test runs at import and THROWS.
 * 46641U473 is the owner's own J.P. Morgan URL; 92202V583 is the Vanguard
 * Target Retirement 2025 Trust I from the worklist; the must-fail list is the
 * same strings with the check digit moved, plus runs that look like an EIN. */
export const MUST_PASS = ["46641U473", "00206R102", "922908371", "037833100", "92202V583"];
export const MUST_FAIL = ["46641U474", "00206R103", "123456789", "999999999", "AAAAAAAAA"];
for (const c of MUST_PASS) {
  if (!cusipValid(c)) throw new Error(`lib-cusip: checker broken — ${c} must validate`);
}
for (const c of MUST_FAIL) {
  if (cusipValid(c)) throw new Error(`lib-cusip: checker broken — ${c} must NOT validate`);
}
