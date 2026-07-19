import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { createHash } from "crypto";
import { addManifestEntry } from "./source-manifest.js";

const SOURCE_PAGE =
  "https://www2.myfloridalicense.com/hotels-restaurants/public-records/";

const DISTRICT_URLS: Record<
  string,
  { inspection: string; license: string }
> = {};
for (let d = 1; d <= 7; d++) {
  DISTRICT_URLS[String(d)] = {
    inspection: `https://www2.myfloridalicense.com/sto/file_download/extracts/${d}fdinspi.csv`,
    license: `https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood${d}.csv`,
  };
}

async function downloadFile(url: string, dest: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buffer);
  return createHash("sha256").update(buffer).digest("hex");
}

export async function downloadDistrict(district: string): Promise<void> {
  const urls = DISTRICT_URLS[district];
  if (!urls) {
    throw new Error(
      `District ${district} not configured. Available: ${Object.keys(DISTRICT_URLS).join(", ")}`
    );
  }

  mkdirSync("data/raw", { recursive: true });
  mkdirSync("data/processed", { recursive: true });

  const now = new Date().toISOString();

  console.log(`Downloading District ${district} inspections...`);
  const inspFile = `data/raw/${district}fdinspi.csv`;
  const inspSha = await downloadFile(urls.inspection, inspFile);
  console.log(`  -> ${inspFile} (SHA-256: ${inspSha.slice(0, 16)}...)`);

  addManifestEntry({
    sourcePageUrl: SOURCE_PAGE,
    fileUrl: urls.inspection,
    downloadTimestamp: now,
    localFilename: inspFile,
    sha256: inspSha,
    district,
    fileType: "inspection",
  });

  console.log(`Downloading District ${district} licenses...`);
  const licFile = `data/raw/hrfood${district}.csv`;
  const licSha = await downloadFile(urls.license, licFile);
  console.log(`  -> ${licFile} (SHA-256: ${licSha.slice(0, 16)}...)`);

  addManifestEntry({
    sourcePageUrl: SOURCE_PAGE,
    fileUrl: urls.license,
    downloadTimestamp: now,
    localFilename: licFile,
    sha256: licSha,
    district,
    fileType: "license",
  });

  console.log("Download complete. Manifest updated.");
}

// CLI entry — pass "all" to download every district, or a number for one.
const arg = process.argv[2] ?? "all";

async function main() {
  if (arg === "all") {
    for (const d of Object.keys(DISTRICT_URLS)) {
      await downloadDistrict(d);
    }
  } else {
    await downloadDistrict(arg);
  }
}

main().catch((err) => {
  console.error("Download failed:", err.message);
  process.exit(1);
});
