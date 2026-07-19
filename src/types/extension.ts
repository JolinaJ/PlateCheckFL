// One facility in the bundled index. Severity-count fields hold the
// issuing authority's own tiers — their meaning depends on jurisdiction:
//   Florida DBPR: hp = high priority, im = intermediate, ba = basic
//   NYC DOHMH:    hp = critical,      im = unused (0),   ba = not critical
// UI labels must always use the jurisdiction's official vocabulary.
export interface IndexedFacility {
  n: string;    // business name
  a: string;    // address
  c: string;    // city (NYC: borough)
  z: string;    // zip (5-digit)
  ln: string;   // license number (NYC: CAMIS)
  co: string;   // county (NYC: borough)
  p: string;    // phone
  d: string;    // latest inspection date (MM/DD/YYYY)
  t: string;    // inspection type
  di: string;   // inspection disposition (NYC: action)
  hp: number;   // tier-1 violations (FL: high priority; NYC: critical)
  im: number;   // tier-2 violations (FL: intermediate; NYC: unused)
  ba: number;   // tier-3 violations (FL: basic; NYC: not critical)
  ic: number;   // total inspection count in dataset
  lid: string;  // FL: DBPR internal license ID (licid) for the official deep link; NYC: unused
  vid: string;  // FL: DBPR inspection visit ID (InspVisitID); NYC: CAMIS (used for on-demand violation fetch)
  j?: "nyc";    // jurisdiction; absent = Florida DBPR
  g?: string;   // NYC only: official posted DOHMH grade (A/B/C, or P/Z = pending, N = not yet graded)
}

export interface ParsedQuery {
  name: string;
  street?: string;
  city?: string;
  zip?: string;
  phone?: string;
}

export type MatchConfidence = "confirmed" | "likely" | "possible" | "unmatched";

export interface ExtensionMatchResult {
  confidence: MatchConfidence;
  facility: IndexedFacility | null;
  score: number;
  // True when the query and the matched facility both specify a
  // suite/unit and the values differ (e.g. "Suite 200" vs "Suite 500") —
  // a signal that this may be a different tenant in the same building.
  suiteMismatch: boolean;
  // True when the house number and business name both match strongly but
  // the street name text itself differs (e.g. an honorary street rename
  // DBPR's record hasn't adopted). Confidence is capped at "likely" when
  // this is set — the address text itself is unverified.
  streetNameMismatch: boolean;
  // How many of the returned candidates share the exact same address as
  // the best match (e.g. a multi-floor restaurant licensed per floor).
  // 1 means no other candidate is co-located.
  coLocatedCount: number;
  candidates: Array<{
    facility: IndexedFacility;
    score: number;
    confidence: MatchConfidence;
    suiteMismatch: boolean;
  }>;
}
