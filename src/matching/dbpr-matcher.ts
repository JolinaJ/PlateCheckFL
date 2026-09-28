import type {
  IndexedFacility,
  ParsedQuery,
  ExtensionMatchResult,
  MatchConfidence,
  NoMatchReason,
  Jurisdiction,
  AuthorityScope,
} from "../types/extension.js";

// --- Scoring weights ---
const WEIGHT_NAME = 40;
const WEIGHT_STREET = 30;
const WEIGHT_CITY = 15;
const WEIGHT_ZIP = 5;
const WEIGHT_PHONE = 10;

// --- Thresholds ---
// Also doubles as the "at least a partial match" bar for the
// address-confirms-with-partial-name policy below.
const NAME_FLOOR = 0.35;
const NAME_STRONG = 0.75;
const STREET_STRONG = 0.7;
const LIKELY_THRESHOLD = 55;
const POSSIBLE_THRESHOLD = 35;
// When a facility-name core is rare enough to still earn the "core appears
// in query" boost. A core qualifies on either bar: at most CORE_DF_ABS
// records carry its rarest token, or that token covers at most CORE_DF_MAX
// of the index (0.5% of Florida is ~340 records). The absolute bar is what
// makes the rule meaningful on a small index -- against five records every
// token looks common as a fraction, so the ratio alone would switch the
// boost off entirely. See coreIsDistinctive.
const CORE_DF_ABS = 3;
const CORE_DF_MAX = 0.005;
const AMBIGUITY_GAP = 8;
const MAX_CANDIDATES = 3;
// How many of one jurisdiction's records a ZIP3 must hold before it counts
// as covered by that jurisdiction. The source data carries stray mis-keyed
// ZIPs: DBPR rows with Illinois (604, 610), Buffalo (140) or Nashville (370)
// ZIPs, and DOHMH rows with New Jersey (070, 073, 076) or Long Island (115,
// 117, 119) ZIPs, 1-6 records each. Every real covered area holds dozens to
// thousands. Without a floor, one stray would make an out-of-state listing
// read as "no matching record" instead of out-of-area, and would make the
// no-match note name an authority that has nothing to do with the area.
export const MIN_ZIP3_RECORDS = 10;

// DBPR often appends these to business names. Stripping them before
// comparison prevents "JOE'S CRAB" vs "JOE'S CRAB RESTAURANT" from
// scoring poorly due to an extra token.
const BUSINESS_TYPE_SUFFIXES = /\b(restaurant|rest|ristorante|cafe|café|caffe|diner|grill|grille|grillhouse|bar|pub|tavern|lounge|kitchen|eatery|bistro|brasserie|trattoria|pizzeria|bakery|steakhouse|seafood|sushi|bbq|barbecue|taqueria|cantina|brewery|taphouse|deli|delicatessen|creamery|gelateria|food|foods|market|shoppe|shop|house|palace|express|station|shack|hut|joint|pit|spot|den|corner|place|room|landing|inn|hotel|motel|resort|club|corporation|corp|enterprises|enterprise|group|holdings|of|the|and|a|an|no|inc|llc|ltd|co)\b\.?/gi;

// An inverted index from normalized name token -> the positions (in the
// original facilities array) of every facility whose name contains that
// token. Built once and reused across every query on a page, it lets a
// query score only the facilities that share a name token instead of
// linearly scanning all ~95K records.
//
// The token index is built eagerly (it's what makes blocking possible).
// The two costlier normalizations — business-suffix stripping (`names[i]`'s
// sdt) and street parsing (`streets[i]`) — are filled lazily and cached the
// first time a facility is actually scored. The overwhelming majority of
// records are never a candidate for any query on a page, so eagerly
// normalizing all of them just to build the index wastes seconds of the
// first card's latency for work that's thrown away.
export interface MatchIndex {
  facilities: IndexedFacility[];
  byToken: Map<string, number[]>;
  names: NamePrep[];
  streets: Array<StreetParts | null>;
  // Address-side lookups used only to explain a no-match (see
  // classifyNoMatch). Both are null until the first query fails to
  // produce a card, for the same reason `streets` is lazy: a page where
  // everything matches never needs them, and building them costs a full
  // pass over every record.
  byHouseZip: Map<string, number[]> | null;
  // Covered three-digit ZIP prefixes, NOT full ZIPs, each mapped to the
  // jurisdictions (sorted) whose records cover it. A ZIP3 is a postal
  // sectional centre (336 = Tampa), so it answers "is this area covered" —
  // which is the question — while an exact-ZIP set answers "does a
  // licensed facility sit in this precise ZIP", which is not. A covered ZIP
  // holding no licensed restaurant (33620, the USF campus) would otherwise
  // be reported to the user as outside Florida. A jurisdiction covers a
  // ZIP3 only with at least MIN_ZIP3_RECORDS records there; a ZIP3 no
  // jurisdiction covers is absent.
  zipPrefixes: Map<string, Jurisdiction[]> | null;
  // Normalized full street text -> facility positions. The ZIP-keyed map
  // above cannot serve a Google Search local-pack row, which usually
  // carries a bare street line and no ZIP at all; this one can, because
  // the street text itself ("1442 sw 8 st") is discriminating.
  byStreet: Map<string, number[]> | null;
  // Human-readable list of the jurisdictions this build actually bundles,
  // for the out-of-area note. Derived from the records rather than
  // hardcoded, so a region-scoped mobile build says only what it ships.
  coverage: string | null;
  // The same jurisdictions as tags, sorted, for the no-match note's links
  // when the listing gives no ZIP.
  jurisdictions: Jurisdiction[] | null;
}

