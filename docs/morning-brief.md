# Morning brief — 2026-09-11

## The headline

**Five days of held runs ended yesterday. Everything is live.** The data store
and five accuracy fixes all reached the site, and the pipeline is healthy
again after a week in which three consecutive runs failed.

Nothing is waiting on a decision from me. Two things are waiting on you.

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

## What continues today

- **The match gap is the largest open item and it is ours, not the filings'.**
  8,672 live plans covering **13.5 million people** have employer money flowing
  and no formula shown — roughly six times the fund-menu gap. Their audit notes
  are readable; we're just not catching the sentence. Costco and Tyson were
  checked by hand and each uses a phrasing we don't recognise, which argues a
  long tail rather than one missing pattern.
- Smaller: two plans publishing a menu that covers half their money, and one
  master trust that failed to read and will retry itself.

## Waiting on you

1. **GitHub Pages must serve `main`** (Settings → Pages) — still the last
   blocker on "live".
2. **Custom domain DNS.**
3. **A decision I have deliberately not made for you:** whether to redirect
   effort from fund menus toward the match gap. Menus have had most of the
   parser work; match affects six times as many people. I can also surface the
   form-level codes we already hold for the 43,523 short-form filers — 7.35
   million people whose pages currently show almost nothing, where **83% of
   filings state a match/after-tax code** we simply don't display.
