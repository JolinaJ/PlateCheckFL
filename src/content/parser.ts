import type { RestaurantQuery } from "../types/inspection.js";
import { SELECTORS } from "./selectors.js";

// Matches patterns like "(813) 555-0101" or "813-555-0101"
const PHONE_PATTERN = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

// Matches "City, ST ZIPCODE" at end of an address string
const CITY_STATE_ZIP_PATTERN =
  /,?\s*([A-Za-z][A-Za-z .]+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/;

// Matches a leading street address (starts with a number)
const STREET_PATTERN = /^(\d+\s+[^,·]+)/;

export interface RestaurantCandidate {
  query: RestaurantQuery;
  entry: Element;
}

// Returns each parsed restaurant query paired with the exact DOM element it
// came from. Ads are filtered and duplicates are removed *before* pairing,
// so callers can safely use the returned entry to inject UI without ever
// recomputing a separate, differently-filtered list of entries — doing so
// would silently desync indices (e.g. when a sponsored row precedes real
// results) and attach cards to the wrong listing.
export function parseRestaurantEntries(
  root: Document | Element
): RestaurantCandidate[] {
  const candidates: RestaurantCandidate[] = [];
  const seen = new Set<string>();

  try {
    const entries = findLocalResultEntries(root);
    for (const entry of entries) {
      if (isAdOrSponsored(entry)) continue;
      const query = extractQuery(entry);
      if (!query) continue;

      const key = queryFingerprint(query);
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({ query, entry });
    }
  } catch {
    // Fail silently on unexpected DOM structures
  }

  return candidates;
}

export function parseRestaurantCandidates(
  root: Document | Element
): RestaurantQuery[] {
  return parseRestaurantEntries(root).map((c) => c.query);
}

function findLocalResultEntries(root: Document | Element): Element[] {
  const results: Element[] = [];

  for (const selector of SELECTORS.localResultEntry) {
    try {
      const elements = root.querySelectorAll(selector);
      for (const el of elements) {
        if (!results.includes(el)) {
          results.push(el);
        }
      }
    } catch {
      // Invalid selector in this context — skip
    }
  }

  return results;
}

function isAdOrSponsored(entry: Element): boolean {
  for (const selector of SELECTORS.adIndicators) {
    try {
      if (entry.matches(selector) || entry.querySelector(selector)) {
        return true;
      }
      if (entry.closest(selector)) {
        return true;
      }
    } catch {
      // Skip invalid selector
    }
  }

  // Google's sponsored local-pack rows render their text content with the
  // "Sponsored" label immediately preceding the business name with no
  // whitespace (e.g. "SponsoredLa Cubanita Restaurant..."). A simple
  // prefix check is more reliable here than a word-boundary regex, since
  // "Sponsored" and the following word are not separated by a boundary
  // character in textContent.
  const text = (entry.textContent ?? "").trim();
  if (text.startsWith("Sponsored")) {
    return true;
  }

  return false;
}

function extractQuery(entry: Element): RestaurantQuery | null {
  const name = extractName(entry);
  if (!name) return null;

  const infoText = extractInfoText(entry);
  const address = parseAddressFields(infoText);
  const phone = extractPhone(infoText);

  return {
    name,
    ...(address.street && { street: address.street }),
    ...(address.city && { city: address.city }),
    ...(address.zip && { zip: address.zip }),
    ...(phone && { phone }),
  };
}

function extractName(entry: Element): string | null {
  for (const selector of SELECTORS.resultName) {
    try {
      const el = entry.querySelector(selector);
      if (el) {
        const text = (el.textContent ?? "").trim();
        if (text.length > 0 && text.length < 200) {
          return text;
        }
      }
    } catch {
      // Skip
    }
  }
  return null;
}

function extractInfoText(entry: Element): string {
  const parts: string[] = [];

  // Primary: classed info-line elements (some Google layouts use these).
  for (const selector of SELECTORS.resultInfo) {
    try {
      const elements = entry.querySelectorAll(selector);
      for (const el of elements) {
        const text = (el.textContent ?? "").trim();
        if (text) parts.push(text);
      }
    } catch {
      // Skip
    }
  }

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  // Fallback: Google frequently leaves the address/category/hours lines
  // as unclassed <div> siblings of the name container inside
  // .rllt__details. Walk direct children and skip whichever one holds
  // the name (already extracted separately).
  const nameEl = findNameElement(entry);
  for (const containerSelector of SELECTORS.resultDetailsContainer) {
    try {
      const container = entry.querySelector(containerSelector);
      if (!container) continue;

      for (const child of container.children) {
        if (child.tagName !== "DIV") continue;
        if (nameEl && (child === nameEl || child.contains(nameEl))) continue;
        const text = (child.textContent ?? "").trim();
        if (text) parts.push(text);
      }
      if (parts.length > 0) break;
    } catch {
      // Skip
    }
  }

  return parts.join(" · ");
}

function findNameElement(entry: Element): Element | null {
  for (const selector of SELECTORS.resultName) {
    try {
      const el = entry.querySelector(selector);
      if (el) return el;
    } catch {
      // Skip
    }
  }
  return null;
}

function extractPhone(text: string): string | null {
  const match = text.match(PHONE_PATTERN);
  return match ? match[0] : null;
}

interface AddressFields {
  street: string | null;
  city: string | null;
  zip: string | null;
}

function parseAddressFields(text: string): AddressFields {
  const result: AddressFields = { street: null, city: null, zip: null };

  // Google info lines use · as separators between category, address, phone, etc.
  // Try each segment for address patterns
  const segments = text.split(/[·•|]/).map((s) => s.trim());

  for (const segment of segments) {
    const cityStateZipMatch = segment.match(CITY_STATE_ZIP_PATTERN);
    if (cityStateZipMatch) {
      result.city = cityStateZipMatch[1].trim();
      result.zip = cityStateZipMatch[3];

      const extracted = extractStreetFrom(segment);
      if (extracted) {
        let street = extracted;
        // Remove trailing city/state/zip from street
        const cityIdx = street.lastIndexOf(result.city);
        if (cityIdx > 0) {
          street = street.substring(0, cityIdx).replace(/,\s*$/, "").trim();
        }
        if (street.length > 0) {
          result.street = street;
        }
      }
      break;
    }

    // Try street-only pattern (no city/state/zip in this segment)
    if (!result.street) {
      const streetOnly = extractStreetFrom(segment);
      if (streetOnly && segment.length < 100) {
        result.street = streetOnly;
      }
    }
  }

  return result;
}

// Google sometimes prefixes the street with a venue descriptor
// ("Food Court, 1600 SW Archer Rd"), so the numbered street may start at
// any comma-separated part of the segment, not just the beginning.
function extractStreetFrom(segment: string): string | null {
  for (const part of segment.split(",")) {
    const match = part.trim().match(STREET_PATTERN);
    if (match) return match[1].trim();
  }
  return null;
}

export function queryFingerprint(query: RestaurantQuery): string {
  return [
    query.name.toLowerCase().trim(),
    (query.street ?? "").toLowerCase().trim(),
    (query.city ?? "").toLowerCase().trim(),
  ].join("|");
}
