// A growing store of every inspection row we have ever downloaded.
//
// Why this exists: DBPR's district extract is NOT a cumulative archive. It is
// the current Florida fiscal year to date, and it resets every July 1. A file
// downloaded in June holds twelve months; the same file downloaded in August
// holds six weeks. Running download+ingest therefore does not refresh the
// dataset -- it REPLACES it with whatever the current fiscal year happens to
// contain so far. On 2026-08-25 that would have cut district 1 from 21,218
// inspections to 3,734.
//
// So the raw CSV is treated as a delta, not as the truth. Every ingest merges
// the newly downloaded rows into this archive, and the index is built from the
// archive. A download can then only ever add information, the July reset is
// harmless, and a missed week costs nothing.
//
// The merge key is `inspectionVisitId`. Verified against the real extract: in
// district 1 all 21,218 rows carry one, all 21,218 are distinct, and no id
// ever appears twice with different content.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import type { DbprInspectionRow } from "../types/dbpr.js";

const ARCHIVE_DIR = "data/archive";

export function archivePath(district: string): string {
  return `${ARCHIVE_DIR}/district${district}-inspections.ndjson`;
}

export function loadArchive(district: string): DbprInspectionRow[] {
  const path = archivePath(district);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as DbprInspectionRow);
}

export interface MergeResult {
  merged: DbprInspectionRow[];
  added: number;
  revised: number;
  carried: number;
}

// Incoming rows win on a key collision: DBPR does correct records in place,
// and the freshly downloaded copy is by definition the authority's current
// statement about that visit. A collision whose content is byte-identical is
// not counted as a revision, so the log distinguishes "DBPR changed this"
// from "we downloaded it again".
export function mergeInspections(
  existing: DbprInspectionRow[],
  incoming: DbprInspectionRow[]
): MergeResult {
  const byId = new Map<string, DbprInspectionRow>();
  for (const row of existing) byId.set(keyOf(row), row);

  let added = 0;
  let revised = 0;
  for (const row of incoming) {
    const key = keyOf(row);
    const prev = byId.get(key);
    if (prev === undefined) {
      added++;
    } else if (JSON.stringify(prev) !== JSON.stringify(row)) {
      revised++;
    } else {
      continue;
    }
    byId.set(key, row);
  }

  // Deterministic order keeps the committed file's diff readable and stops an
  // unchanged ingest from rewriting the whole blob.
  const merged = [...byId.values()].sort((a, b) =>
    keyOf(a).localeCompare(keyOf(b), "en", { numeric: true })
  );

  return { merged, added, revised, carried: existing.length - revised };
}

// Falls back to the natural composite when an id is ever missing, so a row
// without one can still be deduplicated rather than multiplying on every run.
function keyOf(row: DbprInspectionRow): string {
  return (
    row.inspectionVisitId ||
    `${row.licenseNumber}|${row.inspectionDate}|${row.visitNumber}`
  );
}

// NDJSON, one inspection per line, rather than one JSON array on one line.
// This file is committed because DBPR no longer publishes the fiscal years it
// holds -- FY2025-26 exists nowhere else -- and a single-line array makes git
// store a fresh 12MB blob on every weekly ingest. Line-per-record means a
// refresh appends lines and git's delta compression handles it, which is what
// makes committing the archive sustainable rather than a repo-bloat problem.
export function saveArchive(district: string, rows: DbprInspectionRow[]): void {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  writeFileSync(archivePath(district), body + (body ? "\n" : ""));
}
