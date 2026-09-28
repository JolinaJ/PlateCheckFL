import { describe, it, expect } from "vitest";
import { buildCincinnatiIndex, type CincinnatiRow } from "../src/ingest/cincinnati";

// A row of the Cincinnati Food Safety Program dataset. Defaults describe a
// current-system licence with one violation cited.
function row(overrides: Partial<CincinnatiRow> = {}): CincinnatiRow {
  return {
    license_no: "CIN-HEFD-000311",
    business_name: "WENDY'S #940",
    address: "6243 GLENWAY AV",
    city: "CINCINNATI",
    state: "OH",
    postal_code: "45211",
    phone_number: "5132212142",
    license_status: "Issued",
    recordnum_insp: "CIN-HEFD-000311-26IN1",
    insp_type: "ROUTINE",
    insp_subtype: "CRITICAL CONTROL POINT",
    action_date: "2026-08-07T00:00:00.000",
    action_status: "Not In Compliance",
    code: "6.4(K)",
    ...overrides,
  };
}

describe("buildCincinnatiIndex", () => {
  it("reduces a licence's rows to its latest inspection visit", () => {
    const [f] = buildCincinnatiIndex([
      row({ action_date: "2025-03-04T00:00:00.000", recordnum_insp: "R25", code: "1.1(A)" }),
      row({ code: "6.4(K)" }),
      row({ code: "4.1(HH)" }),
    ]);
    expect(f.d).toBe("08/07/2026");
    expect(f.vid).toBe("CIN-HEFD-000311-26IN1");
    expect(f.vt).toBe(2); // only the two violations cited on 08/07
    expect(f.ic).toBe(2); // two distinct visits on record
    expect(f.j).toBe("cincinnati");
  });

  it("assigns no severity tier — Cincinnati publishes none", () => {
    const [f] = buildCincinnatiIndex([row()]);
    expect(f.hp).toBe(0);
    expect(f.im).toBe(0);
    expect(f.ba).toBe(0);
    expect(f.vt).toBe(1);
  });

  it("maps the licence and location fields onto the compact facility", () => {
    const [f] = buildCincinnatiIndex([row()]);
    expect(f.n).toBe("WENDY'S #940");
    expect(f.a).toBe("6243 GLENWAY AV");
    expect(f.c).toBe("CINCINNATI");
    expect(f.z).toBe("45211");
    expect(f.ln).toBe("CIN-HEFD-000311");
    expect(f.co).toBe("HAMILTON");
    expect(f.p).toBe("(513)221-2142");
    expect(f.t).toBe("CRITICAL CONTROL POINT");
    expect(f.di).toBe("Not In Compliance");
  });

  it("counts a visit that cited nothing as zero violations", () => {
    const [f] = buildCincinnatiIndex([
      row({ code: undefined, action_status: "Approved - No Violations" }),
    ]);
    expect(f.vt).toBe(0);
    expect(f.di).toBe("Approved - No Violations");
  });

  it("skips the pre-2024 licensing system, whose action_status is per violation", () => {
    const out = buildCincinnatiIndex([
      row({
        license_no: "FSO-013375-C4S",
        recordnum_insp: "CFSI220916",
        action_status: "Not Abated",
      }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("keeps one entry when a restaurant was re-licensed under a new number", () => {
    const out = buildCincinnatiIndex([
      row({
        license_no: "CIN-HEFD-000041",
        business_name: "THE LONELY PINE STEAKHOUSE",
        address: "6085 MONTGOMERY RD",
        recordnum_insp: "CIN-HEFD-000041-24IN1",
        action_date: "2024-05-02T00:00:00.000",
      }),
      row({
        license_no: "CIN-HEFD-003197",
        business_name: "THE LONELY PINE STEAKHOUSE",
        address: "6085 MONTGOMERY RD",
        recordnum_insp: "CIN-HEFD-003197-26IN1",
        action_date: "2026-06-25T00:00:00.000",
      }),
    ]);
    expect(out).toHaveLength(1);
    // The most recently inspected licence wins.
    expect(out[0].ln).toBe("CIN-HEFD-003197");
    expect(out[0].d).toBe("06/25/2026");
  });

  it("treats a unit designator as the same establishment when collapsing licences", () => {
    const out = buildCincinnatiIndex([
      row({ license_no: "CIN-HEFD-000001", address: "925 RIVERSIDE DR" }),
      row({
        license_no: "CIN-HEFD-000002",
        address: "925 RIVERSIDE DR, #1",
        action_date: "2025-06-06T00:00:00.000",
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].ln).toBe("CIN-HEFD-000001");
  });

  it("resolves address spelling drift within a licence by frequency", () => {
    // The complaint visit is the most recent but spells the address with a
    // unit; the spelling used for most visits is the one to match against.
    const [f] = buildCincinnatiIndex([
      row({ action_date: "2026-01-05T00:00:00.000", recordnum_insp: "A" }),
      row({ action_date: "2026-02-05T00:00:00.000", recordnum_insp: "B" }),
      row({
        address: "6243 GLENWAY AV, #1",
        action_date: "2026-08-07T00:00:00.000",
        recordnum_insp: "C",
      }),
    ]);
    expect(f.a).toBe("6243 GLENWAY AV");
    expect(f.d).toBe("08/07/2026");
  });

  it("drops closed and expired licences", () => {
    const out = buildCincinnatiIndex([
      row({ license_no: "CIN-HEFD-000900", license_status: "Closed" }),
      row({ license_no: "CIN-HEFD-000901", license_status: "Expired" }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("strips the literal quotes and placeholder units the export emits", () => {
    const [f] = buildCincinnatiIndex([
      row({ business_name: '"NOURISH"', address: '"375 DIXMYTH AV #0"' }),
    ]);
    expect(f.n).toBe("NOURISH");
    expect(f.a).toBe("375 DIXMYTH AV");
  });

  it("drops a leading country code from phone numbers", () => {
    const [f] = buildCincinnatiIndex([row({ phone_number: "15132212142" })]);
    expect(f.p).toBe("(513)221-2142");
  });

  it("fills a blank postal code from another row of the same licence", () => {
    const [f] = buildCincinnatiIndex([
      row({ postal_code: undefined, action_date: "2026-08-07T00:00:00.000" }),
      row({ postal_code: "45211", action_date: "2026-01-02T00:00:00.000", recordnum_insp: "B" }),
    ]);
    expect(f.z).toBe("45211");
  });

  it("drops rows with no name, address, or inspection date", () => {
    const out = buildCincinnatiIndex([
      row({ business_name: undefined }),
      row({ license_no: "CIN-HEFD-000002", address: undefined }),
      row({ license_no: "CIN-HEFD-000003", action_date: undefined }),
    ]);
    expect(out).toHaveLength(0);
  });
});
