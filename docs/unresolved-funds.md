# Unresolved funds — 2026-11-08

Of **1,775,956** fund rows wampo publishes, the resolver finds a ticker for
**795,814** and nothing for **980,142**. Those group into
**460,191** distinct name families — one per (filed name, issuer cell, filed type).

| bucket | families | rows | plans reached | readers | $ held | what it means |
|---|---:|---:|---:|---:|---:|---|
| **A — needs your guidance** | **287,472** | 647,906 | **57,405** | **95,580,614** | $1,826,806,546,077 | looks like a registered fund; a ticker probably exists and we cannot find it |
| B — no ticker by nature | 164,816 | 309,435 | 44,140 | 87,906,726 | $2,500,968,342,954 | collective trust, separate account, guaranteed option. A blank is correct — **do not spend time here** |
| C — not a fund | 1,884 | 10,901 | 9,945 | 40,546,781 | $526,622,763,378 | loans, employer stock, aggregates, captions |
| D — a single security | 6,019 | 11,900 | 8,443 | 27,152,205 | $242,097,770,332 | one Treasury, agency or corporate issue in a managed sleeve. No fund ticker exists — **do not spend time here** |

Readers are plan-deduplicated inside a bucket. A plan can appear in several
buckets, so the four do not sum to the universe and are not meant to.

### If this report looks unchanged since last week

That is a real answer, not a stalled one, and these two figures are how you
tell the difference:

- **Store rebuilt:** `2026-11-08T11:56:45.021Z` — **under a day old**
  The pipeline downloads the DOL extracts and rebuilds the plan file every
  run, so a recent stamp means it ran; a stale one means it did not.
- **Universe:** **115,641** plans, unchanged since **2026-11-02**.
  EFAST2 lands as discrete refreshes rather than a continuous feed, so between
  them this count — and every fund row under it — genuinely does not move.

A fresh stamp with an unmoved count is a quiet period. A stale stamp, or a
count that moves while these buckets do not, is a defect worth reporting.
(Trail consulted: 610 merge lines.)

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
| 1,161,175 | 413 | `American Funds EuroPacific Growth Fund` | — | Mutual fund | 0.46 | $1,732,299,506 |
| 825,947 | 365 | `CREF Money Market R2` | — | Cash / short-term | 0.2 | $715,610,566 |
| 809,628 | 62 | `Money market fund` | — | Cash / short-term | 0.2 | $51,783,148 |
| 661,727 | 236 | `FID EXTD MKT IDX` | — | Mutual fund | 0.1 | $1,721,597,981 |
| 656,804 | 246 | `EuroPacific Growth Fund` | `American Funds` | Mutual fund | 0.46 | $661,794,827 |
| 498,055 | 8 | `Vanguard Short-Term Inflation-Protected Sec. Idx Fund: Inst'l Sh` | — | Mutual fund | 0.1 | $221,395,574 |
| 489,534 | 647 | `American Funds New World Fund` | — | Mutual fund | 0.57 | $395,759,163 |
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
| 468,817 | 1 | `MFO BLACKROCK US DEBT INDEX F` | — | — | 0.03 | $1,469,018,249 |
| 468,817 | 1 | `MFO T. ROWE PRICE CASH RESERVES TRUST-Z` | — | — | 0.2 | $13,087,234 |

## A — the worklist, by readers affected

