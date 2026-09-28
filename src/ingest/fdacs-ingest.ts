// Crawls the FDACS food establishment inspection portal county by county and
// writes src/data/fdacs-index.json.
//
// Run: npm run data:fdacs [-- --county Alachua]
//
// The portal is a search form, not a bulk download, so this walks all 67
// counties with a blank name (which enumerates the county) and pages through
// each result grid. See src/ingest/fdacs.ts for the three protocol rules that
// make the requests work at all -- particularly that paging must NOT resend
// the search inputs.
//
// Deliberately paced. This is a public records portal run by a state agency,
// not an API with a quota, so requests are serialized with a delay between
// them rather than parallelized.
import { writeFileSync, readFileSync, existsSync } from "fs";
import {
  FDACS_SEARCH_URL,
  FDACS_GRID_ID,
  FDACS_COUNTY_IDS,
  parseHiddenFields,
  parseResultRows,
  parseFdacsAddress,
  buildCitiesByZip,
  type FdacsRow,
} from "./fdacs.js";
import type { IndexedFacility } from "../types/extension.js";

const OUT_PATH = "src/data/fdacs-index.json";
const DBPR_PATH = "src/data/dbpr-index.json";
const REQUEST_DELAY_MS = 900;
const MAX_PAGES_PER_COUNTY = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Minimal cookie jar: the portal issues an ASP.NET session cookie on the
// first GET and rejects the search without it. Node's fetch does not persist
// cookies, so the value is carried by hand.
class Session {
  private cookie = "";

  async request(body?: URLSearchParams): Promise<string> {
    const res = await fetch(FDACS_SEARCH_URL, {
      method: body ? "POST" : "GET",
      headers: {
        "User-Agent": "PlateCheck data ingest (public records)",
        Referer: FDACS_SEARCH_URL,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body,
      redirect: "follow",
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (html.includes("aspxerrorpath") || html.includes("Server Error")) {
      throw new Error("portal returned its error page");
    }
    return html;
  }
}

function searchBody(
  hidden: Record<string, string>,
  countyId: number
): URLSearchParams {
  const b = new URLSearchParams(hidden);
  b.set("__EVENTTARGET", "");
  b.set("__EVENTARGUMENT", "");
  b.set("ctl00$cphMain$txtName", "");
  b.set("ctl00$cphMain$txtNumber", "");
  b.set("ctl00$cphMain$txtAddress", "");
  b.set("ctl00$cphMain$txtCity", "");
  b.set("ctl00$cphMain$txtZipCode", "");
  b.set("ctl00$cphMain$ddlCounty", String(countyId));
  b.set("ctl00$cphMain$txtFromDate", "");
  b.set("ctl00$cphMain$txtToDate", "");
  b.set("ctl00$cphMain$btnSearch", "Search");
  return b;
}

// Paging posts the hidden fields and nothing else. The results page does not
// render the search inputs, so including them fails event validation and the
// portal returns its error page. This is not an optimization.
function pageBody(hidden: Record<string, string>, page: number): URLSearchParams {
  const b = new URLSearchParams(hidden);
  b.set("__EVENTTARGET", FDACS_GRID_ID);
  b.set("__EVENTARGUMENT", `Page$${page}`);
  return b;
}

async function crawlCounty(county: string, id: number): Promise<FdacsRow[]> {
  const session = new Session();
  const rows: FdacsRow[] = [];
  const seen = new Set<string>();

  const landing = await session.request();
  await sleep(REQUEST_DELAY_MS);

  let html = await session.request(searchBody(parseHiddenFields(landing), id));
  for (let page = 2; page <= MAX_PAGES_PER_COUNTY; page++) {
    const batch = parseResultRows(html);
    let added = 0;
    for (const r of batch) {
      if (seen.has(r.permit)) continue;
      seen.add(r.permit);
      rows.push(r);
      added++;
    }
    // A page that contributes nothing new means the pager has wrapped or the
    // grid stopped advancing; stop rather than loop on the last page.
    if (added === 0) break;
    if (!html.includes(`Page$${page}`)) break;
    await sleep(REQUEST_DELAY_MS);
    html = await session.request(pageBody(parseHiddenFields(html), page));
  }
  return rows;
}

function toFacility(
  row: FdacsRow,
  county: string,
  citiesByZip: Map<string, string[]>
): IndexedFacility {
  const addr = parseFdacsAddress(row.rawAddress, citiesByZip);
  return {
    n: row.name,
    a: addr.street,
    c: addr.city,
    z: addr.zip,
    ln: row.permit,
    co: county,
    p: "",
    d: row.lastVisit,
    t: "",
    di: row.summary,
    // FDACS publishes no violation counts and no severity tiers in the
    // public report, so these stay zero and the card shows `di` instead.
    hp: 0,
    im: 0,
    ba: 0,
    ic: 0,
    lid: "",
    vid: row.permit,
    j: "fdacs",
  };
}

async function main(): Promise<void> {
  const only = process.argv.includes("--county")
    ? process.argv[process.argv.indexOf("--county") + 1]
    : null;

  if (!existsSync(DBPR_PATH)) {
    throw new Error(
      `${DBPR_PATH} is required to resolve FDACS city names; run npm run data:ingest first`
    );
  }
  const citiesByZip = buildCitiesByZip(JSON.parse(readFileSync(DBPR_PATH, "utf-8")));

  const counties = only
    ? { [only]: FDACS_COUNTY_IDS[only] }
    : FDACS_COUNTY_IDS;
  if (only && counties[only] === undefined) {
    throw new Error(`unknown county "${only}"`);
  }

  const out: IndexedFacility[] = [];
  const byPermit = new Set<string>();
  for (const [county, id] of Object.entries(counties)) {
    process.stdout.write(`${county.padEnd(14)} `);
    try {
      const rows = await crawlCounty(county, id as number);
      let kept = 0;
      for (const r of rows) {
        if (byPermit.has(r.permit)) continue;
        byPermit.add(r.permit);
        out.push(toFacility(r, county, citiesByZip));
        kept++;
      }
      console.log(`${String(kept).padStart(5)} entities`);
    } catch (e) {
      console.log(`FAILED: ${(e as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`\nwrote ${out.length} FDACS entities to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
