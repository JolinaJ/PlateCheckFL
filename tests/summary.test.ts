import { describe, it, expect } from "vitest";
import {
  generateSummary,
  formatDisposition,
  dispositionImpliesViolations,
} from "../src/summary/generator";
import type { IndexedFacility } from "../src/types/extension";

describe("generateSummary", () => {
  it("describes a clean inspection", () => {
    const fac: IndexedFacility = {
      n: "TEST", a: "100 MAIN", c: "MIAMI", z: "33101", ln: "SEA001",
      co: "Dade", p: "", d: "01/15/2026", t: "Routine - Food",
      di: "Inspection Completed - No Further Action",
      hp: 0, im: 0, ba: 0, ic: 1,
      lid: "1000001", vid: "20000001",
    };
    const s = generateSummary(fac);
    expect(s).toContain("01/15/2026");
    expect(s).toContain("No violations");
  });

  it("summarizes a Columbus facility by its permit status (no bundled date/counts)", () => {
    const fac: IndexedFacility = {
      n: "THURMAN CAFE", a: "183 THURMAN AVE", c: "COLUMBUS", z: "43206",
      ln: "FA0000820", co: "", p: "", d: "", t: "",
      di: "Standards Met",
      hp: 0, im: 0, ba: 0, ic: 0,
      lid: "", vid: "FA0000820", j: "columbus",
    };
    const s = generateSummary(fac);
    expect(s).toContain("Columbus Public Health");
    expect(s).toContain("Standards Met");
    // Must not claim a clean/zero-violation record — counts aren't bundled.
    expect(s).not.toMatch(/no violations|0 (high|critical|basic)/i);
  });

  it("lists violation counts", () => {
    const fac: IndexedFacility = {
      n: "TEST", a: "100 MAIN", c: "MIAMI", z: "33101", ln: "SEA001",
      co: "Dade", p: "", d: "03/10/2026", t: "Routine - Food",
      di: "Call Back - Complied",
      hp: 2, im: 1, ba: 3, ic: 2,
      lid: "1000001", vid: "20000001",
    };
    const s = generateSummary(fac);
    expect(s).toContain("6 violation(s)");
    expect(s).toContain("2 high priority");
    expect(s).toContain("1 intermediate");
    expect(s).toContain("3 basic");
    expect(s).toContain("2 inspection(s)");
  });

  it("describes an NYC inspection with its official vocabulary and posted grade", () => {
    const fac: IndexedFacility = {
      n: "TEST NYC", a: "100 BROADWAY", c: "MANHATTAN", z: "10036", ln: "50000001",
      co: "MANHATTAN", p: "", d: "03/06/2026", t: "Cycle Inspection / Initial Inspection",
      di: "Violations were cited in the following area(s).",
      hp: 2, im: 0, ba: 3, ic: 4,
      lid: "", vid: "50000001", j: "nyc", g: "A",
    };
    const s = generateSummary(fac);
    expect(s).toContain("Posted NYC grade: A");
    expect(s).toContain("5 violation(s)");
    expect(s).toContain("2 critical");
    expect(s).toContain("3 not critical");
    expect(s).not.toContain("high priority");
    expect(s).not.toContain("fiscal year");
  });

  it("never uses prohibited words", () => {
    const fac: IndexedFacility = {
      n: "TEST", a: "100 MAIN", c: "MIAMI", z: "33101", ln: "SEA001",
      co: "Dade", p: "", d: "01/01/2026", t: "Routine",
      di: "Emergency Order/Closure",
      hp: 5, im: 3, ba: 2, ic: 1,
      lid: "1000001", vid: "20000001",
    };
    const s = generateSummary(fac).toLowerCase();
    for (const word of ["safe", "unsafe", "clean", "dirty", "good", "bad"]) {
      expect(s).not.toContain(word);
    }
  });
});

describe("formatDisposition", () => {
  it("shortens known dispositions", () => {
    expect(formatDisposition("Inspection Completed - No Further Action")).toBe("No further action");
    expect(formatDisposition("Call Back - Complied")).toBe("Follow-up: complied");
  });

  it("passes unknown dispositions through", () => {
    expect(formatDisposition("Some New Type")).toBe("Some New Type");
  });
});

