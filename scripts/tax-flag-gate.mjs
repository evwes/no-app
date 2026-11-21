#!/usr/bin/env node
/* wampo — THE GATE FOR A CHANGE TO THE ROTH / AFTER-TAX ARMS.
 *
 * WHAT IT PROTECTS. 4,349 plans / 19,662,953 readers correctly publish
 * "Voluntary After-Tax: ✓ Available" and 44,624 plans / 77,606,664 readers
 * correctly publish Roth. `docs/accuracy-log.md` 2026-11-20 records two
 * defects on those arms — a negation read as an affirmation, and a
 * future-effective amendment read as a current feature — whose repair is worth
 * a few hundred thousand readers. ***A veto even slightly too wide spends the
 * 19.66M to buy the 300K.*** That trade is the reason the fix has not shipped,
 * and this is the instrument that prices it before it does.
 *
 * `parse-replay.mjs` is the equivalent for LINEUPS and is deliberately not
 * extended: it judges `isConfident` over a parse's rows and is blind to a
 * feature flag — a feature-only version of a different harness once "reported
 * two identical blocks and read as no change". This one judges exactly two
 * booleans and the sentence published beside them.
 *
 * USAGE
 *   node scripts/tax-flag-gate.mjs --vs <ref|path>            [options]
 *     --vs <ref|path>           the BEFORE extractor: a git ref (its whole
 *                               module graph is materialised at that ref) or a
 *                               path to a .mjs exporting extractPlanFeatures
 *     --candidate <ref|path>    the AFTER extractor (default: working tree)
 *     --arm roth|afterTax|both  which flag to judge (default both)
 *     --head N --sample N --seed S --all   the population (see below)
 *     --download                fetch filings missing from the text cache
 *     --expect-loss ACK[:arm]   a loss that is the POINT of the change
 *     --expect-loss-file <path> the same, one ACK[:arm] per line
 *     --must-keep ACK           a pin: failing unless the candidate keeps it
 *     --cached-only             judge only filings already in the text cache
 *     --control-max 0.25        refuse to report above this baseline/store
 *                               disagreement rate (measured band 10-14%)
 *     --selftest                prove the harness can fail (see below)
 *
 * COST, MEASURED 2026-11-20 in this sandbox: 95 ms per filing for the two
 * extractor calls, and 0.11 s per filing to download and `pdftotext` one at
 * concurrency 6. So the DEFAULT sample (1,000 filings) is ~2 minutes warm; the
 * AFTER-TAX arm runs EXHAUSTIVELY over all 4,349 plans in ~15 minutes cold and
 * ~7 warm, which is why the 19.66M-reader exposure does not have to be
 * sampled at all; and both arms together, all 45,978 plans, is ~84 minutes of
 * downloading plus ~73 minutes of parsing and about 10 GB of cached text.
 *   Exit 1 on any UNEXPECTED loss, any failed pin, or a broken control.
 *
 * THE POPULATION is every plan whose OWN entry's features publish a yes
 * (`lib-ledger.mjs:274` — both reader surfaces publish the plan's own features
 * and never the trust's, so this is plan-keyed and no master-trust resolution
 * applies). All 45,978 is ~1h40m of downloading at 6 ways and ~10 GB of text,
 * so the default is two strata: the top N by readers EXACTLY, plus a seeded
 * uniform draw of the rest, which is the only part that scales. The three
 * named fixtures are forced in either way and are exact.
 *
 * FOUR THINGS IT DOES THAT A HOME-ROLLED DIFF WOULD NOT, each because this
 * record paid for the lesson:
 *  1. THE INPUTS ARE PINNED AND THE PIN IS PROVEN. A `--vs` path that does not
 *     exist THROWS; a ref that does not exist throws inside `materialiseAt`.
 *     A before that is silently the after reads as a clean no-difference, and
 *     that has happened here: a `{app:}`-for-`{appjs:}` typo made both sides
 *     read the working tree and print a perfect zero. `--selftest` asserts
 *     both throws.
 *  2. IT HAS BEEN SHOWN ABLE TO SEE A LOSS. `--selftest` runs
 *     `scripts/tax-flag-mutant.mjs` — an over-wide veto keyed on
 *     not/no/permit/allow, which kills affirmative sentences too — as the
 *     candidate and requires a large, named loss including Target Corporation.
 *  3. IT REPORTS WHAT IT CANNOT SEE. ~10-14% of these filings do not reproduce
 *     their stored flag from a local `pdftotext` parse, because production
 *     read them through OCR or through a prior-year fallback. Those plans are
 *     named and their readers counted as UNTESTED, never as unchanged.
 *  4. IT READS GAINS AS CAREFULLY AS LOSSES, and reports a moved QUOTE even
 *     where the flag holds — a guard that withdraws an assertion can also
 *     promote one, and a changed sentence under an unchanged tick is a change
 *     to what the page says.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadPlans } from "./lib-schema.mjs";
import { materialiseAt } from "./lib-refmod.mjs";
import { read, ensure, seededShuffle, wilson95 } from "./lib-filingtext.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const one = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const many = (f) => argv.reduce((a, x, i) => (x === f ? [...a, argv[i + 1]] : a), []);
const has = (f) => argv.includes(f);

const ARM = one("--arm", "both");
if (!["roth", "afterTax", "both"].includes(ARM)) { console.error("--arm must be roth|afterTax|both"); process.exit(2); }
const ARMS = ARM === "both" ? ["roth", "afterTax"] : [ARM];
const HEAD_N = +one("--head", 150), SAMPLE_N = +one("--sample", 850), SEED = +one("--seed", 20261120);
const ALL = has("--all");
/* Measured on this data: the local-vs-store disagreement runs 9.7% on the
 * after-tax population and 13.4% on the union, all of it in the direction of
 * "the store has a flag this text does not yield" — OCR and prior-year
 * fallbacks. parse-replay's 10% refusal threshold would therefore refuse every
 * run here, so the floor is set above the measured band and the measurement is
 * printed every time rather than assumed. */
