import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import type { DbprInspectionRow } from "../types/dbpr.js";

// Actual CSV headers from the DBPR District inspection extract.
// Some headers have leading spaces in the official file.
const HEADER_MAP: Record<string, keyof DbprInspectionRow> = {
  District: "district",
  "County Number": "countyNumber",
  "County Name": "countyName",
  " License Type Code": "licenseTypeCode",
  " License Number": "licenseNumber",
  "Business (DBA-Does Business As) Name": "businessName",
  "Location Address": "locationAddress",
  "Location City": "locationCity",
  " Location Zip Code": "locationZip",
  "Inspection Number": "inspectionNumber",
  "Visit Number": "visitNumber",
  "Inspection Class": "inspectionClass",
  "Inspection Type": "inspectionType",
  "Inspection Disposition": "inspectionDisposition",
  "Inspection Date": "inspectionDate",
  "Number of High Priority Violations": "highPriorityViolations",
  "Number of Intermediate Violations": "intermediateViolations",
  "Number of Basic Violations": "basicViolations",
  " Number of Total Violations": "totalViolations",
  "PDA Status": "pdaStatus",
  "License ID": "licenseId",
  "Inspection Visit ID": "inspectionVisitId",
};

export function parseInspectionsCsv(filePath: string): DbprInspectionRow[] {
  const content = readFileSync(filePath, "utf-8");
  const records: Record<string, string>[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: false,
    relax_quotes: true,
    relax_column_count: true,
  });

  return records.map((row) => mapInspectionRow(row));
}

export function mapInspectionRow(
  row: Record<string, string>
): DbprInspectionRow {
  const mapped: Partial<DbprInspectionRow> = {};

  for (const [csvHeader, fieldName] of Object.entries(HEADER_MAP)) {
    const value = row[csvHeader] ?? "";
    if (
      fieldName === "highPriorityViolations" ||
      fieldName === "intermediateViolations" ||
      fieldName === "basicViolations" ||
      fieldName === "totalViolations"
    ) {
      (mapped as any)[fieldName] = parseInt(value, 10) || 0;
    } else {
      (mapped as any)[fieldName] = value.trim();
    }
  }

  return mapped as DbprInspectionRow;
}

export function getInspectionHeaders(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const firstLine = content.split("\n")[0].replace(/\r$/, "");
  return firstLine
    .split(",")
    .map((h) => h.replace(/^"|"$/g, ""));
}
