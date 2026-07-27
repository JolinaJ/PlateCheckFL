// Florida-only index set (see index-set.ts). Selected by
// PLATECHECK_REGION=florida. At ~18.8MB this is the largest single region
// and the least likely to be comfortable on mobile.
import dbprIndexUrl from "./dbpr-index.json?url";

export const INDEX_URLS: string[] = [dbprIndexUrl];
