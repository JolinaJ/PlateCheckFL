export type ViolationSeverity = "priority" | "intermediate" | "basic";

export type InspectionOutcome =
  | "pass"
  | "pass_with_conditions"
  | "follow_up_required"
  | "administrative";

export type MatchConfidence = "confirmed" | "likely" | "possible" | "unmatched";

export interface DataProvenance {
  sourceKind: "demo" | "dbpr";
  sourceLabel: string;
  sourceUrl: string | null;
  retrievedAt: string;
}

export interface FacilityAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface Violation {
  code: string;
  description: string;
  severity: ViolationSeverity;
  isRepeat: boolean;
}

export interface Inspection {
  date: string;
  type: string;
  outcome: InspectionOutcome;
  violations: Violation[];
}

export interface Facility {
  licenseId: string;
  name: string;
  address: FacilityAddress;
  phone: string | null;
  inspections: Inspection[];
  provenance: DataProvenance;
}

export interface RestaurantQuery {
  name: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
}

export interface MatchReason {
  field: string;
  matched: boolean;
  detail: string;
}

export interface MatchCandidate {
  facility: Facility;
  score: number;
  confidence: MatchConfidence;
  reasons: MatchReason[];
}

export interface MatchResult {
  match: MatchCandidate | null;
  confidence: MatchConfidence;
  candidates: MatchCandidate[];
}
