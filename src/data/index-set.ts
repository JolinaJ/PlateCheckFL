// Which jurisdiction indexes this build bundles.
//
// Desktop builds ship everything (default). Mobile builds ship one region:
// an iOS Safari extension is terminated aggressively for memory, and
// loading ~28MB of records plus a 100K-entry token index will not survive
// there — while a single region (Columbus is ~1.1MB) is comfortable.
//
// vite.config.ts swaps this module for one of the index-set.<region>.ts
// siblings when PLATECHECK_REGION is set, so unselected indexes are never
// referenced and Vite never emits them as assets. TypeScript always
// resolves this file, so typechecking sees the full set.
import dbprIndexUrl from "./dbpr-index.json?url";
import nycIndexUrl from "./nyc-index.json?url";
import columbusIndexUrl from "./columbus-index.json?url";
import cincinnatiIndexUrl from "./cincinnati-index.json?url";

export const INDEX_URLS: string[] = [
  dbprIndexUrl,
  nycIndexUrl,
  columbusIndexUrl,
  cincinnatiIndexUrl,
];
