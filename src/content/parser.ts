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
  // Where the candidate was found. "panel" means a single-business
  // knowledge panel (searching or selecting one specific restaurant) —
  // those get the prominent card variant.
  context: "local" | "panel";
  // How to place the card relative to `entry`. "after" (default) inserts
  // it as the next sibling — used for list rows and panel wrappers.
  // "before" inserts it as the previous sibling — used to drop the panel
  // card as a full-width header row directly above the results column
  // (#center_col), beneath Google's business panel. "prepend" inserts it as
  // the first child — used to place the card inside the right-hand rail
  // (#rhs), above the panel that lives there.
  placement?: "after" | "before" | "prepend";
}

// Returns each parsed restaurant query paired with the exact DOM element it
// came from. Text ads are filtered and duplicates are removed *before*
// pairing, so callers can safely use the returned entry to inject UI
// without ever recomputing a separate, differently-filtered list of
// entries — doing so would silently desync indices and attach cards to
// the wrong listing.
//
// Sponsored local-pack rows are real business listings (name + address)
// and are parsed like organic rows; when the same restaurant appears both
// sponsored and organic, fingerprint dedupe keeps the first occurrence.
// Pure text ads carry ad copy, not a business listing, and are skipped.
export function parseRestaurantEntries(
  root: Document | Element
): RestaurantCandidate[] {
  const candidates: RestaurantCandidate[] = [];
  const seen = new Set<string>();

  try {
    const entries = findLocalResultEntries(root);
    for (const entry of entries) {
      if (isTextAd(entry)) continue;
      const query = extractQuery(entry);
      if (!query) continue;

      const key = queryFingerprint(query);
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({ query, entry, context: "local", placement: "after" });
    }

    // Knowledge panel: searching one restaurant by name renders a
    // full-page business panel instead of local-pack rows.
    const kp = parseKnowledgePanel(root);
    if (kp && !seen.has(queryFingerprint(kp.query))) {
      seen.add(queryFingerprint(kp.query));
      candidates.push(kp);
    }
  } catch {
    // Fail silently on unexpected DOM structures
  }

  return candidates;
}

// Knowledge-panel business results carry Google's structured data hooks
// ([data-attrid]), which are far more stable than layout CSS classes.
function parseKnowledgePanel(
  root: Document | Element
): RestaurantCandidate | null {
  const titleEl = root.querySelector('[data-attrid="title"]');
  const addrEl = root.querySelector(
    '[data-attrid="kc:/location/location:address"], [data-attrid*="location:address"]'
  );
  if (!titleEl || !addrEl) return null;

  const name = (titleEl.textContent ?? "").trim();
  if (!name || name.length > 200) return null;

  const addrText = (addrEl.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^address:?\s*/i, "");
  const address = parseAddressFields(addrText);
  if (!address.street && !address.city) return null;

  let phone: string | null = null;
  const phoneEl = root.querySelector('[data-attrid*="phone"]');
  if (phoneEl) phone = extractPhone(phoneEl.textContent ?? "");

  const { entry, placement } = resolvePanelInjection(root, titleEl, addrEl);

  return {
    query: {
      name,
      ...(address.street && { street: address.street }),
      ...(address.city && { city: address.city }),
      ...(address.zip && { zip: address.zip }),
      ...(phone && { phone }),
    },
    entry,
    context: "panel",
    placement,
  };
}

// Top-level containers Google uses for the main results column. The panel
// wrapper (and the organic results) are direct children of one of these.
const RESULTS_COLUMN_IDS = ["rso", "center_col", "rcnt"];

