// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchViolations,
  parseViolationsFromHtml,
} from "../src/ui/violation-fetcher";
import type { IndexedFacility } from "../src/types/extension";

function flFac(overrides: Partial<IndexedFacility> = {}): IndexedFacility {
  return {
    n: "TEST", a: "100 MAIN", c: "MIAMI", z: "33101", ln: "SEA001",
    co: "Dade", p: "", d: "01/15/2026", t: "Routine - Food",
    di: "Call Back - Complied",
    hp: 1, im: 0, ba: 2, ic: 1,
    lid: "1000001", vid: "20000001",
    ...overrides,
  };
}

function nycFac(overrides: Partial<IndexedFacility> = {}): IndexedFacility {
  return {
    n: "TEST NYC", a: "100 BROADWAY", c: "MANHATTAN", z: "10036", ln: "50000001",
    co: "MANHATTAN", p: "", d: "03/06/2026", t: "Cycle Inspection / Initial Inspection",
    di: "Violations were cited in the following area(s).",
    hp: 1, im: 0, ba: 1, ic: 2,
    lid: "", vid: "50000001", j: "nyc", g: "A",
    ...overrides,
  };
}

const SAMPLE_HTML = `
<html><body>
<table>
  <tr><th>Violation</th><th>Observation</th></tr>
  <tr>
    <td>08A-02-4</td>
    <td>High Priority - Raw animal food stored over ready-to-eat food. Corrected On-Site.</td>
  </tr>
  <tr>
    <td>22-02-4</td>
    <td>Intermediate - Food-contact surface soiled with food debris. Repeat Violation.</td>
  </tr>
  <tr>
    <td>14-01-4</td>
    <td>Basic - Bowl or other container with no handle used to dispense food. Warning.</td>
  </tr>
</table>
</body></html>`;

function stubChrome(response: unknown): ReturnType<typeof vi.fn> {
  const sendMessage = vi.fn().mockResolvedValue(response);
  (globalThis as Record<string, unknown>).chrome = { runtime: { sendMessage } };
  return sendMessage;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).chrome;
});

describe("parseViolationsFromHtml", () => {
  it("extracts codes, priorities, and status flags", () => {
    const v = parseViolationsFromHtml(SAMPLE_HTML);
    expect(v).toHaveLength(3);

    expect(v[0].code).toBe("08A-02-4");
    expect(v[0].priority).toBe("high");
    expect(v[0].correctedOnSite).toBe(true);
    expect(v[0].isRepeat).toBe(false);
    expect(v[0].description).toBe("Raw animal food stored over ready-to-eat food.");

    expect(v[1].priority).toBe("intermediate");
    expect(v[1].isRepeat).toBe(true);

    expect(v[2].priority).toBe("basic");
    expect(v[2].description).toBe(
      "Bowl or other container with no handle used to dispense food."
    );
  });

  it("returns empty for pages without a violation table", () => {
    expect(parseViolationsFromHtml("<html><body><p>hi</p></body></html>")).toEqual([]);
  });

  // Real DBPR pages wrap the violations table in several layout tables.
  // The outer tables must be skipped: their first row "contains" the inner
  // header cells, so they pass the header check with garbage column indices.
  it("finds the violations table inside nested layout tables", () => {
    const nested = `
<html><body>
<table>
  <tr><td>THE OFFICIAL SITE OF THE FLORIDA DBPR</td></tr>
  <tr><td>
    <table>
      <tr><td>Inspection Information</td></tr>
      <tr><td>
        ${SAMPLE_HTML.replace(/<\/?(html|body)>/g, "")}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
    const v = parseViolationsFromHtml(nested);
    expect(v).toHaveLength(3);
    expect(v.map((x) => x.priority)).toEqual(["high", "intermediate", "basic"]);
  });
});

describe("fetchViolations — Florida (service worker path)", () => {
  it("requests HTML via the service worker and parses it", async () => {
    const sendMessage = stubChrome({ ok: true, html: SAMPLE_HTML });

    const violations = await fetchViolations(flFac({ vid: "1", lid: "1" }));
    expect(violations).toHaveLength(3);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "platecheck:fetch",
      url: "https://www.myfloridalicense.com/inspectionDetail.asp?InspVisitID=1&licid=1",
    });
  });

  it("caches results per URL", async () => {
    const sendMessage = stubChrome({ ok: true, html: SAMPLE_HTML });
    const fac = flFac({ vid: "2", lid: "2" });

    await fetchViolations(fac);
    await fetchViolations(fac);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("throws when the service worker reports an error", async () => {
    stubChrome({ ok: false, error: "HTTP 500" });

    await expect(fetchViolations(flFac({ vid: "3", lid: "3" }))).rejects.toThrow("HTTP 500");
  });
});

describe("fetchViolations — NYC (direct Socrata path)", () => {
  const NYC_ROWS = [
    {
      violation_code: "04L",
      violation_description: "Evidence of mice or live mice in establishment's food or non-food areas.",
      critical_flag: "Critical",
    },
    {
      violation_code: "10F",
      violation_description: "Non-food contact surface improperly constructed.",
      critical_flag: "Not Critical",
    },
  ];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches from the Open Data API and maps critical flags", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => NYC_ROWS,
    });
    vi.stubGlobal("fetch", fetchMock);

    const violations = await fetchViolations(nycFac({ vid: "50000010", d: "03/06/2026" }));
    expect(violations).toHaveLength(2);
    expect(violations[0].priority).toBe("high");
    expect(violations[0].code).toBe("04L");
    expect(violations[1].priority).toBe("basic");

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("data.cityofnewyork.us");
    expect(url).toContain("camis=50000010");
    expect(url).toContain(encodeURIComponent("2026-03-06T00:00:00.000"));
  });

  it("does not touch the service worker", async () => {
    const sendMessage = stubChrome({ ok: true, html: "" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await fetchViolations(nycFac({ vid: "50000011" }));
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
