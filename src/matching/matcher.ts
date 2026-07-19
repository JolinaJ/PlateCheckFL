import type {
  Facility,
  RestaurantQuery,
  MatchResult,
  MatchCandidate,
  MatchConfidence,
  MatchReason,
} from "../types/inspection.js";
import {
  normalizeName,
  normalizeStreet,
  normalizeCity,
  normalizeZip,
  normalizePhone,
  nameSimilarity,
  streetSimilarity,
} from "./normalizer.js";

// --- Scoring weights ---
// Name is the primary signal; address components confirm or deny.
const WEIGHT_NAME = 40;
const WEIGHT_STREET = 30;
const WEIGHT_CITY = 15;
const WEIGHT_ZIP = 5;
const WEIGHT_PHONE = 10;

// --- Thresholds ---
// Minimum name similarity to consider a facility at all
const NAME_FLOOR = 0.4;
// Name similarity required for the name component to score fully
const NAME_STRONG = 0.85;
// Street similarity required for a full street score
const STREET_STRONG = 0.8;
// Minimum total score required for "confirmed"
const CONFIRMED_THRESHOLD = 75;
// Minimum total score required for "likely"
const LIKELY_THRESHOLD = 55;
// Minimum total score required for "possible"
const POSSIBLE_THRESHOLD = 35;
// If the gap between #1 and #2 candidate is smaller than this, downgrade
const AMBIGUITY_GAP = 8;
// Maximum number of candidates to return for debugging
const MAX_CANDIDATES = 3;

export function matchRestaurant(
  query: RestaurantQuery,
  facilities: Facility[]
): MatchResult {
  const candidates: MatchCandidate[] = [];

  for (const facility of facilities) {
    const result = scoreCandidate(query, facility);
    if (result) {
      candidates.push(result);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, MAX_CANDIDATES);

  if (topCandidates.length === 0) {
    return { match: null, confidence: "unmatched", candidates: [] };
  }

  const best = topCandidates[0];
  let confidence = best.confidence;

  if (
    topCandidates.length >= 2 &&
    best.score - topCandidates[1].score < AMBIGUITY_GAP
  ) {
    if (confidence === "confirmed") confidence = "likely";
    else if (confidence === "likely") confidence = "possible";
    else confidence = "unmatched";

    best.confidence = confidence;
    best.reasons.push({
      field: "ambiguity",
      matched: false,
      detail: `Top two candidates scored within ${AMBIGUITY_GAP} points (${best.score} vs ${topCandidates[1].score}); confidence downgraded`,
    });
  }

  return {
    match: confidence !== "unmatched" ? best : null,
    confidence,
    candidates: topCandidates,
  };
}

function scoreCandidate(
  query: RestaurantQuery,
  facility: Facility
): MatchCandidate | null {
  const reasons: MatchReason[] = [];
  let score = 0;
  let hasStreetEvidence = false;
  let hasCityEvidence = false;

  const nSim = nameSimilarity(query.name, facility.name);
  if (nSim < NAME_FLOOR) return null;

  const nameScore =
    nSim >= NAME_STRONG
      ? WEIGHT_NAME
      : WEIGHT_NAME * (nSim / NAME_STRONG);
  score += nameScore;
  reasons.push({
    field: "name",
    matched: nSim >= NAME_STRONG,
    detail: `Name similarity ${(nSim * 100).toFixed(0)}% (normalized: "${normalizeName(query.name)}" vs "${normalizeName(facility.name)}")`,
  });

  if (query.street) {
    const sSim = streetSimilarity(query.street, facility.address.street);
    const streetScore =
      sSim >= STREET_STRONG
        ? WEIGHT_STREET
        : WEIGHT_STREET * (sSim / STREET_STRONG);
    score += streetScore;
    hasStreetEvidence = sSim >= STREET_STRONG;
    reasons.push({
      field: "street",
      matched: hasStreetEvidence,
      detail: `Street similarity ${(sSim * 100).toFixed(0)}%`,
    });
  }

  if (query.city) {
    const qCity = normalizeCity(query.city);
    const fCity = normalizeCity(facility.address.city);
    const cityMatch = qCity === fCity;
    if (cityMatch) score += WEIGHT_CITY;
    hasCityEvidence = cityMatch;
    reasons.push({
      field: "city",
      matched: cityMatch,
      detail: `City: "${qCity}" vs "${fCity}"`,
    });
  }

  if (query.zip) {
    const qZip = normalizeZip(query.zip);
    const fZip = normalizeZip(facility.address.zip);
    const zipMatch = qZip === fZip;
    if (zipMatch) score += WEIGHT_ZIP;
    reasons.push({
      field: "zip",
      matched: zipMatch,
      detail: `ZIP: "${qZip}" vs "${fZip}"`,
    });
  }

  if (query.phone) {
    const qPhone = normalizePhone(query.phone);
    const fPhone = facility.phone ? normalizePhone(facility.phone) : "";
    const phoneMatch = qPhone.length >= 10 && qPhone === fPhone;
    if (phoneMatch) score += WEIGHT_PHONE;
    reasons.push({
      field: "phone",
      matched: phoneMatch,
      detail: phoneMatch
        ? "Phone numbers match"
        : `Phone: "${qPhone}" vs "${fPhone}"`,
    });

    if (phoneMatch && hasStreetEvidence === false && query.street) {
      reasons.push({
        field: "phone_override_check",
        matched: false,
        detail:
          "Phone match cannot override contradictory street address",
      });
    }
  }

  score = Math.round(Math.min(100, Math.max(0, score)));

  let confidence: MatchConfidence;
  if (
    score >= CONFIRMED_THRESHOLD &&
    nSim >= NAME_STRONG &&
    hasStreetEvidence
  ) {
    if (query.city && !hasCityEvidence) {
      confidence = "likely";
      reasons.push({
        field: "city_mismatch",
        matched: false,
        detail:
          "City mismatch prevents confirmed despite strong name+street",
      });
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

  return { facility, score, confidence, reasons };
}
