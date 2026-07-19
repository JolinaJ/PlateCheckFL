import { writeFileSync, mkdirSync, existsSync } from "fs";
import { parseInspectionsCsv } from "./parse-inspections.js";
import { parseLicensesCsv } from "./parse-licenses.js";
import { joinRecords } from "./join-records.js";
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
  const inspections = parseInspectionsCsv(inspFile);
  console.log(`  ${inspections.length} inspection rows.`);

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

// Build compact index for the Chrome extension — latest inspection only,
// short keys, only facilities that have at least one inspection.
const compact = allFacilities
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
