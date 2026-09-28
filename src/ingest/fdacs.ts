// FDACS (Florida Department of Agriculture and Consumer Services) food
// establishment inspection reports.
//
// Why this exists alongside DBPR: Florida splits food oversight between
// agencies. DBPR's Division of Hotels and Restaurants licenses restaurants;
// FDACS inspects "supermarkets, grocery stores, convenience stores, coffee
// shops, bakeries, retail meat markets, seafood markets, juice and smoothie
// bars, bottled water plants, ice and water vending machines, food
// processing plants, food warehouses, food salvage stores, and certain
// mobile food units" (FDACS's own scope statement on the search page). Those
// categories are entirely absent from the DBPR extract -- zero Wawa,
// 7-Eleven, Circle K or Publix stores, and only 29 Starbucks statewide
// against roughly 700 real locations.
//
// The source is a search portal, not a bulk download: an ASP.NET WebForms
// page with encrypted ViewState, event validation and a session cookie.
// Three things were learned the hard way and must not be undone:
//
//   1. Every hidden input on the page has to be replayed verbatim --
//      including ctl00_ToolkitScriptManager1_HiddenField and
//      __VIEWSTATEENCRYPTED. Omitting either yields a redirect to
//      /error-pages/Error.aspx.
//   2. A blank name plus a county id enumerates that whole county, which is
//      what makes bulk ingestion possible at all.
//   3. Paging must post ONLY the hidden fields plus the grid event. The
//      results page does not render the search inputs (it renders
//      btnShowSearchOptions in their place), so sending txtName and friends
//      fails ASP.NET event validation and errors the request. This is the
//      single least obvious part of the protocol.
export const FDACS_SEARCH_URL =
  "https://foodpermit.fdacs.gov/Reports/SearchFoodEntity.aspx";

export const FDACS_GRID_ID = "ctl00$cphMain$gvFoodEntity";

// County ids as rendered in the portal's own dropdown. They are not
// sequential and not alphabetical, so they are captured rather than derived.
export const FDACS_COUNTY_IDS: Record<string, number> = {
  Alachua: 241, Baker: 242, Bay: 228, Bradford: 243, Brevard: 279,
  Broward: 289, Calhoun: 229, Charlotte: 285, Citrus: 259, Clay: 255,
  Collier: 287, Columbia: 244, DeSoto: 275, Dixie: 245, Duval: 256,
  Escambia: 230, Flagler: 260, Franklin: 231, Gadsden: 203, Gilchrist: 246,
  Glades: 276, Gulf: 232, Hamilton: 247, Hardee: 271, Hendry: 277,
  Hernando: 261, Highlands: 278, Hillsborough: 270, Holmes: 233,
  "Indian River": 280, Jackson: 234, Jefferson: 202, Lafayette: 248,
  Lake: 262, Lee: 286, Leon: 201, Levy: 249, Liberty: 235,
  Madison: 250, Manatee: 272, Marion: 251, Martin: 281, "Miami-Dade": 204,
  Monroe: 291, Nassau: 257, Okaloosa: 236, Okeechobee: 282, Orange: 266,
  Osceola: 274, "Palm Beach": 288, Pasco: 268, Pinellas: 269, Polk: 273,
  Putnam: 263, "Santa Rosa": 237, Sarasota: 284, Seminole: 267,
  "St. Johns": 258, "St. Lucie": 283, Sumter: 264, Suwannee: 252,
  Taylor: 253, Union: 254, Volusia: 265, Wakulla: 238, Walton: 239,
  Washington: 240,
};

export interface FdacsRow {
  name: string;
  permit: string;
  rawAddress: string;
  summary: string;
  lastVisit: string;
}

// Replay-everything is deliberate: ASP.NET validates the full hidden set,
// and a missing field is indistinguishable from a tampered one.
export function parseHiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<input[^>]*type="hidden"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const name = /name="([^"]*)"/.exec(tag);
    if (!name) continue;
    const value = /value="([^"]*)"/.exec(tag);
    out[name[1]] = value ? decodeEntities(value[1]) : "";
  }
  return out;
}