const CONTROL_REFUSE_ABOVE = +one("--control-max", 0.25);

/* ---------------------------------------------------------------------------
 * loading an extractor: a git REF or a PATH, and a missing one THROWS
 * ------------------------------------------------------------------------- */
async function loadExtractor(spec, label) {
  if (!spec) throw new Error(`${label}: no extractor given`);
  /* `origin/main` is a REF that contains a slash, and treating every slash as
   * a path made the most natural baseline unusable. A spec counts as a path
   * when it is spelled like one — .mjs, ./, / — or when it actually EXISTS;
   * everything else goes to the ref branch, which resolves through git and
   * throws when git cannot. The pin is untouched: a MISSPELLED .mjs path still
   * throws rather than falling back to the working tree. */
  const looksLikePath = spec.endsWith(".mjs") || spec.startsWith(".") || spec.startsWith("/") ||
    (spec.includes("/") && existsSync(path.resolve(ROOT, spec)));
  if (looksLikePath && !/^[0-9a-f]{7,40}$/i.test(spec)) {
    const abs = path.resolve(ROOT, spec);
    /* THE PIN. A non-existent path must throw here and not fall back to the
     * working tree: a baseline that is silently the candidate prints a clean
     * zero, which is indistinguishable from a safe change. */
    if (!existsSync(abs)) throw new Error(`${label}: ${abs} does not exist. A baseline that silently resolves to the working tree reports a clean no-difference, which is why this throws instead of falling back.`);
    const mod = await import(abs);
    if (typeof mod.extractPlanFeatures !== "function")
      throw new Error(`${label}: ${abs} exports no extractPlanFeatures (exports: ${Object.keys(mod).join(", ") || "none"})`);
    return { mod, how: `path ${path.relative(ROOT, abs)}`, mutant: mod.IS_MUTANT || null };
  }
  /* a ref: materialise the WHOLE local module graph at that ref */
  try { execFileSync("git", ["rev-parse", "--verify", `${spec}^{commit}`], { cwd: ROOT, stdio: "ignore" }); }
  catch { throw new Error(`${label}: "${spec}" is neither an existing path nor a git ref this repo can resolve.`); }
  const m = materialiseAt(spec, "lib-4i.mjs", { label: "taxgate" });
  const mod = await import(m.entryPath);
  if (typeof mod.extractPlanFeatures !== "function")
    throw new Error(`${label}: scripts/lib-4i.mjs at ${spec} exports no extractPlanFeatures`);
  return { mod, how: `ref ${spec} (v${mod.PARSER_VERSION}, graph: ${m.files.join(", ")})`, mutant: mod.IS_MUTANT || null };
}

