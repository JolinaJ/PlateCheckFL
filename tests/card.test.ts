// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// The violations list is fetched on demand; the tests drive that fetch.
const { fetchViolations } = vi.hoisted(() => ({ fetchViolations: vi.fn() }));
vi.mock("../src/ui/violation-fetcher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/ui/violation-fetcher")>()),
  fetchViolations,
}));

import { buildSourceUrl, buildLookupUrl, createInspectionCard } from "../src/ui/card";
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

describe("Cincinnati source link", () => {
  it("links Cincinnati facilities to the official Food Safety Program records", () => {
    const url = buildSourceUrl(fac({ j: "cincinnati", vid: "CIN-HEFD-000311-26IN1" }));
    expect(url).toBe("https://data.cincinnati-oh.gov/d/rg6p-b3h3");
  });
});

describe("buildLookupUrl — secondary, non-official lookup", () => {
  it("offers the Enquirer name search for Cincinnati, where no official per-facility page exists", () => {
    expect(buildLookupUrl(fac({ j: "cincinnati" }))).toBe(
      "https://data.cincinnati.com/restaurant-inspections/"
    );
  });

  it("is never offered for jurisdictions that publish their own record page", () => {
    expect(buildLookupUrl(fac())).toBeNull(); // Florida
    expect(buildLookupUrl(fac({ j: "nyc" }))).toBeNull();
    expect(buildLookupUrl(fac({ j: "columbus" }))).toBeNull();
  });

  it("does not replace the official source link", () => {
    const f = fac({ j: "cincinnati" });
    expect(buildSourceUrl(f)).toBe("https://data.cincinnati-oh.gov/d/rg6p-b3h3");
    expect(buildLookupUrl(f)).not.toBe(buildSourceUrl(f));
  });
});

// The card renders into a closed shadow root, so tests force attachShadow
// open for the duration of the render to reach the markup (same trick as
// tests/no-match.test.ts).
function renderOpen(f: IndexedFacility): ShadowRoot {
  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init: ShadowRootInit) {
    return orig.call(this, { ...init, mode: "open" });
  };
  try {
    return createInspectionCard(f, "confirmed").shadowRoot!;
  } finally {
    Element.prototype.attachShadow = orig;
  }
}

function headerText(sr: ShadowRoot): string {
  return sr.querySelector(".platecheck-summary-line")!.textContent!.replace(/\s+/g, " ");
}

async function expandViolations(sr: ShadowRoot): Promise<HTMLElement> {
  (sr.querySelector(".platecheck-violations-toggle") as HTMLButtonElement).click();
  const list = sr.querySelector(".platecheck-violations-list") as HTMLElement;
  await vi.waitFor(() => expect(list.textContent).not.toContain("Loading"));
  return list;
}

describe("violations list source link names the site it opens", () => {
  beforeEach(() => fetchViolations.mockReset());

  const cases: Array<[string, IndexedFacility, string]> = [
    ["nyc", fac({ j: "nyc", hp: 1, vid: "50000001" }), "View on ABC Eats"],
    ["cincinnati", fac({ j: "cincinnati", vt: 2, vid: "CIN-HEFD-000311-26IN1" }), "View on Cincinnati Open Data"],
    ["florida", fac({ hp: 1, vid: "13642234", lid: "2155271" }), "View on DBPR"],
  ];

  for (const [name, f, label] of cases) {
    it(`${name}: when the fetch fails`, async () => {
      fetchViolations.mockRejectedValueOnce(new Error("HTTP 503"));
      const list = await expandViolations(renderOpen(f));
      expect(list.textContent).toContain("Could not load violations");
      const link = list.querySelector("a.platecheck-source-link")!;
      expect(link.textContent).toBe(label);
      expect(link.getAttribute("href")).toBe(buildSourceUrl(f));
      if (name !== "florida") expect(list.innerHTML).not.toContain("DBPR");
    });

    it(`${name}: when no details come back`, async () => {
      fetchViolations.mockResolvedValueOnce([]);
      const list = await expandViolations(renderOpen(f));
      expect(list.textContent).toContain("No violation details found");
      expect(list.querySelector("a.platecheck-source-link")!.textContent).toBe(label);
      if (name !== "florida") expect(list.innerHTML).not.toContain("DBPR");
      expect(list.innerHTML).not.toContain("NYC Open Data");
    });
  }
});

