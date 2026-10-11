#!/usr/bin/env node
/* wampo — TETHER FOR WHICH SPELLING `registrantAttested` IS ASKED OF.
 * 2026-10-11. Wired into `site-test`.
 *
 * `scripts/gen-sec-tickers.mjs` asks that guard of the filing as written AND of
 * the destination-blind `MEFS` -> `MFS` typo repair (`ATTESTATION_INPUTS` /
 * `attestedAnySpelling`). The relaxation is worth exactly 76 store cells and is
 * one `||` away from being worth the whole cross-house magnet population the
 * guard exists to refuse, so it needs a gate that fails BY NAME.
 *
 * CI-SAFE BY CONSTRUCTION, and that is why this file carries a registry of its
 * own. `entitiesByTicker` is built from `sec-funds.json`, which is refreshed
 * from the SEC, so verdicts pinned against the LIVE file would redden on a
 * refresh with nothing wrong — the shape that kept `merge-name-test` out of CI
 * and left `site-test` habitually red for ten runs. Every verdict below is
 * asserted against a FROZEN registrant map. The VOCABULARY (`STRUCTURAL`,
 * `CLASS_WORDS`, `DESCRIPTIVE`, `isAssetWord`, `norm`) is imported live and
 * deliberately: it is OUR code, not the registry, and a change to it SHOULD
 * move these verdicts.
 *
 * WHAT IS CHECKED, each part failing for its own reason:
 *   - MUST ADMIT: the three commonest MEFS spellings in the store, including
 *     the row the class was found on — and each is asserted to be refused on
 *     the RAW spelling first, or it is protected twice and proves nothing;
 *   - MUST REFUSE: `(Vanguard Asset Allocation Fund)` -> VALIC's VCAAX and the
 *     three Homestead cross-house magnets, which are the recorded reason the
 *     guard exists; plus the houseless Admiral row, whose repair is CIRCULAR
 *     and must stay refused;
 *   - SINGLE-PROTECTION MUTATIONS, and the suite EXITS 1 IF A MUTATION PASSES;
 *   - INVARIANTS standing in for the three arms NOT shipped: that `deTypo` is
 *     the IDENTITY off its own token (which is what makes the adversarial
 *     population untouchable by construction), that a house word the filing
 *     never wrote is not attested, and that the repair is destination-blind.
 */
import { readFileSync } from "node:fs";
import { norm } from "./match-sec-tickers.mjs";

const SRC_PATH = new URL("./gen-sec-tickers.mjs", import.meta.url).pathname;
const SRC = readFileSync(SRC_PATH, "utf8");
const load = async (src) => import("data:text/javascript," + encodeURIComponent(src));

let fails = 0;
const bad = (m) => { fails++; console.error(`  FAIL  ${m}`); };

/* ---------- THE SLICE ----------
 * The generator is a SCRIPT: importing it builds the SEC index and walks the
 * whole lineup store. So the four pieces are sliced out of its source verbatim
 * and composed into a module with the registrant map INJECTED. Sliced and
 * never retyped — a transcription measures the transcription. */
const cut = (re, what) => {
  const m = SRC.match(re);
  if (!m) {
    console.error(`sec-attest-test: the ${what} slice no longer matches gen-sec-tickers.mjs — re-derive it`);
    process.exit(1);
  }
  return m[0];
};
const SL = {
  distinctiveWords: cut(/const distinctiveCache = new Map\(\);\nfunction distinctiveWords\(s\) \{[\s\S]*?\n\}/, "distinctiveWords"),
  registrantAttested: cut(/function registrantAttested\(ticker, filedName, iss\) \{[\s\S]*?\n\}/, "registrantAttested"),
  deTypo: cut(/^const deTypo = .*$/m, "deTypo"),
  inputs: cut(/const ATTESTATION_INPUTS = .*\nfunction attestedAnySpelling\(ticker, filedName, iss\) \{[\s\S]*?\n\}/, "ATTESTATION_INPUTS"),
};

const MODULE = (slices) => `
import { norm, STRUCTURAL, CLASS_WORDS, DESCRIPTIVE, isAssetWord }
  from ${JSON.stringify(new URL("./match-sec-tickers.mjs", import.meta.url).href)};
export const entitiesByTicker = new Map(JSON.parse(process.env.WAMPO_ATTEST_FIXTURE));
${slices.distinctiveWords}
${slices.registrantAttested}
${slices.deTypo}
${slices.inputs}
export { registrantAttested, attestedAnySpelling, deTypo, distinctiveWords };
`;

