import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseRestaurantCandidates,
  parseRestaurantEntries,
  parseMapsPlacePanel,
} from "../src/content/parser";

function loadFixture(name: string): Document {
  const html = readFileSync(
    join(__dirname, "fixtures", name),
    "utf-8"
  );
  return new JSDOM(html).window.document;
}

describe("parseRestaurantCandidates", () => {
  describe("full local result", () => {
    let doc: Document;
    beforeEach(() => {
      doc = loadFixture("local-pack-full.html");
    });

    it("extracts the restaurant name", () => {
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].name).toBe("Sunshine Grill [PlateCheck Demo]");
    });

    it("extracts street address", () => {
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates[0].street).toBe("1420 Palm Avenue");
    });

    it("extracts city", () => {
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates[0].city).toBe("Tampa");
    });

    it("extracts ZIP", () => {
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates[0].zip).toBe("33601");
    });

    it("extracts phone number", () => {
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates[0].phone).toBe("(813) 555-0101");
    });
  });

  describe("partial local result", () => {
    let doc: Document;
    beforeEach(() => {
      doc = loadFixture("local-pack-partial.html");
    });

    it("extracts name with partial address", () => {
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].name).toBe("Café Mariposa [PlateCheck Demo]");
    });

    it("extracts city when available", () => {
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates[0].city).toBe("Key West");
    });

    it("has no street when not present", () => {
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates[0].street).toBeUndefined();
    });

    it("has no phone when not present", () => {
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates[0].phone).toBeUndefined();
    });
  });

  describe("multiple results on one page", () => {
    it("extracts both restaurants", () => {
      const doc = loadFixture("local-pack-multiple.html");
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(2);
      const names = candidates.map((c) => c.name);
      expect(names).toContain("Sunshine Grill [PlateCheck Demo]");
      expect(names).toContain("Flamingo Diner [PlateCheck Demo]");
    });
  });

  describe("deduplication", () => {
    it("does not return duplicate candidates", () => {
      const html = `<div id="search">
        <div data-cid="dup1">
          <div role="heading"><span>Sunshine Grill</span></div>
          <div class="rllt__details">
            <div class="W4Efsd">1420 Palm Avenue, Tampa, FL 33601</div>
          </div>
        </div>
        <div data-cid="dup2">
          <div role="heading"><span>Sunshine Grill</span></div>
          <div class="rllt__details">
            <div class="W4Efsd">1420 Palm Avenue, Tampa, FL 33601</div>
          </div>
        </div>
      </div>`;
      const doc = new JSDOM(html).window.document;
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(1);
    });
  });

  describe("street prefixed by a venue descriptor — regression", () => {
    // Real case (Gainesville, 2026-07): a food-court vendor rendered as
    // "Food Court, 1600 SW Archer Rd". The street pattern was anchored to
    // the segment start, so no street was extracted and the entry fell to
    // a name-only (never shown) match despite a clean DBPR address match.
    it("extracts the street when it follows a descriptor and comma", () => {
      const html = `<div id="search">
        <div data-cid="fc1">
          <div role="heading"><span>Sandwich Stop [PlateCheck Demo]</span></div>
          <div class="rllt__details">
            <div class="W4Efsd">Food Court, 1600 SW Archer Rd</div>
          </div>
        </div>
      </div>`;
      const doc = new JSDOM(html).window.document;
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].street).toBe("1600 SW Archer Rd");
    });
  });

  describe("organic results are ignored", () => {
    it("returns no candidates for organic search results", () => {
      const doc = loadFixture("organic-result.html");
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(0);
    });
  });

  describe("text ads are ignored", () => {
    // Pure text ads (headline + display URL, no business address) carry ad
    // copy, not a listing — they must never produce a candidate. Sponsored
    // local-pack rows are covered separately below and ARE parsed.
    it("returns no candidates for text-ad units", () => {
      const doc = loadFixture("sponsored-result.html");
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(0);
    });
  });

  describe("malformed results", () => {
    it("does not throw on malformed fragments", () => {
      const doc = loadFixture("malformed-result.html");
      expect(() => parseRestaurantCandidates(doc)).not.toThrow();
    });

    it("returns no candidates from malformed fragments", () => {
      const doc = loadFixture("malformed-result.html");
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(0);
    });
  });

  describe("real Google markup — unclassed address div", () => {
    it("extracts name and street from a result with no class on the info divs", () => {
      const doc = loadFixture("local-pack-real-unclassed.html");
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].name).toBe("Old's Havana Cuban Bar & Cocina");
      expect(candidates[0].street).toBe("1442 SW 8th St");
    });
  });

  describe("real Google markup — sponsored row with rllt__borderless", () => {
    it("parses a sponsored local-pack row like an organic one", () => {
      const doc = loadFixture("local-pack-sponsored-real.html");
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].name).toBe("La Cubanita Restaurant & Cocktail Bar");
      expect(candidates[0].street).toBe("1120 Collins Avenue");
    });

    it("never includes the 'Sponsored' label in the extracted name", () => {
      // The label precedes the name with no whitespace in textContent
      // ("SponsoredLa Cubanita..."), so a leaked label would corrupt the
      // query name and break matching.
      const doc = loadFixture("local-pack-sponsored-real.html");
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates[0].name).not.toContain("Sponsored");
    });
  });

  describe("parseRestaurantEntries — query/entry pairing stays aligned", () => {
    it("pairs each query with its own row when a sponsored row precedes organic listings", () => {
      const doc = loadFixture("local-pack-ad-then-two-organic.html");
      const candidates = parseRestaurantEntries(doc);

      expect(candidates).toHaveLength(3);

      expect(candidates[0].query.name).toBe("La Cubanita Restaurant & Cocktail Bar");
      expect(candidates[1].query.name).toBe("Old's Havana Cuban Bar & Cocina");
      expect(candidates[2].query.name).toBe("Sala'o Cuban Restaurant & Bar");

      // Local-pack rows carry the local context (standard card variant).
      expect(candidates.every((c) => c.context === "local")).toBe(true);

      // Each entry element must actually contain the matching query's name,
      // proving the pairing — not just the count — is correct.
      expect(candidates[0].entry.textContent).toContain("La Cubanita");
      expect(candidates[1].entry.textContent).toContain("Old's Havana");
      expect(candidates[2].entry.textContent).toContain("Sala'o");
      expect(candidates[1].entry.textContent).not.toContain("La Cubanita");
      expect(candidates[2].entry.textContent).not.toContain("La Cubanita");
    });
  });

  describe("knowledge panel (single-business search)", () => {
    // Searching one restaurant by name renders a business panel with
    // Google's structured [data-attrid] hooks instead of local-pack rows.
    const KP_HTML = `<div id="rcnt">
      <div class="osrp-blk">
        <div data-attrid="title">Demo Deli [PlateCheck Demo]</div>
        <div data-attrid="subtitle">Deli in New York</div>
        <div data-attrid="kc:/location/location:address">
          <span>Address: </span><span>205 E Houston St, New York, NY 10002</span>
        </div>
        <div data-attrid="kc:/local:alt phone">Phone: (212) 555-0100</div>
      </div>
    </div>`;

    it("extracts the full query from panel structured data", () => {
      const doc = new JSDOM(KP_HTML).window.document;
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].name).toBe("Demo Deli [PlateCheck Demo]");
      expect(candidates[0].street).toBe("205 E Houston St");
      expect(candidates[0].city).toBe("New York");
      expect(candidates[0].zip).toBe("10002");
      expect(candidates[0].phone).toBe("(212) 555-0100");
    });

    it("inserts before #center_col when the panel is in a separate column", () => {
      // Real Google layouts (verified against the live DOM 2026-07-22):
      // Google's business panel (with the address) occupies its own rows
      // while the organic web results live in #center_col, which does NOT
      // contain the address. The card is placed as a sibling *before*
      // #center_col so it becomes a full-width header row beneath the
      // panel and above the results — on stable top-level containers the
      // panel re-render cannot displace.
      const html = `<div id="rcnt">
        <div class="topbar"><div data-attrid="title">Demo Deli [PlateCheck Demo]</div></div>
        <div class="hdr-strip">
          <div class="map"></div>
          <div data-attrid="kc:/location/location:address">
            <span>Address: </span><span>205 E Houston St, New York, NY 10002</span>
          </div>
        </div>
        <div id="center_col">
          <div class="g"><h3><a href="#">Demo Deli — official site</a></h3></div>
        </div>
      </div>`;
      const doc = new JSDOM(html).window.document;
      const entries = parseRestaurantEntries(doc);
      expect(entries).toHaveLength(1);
      expect(entries[0].entry.id).toBe("center_col");
      expect(entries[0].placement).toBe("before");
      expect(entries[0].context).toBe("panel");
    });

    it("prepends into #rhs when the panel lives in the right-hand rail", () => {
      // Right-rail layout (the one Google serves for many single-business
      // searches): the whole business panel — including the address — sits
      // in #rhs, while #center_col holds unrelated organic results. A
      // full-width row above #center_col would strand the card at the top
      // left, detached from the panel on the right, so the card goes into
      // #rhs itself, above the panel content.
      const html = `<div id="rcnt">
        <div id="center_col">
          <div class="g"><h3><a href="#">Demo Deli — official site</a></h3></div>
        </div>
        <div id="rhs">
          <div class="kp-wholepage">
            <div data-attrid="title">Demo Deli [PlateCheck Demo]</div>
            <div data-attrid="kc:/location/location:address">
              <span>Address: </span><span>205 E Houston St, New York, NY 10002</span>
            </div>
          </div>
        </div>
      </div>`;
      const doc = new JSDOM(html).window.document;
      const entries = parseRestaurantEntries(doc);
      expect(entries).toHaveLength(1);
      expect(entries[0].entry.id).toBe("rhs");
      expect(entries[0].placement).toBe("prepend");
      expect(entries[0].context).toBe("panel");
    });

    it("still uses the full-width row when #rhs exists but holds no address", () => {
      // Full-width business header: #rhs is present (ads/related), but the
      // panel with the address spans above both columns. The card must stay
      // a full-width row before #center_col, not drop into the rail.
      const html = `<div id="rcnt">
        <div class="hdr-strip">
          <div data-attrid="title">Demo Deli [PlateCheck Demo]</div>
          <div data-attrid="kc:/location/location:address">
            <span>Address: </span><span>205 E Houston St, New York, NY 10002</span>
          </div>
        </div>
        <div id="center_col">
          <div class="g"><h3><a href="#">Demo Deli — official site</a></h3></div>
        </div>
        <div id="rhs"><div id="rhsads"></div></div>
      </div>`;
      const doc = new JSDOM(html).window.document;
      const entries = parseRestaurantEntries(doc);
      expect(entries).toHaveLength(1);
      expect(entries[0].entry.id).toBe("center_col");
      expect(entries[0].placement).toBe("before");
    });

    it("anchors to the panel container when no desktop results column exists", () => {
      // Mobile Google serves no #rcnt / #center_col / #rso grid. The climb
      // to a results column finds nothing, so placement falls back to the
      // nearest element containing both the name and the address — the
      // business block, whatever the markup calls it. Without this the walk
      // ran to <html> and injected the card outside the document.
      const html = `<body>
        <div class="hdr"></div>
        <div class="biz-block">
          <div data-attrid="title">Demo Deli [PlateCheck Demo]</div>
          <div class="details">
            <div data-attrid="kc:/location/location:address">
              <span>Address: </span><span>205 E Houston St, New York, NY 10002</span>
            </div>
          </div>
        </div>
        <div class="results"></div>
      </body>`;
      const doc = new JSDOM(html).window.document;
      const entries = parseRestaurantEntries(doc);
      expect(entries).toHaveLength(1);
      expect(entries[0].entry.className).toBe("biz-block");
      expect(entries[0].placement).toBe("after");
      // Never an anchor that would put the card outside the document.
      expect(["HTML", "BODY"]).not.toContain(entries[0].entry.tagName);
    });

    it("never anchors to body when title and address share only the page shell", () => {
      // Degenerate layout: the only common ancestor is <body>. The card
      // must still land beside the address, not after the whole document.
      const html = `<body>
        <div data-attrid="title">Demo Deli [PlateCheck Demo]</div>
        <div class="addr-wrap">
          <div data-attrid="kc:/location/location:address">
            <span>Address: </span><span>205 E Houston St, New York, NY 10002</span>
          </div>
        </div>
      </body>`;
      const doc = new JSDOM(html).window.document;
      const entries = parseRestaurantEntries(doc);
      expect(entries).toHaveLength(1);
      expect(["HTML", "BODY"]).not.toContain(entries[0].entry.tagName);
      expect(entries[0].entry.className).toBe("addr-wrap");
    });

    it("injects after the panel wrapper when the panel is inside #center_col", () => {
      // Whole-page panel layout: the panel itself lives inside #center_col
      // above the results, so #center_col contains the address. Prepending
      // would put the card above the panel's own photos/title; instead the
      // card injects after the panel wrapper (the direct child of the
      // results column that holds the title), landing between the panel
      // and the first organic result.
      const html = `<div id="rcnt">
        <div id="center_col">
          <div class="panel-wrap">
            <div data-attrid="title">Demo Deli [PlateCheck Demo]</div>
            <div class="mod">
              <div data-attrid="kc:/location/location:address">
                <span>Address: </span><span>205 E Houston St, New York, NY 10002</span>
              </div>
            </div>
            <h3>Reviews from the web</h3>
          </div>
          <div class="g"><h3><a href="#">Demo Deli — official site</a></h3></div>
        </div>
      </div>`;
      const doc = new JSDOM(html).window.document;
      const entries = parseRestaurantEntries(doc);
      expect(entries).toHaveLength(1);
      expect(entries[0].entry.className).toBe("panel-wrap");
      expect(entries[0].placement).toBe("after");
      expect(entries[0].context).toBe("panel");
    });

    it("marks panel candidates with the panel context", () => {
      const doc = new JSDOM(KP_HTML).window.document;
      const entries = parseRestaurantEntries(doc);
      expect(entries[0].context).toBe("panel");
    });

    it("returns nothing when the panel has no address", () => {
      const doc = new JSDOM(
        `<div><div data-attrid="title">Some Business</div></div>`
      ).window.document;
      expect(parseRestaurantCandidates(doc)).toHaveLength(0);
    });
  });

  describe("list rows keep the standard card when a panel is also present", () => {
    // Regression guard: the prominent variant is exclusively for the
    // knowledge panel. A page showing both a result list and a panel
    // (e.g. searching a specific restaurant) must never mark list rows
    // as "panel" — list cards stay standard everywhere (search results
    // page, places/local finder, etc.).
    it("marks list rows local and only the panel candidate panel", () => {
      const html = `<div id="search">
        <div class="uMdZh">
          <div class="VkpGBb">
            <div><div><div class="rllt__details">
              <div class="dbg0pd"><span class="OSrXXb">Flamingo Diner [PlateCheck Demo]</span></div>
              <div>4.5(200) · Diner</div>
              <div>500 Ocean Drive</div>
            </div></div></div>
          </div>
        </div>
        <div data-attrid="title">Sunshine Grill [PlateCheck Demo]</div>
        <div data-attrid="kc:/location/location:address">
          <span>Address: </span><span>1420 Palm Avenue, Tampa, FL 33601</span>
        </div>
      </div>`;
      const doc = new JSDOM(html).window.document;
      const candidates = parseRestaurantEntries(doc);

      expect(candidates).toHaveLength(2);
      const listRow = candidates.find(
        (c) => c.query.name === "Flamingo Diner [PlateCheck Demo]"
      );
      const panel = candidates.find(
        (c) => c.query.name === "Sunshine Grill [PlateCheck Demo]"
      );
      expect(listRow?.context).toBe("local");
      expect(panel?.context).toBe("panel");
    });
  });

  // Shapes taken from live Google Search on 2026-09-27 (Florida, NYC,
  // Columbus and Cincinnati restaurant searches), with names swapped for
  // fictional ones and Google's obfuscated classes kept only where the
  // markup really carries them.
  describe("September 2026 Google Search layout", () => {
    // The single-restaurant panel: a full-width header holds the title,
    // and the address/phone rows sit in the right rail under the new
    // data-local-attribute hooks rather than location:address.
    const PANEL_2026_09 = `<div id="rcnt">
      <div class="hdr">
        <div class="PZPZlf ssJ7i" aria-level="2" data-attrid="title" role="heading">Harbor Light Cafe [PlateCheck Demo]</div>
        <div data-attrid="subtitle">4.5 · $10–20 · Cuban restaurant</div>
      </div>
      <div id="center_col"><div id="rso"><div class="g">organic result</div></div></div>
      <div id="rhs">
        <div class="zloOqf PZPZlf" data-dtype="d3ifr" data-local-attribute="d3adr">
          <span class="w8qArf"><a class="fl" href="#">Address</a><span>:</span> </span>
          <span class="LrzXr">1420 Palm Avenue, Tampa, FL 33601</span>
        </div>
        <div class="zloOqf PZPZlf" data-dtype="d3ifr" data-local-attribute="d3ph">
          <span class="w8qArf"><a class="fl" href="#">Phone</a><span>:</span> </span>
          <span class="LrzXr"><a href="#"><span aria-label="Call phone number (813) 555-0101">(813) 555-0101</span></a></span>
        </div>
      </div>
    </div>`;

    // "Menu highlights" dish tiles and a YouTube video card, both of which
    // carry [data-cid] in the live markup.
    const MENU_AND_VIDEO_CARDS = `
      <div class="OYzgjc"><span role="heading" aria-level="2">Menu highlights</span>
        <div data-cid="/g/11dish1" class="hGvele" data-url="https://www.google.com/local/place/offerings?on=Mojitos">
          <div role="heading"><span>Mojitos</span></div><div>172 reviews · 17 photos</div>
        </div>
        <div data-cid="/g/11dish2" class="hGvele" data-url="https://www.google.com/local/place/offerings?on=Flan">
          <div role="heading"><span>Cuban Style Flan</span></div><div>1 review · 55 photos</div>
        </div>
      </div>
      <div data-cid="yt1" class="WVV5ke">
        <div role="heading"><span>Easy White Bread Recipe</span></div>
        <div>YouTube · A Baking Channel · Jan 28</div>
      </div>`;

    it("finds the panel through the d3adr and d3ph hooks", () => {
      const doc = new JSDOM(PANEL_2026_09).window.document;
      const candidates = parseRestaurantEntries(doc);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].context).toBe("panel");
      expect(candidates[0].query).toEqual({
        name: "Harbor Light Cafe [PlateCheck Demo]",
        street: "1420 Palm Avenue",
        city: "Tampa",
        zip: "33601",
        phone: "(813) 555-0101",
      });
    });

    it("skips an empty placeholder that shares the address hook", () => {
      const doc = new JSDOM(
        PANEL_2026_09.replace(
          '<div id="rhs">',
          '<div id="rhs"><div data-local-attribute="d3adr"></div><div data-local-attribute="d3ph"> </div>'
        )
      ).window.document;
      const [panel] = parseRestaurantEntries(doc);
      expect(panel?.query.street).toBe("1420 Palm Avenue");
      expect(panel?.query.phone).toBe("(813) 555-0101");
    });

    it("puts the panel card at the top of the right rail, where the address lives", () => {
      const doc = new JSDOM(PANEL_2026_09).window.document;
      const [panel] = parseRestaurantEntries(doc);
      expect(panel.entry.id).toBe("rhs");
      expect(panel.placement).toBe("prepend");
    });

    it("ignores dish tiles and video cards even though they carry data-cid", () => {
      const doc = new JSDOM(`<div id="search">${MENU_AND_VIDEO_CARDS}</div>`).window.document;
      expect(parseRestaurantEntries(doc)).toEqual([]);
    });

    it("yields only the panel when the panel page also shows dish tiles", () => {
      const doc = new JSDOM(
        PANEL_2026_09.replace('<div class="g">organic result</div>', MENU_AND_VIDEO_CARDS)
      ).window.document;
      const candidates = parseRestaurantEntries(doc);
      expect(candidates.map((c) => c.query.name)).toEqual([
        "Harbor Light Cafe [PlateCheck Demo]",
      ]);
    });

    it("still accepts a data-cid row that is a real listing with a street", () => {
      const doc = new JSDOM(`<div id="search">
        ${MENU_AND_VIDEO_CARDS}
        <div data-cid="row1">
          <div role="heading"><span>Flamingo Diner [PlateCheck Demo]</span></div>
          <div class="rllt__details"><div class="W4Efsd">500 Ocean Drive, Miami Beach, FL 33139</div></div>
        </div>
      </div>`).window.document;
      const candidates = parseRestaurantEntries(doc);
      expect(candidates.map((c) => c.query.name)).toEqual(["Flamingo Diner [PlateCheck Demo]"]);
    });

    it("drops a data-cid row with a details block but no address in it", () => {
      const doc = new JSDOM(`<div id="search">
        <div data-cid="row2">
          <div role="heading"><span>Flamingo Diner [PlateCheck Demo]</span></div>
          <div class="rllt__details"><div class="W4Efsd">Diner · Open until 11 PM</div></div>
        </div>
      </div>`).window.document;
      expect(parseRestaurantEntries(doc)).toEqual([]);
    });
  });

  describe("unsupported markup", () => {
    it("returns empty array for completely unrelated HTML", () => {
      const doc = new JSDOM("<html><body><p>Hello world</p></body></html>").window.document;
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toEqual([]);
    });

    it("returns empty array for empty document", () => {
      const doc = new JSDOM("").window.document;
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toEqual([]);
    });
  });
});

