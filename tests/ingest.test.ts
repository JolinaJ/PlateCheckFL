import { describe, it, expect } from "vitest";
import {
  mapInspectionRow,
  getInspectionHeaders,
} from "../src/ingest/parse-inspections";
import {
  mapLicenseRow,
  getLicenseHeaders,
} from "../src/ingest/parse-licenses";
import { joinRecords } from "../src/ingest/join-records";
import type { DbprInspectionRow, DbprLicenseRow } from "../src/types/dbpr";
import { existsSync } from "fs";

const INSP_FILE = "data/raw/1fdinspi.csv";
const LIC_FILE = "data/raw/hrfood1.csv";

const hasData = existsSync(INSP_FILE) && existsSync(LIC_FILE);

describe("CSV header mapping", () => {
  it.skipIf(!hasData)(
    "inspection CSV has expected headers",
    () => {
      const headers = getInspectionHeaders(INSP_FILE);
      expect(headers).toContain("District");
      expect(headers).toContain(" License Number");
      expect(headers).toContain("Business (DBA-Does Business As) Name");
      expect(headers).toContain("Inspection Date");
      expect(headers).toContain("Inspection Disposition");
      expect(headers).toContain("Number of High Priority Violations");
      expect(headers).toContain("License ID");
      expect(headers).toContain("Inspection Visit ID");
    }
  );

  it.skipIf(!hasData)(
    "license CSV has expected headers",
    () => {
      const headers = getLicenseHeaders(LIC_FILE);
      expect(headers).toContain("License Number");
      expect(headers).toContain("Business Name");
      expect(headers).toContain("Location Street Address");
      expect(headers).toContain("Location City");
      expect(headers).toContain("Location Zip Code");
      expect(headers).toContain("Location County");
      expect(headers).toContain("District");
    }
  );
});

describe("mapInspectionRow", () => {
  it("parses a representative inspection row", () => {
    const raw: Record<string, string> = {
      District: "D1",
      "County Number": "23",
      "County Name": "Dade",
      " License Type Code": "2001",
      " License Number": "2329337",
      "Business (DBA-Does Business As) Name": "THE ABBEY HOTEL",
      "Location Address": "300 21 ST",
      "Location City": "MIAMI BEACH",
      " Location Zip Code": "33139",
      "Inspection Number": "3677960",
      "Visit Number": "1",
      "Inspection Class": "Food",
      "Inspection Type": "Complaint Full",
      "Inspection Disposition":
        "Inspection Completed - No Further Action",
      "Inspection Date": "10/30/2025",
      "Number of High Priority Violations": "0",
      "Number of Intermediate Violations": "0",
      "Number of Basic Violations": "0",
      " Number of Total Violations": "0",
      "PDA Status": "Y",
      "License ID": "8068118",
      "Inspection Visit ID": "13562738",
    };

    const row = mapInspectionRow(raw);
    expect(row.district).toBe("D1");
    expect(row.licenseNumber).toBe("2329337");
    expect(row.businessName).toBe("THE ABBEY HOTEL");
    expect(row.locationCity).toBe("MIAMI BEACH");
    expect(row.inspectionDate).toBe("10/30/2025");
    expect(row.inspectionDisposition).toBe(
      "Inspection Completed - No Further Action"
    );
    expect(row.highPriorityViolations).toBe(0);
    expect(row.totalViolations).toBe(0);
    expect(row.licenseId).toBe("8068118");
  });
});

describe("mapLicenseRow", () => {
  it("parses a representative license row", () => {
    const raw: Record<string, string> = {
      "Board Code": "200",
      "License Type Code": "2010",
      "Licensee Name": "AKASHI JAPANESE RESTAURANT INC",
      "Rank Code": "SEAT",
      "Modifier Code": "",
      "Mailing Name": "ATTN: LARRY CHI",
      "Mailing Street Address": "5301 SW 76 STREET",
      "Mailing Address Line 2": "",
      "Mailing Address Line 3": "",
      "Mailing City": "MIAMI",
      "Mailing State Code": "FL",
      "Mailing Zip Code": "33143-3645",
      "Primary Phone Number": "(305)761-7121",
      "Mailing County Code": "23",
      "Business Name": "AKASHI JAPANESE RESTAURANT",
      Filler: "",
      "Location Street Address": "5830 S DIXIE HWY",
      "Location Address Line 2": "",
      "Location Address Line 3": "",
      "Location City": "SOUTH MIAMI",
      "Location State Code": "FL",
      "Location Zip Code": "33143-3645",
      "Location County Code": "23",
      "Location County": "Dade",
      "Secondary Phone Number": "(305)665-6261",
      District: "1",
      Region: "34",
      "License Number": "SEA2300159",
      "Primary Status Code": "20",
      "Secondary Status Code": "20",
      "License Expiry Date": "10/01/2026",
      "Last Inspection Date": "12/08/2025",
      "Number of Seats or Rental Units": "60",
      "Base Risk Level": "Risk Level 2",
      "Secondary Risk Level": "",
    };

    const row = mapLicenseRow(raw);
    expect(row.licenseNumber).toBe("SEA2300159");
    expect(row.businessName).toBe("AKASHI JAPANESE RESTAURANT");
    expect(row.locationAddress).toBe("5830 S DIXIE HWY");
    expect(row.locationCity).toBe("SOUTH MIAMI");
    expect(row.locationZip).toBe("33143-3645");
    expect(row.locationCounty).toBe("Dade");
    expect(row.primaryPhone).toBe("(305)761-7121");
    expect(row.secondaryPhone).toBe("(305)665-6261");
  });
});

