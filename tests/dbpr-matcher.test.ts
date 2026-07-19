import { describe, it, expect } from "vitest";
import {
  matchFacility,
  dbprNameSimilarity,
  normalizeForComparison,
  stripBusinessType,
  streetMatch,
} from "../src/matching/dbpr-matcher";
import type { IndexedFacility } from "../src/types/extension";

function fac(overrides: Partial<IndexedFacility> = {}): IndexedFacility {
  return {
    n: "TEST RESTAURANT", a: "100 MAIN ST", c: "MIAMI", z: "33101",
    ln: "SEA001", co: "Dade", p: "(305)555-0001",
    d: "01/15/2026", t: "Routine - Food",
    di: "Inspection Completed - No Further Action",
    hp: 0, im: 0, ba: 0, ic: 1,
    lid: "1000001", vid: "20000001",
    ...overrides,
  };
}

describe("dbprNameSimilarity", () => {
  it("exact match returns 1.0", () => {
    expect(dbprNameSimilarity("VERSAILLES", "VERSAILLES")).toBe(1.0);
  });

  it("handles DBPR suffix: RESTAURANT appended", () => {
    const sim = dbprNameSimilarity("JOE'S CRAB", "JOES CRAB RESTAURANT");
    expect(sim).toBeGreaterThan(0.7);
  });

  it("handles pluralization: CRAB vs CRABS", () => {
    const sim = dbprNameSimilarity("JOE'S STONE CRAB", "JOES STONE CRABS RESTAURANT");
    expect(sim).toBeGreaterThan(0.6);
  });

  it("handles & vs and", () => {
    const sim = dbprNameSimilarity("SALT & PEPPER", "SALT AND PEPPER RESTAURANT");
    expect(sim).toBeGreaterThan(0.7);
  });

  it("handles LLC/Inc stripping", () => {
    const sim = dbprNameSimilarity("TACO PALACE", "TACO PALACE INC");
    expect(sim).toBeGreaterThan(0.85);
  });

  it("completely different names score low", () => {
    const sim = dbprNameSimilarity("SUNSHINE GRILL", "OCEAN BREEZE SUSHI");
    expect(sim).toBeLessThan(0.3);
  });
});

describe("stripBusinessType", () => {
  it("strips RESTAURANT", () => {
    expect(stripBusinessType("joes crab restaurant")).toBe("joes crab");
  });

  it("strips REST", () => {
    expect(stripBusinessType("versailles rest")).toBe("versailles");
  });

  it("strips multiple suffixes", () => {
    expect(stripBusinessType("big fish bar and grill")).toBe("big fish");
  });
});

describe("streetMatch — suite/unit handling", () => {
  it("both present, same suite => full similarity, no mismatch", () => {
    const r = streetMatch("100 Main St Suite 200", "100 Main St Ste 200");
    expect(r.similarity).toBe(1.0);
    expect(r.suiteMismatch).toBe(false);
  });

  it("both present, different suite => mismatch flagged", () => {
    const r = streetMatch("100 Main St Suite 200", "100 Main St Suite 500");
    expect(r.suiteMismatch).toBe(true);
  });

  it("only query has a suite, facility has none => no mismatch (asymmetric)", () => {
    const r = streetMatch("100 Main St Suite 200", "100 Main St");
    expect(r.similarity).toBe(1.0);
    expect(r.suiteMismatch).toBe(false);
  });

  it("only facility has a suite, query has none => no mismatch (asymmetric)", () => {
    const r = streetMatch("100 Main St", "100 Main St Suite 200");
    expect(r.similarity).toBe(1.0);
    expect(r.suiteMismatch).toBe(false);
  });

  it("neither has a suite => no mismatch", () => {
    const r = streetMatch("100 Main St", "100 Main St");
    expect(r.similarity).toBe(1.0);
    expect(r.suiteMismatch).toBe(false);
  });

  it("recognizes BLDG as a unit designator (real case: '1000 NE 16 AVE BLDG H')", () => {
    const r = streetMatch("1000 NE 16th Ave", "1000 NE 16 AVE BLDG H");
    expect(r.similarity).toBe(1.0);
  });

  it("does not misparse 'Bay' as a unit designator when it's part of the actual street name", () => {
    // "Bay" is a common real Florida street word (Bay St, Bayshore Blvd,
    // Tampa Bay Blvd). It must not be treated as a unit-designator prefix.
    const r = streetMatch("500 Bay St Suite 200", "500 BAY ST SUITE 100");
    expect(r.suiteMismatch).toBe(true);
    expect(r.similarity).toBe(1.0);
  });

  it("does not misparse 'Gate' as a unit designator (real Jacksonville street: Gate Pkwy)", () => {
    const r = streetMatch("100 Gate Pkwy", "100 GATE PKWY");
    expect(r.similarity).toBe(1.0);
  });
});

