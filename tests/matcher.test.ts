import { describe, it, expect } from "vitest";
import { matchRestaurant } from "../src/matching/matcher";
import type { Facility, RestaurantQuery } from "../src/types/inspection";
import mockData from "../src/data/mock-inspections.json";

const facilities = mockData as Facility[];

describe("matchRestaurant", () => {
  it("1: exact name + exact address => confirmed", () => {
    const query: RestaurantQuery = {
      name: "Sunshine Grill",
      street: "1420 Palm Avenue",
      city: "Tampa",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.confidence).toBe("confirmed");
    expect(result.match).not.toBeNull();
    expect(result.match!.facility.licenseId).toBe("DEMO-FL-0001");
  });

  it("2: name punctuation/& variation + address variation => confirmed", () => {
    const query: RestaurantQuery = {
      name: "Bayside Seafood and Oyster Bar",
      street: "2200 Bayshore Blvd",
      city: "Tampa",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.confidence).toBe("confirmed");
    expect(result.match!.facility.licenseId).toBe("DEMO-FL-0005");
  });

  it("3: same name in different city => not confirmed for wrong city", () => {
    const query: RestaurantQuery = {
      name: "Sunshine Grill",
      street: "1420 Palm Avenue",
      city: "Miami",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.confidence).not.toBe("confirmed");
  });

  it("4: exact name + city/ZIP but no street => likely at most", () => {
    const query: RestaurantQuery = {
      name: "Sunshine Grill",
      city: "Tampa",
      zip: "33601",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.match).not.toBeNull();
    expect(["likely", "possible"]).toContain(result.confidence);
    expect(result.confidence).not.toBe("confirmed");
  });

  it("5: name-only query => possible or unmatched, never confirmed", () => {
    const query: RestaurantQuery = {
      name: "Sunshine Grill",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.confidence).not.toBe("confirmed");
    expect(["possible", "likely", "unmatched"]).toContain(result.confidence);
  });

  it("6: exact phone but contradictory address => not confirmed", () => {
    const query: RestaurantQuery = {
      name: "Sunshine Grill",
      street: "999 Wrong Street",
      city: "Tampa",
      phone: "(813) 555-0101",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.confidence).not.toBe("confirmed");
  });

  it("7: ambiguous near-duplicate candidates => downgrade", () => {
    // Papi's Taqueria exists in both Kissimmee and Tampa — name-only is ambiguous
    const query: RestaurantQuery = {
      name: "Papi's Taqueria",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.confidence).not.toBe("confirmed");
  });

  it("8: suite/unit difference does not break address match", () => {
    // Use Nonna's Italian Kitchen which has no near-duplicate
    const query: RestaurantQuery = {
      name: "Nonna's Italian Kitchen",
      street: "520 Las Olas Blvd, Suite 5",
      city: "Fort Lauderdale",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.confidence).toBe("confirmed");
    expect(result.match!.facility.licenseId).toBe("DEMO-FL-0025");
  });

  it("9: ZIP+4 normalizes correctly", () => {
    // Use Flamingo Diner which has no near-duplicate
    const query: RestaurantQuery = {
      name: "Flamingo Diner",
      street: "225 E Commercial Boulevard",
      city: "Fort Lauderdale",
      zip: "33334-5678",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.confidence).toBe("confirmed");
    expect(result.match!.facility.licenseId).toBe("DEMO-FL-0018");
  });

  it("10: no reasonable candidate => unmatched", () => {
    const query: RestaurantQuery = {
      name: "Completely Nonexistent Restaurant XYZ",
      street: "99999 Nowhere Lane",
      city: "Atlantis",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.confidence).toBe("unmatched");
    expect(result.match).toBeNull();
  });

  it("returns structured reasons on every candidate", () => {
    const query: RestaurantQuery = {
      name: "Sunshine Grill",
      street: "1420 Palm Avenue",
      city: "Tampa",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.match!.reasons.length).toBeGreaterThan(0);
    for (const reason of result.match!.reasons) {
      expect(reason).toHaveProperty("field");
      expect(reason).toHaveProperty("matched");
      expect(reason).toHaveProperty("detail");
    }
  });

  it("returns at most 3 candidates", () => {
    const query: RestaurantQuery = {
      name: "Grill",
    };
    const result = matchRestaurant(query, facilities);
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });
});
