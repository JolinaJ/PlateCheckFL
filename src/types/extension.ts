// One facility in the bundled index. Severity-count fields hold the
// issuing authority's own tiers — their meaning depends on jurisdiction:
//   Florida DBPR: hp = high priority, im = intermediate, ba = basic
//   NYC DOHMH:    hp = critical,      im = unused (0),   ba = not critical
//   Columbus PH:  hp/im/ba = 0 in the bundled index — Columbus publishes no
//                 violation counts in bulk, so date and critical/non-critical
//                 violations are fetched on demand from the EnvisionConnect
//                 record when a card is expanded (see the DBPR on-demand
//                 pattern). The bundled overview instead carries the current
//                 permit status in `di` ("Standards Met" / "Under
//                 Enforcement") and an empty `d`.
//   FDACS:        hp/im/ba = 0 -- the Florida Department of Agriculture and
//                 Consumer Services publishes, per establishment, only the
//                 most recent inspection summary and the date of the last
//                 visit. No violation counts and no severity tiers appear in
//                 the public report, so the summary phrase is carried in `di`
//                 (e.g. "Met Sanitation Inspection Requirements", "Focused
//                 Inspection") and the card shows it in place of badges --
//                 never a "0 violations" that the record does not support.
//                 FDACS covers the categories DBPR does not: grocers,
//                 convenience stores, coffee shops, bakeries, markets, juice
//                 and smoothie bars, and certain mobile food units.
//   Cincinnati:   hp/im/ba = 0 — the Cincinnati Health Department publishes
//                 violations without any severity tier at all (no critical
//                 flag, no score, no grade), so there is nothing to put in
//                 the tiered fields. The untiered count of violations cited
//                 at the latest inspection lives in `vt` instead. Reporting
//                 those violations as any tier would be our judgment, not
//                 the authority's record.
// UI labels must always use the jurisdiction's official vocabulary.
export interface IndexedFacility {
  n: string;    // business name
  a: string;    // address
  c: string;    // city (NYC: borough)
  z: string;    // zip (5-digit)
  ln: string;   // license number (NYC: CAMIS; Columbus: FACILITY_ID; Cincinnati: LICENSE_NO)
  co: string;   // county (NYC: borough; Columbus: unused; Cincinnati: HAMILTON)
  p: string;    // phone
  d: string;    // latest inspection date (MM/DD/YYYY); Columbus: "" until on-demand
  t: string;    // inspection type
  di: string;   // inspection disposition (NYC: action; Columbus: permit status; Cincinnati: action status)
  hp: number;   // tier-1 violations (FL: high priority; NYC: critical; Columbus/Cincinnati: 0)
  im: number;   // tier-2 violations (FL: intermediate; NYC/Columbus/Cincinnati: unused)
  ba: number;   // tier-3 violations (FL: basic; NYC: not critical; Columbus/Cincinnati: 0)
  ic: number;   // total inspection count in dataset
  lid: string;  // FL: DBPR internal license ID (licid) for the official deep link; others: unused
  vid: string;  // FL: DBPR inspection visit ID (InspVisitID); NYC: CAMIS; Columbus: FACILITY_ID; Cincinnati: RECORDNUM_INSP (all on-demand fetch keys)
  j?: "nyc" | "columbus" | "cincinnati" | "fdacs"; // jurisdiction; absent = Florida DBPR
  g?: string;   // NYC only: official posted DOHMH grade (A/B/C, or P/Z = pending, N = not yet graded)
  vt?: number;  // Cincinnati only: violations cited at the latest inspection, severity tier not published by the authority
}

// Which authority a record came from. Florida DBPR records carry no `j`,
// so "florida" stands in for the absent tag.
export type Jurisdiction = "florida" | NonNullable<IndexedFacility["j"]>;

// The official sources a no-match note points the reader to, so they can
// look the business up at the source themselves.
//
// `authorities` names the record sets PlateCheck checks, never the agency
// that regulates the establishment (Florida alone splits food service
// across DBPR, FDACS and the Department of Health). `fromZip` says how the
// list was chosen: true when the listing's ZIP placed it in an area, in
// which case an empty list means the area is outside every bundled record
// set; false when the listing had no ZIP, in which case the list is every
// record set in this build.
export interface AuthorityScope {
  authorities: Jurisdiction[];
  fromZip: boolean;
}

export interface ParsedQuery {
  name: string;
  street?: string;
  city?: string;
  zip?: string;
  phone?: string;
}

export type MatchConfidence = "confirmed" | "likely" | "possible" | "unmatched";

// Why a listing produced no card. Derived by the matcher on the no-match
// path and rendered verbatim-ish by the no-match note, so the user is told
// what our data actually did rather than being left to infer it.
//
// Every one of these describes OUR record set, never the establishment.
// The absence of a matched record says nothing about a restaurant — it may
// be licensed under a different name, sit outside a covered jurisdiction,
// or have opened after the last data refresh. The UI copy must preserve
// that distinction (see src/ui/no-match-note.ts).
export type NoMatchReason =
  // The listing's address is outside every jurisdiction this build bundles.
  // Established from the ZIP, which is unique nationally — never guessed
  // from a city name, which is not. An area counts as covered only when it
  // holds a real body of records (MIN_ZIP3_RECORDS in the matcher), not a
  // stray mis-keyed ZIP.
  | "out-of-area"
  // Something is licensed at this street address, but under a name that
  // does not resemble the listing. Usually a tenant change the licence
  // file has not caught up with, or a sub-tenant.
  | "address-different-name"
  // Candidate records resemble the listing but the combined evidence
  // stayed under the display threshold.
  | "low-confidence"
  // Query and candidate agree on the building but name different
  // suites/units — likely a different tenant at a shared address.
  | "unit-mismatch"
  // The listing carried no street address, so a name match could not be
  // corroborated. Common on Google Search organic rows.
  | "no-address"
  // Nothing at this address, nothing resembling this name.
  | "no-record";

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
  // Set only when no card will be shown (confidence is "possible" or
  // "unmatched"); null on a hit. Explains which of the no-match paths the
  // query took, so the UI can say why instead of only that.
  noMatchReason: NoMatchReason | null;
  // For "address-different-name": the facility actually licensed at the
  // queried address. Used for matcher debugging only (logged in development
  // builds); the note never names it, because we could not tie it to the
  // listing.
  addressOccupant: IndexedFacility | null;
}
