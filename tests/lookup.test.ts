import { describe, it, expect } from "vitest";
import {
  lookupRestaurant,
  normalizeText,
  normalizeAddress,
  nameSimilarity,
} from "../src/lookup/lookup";
import type { JoinedFacility } from "../src/types/dbpr";

function makeFacility(
  overrides: Partial<JoinedFacility> = {}
): JoinedFacility {
  return {
    licenseNumber: "SEA001",
    businessName: "TEST RESTAURANT",
    locationAddress: "100 MAIN ST",
    locationCity: "MIAMI",
    locationZip: "33101",
    locationCounty: "Dade",
    district: "1",
    phone: "(305)555-0001",
    numberOfSeats: "50",
    licenseExpiryDate: "10/01/2026",
    inspections: [],
    ...overrides,
  };
}

const testFacilities: JoinedFacility[] = [
  makeFacility({
    licenseNumber: "SEA001",
    businessName: "MIAMI GRILL",
    locationAddress: "100 MAIN ST",
    locationCity: "MIAMI",
    locationZip: "33101",
  }),
  makeFacility({
    licenseNumber: "SEA002",
    businessName: "MIAMI GRILL",
    locationAddress: "500 OCEAN DR",
    locationCity: "MIAMI BEACH",
    locationZip: "33139",
  }),
  makeFacility({
    licenseNumber: "SEA003",
    businessName: "CORAL CAFE & BAR",
    locationAddress: "200 CORAL WAY",
    locationCity: "MIAMI",
    locationZip: "33145",
  }),
  makeFacility({
    licenseNumber: "SEA004",
    businessName: "UNIQUE SUSHI PALACE",
    locationAddress: "750 BRICKELL AVE",
    locationCity: "MIAMI",
    locationZip: "33131",
    phone: "(305)555-9999",
  }),
];

describe("lookupRestaurant", () => {
  it("exact name + address => confirmed", () => {
    const result = lookupRestaurant(
      { name: "MIAMI GRILL", address: "100 MAIN ST", city: "MIAMI" },
      testFacilities
    );
    expect(result.confidence).toBe("confirmed");
    expect(result.facility?.licenseNumber).toBe("SEA001");
  });

  it("name + city without address => likely at most", () => {
    const result = lookupRestaurant(
      { name: "UNIQUE SUSHI PALACE", city: "MIAMI" },
      testFacilities
    );
    expect(result.confidence).not.toBe("confirmed");
    expect(["likely", "possible"]).toContain(result.confidence);
  });

  it("name only with ambiguous candidates => not confirmed", () => {
    const result = lookupRestaurant(
      { name: "MIAMI GRILL" },
      testFacilities
    );
    expect(result.confidence).not.toBe("confirmed");
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("& vs and normalization matches", () => {
    const result = lookupRestaurant(
      { name: "Coral Cafe and Bar", address: "200 Coral Way", city: "Miami" },
      testFacilities
    );
    expect(result.confidence).toBe("confirmed");
    expect(result.facility?.licenseNumber).toBe("SEA003");
  });

  it("no match => unmatched", () => {
    const result = lookupRestaurant(
      { name: "COMPLETELY UNKNOWN PLACE XYZ", city: "ATLANTIS" },
      testFacilities
    );
    expect(result.confidence).toBe("unmatched");
    expect(result.facility).toBeNull();
  });

  it("same name different city => ambiguous, not confirmed", () => {
    const result = lookupRestaurant(
      { name: "MIAMI GRILL", city: "MIAMI BEACH" },
      testFacilities
    );
    expect(result.confidence).not.toBe("confirmed");
  });
});

describe("normalizeText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeText("MIAMI GRILL & BAR")).toBe("miami grill and bar");
  });

  it("strips business suffixes", () => {
    expect(normalizeText("ACME FOODS INC.")).toBe("acme foods");
  });
});

describe("normalizeAddress", () => {
  it("abbreviates street types", () => {
    expect(normalizeAddress("200 CORAL AVENUE")).toBe("200 coral ave");
  });

  it("strips suite fragments", () => {
    expect(normalizeAddress("100 MAIN ST, SUITE 200")).toBe("100 main st");
  });
});
