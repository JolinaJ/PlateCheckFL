import type { IndexedFacility } from "../types/extension.js";

// Results whose own text says violations were cited at the inspection,
// spelled exactly as they appear in each dataset. The NYC and Cincinnati
// counts are derived by the ingest from violation rows rather than published
// as a count, so when one of these results sits beside a derived count of 0,
// the zero is a gap in our data, not the authority's finding.
// "Approved - Violations Abated" is deliberately absent: it is recorded with
// no violation rows far more often than with them (a visit where earlier
// violations were resolved), so a zero there is consistent with the record.
const NYC_CITED_RESULTS = new Set([
  "Violations were cited in the following area(s).",
  "Establishment Closed by DOHMH. Violations were cited in the following area(s) and those requiring immediate action were addressed.",
]);
const CINCINNATI_CITED_RESULTS = new Set([
  "Approved - Minor Violations",
  "Not In Compliance",
]);

export function dispositionImpliesViolations(fac: IndexedFacility): boolean {
  if (fac.j === "nyc") return NYC_CITED_RESULTS.has(fac.di);
  if (fac.j === "cincinnati") return CINCINNATI_CITED_RESULTS.has(fac.di);
  return false;
}

export function generateSummary(fac: IndexedFacility): string {
  const parts: string[] = [];

  // Columbus carries no bundled inspection date or counts — the latest
  // inspection is fetched on demand — so summarize the current permit status
  // instead and point to the expandable detail.
  if (fac.j === "columbus") {
    const status = fac.di || "not listed";
    return `Columbus Public Health lists this facility's current permit status as "${status}". Expand the latest inspection to load its date and any critical violations from the official record.`;
  }

  // FDACS publishes the inspection result and the date of the last visit and
  // nothing else -- no violation counts, no tiers, no grade. Falling through
  // to the shared path below would hit `total === 0` and assert "No
  // violations recorded at this inspection", which the record does not
  // support: zero is the absence of published data, not a count of zero.
  if (fac.j === "fdacs") {
    const result = fac.di || "not listed";
    const when = fac.d ? ` on ${fac.d}` : "";
    return `FDACS reports the most recent inspection${when} as "${result}". FDACS does not publish violation counts or severity rankings for these establishments.`;
  }

  if (!fac.d) return "No inspection data available in the current dataset.";

  const disposition = fac.di || "Unknown";
  parts.push(`Most recent inspection on ${fac.d}: ${formatDisposition(disposition)}.`);

  if (fac.j === "nyc") {
    // NYC DOHMH posts an official letter grade — reporting it is factual.
    if (fac.g === "A" || fac.g === "B" || fac.g === "C") {
      parts.push(`Posted NYC grade: ${fac.g}.`);
    } else if (fac.g === "P" || fac.g === "Z") {
      parts.push("NYC grade pending.");
    }
  }

  const cincinnati = fac.j === "cincinnati";
  const total = cincinnati ? (fac.vt ?? 0) : fac.hp + fac.im + fac.ba;
  if (total === 0 && dispositionImpliesViolations(fac)) {
    // Never state a zero the result itself contradicts.
    parts.push(
      "This result notes violations, but no violation count is available for this inspection. See the official record for details."
    );
  } else if (total === 0) {
    parts.push("No violations recorded at this inspection.");
  } else if (cincinnati) {
    // The Cincinnati Health Department publishes violations without a
    // severity tier, so none is reported.
    parts.push(
      `${total} violation(s) recorded. Cincinnati does not rank violations by severity.`
    );
  } else if (fac.j === "nyc") {
    parts.push(
      `${total} violation(s) recorded: ${fac.hp} critical, ${fac.ba} not critical.`
    );
  } else {
    parts.push(
      `${total} violation(s) recorded: ${fac.hp} high priority, ${fac.im} intermediate, ${fac.ba} basic.`
    );
  }

  // `ic` counts inspections on record across the archive, not one fiscal
  // year, for every jurisdiction.
  if (fac.ic > 1) {
    parts.push(`${fac.ic} inspection(s) on record.`);
  }

  return parts.join(" ");
}

export function formatDisposition(disposition: string): string {
  const map: Record<string, string> = {
    // Florida DBPR dispositions
    "Inspection Completed - No Further Action": "No further action",
    "Call Back - Complied": "Follow-up: complied",
    "Call Back - Extension Given": "Follow-up: extension given",
    "Call Back - Not Complied": "Follow-up: not complied",
    "Administrative complaint  recommended": "Administrative action recommended",
    "Emergency Order/Closure": "Emergency closure",
    "Assigned to Inspector": "Pending",
    "Awaiting Contact": "Awaiting contact",
    // NYC DOHMH actions
    "Violations were cited in the following area(s).": "Violations cited",
    "No violations were recorded at the time of this inspection.": "No violations recorded",
    "Establishment re-opened by DOHMH.": "Re-opened by DOHMH",
    "Establishment re-closed by DOHMH.": "Re-closed by DOHMH",
  };
  if (map[disposition]) return map[disposition];
  // NYC closure action carries a long variable tail.
  if (disposition.startsWith("Establishment Closed by DOHMH")) return "Closed by DOHMH";
  return disposition;
}
