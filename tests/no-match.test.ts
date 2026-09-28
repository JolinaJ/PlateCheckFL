// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  matchFacility,
  buildMatchIndex,
  coverageLabel,
  authoritiesForQuery,
  noMatchCandidates,
  MIN_ZIP3_RECORDS,
} from "../src/matching/dbpr-matcher";
import {
  createNoMatchNote,
  noMatchCopy,
  selfSearchLabel,
  NO_MATCH_DISCLAIMER,
} from "../src/ui/no-match-note";
import { AUTHORITY_SEARCH } from "../src/ui/authority-search";
import { injectNoMatchNote } from "../src/content/injector";
import type {
  AuthorityScope,
  ExtensionMatchResult,
  IndexedFacility,
  Jurisdiction,
  NoMatchReason,
  ParsedQuery,
} from "../src/types/extension";

// Every reason the matcher can produce. Shared by the copy tests and the
// render tests, which both have to hold for all of them.
const REASONS: NoMatchReason[] = [
  "out-of-area",
  "address-different-name",
  "unit-mismatch",
  "low-confidence",
  "no-address",
  "no-record",
];

function fac(overrides: Partial<IndexedFacility> = {}): IndexedFacility {
  return {
    n: "TEST RESTAURANT", a: "100 MAIN ST", c: "MIAMI", z: "33101",
    ln: "SEA001", co: "Dade", p: "(305)555-0001",
    d: "01/15/2026", t: "Routine - Food",
    di: "Inspection Completed - No Further Action",
    hp: 0, im: 0, ba: 0, ic: 1,
    lid: "", vid: "",
    ...overrides,
  };
}

const FACILITIES: IndexedFacility[] = [
  fac({ ln: "A1", n: "VERSAILLES REST", a: "3555 SW 8 ST", c: "MIAMI", z: "33135" }),
  fac({ ln: "A2", n: "FRESH KITCHEN", a: "4616 W KENNEDY BLVD", c: "TAMPA", z: "33609" }),
  fac({ ln: "A3", n: "OCEAN BREEZE SUSHI", a: "50 PIER AVE STE 200", c: "TAMPA", z: "33602" }),
  fac({ ln: "A4", n: "JOES TACOS", a: "200 OCEAN DR", c: "MIAMI BEACH", z: "33139" }),
];

// An area only counts as covered once one jurisdiction holds
// MIN_ZIP3_RECORDS records in its ZIP3, so a stray mis-keyed ZIP in the
// source data can't make an out-of-state listing look covered. The fixtures
// above are four records, so each area they use is padded with that many
// fictional filler records. Fillers share no name token, house number or
// street with any query in this file, so they can't change a match.
function padArea(zip: string, j?: IndexedFacility["j"], count = MIN_ZIP3_RECORDS): IndexedFacility[] {
  return Array.from({ length: count }, (_, i) =>
    fac({
      ln: `PAD-${j ?? "florida"}-${zip}-${i}`,
      n: "ZZFILLER QQPAD",
      a: `${90000 + i} FILLER RD`,
      c: "FILLERTON",
      z: zip,
      ...(j ? { j } : {}),
    })
  );
}

// The fixtures plus enough filler to make Miami (331) and Tampa (336)
// covered areas.
const INDEXED: IndexedFacility[] = [...FACILITIES, ...padArea("33100"), ...padArea("33600")];