// Build the token index. Per facility this does only the cheap half of
// normalization (lowercasing/tokenizing the name); the expensive suffix
// strip and street parse are deferred to scoring time (see sdtOf and the
// street cache in matchFacility). Facilities are pushed in ascending array
// order, so every bucket stays sorted by original position.
export function buildMatchIndex(facilities: IndexedFacility[]): MatchIndex {
  const byToken = new Map<string, number[]>();
  const names: NamePrep[] = new Array(facilities.length);
  const streets: Array<StreetParts | null> = new Array(facilities.length).fill(null);
  for (let i = 0; i < facilities.length; i++) {
    const name = prepareName(facilities[i].n);
    names[i] = name;
    const seen = new Set<string>();
    for (const tok of name.td) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      const bucket = byToken.get(tok);
      if (bucket) bucket.push(i);
      else byToken.set(tok, [i]);
    }
  }
  return {
    facilities, byToken, names, streets,
    byHouseZip: null, zipPrefixes: null, byStreet: null, coverage: null,
    jurisdictions: null,
  };
}

// The set of facility positions worth scoring for this query: any facility
// that shares at least one name token with the query. The variant lookups
// (plural/singular of each query token) mirror containmentWithPlural
// exactly, so this set is a provable superset of every facility that could
// score above 0 in the name similarity — dropping the rest changes nothing
// but the work done. Returned ascending so the scored order matches what a
// full linear scan would produce, keeping results identical.
function candidateIndices(queryName: NamePrep, index: MatchIndex): number[] {
  if (queryName.td.length === 0) return [];

  const lookups = new Set<string>();
  for (const t of queryName.td) {
    lookups.add(t);
    lookups.add(t + "s");
    lookups.add(t + "es");
    if (t.endsWith("es") && t.length > 2) lookups.add(t.slice(0, -2));
    if (t.endsWith("s") && t.length > 1) lookups.add(t.slice(0, -1));
  }

  const seen = new Set<number>();
  for (const key of lookups) {
    const bucket = index.byToken.get(key);
    if (bucket) for (const i of bucket) seen.add(i);
  }
  return [...seen].sort((a, b) => a - b);
}

// Fill the address-side lookups used to explain a no-match. One pass over
// every record, done at most once per index and only when some query has
// already failed — see the MatchIndex field comment.
//
// The house-number+ZIP key is deliberately coarse. It is never used to
// assert a match (matchFacility's scoring alone decides that); it only
// answers "is anything at all licensed at this address", which is what
// separates "we have no record here" from "the record here is filed under
// another name".
function ensureAddressIndex(index: MatchIndex): void {
  if (index.byHouseZip && index.zipPrefixes && index.byStreet && index.jurisdictions) return;
  const byHouseZip = new Map<string, number[]>();
  const byStreet = new Map<string, number[]>();
  // ZIP3 -> jurisdiction -> record count, reduced to zipPrefixes below.
  const zip3Counts = new Map<string, Map<Jurisdiction, number>>();
  const seenJurisdictions = new Set<Jurisdiction>();
  for (let i = 0; i < index.facilities.length; i++) {
    const fac = index.facilities[i];
    const j: Jurisdiction = fac.j ?? "florida";
    seenJurisdictions.add(j);
    if (fac.z.length >= 3) {
      const z3 = fac.z.slice(0, 3);
      let counts = zip3Counts.get(z3);
      if (!counts) zip3Counts.set(z3, (counts = new Map()));
      counts.set(j, (counts.get(j) ?? 0) + 1);
    }
    const streetKey = parseStreetParts(fac.a).base;
    if (streetKey) {
      const sb = byStreet.get(streetKey);
      if (sb) sb.push(i);
      else byStreet.set(streetKey, [i]);
    }

    const house = leadingStreetNumber(fac.a);
    if (!house || !fac.z) continue;
    const key = `${house}|${fac.z}`;
    const bucket = byHouseZip.get(key);
    if (bucket) bucket.push(i);
    else byHouseZip.set(key, [i]);
  }
  const zipPrefixes = new Map<string, Jurisdiction[]>();
  for (const [z3, counts] of zip3Counts) {
    const covering = [...counts]
      .filter(([, n]) => n >= MIN_ZIP3_RECORDS)
      .map(([j]) => j)
      .sort();
    if (covering.length > 0) zipPrefixes.set(z3, covering);
  }
  index.byHouseZip = byHouseZip;
  index.byStreet = byStreet;
  index.zipPrefixes = zipPrefixes;
  index.jurisdictions = [...seenJurisdictions].sort();
  index.coverage = formatCoverage(seenJurisdictions);
}

