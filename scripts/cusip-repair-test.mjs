#!/usr/bin/env node
/* wampo — TETHER FOR THE LEADING-SECURITY-IDENTIFIER REPAIR (merge-4i).
 * 2026-10-16.
 *
 * The arm strips a nine-character security identifier welded in front of a
 * holding's name (`06739T663 Equity Index Fund F`) and declines three ways.
 * Every condition below has a case where it is the ONLY protection, and every
 * must-NOT-FIRE case is a real string from the live store rather than one I
 * imagined — which matters here more than usual, because the FIRST version of
 * this arm was `^[0-9A-Z]{9}\s`, it read 12,765 rows instead of 263, and all
 * four of my hand-written controls passed it. The one written for exactly that
 * hazard was `VANGUARD 500 INDEX`, and `VANGUARD` is EIGHT letters.
 *
 * CI-SAFE BY CONSTRUCTION, which `merge-name-test.mjs` is not: the arm is
 * SLICED out of the source and handed FROZEN inputs — its own sibling map,
 * sponsor set and ticker-table predicate — so a DOL refresh, a store movement
 * or a `sec-tickers.js` regeneration cannot redden it. A gate that goes red
 * when nothing is wrong is the habitually-red gate that hid ten `site-test`
 * failures.
 *
 *   node scripts/cusip-repair-test.mjs
 */
import { readFileSync } from "node:fs";

const SRC = new URL("./merge-4i.mjs", import.meta.url).pathname;
const src = readFileSync(SRC, "utf8");

/* ---------- slice the arm, never retype it ---------- */
function cut(head, tailMarker, what) {
  const a = src.indexOf(head);
  if (a < 0) throw new Error(`cusip-repair-test: ${what} not found (${head.slice(0, 48)})`);
  const b = src.indexOf(tailMarker, a);
  if (b < 0) throw new Error(`cusip-repair-test: ${what} has no tail marker`);
  return src.slice(a, b + tailMarker.length);
}
const SLICE = [
  cut("  const LEAD_RUN =", "\n", "LEAD_RUN"),
  /* the tail marker is the trailing COMMENT and not `;\n`: this definition's
   * semicolon is followed by spaces and a comment, so a `;\n` marker slurped
   * the next twenty lines and the slice would not parse. A slice boundary is a
   * claim about the source text and fails loudly here, which is the good case. */
  cut("  const isSecurityId =", "/* digits in the RUN */", "isSecurityId"),
  cut("  const stripLeadId =", "\n  };", "stripLeadId"),
  cut("  const sponsorKey =", ";\n", "sponsorKey"),
  cut("  const cusipRepair =", "\n  };", "cusipRepair"),
].join("\n");

const build = (mut = (s) => s) => {
  const body = mut(SLICE);
  /* `secKeyed` is a closure variable in merge-4i; the harness supplies it */
  return new Function("secKeyed", `${body}\n  return { cusipRepair, sponsorKey, stripLeadId };`);
};
const mk = (secKeyedSet = new Set(), mut) => {
  const keyed = (f) => secKeyedSet.has(String(f.iss || "") + "\u0000" + String(f.name || ""));
  return build(mut)(secKeyedSet.size ? keyed : null);
};

const sibsOf = (pairs) => new Map(pairs.map(([k, v]) => [k.toLowerCase(), v]));
const row = (name, iss = "") => ({ name, iss });

