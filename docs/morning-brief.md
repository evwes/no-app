# Morning brief — 2026-09-10 (updated 13:25Z / 9:25 AM ET)

## The headline

**Found it: one missing line of code has been silently skipping 11,366
filings — $548 billion and 9.7 million people — on every run since Tuesday.**
JPMorgan, CVS, Cisco, Eli Lilly, Broadcom and Stanford are all in it. The bug
is understood and the fix is verified.

**It has not landed yet.** Three attempts to re-read those filings have now
failed for a *different* reason — one that only happens on GitHub's machines,
not on mine. Details below. Nothing is broken for visitors: the live site is
untouched and still shows the good data from earlier in the week, and the
mirror script now physically refuses to publish anything worse.

## What is live on main

`c130d250` — the complete **v117** store, 59,894 confident lineups, HIGH at the
known baseline of 4. v114+v115 (+123), v116 (+1) and v117 (+160) all mirrored
with zero losses. Nothing tonight has changed what a visitor sees.

## The bug, in plain terms

When our reader cannot find a fund schedule in a filing, it returns "nothing
here" — and, reasonably, no list of funds. A check we run immediately
afterwards asks *how many funds are in that list*. Asking for the length of a
list that was never made crashes.

That was harmless for as long as we asked "did it find anything?" first. On
Tuesday a change reordered those two questions. Since then, **every filing
whose schedule we could not locate has crashed the reader**, been caught by a
catch-all handler, and been filed under the one label that handler knew:
"download failed". The filings downloaded perfectly. We just never looked at
them again.

**What it cost:** 11,366 filings skipped on each of three runs — $548.0B,
9,677,332 participants. And because the prior-year rescue path runs through the
same reader, it is also exactly what killed the 31 stored menus behind Lowe's
and Trane.

**The fix is one line**, and it guards the shape of the data rather than
trusting the caller, so the next person to use that check is safe too. Verified
by re-running the eight filings that were failing: no failures, and **five of
the eight now publish a full menu** — JPMorgan 80 funds, CVS 80, Stanford 65,
Broadcom 33, Anthem 6. Cisco and Lilly correctly stay withheld; Genentech
correctly stays "held in a master trust we cannot follow".

Worth saying how it was found, because it was not cleverness. I proposed four
explanations — a time limit, disk space, the government's file host, a missing
worker — and every one was refuted by evidence. All four were guesses about
infrastructure. What actually worked was making the program **say** what
happened: I split the error label and printed the reason in the mode the
pipeline really runs in. The answer arrived in the first eight lines of the
next run, naming the function and the line number.

## Tonight's earlier run: one clear win, one blocker

**The win — v119 worked.** Plans showing a match or vesting formula went
**62,637 → 63,509 (+872)**, and prior-year rescues nearly tripled (487 →
1,359). That is the class I reopened yesterday: 1.9 million people whose plan
page could not say what their employer contributes. It is the largest single
improvement in weeks.

**The blocker — 31 lineups.** The run also comes back missing 31 fund menus
that main still has: **$18.1B and 340,447 participants**, led by Lowe's
(295,951 people) and Trane. Net across everything the run is positive (+62
confident), but a net is the wrong test when one of the losses is a plan with
nearly 300,000 people in it. Held.

## Two things I got wrong first, on the record

I reported earlier that those filings "failed to download", and that the cause
was open between a load problem and an outage at the government's file host.
**Both were wrong**, and the wrong version went into two documents before it
was caught. What settled it: the failures repeated on *exactly* the same 11,495
filings, not one difference either way — nothing transient does that — and when
I fetched a sample, twenty of twenty came back fine.

**Why it stayed hidden so long.** Three things had to be wrong at once: every
kind of failure was filed under the single label "download"; the real reason
was only ever written into an end-of-run summary; and in the mode the pipeline
actually runs in, the job exits *before* that summary prints. The reasons were
computed and thrown away on every run we have ever done. All of that now
records and prints — which is how the real cause surfaced within minutes.

## Where that wrong label went — checked, and narrower than I first said

My first version of this brief said the label "reached readers". Checking
properly: the sentence *"the public copy has been withdrawn from the EFAST2
bucket"* lives in two **internal** review tools, not on the plan pages anyone
browses. They are committed to the public repo and they steered our own triage
— which is exactly how the wrong cause got written down and repeated — but no
visitor saw them.

What visitors do see is a weaker cousin of it, on **31 of our 5,062 plan
pages**: *"the filing's public copy could not be read (withdrawn from the
EFAST2 document bucket, or filed without readable notes)"*. It hedges, so it
was never flatly false — but it leads with the half we cannot support, and the
evidence points the other way. It now says only what is known: the copy carries
no readable audit notes.