const JURISDICTION_NAMES: Record<Jurisdiction, string> = {
  florida: "Florida",
  // FDACS records are Florida too, so they collapse into the same coverage
  // label rather than reading as a separate region to the user.
  fdacs: "Florida",
  nyc: "New York City",
  columbus: "Columbus, OH",
  cincinnati: "Cincinnati, OH",
};

function formatCoverage(jurisdictions: Set<Jurisdiction>): string {
  const names = [...new Set([...jurisdictions].map((j) => JURISDICTION_NAMES[j] ?? j))]
    .sort();
  if (names.length <= 1) return names[0] ?? "no regions";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// The records worth offering when no match was confident enough to show a
// card: "we could not confirm one, but these are what we looked at."
//
// Two rules keep this honest. Only candidates that independently reached
// "possible" are included — everything below that threshold scored on a
// stray shared token and listing it would manufacture a lead that the
// evidence does not support. And the address occupant leads the list when
// there is one: it got there on address evidence rather than name
// similarity, which is the stronger signal, and it is the record the user
// is most likely to actually want.
//
// These are never rendered (CLAUDE.md, 2026-08-25): naming a licensed
// establishment beside a listing we could not tie to it presents our guess
// as a finding. The content script logs them in development builds for
// matcher debugging, which is the only use left for them.
export function noMatchCandidates(
  result: ExtensionMatchResult,
  query: ParsedQuery
): IndexedFacility[] {
  const out: IndexedFacility[] = [];
  const seen = new Set<string>();
  const add = (fac: IndexedFacility) => {
    if (out.length >= MAX_CANDIDATES || seen.has(fac.ln)) return;
    seen.add(fac.ln);
    out.push(fac);
  };

  // The occupant was found by address, so it is the strongest lead there
  // is and always leads.
  if (result.addressOccupant) add(result.addressOccupant);

  const qCity = query.city ? normalizeCity(query.city) : "";
  const qZip3 = (query.zip ?? "").replace(/[^0-9]/g, "").slice(0, 3);

  // Locality ranks candidates; it does not filter them.
  //
  // It cannot filter, because most Google Search local-pack rows carry a
  // bare street line and no city or ZIP at all (see the captured markup in
  // tests/fixtures/local-pack-real-unclassed.html) — a hard locality
  // requirement silently produced an empty list on exactly the surface
  // this feature exists for.
  //
  // Showing the rest is safe because every row renders its full address
  // including city: a reader looking for a Tampa restaurant can see that
  // "SMOOTHIE SPOT | 10261 PINES BLVD, PEMBROKE PINES" is not it. The
  // address is the disambiguator, the same way it separates the two
  // Gainesville Checkers licences. Hiding a same-name record in another
  // city would be deciding for the reader on evidence we told them we do
  // not have.
  const ranked = result.candidates
    .filter((c) => c.confidence !== "unmatched")
    .map((c, i) => ({ c, i, local: sharesLocality(c.facility, qCity, qZip3) }))
    .sort((a, b) => Number(b.local) - Number(a.local) || a.i - b.i);

  // Once there is a definite hit — a licence found at this very address —
  // padding the list out to three with same-name records from elsewhere
  // in the state dilutes it rather than adding anything. A listing at
  // 1120 Collins Ave whose occupant is on file is not helped by a
  // trattoria in Naples. Without such a hit the whole ranked set is shown
  // and the reader judges by the city in each row.
  const strict = result.addressOccupant !== null;
  for (const { c, local } of ranked) {
    if (strict && !local) continue;
    add(c.facility);
  }
  return out;
}

// Whether a candidate sits in the listing's area, used to order the list
// so local records come first. A strong name match alone clears the
// "possible" threshold with no geographic evidence at all — a Tampa
// "Planet Smoothie" scores against smoothie shops in Jacksonville, Miami
// and Pembroke Pines — so without this the order would be arbitrary and
// the nearest record could land third. Same city or same ZIP3 (the postal
// sectional centre); false whenever the query gives neither, which leaves
// the matcher's own ranking intact.
function sharesLocality(fac: IndexedFacility, qCity: string, qZip3: string): boolean {
  if (qCity && normalizeCity(fac.c) === qCity) return true;
  if (qZip3.length === 3 && fac.z.slice(0, 3) === qZip3) return true;
  return false;
}

// The jurisdictions this index actually holds, phrased for display.
// Callers use it only on the no-match path, so the underlying pass is
// already warm by the time this runs.
export function coverageLabel(index: MatchIndex): string {
  ensureAddressIndex(index);
  return index.coverage ?? "no regions";
}

// The query's ZIP reduced to at most five digits. classifyNoMatch and
// authoritiesForQuery both let only a full five digits place the listing,
// so "out-of-area" and an empty authority list always agree.
function queryZipDigits(query: ParsedQuery): string {
  return (query.zip ?? "").replace(/[^0-9]/g, "").slice(0, 5);
}

// Whose own search the no-match note offers the reader.
//
// With a 5-digit ZIP: the jurisdictions whose records cover that ZIP3,
// which is empty exactly when classifyNoMatch calls the listing
// out-of-area. With no ZIP (the usual Google Search local-pack row): every
// jurisdiction this build bundles, because there is nothing to choose by.
//
// The area is never inferred from a rejected name candidate. Candidates come
// from name tokens across every bundled jurisdiction, so an unmatched Queens
// "Joe's Pizza" can have a Florida top candidate, and naming Florida for it
// would repeat the exact mistake this replaces.
export function authoritiesForQuery(query: ParsedQuery, index: MatchIndex): AuthorityScope {
  ensureAddressIndex(index);
  const qZip = queryZipDigits(query);
  if (qZip.length === 5) {
    return { authorities: [...(index.zipPrefixes!.get(qZip.slice(0, 3)) ?? [])], fromZip: true };
  }
  return { authorities: [...index.jurisdictions!], fromZip: false };
}

// Work out why a listing produced no card, so the UI can say which of the
// no-match paths it took. Checks run most-specific first; each one is a
// statement about our record set, never about the establishment.
function classifyNoMatch(
  query: ParsedQuery,
  top: Array<{ facility: IndexedFacility; suiteMismatch: boolean }>,
  index: MatchIndex
): { reason: NoMatchReason; occupant: IndexedFacility | null } {
  const qZip = queryZipDigits(query);

  // Coverage first: a ZIP outside every bundled jurisdiction explains the
  // no-match completely, and no other check would say anything truer.
  // Keyed on ZIP rather than city because ZIPs are unique nationally and
  // city names are not — "Springfield" must never trigger this. A ZIP3
  // holding only a few stray records does not count as covered (see
  // MIN_ZIP3_RECORDS).
  if (qZip.length === 5) {
    ensureAddressIndex(index);
    if (!index.zipPrefixes!.has(qZip.slice(0, 3))) {
      return { reason: "out-of-area", occupant: null };
    }
  }

  // A known unit conflict is more specific than "low confidence" — we
  // matched the building and can say the units disagree.
  if (top.length > 0 && top[0].suiteMismatch) {
    return { reason: "unit-mismatch", occupant: null };
  }

  if (!query.street) return { reason: "no-address", occupant: null };

  // Is anything licensed at this street address under some other name?
  const house = leadingStreetNumber(query.street);
  if (house) {
    ensureAddressIndex(index);
    let bucket: number[] | undefined;
    if (qZip) {
      // House number + ZIP only narrows it to a block. The street itself
      // has to agree before the note may say "at this address": 1 MAIN ST
      // and 1 PERRY ST share the key 1|10014. About 15% of bundled records
      // share their house|ZIP key only with records on another street.
      const qStreet = query.street;
      bucket = index.byHouseZip!
        .get(`${house}|${qZip}`)
        ?.filter((i) => streetMatch(qStreet, index.facilities[i].a).similarity >= STREET_STRONG);
    } else {
      // No ZIP — the usual case for a Google Search local-pack row. Fall
      // back to the street text, but only trust it when every record it
      // finds sits in one city: "100 MAIN ST" recurs across Florida, and
      // naming an occupant from the wrong town would be worse than saying
      // nothing.
      const byStreet = index.byStreet!.get(parseStreetParts(query.street).base);
      if (byStreet && byStreet.length > 0) {
        const cities = new Set(byStreet.map((i) => normalizeCity(index.facilities[i].c)));
        if (cities.size === 1) bucket = byStreet;
      }
    }
    if (bucket && bucket.length > 0) {
      // Only informative if it is a *different* record than the candidate
      // we already rejected — otherwise "low confidence" is the honest
      // description of what happened.
      const topLicense = top[0]?.facility.ln;
      const other = bucket
        .map((i) => index.facilities[i])
        .find((f) => f.ln !== topLicense);
      if (other) return { reason: "address-different-name", occupant: other };
    }
  }

  if (top.length > 0) return { reason: "low-confidence", occupant: null };
  return { reason: "no-record", occupant: null };
}

export function matchFacility(
  query: ParsedQuery,
  source: IndexedFacility[] | MatchIndex
): ExtensionMatchResult {
  // Accept either the raw facilities array (used by tests and one-off
  // lookups) or a prebuilt index (used by the content script, which builds
  // it once and reuses it across every query on the page).
  const index = Array.isArray(source) ? buildMatchIndex(source) : source;

  // Normalize the query's name and street once per query, not per candidate.
  const queryName = prepareName(query.name);
  const queryStreet = query.street ? parseStreetParts(query.street) : null;

  const scored: Array<{
    facility: IndexedFacility;
    score: number;
    confidence: MatchConfidence;
    suiteMismatch: boolean;
    streetNameMismatch: boolean;
  }> = [];

  for (const i of candidateIndices(queryName, index)) {
    const fac = index.facilities[i];
    const nSim = nameSimilarityPrepared(queryName, index.names[i], index);
    if (nSim < NAME_FLOOR) continue;

    let score = 0;
    score += nSim >= NAME_STRONG ? WEIGHT_NAME : WEIGHT_NAME * (nSim / NAME_STRONG);

    let hasStreetEvidence = false;
    let suiteMismatch = false;
    let streetNameMismatch = false;
    if (queryStreet) {
      // Parse the facility's street on first use and cache it — only
      // candidates that reach this point (already past the name floor) ever
      // need it, so this stays off the index-build critical path.
      let facStreet = index.streets[i];
      if (facStreet === null) {
        facStreet = parseStreetParts(fac.a);
        index.streets[i] = facStreet;
      }
      const street = streetMatchParts(queryStreet, facStreet);
      suiteMismatch = street.suiteMismatch;
      score += street.similarity >= STREET_STRONG ? WEIGHT_STREET : WEIGHT_STREET * (street.similarity / STREET_STRONG);
      // A suite/unit mismatch means this is likely a different tenant in
      // the same building — the base street matching is not sufficient
      // evidence on its own when we know the specific units conflict.
      hasStreetEvidence = street.similarity >= STREET_STRONG && !suiteMismatch;

      // The full street text can fail to match even at the same building
      // when a street has been renamed (Florida frequently assigns
      // honorary street names — e.g. "Steve Spurrier Way" — that some
      // government records adopt and others, like an older DBPR license,
      // still carry under the legacy grid name "SW 31st Place"). When the
      // house number matches exactly and the business name is a very
      // strong, distinctive match, treat that as corroborating evidence
      // even though the street name text itself doesn't agree.
      if (!hasStreetEvidence && !suiteMismatch) {
        const qNum = leadingStreetNumber(query.street ?? "");
        const fNum = leadingStreetNumber(fac.a);
        if (qNum && fNum && qNum === fNum && nSim >= NAME_STRONG) {
          streetNameMismatch = true;
        }
      }
    }

    let hasCityEvidence = false;
    if (query.city) {
      if (normalizeCity(query.city) === normalizeCity(fac.c)) {
        score += WEIGHT_CITY;
        hasCityEvidence = true;
      }
    }

    if (query.zip) {
      const qz = query.zip.replace(/[^0-9]/g, "").slice(0, 5);
      if (qz === fac.z) score += WEIGHT_ZIP;
    }

    if (query.phone) {
      const qp = query.phone.replace(/[^0-9]/g, "");
      const fp = fac.p.replace(/[^0-9]/g, "");
      if (qp.length >= 10 && qp === fp) score += WEIGHT_PHONE;
    }

    score = Math.round(Math.min(100, Math.max(0, score)));

    // Product policy: a specific street-address match is itself a highly
    // discriminating signal — two different restaurants essentially never
    // share an exact street address. Once the address matches strongly,
    // the name only needs to clear the floor (i.e. be at least a partial
    // match — which every candidate reaching this point already does) for
    // the result to be treated as full confidence. This deliberately does
    // not require near-perfect name-string similarity on top of the
    // address match, since DBPR's terse legal/DBA names rarely match
    // Google's longer marketing copy verbatim (see dbprNameSimilarity).
    let confidence: MatchConfidence;
    if ((hasStreetEvidence && nSim >= NAME_FLOOR) || streetNameMismatch) {
      // Matching house number + a very strong, distinctive name is treated
      // as full address corroboration on par with a direct text match —
      // even when the street name itself differs (an honorary rename DBPR
      // hasn't adopted, or a building-designator suffix the normalizer
      // doesn't recognize). The house number is the actual discriminating
      // signal; the street name text is just one way of expressing it.
      confidence = query.city && !hasCityEvidence ? "likely" : "confirmed";
    } else if (score >= LIKELY_THRESHOLD && nSim >= NAME_STRONG) {
      confidence = "likely";
    } else if (score >= POSSIBLE_THRESHOLD) {
      confidence = "possible";
    } else {
      confidence = "unmatched";
    }

    // A flagged suite/unit mismatch is a known conflict signal — cap
    // confidence at "possible" regardless of which path produced it above,
    // so a mismatch is never silently displayed as a confirmed/likely card.
    if (suiteMismatch && (confidence === "confirmed" || confidence === "likely")) {
      confidence = "possible";
    }

    scored.push({ facility: fac, score, confidence, suiteMismatch, streetNameMismatch });
  }

  // Confidence breaks score ties. Rounded scores tie easily (e.g. a chain
  // name matched against many same-brand facilities whose street text
  // shares a token or two), and index order must never decide which
  // candidate wins — an address-corroborated "confirmed" at 54 outranks a
  // name-plus-coincidental-street-token "possible" at 54.
  const CONFIDENCE_RANK: Record<MatchConfidence, number> = {
    confirmed: 3, likely: 2, possible: 1, unmatched: 0,
  };
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]
  );
  const top = scored.slice(0, MAX_CANDIDATES);

  if (top.length === 0) {
    const why = classifyNoMatch(query, [], index);
    return {
      confidence: "unmatched",
      facility: null,
      score: 0,
      suiteMismatch: false,
      streetNameMismatch: false,
      coLocatedCount: 0,
      candidates: [],
      noMatchReason: why.reason,
      addressOccupant: why.occupant,
    };
  }

  let best = top[0];
  let confidence = best.confidence;

  // How many of the top candidates sit at the exact same address as the
  // best match (e.g. a multi-floor restaurant licensed as separate
  // entities per floor). This is a different, milder kind of ambiguity
  // than two close-scoring candidates at *different* addresses — we
  // already know it's the same building, so it doesn't need the usual
  // confidence downgrade, just a note that more than one license exists
  // there.
  const coLocatedCount = top.filter((c) => c.facility.a === best.facility.a).length;

  // The ambiguity downgrade only makes sense when the runner-up is itself
  // a credible alternative (independently reached "confirmed" or "likely"
  // on its own evidence) — e.g. two chain locations that both have a
  // plausible claim. A runner-up that only scored "possible" typically got
  // there from a strong name match alone with no real address
  // corroboration (a different business that happens to share a brand
  // name elsewhere); being numerically close in raw score to a genuinely
  // address-confirmed top match isn't real ambiguity and shouldn't punish
  // the top match for it.
  if (
    top.length >= 2 &&
    best.score - top[1].score < AMBIGUITY_GAP &&
    top[1].facility.a !== best.facility.a &&
    (top[1].confidence === "confirmed" || top[1].confidence === "likely")
  ) {
    if (confidence === "confirmed") confidence = "likely";
    else if (confidence === "likely") confidence = "possible";
    else confidence = "unmatched";
  }

  // A card is only injected for "confirmed"/"likely" (see the content
  // script). Anything else is a no-match from the user's point of view,
  // so it carries the reason that explains it.
  const shown = confidence === "confirmed" || confidence === "likely";
  const why = shown ? null : classifyNoMatch(query, top, index);

  return {
    confidence,
    facility: confidence !== "unmatched" ? best.facility : null,
    score: best.score,
    suiteMismatch: best.suiteMismatch,
    streetNameMismatch: best.streetNameMismatch,
    coLocatedCount,
    noMatchReason: why?.reason ?? null,
    addressOccupant: why?.occupant ?? null,
    candidates: top,
  };
}

