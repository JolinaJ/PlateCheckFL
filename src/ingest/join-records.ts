import type {
  DbprInspectionRow,
  DbprLicenseRow,
  JoinedFacility,
} from "../types/dbpr.js";

// License files use prefixed IDs (e.g. "SEA2300159") while inspection
// files use bare numeric IDs (e.g. "2300159"). Strip alphabetic prefix
// to join on the numeric portion.
function normalizeLicenseNumber(ln: string): string {
  return ln.replace(/^[A-Z]+/i, "");
}

export function joinRecords(
  licenses: DbprLicenseRow[],
  inspections: DbprInspectionRow[]
): JoinedFacility[] {
  const inspectionsByLicense = new Map<string, DbprInspectionRow[]>();
  for (const insp of inspections) {
    const key = normalizeLicenseNumber(insp.licenseNumber);
    if (!inspectionsByLicense.has(key)) {
      inspectionsByLicense.set(key, []);
    }
    inspectionsByLicense.get(key)!.push(insp);
  }

  const facilities: JoinedFacility[] = [];

  for (const lic of licenses) {
    const joinKey = normalizeLicenseNumber(lic.licenseNumber);
    const inspList = inspectionsByLicense.get(joinKey) ?? [];

    inspList.sort((a, b) => {
      const da = parseDate(a.inspectionDate);
      const db = parseDate(b.inspectionDate);
      return db.getTime() - da.getTime();
    });

    facilities.push({
      licenseNumber: lic.licenseNumber,
      businessName: lic.businessName,
      locationAddress: lic.locationAddress,
      locationCity: lic.locationCity,
      locationZip: lic.locationZip,
      locationCounty: lic.locationCounty,
      district: lic.district,
      phone: lic.secondaryPhone || lic.primaryPhone,
      numberOfSeats: lic.numberOfSeats,
      licenseExpiryDate: lic.licenseExpiryDate,
      inspections: inspList,
    });
  }

  return facilities;
}

function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return new Date(
      parseInt(parts[2], 10),
      parseInt(parts[0], 10) - 1,
      parseInt(parts[1], 10)
    );
  }
  return new Date(dateStr);
}

export { parseDate };
