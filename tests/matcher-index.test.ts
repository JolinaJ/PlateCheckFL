import { describe, it, expect } from "vitest";
import { matchFacility, buildMatchIndex } from "../src/matching/dbpr-matcher";
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

// The token index restricts scoring to facilities that share a name token
// with the query. These tests guard that the restriction never drops a
// facility the full scan would have matched — the risk in any blocking
// scheme — across the ways dbprNameSimilarity can score above the floor.
describe("matchFacility — token index preserves matches", () => {
  const facilities: IndexedFacility[] = [
    fac({ ln: "A1", n: "VERSAILLES REST", a: "3555 SW 8 ST", c: "MIAMI", z: "33135" }),
    fac({ ln: "A2", n: "JOES TACOS", a: "200 OCEAN DR", c: "MIAMI BEACH", z: "33139" }),
    fac({ ln: "A3", n: "JOES RESTAURANT", a: "100 MAIN ST", c: "ORLANDO", z: "32801" }),
    fac({ ln: "A4", n: "OCEAN BREEZE SUSHI", a: "50 PIER AVE", c: "TAMPA", z: "33602" }),
  ];

  it("array input and prebuilt index give identical results", () => {
    const index = buildMatchIndex(facilities);
    const queries = [
      { name: "Versailles Restaurant Cuban Cuisine", street: "3555 SW 8th St", city: "Miami" },
      { name: "Joe's Taco", street: "200 Ocean Dr", city: "Miami Beach" },
      { name: "The Restaurant", street: "100 Main St", city: "Orlando" },
      { name: "Nonexistent Place", city: "Miami" },
    ];
    for (const q of queries) {
      expect(matchFacility(q, index)).toEqual(matchFacility(q, facilities));
    }
  });

  it("matches on a distinctive shared token (terse DBPR vs marketing name)", () => {
    const r = matchFacility(
      { name: "Versailles Restaurant Cuban Cuisine", street: "3555 SW 8th St", city: "Miami" },
      facilities
    );
    expect(r.facility?.ln).toBe("A1");
    expect(r.confidence).toBe("confirmed");
  });

  it("plural/singular query still reaches the facility (taco vs tacos)", () => {
    // The facility name is "TACOS"; the query says "Taco". The candidate
    // gather must look up the singular/plural variants or this match is lost.
    const r = matchFacility(
      { name: "Joe's Taco", street: "200 Ocean Dr", city: "Miami Beach" },
      facilities
    );
    expect(r.facility?.ln).toBe("A2");
  });

  it("business-type-only shared token still matches when the address corroborates", () => {
    // "The Restaurant" shares only the business-type word "restaurant" with
    // "JOES RESTAURANT". The full scan matches it on containment + address;
    // the index must not prune business-type tokens, or this regresses.
    const r = matchFacility(
      { name: "The Restaurant", street: "100 Main St", city: "Orlando" },
      facilities
    );
    expect(r.facility?.ln).toBe("A3");
    expect(r.confidence).toBe("confirmed");
  });

  it("no shared name token => unmatched", () => {
    const r = matchFacility({ name: "Pizza Palace", city: "Miami" }, facilities);
    expect(r.confidence).toBe("unmatched");
    expect(r.facility).toBeNull();
  });

  it("querying each facility by its own name returns that facility", () => {
    const index = buildMatchIndex(facilities);
    for (const f of facilities) {
      const r = matchFacility({ name: f.n, street: f.a, city: f.c }, index);
      expect(r.facility?.ln).toBe(f.ln);
    }
  });
});
