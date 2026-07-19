import type { IndexedFacility } from "../types/extension.js";

// One row of the NYC DOHMH Restaurant Inspection Results dataset
// (NYC Open Data, id 43nn-pn8j). One row per violation per inspection;
// establishments not yet inspected carry a placeholder 1900-01-01 date.
export interface NycInspectionRow {
  camis: string;
  dba: string;
  boro: string;
  building?: string;
  street?: string;
  zipcode?: string;
  phone?: string;
  inspection_date: string; // ISO, e.g. "2026-03-06T00:00:00.000"
  action?: string;
  critical_flag?: string; // "Critical" | "Not Critical" | "Not Applicable"
  score?: string;
  grade?: string; // A/B/C, P/Z (pending), N (not yet graded)
  grade_date?: string;
  inspection_type?: string;
}

const PLACEHOLDER_DATE = "1900-01-01";

function toMmDdYyyy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

function cleanAddress(building: string | undefined, street: string | undefined): string {
  return [building, street]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Groups raw dataset rows by establishment (CAMIS) and reduces each to a
// compact IndexedFacility describing its most recent inspection, mirroring
// what the DBPR ingest produces for Florida.
export function buildNycIndex(rows: NycInspectionRow[]): IndexedFacility[] {
  const byCamis = new Map<string, NycInspectionRow[]>();
  for (const row of rows) {
    if (!row.camis || !row.dba) continue;
    if ((row.inspection_date ?? "").startsWith(PLACEHOLDER_DATE)) continue;
    const group = byCamis.get(row.camis);
    if (group) group.push(row);
    else byCamis.set(row.camis, [row]);
  }

  const facilities: IndexedFacility[] = [];

  for (const group of byCamis.values()) {
    const dates = [...new Set(group.map((r) => r.inspection_date.slice(0, 10)))].sort();
    const latestDate = dates[dates.length - 1];
    const latest = group.filter((r) => r.inspection_date.startsWith(latestDate));

    let critical = 0;
    let notCritical = 0;
    for (const r of latest) {
      if (r.critical_flag === "Critical") critical++;
      else if (r.critical_flag === "Not Critical") notCritical++;
    }

    // The posted grade may come from an earlier graded inspection than the
    // latest visit (e.g. the latest visit is a re-opening check). Use the
    // grade from the most recent row that has one.
    const graded = group
      .filter((r) => r.grade)
      .sort((a, b) => a.inspection_date.localeCompare(b.inspection_date));
    const grade = graded.length > 0 ? graded[graded.length - 1].grade : undefined;

    const first = latest[0];
    facilities.push({
      n: (first.dba ?? "").trim().toUpperCase(),
      a: cleanAddress(first.building, first.street),
      c: (first.boro ?? "").trim().toUpperCase(),
      z: (first.zipcode ?? "").replace(/[^0-9]/g, "").slice(0, 5),
      ln: first.camis,
      co: (first.boro ?? "").trim().toUpperCase(),
      p: first.phone ?? "",
      d: toMmDdYyyy(latestDate),
      t: first.inspection_type ?? "",
      di: first.action ?? "",
      hp: critical,
      im: 0,
      ba: notCritical,
      ic: dates.length,
      lid: "",
      vid: first.camis,
      j: "nyc",
      ...(grade ? { g: grade } : {}),
    });
  }

  return facilities;
}
