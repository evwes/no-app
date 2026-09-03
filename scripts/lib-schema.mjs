/* wampo — the data stores, with field names that cannot be guessed wrong.
 *
 * WHY THIS EXISTS. Three separate wrong answers in one working session, all
 * with the identical shape: read a field by a name that sounds right, get
 * `undefined` back with no complaint, and report the resulting number as fact.
 *
 *   1. `plan.provider`  — the field is `recordkeeper`. Every plan looked like
 *      it was missing its recordkeeper, so a review list of the largest gaps
 *      led with Microsoft, Boeing, Bank of America and IBM. Population
 *      inflated 611 -> 15,024.
 *   2. `trust.confident` — mtias.json trust objects carry only ack, name,
 *      planYear and assetsEOY. Confidence lives in lineups-status.json. Every
 *      trust read as not-confident and $826.5B was filed under the wrong
 *      heading.
 *   3. `assetsEOY` of the PLAN passed to a harness parsing the TRUST — right
 *      field name, wrong record. parse4i returned found=false and three
 *      "experiments" measured nothing.
 *
 * Each was caught by a smell — a bucket that should not have been empty, a
 * population too uniform to be real — never by the code objecting. A typo that
 * silently yields `undefined` is indistinguishable from a real absence, which
 * is exactly the confusion the site exists to avoid making about filings.
 *
 * So: every read goes through a name that is checked against the store's own
 * header. An unknown name throws, loudly, at the first call rather than
 * showing up as a plausible number three steps later.
 *
 * Usage:
 *   import { loadPlans, loadStatus, loadTrusts } from "./lib-schema.mjs";
 *   const P = loadPlans();
 *   for (const r of P.rows) P.get(r, "recordkeeper");   // fine
 *   P.get(r, "provider");                                // throws, names the
 *                                                        // 36 real fields
 * Self-test: node scripts/lib-schema.mjs --selftest
 */
import { readFileSync } from "node:fs";

const near = (name, known) => {
  // cheap edit-distance-ish hint: shared prefix or substring, best first
  const n = name.toLowerCase();
  const hits = known.filter((k) => {
    const l = k.toLowerCase();
    return l.includes(n) || n.includes(l) || l.slice(0, 4) === n.slice(0, 4);
  });
  return hits.length ? `  Did you mean: ${hits.join(", ")}?` : "";
};

const bad = (store, name, known) => {
  throw new Error(
    `${store}: no field named "${name}".${near(name, known)}\n` +
    `  Known fields (${known.length}): ${known.join(", ")}`
  );
};

/* plans-all.json — array-of-arrays with a `fields` header. Positional, so a
 * wrong name is not just missing data, it is a wrong COLUMN if the caller
 * hardcodes an index. Always go through get(). */
export function loadPlans(path = "plans-all.json") {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const fields = raw.fields;
  const idx = new Map(fields.map((f, i) => [f, i]));

  const col = (name) => {
    const i = idx.get(name);
    if (i === undefined) bad("plans-all.json", name, fields);
    return i;
  };
  const get = (row, name) => row[col(name)];

  return {
    fields, rows: raw.plans, col, get,
    /* Row wrapper for readability in small scripts. Costs a closure per row,
     * so use get() in the 110k-row loops and this in reporting code. */
    wrap: (row) => new Proxy({}, {
      get: (_, name) => (typeof name === "string" ? row[col(name)] : undefined),
    }),
    byAck: () => new Map(raw.plans.map((r) => [r[col("ack")], r])),
  };
}

/* lineups-status.json — nested under .plans, keyed by ack. Reading the top
 * level as if it were the map is its own recurring mistake. */
/* dx/rw/rt added v106: the parser's own diagnosis, written at parse time so the
 * whole gap population carries a cause without re-downloading anything. */
export const STATUS_FIELDS = ["pv", "ov", "c", "s", "f", "e", "fb", "ffb", "tp", "ocr", "dx", "rw", "rt"];
export function loadStatus(path = "lineups-status.json") {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!raw.plans) throw new Error(`${path}: expected a .plans map; got keys ${Object.keys(raw).join(",")}`);
  const plans = raw.plans;
  return {
    plans, generated: raw.generated,
    /* strict read of one ack's status: unknown field name throws instead of
     * quietly reading as "not confident" / "no features". */
    at: (ack) => {
      const s = plans[ack];
      if (!s) return null;
      return new Proxy(s, {
        get: (t, name) => {
          if (typeof name !== "string" || name === "then") return t[name];
          if (!STATUS_FIELDS.includes(name)) bad("lineups-status entry", name, STATUS_FIELDS);
          return t[name];
        },
      });
    },
  };
}

/* mtias.json — trust objects are DELIBERATELY thin. Whether a trust's lineup
 * parsed confidently is not here and never has been; it is status[trust.ack].c
 * Asking a trust object for `confident` is the $826.5B bug, so it throws. */
export const TRUST_FIELDS = ["ack", "name", "planYear", "assetsEOY"];
export function loadTrusts(path = "mtias.json") {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const strict = (t) => new Proxy(t, {
    get: (o, name) => {
      if (typeof name !== "string" || name === "then") return o[name];
      if (!TRUST_FIELDS.includes(name)) {
        bad("mtias.json trust", name, TRUST_FIELDS.concat(
          ["(confidence is NOT here — read lineups-status.json at the trust's ack)"]));
      }
      return o[name];
    },
  });
  return {
    trusts: raw.trusts, count: raw.count,
    byAck: () => new Map(raw.trusts.map((t) => [t.ack, strict(t)])),
    strict,
  };
}

/* ---- self-test: the three real bugs must all throw ------------------------ */
if (process.argv[1] && process.argv[1].endsWith("lib-schema.mjs") && process.argv.includes("--selftest")) {
  let fails = 0;
  const mustThrow = (label, fn) => {
    try { fn(); console.log(`FAIL  ${label} — did not throw`); fails++; }
    catch (e) { console.log(`ok    ${label} — ${String(e.message).split("\n")[0]}`); }
  };
  const mustWork = (label, fn) => {
    try { const v = fn(); console.log(`ok    ${label} = ${JSON.stringify(v)}`); }
    catch (e) { console.log(`FAIL  ${label} — ${e.message}`); fails++; }
  };

  const P = loadPlans(), S = loadStatus(), T = loadTrusts();
  const row = P.rows[0];
  mustWork("plans.get(row,'recordkeeper')", () => P.get(row, "recordkeeper") ?? null);
  mustThrow("plans.get(row,'provider')", () => P.get(row, "provider"));
  mustThrow("plans.get(row,'assets')", () => P.get(row, "assets"));

  const trust = T.strict(T.trusts[0]);
  mustWork("trust.assetsEOY", () => trust.assetsEOY);
  mustThrow("trust.confident", () => trust.confident);

  const ack = P.get(row, "ack");
  mustWork("status.at(ack)?.c", () => (S.at(ack) ? S.at(ack).c ?? null : null));
  mustThrow("status.at(ack).confident", () => { const s = S.at(P.rows.find((r) => S.plans[P.get(r, "ack")]) ? P.get(P.rows.find((r) => S.plans[P.get(r, "ack")]), "ack") : ack); return s.confident; });

  console.log(fails ? `\n${fails} FAILED` : "\nall guards hold");
  process.exit(fails ? 1 : 0);
}
