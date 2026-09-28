import { describe, it, expect } from "vitest";
import {
  parseHiddenFields,
  parseResultRows,
  parseFdacsAddress,
  buildCitiesByZip,
  cleanStreet,
  FDACS_COUNTY_IDS,
} from "../src/ingest/fdacs";

describe("FDACS county map", () => {
  it("covers all 67 Florida counties", () => {
    expect(Object.keys(FDACS_COUNTY_IDS)).toHaveLength(67);
  });
});

describe("parseHiddenFields", () => {
  // Every hidden input must be replayed or the portal errors the request.
  // ToolkitScriptManager1_HiddenField and __VIEWSTATEENCRYPTED are the two
  // that are easy to miss and that took the search down when omitted.
  it("captures every hidden input including the toolkit and encryption flags", () => {
    const html = `
      <input type="hidden" name="ctl00_ToolkitScriptManager1_HiddenField" value="">
      <input type="hidden" name="__VIEWSTATE" value="abc123">
      <input type="hidden" name="__VIEWSTATEENCRYPTED" value="">
      <input type="hidden" name="__EVENTVALIDATION" value="xyz">
      <input type="text" name="ctl00$cphMain$txtName" value="ignored">`;
    const f = parseHiddenFields(html);
    expect(Object.keys(f).sort()).toEqual([
      "__EVENTVALIDATION", "__VIEWSTATE", "__VIEWSTATEENCRYPTED",
      "ctl00_ToolkitScriptManager1_HiddenField",
    ]);
    expect(f.__VIEWSTATE).toBe("abc123");
  });

  it("decodes entities in replayed values", () => {
    const f = parseHiddenFields('<input type="hidden" name="__VIEWSTATE" value="a&amp;b">');
    expect(f.__VIEWSTATE).toBe("a&b");
  });
});

describe("parseResultRows", () => {
  const grid = `
    <tr><th>FE Name</th><th>FE Number</th><th>FE Address</th><th>Summary</th><th>Last Visit</th></tr>
    <tr><td>WAWA #5475</td><td>361248</td><td>9291 S STATE ROAD 228 MACCLENNY FL 32063</td>
        <td>Met Sanitation Inspection Requirements</td><td>07/22/2026</td></tr>
    <tr><td colspan="5"><a href="#">2</a></td></tr>`;

  it("reads the five data columns", () => {
    const rows = parseResultRows(grid);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("WAWA #5475");
    expect(rows[0].permit).toBe("361248");
    expect(rows[0].lastVisit).toBe("07/22/2026");
  });

  it("skips the pager row", () => {
    expect(parseResultRows(grid).every((r) => /^\d+$/.test(r.permit))).toBe(true);
  });
});

describe("parseFdacsAddress", () => {
  const gaz = buildCitiesByZip([
    { c: "PALM BAY", z: "32907" },
    { c: "KISSIMMEE", z: "34758" },
    { c: "GLEN ST MARY", z: "32040" },
    { c: "MACCLENNY", z: "32063" },
  ]);

  it("splits street, city and zip from one unpunctuated string", () => {
    expect(parseFdacsAddress("850 MALABAR RD SE PALM BAY FL 32907", gaz)).toEqual({
      street: "850 MALABAR RD SE", city: "PALM BAY", zip: "32907",
    });
  });

  // The city itself contains "ST", so splitting on street-suffix keywords
  // gets this wrong. The ZIP gazetteer is what makes it work.
  it("handles a city containing a street-suffix word", () => {
    expect(parseFdacsAddress("9206 CR 125 GLEN ST MARY FL 32040", gaz)).toEqual({
      street: "9206 CR 125", city: "GLEN ST MARY", zip: "32040",
    });
  });

  it("de-fuses a store designator jammed onto the street suffix", () => {
    expect(
      parseFdacsAddress("5035 S ORANGE BLOSSOM TRLSTORE #5124 KISSIMMEE FL 34758", gaz).street
    ).toBe("5035 S ORANGE BLOSSOM TRL");
  });

  it("falls back to a single-word city when the zip is unknown", () => {
    const a = parseFdacsAddress("100 MAIN ST SOMEWHERE FL 39999", gaz);
    expect(a.city).toBe("SOMEWHERE");
    expect(a.zip).toBe("39999");
  });
});

describe("cleanStreet", () => {
  it("leaves a genuine street suffix alone", () => {
    expect(cleanStreet("453 W MACCLENNY AVE")).toBe("453 W MACCLENNY AVE");
  });
  it("drops a trailing suite designator", () => {
    expect(cleanStreet("1200 MAIN ST STE 400")).toBe("1200 MAIN ST");
  });
});