describe("generateSummary — Cincinnati", () => {
  function cinFac(overrides: Partial<IndexedFacility> = {}): IndexedFacility {
    return {
      n: "TEST CINCY", a: "6243 GLENWAY AV", c: "CINCINNATI", z: "45211",
      ln: "CIN-HEFD-000311", co: "HAMILTON", p: "", d: "08/07/2026",
      t: "CRITICAL CONTROL POINT", di: "Not In Compliance",
      hp: 0, im: 0, ba: 0, ic: 1,
      lid: "", vid: "CIN-HEFD-000311-26IN1", j: "cincinnati", vt: 0,
      ...overrides,
    };
  }

  it("counts violations from vt and reports no severity tier", () => {
    const s = generateSummary(cinFac({ vt: 22 }));
    expect(s).toContain("Most recent inspection on 08/07/2026");
    expect(s).toContain("22 violation(s) recorded");
    expect(s).toContain("does not rank violations by severity");
    // The tiered vocabulary of other jurisdictions must not appear.
    expect(s).not.toContain("high priority");
    expect(s).not.toContain("critical");
  });

  it("reports a clean inspection without inventing a tier", () => {
    const s = generateSummary(cinFac({ vt: 0, di: "Approved - No Violations" }));
    expect(s).toContain("No violations recorded at this inspection.");
  });

  it("describes repeat inspections as on record, not a fiscal year", () => {
    const s = generateSummary(cinFac({ ic: 6 }));
    expect(s).toContain("6 inspection(s) on record.");
    expect(s).not.toContain("fiscal year");
  });

  it("never uses prohibited words", () => {
    const s = generateSummary(cinFac({ vt: 22, di: "Not In Compliance" })).toLowerCase();
    for (const word of ["safe", "unsafe", "clean", "dirty", "good", "bad"]) {
      expect(s).not.toContain(word);
    }
  });
});

describe("generateSummary — inspections on record", () => {
  it("never scopes the Florida count to a fiscal year; ic spans the archive", () => {
    const s = generateSummary({
      n: "TEST", a: "100 MAIN", c: "MIAMI", z: "33101", ln: "SEA001",
      co: "Dade", p: "", d: "03/10/2026", t: "Routine - Food",
      di: "Call Back - Complied",
      hp: 1, im: 0, ba: 0, ic: 7,
      lid: "1000001", vid: "20000001",
    });
    expect(s).toContain("7 inspection(s) on record.");
    expect(s).not.toContain("fiscal year");
  });
});

describe("generateSummary — a derived zero the result contradicts", () => {
  function f(overrides: Partial<IndexedFacility>): IndexedFacility {
    return {
      n: "TEST", a: "100 MAIN", c: "NEW YORK", z: "10012", ln: "50000001",
      co: "MANHATTAN", p: "", d: "08/09/2025", t: "Smoke-Free Air Act / Initial Inspection",
      di: "", hp: 0, im: 0, ba: 0, ic: 1, lid: "", vid: "50000001",
      ...overrides,
    };
  }

  // Dispositions exactly as they appear in the bundled indexes, each seen
  // there with a derived violation count of 0.
  const contradicted: IndexedFacility[] = [
    f({ j: "nyc", g: "A", di: "Violations were cited in the following area(s)." }),
    f({ j: "nyc", di: "Establishment Closed by DOHMH. Violations were cited in the following area(s) and those requiring immediate action were addressed." }),
    f({ j: "cincinnati", vt: 0, di: "Approved - Minor Violations" }),
    f({ j: "cincinnati", vt: 0, di: "Not In Compliance" }),
  ];

  it("states no count instead of a zero", () => {
    for (const fac of contradicted) {
      expect(dispositionImpliesViolations(fac)).toBe(true);
      const s = generateSummary(fac);
      expect(s).not.toContain("No violations recorded");
      expect(s).not.toMatch(/\b0 violation/);
      expect(s).toContain("no violation count is available for this inspection");
      for (const word of ["safe", "unsafe", "clean", "dirty", "good", "bad"]) {
        expect(s.toLowerCase()).not.toContain(word);
      }
    }
  });

  it("keeps the zero where the result agrees with it", () => {
    for (const fac of [
      f({ j: "nyc", di: "No violations were recorded at the time of this inspection." }),
      f({ j: "cincinnati", vt: 0, di: "Approved - No Violations" }),
      // Recorded with no violation rows far more often than with them.
      f({ j: "cincinnati", vt: 0, di: "Approved - Violations Abated" }),
      // Florida publishes its counts, so a zero there is the record's own.
      f({ j: undefined, di: "Inspection Completed - No Further Action" }),
    ]) {
      expect(dispositionImpliesViolations(fac)).toBe(false);
      expect(generateSummary(fac)).toContain("No violations recorded at this inspection.");
    }
  });

  it("reports a real count normally even when the result says violations were cited", () => {
    const s = generateSummary(f({ j: "nyc", di: "Violations were cited in the following area(s).", hp: 1, ba: 2 }));
    expect(s).toContain("3 violation(s) recorded: 1 critical, 2 not critical.");
    expect(s).not.toContain("no violation count");
  });
});
