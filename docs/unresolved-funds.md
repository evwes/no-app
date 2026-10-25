# Unresolved funds — 2026-10-25

Of **1,722,662** fund rows wampo publishes, the resolver finds a ticker for
**760,255** and nothing for **962,407**. Those group into
**455,190** distinct name families — one per (filed name, issuer cell, filed type).

| bucket | families | rows | plans reached | readers | $ held | what it means |
|---|---:|---:|---:|---:|---:|---|
| **A — needs your guidance** | **288,198** | 644,169 | **55,872** | **93,000,260** | $1,725,092,083,484 | looks like a registered fund; a ticker probably exists and we cannot find it |
| B — no ticker by nature | 159,245 | 296,326 | 43,177 | 86,176,397 | $2,288,446,456,371 | collective trust, separate account, guaranteed option. A blank is correct — **do not spend time here** |
| C — not a fund | 1,875 | 10,362 | 9,473 | 38,590,933 | $482,593,346,394 | loans, employer stock, aggregates, captions |
| D — a single security | 5,872 | 11,550 | 8,224 | 27,852,641 | $251,566,853,835 | one Treasury, agency or corporate issue in a managed sleeve. No fund ticker exists — **do not spend time here** |

Readers are plan-deduplicated inside a bucket. A plan can appear in several
buckets, so the four do not sum to the universe and are not meant to.

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
| 1,065,863 | 491 | `American Funds EuroPacific Growth Fund` | — | Mutual fund | 0.46 | $1,938,768,697 |
| 847,918 | 2 | `MFO T. ROWE PRICE CASH RESERVES TRUST-Z` | — | — | 0.2 | $36,360,249 |
| 706,406 | 341 | `CREF Money Market R2` | — | Cash / short-term | 0.2 | $599,565,572 |
| 663,236 | 241 | `FID EXTD MKT IDX` | — | Mutual fund | 0.1 | $1,817,890,535 |
| 587,819 | 278 | `EuroPacific Growth Fund` | `American Funds` | Mutual fund | 0.46 | $944,682,510 |
| 556,477 | 637 | `American Funds New World Fund` | — | Mutual fund | 0.57 | $711,242,582 |
| 543,661 | 3 | `MFO LIFEPATH INDEX RETIREMENT FUND F` | — | — | 0.1 | $2,470,384,660 |
| 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2030 FUND F` | — | — | 0.09 | $1,517,255,360 |
| 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2035 FUND F` | — | — | 0.09 | $1,303,013,869 |
| 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2045 FUND F` | — | — | 0.09 | $1,180,183,116 |
| 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2040 FUND F` | — | — | 0.09 | $1,141,686,549 |
| 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2050 FUND F` | — | — | 0.09 | $1,090,350,109 |
| 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2055 FUND F` | — | — | 0.09 | $866,565,438 |
| 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2060 FUND F` | — | — | 0.09 | $519,749,866 |
| 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2065 FUN D F` | — | — | 0.09 | $96,537,333 |
| 511,714 | 163 | `American Funds EuroPacific Growth` | — | Mutual fund | 0.46 | $627,830,283 |
| 503,117 | 396 | `American Funds New Perspective Fund` | — | Mutual fund | 0.4 | $1,158,956,174 |
| 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2050 NL ` | — | Mutual fund | 0.1 | $1,074,055,095 |
| 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2045 NL ` | — | Mutual fund | 0.1 | $860,289,824 |
| 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2055 NL ` | — | Mutual fund | 0.1 | $847,602,443 |
| 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX RETIREME` | — | Mutual fund | 0.1 | $788,460,248 |
| 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2040 NL ` | — | Mutual fund | 0.1 | $635,480,248 |
| 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2035 NL ` | — | Mutual fund | 0.1 | $552,334,079 |
| 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2060 NL ` | — | Mutual fund | 0.1 | $521,154,195 |
| 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2030 NL ` | — | Mutual fund | 0.1 | $478,213,634 |
| 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2065 NL ` | — | Mutual fund | 0.1 | $286,795,492 |
| 490,211 | 10 | `Vanguard Short-Term Inflation-Protected Sec. Idx Fund: Inst'l Sh` | — | Mutual fund | 0.1 | $237,310,020 |
| 480,051 | 2 | `MFO EQUITY INDEX FUND F` | — | — | 0.06 | $3,819,159,498 |
| 468,817 | 1 | `MFO BLACKROCK US DEBT INDEX F` | — | — | 0.03 | $1,469,018,249 |
| 435,871 | 245 | `Vanguard International Growth Fund` | — | Mutual fund | 0.26 | $592,233,638 |

