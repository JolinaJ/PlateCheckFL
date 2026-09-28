// Florida-only index set (see index-set.ts). Selected by
// PLATECHECK_REGION=florida. At ~18.8MB this is the largest single region
// and the least likely to be comfortable on mobile.
//
// Scope is DBPR restaurants. Florida also licenses grocers, convenience
// stores, coffee shops, bakeries and certain mobile food units through
// FDACS, and an ingest for that source exists in src/ingest/fdacs.ts — it is
// deliberately not bundled here. Wiring it in means adding fdacs-index.json
// to this list and running `npm run data:fdacs` first.
import dbprIndexUrl from "./dbpr-index.json?url";

export const INDEX_URLS: string[] = [dbprIndexUrl];