// Decides where the prominent panel card lands. Verified against live
// Google DOM (2026-07-22) across the layouts Google serves for a
// single-restaurant search:
//
//   Right-hand-rail panel: the whole business panel lives in #rhs, the
//   right column of the #rcnt grid, while #center_col holds unrelated
//   organic web results. A full-width row above #center_col would strand
//   the card at the top left, visually detached from the panel it
//   describes over on the right. Instead the card is prepended *inside*
//   #rhs so it sits in the same column, directly above the panel content.
//   #rhs is a stable top-level grid item, so Google's panel re-render
//   (which displaces anything anchored inside the panel subtree) can't
//   move it.
//
//   Full-width business header: the panel (title + photos/map/hours,
//   holding the address) spans its own rows above both columns, and
//   neither #center_col nor #rhs contains the address. The card is
//   inserted as #rcnt's child directly *before* #center_col so it becomes
//   its own full-width row beneath the panel and above both result columns
//   — reading as the panel's inspection footer. The injector spans it
//   across the content columns to align it with the restaurant title.
//
//   Whole-page panel: the panel is itself inside #center_col, above the
//   results, so #center_col contains the address. Inserting before it would
//   put the card above the panel's own photos/title; instead the card
//   injects after the panel wrapper — the ancestor of the title that is a
//   direct child of the results column — landing between the panel and the
//   results.
function resolvePanelInjection(
  root: Document | Element,
  titleEl: Element,
  addrEl: Element
): { entry: Element; placement: "after" | "before" | "prepend" } {
  // Right rail first: when the panel itself is in #rhs, the card belongs in
  // that column, not spanning the page above the left-hand results.
  const rhs = root.querySelector("#rhs");
  if (rhs && rhs.contains(addrEl)) {
    return { entry: rhs, placement: "prepend" };
  }

  const centerCol = root.querySelector("#center_col");
  if (centerCol && centerCol.parentElement && !centerCol.contains(addrEl)) {
    return { entry: centerCol, placement: "before" };
  }

  // Climb from the title to the direct child of a results column. Only
  // usable if we actually reach one — a layout without those containers
  // (mobile Google serves no #rcnt/#center_col/#rso grid) would otherwise
  // walk all the way to <html> and inject the card outside the document.
  let wrapper: Element = titleEl;
  while (wrapper.parentElement) {
    if (RESULTS_COLUMN_IDS.includes(wrapper.parentElement.id)) {
      return { entry: wrapper, placement: "after" };
    }
    wrapper = wrapper.parentElement;
  }

  // Layout-agnostic fallback: the nearest element containing both the name
  // and the address is the panel, whatever the markup calls it. Inject
  // after it so the card lands directly beneath the business block.
  return { entry: panelContainer(titleEl, addrEl), placement: "after" };
}

// Elements too coarse to inject after — doing so would place the card
// outside the document or at the very bottom of the page.
const UNUSABLE_ANCHORS = new Set(["HTML", "BODY"]);

// The smallest element containing both `a` and `b`, backing off to a tight
// anchor around the address when that ancestor is too coarse to be useful.
function panelContainer(a: Element, b: Element): Element {
  let candidate: Element | null = a;
  while (candidate && !candidate.contains(b)) {
    candidate = candidate.parentElement;
  }

  if (
    candidate &&
    !UNUSABLE_ANCHORS.has(candidate.tagName) &&
    !RESULTS_COLUMN_IDS.includes(candidate.id)
  ) {
    return candidate;
  }

  // The two are only related via the page shell (or a whole results
  // column). Anchoring to the address keeps the card beside the business
  // details rather than at the end of the results.
  const addrParent = b.parentElement;
  return addrParent && !UNUSABLE_ANCHORS.has(addrParent.tagName) ? addrParent : b;
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

function isTextAd(entry: Element): boolean {
  for (const selector of SELECTORS.textAdIndicators) {
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
        let text = (el.textContent ?? "").trim();
        // In sponsored rows Google renders a "Sponsored" label with no
        // whitespace before the business name ("SponsoredLa Cubanita...").
        // The verified markup keeps the label outside the name container,
        // but if a fallback selector captures it, strip the prefix so the
        // query holds only the business name.
        if (text.startsWith("Sponsored")) {
          text = text.slice("Sponsored".length).trim();
        }
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