describe("matchFacility", () => {
  const facilities: IndexedFacility[] = [
    fac({ ln: "SEA001", n: "VERSAILLES REST", a: "3555 SW 8 ST", c: "MIAMI", z: "33135" }),
    fac({ ln: "SEA002", n: "MCDONALDS", a: "9850 SW 8 ST", c: "MIAMI", z: "33174" }),
    fac({ ln: "SEA003", n: "MCDONALDS", a: "11899 NW 7 AVE", c: "MIAMI", z: "33168" }),
    fac({ ln: "SEA004", n: "JOES STONE CRABS RESTAURANT", a: "11 WASHINGTON AVE", c: "MIAMI BEACH", z: "33139" }),
  ];

  it("exact name+address => confirmed", () => {
    const r = matchFacility(
      { name: "VERSAILLES", street: "3555 SW 8 ST", city: "MIAMI" },
      facilities
    );
    expect(r.confidence).toBe("confirmed");
    expect(r.facility?.ln).toBe("SEA001");
  });

  it("DBPR name variation with address => confirmed", () => {
    const r = matchFacility(
      { name: "Joe's Stone Crab", street: "11 Washington Ave", city: "Miami Beach" },
      facilities
    );
    expect(r.confidence).toBe("confirmed");
    expect(r.facility?.ln).toBe("SEA004");
  });

  it("ambiguous chain name without address => not confirmed", () => {
    const r = matchFacility(
      { name: "McDonald's", city: "Miami" },
      facilities
    );
    expect(r.confidence).not.toBe("confirmed");
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("no match => unmatched", () => {
    const r = matchFacility(
      { name: "XYZZY NONEXISTENT PLACE" },
      facilities
    );
    expect(r.confidence).toBe("unmatched");
    expect(r.facility).toBeNull();
  });

  it("ordinal street suffix (8th) matches DBPR's bare number (8) — regression", () => {
    const r = matchFacility(
      { name: "Versailles", street: "3555 SW 8th St", city: "Miami" },
      facilities
    );
    expect(r.confidence).toBe("confirmed");
    expect(r.facility?.ln).toBe("SEA001");
  });

  it("strong name+street confirms even with no city in the query — regression", () => {
    // Google's local-pack frequently omits city/state/zip text entirely
    // (e.g. "1442 SW 8th St" with nothing appended) when the search is
    // already scoped to that city. Confirmed must not require the city
    // scoring bonus to be reachable in this very common case.
    const r = matchFacility(
      { name: "Versailles", street: "3555 SW 8th St" },
      facilities
    );
    expect(r.confidence).toBe("confirmed");
    expect(r.facility?.ln).toBe("SEA001");
  });

  it("policy: strong address match + merely partial name match => confirmed", () => {
    // Explicit product policy: an exact street address is itself a highly
    // discriminating signal. Once it matches, the name only needs to clear
    // the floor (a partial/weak match), not be near-identical, for the
    // result to be full confidence.
    const weakNameFacilities: IndexedFacility[] = [
      fac({ ln: "SEA010", n: "BIG FISH GRILL AND OYSTER HOUSE", a: "200 OCEAN AVE", c: "MIAMI", z: "33101" }),
    ];
    const r = matchFacility(
      // "Fish House" shares only "fish" / "house" tokens with the DBPR
      // name once business-type words are stripped — a weak, partial
      // match — but the street address is an exact match.
      { name: "Fish House", street: "200 Ocean Ave", city: "Miami" },
      weakNameFacilities
    );
    expect(r.confidence).toBe("confirmed");
    expect(r.facility?.ln).toBe("SEA010");
  });

  it("policy: missing suite on the query side does not block confirmed", () => {
    const suiteFacilities: IndexedFacility[] = [
      fac({ ln: "SEA020", n: "OCEAN GRILL", a: "500 BAY ST SUITE 100", c: "MIAMI", z: "33101" }),
    ];
    // Google often shows the bare street with no suite info at all.
    const r = matchFacility(
      { name: "Ocean Grill", street: "500 Bay St", city: "Miami" },
      suiteFacilities
    );
    expect(r.confidence).toBe("confirmed");
    expect(r.facility?.ln).toBe("SEA020");
  });

  it("policy: matching suite on both sides does not block confirmed", () => {
    const suiteFacilities: IndexedFacility[] = [
      fac({ ln: "SEA021", n: "OCEAN GRILL", a: "500 BAY ST SUITE 100", c: "MIAMI", z: "33101" }),
    ];
    const r = matchFacility(
      { name: "Ocean Grill", street: "500 Bay St Suite 100", city: "Miami" },
      suiteFacilities
    );
    expect(r.confidence).toBe("confirmed");
    expect(r.facility?.ln).toBe("SEA021");
  });

  it("policy: conflicting suite on both sides is flagged and never auto-displayed", () => {
    // Same building, different tenant — base street matches but the
    // specific units conflict. Must not be silently confirmed/likely.
    const suiteFacilities: IndexedFacility[] = [
      fac({ ln: "SEA022", n: "OCEAN GRILL", a: "500 BAY ST SUITE 100", c: "MIAMI", z: "33101" }),
    ];
    const r = matchFacility(
      { name: "Ocean Grill", street: "500 Bay St Suite 200", city: "Miami" },
      suiteFacilities
    );
    expect(r.confidence).not.toBe("confirmed");
    expect(r.confidence).not.toBe("likely");
    expect(r.suiteMismatch).toBe(true);
  });

  it("marketing name with extra descriptive words beats a decoy with shared generic words — regression", () => {
    // Captured from a real Google local-pack result: the query has extra
    // marketing copy ("Cuban Cuisine") not present in DBPR's terse name,
    // while a same-street decoy ("MOJITOS CUBAN CUISINE") shares those
    // generic words but is a different business entirely.
    const decoyFacilities: IndexedFacility[] = [
      fac({ ln: "SEA001", n: "VERSAILLES REST", a: "3555 SW 8 ST", c: "MIAMI", z: "33135" }),
      fac({ ln: "SEA005", n: "MOJITOS CUBAN CUISINE", a: "8000 SW 8TH STREET", c: "MIAMI", z: "33144" }),
    ];
    const r = matchFacility(
      { name: "Versailles Restaurant Cuban Cuisine", street: "3555 SW 8th St", city: "Miami" },
      decoyFacilities
    );
    expect(r.confidence).toBe("confirmed");
    expect(r.facility?.ln).toBe("SEA001");
  });

  describe("street name mismatch (renamed street) — regression", () => {
    // Real case: Google shows "4860 Steve Spurrier Way" (an honorary
    // rename); DBPR's record still uses the legacy grid name "SW 31 PL".
    // The restaurant is licensed twice, once per floor, both at the
    // identical address.
    const spurrierFacilities: IndexedFacility[] = [
      fac({ ln: "SEA1103642", n: "SPURRIER'S GRIDIRON GRILLE FIRST FLOOR", a: "4860 SW 31 PL #20", c: "GAINESVILLE", z: "32608" }),
      fac({ ln: "SEA1103643", n: "SPURRIER'S GRIDIRON GRILLE SECOND FLOOR", a: "4860 SW 31 PL #20", c: "GAINESVILLE", z: "32608" }),
      fac({ ln: "SEA9999999", n: "GRIDIRON GRILL C342", a: "4116 N HIMES AVE", c: "TAMPA", z: "33614" }),
    ];

    it("matching house number + very strong name reaches confirmed despite a totally different street name", () => {
      // Product policy: house number + a very strong, distinctive name is
      // treated as full address corroboration on par with a direct text
      // match, even when the street name text itself differs.
      const r = matchFacility(
        { name: "Spurrier's Gridiron Grille", street: "4860 Steve Spurrier Way" },
        spurrierFacilities
      );
      expect(r.confidence).toBe("confirmed");
      expect(r.streetNameMismatch).toBe(true);
      expect(r.facility?.a).toBe("4860 SW 31 PL #20");
    });

    it("co-located duplicates (same address, different floor) do not trigger the ambiguity downgrade", () => {
      const r = matchFacility(
        { name: "Spurrier's Gridiron Grille", street: "4860 Steve Spurrier Way" },
        spurrierFacilities
      );
      expect(r.coLocatedCount).toBe(2);
      // Despite two near-identical-scoring candidates, confidence is not
      // suppressed because they're the same building.
      expect(r.confidence).toBe("confirmed");
    });

    it("a non-matching house number does not trigger the street-name-mismatch shortcut", () => {
      // Same highly distinctive name, but no candidate shares this house
      // number — the number+name corroboration path must not fire just
      // because the name is strong.
      const r = matchFacility(
        { name: "Spurrier's Gridiron Grille", street: "9999 Some Other Way" },
        spurrierFacilities
      );
      expect(r.streetNameMismatch).toBe(false);
      expect(r.confidence).not.toBe("likely");
      expect(r.confidence).not.toBe("confirmed");
    });
  });

  describe("building designator (BLDG/FLOOR/etc.) — regression", () => {
    // Real case: Google shows "1000 NE 16th Ave" with no unit info; DBPR's
    // record has "1000 NE 16 AVE BLDG H". Before recognizing "BLDG" as a
    // unit designator, this fell ~0.03 short of the street-match threshold
    // and got capped at "likely" instead of "confirmed".
    it("a building-letter suffix does not block confirmed when the base street matches", () => {
      const facilities: IndexedFacility[] = [
        fac({ ln: "SEA1103322", n: "PUBLIC & GENERAL", a: "1000 NE 16 AVE BLDG H", c: "GAINESVILLE", z: "32601" }),
      ];
      const r = matchFacility(
        { name: "Public & General Restaurant", street: "1000 NE 16th Ave" },
        facilities
      );
      expect(r.confidence).toBe("confirmed");
      expect(r.facility?.ln).toBe("SEA1103322");
    });
  });

  describe("ambiguity downgrade requires a credible runner-up — regression", () => {
    // Real case: the correct facility ("HARRYS OF GAINESVILLE") has an
    // exact address match (confirmed on its own evidence). A different,
    // unrelated facility happens to carry the full marketing name
    // ("HARRY'S SEAFOOD BAR & GRILLE") at a different address, scoring
    // close in raw points purely from name strength with no real address
    // corroboration (only "possible" on its own). That weak decoy must not
    // drag the genuinely confirmed match down to "likely".
    it("a weak (possible-tier) runner-up does not downgrade a confirmed match", () => {
      const facilities: IndexedFacility[] = [
        fac({ ln: "SEA1102437", n: "HARRYS OF GAINESVILLE", a: "110 SE 1 ST", c: "GAINESVILLE", z: "32601" }),
        fac({ ln: "SEA5202044", n: "HARRY'S SEAFOOD BAR & GRILLE", a: "24 SE 1 AVE", c: "GAINESVILLE", z: "32601" }),
      ];
      const r = matchFacility(
        { name: "Harry's Seafood Bar & Grille", street: "110 SE 1st St" },
        facilities
      );
      expect(r.confidence).toBe("confirmed");
      expect(r.facility?.ln).toBe("SEA1102437");
    });

    it("a credible (likely/confirmed-tier) runner-up still triggers the downgrade", () => {
      // Two real McDonald's-style chain locations, both independently
      // strong matches without a street to disambiguate — genuine
      // ambiguity that should still be downgraded.
      const facilities: IndexedFacility[] = [
        fac({ ln: "SEA002", n: "MCDONALDS", a: "9850 SW 8 ST", c: "MIAMI", z: "33174" }),
        fac({ ln: "SEA003", n: "MCDONALDS", a: "11899 NW 7 AVE", c: "MIAMI", z: "33168" }),
      ];
      const r = matchFacility({ name: "McDonald's", city: "Miami" }, facilities);
      expect(r.confidence).not.toBe("confirmed");
    });
  });

  describe("NYC borough handling", () => {
    it("treats Manhattan facilities as matching a 'New York' city query", () => {
      const facilities: IndexedFacility[] = [
        fac({ ln: "50000021", n: "DEMO BAGELS [PLATECHECK]", a: "100 WEST 42 STREET", c: "MANHATTAN", z: "10036" }),
      ];
      const r = matchFacility(
        { name: "Demo Bagels [PlateCheck]", street: "100 W 42nd St", city: "New York" },
        facilities
      );
      expect(r.confidence).toBe("confirmed");
    });

    it("matches other boroughs under their own names", () => {
      const facilities: IndexedFacility[] = [
        fac({ ln: "50000022", n: "DEMO PIZZA [PLATECHECK]", a: "200 FLATBUSH AVENUE", c: "BROOKLYN", z: "11217" }),
      ];
      const r = matchFacility(
        { name: "Demo Pizza [PlateCheck]", street: "200 Flatbush Ave", city: "Brooklyn" },
        facilities
      );
      expect(r.confidence).toBe("confirmed");
    });
  });

  describe("score-tie candidate ranking — regression", () => {
    // Real case (Gainesville, 2026-07): "McDonald's @ 3826 SW 40th Blvd"
    // reached "confirmed" against DBPR's "3826 SW ARCHER RD" via the
    // matching-house-number rule, but tied at the same rounded score with
    // several Miami McDonald's on "SW 40 ST" (name match + coincidental
    // "SW 40" street tokens, "possible" tier). Index order broke the tie,
    // the Miami candidates filled the top slots, and the confirmed match
    // was discarded. Confidence must break score ties.
    it("an address-corroborated match outranks same-score name-only chain siblings", () => {
      const facilities: IndexedFacility[] = [
        // Same-brand decoys FIRST, so index order alone would pick them.
        fac({ ln: "SEA101", n: "MCDONALDS", a: "11301 SW 40 ST", c: "MIAMI", z: "33165" }),
        fac({ ln: "SEA102", n: "MCDONALDS CORPORATION", a: "6700 SW 40 ST", c: "MIAMI", z: "33155" }),
        fac({ ln: "SEA103", n: "MCDONALD'S OF TROPICAL PARK", a: "7901 SW 40 ST", c: "MIAMI", z: "33155" }),
        fac({ ln: "SEA104", n: "MCDONALDS", a: "3826 SW ARCHER RD", c: "GAINESVILLE", z: "32608" }),
      ];
      const r = matchFacility(
        { name: "McDonald's", street: "3826 SW 40th Blvd" },
        facilities
      );
      expect(r.confidence).toBe("confirmed");
      expect(r.facility?.ln).toBe("SEA104");
    });
  });
});
