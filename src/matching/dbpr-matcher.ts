import type {
  IndexedFacility,
  ParsedQuery,
  ExtensionMatchResult,
  MatchConfidence,
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
const AMBIGUITY_GAP = 8;
const MAX_CANDIDATES = 3;

// DBPR often appends these to business names. Stripping them before
// comparison prevents "JOE'S CRAB" vs "JOE'S CRAB RESTAURANT" from
// scoring poorly due to an extra token.
const BUSINESS_TYPE_SUFFIXES = /\b(restaurant|rest|ristorante|cafe|café|caffe|diner|grill|grille|grillhouse|bar|pub|tavern|lounge|kitchen|eatery|bistro|brasserie|trattoria|pizzeria|bakery|steakhouse|seafood|sushi|bbq|barbecue|taqueria|cantina|brewery|taphouse|deli|delicatessen|creamery|gelateria|food|foods|market|shoppe|shop|house|palace|express|station|shack|hut|joint|pit|spot|den|corner|place|room|landing|inn|hotel|motel|resort|club|corporation|corp|enterprises|enterprise|group|holdings|of|the|and|a|an|no|inc|llc|ltd|co)\b\.?/gi;

export function matchFacility(
  query: ParsedQuery,
  facilities: IndexedFacility[]
): ExtensionMatchResult {
  const scored: Array<{
    facility: IndexedFacility;
    score: number;
    confidence: MatchConfidence;
    suiteMismatch: boolean;
    streetNameMismatch: boolean;
  }> = [];

  for (const fac of facilities) {
    const nSim = dbprNameSimilarity(query.name, fac.n);
    if (nSim < NAME_FLOOR) continue;

    let score = 0;
    score += nSim >= NAME_STRONG ? WEIGHT_NAME : WEIGHT_NAME * (nSim / NAME_STRONG);

    let hasStreetEvidence = false;
    let suiteMismatch = false;
    let streetNameMismatch = false;
    if (query.street) {
      const street = streetMatch(query.street, fac.a);
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
        const qNum = leadingStreetNumber(query.street);
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
    return {
      confidence: "unmatched",
      facility: null,
      score: 0,
      suiteMismatch: false,
      streetNameMismatch: false,
      coLocatedCount: 0,
      candidates: [],
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

  return {
    confidence,
    facility: confidence !== "unmatched" ? best.facility : null,
    score: best.score,
    suiteMismatch: best.suiteMismatch,
    streetNameMismatch: best.streetNameMismatch,
    coLocatedCount,
    candidates: top,
  };
}

// --- Name similarity tuned for DBPR records ---

function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
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

export function dbprNameSimilarity(query: string, dbprName: string): number {
  const nq = normalizeForComparison(query);
  const nd = normalizeForComparison(dbprName);
  if (nq === nd) return 1.0;

  const tq = tokenize(nq);
  const td = tokenize(nd);

  // Plain Jaccard
  const jSim = jaccard(tq, td);

  // Jaccard after stripping business-type suffixes from both
  const sqt = tokenize(stripBusinessType(nq));
  const sdt = tokenize(stripBusinessType(nd));
  const strippedJaccard = sqt.length > 0 && sdt.length > 0
    ? jaccard(sqt, sdt)
    : jSim;

  // Containment: are all query tokens present in the DBPR name?
  const cont = containment(tq, td);

  // Pluralization: try matching singular/plural forms
  const pluralCont = containmentWithPlural(tq, td);

  // DBPR names are frequently terse/legal versions of a longer marketing
  // name shown on Google (e.g. DBPR "VERSAILLES REST" vs Google's
  // "Versailles Restaurant Cuban Cuisine"). Plain Jaccard penalizes the
  // extra descriptive words on the Google side even when the DBPR name's
  // entire core identity is present in the query. If every business-type-
  // stripped DBPR token appears in the query, treat that as strong
  // evidence regardless of how many extra words the query has.
  const facilityCoreInQuery = sdt.length > 0 ? containment(sdt, tq) : 0;

  return Math.max(
    jSim,
    strippedJaccard,
    cont * 0.9,
    pluralCont * 0.88,
    facilityCoreInQuery * 0.85
  );
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
  north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
};

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
  for (const [full, abbr] of Object.entries(STREET_ABBREVS)) {
    r = r.replace(new RegExp(`\\b${full}\\b\\.?`, "g"), abbr);
  }
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

function streetMatch(a: string, b: string): StreetMatchResult {
  const pa = parseStreetParts(a);
  const pb = parseStreetParts(b);

  const similarity =
    pa.base === pb.base
      ? 1.0
      : jaccard(pa.base.split(/\s+/), pb.base.split(/\s+/));

  const suiteMismatch =
    pa.suite !== null && pb.suite !== null && pa.suite !== pb.suite;

  return { similarity, suiteMismatch };
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