/* ---------- THE FROZEN REGISTRANT MAP ----------
 * ticker -> the registrant strings `sec-funds.json` carries for it, after
 * `decodeEntities`. These are the real values, frozen on 2026-10-11 and read
 * out of the live file at that date; the point of freezing them is that an SEC
 * refresh must not be able to redden this gate.
 *
 * Each MFS registrant's ONLY distinctive word is `mfs` — that is not incidental,
 * it is the entire reason the guard refused this class, and the fixture would
 * be testing a different thing if the registrants said anything else. */
const FIXTURE = [
  ["MEIKX", ["MFS SERIES TRUST I :: MFS Value Fund"]],
  ["MVCKX", ["MFS SERIES TRUST XI :: MFS Mid Cap Value Fund"]],
  ["MGRDX", ["MFS SERIES TRUST X :: MFS International Growth Fund"]],
  ["OTCKX", ["MFS SERIES TRUST IV :: MFS Mid Cap Growth Fund"]],
  /* VALIC's fund on a Vanguard-named row: the case that created the guard */
  ["VCAAX", ["VALIC Co I :: Asset Allocation Fund"]],
  /* Homestead's bare `Intermediate Bond Fund` magnetizing three other houses */
  ["HOIBX", ["HOMESTEAD FUNDS INC :: Intermediate Bond Fund"]],
  /* the houseless Admiral destination: `VANGUARD INDEX FUNDS` contributes
   * nothing distinctive beyond `vanguard`, the word the filing omits */
  ["VIGAX", ["VANGUARD INDEX FUNDS :: Vanguard Growth Index Fund"]],
  /* and one Vanguard series whose trust DOES say something distinctive, so the
   * Admiral invariant below is about the word we supply and not about Vanguard */
  ["VPMAX", ["VANGUARD CHESTER FUNDS :: Vanguard PRIMECAP Fund"]],
];
process.env.WAMPO_ATTEST_FIXTURE = JSON.stringify(FIXTURE);

const M = await load(MODULE(SL));

/* the fixture must behave the way the whole argument assumes: the MFS
 * registrants say `mfs` and nothing else distinctive. Asserted, not assumed —
 * if the vocabulary sets ever absorb `mfs`, every must-admit case below would
 * pass for the wrong reason. */
for (const tk of ["MEIKX", "MVCKX", "MGRDX", "OTCKX"]) {
  const d = [...M.distinctiveWords(FIXTURE.find((x) => x[0] === tk)[1][0])];
  if (d.length !== 1 || d[0] !== "mfs")
    bad(`FIXTURE PREMISE: ${tk}'s registrant offers ${JSON.stringify(d)}, not exactly ["mfs"] — the must-admit cases would no longer test the repair`);
}
if (!M.distinctiveWords("VANGUARD INDEX FUNDS :: Vanguard Growth Index Fund").has("vanguard"))
  bad("FIXTURE PREMISE: `vanguard` is no longer distinctive, so the Admiral circularity invariant tests nothing");

/* ---------- MUST ADMIT, and admit BY THE REPAIR ---------- */
const MUST_ADMIT = [
  ["MEIKX", "MEFS Value Fund R6", "", "the row the MEFS class was found on"],
  ["MVCKX", "MEFS Mid Cap Value R6", "", "7 store rows, the class's commonest spelling"],
  ["MGRDX", "MEFS International Growth R6", "", "7 store rows"],
  ["OTCKX", "MEFS Mid Cap Growth R6", "", "4 store rows"],
  /* the typo in the ISSUER cell alone, which the repair also reaches because
   * attestation reads name and issuer as one string */
  ["MEIKX", "Value Fund R6", "MEFS Investment Management", "the typo in the issuer cell"],
];
for (const [tk, n, iss, why] of MUST_ADMIT) {
  if (M.registrantAttested(tk, n, iss))
    bad(`MUST ADMIT (${why}): ${tk} on ${JSON.stringify(n)} / ${JSON.stringify(iss)} is ALREADY attested on the raw spelling — protected twice, so it proves nothing`);
  else if (!M.attestedAnySpelling(tk, n, iss))
    bad(`MUST ADMIT (${why}): ${tk} on ${JSON.stringify(n)} / ${JSON.stringify(iss)} is still refused`);
}

