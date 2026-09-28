import type { IndexedFacility } from "../types/extension.js";

// One row of the Cincinnati Food Safety Program dataset (Cincinnati Open
// Data, Socrata id rg6p-b3h3). One row per violation per inspection visit;
// a visit that cited no violations still produces a single row, with the
// violation fields absent.
//
// A visit is keyed by (recordnum_insp, action_date) — recordnum_insp is the
// facility's inspection record for a licence year, and a record accumulates
// several dated visits. `action_sequence` identifies a visit in the current
// system but is per-row in the pre-2024 records, so it is not used as a key.
export interface CincinnatiRow {
  license_no?: string;
  recordnum_license?: string;
  business_name?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone_number?: string;
  license_status?: string;
  recordnum_insp?: string;
  insp_type?: string;
  insp_subtype?: string;
  action_date?: string; // ISO, e.g. "2026-08-07T00:00:00.000"
  action_status?: string;
  code?: string;
  violation_description?: string;
  violation_comments?: string;
  neighborhood?: string;
}

// The Health Department moved to a new licensing system in March 2024.
// Licences issued by it carry this prefix; everything before it is a
// historical archive whose records are shaped differently (see
// buildCincinnatiIndex).
const CURRENT_SYSTEM_PREFIX = "CIN-HEFD-";

// Licence states that mean the establishment is no longer operating under
// that licence. Cards are not shown for these.
const INACTIVE_STATUSES = new Set(["CLOSED", "EXPIRED", "CANCELLED"]);

// The pre-2024 export wrapped several text fields in literal double quotes
// ("\"NOURISH\""). Strip those along with the usual whitespace noise.
function clean(s: string | undefined): string {
  return (s ?? "").replace(/^"+|"+$/g, "").replace(/\s+/g, " ").trim();
}

function cleanUpper(s: string | undefined): string {
  return clean(s).toUpperCase();
}

// Placeholder unit designators the licensing system emits when a facility
// has no real suite. Left in place they would read as a genuine unit and
// could conflict with a real suite number on the Google side, which the
// matcher treats as evidence of a different tenant.
const PLACEHOLDER_UNIT = /\s*#(?:0|NA|N\/A)\s*$/i;

function cleanAddress(s: string | undefined): string {
  return cleanUpper(s).replace(PLACEHOLDER_UNIT, "").trim();
}

