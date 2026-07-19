// Centralized DOM selectors for Google Search local-pack results.
//
// These selectors are INTENTIONALLY NARROW. They target specific Google
// local-pack markup patterns, verified directly against live Google Search
// HTML in mid-2026 (see notes below). Google frequently changes its DOM
// structure without notice — these will need maintenance.
//
// When selectors stop matching, the parser returns zero candidates (safe
// failure). Do not broaden selectors to match organic results, ads, or
// unrelated page elements.
//
// Verified structure for one local-pack row (generic query, e.g.
// "cuban restaurants miami"):
//
//   DIV.uMdZh                    <- one full result row (localResultEntry)
//     DIV.VkpGBb
//       ...
//         DIV.rllt__details
//           DIV.dbg0pd
//             SPAN.OSrXXb        <- "Old's Havana Cuban Bar & Cocina" (name)
//           DIV (no class)       <- "·· Cuban" / "$20–60" (category/price)
//           DIV (no class)       <- "1442 SW 8th St"      (address — UNCLASSED)
//           DIV (no class)       <- "· 11 PM"             (hours)
//
// IMPORTANT: the address line has no stable class name. It must be found
// by walking the direct-child <div> elements of .rllt__details and
// skipping the name container, rather than by a CSS class selector.
//
// Sponsored/ad rows additionally carry the class "rllt__borderless" and
// their text content begins immediately with "Sponsored" (no whitespace
// before the business name, e.g. "SponsoredLa Cubanita Restaurant...").
//
// [data-cid] is NOT a reliable entry selector on its own: on a
// single-business knowledge panel (e.g. searching one restaurant's exact
// name), Google reuses [data-cid] for unrelated "Popular dishes" cards.
// It is kept only as a last-resort fallback.
export const SELECTORS = {
  // Local-pack container candidates. Google uses several patterns.
  localPackContainer: [
    '[data-attrid^="kc:/local"]',
    ".uMdZh",
  ],

  // Individual local result entries within the pack, most reliable first.
  localResultEntry: [
    ".uMdZh",
    ".VkpGBb",
    "[data-cid]",
  ],

  // Restaurant name within a local result.
  resultName: [
    ".dbg0pd .OSrXXb",
    ".dbg0pd",
    '[role="heading"] span',
    '[role="heading"]',
    ".OSrXXb",
  ],

  // Container that holds name + address + category + hours as separate
  // direct-child <div> elements (mostly unclassed). Used by the parser to
  // walk children directly rather than relying on a stable info-line class.
  resultDetailsContainer: [".rllt__details"],

  // Legacy / alternate address-line selectors retained as a fallback for
  // layouts that do use a class on the info line.
  resultInfo: [
    ".rllt__details .W4Efsd",
    ".W4Efsd",
    ".lMbq3e",
  ],

  // Sponsored/ad indicators — if any ancestor or the element itself
  // matches these, skip it.
  adIndicators: [
    '[data-text-ad]',
    '[aria-label*="Sponsored"]',
    '[aria-label*="Ad"]',
    ".rllt__borderless",
    ".uEierd",
    ".mnr-c",
    ".commercial-unit-desktop-top",
  ],
} as const;