// --- Name similarity tuned for DBPR records ---

function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    // Fold diacritics before anything else strips them. Google renders a
    // restaurant's marketing spelling ("Pokebowl Station" with an acute e,
    // "Creme Bakery" with a grave e) while the authorities' records are
    // plain ASCII. Without folding, the accented letter is not a \w
    // character, so the punctuation rule below replaces it with a SPACE and
    // splits one distinctive token into two meaningless ones -- "pokebowl"
    // became "pok" + "bowl", which then matched BOWL BAR in Tampa and
    // dropped the real POKEBOWL STATION at the queried address below
    // NAME_FLOOR entirely. NFD splits an accented letter into its base plus
    // a combining mark; removing the marks leaves the base letter.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Apostrophes are deleted, not spaced, so "mcdonald's" collapses to
    // "mcdonalds" the way the authority writes it. Every typographic variant
    // has to be listed explicitly and as an escape: Google renders its
    // business names with U+2019, and the character class here previously
    // held two copies of the ASCII apostrophe -- almost certainly a curly
    // pair that some editor straightened on save. The result was that
    // "McDonald’s" fell through to the punctuation rule below, became
    // "mcdonald s", and scored 0.440 against MCDONALDS instead of 1.000,
    // dropping every possessive chain name below NAME_STRONG. Escapes cannot
    // be silently rewritten the way literal quote characters can.
    .replace(/['‘’ʼ´′`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBusinessType(s: string): string {
  return s.replace(BUSINESS_TYPE_SUFFIXES, "").replace(/\s+/g, " ").trim();
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter((t) => t.length > 0);
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter((t) => sb.has(t)).length;
  return inter / new Set([...sa, ...sb]).size;
}

// Containment: what fraction of query tokens appear in the facility name?
// This handles "JOE'S CRAB" matching "JOE'S STONE CRABS RESTAURANT"
// better than Jaccard alone.
function containment(queryTokens: string[], facilityTokens: string[]): number {
  if (!queryTokens.length) return 0;
  const fb = new Set(facilityTokens);
  const matched = queryTokens.filter((t) => fb.has(t)).length;
  return matched / queryTokens.length;
}

// A name normalized into the token forms the similarity function needs.
// `nd`/`td` are computed eagerly (needed to build the token index); `sdt`
// (business-suffix-stripped tokens) is filled lazily by sdtOf the first
// time this name is scored, since the strip regex is expensive and most
// indexed facilities are never scored.
interface NamePrep {
  nd: string;             // fully normalized name string
  td: string[];           // its tokens
  sdt: string[] | null;   // tokens after stripping business-type suffixes (lazy)
}

function prepareName(s: string): NamePrep {
  const nd = normalizeForComparison(s);
  return { nd, td: tokenize(nd), sdt: null };
}

function sdtOf(p: NamePrep): string[] {
  if (p.sdt === null) p.sdt = tokenize(stripBusinessType(p.nd));
  return p.sdt;
}

// Whether a business-type-stripped facility name still identifies a
// specific business, which is the precondition for the facilityCoreInQuery
// boost below.
//
// That boost reads "every word of the authority's name appears in the
// query" as strong evidence. The reasoning holds only when those words
// name a business. stripBusinessType can reduce a name to one generic
// word -- "HOUSE OF TACOS" becomes "tacos", "CAFFE TRUCK" becomes "truck"
// -- and a core like that matches any query containing the word, which
// made all 636 Florida facilities with "tacos" in the name score 0.85
// against "Locos por Tacos Food Truck" and crowd the real record out of
// the candidate list.
//
// Token count cannot separate those from the case the boost exists for:
// "VERSAILLES REST" also reduces to a single token. Rarity can --
// "versailles" is in 3 records statewide, "tacos" in 636. Document
// frequency is free here because the blocking index already maps every
// token to the facilities containing it.
//
// The rarest token decides, because that is the one carrying the
// identification: "locos por tacos" is identified by "locos", not "tacos".
// Without an index (direct dbprNameSimilarity calls) behavior is unchanged.
function coreIsDistinctive(core: string[], index?: MatchIndex): boolean {
  if (!index) return true;
  const total = index.facilities.length;
  if (total === 0) return true;
  let rarest = Infinity;
  for (const t of core) {
    rarest = Math.min(rarest, index.byToken.get(t)?.length ?? 0);
  }
  return rarest <= CORE_DF_ABS || rarest / total <= CORE_DF_MAX;
}

function nameSimilarityPrepared(
  q: NamePrep,
  d: NamePrep,
  index?: MatchIndex
): number {
  if (q.nd === d.nd) return 1.0;

  // Plain Jaccard
  const jSim = jaccard(q.td, d.td);

  // Jaccard after stripping business-type suffixes from both
  const qsdt = sdtOf(q);
  const dsdt = sdtOf(d);
  const strippedJaccard = qsdt.length > 0 && dsdt.length > 0
    ? jaccard(qsdt, dsdt)
    : jSim;

  // Containment: are all query tokens present in the DBPR name?
  const cont = containment(q.td, d.td);

  // Pluralization: try matching singular/plural forms
  const pluralCont = containmentWithPlural(q.td, d.td);

  // DBPR names are frequently terse/legal versions of a longer marketing
  // name shown on Google (e.g. DBPR "VERSAILLES REST" vs Google's
  // "Versailles Restaurant Cuban Cuisine"). Plain Jaccard penalizes the
  // extra descriptive words on the Google side even when the DBPR name's
  // entire core identity is present in the query. If every business-type-
  // stripped DBPR token appears in the query, treat that as strong
  // evidence regardless of how many extra words the query has.
  const facilityCoreInQuery =
    dsdt.length > 0 && coreIsDistinctive(dsdt, index)
      ? containment(dsdt, q.td)
      : 0;

  return Math.max(
    jSim,
    strippedJaccard,
    cont * 0.9,
    pluralCont * 0.88,
    facilityCoreInQuery * 0.85
  );
}

export function dbprNameSimilarity(query: string, dbprName: string): number {
  return nameSimilarityPrepared(prepareName(query), prepareName(dbprName));
}

function containmentWithPlural(
  queryTokens: string[],
  facilityTokens: string[]
): number {
  if (!queryTokens.length) return 0;
  const fb = new Set(facilityTokens);
  let matched = 0;
  for (const t of queryTokens) {
    if (fb.has(t)) {
      matched++;
    } else if (fb.has(t + "s") || fb.has(t + "es")) {
      matched++;
    } else if (t.endsWith("s") && fb.has(t.slice(0, -1))) {
      matched++;
    } else if (t.endsWith("es") && fb.has(t.slice(0, -2))) {
      matched++;
    }
  }
  return matched / queryTokens.length;
}

// --- Address / city normalization ---

const STREET_ABBREVS: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", boulevard: "blvd",
  drive: "dr", lane: "ln", court: "ct", highway: "hwy",
  parkway: "pkwy", place: "pl", circle: "cir", terrace: "ter",
  plaza: "plaza", expressway: "expy",
  north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
};

