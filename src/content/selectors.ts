// Centralized DOM selectors for Google Search local-pack results.
//
// These selectors are INTENTIONALLY NARROW. They target specific Google
// local-pack markup patterns, verified directly against live Google Search
// HTML in mid-2026 (see notes below). Google frequently changes its DOM
// structure without notice — these will need maintenance.
//
// When selectors stop matching, the parser returns zero candidates (safe
// failure). Do not broaden selectors to match organic web results, text
// ads, or unrelated page elements. (Sponsored local-pack rows are in
// scope — see below.)
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
// Sponsored local-pack rows additionally carry the class
// "rllt__borderless" and their text content begins immediately with
// "Sponsored" (no whitespace before the business name, e.g.
// "SponsoredLa Cubanita Restaurant..."). These are real business listings
// with an address and are parsed like organic rows (decision 2026-07-22).
// Pure text ads (headline + display URL, no address) are still skipped.
//
// [data-cid] is NOT a reliable entry selector on its own. Verified against
// live Google Search on 2026-09-27: Google puts [data-cid] on the "Menu
// highlights" dish tiles of a single-restaurant panel and on YouTube video
// cards in ordinary results (including searches that have nothing to do
// with food). Treated as a primary entry, every one of those became a
// candidate with no address, and each got a "Not enough address detail"
// note. So it lives in its own fallback list, and the parser only accepts
// a fallback entry that holds a local-pack details container AND yields a
// street or a "City, ST 12345" line — which no dish tile or video card does.
//
// Also verified 2026-09-27: the current local pack ("Places") no longer
// renders .uMdZh/.VkpGBb/.rllt__details rows and shows no street address
// per row, only a neighbourhood. Those rows produce no candidate (a name
// and a neighbourhood cannot identify one licensed location). Selecting a
// row opens its knowledge panel, which does carry the address; see
// PANEL_SELECTORS.
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
  ],

  // Last-resort entries. Accepted only with a details container and an
  // address (see the note above).
  localResultEntryFallback: ["[data-cid]"],

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

  // Text-ad indicators — non-local ad units (headline + display URL,
  // no business address). If any ancestor or the element itself matches
  // these, skip it. Sponsored local-pack rows (.rllt__borderless) are
  // deliberately NOT listed here — they get cards like organic rows.
  // aria-label checks are exact matches: a substring match on "Ad" would
  // also hit labels like "Address: ...".
  textAdIndicators: [
    '[data-text-ad]',
    '[aria-label="Sponsored"]',
    '[aria-label="Ad"]',
    ".uEierd",
    ".mnr-c",
    ".commercial-unit-desktop-top",
  ],
} as const;

// Google Search single-business knowledge panel.
//
// The title keeps its [data-attrid="title"] hook. The address and phone
// rows moved: as of 2026-09-27 (verified on live panels for a Florida, an
// NYC, a Columbus and a Cincinnati restaurant) they carry
// [data-local-attribute="d3adr"] / [data-local-attribute="d3ph"] and no
// longer any location:address / phone [data-attrid]. Both generations are
// listed so either layout still matches.
export const PANEL_SELECTORS = {
  title: '[data-attrid="title"]',
  address: [
    '[data-local-attribute="d3adr"]',
    '[data-attrid="kc:/location/location:address"]',
    '[data-attrid*="location:address"]',
  ].join(", "),
  phone: ['[data-local-attribute="d3ph"]', '[data-attrid*="phone"]'].join(", "),
} as const;

// Google Maps place panel (google.com/maps/place/...), verified against
// live Maps in August 2026.
//
// Deliberately uses ONLY role and data-item-id anchors — never Maps'
// obfuscated class names (.TIHn2, .m6QErb, .DUwDvf), which change without
// notice. The structure of an open place panel:
//
//   DIV[role="main"][aria-label="Jeff Ruby's Steakhouse"]  <- stable
//     DIV                                   <- scrollable panel body
//       DIV                                 <- title block (h1 + rating)
//         H1                                <- "Jeff Ruby's Steakhouse"
//       DIV                                 <- Overview/Menu/Reviews tabs
//       ...
//       DIV
//         BUTTON[data-item-id="address"]    <- aria-label "Address: 505 Vine St, Cincinnati, OH 45202"
//         BUTTON[data-item-id^="phone"]     <- aria-label "Phone: (513) 784-1200"
//
// The address button is what makes a page identifiable as a Maps place
// panel: Google Search also has a [role="main"], but never this button.
// Requiring it keeps these selectors inert on Search.
//
// Unlike a Search local-pack row, the panel carries a full street/city/
// state/ZIP address AND a phone number, so Maps matches get the strongest
// evidence the matcher supports.
export const MAPS_SELECTORS = {
  // The place panel root. aria-label carries the business name.
  placePanel: 'div[role="main"][aria-label]',
  // Full address, as "Address: 505 Vine St, Cincinnati, OH 45202".
  address: 'button[data-item-id="address"]',
  // Phone, as "Phone: (513) 784-1200". data-item-id is suffixed with the
  // number itself (phone:tel:+15137841200), hence the prefix match.
  phone: 'button[data-item-id^="phone"]',
  // Business name. The h1 is the display name; aria-label on the panel is
  // the fallback.
  name: "h1",
} as const;