// Structure verified against live google.com/maps in August 2026. Class
// names are deliberately omitted from the fixture: the parser must locate
// everything via role, data-item-id, and the h1's position, because Maps'
// real class names are obfuscated and rotate.
function mapsPanel(options: {
  name?: string;
  address?: string | null;
  phone?: string | null;
} = {}): Document {
  const {
    name = "Jeff Ruby's Steakhouse",
    address = "Address: 505 Vine St, Cincinnati, OH 45202 ",
    phone = "Phone: (513) 784-1200 ",
  } = options;
  return new JSDOM(`
    <body>
      <div role="main" aria-label="${name}">
        <div>
          <div id="title-block"><h1>${name}</h1><span>4.7 (3,257) Steak house</span></div>
          <div id="tab-strip">Overview Menu Reviews About</div>
          <div>
            <div>
              ${address === null ? "" : `<button data-item-id="address" aria-label="${address}"></button>`}
              ${phone === null ? "" : `<button data-item-id="phone:tel:+15137841200" aria-label="${phone}"></button>`}
            </div>
          </div>
        </div>
      </div>
    </body>`).window.document;
}

describe("parseMapsPlacePanel", () => {
  it("extracts name, full address and phone from the place panel", () => {
    const c = parseMapsPlacePanel(mapsPanel())!;
    expect(c).not.toBeNull();
    expect(c.query.name).toBe("Jeff Ruby's Steakhouse");
    expect(c.query.street).toBe("505 Vine St");
    expect(c.query.city).toBe("Cincinnati");
    expect(c.query.zip).toBe("45202");
    // The panel is the only surface that also yields a phone number.
    expect(c.query.phone).toBe("(513) 784-1200");
  });

  it("renders the prominent card, placed after the title block", () => {
    const c = parseMapsPlacePanel(mapsPanel())!;
    expect(c.context).toBe("panel");
    expect(c.placement).toBe("after");
    // Anchored to the h1's block, not a deep subtree — so the card lands
    // under the name and above the Overview/Menu/Reviews strip.
    expect((c.entry as HTMLElement).id).toBe("title-block");
  });

  it("is inert without the address button, so Search's role=main is ignored", () => {
    expect(parseMapsPlacePanel(mapsPanel({ address: null }))).toBeNull();
  });

  it("still matches when no phone is listed", () => {
    const c = parseMapsPlacePanel(mapsPanel({ phone: null }))!;
    expect(c.query.phone).toBeUndefined();
    expect(c.query.street).toBe("505 Vine St");
  });

  it("handles a Cincinnati address written with a short street suffix", () => {
    const c = parseMapsPlacePanel(
      mapsPanel({ name: "Wendy's", address: "Address: 6243 Glenway Ave, Cincinnati, OH 45211" })
    )!;
    expect(c.query.street).toBe("6243 Glenway Ave");
    expect(c.query.city).toBe("Cincinnati");
    expect(c.query.zip).toBe("45211");
  });

  it("surfaces through parseRestaurantEntries", () => {
    const entries = parseRestaurantEntries(mapsPanel());
    expect(entries).toHaveLength(1);
    expect(entries[0].context).toBe("panel");
    expect(entries[0].query.city).toBe("Cincinnati");
  });

  it("does not fire on a page with no Maps panel at all", () => {
    const doc = new JSDOM(`<body><div role="main"><h1>Some page</h1></div></body>`).window.document;
    expect(parseMapsPlacePanel(doc)).toBeNull();
    expect(parseRestaurantEntries(doc)).toHaveLength(0);
  });
});