describe("matchFacility — no-match reasons", () => {
  const index = buildMatchIndex(INDEXED);

  it("reports no reason when a card will actually be shown", () => {
    const r = matchFacility(
      { name: "Versailles Restaurant", street: "3555 SW 8th St", city: "Miami", zip: "33135" },
      index
    );
    expect(r.confidence).toBe("confirmed");
    expect(r.noMatchReason).toBeNull();
    expect(r.addressOccupant).toBeNull();
  });

  it("flags a ZIP outside every bundled jurisdiction as out-of-area", () => {
    const r = matchFacility(
      { name: "Lou Malnati's Pizzeria", street: "805 S State St", city: "Chicago", zip: "60605" },
      index
    );
    expect(r.noMatchReason).toBe("out-of-area");
  });

  it("does not call a covered area out-of-area just because that ZIP holds no facility", () => {
    // 33101 has no record in this fixture, but 331xx (Miami) does. Coverage
    // is a question about the area, not about whether one precise ZIP
    // happens to contain a licensed restaurant — the real case that caught
    // this was 33620, the USF campus, being reported as outside Florida.
    const r = matchFacility(
      { name: "Nonexistent Place", street: "9999 Imaginary Way", city: "Miami", zip: "33101" },
      index
    );
    expect(r.noMatchReason).toBe("no-record");
  });

  it("does not claim out-of-area from a city name alone (ZIPs are unique, cities are not)", () => {
    // No ZIP on the query: coverage cannot be established, so the reason
    // must fall through to a record-based explanation instead of wrongly
    // telling the user their city is uncovered.
    const r = matchFacility(
      { name: "Somewhere Else Grill", street: "1 Nowhere Rd", city: "Springfield" },
      index
    );
    expect(r.noMatchReason).not.toBe("out-of-area");
  });

  it("reports address-different-name when the address is licensed to someone else", () => {
    const r = matchFacility(
      { name: "Gogo's Greek Grill", street: "4616 W Kennedy Blvd", city: "Tampa", zip: "33609" },
      index
    );
    expect(r.noMatchReason).toBe("address-different-name");
    expect(r.addressOccupant?.n).toBe("FRESH KITCHEN");
  });

  it("does not call a different street at the same house number and ZIP 'this address'", () => {
    // 1 MAIN ST and 1 PERRY ST share the house|ZIP key 1|10014. Only the
    // block agrees, so there is no record "at this address" to speak of.
    const idx = buildMatchIndex([
      ...INDEXED,
      fac({ ln: "P1", n: "PERRY PLACE CAFE", a: "1 PERRY ST", c: "MANHATTAN", z: "10014", j: "nyc" }),
      ...padArea("10000", "nyc"),
    ]);
    const r = matchFacility({ name: "Zzqx Bistro", street: "1 Main St", zip: "10014" }, idx);
    expect(r.noMatchReason).not.toBe("address-different-name");
    expect(r.addressOccupant).toBeNull();

    // Same key, and this time the street agrees: that one is at the address.
    const same = matchFacility({ name: "Zzqx Bistro", street: "1 Perry Street", zip: "10014" }, idx);
    expect(same.noMatchReason).toBe("address-different-name");
    expect(same.addressOccupant?.n).toBe("PERRY PLACE CAFE");
  });

  it("reports no-address when the listing carried no street", () => {
    const r = matchFacility({ name: "Some Unlisted Diner" }, index);
    expect(r.noMatchReason).toBe("no-address");
  });

  it("reports no-record when nothing resembles the name or the address", () => {
    const r = matchFacility(
      { name: "Nonexistent Place", street: "9999 Imaginary Way", city: "Miami", zip: "33135" },
      index
    );
    expect(r.noMatchReason).toBe("no-record");
    expect(r.addressOccupant).toBeNull();
  });

  it("prefers unit-mismatch over a generic low-confidence reason", () => {
    const r = matchFacility(
      { name: "Ocean Breeze Sushi", street: "50 Pier Ave Ste 900", city: "Tampa", zip: "33602" },
      index
    );
    expect(r.confidence).toBe("possible");
    expect(r.noMatchReason).toBe("unit-mismatch");
  });

  it("builds the address index lazily — untouched until a query misses", () => {
    const fresh = buildMatchIndex(INDEXED);
    expect(fresh.byHouseZip).toBeNull();
    expect(fresh.zipPrefixes).toBeNull();
    expect(fresh.byStreet).toBeNull();
    expect(fresh.jurisdictions).toBeNull();

    matchFacility(
      { name: "Versailles Rest", street: "3555 SW 8 ST", city: "Miami", zip: "33135" },
      fresh
    );
    expect(fresh.byHouseZip).toBeNull();

    matchFacility({ name: "Nothing Here", street: "1 Nowhere Rd", zip: "33101" }, fresh);
    expect(fresh.byHouseZip).not.toBeNull();
    expect(fresh.jurisdictions).toEqual(["florida"]);
  });
});

