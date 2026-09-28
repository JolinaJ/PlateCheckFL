import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { parseInspectionsCsv } from "./parse-inspections.js";
import { parseLicensesCsv } from "./parse-licenses.js";
import { joinRecords } from "./join-records.js";
import {
  loadArchive,
  mergeInspections,
  saveArchive,
} from "./inspection-archive.js";
import type { JoinedFacility } from "../types/dbpr.js";

const arg = process.argv[2] ?? "all";
const districts = arg === "all" ? ["1", "2", "3", "4", "5", "6", "7"] : [arg];

let allFacilities: JoinedFacility[] = [];

for (const district of districts) {
  const inspFile = `data/raw/${district}fdinspi.csv`;
  const licFile = `data/raw/hrfood${district}.csv`;

  if (!existsSync(inspFile) || !existsSync(licFile)) {
    console.log(`Skipping district ${district} — files not found.`);
    continue;
  }

  console.log(`\nDistrict ${district}:`);
  console.log(`  Parsing inspections from ${inspFile}...`);
  const downloaded = parseInspectionsCsv(inspFile);
  console.log(`  ${downloaded.length} inspection rows in the current extract.`);

  // The extract is a fiscal-year-to-date delta, not the full history, so it is
  // merged into the archive rather than used directly. See
  // src/ingest/inspection-archive.ts for why this is not optional.
  const { merged, added, revised } = mergeInspections(
    loadArchive(district),
    downloaded
  );
  saveArchive(district, merged);
  console.log(
    `  Archive: ${merged.length} inspections (${added} new, ${revised} revised by DBPR).`
  );
  const inspections = merged;

  console.log(`  Parsing licenses from ${licFile}...`);
  const licenses = parseLicensesCsv(licFile);
  console.log(`  ${licenses.length} license rows.`);

  console.log("  Joining...");
  const facilities = joinRecords(licenses, inspections);
  const withInsp = facilities.filter((f) => f.inspections.length > 0);
  console.log(`  ${facilities.length} facilities, ${withInsp.length} with inspections.`);

  mkdirSync("data/processed", { recursive: true });
  writeFileSync(
    `data/processed/district${district}.json`,
    JSON.stringify(facilities, null, 2) + "\n"
  );

  allFacilities = allFacilities.concat(facilities);
}

console.log(`\nTotal: ${allFacilities.length} facilities across ${districts.length} district(s).`);

// The extension index always covers the whole state, whichever districts
// this run touched. Building it from `allFacilities` meant that ingesting a
// single district silently replaced the statewide index with that one
// district -- the same shape of bug as the fiscal-year reset: a command that
// reads like a partial update but performs a full replacement. Every
// district's processed file persists, so the index is rebuilt from all of them.
const ALL_DISTRICTS = ["1", "2", "3", "4", "5", "6", "7"];
const indexSource: JoinedFacility[] = [];
for (const d of ALL_DISTRICTS) {
  const path = `data/processed/district${d}.json`;
  if (!existsSync(path)) {
    console.log(`  (district ${d} not yet ingested - omitted from the index)`);
    continue;
  }
  indexSource.push(...(JSON.parse(readFileSync(path, "utf-8")) as JoinedFacility[]));
}

// Build compact index for the Chrome extension — latest inspection only,
// short keys, only facilities that have at least one inspection.
const compact = indexSource
  .filter((f) => f.inspections.length > 0)
  .map((f) => {
    const i = f.inspections[0];
    return {
      n: f.businessName,
      a: f.locationAddress,
      c: f.locationCity,
      z: f.locationZip.replace(/[^0-9]/g, "").slice(0, 5),
      ln: f.licenseNumber,
      co: f.locationCounty,
      p: f.phone || "",
      d: i.inspectionDate,
      t: i.inspectionType,
      di: i.inspectionDisposition,
      hp: i.highPriorityViolations,
      im: i.intermediateViolations,
      ba: i.basicViolations,
      ic: f.inspections.length,
      lid: i.licenseId,
      vid: i.inspectionVisitId,
    };
  });

const indexPath = "src/data/dbpr-index.json";
const json = JSON.stringify(compact);
writeFileSync(indexPath, json);
const sizeMb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);
console.log(`\nWrote extension index: ${indexPath} (${compact.length} facilities, ${sizeMb} MB)`);