describe("joinRecords", () => {
  it("joins inspections to licenses by normalized license number", () => {
    const licenses: DbprLicenseRow[] = [
      {
        licenseTypeCode: "2010",
        licenseNumber: "SEA001",
        licenseeName: "OWNER A",
        businessName: "RESTAURANT A",
        locationAddress: "100 MAIN ST",
        locationAddressLine2: "",
        locationCity: "MIAMI",
        locationZip: "33101",
        locationCounty: "Dade",
        district: "1",
        primaryPhone: "(305)555-0001",
        secondaryPhone: "",
        numberOfSeats: "50",
        primaryStatusCode: "20",
        licenseExpiryDate: "10/01/2026",
        lastInspectionDate: "01/15/2026",
      },
    ];

    const inspections: DbprInspectionRow[] = [
      {
        district: "D1",
        countyNumber: "23",
        countyName: "Dade",
        licenseTypeCode: "2010",
        licenseNumber: "SEA001",
        businessName: "RESTAURANT A",
        locationAddress: "100 MAIN ST",
        locationCity: "MIAMI",
        locationZip: "33101",
        inspectionNumber: "1001",
        visitNumber: "1",
        inspectionClass: "Food",
        inspectionType: "Routine",
        inspectionDisposition: "Inspection Completed - No Further Action",
        inspectionDate: "01/15/2026",
        highPriorityViolations: 1,
        intermediateViolations: 2,
        basicViolations: 3,
        totalViolations: 6,
        pdaStatus: "Y",
        licenseId: "1001",
        inspectionVisitId: "2001",
      },
      {
        district: "D1",
        countyNumber: "23",
        countyName: "Dade",
        licenseTypeCode: "2010",
        licenseNumber: "SEA001",
        businessName: "RESTAURANT A",
        locationAddress: "100 MAIN ST",
        locationCity: "MIAMI",
        locationZip: "33101",
        inspectionNumber: "1002",
        visitNumber: "1",
        inspectionClass: "Food",
        inspectionType: "Routine",
        inspectionDisposition: "Inspection Completed - No Further Action",
        inspectionDate: "07/10/2025",
        highPriorityViolations: 0,
        intermediateViolations: 0,
        basicViolations: 1,
        totalViolations: 1,
        pdaStatus: "Y",
        licenseId: "1001",
        inspectionVisitId: "2002",
      },
      {
        district: "D1",
        countyNumber: "23",
        countyName: "Dade",
        licenseTypeCode: "2010",
        licenseNumber: "SEA999",
        businessName: "UNRELATED",
        locationAddress: "999 OTHER ST",
        locationCity: "MIAMI",
        locationZip: "33199",
        inspectionNumber: "9999",
        visitNumber: "1",
        inspectionClass: "Food",
        inspectionType: "Routine",
        inspectionDisposition: "Inspection Completed - No Further Action",
        inspectionDate: "12/01/2025",
        highPriorityViolations: 0,
        intermediateViolations: 0,
        basicViolations: 0,
        totalViolations: 0,
        pdaStatus: "Y",
        licenseId: "9999",
        inspectionVisitId: "9999",
      },
    ];

    const joined = joinRecords(licenses, inspections);
    expect(joined).toHaveLength(1);
    expect(joined[0].licenseNumber).toBe("SEA001");
    expect(joined[0].inspections).toHaveLength(2);
    // Most recent first
    expect(joined[0].inspections[0].inspectionDate).toBe("01/15/2026");
    expect(joined[0].inspections[1].inspectionDate).toBe("07/10/2025");
  });
});