describe("out-of-area needs a real body of records, not a stray ZIP", () => {
  // The source data carries mis-keyed ZIPs: DOHMH rows with New Jersey
  // ZIPs (070, 073, 076), DBPR rows with Illinois ones (604, 610). A few of
  // those must not make Jersey City or Skokie look covered.
  const MISS: ParsedQuery = { name: "Nowhere Diner", street: "1 Exchange Pl", city: "Jersey City", zip: "07302" };

  it("calls a ZIP3 holding only a few stray records out-of-area", () => {
    // Four is what the real DOHMH index holds for Jersey City (073); the
    // largest stray count in any bundled index is six.
    for (const count of [1, 4, 6, MIN_ZIP3_RECORDS - 1]) {
      const strays = padArea("07302", "nyc", count);
      const index = buildMatchIndex([...INDEXED, ...padArea("10001", "nyc"), ...strays]);
      expect(matchFacility(MISS, index).noMatchReason, `${count} strays`).toBe("out-of-area");
      expect(authoritiesForQuery(MISS, index), `${count} strays`).toEqual({ authorities: [], fromZip: true });
    }
  });

  it("covers a ZIP3 once one jurisdiction holds the floor there", () => {
    const area = padArea("07302", "nyc", MIN_ZIP3_RECORDS);
    const index = buildMatchIndex([...INDEXED, ...area]);
    expect(matchFacility(MISS, index).noMatchReason).not.toBe("out-of-area");
    expect(authoritiesForQuery(MISS, index)).toEqual({ authorities: ["nyc"], fromZip: true });
  });

  it("does not add two jurisdictions' strays together to reach the floor", () => {
    const half = Math.ceil(MIN_ZIP3_RECORDS / 2);
    const index = buildMatchIndex([
      ...INDEXED,
      ...padArea("07302", "nyc", half),
      ...padArea("07303", undefined, half),
    ]);
    expect(matchFacility(MISS, index).noMatchReason).toBe("out-of-area");
    expect(authoritiesForQuery(MISS, index).authorities).toEqual([]);
  });
});

describe("authoritiesForQuery", () => {
  // One covered area per bundled jurisdiction, plus a named Florida record
  // for the "never from a rejected candidate" checks.
  const MIXED = buildMatchIndex([
    fac({ ln: "V1", n: "VERSAILLES REST", a: "3555 SW 8 ST", c: "MIAMI", z: "33135" }),
    ...padArea("33100"),
    ...padArea("10001", "nyc"),
    ...padArea("43215", "columbus"),
    ...padArea("45202", "cincinnati"),
  ]);
  const q = (zip?: string, name = "Nowhere Diner"): ParsedQuery => ({ name, street: "1 Main St", zip });

  it("names the one authority whose records cover the listing's ZIP", () => {
    expect(authoritiesForQuery(q("33135"), MIXED)).toEqual({ authorities: ["florida"], fromZip: true });
    expect(authoritiesForQuery(q("10013"), MIXED)).toEqual({ authorities: ["nyc"], fromZip: true });
    expect(authoritiesForQuery(q("43201"), MIXED)).toEqual({ authorities: ["columbus"], fromZip: true });
    expect(authoritiesForQuery(q("45219"), MIXED)).toEqual({ authorities: ["cincinnati"], fromZip: true });
  });

  it("names none for a ZIP outside every bundled area", () => {
    expect(authoritiesForQuery(q("60605"), MIXED)).toEqual({ authorities: [], fromZip: true });
  });

  it("offers every bundled authority when the listing has no ZIP", () => {
    const all = { authorities: ["cincinnati", "columbus", "florida", "nyc"], fromZip: false };
    expect(authoritiesForQuery(q(undefined), MIXED)).toEqual(all);
    // A partial ZIP places nothing, same as classifyNoMatch.
    expect(authoritiesForQuery(q("331"), MIXED)).toEqual(all);
  });

  it("never infers the area from a rejected name candidate", () => {
    // "Versailles Cafe" resembles the Miami record. With a Manhattan ZIP the
    // note still names NYC only; with no ZIP it names everything bundled,
    // not Florida.
    const nyc = q("10001", "Versailles Cafe");
    const noZip = q(undefined, "Versailles Cafe");
    expect(matchFacility(noZip, MIXED).candidates.map((c) => c.facility.ln)).toContain("V1");
    expect(authoritiesForQuery(nyc, MIXED).authorities).toEqual(["nyc"]);
    expect(authoritiesForQuery(noZip, MIXED).authorities).toEqual(["cincinnati", "columbus", "florida", "nyc"]);
  });

  it("agrees with out-of-area exactly: empty from a ZIP means out-of-area", () => {
    for (const zip of ["33135", "33620", "10001", "43215", "45202", "60605", "07302", "11701", "331", undefined]) {
      const query = q(zip);
      const scope = authoritiesForQuery(query, MIXED);
      const outOfArea = matchFacility(query, MIXED).noMatchReason === "out-of-area";
      expect(scope.fromZip && scope.authorities.length === 0, `zip ${zip}`).toBe(outOfArea);
    }
  });

  it("in a one-region build, offers that region's authority for a listing with no ZIP", () => {
    const cincinnatiOnly = buildMatchIndex(padArea("45202", "cincinnati"));
    expect(authoritiesForQuery(q(undefined), cincinnatiOnly)).toEqual({ authorities: ["cincinnati"], fromZip: false });
    // ...and none for a Florida listing, which that build doesn't cover.
    expect(authoritiesForQuery(q("33135"), cincinnatiOnly)).toEqual({ authorities: [], fromZip: true });
  });
});