// Suffix spellings an authority uses that are neither the full word nor
// the form STREET_ABBREVS canonicalizes to, mapped onto that same form.
// Cincinnati's licensing system writes "AV" and "WY" (694 and 69 of its
// ~2,000 addresses) where Google writes "Ave" and "Way" — without this,
// "6243 GLENWAY AV" scores 0.5 against "6243 Glenway Ave", below
// STREET_STRONG, and the address never corroborates the match.
//
// Applied after STREET_ABBREVS, so the long forms have already collapsed.
// None of these are words that occur as real street names.
const STREET_SUFFIX_VARIANTS: Record<string, string> = {
  av: "ave", wy: "way", plz: "plaza", exwy: "expy", expy: "expy", pky: "pkwy",
};

// Each table compiled once, as one alternation. parseStreetParts runs over
// every record the first time a listing fails to match (ensureAddressIndex),
// and building 28 RegExps per call there held the page's main thread for
// seconds. The \b on both sides means "north" can never match inside
// "northeast", so the order of the alternatives does not matter. The two
// tables are still applied one after the other, abbreviations first, as
// the comment above STREET_SUFFIX_VARIANTS requires.
const STREET_ABBREV_RE = new RegExp(`\\b(${Object.keys(STREET_ABBREVS).join("|")})\\b\\.?`, "g");
const STREET_SUFFIX_VARIANT_RE = new RegExp(`\\b(${Object.keys(STREET_SUFFIX_VARIANTS).join("|")})\\b\\.?`, "g");

