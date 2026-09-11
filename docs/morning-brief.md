# Morning brief — 2026-09-11

## The headline

**Five days of held runs ended yesterday. Everything is live.** The data store
and five accuracy fixes all reached the site, and the pipeline is healthy
again after a week in which three consecutive runs failed.

Nothing is waiting on a decision from me. Three things are waiting on you, and
the third one — where to point the parser next — I can now put real numbers
behind rather than an impression.

## What is live

`9bb4ba05` — the complete **v123** store. **60,089 fund menus**, up from
59,894, audit at its normal baseline, 99.9% of filings read, download failures
back to 0.10% from a peak of 16.7%.

Five fixes shipped with it, all of them things the site was **saying** that
were not true:

| what the page said | plans affected |
|---|---|
| "Match formula, as filed" over a sentence that wasn't one | **615 pages** |
| a fund table presented as if it were the whole plan | **533 pages** / 12.7M people |
| "we don't know what the employer contributes" when the filing says it | **116 pages** / 961k people |
| "plan frozen" for plans that are not frozen | **60 plans** / 482k people |
| a fund menu shown as the participant's choices when part is employer-directed | 44 pages |

And one thing it *wasn't* saying: **6,989 plans** got back the filed quote that
supports the formula shown above it.

## The week's real problem, and what it cost

Three runs in a row failed and I proposed **seven wrong explanations** before
finding the cause — a time limit, disk space, the government's file host, a
missing worker, memory, a temp-file leak, a killed shell. Every one was a guess
about infrastructure. The actual cause was two one-line programming errors, and
what found them was not a better theory but **making the program say what
happened**: the answer arrived in the first eight lines of the next run.

That is the week's expensive lesson, and the machinery now reflects it. Four
places that silently swallowed errors now report them; failures print where
they can actually be read; and an absent error code is treated as a claim in
its own right.

## Where I was wrong, on the record

I told you yesterday that **60% of our "frozen plan" warnings were false**.
That was my own bad inference and I corrected it within the hour. I had noticed
that 830 flagged plans also reported employer contributions and concluded the
warning must be wrong — but **a plan that closes in June still pays from
January to June.** The guard I built on that reasoning hid **750 genuine plan
terminations** to catch 80 false ones.

The real number is **60**. The honest fix reads the sentence rather than the
money, and the test case is a good one: Leggett & Platt's filing mentions "the
Hanes Retirement Plan was frozen" and we now reject it, while **Hanes' own
filing says "the Plan was frozen" and we keep it.** Same freeze, two filings,
opposite verdicts.

I had read eight filings, found eight false alarms, and generalised to 830.
The rule that would have caught it was already written down.

## The match gap, now measured instead of estimated

I wrote above that match is the largest open item. It still is. But two things
I said about it last night were guesses, and overnight I replaced both with
counts. **The shape of the work is different from what I told you.**

**It is not "one pattern away", and it is not a bug.** I fed every stored match
sentence to the parser on its own. If a sentence yields a formula in isolation,
the pattern already handles that phrasing and something in the filing defeated
it — that would be a defect, and I would fix it without asking. Random sample
of 120: **0 defects, 120 genuinely not covered.** So this is new capability,
not a repair, which is why it stays your call.

**It is also not "a long tail of phrasings".** Clustered by rate shape, **one
family is 59% of the workable set** — the ordinary "N% of" formula carrying an
awkward qualifier: a range ("100% of the first 4–5% of base compensation"), an
alternatives list ("5.5%, 7.5%, or 9.5% … depending on"), a bare cap with no
rate pair, a doubled unit ("25% percent … limited to 6 percent"). The classic
tiered "first/next" shape is only 29 plans, because that one already parses.

**And the honest split of the 13.5 million:**

| | plans | people | what it needs |
|---|---|---|---|
| we already hold a sentence stating a rate | **~1,634** | **~2.9M** | pattern work only, no downloads |
| we hold a sentence with no rate in it | 3,491 | 8.4M | a pipeline pass over the PDFs |
| we hold no match sentence at all | ~8,800 | — | the same pipeline pass |

The first row is a weekend's work with the evidence already on disk. The rest
needs a re-parse that captures the match-bearing sentence even when no formula
comes out of it.

