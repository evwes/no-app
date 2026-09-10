# Morning brief — 2026-09-10 (rewritten 05:30Z / 1:30 AM ET)

## The headline

**The live site gained nothing tonight, on purpose.** Three earlier mirrors
this week took confident lineups from 59,610 to **59,894** with zero losses,
and that is still what is live. Tonight's run is **not** being mirrored: it
would have handed back 31 real fund menus, one of them Lowe's, covering 295,951
people.

Chasing why turned up something more useful: **for thousands of filings we
recorded "the government withdrew this copy" when the copy is sitting there,
downloadable, right now.** That wrong label drove our own triage — it is how I
came to write a wrong cause into two documents — and a hedged version of it was
on 31 plan pages. Both fixed.

## What is live on main

`c130d250` — the complete **v117** store, 59,894 confident lineups, HIGH at the
known baseline of 4. v114+v115 (+123), v116 (+1) and v117 (+160) all mirrored
with zero losses. Nothing tonight has changed what a visitor sees.

## Tonight's run: one clear win, one blocker

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

## What actually happened to those 31 — and to 11,358 others

I reported last night that ~11,500 filings "failed to download" and that the
cause was open between v118's heavier load and a passing outage at the
government's file host. **Both are wrong**, and I want to be plain that this
was my error, repeated in two documents before it was caught.

Tonight's run failed on **exactly** the same 11,495 filings as the previous
one — the identical list, 100% overlap, not one difference either way. Nothing
transient repeats to the digit. So I went and fetched them: **twenty out of
twenty came back fine.** The files are there. Every stage of our reader then
ran cleanly over them on my machine.

Same story for the 31. Main gets Lowe's menu by running OCR over the plan's
prior-year filing; re-run by hand tonight, that took **ten seconds** and
produced the correct 31 funds. Nothing rejected it. The rescue simply never
ran, and the code caught the error and threw it away without recording it.

**Why nobody could have known.** Three things had to be wrong together: every
kind of failure was filed under the single label "download"; the real reason
was only ever written into an end-of-run summary; and in the mode the pipeline
actually runs in, the job exits *before* that summary prints. The reasons were
computed and discarded on every run we have ever done.

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

I have not yet found the underlying mechanism, and I am not going to guess at
it in this brief: four theories (a time limit, disk space, the file host,
a missing worker) are each ruled out by evidence. The run going now is
instrumented to say the answer outright.

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

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages) — still the blocker
   for "live".
2. **Custom domain DNS.**
3. Approval for the daily accuracy Routine. The hourly cycle is running and is
   what caught all of tonight's findings.

## Continuing

Run **#248** is going now with v121 and the new instrumentation. When it lands:
read the failure tallies it now prints, confirm the 31 come back, and mirror
only if the store is at least as complete as main's. Nothing is mirrored until
Lowe's has its fund menu again.
