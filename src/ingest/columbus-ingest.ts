// Downloads the Columbus Public Health "Inspected Restaurants & Markets"
// layer from the Columbus ArcGIS REST service and builds the compact
// extension overview index. Inspection dates and violations are NOT bundled
// — they are fetched on demand from the facility's EnvisionConnect record
// when a card is expanded, mirroring the DBPR on-demand pattern.
//
// Usage: npm run data:columbus
import { writeFileSync, mkdirSync } from "fs";
import { buildColumbusIndex, type ColumbusFeatureAttrs } from "./columbus.js";

const LAYER =
  "https://maps2.columbus.gov/arcgis/rest/services/Schemas/Health/MapServer/3/query";
const OUT_FIELDS = [
  "FACILITY_ID", "BUSINESS_NAME", "FACILITY_NAME", "SITE_ADDRESS",
  "CITY", "STATE", "ZIP", "PHONE", "STATUS_DESCRIP",
].join(",");
const PAGE_SIZE = 1000;

async function fetchAllFeatures(): Promise<Array<{ attributes: ColumbusFeatureAttrs }>> {
  const features: Array<{ attributes: ColumbusFeatureAttrs }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url =
      `${LAYER}?where=${encodeURIComponent("1=1")}` +
      `&outFields=${OUT_FIELDS}&returnGeometry=false&orderByFields=FACILITY_ID` +
      `&resultOffset=${offset}&resultRecordCount=${PAGE_SIZE}&f=json`;
    console.log(`  Fetching features ${offset}–${offset + PAGE_SIZE}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status} at offset ${offset}`);
    const json = (await res.json()) as {
      features?: Array<{ attributes: ColumbusFeatureAttrs }>;
      error?: { message?: string };
    };
    if (json.error) throw new Error(`ArcGIS error: ${json.error.message}`);
    const page = json.features ?? [];
    features.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return features;
}

const features = await fetchAllFeatures();
console.log(`Downloaded ${features.length} features.`);

mkdirSync("data/raw", { recursive: true });
writeFileSync("data/raw/columbus-facilities.json", JSON.stringify(features));

const index = buildColumbusIndex(features);
const json = JSON.stringify(index);
writeFileSync("src/data/columbus-index.json", json);
const sizeMb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
console.log(
  `Wrote extension index: src/data/columbus-index.json (${index.length} facilities, ${sizeMb} MB)`
);
