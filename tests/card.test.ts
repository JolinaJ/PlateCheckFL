import { describe, it, expect } from "vitest";
import { buildSourceUrl } from "../src/ui/card";
import type { IndexedFacility } from "../src/types/extension";

function fac(overrides: Partial<IndexedFacility> = {}): IndexedFacility {
  return {
    n: "TEST RESTAURANT", a: "100 MAIN ST", c: "MIAMI", z: "33101",
    ln: "SEA001", co: "Dade", p: "",
    d: "01/15/2026", t: "Routine - Food",
    di: "Inspection Completed - No Further Action",
    hp: 0, im: 0, ba: 0, ic: 1,
    lid: "", vid: "",
    ...overrides,
  };
}

describe("buildSourceUrl", () => {
  it("builds a deep link to the specific inspection when IDs are present", () => {
    const url = buildSourceUrl(fac({ lid: "2155271", vid: "13642234" }));
    expect(url).toBe(
      "https://www.myfloridalicense.com/inspectionDetail.asp?InspVisitID=13642234&licid=2155271"
    );
  });

  it("falls back to the general public-records page when IDs are missing", () => {
    const url = buildSourceUrl(fac({ lid: "", vid: "" }));
    expect(url).toBe("https://www2.myfloridalicense.com/hotels-restaurants/public-records/");
  });

  it("links NYC facilities to the official ABC Eats search", () => {
    const url = buildSourceUrl(fac({ j: "nyc", vid: "50000001", lid: "" }));
    expect(url).toBe("https://a816-health.nyc.gov/ABCEatsRestaurants/#!/Search");
  });

  it("links Columbus facilities to their EnvisionConnect record by facility id", () => {
    const url = buildSourceUrl(fac({ j: "columbus", vid: "FA0000820", lid: "" }));
    expect(url).toBe(
      "https://pressagent.envisionconnect.com/fac.phtml?agency=COL&forceresults=1&facid=FA0000820"
    );
  });

  it("falls back to the Columbus portal search when the facility id is missing", () => {
    const url = buildSourceUrl(fac({ j: "columbus", vid: "", lid: "" }));
    expect(url).toBe("https://pressagent.envisionconnect.com/main.phtml?agency=COL");
  });
});
