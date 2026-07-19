import { describe, it, expect } from "vitest";
import { generateSummary, formatDisposition } from "../src/summary/generator";
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
