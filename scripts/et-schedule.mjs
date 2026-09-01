#!/usr/bin/env node
/* wampo — Eastern time is the schedule's source of truth.
 *
 * OWNER DIRECTIVE 2026-09-01: "all time changes should be based on eastern
 * time". Every scheduler this project can reach — GitHub Actions cron and the
 * Routine cron alike — speaks UTC only. So an Eastern schedule written as a
 * fixed UTC cron is correct for about eight months and then silently wrong by
 * an hour for the other four, in whichever direction nobody is watching.
 *
 * That is not hypothetical for us: 07:00 UTC is 3:00 AM Eastern today and 2:00
 * AM Eastern from November 1, which would have quietly moved the nightly run
 * an hour earlier without a single error anywhere.
 *
 * This script is the one place that conversion lives. Run it to get the cron
 * for an Eastern hour, and to CHECK whether an existing cron still means what
 * it was written to mean:
 *
 *   node scripts/et-schedule.mjs 1            -> the cron for 1:00 AM Eastern
 *   node scripts/et-schedule.mjs 6 45         -> the cron for 6:45 AM Eastern
 *   node scripts/et-schedule.mjs --check 5 0 1 0
 *        -> "does cron 0 5 * * * still mean 1:00 AM Eastern?"
 *
 * Every scheduled session should run --check on its own trigger and correct
 * the cron when it has drifted, rather than waiting for someone to notice the
 * work is landing an hour early.
 */

const ET = "America/New_York";

function easternParts(d) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: ET, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).formatToParts(d);
  const g = (t) => f.find((p) => p.type === t)?.value;
  return { hour: +g("hour") % 24, minute: +g("minute"), abbr: g("timeZoneName"),
           date: `${g("year")}-${g("month")}-${g("day")}` };
}

// Eastern's UTC offset in hours right now (4 during EDT, 5 during EST)
function offsetHours(at = new Date()) {
  const p = easternParts(at);
  const utcH = at.getUTCHours() + at.getUTCMinutes() / 60;
  let etH = p.hour + p.minute / 60;
  let diff = utcH - etH;
  if (diff < -12) diff += 24;
  if (diff > 12) diff -= 24;
  return Math.round(diff);
}

// when does the current Eastern offset next change?
function nextTransition(from = new Date()) {
  const start = offsetHours(from);
  for (let i = 1; i <= 400; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    if (offsetHours(d) !== start) {
      // narrow to the hour
      let lo = new Date(d.getTime() - 86400000);
      for (let h = 1; h <= 24; h++) {
        const t = new Date(lo.getTime() + h * 3600000);
        if (offsetHours(t) !== start) return { at: t, from: start, to: offsetHours(t) };
      }
      return { at: d, from: start, to: offsetHours(d) };
    }
  }
  return null;
}

function cronFor(etHour, etMinute = 0, at = new Date()) {
  const off = offsetHours(at);
  const utcHour = (etHour + off + 24) % 24;
  const dayShift = etHour + off >= 24 ? " (next UTC day)" : etHour + off < 0 ? " (previous UTC day)" : "";
  return { cron: `${etMinute} ${utcHour} * * *`, utcHour, offset: off, dayShift };
}

const args = process.argv.slice(2);
const now = new Date();
const p = easternParts(now);
const off = offsetHours(now);
const tr = nextTransition(now);

if (args[0] === "--check") {
  const [cronH, cronM, wantH, wantM] = args.slice(1).map(Number);
  const meansET = ((cronH - off) % 24 + 24) % 24;
  const ok = meansET === wantH && (cronM || 0) === (wantM || 0);
  console.log(`cron "${cronM || 0} ${cronH} * * *" currently fires at ${String(meansET).padStart(2, "0")}:${String(cronM || 0).padStart(2, "0")} Eastern (${p.abbr})`);
  console.log(ok ? `OK — that is the intended ${String(wantH).padStart(2, "0")}:${String(wantM || 0).padStart(2, "0")} Eastern`
    : `DRIFTED — intended ${String(wantH).padStart(2, "0")}:${String(wantM || 0).padStart(2, "0")} Eastern. Correct it to: ${cronFor(wantH, wantM || 0).cron}`);
  process.exit(ok ? 0 : 1);
}

const h = args.length ? +args[0] : null;
const m = args.length > 1 ? +args[1] : 0;
console.log(`Eastern now: ${p.date} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ${p.abbr} (UTC-${off})`);
if (tr) {
  const tp = easternParts(tr.at);
  console.log(`Next offset change: ${tp.date} — Eastern goes to UTC-${tr.to}. EVERY Eastern-based cron must be re-derived then.`);
}
if (h === null) {
  console.log("\nUsage: node scripts/et-schedule.mjs <easternHour> [minute]   |   --check <cronHour> <cronMin> <wantEtHour> <wantEtMin>");
  console.log("\nCurrent wampo schedule, in Eastern:");
  for (const [label, hh, mm] of [["nightly data run", 1, 0], ["morning review brief", 6, 45]]) {
    const c = cronFor(hh, mm);
    console.log(`  ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} ET  ${label.padEnd(22)} cron "${c.cron}"${c.dayShift}`);
  }
  process.exit(0);
}
const c = cronFor(h, m);
console.log(`\n${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} Eastern  ->  cron "${c.cron}"  (${String(c.utcHour).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC)${c.dayShift}`);
