import { describe, it, expect } from "vitest";
import { buildNycIndex, type NycInspectionRow } from "../src/ingest/nyc";

function row(overrides: Partial<NycInspectionRow> = {}): NycInspectionRow {
  return {
    camis: "50000001",
    dba: "DEMO BAGELS [PLATECHECK]",
    boro: "Manhattan",
    building: "100",
    street: "WEST   42 STREET",
    zipcode: "10036",
    phone: "2125550100",
    inspection_date: "2026-03-06T00:00:00.000",
    action: "Violations were cited in the following area(s).",
    critical_flag: "Critical",
    grade: "A",
    inspection_type: "Cycle Inspection / Initial Inspection",
    ...overrides,
  };
}

describe("buildNycIndex", () => {
  it("groups rows by CAMIS and counts the latest inspection's violations", () => {
    const index = buildNycIndex([
      row({ critical_flag: "Critical" }),
      row({ critical_flag: "Not Critical" }),
      row({ critical_flag: "Not Critical" }),
    ]);
    expect(index).toHaveLength(1);
    const f = index[0];
    expect(f.j).toBe("nyc");
    expect(f.hp).toBe(1); // critical
    expect(f.im).toBe(0);
    expect(f.ba).toBe(2); // not critical
    expect(f.d).toBe("03/06/2026");
    expect(f.g).toBe("A");
    expect(f.vid).toBe("50000001");
  });

  it("normalizes multi-space street text into one address", () => {
    const [f] = buildNycIndex([row()]);
    expect(f.a).toBe("100 WEST 42 STREET");
  });

  it("uses only the most recent inspection and counts distinct dates", () => {
    const index = buildNycIndex([
      row({ inspection_date: "2025-08-01T00:00:00.000", critical_flag: "Critical" }),
      row({ inspection_date: "2025-08-01T00:00:00.000", critical_flag: "Critical" }),
      row({ inspection_date: "2026-03-06T00:00:00.000", critical_flag: "Not Critical" }),
    ]);
    const f = index[0];
    expect(f.d).toBe("03/06/2026");
    expect(f.hp).toBe(0);
    expect(f.ba).toBe(1);
    expect(f.ic).toBe(2);
  });

  it("takes the posted grade from the most recent graded inspection", () => {
    const index = buildNycIndex([
      row({ inspection_date: "2025-08-01T00:00:00.000", grade: "B" }),
      row({ inspection_date: "2026-03-06T00:00:00.000", grade: undefined, action: "Establishment re-opened by DOHMH." }),
    ]);
    expect(index[0].g).toBe("B");
  });

  it("skips not-yet-inspected placeholder rows (1900-01-01)", () => {
    const index = buildNycIndex([
      row({ inspection_date: "1900-01-01T00:00:00.000", critical_flag: "Not Applicable" }),
    ]);
    expect(index).toHaveLength(0);
  });
});
