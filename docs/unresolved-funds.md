# Unresolved funds — 2026-11-22

Of **1,781,297** fund rows wampo publishes, the resolver finds a ticker for
**824,618** and nothing for **956,679**. Those group into
**451,167** distinct name families — one per (filed name, issuer cell, filed type).

| bucket | families | rows | plans reached | readers | $ held | what it means |
|---|---:|---:|---:|---:|---:|---|
| **A — needs your guidance** | **277,443** | 621,581 | **57,201** | **96,555,093** | $1,790,722,410,427 | looks like a registered fund; a ticker probably exists and we cannot find it |
| B — no ticker by nature | 165,864 | 312,433 | 44,485 | 88,741,989 | $2,543,960,227,914 | collective trust, separate account, guaranteed option. A blank is correct — **do not spend time here** |
| C — not a fund | 1,885 | 10,834 | 9,925 | 40,615,821 | $538,742,926,596 | loans, employer stock, aggregates, captions |
| D — a single security | 5,975 | 11,831 | 8,414 | 27,395,528 | $245,379,733,921 | one Treasury, agency or corporate issue in a managed sleeve. No fund ticker exists — **do not spend time here** |

Readers are plan-deduplicated inside a bucket. A plan can appear in several
buckets, so the four do not sum to the universe and are not meant to.

### If this report looks unchanged since last week

That is a real answer, not a stalled one, and these two figures are how you
tell the difference:

- **Store rebuilt:** `2026-11-22T04:51:25.771Z` — **under a day old**
  The pipeline downloads the DOL extracts and rebuilds the plan file every
  run, so a recent stamp means it ran; a stale one means it did not.
- **Universe:** **115,641** plans, unchanged since **2026-11-02**.
  EFAST2 lands as discrete refreshes rather than a continuous feed, so between
  them this count — and every fund row under it — genuinely does not move.

A fresh stamp with an unmoved count is a quiet period. A stale stamp, or a
count that moves while these buckets do not, is a defect worth reporting.
(Trail consulted: 666 merge lines.)

The fee and the page's own type column were read by rendering the top
**2,500** families through the real page code. Below that the family is
listed with its filed type and no fee verdict — small enough that it was not
worth the render, and labelled rather than guessed.

## Worst first: unidentified **and** priced

These publish an expense ratio on a holding we cannot identify. That is the
worst cell on the site — a fee presented as fact on a fund we cannot name — so
they lead the list regardless of size.

| readers | plans | filed name | issuer cell | type shown | fee shown | $ held |
|---:|---:|---|---|---|---:|---:|
| 1,428,999 | 1 | `ANG SM VAL IDX INST` | — | Mutual fund | 0.1 | $356,712,000 |
| 1,156,158 | 406 | `American Funds EuroPacific Growth Fund` | — | Mutual fund | 0.46 | $1,745,737,315 |
| 832,690 | 368 | `CREF Money Market R2` | — | Cash / short-term | 0.2 | $726,656,611 |
| 801,725 | 51 | `Money market fund` | — | Cash / short-term | 0.2 | $48,221,691 |
| 704,530 | 237 | `FID EXTD MKT IDX` | — | Mutual fund | 0.1 | $1,802,009,741 |
| 632,171 | 237 | `EuroPacific Growth Fund` | `American Funds` | Mutual fund | 0.46 | $504,022,688 |
| 498,055 | 8 | `Vanguard Short-Term Inflation-Protected Sec. Idx Fund: Inst'l Sh` | — | Mutual fund | 0.1 | $221,395,574 |
| 487,172 | 650 | `American Funds New World Fund` | — | Mutual fund | 0.57 | $404,444,610 |
| 483,431 | 3 | `MFO LIFEPATH INDEX RETIREMENT FUND F` | — | — | 0.1 | $2,811,835,555 |
| 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2030 FUND F` | — | — | 0.09 | $1,690,818,622 |
| 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2035 FUND F` | — | — | 0.09 | $1,453,283,807 |
| 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2045 FUND F` | — | — | 0.09 | $1,319,457,881 |
| 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2040 FUND F` | — | — | 0.09 | $1,269,727,680 |
| 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2050 FUND F` | — | — | 0.09 | $1,177,209,133 |
| 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2055 FUND F` | — | — | 0.09 | $919,505,857 |
| 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2060 FUND F` | — | — | 0.09 | $539,798,041 |
| 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2065 FUN D F` | — | — | 0.09 | $105,189,330 |
| 480,051 | 2 | `MFO EQUITY INDEX FUND F` | — | — | 0.06 | $3,819,159,498 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2050 NL ` | — | Mutual fund | 0.1 | $1,135,354,171 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2055 NL ` | — | Mutual fund | 0.1 | $978,298,825 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2045 NL ` | — | Mutual fund | 0.1 | $915,480,783 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2040 NL ` | — | Mutual fund | 0.1 | $671,692,177 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2060 NL ` | — | Mutual fund | 0.1 | $646,064,498 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX RETIREME` | — | Mutual fund | 0.1 | $585,617,581 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2035 NL ` | — | Mutual fund | 0.1 | $566,934,953 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2030 NL ` | — | Mutual fund | 0.1 | $465,588,663 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2065 NL ` | — | Mutual fund | 0.1 | $346,595,659 |
| 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2070 NL ` | — | Mutual fund | 0.1 | $53,170,818 |
| 469,858 | 476 | `PIMCO Income Fund` | — | Mutual fund | 0.51 | $520,309,419 |
| 468,817 | 1 | `MFO BLACKROCK US DEBT INDEX F` | — | — | 0.03 | $1,469,018,249 |

