// Downloads the Cincinnati Food Safety Program dataset from the Cincinnati
// Open Data Socrata API and builds the compact extension index.
//
// Unlike Columbus, Cincinnati publishes inspection dates and violations in
// bulk, so the overview is complete without an on-demand fetch; the card
// still fetches the individual violation text lazily (from the same Socrata
// resource, which sends CORS headers — no service worker involved).
//
// Usage: npm run data:cincinnati
import { writeFileSync, mkdirSync } from "fs";
import { buildCincinnatiIndex, type CincinnatiRow } from "./cincinnati.js";

const RESOURCE = "https://data.cincinnati-oh.gov/resource/rg6p-b3h3.json";
const FIELDS = [
  "license_no", "recordnum_license", "business_name", "address", "city",
  "state", "postal_code", "phone_number", "license_status", "recordnum_insp",
  "insp_type", "insp_subtype", "action_date", "action_status", "code",
  "neighborhood",
].join(",");
const PAGE_SIZE = 50000;

async function fetchAllRows(): Promise<CincinnatiRow[]> {
  const rows: CincinnatiRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url =
      `${RESOURCE}?$select=${FIELDS}&$order=license_no,recordnum_insp` +
      `&$limit=${PAGE_SIZE}&$offset=${offset}`;
    console.log(`  Fetching rows ${offset}–${offset + PAGE_SIZE}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Socrata HTTP ${res.status} at offset ${offset}`);
    const page = (await res.json()) as CincinnatiRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

const rows = await fetchAllRows();
console.log(`Downloaded ${rows.length} rows.`);

mkdirSync("data/raw", { recursive: true });
writeFileSync("data/raw/cincinnati-inspections.json", JSON.stringify(rows));

const index = buildCincinnatiIndex(rows);
const json = JSON.stringify(index);
writeFileSync("src/data/cincinnati-index.json", json);
const sizeMb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
console.log(
  `Wrote extension index: src/data/cincinnati-index.json (${index.length} facilities, ${sizeMb} MB)`
);