/* ---------------------------------------------------------------------------
 * the population
 * ------------------------------------------------------------------------- */
function buildPopulation() {
  const feats = new Map();
  for (const sh of readdirSync(path.join(ROOT, "data/lineups"))) {
    if (!sh.endsWith(".json")) continue;
    for (const [ack, e] of Object.entries(JSON.parse(readFileSync(path.join(ROOT, "data/lineups", sh), "utf8"))))
      if (e && e.features && (e.features.roth || e.features.afterTax)) feats.set(ack, e.features);
  }
  if (!feats.size) throw new Error("CONTROL FAILED: no features loaded from data/lineups — the gate is void");
  const d = loadPlans(path.join(ROOT, "plans-all.json"));
  const pop = [];
  for (const r of d.rows) {
    const ack = d.get(r, "ack");
    const ft = ack ? feats.get(ack) : null;
    if (!ft) continue;
    const rec = {
      ack, ppl: +d.get(r, "partEOY") || +d.get(r, "participants") || 0,
      name: String(d.get(r, "sponsorName") || "").trim(),
      ein: d.get(r, "ein"), pn: d.get(r, "pn"),
      roth: !!ft.roth, afterTax: !!ft.afterTax,
      rothText: ft.rothText || "", afterTaxText: ft.afterTaxText || "",
    };
    if (ARMS.some((a) => rec[a])) pop.push(rec);
  }
  pop.sort((a, b) => b.ppl - a.ppl);
  return pop;
}

/* TAX_FLAG_FIXTURES exists for ONE purpose: to let the arm-scoping check above
 * be given a fixture the store does not satisfy, so that its refusal can be
 * SEEN rather than asserted. Same shape as MIRROR_GATE_MAIN_REF. The workflow
 * never sets it and the default is the tracked file. */
const FIX = JSON.parse(readFileSync(process.env.TAX_FLAG_FIXTURES || path.join(ROOT, "scripts/tax-flag-fixtures.json"), "utf8"));

/* ---------------------------------------------------------------------------
 * one run of the comparison
 * ------------------------------------------------------------------------- */
