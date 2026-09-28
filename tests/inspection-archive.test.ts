import { describe, it, expect } from "vitest";
import { mergeInspections } from "../src/ingest/inspection-archive";
import type { DbprInspectionRow } from "../src/types/dbpr";

function insp(overrides: Partial<DbprInspectionRow> = {}): DbprInspectionRow {
  return {
    district: "1", countyNumber: "11", countyName: "Alachua",
    licenseTypeCode: "2010", licenseNumber: "2100123",
    businessName: "TEST CAFE", locationAddress: "100 MAIN ST",
    locationCity: "GAINESVILLE", locationZip: "32601",
    inspectionNumber: "1", visitNumber: "1", inspectionClass: "Food",
    inspectionType: "Routine - Food",
    inspectionDisposition: "Inspection Completed - No Further Action",
    inspectionDate: "01/15/2026",
    highPriorityViolations: 0, intermediateViolations: 0,
    basicViolations: 0, totalViolations: 0, pdaStatus: "",
    licenseId: "9000", inspectionVisitId: "1000",
    ...overrides,
  } as DbprInspectionRow;
}

describe("mergeInspections", () => {
  // The whole reason this module exists: DBPR's extract is the current fiscal
  // year to date and resets every July 1, so a fresh download is a DELTA. If
  // ingest used it directly, the August file would replace a full year with
  // six weeks and silently delete most of the dataset.
  it("keeps rows the new extract no longer contains", () => {
    const lastYear = [insp({ inspectionVisitId: "1", inspectionDate: "03/02/2026" })];
    const afterReset = [insp({ inspectionVisitId: "2", inspectionDate: "07/09/2026" })];

    const r = mergeInspections(lastYear, afterReset);

    expect(r.merged).toHaveLength(2);
    expect(r.added).toBe(1);
    expect(r.merged.map((i) => i.inspectionVisitId).sort()).toEqual(["1", "2"]);
  });

  it("is idempotent — re-ingesting the same extract changes nothing", () => {
    const rows = [insp({ inspectionVisitId: "1" }), insp({ inspectionVisitId: "2" })];
    const once = mergeInspections([], rows);
    const twice = mergeInspections(once.merged, rows);

    expect(twice.added).toBe(0);
    expect(twice.revised).toBe(0);
    expect(JSON.stringify(twice.merged)).toBe(JSON.stringify(once.merged));
  });

  // DBPR does amend records in place, and the freshly downloaded copy is the
  // authority's current statement about that visit.
  it("lets a re-issued row overwrite the archived one", () => {
    const before = [insp({ inspectionVisitId: "1", highPriorityViolations: 0 })];
    const corrected = [insp({ inspectionVisitId: "1", highPriorityViolations: 3 })];

    const r = mergeInspections(before, corrected);

    expect(r.merged).toHaveLength(1);
    expect(r.merged[0].highPriorityViolations).toBe(3);
    expect(r.revised).toBe(1);
    expect(r.added).toBe(0);
  });

  it("does not count an unchanged re-download as a revision", () => {
    const rows = [insp({ inspectionVisitId: "1" })];
    expect(mergeInspections(rows, rows).revised).toBe(0);
  });

  it("orders output deterministically so an unchanged ingest yields no diff", () => {
    const a = mergeInspections([], [insp({ inspectionVisitId: "10" }), insp({ inspectionVisitId: "2" })]);
    const b = mergeInspections([], [insp({ inspectionVisitId: "2" }), insp({ inspectionVisitId: "10" })]);
    expect(JSON.stringify(a.merged)).toBe(JSON.stringify(b.merged));
  });

  it("falls back to a composite key when a visit id is missing", () => {
    const row = insp({ inspectionVisitId: "", licenseNumber: "5", inspectionDate: "02/02/2026" });
    const r = mergeInspections([row], [row]);
    expect(r.merged).toHaveLength(1);
    expect(r.added).toBe(0);
  });
});
