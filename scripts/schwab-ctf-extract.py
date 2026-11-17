#!/usr/bin/env python3
"""Extract Schwab CTF per-unit-class figures from the owner's workbook.

Produces a reviewable table, NOT data/fund-facts.json — that file is written
only by the fund-facts agent, with a source URL and an as-of date.

Shape of each month-end sheet, read from the file rather than assumed:
  a FUND row     -> column A alone ("SMRT 2040"), no numbers
  a CLASS row    -> A="Unit Class III", B=expense, C=inception serial,
                    E..M = 1mo, 3mo, 6mo, YTD, 1y, 3y, 5y, 10y, since-inception
  an INDEX row   -> A ends "Composite Index", no expense -> skipped, it is a
                    benchmark and not a vehicle anyone can buy.

Run with -I; takes the workbook path as an argument.
"""
import sys, zipfile, re, json, datetime
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
path = sys.argv[1]
z = zipfile.ZipFile(path)
names = z.namelist()
shared = []
if "xl/sharedStrings.xml" in names:
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.findall(f"{NS}si"):
        shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))

def cell(c):
    t, v = c.get("t"), c.find(f"{NS}v")
    if t == "s" and v is not None:
        i = int(v.text)
        return shared[i] if i < len(shared) else ""
    if t == "inlineStr":
        isn = c.find(f"{NS}is")
        return "".join(x.text or "" for x in isn.iter(f"{NS}t")) if isn is not None else ""
    return v.text if v is not None else ""

def serial_to_date(s):
    try:
        n = int(float(s))
    except Exception:
        return None
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=n)).isoformat()

COLS = {"E": "m1", "F": "m3", "G": "m6", "H": "ytd", "I": "r1y", "J": "r3y", "K": "r5y", "L": "r10y", "M": "inception_ret"}
SHEETS = {"xl/worksheets/sheet1.xml": "SMRT", "xl/worksheets/sheet3.xml": "SIRT", "xl/worksheets/sheet5.xml": "ITF"}

out = []
asof = None
for key, fam in SHEETS.items():
    if key not in names:
        continue
    root = ET.fromstring(z.read(key))
    fund = None
    for row in root.iter(f"{NS}row"):
        vals = {}
        for c in row.iter(f"{NS}c"):
            col = re.sub(r"\d", "", c.get("r") or "")
            vals[col] = cell(c)
        a = (vals.get("A") or "").strip()
        if asof is None:
            for v in vals.values():
                m = re.search(r"As of (\d{1,2}/\d{1,2}/\d{4})", str(v) or "")
                if m:
                    mm, dd, yy = m.group(1).split("/")
                    asof = f"{yy}-{int(mm):02d}-{int(dd):02d}"
        if not a:
            continue
        if re.search(r"composite index$", a, re.I):
            continue
        # ITF names its classes Retirement / Institutional / Select rather
        # than "Unit Class <roman>", which is why an earlier version read 1 ITF
        # row instead of its real count. Both spellings are accepted; the
        # trailing "(Closed to new investors)" footnote is stripped.
        cls = re.match(r"^Unit Class\s+([A-Z]+|[IVX]+)", a) or re.match(
            r"^(Retirement|Institutional|Select|Premier)\b", a)
        if cls:
            if not fund:
                continue
            exp = vals.get("B", "")
            try:
                exp = float(exp)
            except Exception:
                exp = None
            rec = {"family": fam, "fund": fund, "unitClass": cls.group(1),
                   "expensePct": exp, "inception": serial_to_date(vals.get("C", ""))}
            for col, k in COLS.items():
                raw = vals.get(col, "")
                if raw in ("", "--", None):
                    continue
                try:
                    rec[k] = round(float(raw), 4)
                except Exception:
                    pass
            out.append(rec)
        elif (not re.match(r"^(Unit Class|Annualized|As of)", a) and len(a) < 60
              # A FUND LABEL CARRIES NO NUMBERS. The first version keyed on "no
              # expense in column B", and a BENCHMARK row has no expense either
              # — so `Russell 1000(R) Value Index` was read as a fund name on
              # the ITF sheet, which the fund-facts agent caught by parsing the
              # sheet itself rather than trusting this script. A benchmark has
              # values in E..M; a label row has none.
              and not any(vals.get(c) for c in ("B",) + tuple(COLS))
              and not re.search(r"\bindex$", a, re.I)):
            fund = a
print(json.dumps({"asOf": asof, "count": len(out), "rows": out}, indent=1)[:1400])
print(f"\n... total {len(out)} unit-class rows, as of {asof}")
fams = {}
for r in out:
    fams.setdefault(r["family"], set()).add(r["fund"])
for f, s in fams.items():
    print(f"  {f}: {len(s)} funds, {sum(1 for r in out if r['family'] == f)} unit-class rows")
withboth = [r for r in out if r.get("expensePct") is not None and "ytd" in r]
print(f"  rows with BOTH an expense ratio and a YTD: {len(withboth)}")
print(f"  rows also carrying r1y/r3y/r5y/r10y: "
      f"{sum(1 for r in out if all(k in r for k in ('r1y','r3y','r5y','r10y')))}")
exps = sorted({r['expensePct'] for r in out if r.get('expensePct') is not None})
print(f"  distinct expense ratios: {exps}")
