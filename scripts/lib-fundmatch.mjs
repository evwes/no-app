/* wampo — FILED FUND NAME -> REGISTERED TICKER, graded.
 *
 * WHY A SHARED MODULE. Two callers need this (`worklist-resolvable.mjs`
 * measures how much of the worklist it can name; `fund-facts-issuer.mjs` uses
 * it to pick a URL) and this record's standing rule is that a transcribed copy
 * of a predicate measures the transcription rather than the predicate. The
 * `tkExact`/`tkComparable` pair cost 1.11 coverage points for exactly that.
 *
 * WHAT IT IS NOT. It never CHOOSES a share class. `sec-funds.json` registers a
 * series with many classes and a filed name usually states none, so returning
 * one would be the owner-gated wrong-share-class defect arriving by a new
 * route. A multi-class series resolves to the SERIES with its classes listed,
 * and the caller decides whether that is enough.
 *
 * THE GRADES ARE SEPARATE AND ORDERED, weakest last, and a caller may refuse
 * the weak ones:
 *   "exact"   the filed name IS the registered series name, normalised
 *   "subset"  every filed token appears in exactly ONE series name
 *   "nearest" several series contain the filed tokens; the one with strictly
 *             fewest unexplained extra tokens wins. A TIE stays unresolved.
 *   null      the registry says nothing
 */
import { readFileSync } from "node:fs";

export const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/* `U.S.` NORMALISES TO TWO TOKENS and that alone cost a 3,773,459-reader name:
 * the registry writes `Fidelity U.S. Bond Index Fund`, filers write `Fidelity
 * US Bond Index Fund`, and a token test sees {U, S} against {US}. Adjacent
 * single-character tokens are welded, symmetrically on both sides -- a fact
 * about an abbreviation, not a guess about a fund. */
export const weld = (s) => s.replace(/\b([A-Z])(?:\s+([A-Z])\b)+/g, (m) => m.replace(/\s+/g, ""));
export const toks = (s) => new Set(weld(norm(s)).split(" ").filter(Boolean));

export function loadRegistry(file) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  /* THE SHAPE IS `{generated, source, count, funds: [...]}`. Reading it as a
   * bare array is what made `fund-facts-issuer.mjs` throw "is not iterable" on
   * its first loop, outside its try, so that script could never complete a
   * single run -- and a crash on line one looks exactly like a source that
   * answers nothing. Asserted here so it fails by name. */
  const rows = Array.isArray(raw) ? raw : raw.funds;
  if (!Array.isArray(rows)) {
    throw new Error(`${file}: expected a .funds array; got keys ${Object.keys(raw).join(",")}`);
  }
  const bySeries = new Map();
  for (const r of rows) {
    const series = String(r[0] || "").split("::").pop().trim();
    const tk = r[1];
    if (!series || !tk) continue;
    const k = norm(series);
    if (!bySeries.has(k)) bySeries.set(k, { series, classes: [] });
    bySeries.get(k).classes.push({ tk, cls: r[3] || "" });
  }
  const index = [...bySeries.keys()].map((k) => ({ k, t: toks(k) }));

  /* PINS. A broken index resolves NOTHING and that reads as a clean low number
   * rather than as a failure, so two families that must be present are
   * asserted before any caller sees a count. */
  for (const p of ["JPMORGAN SMARTRETIREMENT 2030 FUND", "FIDELITY 500 INDEX FUND"]) {
    if (!bySeries.has(p)) throw new Error(`${file}: index is wrong — no series "${p}"`);
  }
  return { bySeries, index, rows: rows.length };
}

export function resolve(reg, name, { minTokens = 3 } = {}) {
  const n = norm(name);
  const exact = reg.bySeries.get(n);
  if (exact) return { grade: "exact", ...exact };

  const t = toks(name);
  if (t.size < minTokens) return { grade: null, series: null, classes: [] };
  const cand = reg.index.filter(({ t: st }) => [...t].every((x) => st.has(x)));
  if (cand.length === 1) return { grade: "subset", ...reg.bySeries.get(cand[0].k) };
  if (cand.length > 1) {
    /* `Fidelity 500 Index` is a subset of both `Fidelity 500 Index Fund` and
     * `Fidelity SERIES 500 Index Fund`, and those are genuinely different funds
     * -- the Series ones exist inside Fidelity's target-date funds. So the
     * tie-break is the fewest unexplained extra tokens and it MUST be a strict
     * minimum: a tie at the minimum is still an unanswered question. */
    const scored = cand.map((c) => ({ c, extra: c.t.size - t.size }));
    const best = Math.min(...scored.map((s) => s.extra));
    const at = scored.filter((s) => s.extra === best);
    if (at.length === 1) return { grade: "nearest", extra: best, ...reg.bySeries.get(at[0].c.k) };
    return { grade: "ambiguous", series: null, classes: [], n: cand.length };
  }
  return { grade: null, series: null, classes: [] };
}

/* A ticker only where the series registers exactly ONE class, or where the
 * filed name states the class well enough to pick one. Deliberately strict:
 * returning a class the filing did not state is the recorded defect. */
export function tickerFor(hit, filedName) {
  if (!hit || !hit.classes || !hit.classes.length) return null;
  if (hit.classes.length === 1) return { tk: hit.classes[0].tk, why: "sole registered class" };
  const t = toks(filedName);
  const stated = hit.classes.filter((c) => {
    const ct = toks(c.cls);
    return ct.size > 0 && [...ct].every((x) => t.has(x));
  });
  if (stated.length === 1) return { tk: stated[0].tk, why: `filing states the class (${stated[0].cls})` };
  return null;
}
