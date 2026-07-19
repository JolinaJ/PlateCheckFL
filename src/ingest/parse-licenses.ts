import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import type { DbprLicenseRow } from "../types/dbpr.js";

// Actual CSV headers from the DBPR active food service license extract.
const HEADER_MAP: Record<string, keyof DbprLicenseRow> = {
  "License Type Code": "licenseTypeCode",
  "License Number": "licenseNumber",
  "Licensee Name": "licenseeName",
  "Business Name": "businessName",
  "Location Street Address": "locationAddress",
  "Location Address Line 2": "locationAddressLine2",
  "Location City": "locationCity",
  "Location Zip Code": "locationZip",
  "Location County": "locationCounty",
  District: "district",
  "Primary Phone Number": "primaryPhone",
  "Secondary Phone Number": "secondaryPhone",
  "Number of Seats or Rental Units": "numberOfSeats",
  "Primary Status Code": "primaryStatusCode",
  "License Expiry Date": "licenseExpiryDate",
  "Last Inspection Date": "lastInspectionDate",
};

export function parseLicensesCsv(filePath: string): DbprLicenseRow[] {
  const content = readFileSync(filePath, "utf-8");
  const records: Record<string, string>[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: false,
    relax_quotes: true,
    relax_column_count: true,
  });

  return records.map((row) => mapLicenseRow(row));
}

export function mapLicenseRow(row: Record<string, string>): DbprLicenseRow {
  const mapped: Partial<DbprLicenseRow> = {};

  for (const [csvHeader, fieldName] of Object.entries(HEADER_MAP)) {
    const value = row[csvHeader] ?? "";
    (mapped as any)[fieldName] = value.trim();
  }

  return mapped as DbprLicenseRow;
}

export function getLicenseHeaders(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const firstLine = content.split("\n")[0].replace(/\r$/, "");
  return firstLine
    .split(",")
    .map((h) => h.replace(/^"|"$/g, ""));
}