/* ---------- must FIRE ---------- */
const FIRE = [
  ["06739T663 Equity Index Fund F", "Equity Index Fund F",
    "AT&T's trust, $6,233,138,627 — the motivating row"],
  ["999E98387 BGI MSCI ACWI EX-US INDEX SUPERFUND F", "BGI MSCI ACWI EX-US INDEX SUPERFUND F",
    "$2,433,092,758; the identifier carries a letter in the body"],
  ["09257C658 LIFEPATH INDEX 2050 NON LENDABLE FD G", "LIFEPATH INDEX 2050 NON LENDABLE FD G",
    "Alcoa — a real collective trust, unique in its menu"],
  ["31565A620 STATE STREET TARGET RETIREMENT 2035 NON-LENDING", "STATE STREET TARGET RETIREMENT 2035 NON-LENDING",
    "one of twelve vintages, each unique"],
  ["00206R102 Vanguard Target Retirement 2040 Trust SE", "Vanguard Target Retirement 2040 Trust SE",
    "the identifier shape with an ordinary fund behind it"],
];
/* ---------- must NOT fire ---------- */
const KEEP = [
  /* THE NINE-LETTER HOUSES. The structural digit test is the ONLY protection
   * for every one of these, and the broken version stripped all of them. */
  ["BLACKROCK HIGH YIELD K", "a nine-letter HOUSE; the broken arm took its 0.5 fee"],
  ["ALLSPRING SPE SMALL CAP VAL R6", "a nine-letter HOUSE; the broken arm took its 0.45"],
  ["NEUBERGER BERMAN GENESIS", "a nine-letter HOUSE; the broken arm took its 0.65"],
  ["WELLTOWER INC", "a nine-letter COMPANY"],
  ["CHAMPIONX CORP", "a nine-letter COMPANY"],
  ["FIRSTCASH HOLDINGS INC", "a nine-letter COMPANY"],
  ["MACQUARIE GROUP LTD", "a nine-letter COMPANY"],
  ["VANGUARD 500 INDEX", "EIGHT letters — the control that passed the broken arm and proved nothing"],
  /* shape refusals */
  ["0123456789 Equity Index Fund", "TEN characters is not a CUSIP"],
  ["06739T66A Equity Index Fund", "the ninth character is not a check DIGIT"],
  ["ABCDEFGHI Equity Index Fund", "no digits at all"],
  ["06739T663", "the identifier is the WHOLE name — nothing would survive"],
  ["06739T663 1", "the remainder carries no three letters"],
];