describe("noMatchCandidates", () => {
  function result(overrides: Partial<ExtensionMatchResult> = {}): ExtensionMatchResult {
    return {
      confidence: "possible",
      facility: null,
      score: 40,
      suiteMismatch: false,
      streetNameMismatch: false,
      coLocatedCount: 0,
      candidates: [],
      noMatchReason: "low-confidence",
      addressOccupant: null,
      ...overrides,
    };
  }
  const QUERY = { name: "Some Listing", street: "1 Main St", city: "Miami", zip: "33101" };
  const cand = (f: IndexedFacility, confidence: "possible" | "unmatched" = "possible") => ({
    facility: f,
    score: confidence === "possible" ? 40 : 20,
    confidence,
    suiteMismatch: false,
  });

  it("returns nothing when there is nothing to offer", () => {
    expect(noMatchCandidates(result(), QUERY)).toEqual([]);
  });

  it("puts the address occupant first — address evidence beats name similarity", () => {
    const occupant = fac({ ln: "OCC", n: "FRESH KITCHEN" });
    const out = noMatchCandidates(
      result({ addressOccupant: occupant, candidates: [cand(fac({ ln: "X1", n: "GOGOS GRILL" }))] }),
      QUERY
    );
    expect(out.map((f) => f.ln)).toEqual(["OCC", "X1"]);
  });

  it("drops candidates that never reached possible", () => {
    // A score built from one stray shared token is not a lead worth
    // showing; offering it would manufacture confidence we do not have.
    const out = noMatchCandidates(
      result({
        candidates: [
          cand(fac({ ln: "GOOD", n: "SIAM ORCHID" })),
          cand(fac({ ln: "WEAK", n: "CARMINE PIE HOUSE" }), "unmatched"),
        ],
      }),
      QUERY
    );
    expect(out.map((f) => f.ln)).toEqual(["GOOD"]);
  });

  it("never returns more than three", () => {
    const out = noMatchCandidates(
      result({
        addressOccupant: fac({ ln: "OCC" }),
        candidates: [
          cand(fac({ ln: "C1" })),
          cand(fac({ ln: "C2" })),
          cand(fac({ ln: "C3" })),
        ],
      }),
      QUERY
    );
    expect(out).toHaveLength(3);
    expect(out.map((f) => f.ln)).toEqual(["OCC", "C1", "C2"]);
  });

  it("ranks a local record ahead of a same-brand one elsewhere in the state", () => {
    // Locality orders the list; it does not filter it. Every row renders
    // its city, so a reader can see that Pembroke Pines is not Miami —
    // hiding the row would decide that for them on evidence we just told
    // them we do not have.
    const out = noMatchCandidates(
      result({
        candidates: [
          cand(fac({ ln: "FAR", n: "SMOOTHIE SPOT", a: "10261 PINES BLVD", c: "PEMBROKE PINES", z: "33026" })),
          cand(fac({ ln: "NEAR", n: "SMOOTHIE BAR", a: "50 MAIN ST", c: "MIAMI", z: "33101" })),
        ],
      }),
      QUERY
    );
    expect(out.map((f) => f.ln)).toEqual(["NEAR", "FAR"]);
  });

  it("shows only the occupant once there is a definite address hit", () => {
    // A licence found at this very address is the answer; padding to three
    // with same-name records from other cities dilutes it.
    const out = noMatchCandidates(
      result({
        addressOccupant: fac({ ln: "OCC", n: "STILES HOTEL", c: "MIAMI", z: "33101" }),
        candidates: [
          cand(fac({ ln: "FAR", n: "LA TRATTORIA", c: "NAPLES", z: "34102" })),
        ],
      }),
      QUERY
    );
    expect(out.map((f) => f.ln)).toEqual(["OCC"]);
  });

  it("keeps a local candidate alongside the occupant", () => {
    const out = noMatchCandidates(
      result({
        addressOccupant: fac({ ln: "OCC", c: "MIAMI", z: "33101" }),
        candidates: [
          cand(fac({ ln: "FAR", c: "NAPLES", z: "34102" })),
          cand(fac({ ln: "NEAR", c: "MIAMI", z: "33101" })),
        ],
      }),
      QUERY
    );
    expect(out.map((f) => f.ln)).toEqual(["OCC", "NEAR"]);
  });

  it("accepts a nearby record on ZIP3 when the city text differs", () => {
    const out = noMatchCandidates(
      result({
        candidates: [cand(fac({ ln: "Z3", n: "SMOOTHIE BAR", c: "MIAMI SHORES", z: "33150" }))],
      }),
      { name: "Smoothie", street: "1 Main St", zip: "33101" }
    );
    expect(out.map((f) => f.ln)).toEqual(["Z3"]);
  });

  it("still offers candidates when the listing has no city or ZIP", () => {
    // The common Google Search local-pack row: a bare street line and
    // nothing else (see tests/fixtures/local-pack-real-unclassed.html).
    // Requiring locality here silently emptied the list on exactly the
    // surface this feature exists for.
    const out = noMatchCandidates(
      result({ candidates: [cand(fac({ ln: "C1", n: "SMOOTHIE BAR" }))] }),
      { name: "Smoothie", street: "1 Main St" }
    );
    expect(out.map((f) => f.ln)).toEqual(["C1"]);
  });

  it("still offers the address occupant without city or ZIP on the query", () => {
    // The occupant was found by house number + ZIP, so it is already
    // geographically correct and needs no further gate.
    const out = noMatchCandidates(
      result({ addressOccupant: fac({ ln: "OCC" }) }),
      { name: "Whatever", street: "1 Main St" }
    );
    expect(out.map((f) => f.ln)).toEqual(["OCC"]);
  });

  it("does not list the same licence twice when it is also the occupant", () => {
    const shared = fac({ ln: "SAME", n: "FRESH KITCHEN" });
    const out = noMatchCandidates(
      result({ addressOccupant: shared, candidates: [cand(shared)] }),
      QUERY
    );
    expect(out).toHaveLength(1);
  });

  it("keeps same-brand locations distinct by address (two Gainesville Checkers)", () => {
    // Both licences are real DBPR records with different inspection
    // histories. The list must surface both so the address disambiguates
    // them, rather than silently collapsing to one.
    const a = fac({ ln: "SEA1102429", n: "CHECKERS DRIVE IN REST # 3215", a: "3325 W UNIVERSITY AVE", c: "GAINESVILLE", z: "32607" });
    const b = fac({ ln: "SEA1102374", n: "CHECKERS #6320", a: "912 W UNIVERSITY AVE", c: "GAINESVILLE", z: "32601" });
    const out = noMatchCandidates(result({ candidates: [cand(a), cand(b)] }), {
      name: "Checkers", street: "912 W University Ave", city: "Gainesville", zip: "32601",
    });
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.a)).toEqual(["3325 W UNIVERSITY AVE", "912 W UNIVERSITY AVE"]);
  });
});

