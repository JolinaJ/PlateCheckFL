import type { JoinedFacility, LookupQuery, LookupResult } from "../types/dbpr.js";

// Minimum name similarity to consider
const NAME_FLOOR = 0.4;
const NAME_STRONG = 0.85;
const STREET_STRONG = 0.75;
const CONFIRMED_THRESHOLD = 75;
const LIKELY_THRESHOLD = 55;
const POSSIBLE_THRESHOLD = 35;
// If top two candidates score within this gap, downgrade
const AMBIGUITY_GAP = 8;
const MAX_CANDIDATES = 5;

const WEIGHT_NAME = 40;
const WEIGHT_STREET = 30;
const WEIGHT_CITY = 15;
const WEIGHT_ZIP = 5;
const WEIGHT_PHONE = 10;

export function lookupRestaurant(
  query: LookupQuery,
  facilities: JoinedFacility[]
): LookupResult {
  const scored: Array<{
    facility: JoinedFacility;
    score: number;
    confidence: string;
    nameScore: number;
    streetScore: number;
  }> = [];

  for (const fac of facilities) {
    const nSim = nameSimilarity(query.name, fac.businessName);
    if (nSim < NAME_FLOOR) continue;

    let score = 0;
    const namePoints = nSim >= NAME_STRONG ? WEIGHT_NAME : WEIGHT_NAME * (nSim / NAME_STRONG);
    score += namePoints;

    let hasStreetEvidence = false;
    let streetSim = 0;
    if (query.address) {
      streetSim = addressSimilarity(query.address, fac.locationAddress);
      const streetPoints =
        streetSim >= STREET_STRONG
          ? WEIGHT_STREET
          : WEIGHT_STREET * (streetSim / STREET_STRONG);
      score += streetPoints;
      hasStreetEvidence = streetSim >= STREET_STRONG;
    }

    let hasCityEvidence = false;
    if (query.city) {
      const cityMatch =
        normalizeText(query.city) === normalizeText(fac.locationCity);
      if (cityMatch) {
        score += WEIGHT_CITY;
        hasCityEvidence = true;
      }
    }

    if (query.zip) {
      const qZip = query.zip.replace(/[^0-9]/g, "").slice(0, 5);
      const fZip = fac.locationZip.replace(/[^0-9]/g, "").slice(0, 5);
      if (qZip === fZip) score += WEIGHT_ZIP;
    }

    score = Math.round(Math.min(100, Math.max(0, score)));

    let confidence: string;
    if (score >= CONFIRMED_THRESHOLD && nSim >= NAME_STRONG && hasStreetEvidence) {
      if (query.city && !hasCityEvidence) {
        confidence = "likely";
      } else {
        confidence = "confirmed";
      }
    } else if (score >= LIKELY_THRESHOLD && nSim >= NAME_STRONG) {
      confidence = "likely";
    } else if (score >= POSSIBLE_THRESHOLD) {
      confidence = "possible";
    } else {
      confidence = "unmatched";
    }

    scored.push({
      facility: fac,
      score,
      confidence,
      nameScore: nSim,
      streetScore: streetSim,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, MAX_CANDIDATES);

  if (top.length === 0) {
    return { confidence: "unmatched", facility: null, candidates: [] };
  }

  let bestConfidence = top[0].confidence;
  if (
    top.length >= 2 &&
    top[0].score - top[1].score < AMBIGUITY_GAP
  ) {
    if (bestConfidence === "confirmed") bestConfidence = "likely";
    else if (bestConfidence === "likely") bestConfidence = "possible";
    else bestConfidence = "unmatched";
  }

  return {
    confidence: bestConfidence as LookupResult["confidence"],
    facility: bestConfidence !== "unmatched" ? top[0].facility : null,
    candidates: top.map((c) => ({
      facility: c.facility,
      score: c.score,
      confidence: c.confidence,
    })),
  };
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .replace(/\b(llc|inc|corp|co|ltd|corporation|company)\b\.?/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeText(s).split(/\s+/).filter((t) => t.length > 0);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function nameSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (normalizeText(a) === normalizeText(b)) return 1.0;
  return jaccardSimilarity(ta, tb);
}

const STREET_ABBREVS: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", boulevard: "blvd",
  drive: "dr", lane: "ln", court: "ct", highway: "hwy",
  parkway: "pkwy", place: "pl", circle: "cir", terrace: "ter",
  north: "n", south: "s", east: "e", west: "w",
};

function normalizeAddress(s: string): string {
  let r = s.toLowerCase().trim();
  // Strip suite/unit
  r = r.replace(/[,.]?\s*\b(suite|ste|apt|apartment|unit|#)\s*\.?\s*\w*/gi, "");
  for (const [full, abbr] of Object.entries(STREET_ABBREVS)) {
    r = r.replace(new RegExp(`\\b${full}\\b\\.?`, "g"), abbr);
  }
  r = r.replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  return r;
}

function addressSimilarity(a: string, b: string): number {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (na === nb) return 1.0;
  const ta = na.split(/\s+/);
  const tb = nb.split(/\s+/);
  return jaccardSimilarity(ta, tb);
}

export { normalizeText, normalizeAddress, nameSimilarity, addressSimilarity };
