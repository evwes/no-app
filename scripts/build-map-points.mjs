#!/usr/bin/env node
/* wampo — coordinates for the map view.
 *
 * Writes map-points.json: one point per FULL-FORM filer, row-aligned to
 * plans-all.json / plans-list.json so the map reuses the boot payload's
 * filters without shipping any of this at boot. The file is fetched only when
 * a reader opens the Map tab.
 *
 * WHAT THE POINT MEANS, and it is not what a reader might assume: a Form 5500
 * carries the PLAN SPONSOR'S filing address. That is normally a headquarters
 * or a benefits administrator's office — not where the participants work or
 * live. A 250,000-participant plan filed from one Manhattan ZIP does not mean
 * 250,000 people in Manhattan. The map says so on its face; this file only
 * records where the filing came from.
 *
 * Coordinates are ZIP-code centroids. The authoritative source is the Census
 * ZCTA Gazetteer (public domain); a mirrored copy is used only when Census is
 * unreachable, and the file records which one produced it so a coordinate can
 * always be traced.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CENSUS = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip";
const MIRROR = "https://raw.githubusercontent.com/midwire/free_zipcode_data/master/all_us_zipcodes.csv";

function fetchText(url, binary) {
  const args = ["-sfL", "--max-time", "180", url];
  if (binary) args.push("--output", "/tmp/gaz.zip");
  execFileSync("curl", args, { maxBuffer: 256 * 1024 * 1024, encoding: binary ? "buffer" : "utf8" });
  return binary ? null : execFileSync("curl", args, { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" });
}

function loadCentroids() {
  // 1. Census ZCTA Gazetteer — authoritative, public domain
  try {
    execFileSync("curl", ["-sfL", "--max-time", "180", "-o", "/tmp/gaz.zip", CENSUS], { stdio: "ignore" });
    const txt = execFileSync("unzip", ["-p", "/tmp/gaz.zip"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const out = {};
    for (const line of txt.split("\n").slice(1)) {
      const p = line.split("\t").map((x) => x.trim());
      if (p.length < 6) continue;
      const z = p[0], la = +p[p.length - 2], lo = +p[p.length - 1];
      if (/^\d{5}$/.test(z) && isFinite(la) && isFinite(lo)) out[z] = [la, lo];
    }
    if (Object.keys(out).length > 20000) return { z: out, source: "US Census ZCTA Gazetteer 2023 (public domain)" };
    console.log("census gazetteer parsed too few rows — falling back");
  } catch { console.log("census gazetteer unreachable — falling back to the mirror"); }

  // 2. mirrored copy, used only when Census cannot be reached
  const csv = execFileSync("curl", ["-sfL", "--max-time", "180", MIRROR], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const out = {};
  for (const line of csv.split("\n").slice(1)) {
    const p = line.split(",");
    const z = p[0], la = parseFloat(p[5]), lo = parseFloat(p[6]);
    if (/^\d{5}$/.test(z) && isFinite(la) && isFinite(lo)) out[z] = [la, lo];
  }
  return { z: out, source: "mirrored US ZIP centroids (midwire/free_zipcode_data), Census-derived" };
}

const { z: CENT, source } = loadCentroids();
console.log(`${Object.keys(CENT).length.toLocaleString()} ZIP centroids from: ${source}`);

const all = JSON.parse(readFileSync("plans-all.json", "utf8"));
const F = Object.fromEntries(all.fields.map((f, i) => [f, i]));
const g = (r, k) => r[F[k]];

const zipIndex = new Map();   // "10001" -> position in the coordinate table
const coords = [];            // [lat, lon] rounded to 3dp (~110 m, finer than the source)
const rows = new Array(all.plans.length).fill(-1);

let full = 0, placed = 0;
const unplaced = new Map();
all.plans.forEach((r, i) => {
  if (g(r, "sf")) return;     // short-form filers are out of scope for the map
  full++;
  const zip = String(g(r, "zip") || "").trim().slice(0, 5);
  const c = CENT[zip];
  if (!c) { if (zip) unplaced.set(zip, (unplaced.get(zip) || 0) + 1); return; }
  let idx = zipIndex.get(zip);
  if (idx === undefined) {
    idx = coords.length;
    zipIndex.set(zip, idx);
    coords.push([+c[0].toFixed(3), +c[1].toFixed(3)]);
  }
  rows[i] = idx;
  placed++;
});

const out = {
  generated: new Date().toISOString(),
  source,
  note: "Points are the plan sponsor's filing ZIP — a headquarters or benefits office, not where participants live.",
  /* The fingerprint that makes this file safe to ship. `rows` is positional:
   * entry i is the coordinate for plan i of plans-all / plans-list. If the
   * universe changes and this file is not regenerated, every row after the
   * first inserted plan points at the WRONG plan — and nothing about the file
   * looks broken, so the map silently draws confident, wrong dots.
   *
   * That is not hypothetical: it happened. This file was generated against a
   * 110,555-plan universe, a pipeline run grew it to 111,782, and 15,774 of
   * 67,658 placed plans (23%) ended up on the wrong plan before anyone
   * noticed. The reader saw no error.
   *
   * So the file now states what it was aligned to, and the map refuses to
   * draw when the boot payload disagrees. A row-aligned sidecar must always
   * carry a fingerprint of the thing it is aligned to. */
  universe: all.plans.length,
  fullForm: full,
  placed,
  unplaced: full - placed,
  coords,
  rows,
};
writeFileSync("map-points.json", JSON.stringify(out));
console.log(`map-points.json: ${placed.toLocaleString()} of ${full.toLocaleString()} full-form filers placed ` +
  `(${(100 * placed / full).toFixed(2)}%), ${coords.length.toLocaleString()} distinct ZIPs, ` +
  `${(JSON.stringify(out).length / 1024 / 1024).toFixed(2)} MB raw`);
if (unplaced.size) {
  const top = [...unplaced.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`  ${unplaced.size} ZIPs had no centroid, e.g. ${top.map(([z, n]) => `${z} (${n})`).join(", ")}`);
}