| # | readers | plans | filed name | issuer cell | filed type | fee | $ held | example plan |
|---:|---:|---:|---|---|---|---:|---:|---|
| 1 | 1,996,659 | 1 | `Risk Balanced Commodities Strategy Fund` | — | Mutual fund | — | $140,422,564 | Walmart Inc. (710415188|003) |
| 2 | 1,996,659 | 1 | `Benchmark Mortgage Trust` | — | Corporate debt | — | $2,080,796 | Walmart Inc. (710415188|003) |
| 3 | 1,996,659 | 1 | `BX Commercial Mortgage Trust` | — | Corporate debt | — | $1,175,573 | Walmart Inc. (710415188|003) |
| 4 | 1,465,555 | 854 | `Fidelity Government` | — | Mutual fund | — | $883,025,412 | Whole Foods Market, In (741989366|002) |
| 5 | 1,428,999 | 1 | `ANG SM VAL IDX INST` | — | Mutual fund | 0.1 | $356,712,000 | Amazon.Com Services, L (820544687|001) |
| 6 | 1,161,175 | 413 | `American Funds EuroPacific Growth Fund` | — | Mutual fund | 0.46 | $1,732,299,506 | Allegis Group, Inc. (521304931|002) |
| 7 | 979,527 | 15 | `VISA INC COM CL A STK` | — | — | — | $198,646,622 | The Home Depot, Inc. (953261426|001) |
| 8 | 835,996 | 23 | `GE AEROSPACE` | — | — | — | $148,157,476 | The Boeing Co. And Con (910425694|002) |
| 9 | 825,947 | 365 | `CREF Money Market R2` | — | Cash / short-term | 0.2 | $715,610,566 | Beth Israel Lahey Heal (042103881|005) |
| 10 | 809,628 | 62 | `Money market fund` | — | Cash / short-term | 0.2 | $51,783,148 | Paychex Retirement Llc (853275179|001) |
| 11 | 702,937 | 38 | `DODGE & COX INT SK X` | — | Mutual fund | — | $741,000,990 | Providence Health & Se (510216586|010) |
| 12 | 661,727 | 236 | `FID EXTD MKT IDX` | — | Mutual fund | 0.1 | $1,721,597,981 | Mayo Clinic (416011702|002) |
| 13 | 656,804 | 246 | `EuroPacific Growth Fund` | `American Funds` | Mutual fund | 0.46 | $661,794,827 | Futureplan Fiduciary S (823719843|334) |
| 14 | 585,810 | 283 | `Vanguard Treasury` | — | Mutual fund | — | $1,422,621,437 | Truist Financial Corpo (560939887|003) |
| 15 | 541,314 | 6 | `INSMED INC COM PAR $.01` | — | — | — | $18,718,175 | The Home Depot, Inc. (953261426|001) |
| 16 | 536,094 | 457 | `TIAA Traditional Benefit Responsive` | — | — | — | $1,907,963,871 | Wake Forest University (510190238|002) |
| 17 | 515,622 | 217 | `CREF Core Bond R2` | — | — | — | $481,819,315 | The Cooper Health Syst (210634462|003) |
| 18 | 498,055 | 8 | `Vanguard Short-Term Inflation-Protected Sec. Idx Fund: Inst'l Sh` | — | Mutual fund | 0.1 | $221,395,574 | Fedex Corporation (621721435|004) |
| 19 | 491,639 | 227 | `CREF Inflation-Linked Bond R2` | — | — | — | $331,276,492 | Wake Forest University (510190238|002) |
| 20 | 489,534 | 647 | `American Funds New World Fund` | — | Mutual fund | 0.57 | $395,759,163 | Sephora Usa Inc. (943322407|001) |
| 21 | 483,644 | 231 | `CREF Global Equities R2` | — | — | — | $1,471,607,642 | Wake Forest University (510190238|002) |
| 22 | 483,431 | 3 | `MFO LIFEPATH INDEX RETIREMENT FUND F` | — | — | 0.1 | $2,811,835,555 | The Home Depot, Inc. (953261426|001) |
| 23 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2030 FUND F` | — | — | 0.09 | $1,690,818,622 | The Home Depot, Inc. (953261426|001) |
| 24 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2035 FUND F` | — | — | 0.09 | $1,453,283,807 | The Home Depot, Inc. (953261426|001) |
| 25 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2045 FUND F` | — | — | 0.09 | $1,319,457,881 | The Home Depot, Inc. (953261426|001) |
| 26 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2040 FUND F` | — | — | 0.09 | $1,269,727,680 | The Home Depot, Inc. (953261426|001) |
| 27 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2050 FUND F` | — | — | 0.09 | $1,177,209,133 | The Home Depot, Inc. (953261426|001) |
| 28 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2055 FUND F` | — | — | 0.09 | $919,505,857 | The Home Depot, Inc. (953261426|001) |
| 29 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2060 FUND F` | — | — | 0.09 | $539,798,041 | The Home Depot, Inc. (953261426|001) |
| 30 | 483,431 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2065 FUN D F` | — | — | 0.09 | $105,189,330 | The Home Depot, Inc. (953261426|001) |
| 31 | 480,051 | 2 | `MFO EQUITY INDEX FUND F` | — | — | 0.06 | $3,819,159,498 | The Home Depot, Inc. (953261426|001) |
| 32 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2050 NL ` | — | Mutual fund | 0.1 | $1,135,354,171 | Target Corporation (410215170|002) |
| 33 | 473,741 | 1 | `SSGA TARGET CORPORATION COMMON STOCK FUND` | — | Company stock | — | $985,615,987 | Target Corporation (410215170|002) |
| 34 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2055 NL ` | — | Mutual fund | 0.1 | $978,298,825 | Target Corporation (410215170|002) |
| 35 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2045 NL ` | — | Mutual fund | 0.1 | $915,480,783 | Target Corporation (410215170|002) |
| 36 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2040 NL ` | — | Mutual fund | 0.1 | $671,692,177 | Target Corporation (410215170|002) |
| 37 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2060 NL ` | — | Mutual fund | 0.1 | $646,064,498 | Target Corporation (410215170|002) |
| 38 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX RETIREME` | — | Mutual fund | 0.1 | $585,617,581 | Target Corporation (410215170|002) |
| 39 | 473,741 | 1 | `BlackRock Institutional Trust Company, . EM NON LENDABLE FUND F` | — | Mutual fund | — | $569,597,713 | Target Corporation (410215170|002) |
| 40 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2035 NL ` | — | Mutual fund | 0.1 | $566,934,953 | Target Corporation (410215170|002) |
| 41 | 473,741 | 1 | `State Street Bank & Trust Company STATE STR BK + TR CO INVT FDS` | — | Mutual fund | — | $550,338,613 | Target Corporation (410215170|002) |
| 42 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2030 NL ` | — | Mutual fund | 0.1 | $465,588,663 | Target Corporation (410215170|002) |
| 43 | 473,741 | 1 | `STATE STR BK TR CO INVT` | — | Mutual fund | — | $358,173,084 | Target Corporation (410215170|002) |
| 44 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2065 NL ` | — | Mutual fund | 0.1 | $346,595,659 | Target Corporation (410215170|002) |
| 45 | 473,741 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2070 NL ` | — | Mutual fund | 0.1 | $53,170,818 | Target Corporation (410215170|002) |
| 46 | 473,741 | 1 | `SSGA SHORT TERM INVESTMENT FUND` | `Cash & Cash Equivalents 46,384` | Cash / short-term | — | $46,384,959 | Target Corporation (410215170|002) |
| 47 | 470,853 | 227 | `CREF Growth R2` | — | — | — | $1,942,532,365 | Wake Forest University (510190238|002) |
| 48 | 469,474 | 2 | `MFO DODGE & COX FDS STOCK FUND X` | — | — | — | $770,316,163 | The Home Depot, Inc. (953261426|001) |
| 49 | 469,339 | 3 | `BlackRock Multi-Asset Income Portfolio; Institutional Shares` | — | Mutual fund | — | $35,923,297 | Fedex Corporation (621721435|004) |
| 50 | 468,817 | 1 | `HOME DEPOT INC COM` | — | — | — | $1,483,803,933 | The Home Depot, Inc. (953261426|001) |
| 51 | 468,817 | 1 | `MFO BLACKROCK US DEBT INDEX F` | — | — | 0.03 | $1,469,018,249 | The Home Depot, Inc. (953261426|001) |
| 52 | 468,817 | 1 | `Other United States - USD &&&CHARLES SCHWAB SDA` | — | — | — | $454,815,768 | The Home Depot, Inc. (953261426|001) |
| 53 | 468,817 | 1 | `Denmark - USD #REORG/ASCENDIS PHARMA MANDATORY EXCHANGE ASCENDIS` | — | — | — | $37,060,259 | The Home Depot, Inc. (953261426|001) |
| 54 | 468,817 | 1 | `MFO T. ROWE PRICE CASH RESERVES TRUST-Z` | — | — | 0.2 | $13,087,234 | The Home Depot, Inc. (953261426|001) |
| 55 | 468,817 | 1 | `United States - USD &&&HD SUPPLY LOAN ASSET` | — | Participant loans — not a menu choice | — | $12,551,395 | The Home Depot, Inc. (953261426|001) |
| 56 | 468,817 | 1 | `MFO RESERVE INVT FDS INC T ROWE PRICE GOVT RESERVE FD` | — | — | — | $10,686,423 | The Home Depot, Inc. (953261426|001) |
| 57 | 468,817 | 1 | `PACKAGING CORP AMER COM ISIN` | — | — | — | $8,742,089 | The Home Depot, Inc. (953261426|001) |
| 58 | 468,817 | 1 | `GENEDX HOLDINGS CORP CL A NEW` | — | — | — | $5,877,411 | The Home Depot, Inc. (953261426|001) |
| 59 | 463,540 | 436 | `Vanguard Growth Index Fund` | — | Mutual fund | 0.05 | $3,136,777,806 | Cognizant Technology S (133924155|001) |
| 60 | 460,561 | 66 | `Fidelity Investments` | — | Mutual fund | — | $681,233,450 | Commonspirit Health (470617373|002) |
| 61 | 454,544 | 422 | `TIAA Traditional Non Benefit Responsive` | — | — | — | $5,514,855,677 | Wake Forest University (510190238|002) |
| 62 | 453,657 | 2 | `Self-managed accounts` | — | Brokerage window | — | $822,849,933 | Board Of Trustees Of T (951732075|003) |
| 63 | 451,730 | 1 | `Government Short Term Investment Fund` | — | Cash / short-term | — | $461,857,314 | Board Of Trustees Of T (951732075|003) |
| 64 | 451,730 | 1 | `2025.04030 BOARD OF TRUSTEES OF THE` | — | — | — | $20,396,691 | Board Of Trustees Of T (951732075|003) |
| 65 | 442,622 | 248 | `Vanguard International Growth Fund` | — | Mutual fund | 0.26 | $720,104,089 | Ernst & Young U.S. Llp (346565596|112) |
| 66 | 440,695 | 100 | `AMERICAN EUPAC FUND` | — | Mutual fund | — | $553,592,770 | Kelly Services, Inc (381510762|004) |
| 67 | 437,577 | 12 | `PENDING SETTLEMENT FUND` | — | — | — | $682,395 | Kelly Services, Inc (381510762|004) |
| 68 | 432,664 | 97 | `CREF Growth` | — | Mutual fund | — | $834,174,714 | The Mount Sinai Hospit (131624096|005) |
| 69 | 426,778 | 471 | `PIMCO Income Fund` | — | Mutual fund | 0.51 | $516,845,082 | Sap America, Inc. (363556041|001) |
| 70 | 424,109 | 50 | `Mid Cap Growth Fund` | — | — | — | $23,798,410 | Express Services, Inc. (840909680|003) |
| 71 | 418,961 | 221 | `Vanguard Inflation-Protected Securities Fund` | — | Mutual fund | — | $414,514,801 | Indiana University Hea (351955872|005) |
| 72 | 413,271 | 66 | `DFA EMRG MKT CORE EQ` | — | Mutual fund | 0.3 | $181,213,766 | Public Partnerships Ll (043468852|001) |
| 73 | 409,275 | 300 | `PGIM High Yield R6` | — | Mutual fund | — | $140,225,841 | Oasis Outsourcing Hold (650731524|333) |
| 74 | 402,436 | 389 | `PGIM Total Return Bond R6` | — | Mutual fund | — | $456,232,196 | Johns Hopkins Universi (520595110|003) |
| 75 | 399,699 | 349 | `JPMorgan Large Cap Growth Fund` | — | Mutual fund | 0.44 | $1,748,755,916 | Hcl America Inc (770205035|001) |
| 76 | 397,005 | 369 | `Vanguard Value Index Fund` | — | Mutual fund | 0.05 | $915,792,734 | Cognizant Technology S (133924155|001) |
| 77 | 396,044 | 82 | `CREF Global Equities` | — | Mutual fund | — | $612,346,775 | The Mount Sinai Hospit (131624096|005) |
| 78 | 394,855 | 1 | `Assets Participation interest in HCA Inc. Master Retirement Trus` | — | — | — | $21,406,890,948 | Hca Inc. (752497104|004) |
| 79 | 394,855 | 1 | `Securities lending cash collateral` | — | — | — | $403,015,980 | Hca Inc. (752497104|004) |
| 80 | 391,070 | 19 | `Short-Term Bond Index Fund` | `Vanguard` | — | 0.06 | $16,309,037 | Express Services, Inc. (840909680|003) |
| 81 | 389,616 | 13 | `INTERNATIONAL FLAVORS & FRAGRA` | — | — | — | $23,090,281 | Marriott International (522055918|004) |
| 82 | 387,901 | 83 | `NATIONAL FINANCIAL SERVICES` | — | — | — | $292,456,061 | Wellstar Health System (581649541|002) |
| 83 | 387,877 | 166 | `American Funds EuroPacific Growth` | — | Mutual fund | 0.46 | $630,321,125 | T-Mobile Usa, Inc. (911983600|001) |
| 84 | 383,865 | 354 | `Securities and investment advisory services are offered through ` | — | Mutual fund | — | $1,764,415 | Wellspan Health (222517863|005) |
| 85 | 383,063 | 11 | `Retirement Conservative Fund` | `BOKF, NA` | — | — | $3,279,451 | Express Services, Inc. (840909680|003) |
| 86 | 382,064 | 286 | `Vanguard Equity Income Fund` | — | Mutual fund | 0.17 | $1,100,238,025 | Rocket Limited Partner (320628590|005) |
| 87 | 381,443 | 10 | `Retirement 2030 Fund` | `BOKF, NA` | — | — | $25,118,126 | Express Services, Inc. (840909680|003) |
| 88 | 381,443 | 10 | `Retirement 2060 Fund` | `BOKF, NA` | — | — | $16,507,840 | Express Services, Inc. (840909680|003) |
| 89 | 381,443 | 10 | `Retirement 2020 Fund` | `BOKF, NA` | — | — | $9,726,921 | Express Services, Inc. (840909680|003) |
| 90 | 381,443 | 10 | `Retirement 2070 Fund` | `BOKF, NA` | — | — | $1,572,419 | Express Services, Inc. (840909680|003) |
| 91 | 381,138 | 9 | `Retirement 2050 Fund` | `BOKF, NA` | — | — | $31,821,706 | Express Services, Inc. (840909680|003) |
| 92 | 380,918 | 6 | `Genesis Fund` | `Neuberger Berman` | — | — | $3,243,825 | Express Services, Inc. (840909680|003) |
| 93 | 380,659 | 9 | `Retirement 2040 Fund` | `BOKF, NA` | — | — | $32,961,268 | Express Services, Inc. (840909680|003) |
| 94 | 380,184 | 20 | `New World Fund Inc` | `American Funds` | Mutual fund | 0.57 | $23,165,373 | Futureplan Fiduciary S (823719843|334) |
| 95 | 379,925 | 1 | `Vanguard Emerging Markets Index Fund` | — | Mutual fund | 0.1 | $826,086,925 | Cvs Health Corporation (050494040|017) |
| 96 | 379,925 | 1 | `Vanguard FTSE Social Index Fund` | `Socially Responsible Fund` | Mutual fund | 0.12 | $224,853,465 | Cvs Health Corporation (050494040|017) |
| 97 | 379,925 | 1 | `Vanguard Inflation-Protected Securities Fund` | `Inflation-Protected Bond Fund` | Mutual fund | — | $120,289,057 | Cvs Health Corporation (050494040|017) |
| 98 | 377,638 | 78 | `CREF Inflation-Linked Bond` | — | Mutual fund | — | $126,947,308 | The Mount Sinai Hospit (131624096|005) |
| 99 | 377,289 | 28 | `Capital World Bond Fund` | `American Funds` | Mutual fund | — | $5,948,668 | Futureplan Fiduciary S (823719843|334) |
| 100 | 376,800 | 1 | `Large Cap Growth Fund` | `Winslow` | — | — | $231,440 | Express Services, Inc. (840909680|003) |
| 101 | 372,491 | 55 | `Balanced Index Fund` | `Vanguard` | Mutual fund | 0.1 | $558,423,722 | Adp Totalsource Group, (592452823|001) |
| 102 | 370,858 | 411 | `Putnam Large Cap Value R6` | — | Mutual fund | — | $516,323,823 | Yale-New Haven Hospita (060646652|004) |
| 103 | 369,372 | 403 | `American Funds New Perspective Fund` | — | Mutual fund | 0.4 | $607,993,825 | Molina Healthcare, Inc (134204626|001) |
| 104 | 367,358 | 48 | `CREF Core Bond` | — | Mutual fund | — | $115,474,587 | The Mount Sinai Hospit (131624096|005) |
| 105 | 366,766 | 249 | `Fidelity Freedom 2030 Fund` | — | Mutual fund | 0.5 | $1,105,793,555 | Hah Holdings, Llc (611766004|001) |
| 106 | 366,765 | 64 | `J H ENTERPRISE N` | — | Mutual fund | — | $198,327,450 | Public Partnerships Ll (043468852|001) |
| 107 | 364,719 | 249 | `Fidelity Freedom 2040 Fund` | — | Mutual fund | 0.5 | $1,193,227,503 | Hah Holdings, Llc (611766004|001) |
| 108 | 363,477 | 248 | `Fidelity Freedom 2035 Fund` | — | Mutual fund | 0.5 | $1,097,694,006 | Hah Holdings, Llc (611766004|001) |
| 109 | 363,315 | 245 | `Fidelity Freedom 2045 Fund` | — | Mutual fund | 0.5 | $1,046,478,226 | Hah Holdings, Llc (611766004|001) |
| 110 | 360,280 | 235 | `Fidelity Freedom 2025 Fund` | — | Mutual fund | 0.5 | $614,896,889 | Hah Holdings, Llc (611766004|001) |
| 111 | 359,611 | 377 | `American Funds 2030 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,066,418,743 | Barrett Business Servi (520812977|001) |
| 112 | 359,285 | 207 | `Dodge & Cox` | — | Mutual fund | — | $1,607,427,908 | Hyatt Corporation (941649123|005) |
| 113 | 357,433 | 375 | `American Funds 2040 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,209,569,321 | Barrett Business Servi (520812977|001) |
| 114 | 356,709 | 377 | `American Funds 2050 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,109,089,554 | Barrett Business Servi (520812977|001) |
| 115 | 356,536 | 9 | `GE HEALTHCARE TECHNOLOGIES INC WI` | — | — | — | $30,275,685 | Marriott International (522055918|004) |
| 116 | 354,105 | 155 | `CREF Responsible Balanced R2` | — | — | — | $761,374,272 | Wake Forest University (510190238|002) |
| 117 | 352,750 | 59 | `C&S REAL ESTATE Z` | — | Mutual fund | — | $31,169,504 | Public Partnerships Ll (043468852|001) |
| 118 | 351,291 | 369 | `American Funds 2035 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,203,340,943 | Barrett Business Servi (520812977|001) |
| 119 | 351,077 | 23 | `Washington Mutual` | `American Funds` | Mutual fund | 0.26 | $683,696,538 | Adp Totalsource Group, (592452823|001) |
| 120 | 349,075 | 364 | `American Funds 2045 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,101,826,887 | Barrett Business Servi (520812977|001) |
| 121 | 348,629 | 250 | `Fidelity Freedom 2050 Fund` | — | Mutual fund | 0.5 | $1,060,348,183 | Hah Holdings, Llc (611766004|001) |
| 122 | 348,344 | 105 | `OTHER ASSETS` | `SELF-DIRECT ACCT` | — | — | $2,810,615,421 | Accenture Llp (720542904|102) |
| 123 | 347,261 | 249 | `PGIM High Yield Fund` | — | Mutual fund | — | $77,294,788 | Principal Life Insuran (420127290|334) |
| 124 | 346,528 | 341 | `Vanguard Real Estate Index Fund` | — | Mutual fund | 0.13 | $425,117,045 | The Charles Schwab Cor (943025021|002) |
| 125 | 346,482 | 360 | `American Funds 2055 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $834,082,861 | Barrett Business Servi (520812977|001) |
| 126 | 345,522 | 360 | `American Funds 2060 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $504,173,845 | Barrett Business Servi (520812977|001) |
| 127 | 345,437 | 668 | `Participant's Loan Account` | — | Participant loans — not a menu choice | — | $160,115,451 | Greystar Management Se (363858273|001) |
| 128 | 344,797 | 372 | `Voya Fixed Account` | — | — | — | $647,827,599 | Novant Health, Inc. (561376950|003) |
| 129 | 343,249 | 243 | `Fidelity Freedom 2060 Fund` | — | Mutual fund | 0.5 | $519,659,335 | Hah Holdings, Llc (611766004|001) |
| 130 | 343,190 | 240 | `Fidelity Freedom 2055 Fund` | — | Mutual fund | 0.5 | $844,481,279 | Hah Holdings, Llc (611766004|001) |
| 131 | 341,547 | 276 | `Fidelity Freedom Index 2040 Fund` | — | Mutual fund | 0.12 | $2,151,520,146 | Stanford Health Care (946174066|002) |
| 132 | 341,490 | 280 | `Fidelity Freedom Index 2050 Fund` | — | Mutual fund | 0.12 | $2,386,929,429 | Stanford Health Care (946174066|002) |
| 133 | 340,695 | 273 | `Fidelity Freedom Index 2045 Fund` | — | Mutual fund | 0.12 | $2,257,298,163 | Stanford Health Care (946174066|002) |
| 134 | 340,554 | 274 | `Fidelity Freedom Index 2035 Fund` | — | Mutual fund | 0.12 | $1,850,002,980 | Stanford Health Care (946174066|002) |
| 135 | 340,517 | 128 | `Income Fund Institutional Class` | — | Mutual fund | — | $175,252,522 | Google Llc (770493581|001) |
| 136 | 340,378 | 269 | `Fidelity Freedom Index 2055 Fund` | — | Mutual fund | 0.12 | $1,673,197,743 | Stanford Health Care (946174066|002) |
| 137 | 339,248 | 1 | `Mid Cap Fund` | `T. Rowe Price` | Mutual fund | — | $205,298,516 | Adp Totalsource Group, (592452823|001) |
| 138 | 339,248 | 1 | `Blackrock Money Market Fund` | — | Cash / short-term | 0.2 | $31,314,708 | Adp Totalsource Group, (592452823|001) |
| 139 | 338,834 | 79 | `VICTORY S EST VAL R6` | — | Mutual fund | — | $99,626,724 | Public Partnerships Ll (043468852|001) |
| 140 | 338,389 | 273 | `Fidelity Freedom Index 2030 Fund` | — | Mutual fund | 0.12 | $1,483,600,000 | Stanford Health Care (946174066|002) |
| 141 | 338,277 | 268 | `Fidelity Freedom Index 2060 Fund` | — | Mutual fund | 0.12 | $916,370,064 | Stanford Health Care (946174066|002) |
| 142 | 337,845 | 262 | `Fidelity Freedom Index 2025 Fund` | — | Mutual fund | 0.12 | $845,809,867 | Stanford Health Care (946174066|002) |
| 143 | 335,636 | 228 | `Fidelity Freedom 2065 Fund` | — | Mutual fund | 0.5 | $160,521,619 | Hah Holdings, Llc (611766004|001) |
| 144 | 334,276 | 263 | `Fidelity Freedom Index 2065 Fund` | — | Mutual fund | 0.12 | $255,924,363 | Stanford Health Care (946174066|002) |
| 145 | 332,369 | 438 | `Voya Gv Mny Mkt F A (Hld Acct)` | — | Mutual fund | — | $18,663,655 | Waste Connections, Inc (680400286|001) |
| 146 | 330,229 | 149 | `CREF S&P 500 Index R2` | — | — | 0.03 | $863,755,069 | Wake Forest University (510190238|002) |
| 147 | 329,042 | 287 | `Janus Henderson Enterprise N` | — | Mutual fund | 0.7 | $353,794,075 | Centene Corporation (391864073|001) |
| 148 | 327,466 | 9 | `Raslnes GHA) SB) nnn OKO I` | — | — | — | $5,081,300 | Compass Group Usa, Inc (561874931|007) |
| 149 | 327,058 | 217 | `Fidelity Freedom 2020 Fund` | — | Mutual fund | 0.5 | $270,754,501 | Hah Holdings, Llc (611766004|001) |
| 150 | 326,660 | 8 | `THE CIGNA GROUP` | — | — | — | $96,713,695 | The Boeing Co. And Con (910425694|002) |

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
