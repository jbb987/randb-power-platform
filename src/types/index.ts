export interface SiteInputs {
  id: string;
  siteName: string;
  totalAcres: number;
  currentPPA: number;        // $/acre from comps
  mw: number;                // 10-1000
  // Optional metadata
  parcelId: string;
  substationName: string;
  county: string;
}

export interface ValuationResult {
  currentValue: number;           // acres × currentPPA
  buildCost: number;              // from cost curve
  buildCostPerMW: number;         // buildCost / mw
  replacementCost: number;        // buildCost × 1.5
  replacementCostPerMW: number;   // replacementCost / mw
  energizedValue: number;         // currentValue + replacementCost
  energizedPPA: number;           // energizedValue / acres
  valueCreated: number;           // energizedValue - currentValue
  returnMultiple: number;         // energizedValue / currentValue
}

export interface SavedSite {
  id: string;
  inputs: SiteInputs;
  createdAt: number;
  updatedAt: number;
}