async function runGate(opts) {
  const { baseSpec, candSpec, mustKeep = [], quiet = false, headN = HEAD_N, sampleN = SAMPLE_N,
    seed = SEED, all = ALL, download = has("--download") } = opts;
  const base = await loadExtractor(baseSpec, "--vs");
  const cand = candSpec ? await loadExtractor(candSpec, "--candidate")
    : { mod: await import(new URL("./lib-4i.mjs", import.meta.url).href), how: "working tree", mutant: null };
  const log = (...a) => { if (!quiet) console.log(...a); };
  log(`BEFORE: ${base.how}`);
  log(`AFTER : ${cand.how}`);
  if (cand.mutant) log(`\n*** THE CANDIDATE IS A MUTANT: ${cand.mutant} — this run is a control, not a ship ***`);
  if (base.mutant) log(`\n*** THE BASELINE IS A MUTANT: ${base.mutant} ***`);

  let pop = buildPopulation();
  const popPpl = pop.reduce((t, x) => t + x.ppl, 0);
  /* `--cached-only` judges what is already on disk. It is what `--selftest`
   * uses, because a control that needs the network is a control that will be
   * skipped — and because a mutant has to be caught on REAL filings carried
   * out of the store, never on a synthetic row: a synthetic row under-states
   * any arm keyed on the row's own fields. */
  if (opts.cachedOnly) {
    const keepFix = new Set(FIX.cases.map((c) => c.ack));
    pop = pop.filter((p) => keepFix.has(p.ack) || read(p.ack) != null);
    log(`  --cached-only: ${pop.length.toLocaleString()} of the population have text on disk`);
  }
  let chosen, headSet = new Set(), tailSet = new Set(), restCount = 0;
  if (all) { chosen = pop; for (const p of pop) p.stratum = "all"; }
  else {
    const head = pop.slice(0, headN), rest = pop.slice(headN);
    const tail = seededShuffle(rest, seed).slice(0, sampleN);
    headSet = new Set(head.map((p) => p.ack)); tailSet = new Set(tail.map((p) => p.ack));
    restCount = rest.length;
    const want = new Map([...head, ...tail].map((p) => [p.ack, p]));
    for (const c of FIX.cases) { const p = pop.find((x) => x.ack === c.ack); if (p) want.set(c.ack, p); }
    for (const a of mustKeep) { const p = pop.find((x) => x.ack === a); if (p) want.set(a, p); }
    chosen = [...want.values()];
    for (const p of chosen) p.stratum = headSet.has(p.ack) ? "head" : (tailSet.has(p.ack) ? "tail" : "pinned");
  }
  log(`\npopulation ${pop.length.toLocaleString()} plans / ${popPpl.toLocaleString()} readers publishing a yes on ${ARMS.join("/")}`);
  log(`selected ${chosen.length.toLocaleString()} filings (${all ? "ALL" : `head ${headN} by readers + ${sampleN} seeded uniform (seed ${seed}) + pins`})`);

  const got = await ensure(chosen.map((p) => p.ack), {
    download, concurrency: 6,
    onProgress: quiet ? null : (a, b) => process.stdout.write(`\r  fetching ${a}/${b}`),
  });
  if (download && !quiet) console.log(`\n  cache: ${got.have} present, ${got.fetched} fetched, ${got.failed.length} unreachable`);

  const out = {
    pop, popPpl, chosen, noText: [], untested: [], agree: 0, disagree: 0,
    lost: [], gained: [], quoteMoved: [], held: [], base, cand,
    headN: headN, restCount, cachedOnly: !!opts.cachedOnly,
  };
  let n = 0;
  for (const p of chosen) {
    const text = read(p.ack);
    if (!text) { out.noText.push(p); continue; }
    n++;
    let b, c;
    try { b = base.mod.extractPlanFeatures(text, p.name) || {}; } catch (e) { b = { __throw: e.message }; }
    try { c = cand.mod.extractPlanFeatures(text, p.name) || {}; } catch (e) { c = { __throw: e.message }; }
    if (c.__throw) { out.lost.push({ ...p, arm: "(throw)", why: c.__throw, bq: "", cq: "" }); continue; }
    for (const arm of ARMS) {
      if (!p[arm]) continue;
      const qk = arm === "roth" ? "rothText" : "afterTaxText";
      /* THE CONTROL, PER ARM: the baseline parse must reproduce the STORE's
       * flag. Where it does not, production read a different text (OCR or a
       * prior-year fallback) and this run cannot judge the plan at all. */
      if (!b[arm]) { out.untested.push({ ...p, arm, storedQuote: p[qk] }); out.disagree++; continue; }
      out.agree++;
      if (!c[arm]) { out.lost.push({ ...p, arm, bq: String(b[qk] || ""), cq: "" }); continue; }
      if (String(b[qk] || "") !== String(c[qk] || ""))
        out.quoteMoved.push({ ...p, arm, bq: String(b[qk] || ""), cq: String(c[qk] || "") });
      else out.held.push({ ...p, arm });
    }
    /* GAINS: an arm the store does not publish that the candidate now would.
     * Read as carefully as a loss — a guard whose job is to withhold a false
     * assertion can also promote one. */
    for (const arm of ARMS) {
      if (p[arm]) continue;
      const qk = arm === "roth" ? "rothText" : "afterTaxText";
      if (!b[arm] && c[arm]) out.gained.push({ ...p, arm, cq: String(c[qk] || "") });
    }
    if (!quiet && n % 200 === 0) process.stdout.write(`\r  judged ${n}/${chosen.length}`);
  }
  if (!quiet) console.log("");
  return out;
}

