export interface DbprInspectionRow {
  district: string;
  countyNumber: string;
  countyName: string;
  licenseTypeCode: string;
  licenseNumber: string;
  businessName: string;
  locationAddress: string;
  locationCity: string;
  locationZip: string;
  inspectionNumber: string;
  visitNumber: string;
  inspectionClass: string;
  inspectionType: string;
  inspectionDisposition: string;
  inspectionDate: string;
  highPriorityViolations: number;
  intermediateViolations: number;
  basicViolations: number;
  totalViolations: number;
  pdaStatus: string;
  licenseId: string;
  inspectionVisitId: string;
}

export interface DbprLicenseRow {
  licenseTypeCode: string;
  licenseNumber: string;
  licenseeName: string;
  businessName: string;
  locationAddress: string;
  locationAddressLine2: string;
  locationCity: string;
  locationZip: string;
  locationCounty: string;
  district: string;
  primaryPhone: string;
  secondaryPhone: string;
  numberOfSeats: string;
  primaryStatusCode: string;
  licenseExpiryDate: string;
  lastInspectionDate: string;
}

export interface JoinedFacility {
  licenseNumber: string;
  businessName: string;
  locationAddress: string;
  locationCity: string;
  locationZip: string;
  locationCounty: string;
  district: string;
  phone: string;
  numberOfSeats: string;
  licenseExpiryDate: string;
  inspections: DbprInspectionRow[];
}

export interface SourceManifestEntry {
  sourcePageUrl: string;
  fileUrl: string;
  downloadTimestamp: string;
  localFilename: string;
  sha256: string;
  district: string;
  fileType: "inspection" | "license";
}

export interface SourceManifest {
  entries: SourceManifestEntry[];
}

export interface LookupQuery {
  name: string;
  address?: string;
  city?: string;
  zip?: string;
}

export interface LookupResult {
  confidence: "confirmed" | "likely" | "possible" | "unmatched";
  facility: JoinedFacility | null;
  candidates: Array<{
    facility: JoinedFacility;
    score: number;
    confidence: string;
  }>;
}