## A — the worklist, by readers affected

| # | readers | plans | filed name | issuer cell | filed type | fee | $ held | example plan |
|---:|---:|---:|---|---|---|---:|---:|---|
| 1 | 1,996,659 | 1 | `Risk Balanced Commodities Strategy Fund` | — | Mutual fund | — | $140,422,564 | Walmart Inc. (710415188|003) |
| 2 | 1,996,659 | 1 | `Benchmark Mortgage Trust` | — | Corporate debt | — | $2,080,796 | Walmart Inc. (710415188|003) |
| 3 | 1,996,659 | 1 | `BX Commercial Mortgage Trust` | — | Corporate debt | — | $1,175,573 | Walmart Inc. (710415188|003) |
| 4 | 1,381,475 | 794 | `Fidelity Government` | — | Mutual fund | — | $826,813,819 | Whole Foods Market, In (741989366|002) |
| 5 | 1,065,863 | 491 | `American Funds EuroPacific Growth Fund` | — | Mutual fund | 0.46 | $1,938,768,697 | Davita Inc. (510354549|001) |
| 6 | 952,524 | 14 | `VISA INC COM CL A STK` | — | — | — | $150,726,506 | The Home Depot, Inc. (953261426|001) |
| 7 | 847,918 | 2 | `MFO T. ROWE PRICE CASH RESERVES TRUST-Z` | — | — | 0.2 | $36,360,249 | The Home Depot, Inc. (953261426|001) |
| 8 | 762,704 | 20 | `GE AEROSPACE` | — | — | — | $102,288,250 | The Boeing Co. And Con (910425694|002) |
| 9 | 706,406 | 341 | `CREF Money Market R2` | — | Cash / short-term | 0.2 | $599,565,572 | Wake Forest University (510190238|002) |
| 10 | 683,914 | 36 | `DODGE & COX INT SK X` | — | Mutual fund | — | $498,875,228 | Providence Health & Se (510216586|010) |
| 11 | 674,716 | 2 | `MFO KROGER US LARGE CAP UNIT S` | — | — | — | $2,760,244,704 | The Kroger Co. (310345740|010) |
| 12 | 674,716 | 2 | `MFO KROGER NON US EQUITY UNIT Y` | — | — | — | $954,810,129 | The Kroger Co. (310345740|010) |
| 13 | 674,716 | 2 | `MFO KROGER US LARGE CAP UNIT X` | — | — | — | $920,023,623 | The Kroger Co. (310345740|010) |
| 14 | 674,716 | 2 | `MFO KROGER INT'L DEVELOPED UNIT M` | — | — | — | $700,174,859 | The Kroger Co. (310345740|010) |
| 15 | 674,716 | 2 | `MFO US SMID CAP UNIT W` | — | — | — | $423,634,812 | The Kroger Co. (310345740|010) |
| 16 | 674,716 | 2 | `MFO KROGER SMID FUND UNIT AC` | — | — | — | $266,658,575 | The Kroger Co. (310345740|010) |
| 17 | 674,716 | 2 | `MFO KROGER TIP UNIT N` | — | — | — | $236,188,112 | The Kroger Co. (310345740|010) |
| 18 | 674,716 | 2 | `Other United States - USD &&&KROGER LOAN ASSET` | — | Participant loans — not a menu choice | — | $142,816,695 | The Kroger Co. (310345740|010) |
| 19 | 663,236 | 241 | `FID EXTD MKT IDX` | — | Mutual fund | 0.1 | $1,817,890,535 | Mayo Clinic (416011702|002) |
| 20 | 661,036 | 1 | `State Street Retirement Fund Class K` | — | Mutual fund | — | $16,061,008 | Paychex Retirement Llc (853275179|001) |
| 21 | 587,819 | 278 | `EuroPacific Growth Fund` | `American Funds` | Mutual fund | 0.46 | $944,682,510 | Principal Life Insuran (420127290|334) |
| 22 | 556,477 | 637 | `American Funds New World Fund` | — | Mutual fund | 0.57 | $711,242,582 | Edward D. Jones & Co., (430345811|001) |
| 23 | 544,775 | 261 | `Vanguard Treasury` | — | Mutual fund | — | $1,291,962,407 | Truist Financial Corpo (560939887|003) |
| 24 | 543,661 | 3 | `MFO LIFEPATH INDEX RETIREMENT FUND F` | — | — | 0.1 | $2,470,384,660 | The Home Depot, Inc. (953261426|001) |
| 25 | 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2030 FUND F` | — | — | 0.09 | $1,517,255,360 | The Home Depot, Inc. (953261426|001) |
| 26 | 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2035 FUND F` | — | — | 0.09 | $1,303,013,869 | The Home Depot, Inc. (953261426|001) |
| 27 | 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2045 FUND F` | — | — | 0.09 | $1,180,183,116 | The Home Depot, Inc. (953261426|001) |
| 28 | 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2040 FUND F` | — | — | 0.09 | $1,141,686,549 | The Home Depot, Inc. (953261426|001) |
| 29 | 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2050 FUND F` | — | — | 0.09 | $1,090,350,109 | The Home Depot, Inc. (953261426|001) |
| 30 | 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2055 FUND F` | — | — | 0.09 | $866,565,438 | The Home Depot, Inc. (953261426|001) |
| 31 | 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2060 FUND F` | — | — | 0.09 | $519,749,866 | The Home Depot, Inc. (953261426|001) |
| 32 | 543,661 | 3 | `MFO BLACKROCK LIFEPATH INDEX 2065 FUN D F` | — | — | 0.09 | $96,537,333 | The Home Depot, Inc. (953261426|001) |
| 33 | 541,314 | 6 | `INSMED INC COM PAR $.01` | — | — | — | $18,718,175 | The Home Depot, Inc. (953261426|001) |
| 34 | 528,933 | 49 | `FIDELITY FUND` | — | — | — | $642,983,675 | Pepsico, Inc. (131584302|203) |
| 35 | 528,247 | 46 | `EXTERNAL FUND` | — | — | — | $400,869,477 | Pepsico, Inc. (131584302|203) |
| 36 | 513,265 | 455 | `TIAA Traditional Benefit Responsive` | — | — | — | $1,701,348,277 | Wake Forest University (510190238|002) |
| 37 | 512,189 | 11 | `Pending trade purchases: United States dollar` | — | — | — | $19,099,957 | Hca Inc. (752497104|004) |
| 38 | 511,714 | 163 | `American Funds EuroPacific Growth` | — | Mutual fund | 0.46 | $627,830,283 | T-Mobile Usa, Inc. (911983600|001) |
| 39 | 503,117 | 396 | `American Funds New Perspective Fund` | — | Mutual fund | 0.4 | $1,158,956,174 | Edward D. Jones & Co., (430345811|001) |
| 40 | 495,482 | 1 | `SSGA TARGET CORPORATION COMMON STOCK FUND` | — | Company stock | — | $1,475,947,149 | Target Corporation (410215170|002) |
| 41 | 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2050 NL ` | — | Mutual fund | 0.1 | $1,074,055,095 | Target Corporation (410215170|002) |
| 42 | 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2045 NL ` | — | Mutual fund | 0.1 | $860,289,824 | Target Corporation (410215170|002) |
| 43 | 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2055 NL ` | — | Mutual fund | 0.1 | $847,602,443 | Target Corporation (410215170|002) |
| 44 | 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX RETIREME` | — | Mutual fund | 0.1 | $788,460,248 | Target Corporation (410215170|002) |
| 45 | 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2040 NL ` | — | Mutual fund | 0.1 | $635,480,248 | Target Corporation (410215170|002) |
| 46 | 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2035 NL ` | — | Mutual fund | 0.1 | $552,334,079 | Target Corporation (410215170|002) |
| 47 | 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2060 NL ` | — | Mutual fund | 0.1 | $521,154,195 | Target Corporation (410215170|002) |
| 48 | 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2030 NL ` | — | Mutual fund | 0.1 | $478,213,634 | Target Corporation (410215170|002) |
| 49 | 495,482 | 1 | `State Street Bank & Trust Company STATE STR BK + TR CO INVT FDS` | — | Mutual fund | — | $467,978,916 | Target Corporation (410215170|002) |
| 50 | 495,482 | 1 | `BlackRock Institutional Trust Company, . EM NON LENDABLE FUND F` | — | Mutual fund | — | $383,583,141 | Target Corporation (410215170|002) |
| 51 | 495,482 | 1 | `STATE STR BK TR CO INVT` | — | Mutual fund | — | $340,829,394 | Target Corporation (410215170|002) |
| 52 | 495,482 | 1 | `BlackRock Institutional Trust Company, . LIFEPATH INDEX 2065 NL ` | — | Mutual fund | 0.1 | $286,795,492 | Target Corporation (410215170|002) |
| 53 | 495,482 | 1 | `SSGA SHORT TERM INVESTMENT FUND` | `Cash & Cash Equivalents 46,762` | Cash / short-term | — | $46,732,867 | Target Corporation (410215170|002) |
| 54 | 490,211 | 10 | `Vanguard Short-Term Inflation-Protected Sec. Idx Fund: Inst'l Sh` | — | Mutual fund | 0.1 | $237,310,020 | Fedex Corporation (621721435|004) |
| 55 | 480,051 | 2 | `MFO EQUITY INDEX FUND F` | — | — | 0.06 | $3,819,159,498 | The Home Depot, Inc. (953261426|001) |
| 56 | 478,185 | 1 | `Self-managed accounts` | — | Brokerage window | — | $690,233,411 | Board Of Trustees Of T (951732075|003) |
| 57 | 478,185 | 1 | `Government Short Term Investment Fund` | — | Cash / short-term | — | $453,999,584 | Board Of Trustees Of T (951732075|003) |
| 58 | 478,185 | 1 | `2024.04031 BOARD OF TRUSTEES OF THE` | — | — | — | $20,396,691 | Board Of Trustees Of T (951732075|003) |
| 59 | 476,266 | 46 | `Mid Cap Growth Fund` | — | — | — | $135,864,374 | Express Services, Inc. (840909680|003) |
| 60 | 470,179 | 392 | `PGIM Total Return Bond R6` | — | Mutual fund | — | $519,445,110 | National Mentor Holdin (043250732|001) |
| 61 | 470,049 | 1,006 | `Participant's Loan Account` | — | Participant loans — not a menu choice | — | $236,768,142 | Northeast Georgia Heal (581694090|002) |
| 62 | 469,474 | 2 | `MFO DODGE & COX FDS STOCK FUND X` | — | — | — | $770,316,163 | The Home Depot, Inc. (953261426|001) |
| 63 | 468,817 | 1 | `HOME DEPOT INC COM` | — | — | — | $1,483,803,933 | The Home Depot, Inc. (953261426|001) |
| 64 | 468,817 | 1 | `MFO BLACKROCK US DEBT INDEX F` | — | — | 0.03 | $1,469,018,249 | The Home Depot, Inc. (953261426|001) |
| 65 | 468,817 | 1 | `Other United States - USD &&&CHARLES SCHWAB SDA` | — | — | — | $454,815,768 | The Home Depot, Inc. (953261426|001) |
| 66 | 468,817 | 1 | `Denmark - USD #REORG/ASCENDIS PHARMA MANDATORY EXCHANGE ASCENDIS` | — | — | — | $37,060,259 | The Home Depot, Inc. (953261426|001) |
| 67 | 468,817 | 1 | `United States - USD &&&HD SUPPLY LOAN ASSET` | — | Participant loans — not a menu choice | — | $12,551,395 | The Home Depot, Inc. (953261426|001) |
| 68 | 468,817 | 1 | `MFO RESERVE INVT FDS INC T ROWE PRICE GOVT RESERVE FD` | — | — | — | $10,686,423 | The Home Depot, Inc. (953261426|001) |
| 69 | 468,817 | 1 | `PACKAGING CORP AMER COM ISIN` | — | — | — | $8,742,089 | The Home Depot, Inc. (953261426|001) |
| 70 | 468,817 | 1 | `GENEDX HOLDINGS CORP CL A NEW` | — | — | — | $5,877,411 | The Home Depot, Inc. (953261426|001) |
| 71 | 457,420 | 60 | `Fidelity Investments` | — | Mutual fund | — | $670,398,680 | Commonspirit Health (470617373|002) |
| 72 | 455,080 | 104 | `CREF Growth` | — | Mutual fund | — | $924,242,337 | The Mount Sinai Medica (131624096|005) |
| 73 | 455,040 | 199 | `CREF Core Bond R2` | — | — | — | $395,775,880 | The Cooper Health Syst (210634462|003) |
| 74 | 445,476 | 428 | `TIAA Traditional Non Benefit Responsive` | — | — | — | $5,454,887,038 | Wake Forest University (510190238|002) |
| 75 | 444,663 | 86 | `NATIONAL FINANCIAL SERVICES` | — | — | — | $303,026,762 | Wellstar Health System (581649541|002) |
| 76 | 442,378 | 217 | `CREF Inflation-Linked Bond R2` | — | — | — | $280,634,795 | Wake Forest University (510190238|002) |
| 77 | 435,878 | 3 | `BlackRock Multi-Asset Income Portfolio; Institutional Shares` | — | Mutual fund | — | $27,510,349 | Fedex Corporation (621721435|004) |
| 78 | 435,871 | 245 | `Vanguard International Growth Fund` | — | Mutual fund | 0.26 | $592,233,638 | Ernst & Young U.S. Llp (346565596|112) |
| 79 | 434,526 | 418 | `Vanguard Growth Index Fund` | — | Mutual fund | 0.05 | $2,966,233,185 | Cognizant Technology S (133924155|001) |
| 80 | 432,204 | 218 | `CREF Global Equities R2` | — | — | — | $1,232,017,834 | Wake Forest University (510190238|002) |
| 81 | 430,067 | 92 | `CREF Global Equities` | — | Mutual fund | — | $647,400,671 | The Mount Sinai Medica (131624096|005) |
| 82 | 428,142 | 94 | `OUTSTANDING LOAN BALANCE` | — | Participant loans — not a menu choice | — | $776,285,063 | Comcast Corporation (270000798|001) |
| 83 | 420,953 | 214 | `CREF Growth R2` | — | — | — | $1,685,771,620 | Wake Forest University (510190238|002) |
| 84 | 420,768 | 442 | `PIMCO Income Fund` | — | Mutual fund | 0.51 | $464,992,279 | Sap America, Inc. (363556041|001) |
| 85 | 415,832 | 216 | `Vanguard Inflation-Protected Securities Fund` | — | Mutual fund | — | $410,477,173 | Indiana University Hea (351955872|005) |
| 86 | 411,390 | 15 | `Short-Term Bond Index Fund` | `Vanguard` | — | 0.06 | $14,095,269 | Express Services, Inc. (840909680|003) |
| 87 | 407,005 | 146 | `Vanguard FTSE Social Index Fund` | — | Mutual fund | 0.12 | $274,191,473 | Tesla, Inc. (912197729|001) |
| 88 | 406,497 | 88 | `CREF Inflation-Linked Bond` | — | Mutual fund | — | $132,641,296 | The Mount Sinai Medica (131624096|005) |
| 89 | 404,811 | 10 | `Retirement 2040 Fund` | `BOKF, NA` | — | — | $30,054,916 | Express Services, Inc. (840909680|003) |
| 90 | 404,811 | 10 | `Retirement 2050 Fund` | `BOKF, NA` | — | — | $26,802,315 | Express Services, Inc. (840909680|003) |
| 91 | 404,811 | 10 | `Retirement 2030 Fund` | `BOKF, NA` | — | — | $24,094,059 | Express Services, Inc. (840909680|003) |
| 92 | 404,811 | 10 | `Retirement 2060 Fund` | `BOKF, NA` | — | — | $12,446,913 | Express Services, Inc. (840909680|003) |
| 93 | 404,811 | 10 | `Retirement 2020 Fund` | `BOKF, NA` | — | — | $9,624,425 | Express Services, Inc. (840909680|003) |
| 94 | 404,811 | 10 | `Retirement 2070 Fund` | `BOKF, NA` | — | — | $1,194,003 | Express Services, Inc. (840909680|003) |
| 95 | 402,213 | 3 | `Account number` | — | — | — | $4,480,340 | Hca Inc. (752497104|004) |
| 96 | 401,651 | 5 | `Genesis Fund` | `Neuberger Berman` | — | — | $3,061,973 | Express Services, Inc. (840909680|003) |
| 97 | 400,441 | 1 | `Large Cap Growth Fund` | `Winslow` | — | — | $231,228 | Express Services, Inc. (840909680|003) |
| 98 | 395,038 | 264 | `Fidelity Freedom 2040 Fund` | — | Mutual fund | 0.5 | $1,148,787,484 | Hah Holdings, Llc (611766004|001) |
| 99 | 391,996 | 208 | `Dodge & Cox` | — | Mutual fund | — | $1,864,391,271 | Hyatt Corporation (941649123|005) |
| 100 | 385,927 | 1 | `Vanguard Emerging Markets Index Fund` | — | Mutual fund | 0.1 | $682,853,191 | Cvs Health Corporation (050494040|017) |
| 101 | 385,927 | 1 | `Vanguard FTSE Social Index Fund` | `Socially Responsible Fund` | Mutual fund | 0.12 | $188,070,898 | Cvs Health Corporation (050494040|017) |
| 102 | 385,927 | 1 | `Vanguard Inflation-Protected Securities Fund` | `Inflation-Protected Bond Fund` | Mutual fund | — | $116,468,978 | Cvs Health Corporation (050494040|017) |
| 103 | 382,828 | 202 | `PIMCO Real Return Fund` | — | Mutual fund | — | $139,325,363 | Cintas Corporation (311188630|006) |
| 104 | 379,990 | 108 | `Victory Sycamore Established Value` | — | Mutual fund | 0.55 | $301,983,696 | Upmc (251423657|335) |
| 105 | 379,550 | 275 | `Allspring Special Mid Cap Value Fund` | — | Mutual fund | 0.45 | $243,180,453 | Sequoia One Peo, Llc (464716239|001) |
| 106 | 379,101 | 1 | `INDEX FUND LENDING` | `MFB NT COLLECTIVE RUSSELL 2000` | — | 0.1 | $1,183,503,663 | Hca Inc. (752497104|004) |
| 107 | 379,101 | 1 | `MFB NTGI COLTV DAILY HI YIELD FXD INC FD` | — | — | — | $154,147,927 | Hca Inc. (752497104|004) |
| 108 | 379,101 | 1 | `NORTHN TR GLOBAL INVTS COLTV FDS TR` | — | — | — | $45,701,140 | Hca Inc. (752497104|004) |
| 109 | 379,101 | 1 | `Pending foreign exchange purchases: United States dollar` | — | — | — | $12,815,069 | Hca Inc. (752497104|004) |
| 110 | 379,101 | 1 | `Pending foreign exchange sales: Euro` | — | — | — | $12,241,472 | Hca Inc. (752497104|004) |
| 111 | 379,101 | 1 | `PVTPL PARKLAND CORP/CANADA` | — | — | — | $2,799,186 | Hca Inc. (752497104|004) |
| 112 | 379,101 | 1 | `PVTPL RITCHIE BROS AUCTIONEERS 7.75% DUE03-15-2031` | — | — | — | $2,368,221 | Hca Inc. (752497104|004) |
| 113 | 379,101 | 1 | `CCRR PARENT, INC. TERM LOAN` | — | — | — | $2,068,907 | Hca Inc. (752497104|004) |
| 114 | 379,101 | 1 | `SENIOR SECURED` | — | — | — | $2,047,929 | Hca Inc. (752497104|004) |
| 115 | 375,761 | 330 | `Vanguard Value Index Fund` | — | Mutual fund | 0.05 | $763,830,278 | Cognizant Technology S (133924155|001) |
| 116 | 375,328 | 53 | `CREF Core Bond` | — | Mutual fund | — | $117,205,240 | The Mount Sinai Medica (131624096|005) |
| 117 | 370,126 | 314 | `JPMorgan Large Cap Growth Fund` | — | Mutual fund | 0.44 | $1,514,987,127 | Hcl America Inc (770205035|001) |
| 118 | 370,085 | 83 | `CREF Stock` | — | Mutual fund | — | $2,344,566,874 | The Mount Sinai Medica (131624096|005) |
| 119 | 369,381 | 261 | `Vanguard Equity Income Fund` | — | Mutual fund | 0.17 | $1,309,495,304 | Huntington Bancshares  (310724920|002) |
| 120 | 360,719 | 50 | `Balanced Index Fund` | `Vanguard` | Mutual fund | 0.1 | $470,978,040 | Adp Totalsource Group, (592452823|001) |
| 121 | 360,559 | 258 | `Fidelity Freedom 2030 Fund` | — | Mutual fund | 0.5 | $1,142,087,622 | Hah Holdings, Llc (611766004|001) |
| 122 | 358,148 | 281 | `Fidelity Freedom Index 2050 Fund` | — | Mutual fund | 0.12 | $2,406,205,332 | Stanford Health Care (946174066|002) |
| 123 | 357,237 | 278 | `Victory Sycamore Established Value Fund` | — | Mutual fund | 0.55 | $451,481,286 | Sephora Usa Inc. (943322407|001) |
| 124 | 354,142 | 270 | `Fidelity Freedom Index 2030 Fund` | — | Mutual fund | 0.12 | $1,472,340,678 | Stanford Health Care (946174066|002) |
| 125 | 353,715 | 372 | `American Funds 2035 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,161,896,948 | Barrett Business Servi (520812977|001) |
| 126 | 353,098 | 380 | `American Funds 2050 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,134,306,345 | Barrett Business Servi (520812977|001) |
| 127 | 352,906 | 380 | `American Funds 2030 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,134,823,092 | Barrett Business Servi (520812977|001) |
| 128 | 352,738 | 172 | `CREF Equity Index R2` | — | — | 0.06 | $868,860,853 | Wake Forest University (510190238|002) |
| 129 | 352,521 | 81 | `CREF Social Choice` | — | Mutual fund | — | $327,848,926 | The Mount Sinai Medica (131624096|005) |
| 130 | 352,335 | 272 | `Fidelity Freedom Index 2045 Fund` | — | Mutual fund | 0.12 | $2,217,309,382 | Stanford Health Care (946174066|002) |
| 131 | 351,858 | 374 | `American Funds 2040 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,227,505,928 | Barrett Business Servi (520812977|001) |
| 132 | 350,623 | 218 | `PGIM Total Return Bond Fund` | — | Mutual fund | — | $528,064,510 | Maximus, Inc. (541000588|001) |
| 133 | 349,890 | 271 | `Fidelity Freedom Index 2060 Fund` | — | Mutual fund | 0.12 | $877,301,886 | Stanford Health Care (946174066|002) |
| 134 | 349,777 | 276 | `Fidelity Freedom Index 2040 Fund` | — | Mutual fund | 0.12 | $2,088,002,720 | Stanford Health Care (946174066|002) |
| 135 | 349,108 | 271 | `Fidelity Freedom Index 2055 Fund` | — | Mutual fund | 0.12 | $1,568,147,137 | Stanford Health Care (946174066|002) |
| 136 | 349,034 | 270 | `Fidelity Freedom Index 2035 Fund` | — | Mutual fund | 0.12 | $1,821,877,867 | Stanford Health Care (946174066|002) |
| 137 | 348,955 | 260 | `Fidelity Freedom Index 2025 Fund` | — | Mutual fund | 0.12 | $871,672,526 | Stanford Health Care (946174066|002) |
| 138 | 348,938 | 24 | `Washington Mutual` | `American Funds` | Mutual fund | 0.26 | $583,513,887 | Adp Totalsource Group, (592452823|001) |
| 139 | 348,285 | 252 | `Fidelity Freedom 2025 Fund` | — | Mutual fund | 0.5 | $691,112,434 | Hah Holdings, Llc (611766004|001) |
| 140 | 348,109 | 366 | `American Funds 2045 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $1,036,568,371 | Barrett Business Servi (520812977|001) |
| 141 | 347,654 | 362 | `American Funds 2025 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $625,329,911 | Barrett Business Servi (520812977|001) |
| 142 | 343,538 | 263 | `Fidelity Freedom Index 2065 Fund` | — | Mutual fund | 0.12 | $233,512,349 | Stanford Health Care (946174066|002) |
| 143 | 342,127 | 357 | `American Funds 2060 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $502,204,344 | Barrett Business Servi (520812977|001) |
| 144 | 341,217 | 26 | `CREF Money Market R3` | — | Cash / short-term | 0.2 | $251,821,257 | Nyu Langone Hospitals (133971298|005) |
| 145 | 339,081 | 160 | `CREF Money Market` | — | Cash / short-term | 0.2 | $259,651,289 | Mclaren Health Care Co (382397643|002) |
| 146 | 338,860 | 363 | `American Funds 2055 Target Date Retirement Fund` | — | Mutual fund | 0.32 | $828,941,693 | Barrett Business Servi (520812977|001) |
| 147 | 338,856 | 122 | `Income Fund Institutional Class` | — | Mutual fund | — | $169,651,748 | Google Llc (770493581|001) |
| 148 | 338,466 | 256 | `Fidelity Freedom 2035 Fund` | — | Mutual fund | 0.5 | $1,059,813,482 | Hah Holdings, Llc (611766004|001) |
| 149 | 337,973 | 5 | `EuroPacific Growth R4 Fund` | `American Funds` | Mutual fund | — | $196,811,138 | Adp Totalsource Group, (592452823|001) |
| 150 | 337,474 | 238 | `PGIM High Yield Fund` | — | Mutual fund | — | $72,431,948 | Principal Life Insuran (420127290|334) |

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
