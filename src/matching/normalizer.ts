const DEMO_MARKER = /\[platecheck demo\]/gi;

const BUSINESS_SUFFIXES =
  /\b(llc|inc|corp|co|ltd|incorporated|corporation|company)\b\.?/gi;

const STREET_ABBREVIATIONS: Record<string, string> = {
  street: "st",
  avenue: "ave",
  road: "rd",
  boulevard: "blvd",
  drive: "dr",
  lane: "ln",
  court: "ct",
  place: "pl",
  circle: "cir",
  terrace: "ter",
  highway: "hwy",
  parkway: "pkwy",
  way: "way",
};

const DIRECTIONALS: Record<string, string> = {
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
};

const SUITE_PATTERN = /[,.]?\s*\b(suite|ste|apt|apartment|unit|#)\s*\.?\s*\w*/gi;

export function normalizeName(name: string): string {
  let result = name.toLowerCase().trim();
  result = result.replace(DEMO_MARKER, "");
  result = result.replace(/&/g, "and");
  result = result.replace(BUSINESS_SUFFIXES, "");
  result = result.replace(/[''`]/g, "");
  result = result.replace(/[^\w\s]/g, " ");
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

export function normalizeStreet(street: string): string {
  let result = street.toLowerCase().trim();

  result = result.replace(SUITE_PATTERN, "");

  for (const [full, abbr] of Object.entries(DIRECTIONALS)) {
    result = result.replace(new RegExp(`\\b${full}\\b\\.?`, "g"), abbr);
  }

  for (const [full, abbr] of Object.entries(STREET_ABBREVIATIONS)) {
    result = result.replace(new RegExp(`\\b${full}\\b\\.?`, "g"), abbr);
  }

  result = result.replace(/\./g, "");
  result = result.replace(/,/g, "");
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

export function normalizeCity(city: string): string {
  let result = city.toLowerCase().trim();
  result = result.replace(/\bst\b\.?/g, "saint");
  result = result.replace(/\bft\b\.?/g, "fort");
  result = result.replace(/[^\w\s]/g, " ");
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

export function normalizeZip(zip: string): string {
  return zip.replace(/[^0-9]/g, "").slice(0, 5);
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function nameTokens(normalizedName: string): string[] {
  return normalizedName.split(/\s+/).filter((t) => t.length > 0);
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  if (na === nb) return 1.0;

  const tokensA = nameTokens(na);
  const tokensB = nameTokens(nb);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;

  return intersection / union;
}

export function streetSimilarity(a: string, b: string): number {
  const na = normalizeStreet(a);
  const nb = normalizeStreet(b);

  if (na === nb) return 1.0;

  const tokensA = na.split(/\s+/);
  const tokensB = nb.split(/\s+/);

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;

  return intersection / union;
}
