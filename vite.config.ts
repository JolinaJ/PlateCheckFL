import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "url";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

// Which jurisdictions to bundle. Unset (the default) ships all of them —
// the desktop build. Setting it to a region name swaps src/data/index-set.ts
// for the matching index-set.<region>.ts, so the other indexes are never
// referenced and Vite never emits them: the mobile builds, which cannot
// afford ~28MB of records in an iOS Safari extension. See src/data/index-set.ts.
const REGION = process.env.PLATECHECK_REGION;
const VALID_REGIONS = ["columbus", "cincinnati", "nyc", "florida"];

if (REGION && !VALID_REGIONS.includes(REGION)) {
  throw new Error(
    `PLATECHECK_REGION="${REGION}" is not one of: ${VALID_REGIONS.join(", ")}`
  );
}

const resolvePath = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Compare module ids across platforms: Vite emits forward slashes while
// fileURLToPath yields backslashes on Windows, and Windows paths are
// case-insensitive.
const normalizeId = (id: string) =>
  id.replace(/\\/g, "/").replace(/\?.*$/, "").toLowerCase();

// A plain resolve.alias cannot do this: alias matches the raw import
// specifier ("../data/index-set.js"), not the file it resolves to. This
// lets Vite resolve normally, then redirects only when the result is
// actually the index-set module.
function regionIndexSet(region: string): Plugin {
  const target = normalizeId(resolvePath("./src/data/index-set.ts"));
  const replacement = resolvePath(`./src/data/index-set.${region}.ts`);
  return {
    name: "platecheck-region-index-set",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer) return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (resolved && normalizeId(resolved.id) === target) return replacement;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [...(REGION ? [regionIndexSet(REGION)] : []), crx({ manifest })],
  build: {
    chunkSizeWarningLimit: 5000,
  },
  test: {
    globals: true,
  },
});