Worth flagging how that one survived: the same sentence exists in two places,
the interactive report was corrected weeks ago, and the page generator kept a
stale copy and went on publishing it.

Genuine fetch failures keep the "withdrawn" wording, because for them it is
true. Everything else now says the gap is ours, and all four places that were
swallowing errors record them.

## v121, also shipped tonight: five small plans that showed nothing

Small employers often attach their recordkeeper's own statement instead of the
standard schedule, under a house title our reader had never been taught. Five
now publish — **$115.5M and 4,436 participants**, every figure verbatim from
the filing: Commercial Vehicle Group (2,483 people), Medical Device Components,
MPB Hotel, Atrium Consulting, Innovative Cosmetic.

**The more useful half is the title I did not ship.** A sixth was on the list
because an earlier read-through said it belonged. Running it showed it is not a
recordkeeper title at all — it is a heading inside an *adviser's pitch deck*,
printed in two columns with a chart beside the holdings. Our reader read the
chart, and published **"0.0 Median Market Cap" as a $1,097,571 holding** — 46%
of that plan's money — with totals plausible enough to pass every numeric
check. Only the nonsense names gave it away. Dropped, and pinned as a permanent
test. That same read-through had also written off Commercial Vehicle Group, the
biggest win in the group. Reading a filing and running the parser over it are
two different measurements; only the second one ships.

## The repair keeps failing, and I have stopped guessing why