describe("NYC posted grade in the collapsed header", () => {
  it("names NYC on the badge's face and credits DOHMH in its title", () => {
    const sr = renderOpen(fac({ j: "nyc", g: "A", hp: 1, vid: "50000001" }));
    const badge = sr.querySelector(".platecheck-header .platecheck-grade")!;
    expect(badge.textContent).toBe("NYC grade A");
    expect(badge.getAttribute("title")).toBe("Letter grade posted by NYC DOHMH");
    // Never a bare grade that reads as PlateCheck's own.
    expect(headerText(sr)).not.toContain("Grade A");
  });

  it("labels a pending grade as NYC's too", () => {
    for (const g of ["P", "Z"]) {
      const badge = renderOpen(fac({ j: "nyc", g, hp: 1 })).querySelector(".platecheck-grade")!;
      expect(badge.textContent).toBe("NYC grade pending");
      expect(badge.getAttribute("title")).toContain("NYC DOHMH");
    }
  });

  it("shows no grade badge outside NYC", () => {
    expect(renderOpen(fac({ hp: 1 })).querySelector(".platecheck-grade")).toBeNull();
  });
});

describe("a derived zero never contradicts the authority's own result", () => {
  // Dispositions exactly as they appear in the bundled indexes, each seen
  // there with a derived violation count of 0.
  const contradicted: Array<[string, IndexedFacility]> = [
    ["nyc cited", fac({ j: "nyc", g: "A", di: "Violations were cited in the following area(s).", vid: "50000001" })],
    ["nyc closed", fac({ j: "nyc", di: "Establishment Closed by DOHMH. Violations were cited in the following area(s) and those requiring immediate action were addressed.", vid: "50000002" })],
    ["cincinnati minor", fac({ j: "cincinnati", vt: 0, di: "Approved - Minor Violations" })],
    ["cincinnati not in compliance", fac({ j: "cincinnati", vt: 0, di: "Not In Compliance" })],
  ];

  for (const [name, f] of contradicted) {
    it(`${name}: shows no count at all`, () => {
      const sr = renderOpen(f);
      expect(sr.querySelector(".platecheck-header .platecheck-viol-badge")).toBeNull();
      const text = sr.querySelector(".platecheck-card")!.textContent!.replace(/\s+/g, " ");
      expect(text).not.toContain("0 violations");
      expect(text).not.toContain("No violations recorded");
      expect(text).not.toContain("0 cited");
      expect(text).toContain("no violation count is available");
    });
  }

  it("still shows 0 violations where the result agrees", () => {
    for (const f of [
      fac(),
      fac({ j: "nyc", di: "No violations were recorded at the time of this inspection." }),
      fac({ j: "cincinnati", vt: 0, di: "Approved - No Violations" }),
      // Recorded with no violation rows far more often than with them.
      fac({ j: "cincinnati", vt: 0, di: "Approved - Violations Abated" }),
    ]) {
      expect(headerText(renderOpen(f))).toContain("0 violations");
    }
  });
});

describe("FDACS card (not bundled; latent)", () => {
  it("shows no violation badge and no ASCII double dash", () => {
    const sr = renderOpen(fac({ j: "fdacs", di: "Met Sanitation Inspection Requirements" }));
    expect(sr.querySelector(".platecheck-viol-badge")).toBeNull();
    const text = sr.querySelector(".platecheck-card")!.textContent!;
    expect(text).not.toContain("0 violations");
    expect(text).not.toContain("--");
  });
});

describe("header badges use the authority's tier names", () => {
  it("spells out DBPR's tiers", () => {
    const h = headerText(renderOpen(fac({ hp: 3, im: 2, ba: 1, vid: "1", lid: "1" })));
    expect(h).toContain("3 high priority");
    expect(h).toContain("2 intermediate");
    expect(h).toContain("1 basic");
    expect(h).not.toContain("intermed.");
  });

  it("uses NYC's tiers for NYC", () => {
    const h = headerText(renderOpen(fac({ j: "nyc", hp: 2, ba: 1 })));
    expect(h).toContain("2 critical");
    expect(h).toContain("1 not critical");
    expect(h).not.toContain("high priority");
  });
});