// The grid renders five columns: name, permit number, address, the most
// recent inspection summary, and the last visit date.
export function parseResultRows(html: string): FdacsRow[] {
  const rows: FdacsRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html)) !== null) {
    const cells: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(tr[1])) !== null) cells.push(cleanCell(td[1]));
    // Pager rows are a single cell of page links; data rows carry five.
    if (cells.length < 5) continue;
    const [name, permit, rawAddress, summary, lastVisit] = cells;
    if (!name || !/^\d+$/.test(permit)) continue;
    rows.push({ name, permit, rawAddress, summary, lastVisit });
  }
  return rows;
}

function cleanCell(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export interface ParsedAddress {
  street: string;
  city: string;
  zip: string;
}

// FDACS returns the whole address as one unpunctuated string, sometimes with
// a store designator fused to the street:
//   "850 MALABAR RD SE PALM BAY FL 32907"
//   "5035 S ORANGE BLOSSOM TRLSTORE #5124 KISSIMMEE FL 34758"
//   "9206 CR 125 GLEN ST MARY FL 32040"
//
// The city boundary cannot be found by punctuation (there is none) or by
// street-suffix keywords (the city "GLEN ST MARY" contains "ST"). What does
// work is a gazetteer keyed on ZIP: the DBPR index already carries 1,017
// Florida ZIPs with their city names, so the caller passes that in and the
// longest city that suffixes the remainder wins. Without a gazetteer hit the
// last token before the state is taken as a single-word city, which is right
// far more often than it is wrong and never invents multi-word names.
export function parseFdacsAddress(
  raw: string,
  citiesByZip: Map<string, string[]>
): ParsedAddress {
  const text = raw.replace(/\s+/g, " ").trim();
  const tail = /^(.*?)\s+FL\s+(\d{5})(?:-\d{4})?$/i.exec(text);
  if (!tail) return { street: text, city: "", zip: "" };

  const body = tail[1].trim();
  const zip = tail[2];

  const candidates = (citiesByZip.get(zip) ?? [])
    .slice()
    .sort((a, b) => b.length - a.length);
  const upper = body.toUpperCase();
  for (const city of candidates) {
    const c = city.toUpperCase();
    if (upper.endsWith(" " + c)) {
      return {
        street: cleanStreet(body.slice(0, body.length - c.length).trim()),
        city,
        zip,
      };
    }
    if (upper === c) return { street: "", city, zip };
  }

  const parts = body.split(" ");
  if (parts.length < 2) return { street: body, city: "", zip };
  return {
    street: cleanStreet(parts.slice(0, -1).join(" ")),
    city: parts[parts.length - 1],
    zip,
  };
}

// FDACS occasionally fuses a store designator onto the street suffix with no
// separator -- "5035 S ORANGE BLOSSOM TRLSTORE #5124". Left alone the street
// base normalizes to "orange blossom trlstore", which can never match the
// "Orange Blossom Trl" Google renders, so the address silently stops
// corroborating the match. Split the suffix off, then drop the designator:
// the unit is not part of the street and DBPR-style records do not carry it.
// Written as plain regex literals, not new RegExp() over template strings:
// inside a template literal "\b" is the backspace character and "\s" is just
// "s", so the interpolated version silently compiled to regexes that matched
// nothing.
const SUFFIX_FUSED =
  /\b(TRL|RD|ST|AVE|AV|BLVD|HWY|PKWY|PLZ|DR|LN|CT|WAY|WY|CIR|PL|TER|EXPY|SQ)(STORE|STE|SUITE|UNIT|APT|BLDG|SHOP|RM|LOT|SPC)\b/gi;
const TRAILING_DESIGNATOR =
  /\s+(STORE|STE|SUITE|UNIT|APT|BLDG|SHOP|RM|LOT|SPC)\s*#?\s*[\w-]+$/i;

export function cleanStreet(street: string): string {
  return street
    .replace(SUFFIX_FUSED, "$1 $2")
    .replace(TRAILING_DESIGNATOR, "")
    .replace(/\s+#\s*[\w-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}


// Build the ZIP -> city gazetteer parseFdacsAddress needs, from any record
// set that already carries clean city/zip fields (the DBPR index).
export function buildCitiesByZip(
  records: Array<{ c: string; z: string }>
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of records) {
    if (!r.z || !r.c) continue;
    const list = out.get(r.z);
    if (list) {
      if (!list.includes(r.c)) list.push(r.c);
    } else {
      out.set(r.z, [r.c]);
    }
  }
  return out;
}