Three runs (#249, #252, #253-in-progress) have tried to re-read the 11,400
skipped filings. The first two both died — not cleanly, and not with any
message I can reach.

I have now proposed and **refuted six explanations**: a time limit, disk space,
the government's file host, a missing worker, running out of memory, and a
temp-file leak. The last two I refuted by measuring rather than arguing —
memory sat flat at 645 MB and the scratch directory at 17 MB, neither growing.

Then I ran the *exact* same work on my own machine: **199 filings, 50 minutes,
no trouble**, where GitHub's machine gave up after about 50. Same code, same
filings, same ordering. So this is something about their environment, and six
theories were me filling a gap that better instrumentation closes outright.

**The real obstacle was that I could not read the error.** These logs are
430,000 lines and the tool I have returns only the last few dozen — which are
always upload chatter, never the failure. So the run now re-prints its own
failure at the *end*, where I can actually see it, and flags the exit code
separately. #253 is carrying that change.

Worth saying plainly: this has cost most of the morning and produced no visible
improvement to the site. What it has produced is a fixed bug, six eliminated
explanations, and a pipeline that will tell us the answer on its next failure
instead of a seventh guess.

## Since the brief was written (11:30 AM ET)

**The repair run is finally holding.** #254 carries both fixes and has been
running 73 minutes with all nineteen workers alive. Every previous attempt lost
workers between 13 and 44 minutes in, so it is well past the point where the
last four died. No verdict yet, and I am not watching it — the next cycle picks
it up.

**A second false claim found and fixed, this one on the public pages.** Our
plan pages print a heading "Match formula, as filed" above a sentence quoted
from the audit. **615 of the 5,000 pages printed that heading with no formula
behind it** — 269 of them (3.7 million participants) over a sentence containing
no number at all. Dollar Tree's page quoted *"They may select from among
several funds in which to invest their contributions, employer matching
contributions and profit-sharing contributions."* That is not a match formula.
Others quoted vesting schedules, accounting boilerplate, or eligibility rules.

The interactive report already refused those. **The rule existed in one file
and the page generator never got it** — which is the same failure as the
"withdrawn from the EFAST2 bucket" wording earlier today, in the same file, on
the same morning. So the rule now lives in one place, with sixteen real filings
pinned as tests and a check that runs *both* copies against them and fails if
they ever disagree.

**Measuring it first changed the fix, and that is the part worth your
attention.** Simply copying the existing rule across would have **deleted the
supporting quote from 8,120 plans that do have a formula** — because *"The
Company may elect to make discretionary matching contributions"* contains no
number, for the good reason that a discretionary match has none. The quote is
doing two different jobs and needs two different tests. Fixing that too:

- **6,989 plans (8.3M participants) get their evidence quote back.**
- **1,396 plans (3.4M participants) stop publishing a non-formula as the formula.**
- Pages with nothing usable now say so, instead of going quiet.

Calibrating it took four rounds, each one a random sample of what the rule was
throwing away, and each one caught real formulas being lost — a percentage
spelled out in words, a rate separated from its connector by a bracket, and a
dollar *total* being read as a rate. Not shipped until a sample of ten drops
contained no formula at all.

## Afternoon (1:10 PM ET) — the repair worked, and the last blocker is diagnosed

**#254 was the first clean full re-parse in three days.** Everything that had
been broken since Tuesday is fixed: the store is complete (99.9%), downloads
failed **64 times instead of 11,495**, no reader failures at all, and the audit
is back to its known baseline. Confident fund menus stand at 60,009 against
59,894 live.

**v119 paid off.** Plans whose contribution details had to be read from last
year's filing went **487 → 1,610**. That is the class I reopened yesterday:
people whose plan page could not say what their employer puts in.

**Still not published, for one reason: 31 fund menus.** Lowe's is the one that
matters — 295,951 people, $8.6 billion. The mirror script refuses, correctly.

**That is now diagnosed and fixed, and the diagnosis is worth one paragraph.**
Handed the filing the live site uses, **all 31 parse perfectly** under the same
code. So nothing was wrong with the filings or the reader. The cause: when a
plan's newest filing can't be read, we look up its previous one — and we were
only ever offering **one** previous filing. If that particular one is
unreadable, the plan gets nothing, even when an older filing sitting right
there works fine. We now offer up to three and stop at the first that works.
**Run #256 is carrying that fix.**

Two confident explanations died on the way, both to counts rather than
argument: that yesterday's change had broken the fallback (it hadn't — 1,061
plans still use it and 157 were *upgraded*), and that the data window had
rolled past 2023 (it hasn't).

**Two silent paths now speak.** A rescue that never runs and one that runs but
finds nothing usable left *identical* traces in our records — which is exactly
why this took a cycle to find. Both now say which happened.

**Also found and fixed, on the public pages:** 615 of our 5,000 plan pages
printed the heading *"Match formula, as filed"* over a sentence that wasn't a
match formula — 269 of them over a sentence with no number in it at all. Fixed,
with the rule now in one place and a test that fails if the two copies ever
disagree. Measuring before shipping mattered: the obvious fix would have
stripped the supporting quote from **8,120 plans that do have a formula**.

**One thing found and deliberately left:** two small plans (1,005 people) now
show a fund menu covering only about half their money. Nothing false — the
funds are real — but our checks can't currently see that kind of quiet
degradation. Written down with both examples and queued, not patched today,
because the file it belongs in is the one deciding whether #256 lands safely.

## Evening (4:45 PM ET) — it is live

**Everything from today is now on the live site.** Run #256 finished clean —
all twenty workers succeeded — and the mirror script accepted it without
argument: **195 fund menus gained, none lost.** The 31 that had blocked every
attempt since Tuesday are back, Lowe's among them.

Live now, all in one go:

- **60,089 fund menus**, up from 59,894, at the audit's normal baseline.
- **615 pages** stopped printing "Match formula, as filed" over a sentence that
  was not a formula; **6,989 plans** got their supporting quote back.
- **533 pages** now say when a fund table is not the whole plan — Boeing at
  78%, JPMorgan at 66%, where before the page simply showed the table.
- **116 pages** stopped saying we didn't know what the employer contributes
  when the filing plainly states it. Boeing's said "not stated" against **$1.42
  billion a year**.
- **830 plans** stopped being labelled frozen while they were still paying.

That last one is worth a moment. We were warning **63,466 Honeywell employees
that their plan had stopped contributing**, on the strength of a sentence that
actually reads *"a participant will become 100% vested in the event the Company
terminates or permanently discontinues contributions"* — the boilerplate clause
in nearly every plan document, describing something that has not happened.
Sixty percent of every plan we flagged this way was still paying. The page now
refuses the claim whenever the filing reports employer money, because a filed
dollar figure beats a sentence we matched with a pattern.

**What is still owed:** the underlying reader still mislabels those filings; the
site just no longer repeats it. That fix is written up and queued.

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages) — still the blocker
   for "live".
2. **Custom domain DNS.**
3. Approval for the daily accuracy Routine. The hourly cycle is running and is
   what caught all of tonight's findings.

## Continuing

**#254** is the run carrying both fixes (#253 died to the second one). When it
lands: confirm the 31 menus come back, check that JPMorgan and CVS publish, and
mirror only if the store is at least as complete as what is live. **Nothing is
mirrored until Lowe's has its fund menu again** — and as of this morning that
is enforced by a script, not by me remembering.

The quote-guard fix above is committed but **not live**: it reaches visitors
only when the next mirror happens, which is gated on that same run.
