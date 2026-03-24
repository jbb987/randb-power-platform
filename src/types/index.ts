export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface SiteInputs {
  id: string;
  projectId: string;         // Links to parent Project
  siteName: string;
  totalAcres: number;
  currentPPA: number;        // $/acre from comps
  mw: number;                // 10-1000
  // Optional metadata
  parcelId: string;
  substationName: string;
  county: string;
  // Descriptive fields
  utilityTerritory: string;
  iso: string;
  description: string;
}

export interface AppraisalResult {
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

// Site Request types
export interface SiteRequestSite {
  address: string;
  notes: string;
}

export type SiteRequestStatus = 'new' | 'ongoing' | 'done';

export interface SiteRequest {
  id: string;
  projectId: string;
  customerName: string;
  sites: SiteRequestSite[];
  status: SiteRequestStatus;
  submittedBy: string;
  createdAt: number;
  updatedAt: number;
}