/* ---------- MUST REFUSE ---------- */
const MUST_REFUSE = [
  ["VCAAX", "(Vanguard Asset Allocation Fund)", "", "VALIC's fund published as fact on a Vanguard name"],
  ["HOIBX", "Vanguard Intermediate Bond Fund", "", "Homestead magnetizing Vanguard"],
  ["HOIBX", "JPMorgan Intermediate Bond Fund", "", "Homestead magnetizing JPMorgan"],
  ["HOIBX", "Intermediate Bond Fund", "Voya Financial", "Homestead magnetizing Voya"],
  /* the CIRCULAR half of the item: the Admiral arm supplies `Vanguard`, so
   * attesting against its repaired spelling would be attesting our own guess.
   * These must stay refused on the shipped inputs. */
  ["VIGAX", "Growth Index Adm", "", "the houseless Admiral row — its repair supplies the house"],
  ["VIGAX", "Total Stock Market Index Adm", "", "the same, on the class's commonest spelling"],
  /* a MEFS token must not license a DIFFERENT house's symbol: the repair makes
   * the string say `MFS`, which says nothing about Vanguard or Homestead */
  ["VCAAX", "MEFS Asset Allocation Fund", "", "a MEFS token on a VALIC destination"],
  ["HOIBX", "MEFS Intermediate Bond Fund", "", "a MEFS token on a Homestead destination"],
  ["VIGAX", "MEFS Growth Index Adm", "", "a MEFS token on a houseless Admiral destination"],
];
for (const [tk, n, iss, why] of MUST_REFUSE) {
  if (M.attestedAnySpelling(tk, n, iss))
    bad(`MUST REFUSE (${why}): ${tk} on ${JSON.stringify(n)} / ${JSON.stringify(iss)} was ADMITTED`);
}

/* ---------- SINGLE-PROTECTION MUTATIONS ----------
 * A PASS here is a FAILURE: a control that cannot fail is decorative. */
const MUTATIONS = [
  { name: "the repaired spelling is asked at all (ATTESTATION_INPUTS loses its second entry)",
    from: "const ATTESTATION_INPUTS = [(n, i) => [n, i], (n, i) => [deTypo(n), deTypo(i)]];",
    to: "const ATTESTATION_INPUTS = [(n, i) => [n, i]];",
    /* without it the whole 76-cell delivery reverts, which is the ship */
    expect: [["MEIKX", "MEFS Value Fund R6", "", false]] },
  { name: "deTypo's WORD ANCHOR (a longer token must not be rewritten)",
    from: 'const deTypo = (x) => String(x == null ? "" : x).replace(/\\bMEFS\\b/gi, "MFS");',
    to: 'const deTypo = (x) => String(x == null ? "" : x).replace(/MEFS/gi, "MFS");',
    /* `MEFSA` is not the house; unanchored, a longer token would be rewritten
     * into one and attest a symbol the filing never named */
    expect: [["MEIKX", "MEFSAVER Value Fund R6", "", true]] },
  { name: "deTypo reads the ISSUER cell as well as the name",
    from: "    const [n, i] = f(filedName, iss);",
    to: "    const [n] = f(filedName, iss); const i = iss;",
    expect: [["MEIKX", "Value Fund R6", "MEFS Investment Management", false]] },
];
for (const mut of MUTATIONS) {
  if (!SRC.includes(mut.from)) { bad(`MUTATION "${mut.name}": its anchor is no longer in the source — re-derive it`); continue; }
  const sl = { ...SL };
  for (const k of Object.keys(sl)) sl[k] = sl[k].split(mut.from).join(mut.to);
  if (JSON.stringify(sl) === JSON.stringify(SL)) { bad(`MUTATION "${mut.name}": the anchor is in the source but NOT in the slice — the mutation is decorative`); continue; }
  let mod;
  try { mod = await load(MODULE(sl)); }
  catch (e) { bad(`MUTATION "${mut.name}": the mutated module does not load (${String(e && e.name)})`); continue; }
  let ok = true;
  for (const [tk, n, iss, wantMutated] of mut.expect) {
    /* BOTH halves, or the control goes decorative: the shipped code must NOT
     * give the mutant's verdict, and the mutant must. */
    const base = M.attestedAnySpelling(tk, n, iss);
    const got = mod.attestedAnySpelling(tk, n, iss);
    if (base === wantMutated) {
      ok = false;
      bad(`MUTATION "${mut.name}": the SHIPPED code already answers ${base} on ${tk}/${JSON.stringify(n)}/${JSON.stringify(iss)} — this case cannot test that condition`);
    } else if (got !== wantMutated) {
      ok = false;
      bad(`MUTATION "${mut.name}" did NOT change the verdict on ${tk}/${JSON.stringify(n)}/${JSON.stringify(iss)} (shipped ${base}, mutant ${got}, expected mutant ${wantMutated}) — DECORATIVE, or the case is protected twice`);
    }
  }
  if (ok) console.error(`  mutation ok  ${mut.name}`);
}

