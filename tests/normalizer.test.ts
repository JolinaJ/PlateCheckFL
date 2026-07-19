import { describe, it, expect } from "vitest";
import {
  normalizeName,
  normalizeStreet,
  normalizeCity,
  normalizeZip,
  normalizePhone,
  nameSimilarity,
  streetSimilarity,
} from "../src/matching/normalizer";

describe("normalizeName", () => {
  it("lowercases", () => {
    expect(normalizeName("Sunshine Grill")).toBe("sunshine grill");
  });

  it("strips [PlateCheck Demo] marker", () => {
    expect(normalizeName("Sunshine Grill [PlateCheck Demo]")).toBe("sunshine grill");
  });

  it("replaces & with and", () => {
    expect(normalizeName("Salt & Ember")).toBe("salt and ember");
  });

  it("strips business suffixes", () => {
    expect(normalizeName("Bayfront Burgers Inc.")).toBe("bayfront burgers");
    expect(normalizeName("Mango Tree Bistro, LLC")).toBe("mango tree bistro");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeName("  Tony's  Ristorante  ")).toBe("tonys ristorante");
  });
});

describe("normalizeStreet", () => {
  it("abbreviates street types", () => {
    expect(normalizeStreet("1560 Clematis Street")).toBe("1560 clematis st");
  });

  it("abbreviates directions", () => {
    expect(normalizeStreet("200 SW 1st Avenue")).toBe("200 sw 1st ave");
  });

  it("strips suite/unit fragments", () => {
    expect(normalizeStreet("445 Ocean Drive, Suite 100")).toBe("445 ocean dr");
    expect(normalizeStreet("1900 University Dr, Unit B")).toBe(
      "1900 university dr"
    );
  });

  it("handles Apt fragments", () => {
    expect(normalizeStreet("300 S Atlantic Avenue, Apt 5")).toBe(
      "300 s atlantic ave"
    );
  });
});

describe("normalizeCity", () => {
  it("expands St. to saint", () => {
    expect(normalizeCity("St. Petersburg")).toBe("saint petersburg");
  });

  it("expands Ft to fort", () => {
    expect(normalizeCity("Ft Lauderdale")).toBe("fort lauderdale");
    expect(normalizeCity("Fort Lauderdale")).toBe("fort lauderdale");
  });
});

describe("normalizeZip", () => {
  it("strips +4 extension", () => {
    expect(normalizeZip("33401-1234")).toBe("33401");
  });

  it("keeps 5-digit zip", () => {
    expect(normalizeZip("33401")).toBe("33401");
  });
});

describe("normalizePhone", () => {
  it("strips formatting", () => {
    expect(normalizePhone("(813) 555-0101")).toBe("8135550101");
    expect(normalizePhone("561-555-1616")).toBe("5615551616");
  });
});

describe("nameSimilarity", () => {
  it("returns 1.0 for identical names", () => {
    expect(nameSimilarity("Sunshine Grill", "Sunshine Grill")).toBe(1.0);
  });

  it("returns 1.0 for case and punctuation variations", () => {
    expect(nameSimilarity("Tony's Ristorante", "TONYS RISTORANTE")).toBe(1.0);
  });

  it("returns 1.0 for & vs and", () => {
    expect(
      nameSimilarity(
        "Bayside Seafood & Oyster Bar",
        "Bayside Seafood and Oyster Bar"
      )
    ).toBe(1.0);
  });

  it("returns 1.0 when suffix is stripped", () => {
    expect(
      nameSimilarity("Bayfront Burgers Inc.", "Bayfront Burgers")
    ).toBe(1.0);
  });

  it("returns < 1.0 for partially overlapping names", () => {
    const sim = nameSimilarity("Sunshine Grill", "Sunshine Diner");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe("streetSimilarity", () => {
  it("returns 1.0 for abbreviated vs full street type", () => {
    expect(
      streetSimilarity("1560 Clematis Street", "1560 Clematis St")
    ).toBe(1.0);
  });

  it("returns 1.0 when suite differs", () => {
    expect(
      streetSimilarity("1900 University Drive, Unit B", "1900 University Dr")
    ).toBe(1.0);
  });

  it("returns < 1.0 for different streets", () => {
    const sim = streetSimilarity("1420 Palm Avenue", "780 Coral Way");
    expect(sim).toBeLessThan(0.5);
  });
});
