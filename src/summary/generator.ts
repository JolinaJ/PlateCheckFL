import type { IndexedFacility } from "../types/extension.js";

export function generateSummary(fac: IndexedFacility): string {
  const parts: string[] = [];

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

  const total = fac.hp + fac.im + fac.ba;
  if (total === 0) {
    parts.push("No violations recorded at this inspection.");
  } else if (fac.j === "nyc") {
    parts.push(
      `${total} violation(s) recorded: ${fac.hp} critical, ${fac.ba} not critical.`
    );
  } else {
    parts.push(
      `${total} violation(s) recorded: ${fac.hp} high priority, ${fac.im} intermediate, ${fac.ba} basic.`
    );
  }

  if (fac.ic > 1) {
    parts.push(
      fac.j === "nyc"
        ? `${fac.ic} inspection(s) on record.`
        : `${fac.ic} inspection(s) on record in the current fiscal year.`
    );
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