describe("coverageLabel", () => {
  it("names only the jurisdictions the build actually bundles", () => {
    expect(coverageLabel(buildMatchIndex(FACILITIES))).toBe("Florida");
    expect(
      coverageLabel(buildMatchIndex([fac(), fac({ j: "nyc", ln: "N1" })]))
    ).toBe("Florida and New York City");
    expect(
      coverageLabel(
        buildMatchIndex([
          fac(),
          fac({ j: "nyc", ln: "N1" }),
          fac({ j: "cincinnati", ln: "C1" }),
        ])
      )
    ).toBe("Cincinnati, OH, Florida and New York City");
  });
});

describe("noMatchCopy", () => {
  it("explains an address-different-name without asserting the two are the same", () => {
    const { detail } = noMatchCopy("address-different-name", "Florida");
    expect(detail).toContain("under a different name");
    expect(detail).toContain("we cannot tell which");
    // The occupant is named in the candidate list, not the prose.
    expect(detail).not.toContain("FRESH KITCHEN");
  });

  it("names only the bundled regions in the out-of-area copy", () => {
    const { detail } = noMatchCopy("out-of-area", "Cincinnati, OH");
    expect(detail).toContain("Cincinnati, OH");
    expect(detail).not.toContain("Florida");
  });
});

describe("no-match copy — neutrality", () => {
  // The note is the one place PlateCheck speaks in the absence of a
  // record, which is exactly where a reader is most likely to infer a
  // judgment. Guard the whole vocabulary at once.
  //
  // Asserted against noMatchCopy rather than the rendered node on purpose:
  // the note renders into a *closed* shadow root, so host.textContent is
  // empty and a DOM-based check would pass vacuously.
  const BANNED =
    /\b(safe|unsafe|clean|dirty|good|bad|poor|risky|danger|dangerous|warning|avoid|beware|worst|best|failed|passed)\b/i;

  it("never uses judgment language for any reason", () => {
    for (const reason of REASONS) {
      const { headline, detail } = noMatchCopy(reason, "Florida");
      expect(BANNED.test(headline), `${reason} headline: "${headline}"`).toBe(false);
      expect(BANNED.test(detail), `${reason} detail: "${detail}"`).toBe(false);
    }
  });

  it("keeps the same guard on the shared disclaimer", () => {
    expect(BANNED.test(NO_MATCH_DISCLAIMER)).toBe(false);
    expect(NO_MATCH_DISCLAIMER).toContain("not the establishment");
    expect(NO_MATCH_DISCLAIMER).toContain(
      "No conclusion about this business should be drawn from the absence of a record."
    );
  });

  it("every reason produces non-empty copy", () => {
    for (const reason of REASONS) {
      const { headline, detail } = noMatchCopy(reason, "Florida");
      expect(headline.length).toBeGreaterThan(0);
      expect(detail.length).toBeGreaterThan(0);
    }
  });

  it("keeps the same guard on the self-search label and links, for every authority", () => {
    const all = Object.keys(AUTHORITY_SEARCH) as Jurisdiction[];
    const scopes: AuthorityScope[] = [
      ...all.flatMap((j) => [
        { authorities: [j], fromZip: true },
        { authorities: [j], fromZip: false },
      ]),
      { authorities: all, fromZip: false },
      { authorities: all, fromZip: true },
    ];
    for (const scope of scopes) {
      const label = selfSearchLabel(scope);
      expect(BANNED.test(label), label).toBe(false);
      // It describes where our records come from, not who regulates the
      // business (Florida food service is split across three agencies).
      expect(label.startsWith("The records PlateCheck checks"), label).toBe(true);
      expect(label).not.toMatch(/\bregulates\b|regulated by|licensed by|inspected by|published by/i);
    }
    for (const { name, link } of Object.values(AUTHORITY_SEARCH)) {
      expect(BANNED.test(name), name).toBe(false);
      expect(BANNED.test(link), link).toBe(false);
    }
  });

  it("says 'for this area' only when a ZIP placed the listing", () => {
    expect(selfSearchLabel({ authorities: ["nyc"], fromZip: true })).toBe(
      "The records PlateCheck checks for this area come from the NYC Department of Health and Mental Hygiene (DOHMH). You can search them directly by business name or address."
    );
    expect(selfSearchLabel({ authorities: ["nyc"], fromZip: false })).not.toContain("for this area");
    expect(selfSearchLabel({ authorities: ["florida", "nyc"], fromZip: false })).toBe(
      "The records PlateCheck checks come from these official sources. You can search them directly:"
    );
    expect(selfSearchLabel({ authorities: [], fromZip: true })).toBe("");
  });
});