/* ---------------------------------------------------------------------------
 * reporting
 * ------------------------------------------------------------------------- */
const f = (x) => x.toLocaleString();
const sum = (a) => a.reduce((t, x) => t + x.ppl, 0);
/* readers behind a set of plan-arms, counting each PLAN once: a plan losing
 * both arms is one plan's readers, not two. */
const sumPlans = (a) => {
  const seen = new Set(); let t = 0;
  for (const x of a) { if (seen.has(x.ack)) continue; seen.add(x.ack); t += x.ppl; }
  return t;
};

function report(R, expectLoss, mustKeep) {
  const checked = R.agree + R.disagree;
  console.log(`\nCONTROL — the BASELINE's answer against the committed store, per published arm:`);
  console.log(`  reproduces ${f(R.agree)} of ${f(checked)}${checked ? ` (${(100 * R.agree / checked).toFixed(1)}%)` : ""}` +
    `; ${f(R.disagree)} arm-flags are in the store and not in this text (OCR / prior-year fallback), ` +
    `${f(R.noText.length)} filings unreachable`);
  console.log(`  UNTESTED by this run: ${f(new Set(R.untested.map((x) => x.ack)).size)} plans / ` +
    `${f(sumPlans(R.untested))} readers — their flags are neither held nor lost here, and a change that ` +
    `destroys them would be invisible to this gate. ONLY_ACKS_4I through the real fetch-4i path, which does OCR, is the instrument for those.`);
  if (checked >= 50 && R.disagree / checked > CONTROL_REFUSE_ABOVE) {
    console.error(`\nREFUSING TO REPORT: the baseline disagrees with the store on ${(100 * R.disagree / checked).toFixed(1)}% ` +
      `of published arms, above the ${(100 * CONTROL_REFUSE_ABOVE).toFixed(0)}% floor. That is a broken instrument, not a finding.`);
    process.exit(1);
  }

  const expected = [], unexpected = [];
  for (const l of R.lost) {
    const keys = [`${l.ack}`, `${l.ack}:${l.arm}`];
    (keys.some((k) => expectLoss.has(k)) ? expected : unexpected).push(l);
  }
  console.log(`\nJUDGED ${f(R.agree)} published arm-flags across ${f(new Set(R.chosen.map((x) => x.ack)).size)} plans`);
  console.log(`  HELD              ${f(R.held.length).padStart(6)}  ${f(sumPlans(R.held)).padStart(11)} readers`);
  console.log(`  QUOTE MOVED       ${f(R.quoteMoved.length).padStart(6)}  ${f(sumPlans(R.quoteMoved)).padStart(11)} readers  (flag unchanged, published sentence changed)`);
  console.log(`  LOST — expected   ${f(expected.length).padStart(6)}  ${f(sumPlans(expected)).padStart(11)} readers`);
  console.log(`  LOST — UNEXPECTED ${f(unexpected.length).padStart(6)}  ${f(sumPlans(unexpected)).padStart(11)} readers`);
  console.log(`  GAINED            ${f(R.gained.length).padStart(6)}  ${f(sumPlans(R.gained)).padStart(11)} readers`);

  const show = (label, a, n = 20, q = true) => {
    if (!a.length) return;
    console.log(`\n--- ${label} (${a.length}) ---`);
    for (const x of a.sort((p, r) => r.ppl - p.ppl).slice(0, n)) {
      console.log(`  ${String(x.ppl).padStart(7)}ppl  ${x.arm.padEnd(9)} ${x.ack}  ${x.name.slice(0, 34)}  [${x.stratum}]`);
      if (q && x.bq) console.log(`      was: ${JSON.stringify(String(x.bq).slice(0, 170))}`);
      if (q && x.cq) console.log(`      now: ${JSON.stringify(String(x.cq).slice(0, 170))}`);
    }
    if (a.length > n) console.log(`  … ${a.length - n} more`);
  };
  show("LOST — UNEXPECTED: a published yes this candidate withdraws", unexpected, 25);
  show("LOST — expected (named with --expect-loss)", expected, 25);
  show("QUOTE MOVED", R.quoteMoved, 10);
  show("GAINED — newly published", R.gained, 10);

  /* WHAT AN UNEXPECTED LOSS RATE MEANS FOR THE WHOLE POPULATION. The tail is a
   * uniform draw of everything below the head, so only its rate scales; the
   * head is exact. A gate that printed only the sample's count would understate
   * a wide veto by the sampling factor, which here is ~50x. */
  const tailJudged = R.held.filter((x) => x.stratum === "tail").length +
    R.quoteMoved.filter((x) => x.stratum === "tail").length + R.lost.filter((x) => x.stratum === "tail").length;
  const tailLost = unexpected.filter((x) => x.stratum === "tail");
  if (!ALL && tailJudged && !R.cachedOnly) {
    const [lo, hi] = wilson95(tailLost.length, tailJudged);
    const w = R.restCount / tailJudged;
    console.log(`\nPROJECTION of UNEXPECTED loss to the whole population`);
    console.log(`  head (top ${R.headN} by readers, exact): ${unexpected.filter((x) => x.stratum === "head").length} arm-flags, ` +
      `${f(sumPlans(unexpected.filter((x) => x.stratum === "head")))} readers`);
    console.log(`  tail draw: ${tailLost.length}/${tailJudged} = ${(100 * tailLost.length / tailJudged).toFixed(2)}% ` +
      `(Wilson 95% ${(100 * lo).toFixed(2)}–${(100 * hi).toFixed(2)}%) -> ${f(Math.round(lo * R.restCount))}–${f(Math.round(hi * R.restCount))} plans, ` +
      `≈ ${f(Math.round(sumPlans(tailLost) * w))} readers`);
  }
  return { expected, unexpected };
}