// Format a 10-digit phone the way the DBPR/NYC records display it, so the
// matcher's phone comparison has consistent input. A leading US country
// code is dropped first — the licensing system stores some numbers as
// "15132212142". Other values pass through as-is.
function formatPhone(raw: string | undefined): string {
  let digits = clean(raw).replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return clean(raw);
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// The most frequently used value across a licence's rows, falling back to
// `fallback` when they are all blank. Name and address spellings drift
// between visits at the same licence (155 of 2,633 licences carry more
// than one address spelling, usually a complaint record that appends a
// unit designator), and the spelling used for most visits is the one the
// matcher should see.
function mostCommon(values: string[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

// First non-blank value — for fields the licensing system leaves off some
// rows (postal code, phone) but records on others for the same licence.
function firstNonBlank(values: string[]): string {
  return values.find((v) => v) ?? "";
}

function toMmDdYyyy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

function visitKey(row: CincinnatiRow): string {
  return `${row.recordnum_insp ?? ""}|${(row.action_date ?? "").slice(0, 10)}`;
}

// Identity for recognising two licences as the same establishment. Any
// unit designator is dropped: the two licences frequently disagree about
// whether the address carries one, and a re-licensed restaurant is the
// same restaurant either way.
function establishmentKey(fac: IndexedFacility): string {
  return `${fac.n}|${fac.a.replace(/[,.]?\s*#\s*[\w/-]*/g, "").replace(/\s+/g, " ").trim()}`;
}

/**
 * Groups raw dataset rows by licence and reduces each to a compact
 * IndexedFacility describing its most recent inspection visit.
 *
 * Only the current licensing system is indexed. The archive that precedes
 * the March 2024 migration reports `action_status` per violation ("Abated"
 * / "Not Abated") rather than per inspection, so its rows cannot fill `di`
 * with the same meaning; and since every operating facility was re-licensed
 * in the migration, a business that appears only in the archive is one that
 * stopped being inspected years ago.
 *
 * Reduction happens in two stages because neither key alone is sufficient:
 * a licence's rows disagree about the exact name and address spelling, and
 * a restaurant that changed hands holds two licences at one address. So
 * rows are grouped by licence (spelling variants resolved by frequency),
 * then licences describing the same establishment collapse to the most
 * recently inspected one.
 *
 * No severity is assigned. Cincinnati publishes violations without a
 * critical flag, score, or grade, so the count goes to `vt` and the tiered
 * fields stay 0 (see IndexedFacility).
 */
export function buildCincinnatiIndex(rows: CincinnatiRow[]): IndexedFacility[] {
  const byLicense = new Map<string, CincinnatiRow[]>();

  for (const row of rows) {
    const license = clean(row.license_no);
    if (!license.startsWith(CURRENT_SYSTEM_PREFIX)) continue;
    if (!clean(row.business_name) || !clean(row.address)) continue;
    if (!row.action_date) continue;
    if (INACTIVE_STATUSES.has(cleanUpper(row.license_status))) continue;

    const group = byLicense.get(license);
    if (group) group.push(row);
    else byLicense.set(license, [row]);
  }

  // Stage 1: one facility per licence, from its latest visit.
  const byEstablishment = new Map<string, IndexedFacility>();

  for (const [license, group] of byLicense) {
    const latestDate = group
      .map((r) => r.action_date!.slice(0, 10))
      .reduce((a, b) => (b > a ? b : a));
    const latest = group.filter((r) => r.action_date!.startsWith(latestDate));

    // A licence can record two visits on one day (e.g. a routine
    // inspection and a complaint response). Report one of them rather
    // than mixing their violation rows.
    const record = latest[0].recordnum_insp ?? "";
    const visit = latest.filter((r) => (r.recordnum_insp ?? "") === record);

    // Rows carrying no code are the visit's "no violations cited"
    // placeholder, not a violation.
    const violations = visit.filter((r) => clean(r.code)).length;

    const facility: IndexedFacility = {
      n: mostCommon(group.map((r) => cleanUpper(r.business_name)), ""),
      a: mostCommon(group.map((r) => cleanAddress(r.address)), ""),
      c: mostCommon(group.map((r) => cleanUpper(r.city)), "CINCINNATI"),
      z: firstNonBlank(
        group.map((r) => clean(r.postal_code).replace(/[^0-9]/g, "").slice(0, 5))
      ),
      ln: license,
      co: "HAMILTON",
      p: firstNonBlank(group.map((r) => formatPhone(r.phone_number))),
      d: toMmDdYyyy(latestDate),
      t: clean(visit[0].insp_subtype) || clean(visit[0].insp_type),
      di: clean(visit[0].action_status),
      // Cincinnati publishes no severity tiers — see `vt` below.
      hp: 0,
      im: 0,
      ba: 0,
      // Visits recorded under this licence. A re-licensed establishment's
      // earlier visits sit under its previous licence and are not counted
      // here, so this stays consistent with the licence number shown.
      ic: new Set(group.map(visitKey)).size,
      lid: "",
      vid: record,
      j: "cincinnati",
      vt: violations,
    };

    // Stage 2: collapse re-licensings of the same establishment, keeping
    // whichever licence was inspected most recently.
    const key = establishmentKey(facility);
    const existing = byEstablishment.get(key);
    if (!existing || latestDate > isoOf(existing.d)) {
      byEstablishment.set(key, facility);
    }
  }

  return [...byEstablishment.values()];
}

function isoOf(mmDdYyyy: string): string {
  const [m, d, y] = mmDdYyyy.split("/");
  return `${y}-${m}-${d}`;
}
