export type UserRole = 'admin' | 'agent';

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
  ppaLow: number;            // $/acre low estimate
  ppaHigh: number;           // $/acre high estimate
  mw: number;                // 10-1000
  // Land / Property
  address: string;
  legalDescription: string;
  county: string;
  parcelId: string;
  owner: string;
  // Power Infrastructure
  iso: string;               // RTO/ISO
  utilityTerritory: string;
  tsp: string;               // Transmission Service Provider
}

export interface AppraisalResult {
  currentValueLow: number;        // acres × ppaLow
  currentValueHigh: number;       // acres × ppaHigh
  buildCost: number;              // from cost curve
  buildCostPerMW: number;         // buildCost / mw
  replacementCost: number;        // buildCost × 1.5
  replacementCostPerMW: number;   // replacementCost / mw
  energizedValue: number;          // midpoint currentValue + replacementCost
  valueCreated: number;            // energizedValue - midpoint currentValue
  returnMultiple: number;          // energizedValue / midpoint currentValue
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