/* ---------------------------------------------------------------------------
 * the pins
 * ------------------------------------------------------------------------- */
function pins(R, unexpected, mustKeep) {
  const fails = [];
  const judged = new Map();
  for (const x of [...R.held, ...R.quoteMoved, ...R.lost]) judged.set(`${x.ack}:${x.arm}`, x);
  const untested = new Set(R.untested.map((x) => `${x.ack}:${x.arm}`));

  for (const c of FIX.cases) {
    /* ARM SCOPING, and it is the gate's own bookkeeping rather than a loss.
     * A fixture declares in `expect` the arms it IS a fixture for. Waste
     * Management stores afterTax:true and no roth key at all, so on
     * `--arm roth` it is CORRECTLY absent from the published-yes population —
     * and asserting its presence there failed the roth gate with a clean
     * substantive verdict behind it (0 unexpected losses, 0/2596 in the tail).
     * A gate that fails for a reason that is not a loss teaches its reader to
     * pass it flags, so the presence checks are PER ARM. A fixture with no arm
     * in this run is REPORTED as out of scope and not silently skipped: a pin
     * that quietly disappears proves nothing either. */
    const armsHere = Object.keys(c.expect).filter((a) => ARMS.includes(a));
    if (!armsHere.length) {
      console.log(`  NOTE: fixture ${c.id} declares ${Object.keys(c.expect).join("/")} only — out of scope for this ${ARMS.join("/")} run`);
      continue;
    }
    const inPop = R.pop.find((x) => x.ack === c.ack);
    const absent = armsHere.filter((a) => !inPop || !inPop[a]);
    if (absent.length) {
      fails.push(`fixture ${c.id} (${c.ack}): declares ${armsHere.join("/")} and the store publishes no yes on ${absent.join("/")} — the store changed under this fixture, or the population query is wrong`);
      continue;
    }
    if (!R.chosen.some((x) => x.ack === c.ack)) { fails.push(`fixture ${c.id}: not selected by this run — a pin the run never reaches proves nothing`); continue; }
    if (!read(c.ack)) { fails.push(`fixture ${c.id}: no text available — run with --download`); continue; }
    for (const arm of armsHere) {
      const roles = c.expect[arm];
      const key = `${c.ack}:${arm}`;
      if (untested.has(key)) {
        /* the baseline could not reproduce the store here: report, never pass
         * silently, and never fail — it is UNJUDGEABLE, not a regression */
        console.log(`  NOTE: fixture ${c.id} ${arm} is UNTESTED in this run (the baseline does not reproduce the stored flag from local text)`);
        continue;
      }
      const row = judged.get(key);
      if (!row) { fails.push(`fixture ${c.id} ${arm}: expected to be judged and was not`); continue; }
      const lost = R.lost.some((x) => x.ack === c.ack && x.arm === arm);
      if (roles.includes("must-keep") && lost)
        fails.push(`fixture ${c.id} ${arm} (${f(inPop.ppl)} readers): a VERIFIED CORRECT yes was WITHDRAWN. ${c.verified}`);
      if (roles.includes("must-keep") && !lost && unexpected.some((x) => x.ack === c.ack && x.arm === arm))
        fails.push(`fixture ${c.id} ${arm}: internal inconsistency — reported unexpected-lost but not lost`);
      if ((roles.includes("denial") || roles.includes("subsequent-future")) && !lost)
        console.log(`  NOTE: fixture ${c.id} ${arm} is a KNOWN-WRONG published yes and this candidate still publishes it ` +
          `(role ${roles.join("+")}) — the defect is not fixed by this candidate`);
    }
  }
  for (const a of mustKeep) {
    const rows = [...R.held, ...R.quoteMoved, ...R.lost].filter((x) => x.ack === a);
    if (!rows.length) { fails.push(`--must-keep ${a}: NOT REACHED by this run (no text, not in the population, or untested) — the pin proves nothing`); continue; }
    for (const r of rows) if (R.lost.some((x) => x.ack === a && x.arm === r.arm))
      fails.push(`--must-keep ${a} ${r.arm} (${r.name}, ${f(r.ppl)} readers): withdrawn by the candidate`);
  }
  return fails;
}

