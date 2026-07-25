import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { join } from "path";
import { parseRestaurantCandidates, parseRestaurantEntries } from "../src/content/parser";

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