/* ---------- INVARIANTS, standing in for the three arms NOT shipped ---------- */
{
  /* (1) `deTypo` IS THE IDENTITY OFF ITS OWN TOKEN. This is the whole safety
   *     argument: the second attestation call is byte-identical to the first on
   *     every string without a `MEFS` token, so the adversarial population is
   *     untouchable BY CONSTRUCTION rather than by measurement. */
  const off = ["(Vanguard Asset Allocation Fund)", "Vanguard Intermediate Bond Fund",
    "Growth Index Adm", "MFS Value Fund R6", "Fidelity 500 Index Fund",
    "Vanguard Fiduciary Trust", "MEFSAVER Growth", "AMEFS Value", "", "MFSMEFS"];
  for (const s of off) {
    const want = /\bMEFS\b/i.test(s) ? "repaired" : "identity";
    const got = M.deTypo(s) === s ? "identity" : "repaired";
    if (got !== want) bad(`INVARIANT (1): deTypo is ${got} on ${JSON.stringify(s)}, expected ${want}`);
  }
  /* (2) THE REPAIR IS DESTINATION-BLIND, which is the test that separates it
   *     from the CIRCULAR Admiral repair. `deTypo` takes one argument and no
   *     registry input, so the same filed string yields the same spelling
   *     whatever symbol it will reach. Asserted by varying the ticker. */
  const s = "MEFS Value Fund R6";
  const r = M.deTypo(s);
  for (const tk of ["MEIKX", "VCAAX", "HOIBX", "VIGAX", "VPMAX"])
    if (M.deTypo(s) !== r)
      bad(`INVARIANT (2): deTypo is not destination-blind — it differed while resolving toward ${tk}`);
  if (!/\bMFS\b/.test(r) || /\bMEFS\b/i.test(r))
    bad(`INVARIANT (2): deTypo(${JSON.stringify(s)}) = ${JSON.stringify(r)} does not spell the corrected house`);
  /* (3) AND THE REPAIR SUPPLIES NO HOUSE THE FILING DID NOT WRITE. The
   *     distinction the item turns on: the corrected token's letters are a
   *     subsequence of the filed token, so nothing is added. Asserted rather
   *     than argued — a repair that PREPENDS a word would fail this. */
  for (const [filed, want] of [["MEFS Value Fund R6", "MFS"], ["mefs value", "mfs"]]) {
    const outWords = norm(M.deTypo(filed)).split(" ");
    const inWords = norm(filed).split(" ");
    for (const w of outWords)
      if (!inWords.includes(w) && w !== want.toLowerCase())
        bad(`INVARIANT (3): deTypo introduced the token ${JSON.stringify(w)}, which is neither in the filing nor the corrected house`);
    if (outWords.length !== inWords.length)
      bad(`INVARIANT (3): deTypo changed the token COUNT on ${JSON.stringify(filed)} (${inWords.length} -> ${outWords.length}); it must correct a token, never add one`);
  }
  /* (4) THE ADMIRAL REPAIR WOULD BE CIRCULAR, asserted by doing it. Prefixing
   *     the house the registry-derived family supplies turns the guard's answer
   *     from false to TRUE on a row whose filing names no house at all — which
   *     is why that arm's 204 refused rows stay refused and need a different
   *     WITNESS rather than a different input. */
  for (const n of ["Growth Index Adm", "Total Stock Market Index Adm"]) {
    if (M.attestedAnySpelling("VIGAX", n, ""))
      bad(`INVARIANT (4): ${JSON.stringify(n)} is attested on the SHIPPED inputs — the Admiral half has been relaxed`);
    if (!M.registrantAttested("VIGAX", `Vanguard ${n}`, ""))
      bad(`INVARIANT (4): prefixing the house does NOT flip the verdict on ${JSON.stringify(n)}, so the circularity claim is no longer demonstrated and must be re-derived`);
  }
}

if (fails) { console.error(`\nsec-attest-test: ${fails} FAILURE(S)`); process.exit(1); }
console.error(`sec-attest-test OK  (${MUST_ADMIT.length} must-admit, ${MUST_REFUSE.length} must-refuse, ${MUTATIONS.length} mutations, 4 invariants)`);