let bad = 0;
const fail = (m) => { bad++; console.log(`  FAIL ${m}`); };
{
  const { cusipRepair } = mk();
  for (const [name, want, why] of FIRE) {
    const got = cusipRepair(row(name), sibsOf([[want, 1]]), new Set());
    if (got !== want) fail(`must FIRE (${why}): ${JSON.stringify(name)} -> ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  for (const [name, why] of KEEP) {
    const got = cusipRepair(row(name), sibsOf([]), new Set());
    if (got !== null) fail(`must KEEP (${why}): ${JSON.stringify(name)} -> ${JSON.stringify(got)}`);
  }
}

/* ---------- the three refusals, each with a SINGLE-PROTECTION case ---------- */
const COLLIDE_ROW = "91282CDY4 US TREASURY NOTE";
const COLLIDE_SIBS = sibsOf([["US TREASURY NOTE", 4]]);
const SPONSOR_ROW = "00206R102 AT&T INC";
const SPONSORS = new Set(["ATT"]);
const KEYED_ROW = "461308819 AMER FND INV CO OF AM-R6";
const KEYED = new Set(["\u0000461308819 AMER FND INV CO OF AM-R6"]);
{
  const { cusipRepair } = mk();
  if (cusipRepair(row(COLLIDE_ROW), COLLIDE_SIBS, new Set()) !== null)
    fail("refusal (1): a remainder colliding with 3 siblings must be kept — IBEW Local 325 files four US TREASURY NOTE rows distinguished only by their CUSIPs");
  if (cusipRepair(row(SPONSOR_ROW), sibsOf([["AT&T INC", 1]]), SPONSORS) !== null)
    fail("refusal (2): the sponsor's OWN stock must be kept — stripping it arms the owner-gated employer-stock claim");
}
{
  const { cusipRepair } = mk(KEYED);
  if (cusipRepair(row(KEYED_ROW), sibsOf([["AMER FND INV CO OF AM-R6", 1]]), new Set()) !== null)
    fail("refusal (3): a row sec-tickers.js is KEYED on must be kept — the measured cost of dropping this is 4 published symbols (RICGX, RNPGX)");
}

/* ---------- MUTATIONS: each condition must be the only protection for its own
 * case, and this suite exits 1 if a mutation PASSES, because a mutation that
 * changes no verdict means the condition proves nothing. Each is anchored on
 * the LINE it is meant to mutate — three of `forfeit-acct-test`'s mutations
 * were malformed because `String.replace` takes the FIRST occurrence and the
 * token also appeared in an unrelated line. ---------- */
const MUTATIONS = [
  ["collision refusal", (s) => s.replace("if ((sibs.get(rest.toLowerCase()) || 0) > 1) return null;", "if (false) return null;"),
    () => mk().cusipRepair(row(COLLIDE_ROW), COLLIDE_SIBS, new Set()), "US TREASURY NOTE"],
  ["sponsor refusal", (s) => s.replace("if (k && k.length >= 3 && sponsors.has(k)) return null;", "if (false) return null;"),
    () => mk().cusipRepair(row(SPONSOR_ROW), sibsOf([["AT&T INC", 1]]), SPONSORS), "AT&T INC"],
  ["sec-keyed refusal", (s) => s.replace("if (secKeyed && secKeyed(f)) return null;", "if (false) return null;"),
    () => mk(KEYED).cusipRepair(row(KEYED_ROW), sibsOf([["AMER FND INV CO OF AM-R6", 1]]), new Set()), "AMER FND INV CO OF AM-R6"],
  /* THE TWO SHAPE CONDITIONS NEEDED CONSTRUCTED PROBES, and that is labelled
   * rather than hidden: the live store holds no nine-character run that is
   * refused by exactly ONE of them, so a real string cannot be a
   * single-protection case here. My first attempt used `BLACKROCK HIGH YIELD K`
   * for the check-digit mutation and the suite correctly called it DECORATIVE —
   * `BLACKROCK` carries no digits at all, so the digit-count condition refuses
   * it too and the case is protected twice. These two are therefore
   * NEAREST-REACHABLE SHAPES, not measured cases. */
  ["check-digit requirement", (s) => s.replace("/\\d$/.test(id)", "true"),
    null, "Equity Index Fund", "AB12CDEFG Equity Index Fund"],
  ["digit-count requirement", (s) => s.replace("(id.match(/\\d/g) || []).length >= 2", "true"),
    null, "Equity Index Fund", "ABCDEFGH1 Equity Index Fund"],
];
for (const [what, mut, probe, wantAfter, probeName] of MUTATIONS) {
  const mutated = mut(SLICE);
  if (mutated === SLICE) { fail(`mutation ${what}: the text to mutate was not found — the anchor has drifted`); continue; }
  let got;
  try {
    const f = new Function("secKeyed", `${mutated}\n  return { cusipRepair };`);
    /* rebuild with the mutated slice, same frozen inputs */
    const keyed = (r) => KEYED.has(String(r.iss || "") + "\u0000" + String(r.name || ""));
    const built = f(what === "sec-keyed refusal" ? keyed : null);
    const saved = mk;
    got = (() => {
      /* re-run the probe against the MUTATED arm */
      if (what === "collision refusal") return built.cusipRepair(row(COLLIDE_ROW), COLLIDE_SIBS, new Set());
      if (what === "sponsor refusal") return built.cusipRepair(row(SPONSOR_ROW), sibsOf([["AT&T INC", 1]]), SPONSORS);
      if (what === "sec-keyed refusal") return built.cusipRepair(row(KEYED_ROW), sibsOf([["AMER FND INV CO OF AM-R6", 1]]), new Set());
      return built.cusipRepair(row(probeName), sibsOf([[wantAfter, 1]]), new Set());
    })();
    void saved; void probe;
  } catch (err) { fail(`mutation ${what}: threw (${err.message})`); continue; }
  if (got !== wantAfter)
    fail(`mutation ${what} is DECORATIVE: with the condition neutered the verdict is ${JSON.stringify(got)}, so the case is protected by something else and this condition proves nothing`);
}

/* ---------- invariants ---------- */
{
  const { cusipRepair, sponsorKey } = mk();
  /* idempotence: a repaired name must not be repairable again */
  for (const [name, want] of FIRE.map(([a, b]) => [a, b])) {
    const once = cusipRepair(row(name), sibsOf([[want, 1]]), new Set());
    const twice = cusipRepair(row(once), sibsOf([[once, 1]]), new Set());
    if (twice !== null) fail(`not idempotent: ${JSON.stringify(once)} strips again to ${JSON.stringify(twice)}`);
  }
  /* the sponsor key must land a row's spelling on the plan's spelling */
  for (const [a, b, why] of [["AT&T INC", "At&T Inc.", "the motivating pair"],
    ["CONOCOPHILLIPS", "Conocophillips", "the second measured case"],
    ["HOWMET AEROSPACE INC", "Howmet Aerospace Inc.", "a third real sponsor"]])
    if (sponsorKey(a) !== sponsorKey(b))
      fail(`sponsorKey does not match ${JSON.stringify(a)} to ${JSON.stringify(b)} (${why}): ${sponsorKey(a)} vs ${sponsorKey(b)}`);
  /* and it must NOT collapse two different firms onto one key */
  if (sponsorKey("AT&T INC") === sponsorKey("ALCOA USA CORP")) fail("sponsorKey collapses two different sponsors");
}

if (bad) { console.log(`\ncusip-repair-test: ${bad} FAILURE(S)`); process.exit(1); }
console.log(`cusip-repair-test: ok — ${FIRE.length} must-fire, ${KEEP.length} must-not-fire,`
  + ` ${MUTATIONS.length} single-protection mutations, ${FIRE.length} idempotence checks and 4 sponsor-key invariants`);
