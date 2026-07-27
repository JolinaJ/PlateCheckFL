// Builds a region-scoped extension bundle (see src/data/index-set.ts).
//
// Usage: node scripts/build-region.mjs <columbus|nyc|florida>
//
// Exists instead of an inline `PLATECHECK_REGION=... vite build` npm script
// because that syntax is not portable to Windows shells, and instead of
// adding cross-env as a dependency for one variable.
import { build } from "vite";

const VALID_REGIONS = ["columbus", "nyc", "florida"];
const region = process.argv[2];

if (!VALID_REGIONS.includes(region)) {
  console.error(
    `Usage: node scripts/build-region.mjs <${VALID_REGIONS.join("|")}>`
  );
  process.exit(1);
}

// vite.config.ts reads this when the config module is loaded by build().
process.env.PLATECHECK_REGION = region;

await build();