// Words that introduce a sub-unit within a building. DBPR addresses use a
// wider vocabulary than just "suite" — floors, building letters,
// concourses (airport/stadium vendors), kiosks, etc. Any of these gets
// split out as the "unit" value rather than left polluting the base
// street comparison (e.g. "1000 NE 16 AVE BLDG H" would otherwise never
// reach full similarity against "1000 NE 16th Ave").
//
// Deliberately excludes words that commonly appear as real Florida street
// names (e.g. "Bay" as in Bay St/Blvd, "Gate" as in Gate Pkwy in
// Jacksonville, "Dock") — including those would misparse the street name
// itself as a unit designator.
const UNIT_WORDS =
  "suite|ste|apt|apartment|unit|bldg|building|floor|flr|rm|room|lvl|level|conc|concourse|space|spc|kiosk|#";
const SUITE_PATTERN = new RegExp(`[,.]?\\s*\\b(?:${UNIT_WORDS})\\s*\\.?\\s*([\\w-]*)`, "i");
const SUITE_STRIP_PATTERN = new RegExp(`[,.]?\\s*\\b(${UNIT_WORDS})\\s*\\.?\\s*\\w*`, "gi");

interface StreetParts {
  base: string;
  suite: string | null;
}

// Extracts the leading house number from a street string, ignoring
// ordinal suffixes ("4860 SW 31st Pl" -> "4860").
function leadingStreetNumber(s: string): string | null {
  const m = s.trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

// Splits a street string into its base address and suite/unit value (if
// any), so the two can be compared independently. Missing suite info on
// either side is not evidence of a mismatch — only two *present* but
// *different* suite values are.
function parseStreetParts(s: string): StreetParts {
  let r = s.toLowerCase().trim();

  const suiteMatch = r.match(SUITE_PATTERN);
  const suite = suiteMatch && suiteMatch[1] ? suiteMatch[1].toLowerCase() : null;

  r = r.replace(SUITE_STRIP_PATTERN, "");
  // DBPR addresses use bare street numbers ("8 ST"); Google shows ordinal
  // suffixes ("8th St"). Strip them so "8th" and "8" compare equal.
  r = r.replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1");
  r = r.replace(STREET_ABBREV_RE, (_m, w: string) => STREET_ABBREVS[w]);
  r = r.replace(STREET_SUFFIX_VARIANT_RE, (_m, w: string) => STREET_SUFFIX_VARIANTS[w]);
  r = r.replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

  return { base: r, suite };
}

function normalizeStreet(s: string): string {
  return parseStreetParts(s).base;
}

interface StreetMatchResult {
  similarity: number;
  // True only when BOTH addresses specify a suite/unit and the values
  // differ — e.g. "Suite 200" vs "Suite 500" in the same building. This
  // signals a different tenant/business, not just missing data on one
  // side, and must not be silently treated as a full address match.
  suiteMismatch: boolean;
}

function streetMatchParts(pa: StreetParts, pb: StreetParts): StreetMatchResult {
  const similarity =
    pa.base === pb.base
      ? 1.0
      : jaccard(pa.base.split(/\s+/), pb.base.split(/\s+/));

  const suiteMismatch =
    pa.suite !== null && pb.suite !== null && pa.suite !== pb.suite;

  return { similarity, suiteMismatch };
}

function streetMatch(a: string, b: string): StreetMatchResult {
  return streetMatchParts(parseStreetParts(a), parseStreetParts(b));
}

function normalizeCity(s: string): string {
  const normalized = s
    .toLowerCase()
    .replace(/\bst\b\.?/g, "saint")
    .replace(/\bft\b\.?/g, "fort")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // NYC records store the borough; Google shows Manhattan addresses as
  // "New York". Other boroughs (Brooklyn, Queens, Bronx, Staten Island)
  // appear under their own names on both sides. Queens neighborhoods
  // (e.g. "Flushing") are NOT mapped — those matches rely on street
  // evidence and surface as "likely" rather than "confirmed".
  if (normalized === "manhattan") return "new york";
  return normalized;
}

export { normalizeForComparison, stripBusinessType, normalizeStreet, normalizeCity, streetMatch };