One correction inside the correction: I first said 1,710 for that top row. **76
of them are not match language at all** — 60 are nonelective contributions
(PepsiCo's "Company non-matching contributions", NYU's "nonelective employer
contributions … at a rate of 5%"), 6 describe the employee's own deferral, 1
never says "match". A rate being present does not make a sentence a match.

## The other half of that decision: fund menus are nearly finished

When I put the menus-vs-match choice to you last night, I was comparing a
well-worked area against a big number. Overnight I measured the menus side
properly for the first time, and **it is smaller than it looks — most of what
remains is not ours to fix.**

The whole live fund-menu gap is now **1,461 plans, 1.11 million people**, down
from about 1,900. Opening the three largest groups:

- **The biggest group is 532 plans, and ~87% of it has nothing we could
  publish.** I read the extracted rows for a random 30: 43% is parse wreckage
  (`"@ Total non"`, a sponsor's own name where a fund should be), 30% are
  filings that genuinely report one asset-class total and no menu, 13% caught
  only the provider's name. **About 13% could yield a real short menu** — call
  it 70 plans, with wide error. The 3-row minimum we publish behind is the only
  thing keeping the wreckage off the site.
- **The two largest plans in the next group are correctly withheld.** MetLife
  (32,414 people, $8.3B) reports its participant money in a single line,
  "Participant-directed investments" — 99.5% of the plan — which the DOL
  permits. Alight's winning row is a bare `"CUSIP:"` at 92.6%. Publishing
  either would put a non-fund at the top of the page as if it were the fund.
- **Of the third group's 417 plans, 4 are ours.** The other 413 have no
  audited attachment in the public filing, or an attachment with no schedule.

**So the menus option is roughly a hundred plans; the match option is
millions of people.** That is not me deciding — it is the comparison you were
missing when I asked.

## Where I was wrong again, smaller this time

The gap table told me State Farm was still missing its menu. **It isn't** —
it publishes 20 Vanguard funds, 101,896 people, $19.0B. I had copied that line
forward one cycle earlier, in the same paragraph that warns to check whether
the example is still current, and it cost this morning a wasted investigation.
Copying a line forward is asserting it again.

## Shipped since this brief was written

Three things reached the live site during the day. All are on `main`.

**780,296 people stopped being told their filing was unreadable.** 52 plans —
Albertsons (236,172), Mars, Nestlé, Johnson Controls, Siemens, Schlumberger,
Genentech, Conagra, $89.3B between them — hold their money in a *master trust*,
a pooled fund shared across an employer's plans. Their own filings read
perfectly; the fund detail is in the trust's separate return. The page was
blaming the wrong document. It now says what is actually true, and says it
two different ways because there are two different truths: for 8 plans we
never matched the trust's return at all, and for 44 we found it and **it** is
the one with no readable fund list. Telling Albertsons we couldn't find its
trust would have replaced one false sentence with another.

No re-parse was needed — the evidence was already in the stored data.

**The smoke test was red for ten runs and nobody noticed**, from 2026-09-08.
Several of my own commits in that window say "tests green" — true locally,
never checked in CI. Both causes were my defects in the test itself, one of
them a hardcoded sandbox path that makes Node report a missing Python
interpreter, which sent the first reading of the failure at the wrong thing
entirely. Fixed; the first green run since the 8th. A red guard is worse than
no guard, because its name in the workflow implies coverage that isn't there.

**A state file that said `DO NOT MIRROR` was retired.** It had gone unmaintained
since August, described a cancelled run from three weeks ago, and a session
obeying it would have refused every mirror made today. Rewritten to ten keys
that can be verified. Stale documents here don't merely go unread — this one
was pointed at the mirror.

## What continues today

- Two plans publishing a menu that covers half their money, and one master
  trust that failed to read and will retry itself.
- The swap check that catches those two is now on `main`, so it runs on every
  scheduled build rather than only on mine.
- The fund-menu gap table has no undiagnosed entries left. The last one —
  31 plans whose holdings summed to more than the plan is worth — came back as
  OCR wreckage, asset-class labels and bare tickers, 12,688 people across 29
  plans. **Recorded, not fixed**: naming the cause is what the standing
  directive asks for; spending parser effort there against a 13.5-million-person
  match gap is not.

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages) — still the last
   blocker on "live".
2. **Custom domain DNS.**
3. **A decision I have deliberately not made for you:** whether to redirect
   effort from fund menus toward the match gap. Menus have had most of the
   parser work, and as of this morning I can tell you what is left of them:
   **~100 plans reachable, against ~1,360 that are correctly blank** (section
   above). Match affects six times as many people as the whole menu gap did.
   Concretely, three things you could say yes to independently:
   - **~1,634 plans / ~2.9M people, no downloads** — write patterns for the
     qualifier families above. Smallest, cheapest, entirely local.
   - **8.4M people, one re-parse** — store the match-bearing sentence even when
     no formula parses, the way we already store a reason when a fund menu
     fails to read. Costs a full re-parse (~1.5h of wall clock, no money).
   - **7.35M people on short-form filings**, whose pages show almost nothing
     today. Their audit attachment does not exist by law, but the form codes
     do: **83% state a match/after-tax code** we simply don't display.
