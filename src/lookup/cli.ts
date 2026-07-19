import { readFileSync } from "fs";
import { lookupRestaurant } from "./lookup.js";
import { loadManifest } from "../ingest/source-manifest.js";
import type { JoinedFacility, LookupQuery } from "../types/dbpr.js";

function usage(): void {
  console.log(`Usage: npm run lookup -- --name "Restaurant Name" [--city "City"] [--address "Address"] [--zip "ZIP"]`);
  console.log(`\nExample: npm run lookup -- --name "McDonald's" --city "Miami"`);
  process.exit(1);
}

function parseArgs(): LookupQuery {
  const args = process.argv.slice(2);
  const query: LookupQuery = { name: "" };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        query.name = args[++i] ?? "";
        break;
      case "--city":
        query.city = args[++i];
        break;
      case "--address":
        query.address = args[++i];
        break;
      case "--zip":
        query.zip = args[++i];
        break;
      case "--help":
        usage();
        break;
    }
  }

  if (!query.name) {
    console.error("Error: --name is required.\n");
    usage();
  }

  return query;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  return dateStr;
}

function run(): void {
  const query = parseArgs();
  const dataPath = "data/processed/district1.json";
  let facilities: JoinedFacility[];

  try {
    facilities = JSON.parse(readFileSync(dataPath, "utf-8"));
  } catch {
    console.error(
      `Error: ${dataPath} not found. Run 'npm run data:download' then 'npm run data:ingest' first.`
    );
    process.exit(1);
  }

  const manifest = loadManifest();

  console.log("─".repeat(60));
  console.log("PlateCheck FL — DBPR Source Validation Spike");
  console.log("─".repeat(60));
  console.log(`Query: name="${query.name}"${query.city ? ` city="${query.city}"` : ""}${query.address ? ` address="${query.address}"` : ""}${query.zip ? ` zip="${query.zip}"` : ""}`);
  console.log("");

  const result = lookupRestaurant(query, facilities);

  if (result.confidence === "unmatched" && result.candidates.length === 0) {
    console.log("No matching facilities found.");
    console.log("");
    printDisclaimer();
    return;
  }

  if (result.facility && (result.confidence === "confirmed" || result.confidence === "likely")) {
    console.log(`Match confidence: ${result.confidence.toUpperCase()}`);
    console.log("");
    printFacility(result.facility);
  } else {
    console.log(
      `No definitive match. ${result.candidates.length} candidate(s) found.`
    );
    console.log(
      "Provide more identifying information (--address, --city, --zip) to narrow results."
    );
    console.log("");
    for (let i = 0; i < result.candidates.length; i++) {
      const c = result.candidates[i];
      console.log(`  Candidate ${i + 1} (score: ${c.score}, confidence: ${c.confidence}):`);
      console.log(`    ${c.facility.businessName}`);
      console.log(`    ${c.facility.locationAddress}, ${c.facility.locationCity} ${c.facility.locationZip}`);
      console.log(`    License: ${c.facility.licenseNumber}`);
      if (c.facility.inspections.length > 0) {
        const latest = c.facility.inspections[0];
        console.log(`    Latest inspection: ${formatDate(latest.inspectionDate)}`);
      }
      console.log("");
    }
  }

  printDisclaimer();
  printSourceInfo(manifest);
}

function printFacility(fac: JoinedFacility): void {
  console.log(`  Business:  ${fac.businessName}`);
  console.log(`  License:   ${fac.licenseNumber}`);
  console.log(`  Address:   ${fac.locationAddress}, ${fac.locationCity} ${fac.locationZip}`);
  console.log(`  County:    ${fac.locationCounty}`);
  if (fac.phone) console.log(`  Phone:     ${fac.phone}`);
  console.log("");

  if (fac.inspections.length === 0) {
    console.log("  No inspection records in current fiscal year data.");
  } else {
    const latest = fac.inspections[0];
    console.log(`  Latest Inspection:`);
    console.log(`    Date:         ${formatDate(latest.inspectionDate)}`);
    console.log(`    Type:         ${latest.inspectionType}`);
    console.log(`    Disposition:  ${latest.inspectionDisposition}`);
    console.log(`    High Priority violations: ${latest.highPriorityViolations}`);
    console.log(`    Intermediate violations:  ${latest.intermediateViolations}`);
    console.log(`    Basic violations:         ${latest.basicViolations}`);
    console.log(`    Total violations:         ${latest.totalViolations}`);

    if (fac.inspections.length > 1) {
      console.log("");
      console.log(
        `  ${fac.inspections.length - 1} additional inspection(s) in dataset.`
      );
    }
  }
  console.log("");
}

function printDisclaimer(): void {
  console.log("─".repeat(60));
  console.log("DISCLAIMER: DBPR inspection records are historical snapshots.");
  console.log("They reflect conditions observed on the date of inspection");
  console.log("only. Establishments are not graded or rated. This tool does");
  console.log("not determine whether a restaurant is safe or unsafe.");
  console.log("─".repeat(60));
}

function printSourceInfo(manifest: ReturnType<typeof loadManifest>): void {
  if (manifest.entries.length > 0) {
    console.log("\nData source:");
    for (const entry of manifest.entries) {
      console.log(`  ${entry.fileType}: ${entry.fileUrl}`);
      console.log(`  Downloaded: ${entry.downloadTimestamp}`);
      console.log(`  SHA-256: ${entry.sha256.slice(0, 32)}...`);
    }
  }
}

run();