// The note renders into a closed shadow root, so tests force attachShadow
// open for the duration of the render to reach the markup.
const FLORIDA: AuthorityScope = { authorities: ["florida"], fromZip: true };

function renderOpen(
  reason: NoMatchReason,
  scope: AuthorityScope = FLORIDA,
  coverage = "Florida"
): ShadowRoot {
  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init: ShadowRootInit) {
    return orig.call(this, { ...init, mode: "open" });
  };
  try {
    return createNoMatchNote(reason, coverage, scope).shadowRoot!;
  } finally {
    Element.prototype.attachShadow = orig;
  }
}

function selfSearchLinks(sr: ShadowRoot): HTMLAnchorElement[] {
  return [...sr.querySelectorAll(".platecheck-selfsearch a")] as HTMLAnchorElement[];
}

const ONE_OF_EACH: Array<[Jurisdiction, string]> = [
  ["florida", "www2.myfloridalicense.com"],
  ["nyc", "a816-health.nyc.gov"],
  ["columbus", "pressagent.envisionconnect.com"],
  ["cincinnati", "data.cincinnati-oh.gov"],
];

describe("createNoMatchNote", () => {
  it("isolates itself in a closed shadow root", () => {
    const host = createNoMatchNote("low-confidence", "Florida", FLORIDA);
    expect(host.className).toBe("platecheck-host");
    // Closed: page CSS and page script cannot reach in and restyle it.
    expect(host.shadowRoot).toBeNull();
  });

  const CHECKERS = fac({
    ln: "SEA1102374", n: "CHECKERS #6320", a: "912 W UNIVERSITY AVE",
    c: "GAINESVILLE", z: "32601", d: "05/28/2026",
    di: "Administrative complaint recommended", hp: 3, im: 2, ba: 3,
  });

  // The note once listed near-miss records behind a "Show possible matches"
  // dropdown. It no longer does, and must not regress: naming a licensed
  // establishment beside a listing we could NOT tie to it presents our guess
  // as a finding, about a real business that never asked to appear there.
  it("never names a near-miss record", () => {
    const html = renderOpen("low-confidence").innerHTML;
    expect(html).not.toContain("CHECKERS");
    expect(html).not.toContain("912 W UNIVERSITY AVE");
    expect(html).not.toContain("View the DBPR record");
  });

  it("never names a near-miss record in any reason, run through the real pipeline", () => {
    // CHECKERS is a genuine near miss for these listings. Whatever reason the
    // matcher gives and whichever authorities it picks, the note built from
    // them must not carry the record's name, address or license number.
    const index = buildMatchIndex([...INDEXED, CHECKERS, ...padArea("32600")]);
    const queries: Array<[ParsedQuery, NoMatchReason]> = [
      [{ name: "Checkers", street: "1 Other St", city: "Alachua", zip: "32615" }, "low-confidence"],
      [{ name: "Checkers Express", street: "900 W University Ave", city: "Gainesville", zip: "32601" }, "low-confidence"],
      [{ name: "Gator Grill", street: "912 W University Ave" }, "address-different-name"],
      [{ name: "Checkers" }, "no-address"],
      [{ name: "Checkers", street: "1 Main St", city: "Chicago", zip: "60605" }, "out-of-area"],
    ];
    for (const [query, reason] of queries) {
      const result = matchFacility(query, index);
      expect(result.noMatchReason, JSON.stringify(query)).toBe(reason);
      const html = renderOpen(
        result.noMatchReason!,
        authoritiesForQuery(query, index),
        coverageLabel(index)
      ).innerHTML;
      expect(html).not.toContain("CHECKERS");
      expect(html).not.toContain("912 W UNIVERSITY AVE");
      expect(html).not.toContain("SEA1102374");
    }
    for (const reason of REASONS) {
      const html = renderOpen(reason, { authorities: ["florida", "nyc", "columbus", "cincinnati"], fromZip: false }).innerHTML;
      expect(html).not.toContain("CHECKERS");
      expect(html).not.toContain("912 W UNIVERSITY AVE");
      expect(html).not.toContain("View the DBPR record");
    }
  });

  it("renders no candidate dropdown in any reason", () => {
    for (const reason of REASONS) {
      const sr = renderOpen(reason);
      expect(sr.querySelector(".platecheck-candidates-toggle")).toBeNull();
      expect(sr.querySelector(".platecheck-candidate-panel")).toBeNull();
      expect(sr.querySelector(".platecheck-candidate")).toBeNull();
    }
  });

  it("points the reader at the authority's own search instead", () => {
    const sr = renderOpen("low-confidence");
    const links = selfSearchLinks(sr);
    expect(links).toHaveLength(1);
    expect(links[0].href).toContain("myfloridalicense.com");
    expect(links[0].textContent!.trim()).toBe("Search Florida DBPR records");
    expect(links[0].getAttribute("rel")).toBe("noopener");
    expect(links[0].getAttribute("target")).toBe("_blank");
  });

  it("links the authority for the listing's area, and only that one", () => {
    for (const [j, host] of ONE_OF_EACH) {
      const sr = renderOpen("no-record", { authorities: [j], fromZip: true });
      const links = selfSearchLinks(sr);
      expect(links, j).toHaveLength(1);
      expect(new URL(links[0].href).host).toBe(host);
      // The exact URL survives escaping (#!/Search, ?agency=COL).
      expect(links[0].getAttribute("href")).toBe(AUTHORITY_SEARCH[j].url);
      expect(links[0].textContent!.trim()).toBe(AUTHORITY_SEARCH[j].link);
      expect(links[0].getAttribute("rel")).toBe("noopener");
      expect(sr.querySelector(".platecheck-selfsearch-label")!.textContent).toContain(AUTHORITY_SEARCH[j].name);
    }
  });

  it("never mentions Florida DBPR for a listing in NYC, Columbus or Cincinnati", () => {
    const index = buildMatchIndex([
      ...INDEXED,
      ...padArea("10001", "nyc"),
      ...padArea("43215", "columbus"),
      ...padArea("45202", "cincinnati"),
    ]);
    const listings: ParsedQuery[] = [
      { name: "Versailles Cafe", street: "1 Broadway", city: "New York", zip: "10004" },
      { name: "Joes Tacos", street: "1 High St", city: "Columbus", zip: "43215" },
      { name: "Fresh Kitchen", street: "1 Vine St", city: "Cincinnati", zip: "45202" },
      { name: "Ocean Breeze Sushi", street: "1 Main St", city: "Chicago", zip: "60605" },
    ];
    for (const query of listings) {
      const result = matchFacility(query, index);
      const html = renderOpen(
        result.noMatchReason ?? "no-record",
        authoritiesForQuery(query, index),
        coverageLabel(index)
      ).innerHTML;
      expect(html, query.zip).not.toContain("myfloridalicense");
      expect(html, query.zip).not.toContain("Business and Professional Regulation");
      expect(html, query.zip).not.toContain("DBPR");
    }
  });

  it("offers no self-search at all for an out-of-area listing", () => {
    const sr = renderOpen("out-of-area", { authorities: [], fromZip: true });
    expect(sr.querySelector(".platecheck-selfsearch")).toBeNull();
    // The disclaimer link is the only link left.
    const links = [...sr.querySelectorAll("a")];
    expect(links).toHaveLength(1);
    expect(links[0].classList.contains("platecheck-terms-link")).toBe(true);
  });

  it("links every bundled authority, in a fixed order, when the listing has no ZIP", () => {
    const sr = renderOpen("no-address", {
      authorities: ["nyc", "cincinnati", "florida", "columbus"],
      fromZip: false,
    });
    const hosts = selfSearchLinks(sr).map((a) => new URL(a.href).host);
    expect(hosts).toEqual(ONE_OF_EACH.map(([, host]) => host));
    const label = sr.querySelector(".platecheck-selfsearch-label")!.textContent!;
    expect(label).toBe("The records PlateCheck checks come from these official sources. You can search them directly:");
  });

  it("offers the self-search on every reason when there is a source to offer", () => {
    for (const reason of REASONS) {
      expect(renderOpen(reason).querySelector(".platecheck-selfsearch"), reason).not.toBeNull();
    }
  });

  it("still carries the shared disclaimer", () => {
    expect(renderOpen("no-record").innerHTML).toContain(
      "No conclusion about this business should be drawn"
    );
    expect(renderOpen("out-of-area", { authorities: [], fromZip: true }).innerHTML).toContain(
      "No conclusion about this business should be drawn"
    );
  });
});

