import type { IndexedFacility } from "../types/extension.js";

// One feature from the Columbus Public Health "Inspected Restaurants &
// Markets" ArcGIS layer (maps2.columbus.gov, Schemas/Health/MapServer/3).
// This layer is a facility/permit directory: it carries clean matching
// fields and a current permit status, but no inspection date or violation
// counts — those live per-facility in the EnvisionConnect record and are
// fetched on demand (see the DBPR on-demand pattern). One row per facility.
export interface ColumbusFeatureAttrs {
  FACILITY_ID?: string;
  BUSINESS_NAME?: string;
  FACILITY_NAME?: string;
  SITE_ADDRESS?: string;
  CITY?: string;
  STATE?: string;
  ZIP?: string;
  PHONE?: string;
  STATUS_DESCRIP?: string;
  INSPECTION_GROUP?: string;
}

function clean(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

// Format a 10-digit phone like the DBPR/NYC records display it, so the
// matcher's phone comparison (which strips non-digits) has consistent
// input. Non-10-digit values pass through as-is.
function formatPhone(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length !== 10) return raw ?? "";
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Reduce ArcGIS features to the compact IndexedFacility overview the
// extension bundles. Only rows with a facility id and a name are kept — the
// id is the on-demand fetch key and the name is required to match at all.
export function buildColumbusIndex(
  features: Array<{ attributes: ColumbusFeatureAttrs }>
): IndexedFacility[] {
  const facilities: IndexedFacility[] = [];
  const seen = new Set<string>();

  for (const { attributes: a } of features) {
    const facid = (a.FACILITY_ID ?? "").trim();
    const name = clean(a.BUSINESS_NAME || a.FACILITY_NAME);
    if (!facid || !name) continue;
    if (seen.has(facid)) continue;
    seen.add(facid);

    facilities.push({
      n: name,
      a: clean(a.SITE_ADDRESS),
      c: clean(a.CITY),
      z: (a.ZIP ?? "").replace(/[^0-9]/g, "").slice(0, 5),
      ln: facid,
      co: "",
      p: formatPhone(a.PHONE),
      d: "",
      t: "",
      di: (a.STATUS_DESCRIP ?? "").trim(),
      hp: 0,
      im: 0,
      ba: 0,
      ic: 0,
      lid: "",
      vid: facid,
      j: "columbus",
    });
  }

  return facilities;
}