/* ---------------------------------------------------------------------------
 * --selftest: prove the harness can FAIL, in all four ways
 * ------------------------------------------------------------------------- */
if (has("--selftest")) {
  let bad = 0;
  const mustThrow = async (label, fn) => {
    try { await fn(); console.log(`FAIL  ${label} — did not throw`); bad++; }
    catch (e) { console.log(`ok    ${label} — ${String(e.message).split("\n")[0].slice(0, 130)}`); }
  };
  console.log(`--- CONTROL 1/2: the inputs are pinned, and a missing one THROWS ---`);
  await mustThrow("--vs /nope/missing-extractor.mjs", () => loadExtractor("/nope/missing-extractor.mjs", "--vs"));
  await mustThrow("--vs no-such-ref-20261120", () => loadExtractor("no-such-ref-20261120", "--vs"));
  await mustThrow("--vs scripts/lib-schema.mjs (exists, exports no extractor)", () => loadExtractor("scripts/lib-schema.mjs", "--vs"));

  console.log(`\n--- CONTROL 2/2: the harness can SEE A LOSS ---`);
  console.log(`running the over-wide mutant veto as the candidate over the CACHED population + the fixtures`);
  const R = await runGate({
    baseSpec: "scripts/lib-4i.mjs", candSpec: "scripts/tax-flag-mutant.mjs",
    expectLoss: new Set(), mustKeep: [], headN: 200, sampleN: 600, quiet: false, download: false,
    cachedOnly: true,
  });
  const { unexpected } = report(R, new Set(), []);
  const target = FIX.cases.find((c) => c.id === "target");
  const hitTarget = unexpected.filter((x) => x.ack === target.ack);
  const judged = R.agree;
  console.log(`\nSELFTEST VERDICT`);
  /* THE THRESHOLDS ARE RELATIVE, because an absolute one measures the text
   * CACHE and not the harness: the first version demanded 25 lost arm-flags
   * and failed on a run that judged 35, which says nothing about whether the
   * gate can see a loss. A floor on the JUDGED count is what makes the rest
   * meaningful, and it names the fix (--download) rather than passing weakly. */
  const need = [
    [`the run judged enough published arm-flags to mean anything (>=60)`, judged >= 60,
      `${judged}${judged < 60 ? " — populate the text cache: node scripts/tax-flag-gate.mjs --vs HEAD --download" : ""}`],
    [`the mutant loses at least a fifth of them`, judged >= 60 && unexpected.length / judged >= 0.20,
      `${unexpected.length}/${judged} = ${judged ? (100 * unexpected.length / judged).toFixed(1) : "0"}%`],
    [`it loses at least 1,000,000 readers' worth`, sumPlans(unexpected) >= 1e6, f(sumPlans(unexpected))],
    [`Target Corporation's VERIFIED yes is among the losses on BOTH arms`, hitTarget.length === 2, hitTarget.map((x) => x.arm).join("+") || "none"],
    [`the gate's own pins fail on it`, pins(R, unexpected, []).length > 0, `${pins(R, unexpected, []).length} pin failure(s)`],
  ];
  for (const [label, ok, detail] of need) { console.log(`  ${ok ? "ok  " : "FAIL"}  ${label} — ${detail}`); if (!ok) bad++; }
  if (bad) { console.error(`\nSELFTEST FAILED (${bad}) — this gate's zeros mean nothing until it passes.`); process.exit(1); }
  console.log(`\nSELFTEST PASSED — a missing baseline throws, and a known-bad candidate is caught and named.`);
  process.exit(0);
}