## A — the worklist, by readers affected

| # | readers | plans | filed name | issuer cell | filed type | fee | $ held | example plan |
|---:|---:|---:|---|---|---|---:|---:|---|
| 1 | 1,996,659 | 1 | `Risk Balanced Commodities Strategy Fund` | — | Mutual fund | — | $140,422,564 | Walmart Inc. (710415188|003) |
| 2 | 1,996,659 | 1 | `Benchmark Mortgage Trust` | — | Corporate debt | — | $2,080,796 | Walmart Inc. (710415188|003) |
| 3 | 1,996,659 | 1 | `BX Commercial Mortgage Trust` | — | Corporate debt | — | $1,175,573 | Walmart Inc. (710415188|003) |
| 4 | 1,428,999 | 1 | `ANG SM VAL IDX INST` | — | Mutual fund | 0.1 | $356,712,000 | Amazon.Com Services, L (820544687|001) |
| 5 | 1,382,880 | 870 | `Fidelity Government` | — | Mutual fund | — | $907,091,284 | Whole Foods Market, In (741989366|002) |
| 6 | 1,156,158 | 406 | `American Funds EuroPacific Growth Fund` | — | Mutual fund | 0.46 | $1,745,737,315 | Allegis Group, Inc. (521304931|002) |
| 7 | 971,482 | 14 | `VISA INC COM CL A STK` | — | — | — | $193,818,163 | The Home Depot, Inc. (953261426|001) |
| 8 | 867,090 | 23 | `GE AEROSPACE` | — | — | — | $159,138,138 | The Boeing Co. And Con (910425694|002) |
| 9 | 832,690 | 368 | `CREF Money Market R2` | — | Cash / short-term | 0.2 | $726,656,611 | Beth Israel Lahey Heal (042103881|005) |
| 10 | 801,725 | 51 | `Money market fund` | — | Cash / short-term | 0.2 | $48,221,691 | Paychex Retirement Llc (853275179|001) |
| 11 | 704,530 | 237 | `FID EXTD MKT IDX` | — | Mutual fund | 0.1 | $1,802,009,741 | Mayo Clinic (416011702|002) |
| 12 | 702,937 | 38 | `DODGE & COX INT SK X` | — | Mutual fund | — | $741,000,990 | Providence Health & Se (510216586|010) |
| 13 | 676,274 | 2 | `MFO KROGER US LARGE CAP UNIT S` | — | — | — | $3,268,753,752 | The Kroger Co. (310345740|010) |
| 14 | 676,274 | 2 | `MFO KROGER NON US EQUITY UNIT Y` | — | — | — | $1,153,067,333 | The Kroger Co. (310345740|010) |
| 15 | 676,274 | 2 | `MFO KROGER CORE PLUS UNIT AD` | — | — | — | $998,281,260 | The Kroger Co. (310345740|010) |
| 16 | 676,274 | 2 | `MFO KROGER FIXED INCOME UNIT B` | — | — | — | $941,933,976 | The Kroger Co. (310345740|010) |
| 17 | 676,274 | 2 | `MFO KROGER US LARGE CAP UNIT X` | — | — | — | $930,179,096 | The Kroger Co. (310345740|010) |
| 18 | 676,274 | 2 | `MFO KROGER INT'L DEVELOPED UNIT M` | — | — | — | $827,980,878 | The Kroger Co. (310345740|010) |
| 19 | 676,274 | 2 | `MFO KROGER EMERGING MARKETS UNIT C` | — | — | — | $585,432,109 | The Kroger Co. (310345740|010) |
| 20 | 676,274 | 2 | `MFO US SMID CAP UNIT W` | — | — | — | $497,187,591 | The Kroger Co. (310345740|010) |
| 21 | 676,274 | 2 | `MFO KROGER SMID FUND UNIT AC` | — | — | — | $326,841,974 | The Kroger Co. (310345740|010) |
| 22 | 676,274 | 2 | `MFO KROGER TIP UNIT N` | — | — | — | $271,780,749 | The Kroger Co. (310345740|010) |
| 23 | 676,274 | 2 | `MFO KROGER CORE INFRA UNTI Z` | — | — | — | $190,915,420 | The Kroger Co. (310345740|010) |
| 24 | 676,274 | 2 | `MFO KROGER HIGH YIELD UNIT I` | — | — | — | $151,109,409 | The Kroger Co. (310345740|010) |
| 25 | 632,171 | 237 | `EuroPacific Growth Fund` | `American Funds` | Mutual fund | 0.46 | $504,022,688 | Futureplan Fiduciary S (823719843|334) |
| 26 | 578,757 | 282 | `Vanguard Treasury` | — | Mutual fund | — | $1,418,233,211 | Truist Financial Corpo (560939887|003) |
| 27 | 549,359 | 7 | `INSMED INC COM PAR $.01` | — | — | — | $23,177,602 | The Home Depot, Inc. (953261426|001) |
| 28 | 529,693 | 459 | `TIAA Traditional Benefit Responsive` | — | — | — | $1,864,858,353 | Wake Forest University (510190238|002) |
| 29 | 522,660 | 220 | `CREF Core Bond R2` | — | — | — | $490,886,385 | The Cooper Health Syst (210634462|003) |
| 30 | 498,055 | 8 | `Vanguard Short-Term Inflation-Protected Sec. Idx Fund: Inst'l Sh` | — | Mutual fund | 0.1 | $221,395,574 | Fedex Corporation (621721435|004) |
| 31 | 497,792 | 229 | `CREF Inflation-Linked Bond R2` | — | — | — | $339,423,108 | Wake Forest University (510190238|002) |
| 32 | 489,797 | 233 | `CREF Global Equities R2` | — | — | — | $1,506,488,244 | Wake Forest University (510190238|002) |
| 33 | 487,172 | 650 | `American Funds New World Fund` | — | Mutual fund | 0.57 | $404,444,610 | Sephora Usa Inc. (943322407|001) |
| 34 | 483,431 | 3 | `MFO LIFEPATH INDEX RETIREMENT FUND F` | — | — | 0.1 | $2,811,835,555 | The Home Depot, Inc. (953261426|001) |
| 35 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2030 FUND F` | — | — | 0.09 | $1,690,818,622 | The Home Depot, Inc. (953261426|001) |
| 36 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2035 FUND F` | — | — | 0.09 | $1,453,283,807 | The Home Depot, Inc. (953261426|001) |
| 37 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2045 FUND F` | — | — | 0.09 | $1,319,457,881 | The Home Depot, Inc. (953261426|001) |
| 38 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2040 FUND F` | — | — | 0.09 | $1,269,727,680 | The Home Depot, Inc. (953261426|001) |
| 39 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2050 FUND F` | — | — | 0.09 | $1,177,209,133 | The Home Depot, Inc. (953261426|001) |
| 40 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2055 FUND F` | — | — | 0.09 | $919,505,857 | The Home Depot, Inc. (953261426|001) |
| 41 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2060 FUND F` | — | — | 0.09 | $539,798,041 | The Home Depot, Inc. (953261426|001) |
| 42 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2065 FUN D F` | — | — | 0.09 | $105,189,330 | The Home Depot, Inc. (953261426|001) |
| 43 | 483,191 | 109 | `AMERICAN EUPAC FUND` | — | Mutual fund | — | $719,516,880 | Kelly Services, Inc (381510762|004) |
| 44 | 480,051 | 2 | `MFO EQUITY INDEX FUND F` | — | — | 0.06 | $3,819,159,498 | The Home Depot, Inc. (953261426|001) |
| 45 | 477,006 | 229 | `CREF Growth R2` | — | — | — | $1,979,075,191 | Wake Forest University (510190238|002) |
| 46 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2050 NL ` | — | Mutual fund | 0.1 | $1,135,354,171 | Target Corporation (410215170|002) |
| 47 | 473,741 | 1 | `SSGA TARGET CORPORATION COMMON STOCK FUND` | — | Company stock | — | $985,615,987 | Target Corporation (410215170|002) |
| 48 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2055 NL ` | — | Mutual fund | 0.1 | $978,298,825 | Target Corporation (410215170|002) |
| 49 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2045 NL ` | — | Mutual fund | 0.1 | $915,480,783 | Target Corporation (410215170|002) |
| 50 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2040 NL ` | — | Mutual fund | 0.1 | $671,692,177 | Target Corporation (410215170|002) |
| 51 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2060 NL ` | — | Mutual fund | 0.1 | $646,064,498 | Target Corporation (410215170|002) |
| 52 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX RETIREME` | — | Mutual fund | 0.1 | $585,617,581 | Target Corporation (410215170|002) |
| 53 | 473,741 | 1 | `BlackRock Institutional Trust Company, . EM NON LENDABLE FUND F` | — | Mutual fund | — | $569,597,713 | Target Corporation (410215170|002) |
| 54 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2035 NL ` | — | Mutual fund | 0.1 | $566,934,953 | Target Corporation (410215170|002) |
| 55 | 473,741 | 1 | `State Street Bank & Trust Company STATE STR BK + TR CO INVT FDS` | — | Mutual fund | — | $550,338,613 | Target Corporation (410215170|002) |
| 56 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2030 NL ` | — | Mutual fund | 0.1 | $465,588,663 | Target Corporation (410215170|002) |
| 57 | 473,741 | 1 | `STATE STR BK TR CO INVT` | — | Mutual fund | — | $358,173,084 | Target Corporation (410215170|002) |
| 58 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2065 NL ` | — | Mutual fund | 0.1 | $346,595,659 | Target Corporation (410215170|002) |
| 59 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2070 NL ` | — | Mutual fund | 0.1 | $53,170,818 | Target Corporation (410215170|002) |
| 60 | 473,741 | 1 | `SSGA SHORT TERM INVESTMENT FUND` | `Cash & Cash Equivalents 46,384` | Cash / short-term | — | $46,384,959 | Target Corporation (410215170|002) |
| 61 | 469,858 | 476 | `PIMCO Income Fund` | — | Mutual fund | 0.51 | $520,309,419 | Unifi Aviation, Llc (582198841|001) |
| 62 | 469,474 | 2 | `MFO DODGE & COX FDS STOCK FUND X` | — | — | — | $770,316,163 | The Home Depot, Inc. (953261426|001) |
| 63 | 469,339 | 3 | `BlackRock Multi-Asset Income Portfolio; Institutional Shares` | — | Mutual fund | — | $35,923,297 | Fedex Corporation (621721435|004) |
| 64 | 468,817 | 1 | `HOME DEPOT INC COM` | — | — | — | $1,483,803,933 | The Home Depot, Inc. (953261426|001) |
| 65 | 468,817 | 1 | `MFO BLACKROCK US DEBT INDEX F` | — | — | 0.03 | $1,469,018,249 | The Home Depot, Inc. (953261426|001) |
| 66 | 468,817 | 1 | `Other United States - USD &&&CHARLES SCHWAB SDA` | — | — | — | $454,815,768 | The Home Depot, Inc. (953261426|001) |
| 67 | 468,817 | 1 | `Denmark - USD #REORG/ASCENDIS PHARMA MANDATORY EXCHANGE ASCENDIS` | — | — | — | $37,060,259 | The Home Depot, Inc. (953261426|001) |
| 68 | 468,817 | 1 | `MFO T. ROWE PRICE CASH RESERVES TRUST-Z` | — | — | 0.2 | $13,087,234 | The Home Depot, Inc. (953261426|001) |
| 69 | 468,817 | 1 | `United States - USD &&&HD SUPPLY LOAN ASSET` | — | Participant loans — not a menu choice | — | $12,551,395 | The Home Depot, Inc. (953261426|001) |
| 70 | 468,817 | 1 | `MFO RESERVE INVT FDS INC T ROWE PRICE GOVT RESERVE FD` | — | — | — | $10,686,423 | The Home Depot, Inc. (953261426|001) |
| 71 | 468,817 | 1 | `PACKAGING CORP AMER COM ISIN` | — | — | — | $8,742,089 | The Home Depot, Inc. (953261426|001) |
| 72 | 468,817 | 1 | `GENEDX HOLDINGS CORP CL A NEW` | — | — | — | $5,877,411 | The Home Depot, Inc. (953261426|001) |
| 73 | 465,149 | 432 | `Vanguard Growth Index Fund` | — | Mutual fund | 0.05 | $3,304,549,744 | Cognizant Technology S (133924155|001) |
| 74 | 457,067 | 64 | `Fidelity Investments` | — | Mutual fund | — | $680,061,520 | Commonspirit Health (470617373|002) |
| 75 | 453,657 | 2 | `Self-managed accounts` | — | Brokerage window | — | $822,849,933 | Board Of Trustees Of T (951732075|003) |
| 76 | 451,730 | 1 | `Government Short Term Investment Fund` | — | Cash / short-term | — | $461,857,314 | Board Of Trustees Of T (951732075|003) |
| 77 | 451,730 | 1 | `2025.04030 BOARD OF TRUSTEES OF THE` | — | — | — | $20,396,691 | Board Of Trustees Of T (951732075|003) |
| 78 | 447,644 | 254 | `Vanguard International Growth Fund` | — | Mutual fund | 0.26 | $745,061,672 | Ernst & Young U.S. Llp (346565596|112) |
| 79 | 447,472 | 420 | `TIAA Traditional Non Benefit Responsive` | — | — | — | $5,379,440,099 | Wake Forest University (510190238|002) |
| 80 | 441,894 | 13 | `PENDING SETTLEMENT FUND` | — | — | — | $718,584 | Kelly Services, Inc (381510762|004) |
| 81 | 425,200 | 401 | `Securities and investment advisory services are offered through ` | — | Mutual fund | — | $1,815,056 | Wellspan Health (222517863|005) |
| 82 | 422,704 | 49 | `Mid Cap Growth Fund` | — | — | — | $22,288,452 | Express Services, Inc. (840909680|003) |
| 83 | 422,086 | 97 | `CREF Growth` | — | Mutual fund | — | $823,632,035 | The Mount Sinai Hospit (131624096|005) |
| 84 | 418,633 | 220 | `Vanguard Inflation-Protected Securities Fund` | — | Mutual fund | — | $414,658,731 | Indiana University Hea (351955872|005) |
| 85 | 413,271 | 66 | `DFA EMRG MKT CORE EQ` | — | Mutual fund | 0.3 | $181,213,766 | Public Partnerships Ll (043468852|001) |
| 86 | 408,241 | 107 | `Victory Sycamore Established Value` | — | Mutual fund | 0.55 | $277,975,448 | Upmc (251423657|335) |
| 87 | 407,708 | 171 | `CREF Responsible Balanced R2` | — | — | — | $842,475,132 | Wake Forest University (510190238|002) |
| 88 | 406,271 | 357 | `JPMorgan Large Cap Growth Fund` | — | Mutual fund | 0.44 | $1,780,713,478 | Hcl America Inc (770205035|001) |
| 89 | 394,855 | 1 | `Assets Participation interest in HCA Inc. Master Retirement Trus` | — | — | — | $21,406,890,948 | Hca Inc. (752497104|004) |
| 90 | 394,855 | 1 | `Securities lending cash collateral` | — | — | — | $403,015,980 | Hca Inc. (752497104|004) |
| 91 | 391,070 | 19 | `Short-Term Bond Index Fund` | `Vanguard` | — | 0.06 | $16,338,633 | Express Services, Inc. (840909680|003) |
| 92 | 390,614 | 287 | `Vanguard Equity Income Fund` | — | Mutual fund | 0.17 | $1,328,312,893 | Rocket Limited Partner (320628590|005) |
| 93 | 389,616 | 13 | `INTERNATIONAL FLAVORS & FRAGRA` | — | — | — | $23,090,281 | Marriott International (522055918|004) |
| 94 | 386,487 | 10 | `FABRINET` | — | — | — | $31,967,514 | Microsoft Corporation (911144442|001) |
| 95 | 385,619 | 161 | `American Funds EuroPacific Growth` | — | Mutual fund | 0.46 | $626,309,890 | T-Mobile Usa, Inc. (911983600|001) |
| 96 | 385,466 | 82 | `CREF Global Equities` | — | Mutual fund | — | $611,832,013 | The Mount Sinai Hospit (131624096|005) |
| 97 | 383,063 | 11 | `Retirement Conservative Fund` | `BOKF, NA` | — | — | $3,279,451 | Express Services, Inc. (840909680|003) |
| 98 | 381,443 | 10 | `Retirement 2030 Fund` | `BOKF, NA` | — | — | $25,118,126 | Express Services, Inc. (840909680|003) |
| 99 | 381,443 | 10 | `Retirement 2060 Fund` | `BOKF, NA` | — | — | $16,507,840 | Express Services, Inc. (840909680|003) |
| 100 | 381,443 | 10 | `Retirement 2020 Fund` | `BOKF, NA` | — | — | $9,726,921 | Express Services, Inc. (840909680|003) |
| 101 | 381,443 | 10 | `Retirement 2070 Fund` | `BOKF, NA` | — | — | $1,572,419 | Express Services, Inc. (840909680|003) |
| 102 | 381,138 | 9 | `Retirement 2050 Fund` | `BOKF, NA` | — | — | $31,821,706 | Express Services, Inc. (840909680|003) |
| 103 | 380,918 | 6 | `Genesis Fund` | `Neuberger Berman` | — | — | $3,243,825 | Express Services, Inc. (840909680|003) |
| 104 | 380,801 | 22 | `New World Fund Inc` | `American Funds` | Mutual fund | 0.57 | $24,142,978 | Futureplan Fiduciary S (823719843|334) |
| 105 | 380,659 | 9 | `Retirement 2040 Fund` | `BOKF, NA` | — | — | $32,961,268 | Express Services, Inc. (840909680|003) |
| 106 | 379,925 | 1 | `Vanguard Emerging Markets Index Fund` | — | Mutual fund | 0.1 | $826,086,925 | Cvs Health Corporation (050494040|017) |
| 107 | 379,925 | 1 | `Vanguard FTSE Social Index Fund` | `Socially Responsible Fund` | Mutual fund | 0.12 | $224,853,465 | Cvs Health Corporation (050494040|017) |
| 108 | 379,925 | 1 | `Vanguard Inflation-Protected Securities Fund` | `Inflation-Protected Bond Fund` | Mutual fund | — | $120,289,057 | Cvs Health Corporation (050494040|017) |
| 109 | 379,504 | 164 | `CREF S&P 500 Index R2` | — | — | 0.03 | $965,857,652 | Wake Forest University (510190238|002) |
| 110 | 377,490 | 81 | `NATIONAL FINANCIAL SERVICES` | — | — | — | $285,408,927 | Wellstar Health System (581649541|002) |
| 111 | 376,800 | 1 | `Large Cap Growth Fund` | `Winslow` | — | — | $231,440 | Express Services, Inc. (840909680|003) |
| 112 | 375,398 | 27 | `Capital World Bond Fund` | `American Funds` | Mutual fund | — | $5,904,737 | Futureplan Fiduciary S (823719843|334) |
| 113 | 372,006 | 55 | `Balanced Index Fund` | `Vanguard` | Mutual fund | 0.1 | $558,793,986 | Adp Totalsource Group, (592452823|001) |
| 114 | 370,513 | 403 | `American Funds New Perspective Fund` | — | Mutual fund | 0.4 | $597,467,323 | Molina Healthcare, Inc (134204626|001) |
| 115 | 368,776 | 61 | `C&S REAL ESTATE Z` | — | Mutual fund | — | $31,528,006 | Public Partnerships Ll (043468852|001) |
| 116 | 367,358 | 48 | `CREF Core Bond` | — | Mutual fund | — | $115,426,614 | The Mount Sinai Hospit (131624096|005) |
| 117 | 367,060 | 78 | `CREF Inflation-Linked Bond` | — | Mutual fund | — | $127,448,393 | The Mount Sinai Hospit (131624096|005) |
| 118 | 364,132 | 62 | `J H ENTERPRISE N` | — | Mutual fund | — | $193,937,231 | Public Partnerships Ll (043468852|001) |
| 119 | 362,554 | 3 | `UGI CORP NEW` | — | — | — | $5,732,808 | Walgreen Co. (361924025|001) |
| 120 | 362,050 | 419 | `Putnam Large Cap Value R6` | — | Mutual fund | — | $515,922,582 | Yale-New Haven Hospita (060646652|004) |
| 121 | 360,200 | 378 | `Voya Fixed Account` | — | — | — | $638,476,830 | Novant Health, Inc. (561376950|003) |
| 122 | 358,033 | 50 | `EXTERNAL FUND` | — | — | — | $274,255,000 | Comcast Corporation (270000798|001) |
| 123 | 356,536 | 9 | `GE HEALTHCARE TECHNOLOGIES INC WI` | — | — | — | $30,275,685 | Marriott International (522055918|004) |
| 124 | 355,513 | 377 | `American Funds 2030 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,060,084,805 | Barrett Business Servi (520812977|001) |
| 125 | 355,330 | 8 | `VANG TOT BD MK IS PL` | — | Mutual fund | 0.04 | $347,540,715 | Providence Health & Se (510216586|010) |
| 126 | 355,200 | 24 | `Washington Mutual` | `American Funds` | Mutual fund | 0.26 | $683,997,610 | Adp Totalsource Group, (592452823|001) |
| 127 | 353,335 | 375 | `American Funds 2040 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,208,769,472 | Barrett Business Servi (520812977|001) |
| 128 | 352,611 | 377 | `American Funds 2050 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,106,528,578 | Barrett Business Servi (520812977|001) |
| 129 | 350,934 | 108 | `OTHER ASSETS` | `SELF-DIRECT ACCT` | — | — | $2,837,541,253 | Accenture Llp (720542904|102) |
| 130 | 350,191 | 208 | `Dodge & Cox` | — | Mutual fund | — | $1,610,286,616 | Hyatt Corporation (941649123|005) |
| 131 | 347,193 | 369 | `American Funds 2035 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,196,278,088 | Barrett Business Servi (520812977|001) |
| 132 | 346,497 | 339 | `Vanguard Real Estate Index Fund` | — | Mutual fund | 0.13 | $414,513,405 | The Charles Schwab Cor (943025021|002) |
| 133 | 345,229 | 365 | `American Funds 2045 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,095,920,658 | Barrett Business Servi (520812977|001) |
| 134 | 343,545 | 256 | `PGIM High Yield Fund` | — | Mutual fund | — | $78,103,517 | Principal Life Insuran (420127290|334) |
| 135 | 343,444 | 289 | `Fidelity Freedom Index 2050 Fund` | — | Mutual fund | 0.12 | $2,442,616,402 | Stanford Health Care (946174066|002) |
| 136 | 342,880 | 283 | `Fidelity Freedom Index 2040 Fund` | — | Mutual fund | 0.12 | $2,180,100,002 | Stanford Health Care (946174066|002) |
| 137 | 342,649 | 282 | `Fidelity Freedom Index 2045 Fund` | — | Mutual fund | 0.12 | $2,292,391,219 | Stanford Health Care (946174066|002) |
| 138 | 342,425 | 51 | `FIDELITY FUND` | — | — | — | $491,258,179 | Comcast Corporation (270000798|001) |
| 139 | 342,384 | 360 | `American Funds 2055 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $827,490,631 | Barrett Business Servi (520812977|001) |
| 140 | 342,332 | 278 | `Fidelity Freedom Index 2055 Fund` | — | Mutual fund | 0.12 | $1,728,046,969 | Stanford Health Care (946174066|002) |
| 141 | 342,072 | 281 | `Fidelity Freedom Index 2035 Fund` | — | Mutual fund | 0.12 | $1,873,330,171 | Stanford Health Care (946174066|002) |
| 142 | 341,907 | 370 | `Vanguard Value Index Fund` | — | Mutual fund | 0.05 | $787,343,503 | Heartland Dental, Llc (010854205|001) |
| 143 | 341,424 | 360 | `American Funds 2060 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $502,875,133 | Barrett Business Servi (520812977|001) |
| 144 | 340,519 | 278 | `Fidelity Freedom Index 2060 Fund` | — | Mutual fund | 0.12 | $950,555,267 | Stanford Health Care (946174066|002) |
| 145 | 339,907 | 280 | `Fidelity Freedom Index 2030 Fund` | — | Mutual fund | 0.12 | $1,499,997,321 | Stanford Health Care (946174066|002) |
| 146 | 339,248 | 1 | `Mid Cap Fund` | `T. Rowe Price` | Mutual fund | — | $205,298,516 | Adp Totalsource Group, (592452823|001) |
| 147 | 339,248 | 1 | `Blackrock Money Market Fund` | — | Cash / short-term | 0.2 | $31,314,708 | Adp Totalsource Group, (592452823|001) |
| 148 | 339,231 | 268 | `Fidelity Freedom Index 2025 Fund` | — | Mutual fund | 0.12 | $845,866,705 | Stanford Health Care (946174066|002) |
| 149 | 337,383 | 274 | `Fidelity Freedom Index 2065 Fund` | — | Mutual fund | 0.12 | $265,908,038 | Stanford Health Care (946174066|002) |
| 150 | 336,886 | 370 | `TIAA Real Estate` | — | — | — | $668,353,261 | Wake Forest University (510190238|002) |

## What would help most

For any row above, the single most useful thing is **the ticker, or "no ticker
exists"** — a confirmed no is worth as much as a yes, because it lets the page
stop looking and say so.

Second most useful is **the full product name**, because most of these are a
filer's abbreviation of a real fund, and the full name is what lets the resolver
find it for every other plan that files the same abbreviation. One answer
usually fixes a whole family at once — the `plans` column is how many.

A fee or a return is only ever recorded with a source and an as-of date. If you
give a cost, the page needs where it came from, not just the number.

Edit `docs/unresolved-funds.csv` in place — it has `your_answer_ticker`,
`your_answer_full_name`, `no_ticker_exists` and `notes` columns — or reply with
the rows you know.
