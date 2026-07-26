// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  parseColumbusInspectionFromHtml,
  buildColumbusDetailUrl,
} from "../src/ui/violation-fetcher";
import type { IndexedFacility } from "../src/types/extension";

// Trimmed but structurally faithful copy of a Columbus EnvisionConnect
// facility page: inspections newest-first, each a date row + a
// toggleVisibility link to a <span> holding critical-violation <li> items
// (red = critical), with the "no critical violations" case handled by a
// script that document.write()s and therefore leaves the span empty.
const HTML = `
<table>
  <tr style="background-color: #000066;"><td>Date</td><td>Inspection Type</td></tr>
  <tr>
    <td valign="top">03/09/2026</td>
    <td colspan="2"><a href="javascript:toggleVisibility('SPAN_A');">INSPECTION - STANDARD / CCP</a></td>
  </tr>
  <tr>
    <td><br></td>
    <td colspan="2">
      <span id="SPAN_A" style="display: none;">
        <ul>
          <script>if(score==100){document.write('<li>No critical violations cited</li>');}</script>
          <li style="color: #FF0000;">3717-1-03.2(C)(2)
            <p><strong>Violation:</strong> The food facility is not preventing cross contamination between different types of raw animal products.</p>
            <p><strong>Correction:</strong> 15</p>
            <p><strong>Comments:</strong> Observed raw turkey stored above sausage.</p>
          </li>
          <li style="color: #FF0000;">3717-1-04.5
            <p><strong>Violation:</strong> Pests present in the facility.</p>
            <p><strong>Comments:</strong> Two mice observed.</p>
          </li>
        </ul>
      </span>
    </td>
  </tr>
  <tr>
    <td valign="top">11/17/2025</td>
    <td colspan="2"><a href="javascript:toggleVisibility('SPAN_B');">INSPECTION - STANDARD / CCP</a></td>
  </tr>
  <tr>
    <td><br></td>
    <td colspan="2">
      <span id="SPAN_B" style="display: none;">
        <ul>
          <script>if(score==100){document.write('<li>No critical violations cited</li>');}</script>
        </ul>
      </span>
    </td>
  </tr>
</table>
`;

describe("parseColumbusInspectionFromHtml", () => {
  it("returns the latest inspection with its critical violations", () => {
    const insp = parseColumbusInspectionFromHtml(HTML);
    expect(insp).not.toBeNull();
    expect(insp!.date).toBe("03/09/2026");
    expect(insp!.type).toBe("INSPECTION - STANDARD / CCP");
    expect(insp!.violations).toHaveLength(2);
  });

  it("extracts the code and the Violation paragraph as the description", () => {
    const insp = parseColumbusInspectionFromHtml(HTML)!;
    const first = insp.violations[0];
    expect(first.code).toBe("3717-1-03.2(C)(2)");
    expect(first.description).toBe(
      "The food facility is not preventing cross contamination between different types of raw animal products."
    );
    // Correction/Comments must not leak into the description.
    expect(first.description).not.toMatch(/correction|comments|turkey/i);
  });

  it("classifies red items as critical (mapped to the 'high' bucket)", () => {
    const insp = parseColumbusInspectionFromHtml(HTML)!;
    expect(insp.violations.every((v) => v.priority === "high")).toBe(true);
  });

  it("treats a clean inspection (empty span) as zero violations", () => {
    // Point only at the second inspection's span by removing the first.
    const cleanOnly = HTML.replace(/03\/09\/2026[\s\S]*?SPAN_A[\s\S]*?<\/span>\s*<\/td>\s*<\/tr>/, "");
    const insp = parseColumbusInspectionFromHtml(cleanOnly)!;
    expect(insp.date).toBe("11/17/2025");
    expect(insp.violations).toHaveLength(0);
  });

  it("returns null when there are no inspections", () => {
    expect(parseColumbusInspectionFromHtml("<table></table>")).toBeNull();
  });
});

describe("buildColumbusDetailUrl", () => {
  const fac = (o: Partial<IndexedFacility> = {}): IndexedFacility => ({
    n: "X", a: "1 MAIN", c: "COLUMBUS", z: "43220", ln: "FA0000820",
    co: "", p: "", d: "", t: "", di: "Standards Met",
    hp: 0, im: 0, ba: 0, ic: 0, lid: "", vid: "FA0000820", j: "columbus",
    ...o,
  });

  it("builds the facility detail URL from the facility id (vid)", () => {
    expect(buildColumbusDetailUrl(fac())).toBe(
      "https://pressagent.envisionconnect.com/fac.phtml?agency=COL&forceresults=1&facid=FA0000820"
    );
  });

  it("returns null without a facility id", () => {
    expect(buildColumbusDetailUrl(fac({ vid: "" }))).toBeNull();
  });
});