/* ---------------------------------------------------------------------------
 * the normal path
 * ------------------------------------------------------------------------- */
const baseSpec = one("--vs", null);
if (!baseSpec) {
  console.error(`tax-flag-gate: --vs <ref|path> is required (the BEFORE extractor).\n` +
    `  e.g. node scripts/tax-flag-gate.mjs --vs origin/main --download\n` +
    `       node scripts/tax-flag-gate.mjs --selftest`);
  process.exit(2);
}
const expectLoss = new Set(many("--expect-loss"));
const lossFile = one("--expect-loss-file", null);
if (lossFile) for (const l of readFileSync(path.resolve(ROOT, lossFile), "utf8").split(/\s+/).filter(Boolean)) expectLoss.add(l);
const mustKeep = many("--must-keep");

const R = await runGate({ baseSpec, candSpec: one("--candidate", null), expectLoss, mustKeep,
  cachedOnly: has("--cached-only") });
const { unexpected } = report(R, expectLoss, mustKeep);
const fails = pins(R, unexpected, mustKeep);
if (unexpected.length) fails.push(`${unexpected.length} published arm-flag(s) / ${f(sumPlans(unexpected))} readers lost with no --expect-loss. Read every one against its filing before shipping.`);
if (fails.length) {
  console.error(`\nGATE FAILED:`);
  for (const x of fails) console.error(`  ${x}`);
  process.exit(1);
}
console.log(`\nGATE OK — 0 unexpected losses, ${FIX.cases.length} fixtures and ${mustKeep.length} --must-keep pins held.`);
