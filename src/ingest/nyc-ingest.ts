// Downloads the NYC DOHMH Restaurant Inspection Results dataset from the
// NYC Open Data Socrata API and builds the compact extension index.
//
// Usage: npm run data:nyc
import { writeFileSync, mkdirSync } from "fs";
import { buildNycIndex, type NycInspectionRow } from "./nyc.js";

const RESOURCE = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const FIELDS = [
  "camis", "dba", "boro", "building", "street", "zipcode", "phone",
  "inspection_date", "action", "critical_flag", "score", "grade",
  "grade_date", "inspection_type",
].join(",");
const PAGE_SIZE = 50000;

async function fetchAllRows(): Promise<NycInspectionRow[]> {
  const rows: NycInspectionRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${RESOURCE}?$select=${FIELDS}&$order=camis&$limit=${PAGE_SIZE}&$offset=${offset}`;
    console.log(`  Fetching rows ${offset}–${offset + PAGE_SIZE}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Socrata HTTP ${res.status} at offset ${offset}`);
    const page = (await res.json()) as NycInspectionRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

const rows = await fetchAllRows();
console.log(`Downloaded ${rows.length} rows.`);

mkdirSync("data/raw", { recursive: true });
writeFileSync("data/raw/nyc-inspections.json", JSON.stringify(rows));

const index = buildNycIndex(rows);
const json = JSON.stringify(index);
writeFileSync("src/data/nyc-index.json", json);
const sizeMb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);
console.log(`Wrote extension index: src/data/nyc-index.json (${index.length} facilities, ${sizeMb} MB)`);