describe("injectNoMatchNote", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("inserts the note after the entry and marks it as handled", () => {
    document.body.innerHTML = `<div id="rcnt"><div id="row"></div></div>`;
    const row = document.getElementById("row")!;
    injectNoMatchNote(row, "no-record", "Florida", FLORIDA, false, "after");

    const note = document.querySelector(".platecheck-host")!;
    expect(row.nextElementSibling).toBe(note);
    expect(row.hasAttribute("data-platecheck-injected")).toBe(true);
  });

  it("never injects twice into the same entry", () => {
    document.body.innerHTML = `<div id="rcnt"><div id="row"></div></div>`;
    const row = document.getElementById("row")!;
    injectNoMatchNote(row, "no-record", "Florida", FLORIDA, false, "after");
    injectNoMatchNote(row, "low-confidence", "Florida", FLORIDA, false, "after");

    expect(document.querySelectorAll(".platecheck-host").length).toBe(1);
  });

  it("spans the content columns when placed before #center_col", () => {
    document.body.innerHTML = `<div id="rcnt"><div id="center_col"></div></div>`;
    const center = document.getElementById("center_col")!;
    injectNoMatchNote(center, "no-record", "Florida", FLORIDA, true, "before");

    const note = document.querySelector(".platecheck-host") as HTMLElement;
    expect(center.previousElementSibling).toBe(note);
    expect(note.style.gridColumn).toBe("2 / -2");
  });

  it("passes the authority scope through to the note", () => {
    document.body.innerHTML = `<div id="rcnt"><div id="center_col"></div><div id="rhs"></div></div>`;
    const rhs = document.getElementById("rhs")!;
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init: ShadowRootInit) {
      return orig.call(this, { ...init, mode: "open" });
    };
    try {
      injectNoMatchNote(rhs, "no-record", "New York City", { authorities: ["nyc"], fromZip: true }, true, "prepend");
    } finally {
      Element.prototype.attachShadow = orig;
    }

    const note = rhs.firstElementChild as HTMLElement;
    expect(note.className).toBe("platecheck-host");
    const sr = note.shadowRoot!;
    expect(sr.querySelector(".platecheck-card")!.getAttribute("data-variant")).toBe("prominent");
    const hosts = selfSearchLinks(sr).map((a) => new URL(a.href).host);
    expect(hosts).toEqual(["a816-health.nyc.gov"]);
  });
});
