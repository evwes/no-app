/* THE DISPLAY PATH, SLICED FROM app.js RATHER THAN TRANSCRIBED.
 *
 * Rebuilt 2026-10-01 because the previous copy lived in a session scratchpad
 * and a container restart wiped it — the third time that directory has been
 * cleared mid-session, and this file is the instrument every "what does a
 * reader see today" figure on this record goes through.
 *
 * SO IT LIVES IN THE REPO NOW, for the reason `gen-generic-twin.mjs` does: an
 * instrument the project's published numbers depend on is not a scratch file.
 * Losing it cost a cycle twice; rebuilding it is not free, and a rebuilt
 * harness is a NEW harness whose own defects have to be found again (this one
 * threw on any asterisked row until a positive control caught it).
 *
 * Usage:
 *   import { buildRenderer } from "./apppath.mjs";
 *   const R = buildRenderer();                       // the working tree
 *   const B = buildRenderer({ appjs: "/tmp/head/app.js" });   // the BEFORE
 *   const f = { ...row, nameRaw: row.name, name: R.clean(row.name) };
 *   R.renderRow(plan, f, "menu", menuTotal);  // { tk, er, star, shownType, … }
 *
 * ALWAYS run a POSITIVE CONTROL on both sides before trusting a count — a
 * harness that silently reaches no arm reports 0 and looks like good news.
 *
 * WHY IT SLICES. This record carries SEVEN incomplete transcriptions of
 * app.js expressions, each of which produced a published figure that was
 * wrong: the `er` chain missing three suppressors, `stockRow` missing the
 * `!mistypedStock` gate, `loanRow` missing two arms, the `tk` expression
 * itself. A transcription of a shipped expression rots as the expression
 * grows. So nothing here is retyped: the whole prologue of app.js's IIFE up
 * to `__wampoLookupTicker`, three named constants and THE PER-ROW BLOCK OF
 * `filedLineupTable` are all taken as SOURCE TEXT and evaluated.
 *
 * APPJS_PATH lets the BEFORE side load a different app.js (HEAD's), which is
 * the only honest way to measure a change: a before/after harness is only as
 * honest as its "before". Pair it with DISCLOSE_PATH for the same reason —
 * the canonical copy and its twin must both come from the same side.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;

function cut(src, head, tailMarker, what) {
  const a = src.indexOf(head);
  if (a < 0) throw new Error(`apppath: head not found (${what}): ${head.slice(0, 60)}`);
  const b = src.indexOf(tailMarker, a);
  if (b < 0) throw new Error(`apppath: tail not found (${what}): ${tailMarker.slice(0, 60)}`);
  return src.slice(a, b + tailMarker.length);
}

/* one whole line beginning with `head` */
function line(src, head, what) {
  const a = src.indexOf(head);
  if (a < 0) throw new Error(`apppath: line not found (${what}): ${head}`);
  const b = src.indexOf("\n", a);
  return src.slice(a, b);
}

export function buildRenderer(opts = {}) {
  const appPath = opts.appjs || process.env.APPJS_PATH || (ROOT + "app.js");
  const app = readFileSync(appPath, "utf8");
  const fundEr = readFileSync(opts.funder || process.env.FUNDER_PATH || (ROOT + "fund-er.js"), "utf8");

  /* (1) the prologue: everything from the IIFE's first statement through the
   * lookupTicker hook. That region holds cleanFiledName, the GENERATED twin
   * block (every lib-disclose suppressor), fundER's wrappers, fundERRow and
   * lookupTicker. */
  const prologue = cut(app, '  const $ = (id) => document.getElementById(id);',
    "  window.__wampoLookupTicker = lookupTicker;", "prologue");

  /* (2) three named things the per-row block needs that live after it */
  const tickerName = line(app, "  const TICKER_NAME = {", "TICKER_NAME");
  const sponsorIdx = cut(app, "  let _sponsorTickers = null;", "\n  }\n", "sponsorTickerIndex");
  const loanRowRe = line(app, "  const LOAN_ROW = ", "LOAN_ROW");

  /* (3) THE PER-ROW BLOCK, verbatim: every cell the page computes for one
   * holding, ending at `shownName`. The `return` template that follows is the
   * only thing not taken, and the cells it interpolates are all named here. */
  const rowBlock = cut(app, "      // a holding Schedule D reports as a collective trust is NOT the",
    '      const shownName = descLoanRow ? "Participant loans" : f.name;', "row block");

  const src = `
${fundEr}
const window = {};
const document = { getElementById: () => null };
let state = { plans: [], lineupTab: {} };
(() => {
  "use strict";
${prologue}
${tickerName}
${sponsorIdx}
${loanRowRe}
  globalThis.__renderRow = function (plan, f, tab, total) {
    /* filedLineupTable's own closure flag, set by the sliced block. Declared
     * here rather than left undeclared: the first version of this harness
     * threw only on rows where the asterisk fired, so every asterisked row
     * would have been absent from a measurement. */
    let starred = false;
${rowBlock}
    return { name: shownName, nameClean: f.name, tk, er, star, shownType,
      value: f.value, pct: total ? (f.value / total) * 100 : null,
      iss: f.iss || "", type: f.type || "",
      flags: { loanRow, descLoanRow, namelessRow, stockRow, mistypedStock,
        gicRow, subtotalRow, annuityRow, contractRow, noPublicPrice, brokRow,
        bankDepositFee, guaranteeOnlyFee, mistypedGuaranteeFee } };
  };
  globalThis.__clean = cleanFiledName;
  globalThis.__setPlans = (ps) => { state.plans = ps; _sponsorTickers = null; };
  globalThis.__hooks = window;
  /* The individual resolvers, for callers that need one cell rather than a row.
   * They are handed out from INSIDE this context so such a caller cannot reach
   * for a second slice of app.js to get them — which is how the superseded
   * scratchpad copy came to exist and to under-report. fundTickerInfo and
   * fundER are fund-er.js's, in scope here, and fundTickerInfo takes
   * (name, type): calling it with ONE argument is a fault this record carries
   * twice, once in audit-data's own ticker metrics. */
  globalThis.__fns = { lookupTicker, fundERRow, fundERFiled, issuerPricedER,
    cleanFiledName, fundER, fundTickerInfo };
})();
`;
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "apppath:" + appPath });
  return {
    renderRow: ctx.__renderRow, clean: ctx.__clean,
    setPlans: ctx.__setPlans, hooks: ctx.__hooks, fns: ctx.__fns,
  };
}
