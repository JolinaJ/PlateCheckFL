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

  describe("sponsored/ad results are ignored", () => {
    it("returns no candidates for ad-marked results", () => {
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
    it("ignores a sponsored result whose text starts with 'Sponsored'", () => {
      const doc = loadFixture("local-pack-sponsored-real.html");
      const candidates = parseRestaurantCandidates(doc);
      expect(candidates).toHaveLength(0);
    });
  });

  describe("parseRestaurantEntries — query/entry pairing stays aligned", () => {
    it("does not shift indices when a sponsored row precedes real listings", () => {
      const doc = loadFixture("local-pack-ad-then-two-organic.html");
      const candidates = parseRestaurantEntries(doc);

      // The sponsored row must be excluded entirely, not just skipped in
      // the query list while leaving a gap in a separately-collected
      // entries list (the bug this regression guards against).
      expect(candidates).toHaveLength(2);

      expect(candidates[0].query.name).toBe("Old's Havana Cuban Bar & Cocina");
      expect(candidates[1].query.name).toBe("Sala'o Cuban Restaurant & Bar");

      // Each entry element must actually contain the matching query's name,
      // proving the pairing — not just the count — is correct.
      expect(candidates[0].entry.textContent).toContain("Old's Havana");
      expect(candidates[1].entry.textContent).toContain("Sala'o");
      expect(candidates[0].entry.textContent).not.toContain("La Cubanita");
      expect(candidates[1].entry.textContent).not.toContain("La Cubanita");
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
