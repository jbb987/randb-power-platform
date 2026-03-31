/**
 * Types for cached infrastructure data stored in Firebase Firestore.
 *
 * These mirror external API data but are flattened for efficient
 * Firestore storage and querying (no nested geometry objects).
 */

import type { Timestamp } from 'firebase/firestore';

// ── Cached Power Plant ─────────────────────────────────────────────────────

export interface CachedPowerPlant {
  id: string;               // Firestore doc ID (generated)
  name: string;
  operator: string;
  primarySource: string;     // e.g. "Solar", "Natural Gas", "Wind"
  capacityMW: number;
  status: string;            // 'active' | 'planned' | 'retired'
  lat: number;
  lng: number;
}

// ── Cached Substation ──────────────────────────────────────────────────────

export interface CachedSubstation {
  id: string;
  name: string;
  owner: string;
  maxVoltKV: number;
  minVoltKV: number;
  status: string;            // 'active' | 'planned' | 'retired'
  connectedLines: number;
  lat: number;
  lng: number;
}

// ── EIA State Data ─────────────────────────────────────────────────────────

export interface EiaStateData {
  state: string;             // 2-letter abbreviation
  electricityPrices: {
    commercial: number;      // cents/kWh
    industrial: number;      // cents/kWh
    allSectors: number;      // cents/kWh
  };
  demandMW: number;          // average demand in MW
  capacityFactors: Record<string, number>; // source name → capacity factor (0-1)
}

// ── Solar/Wind State Average ───────────────────────────────────────────────

export interface SolarStateAverage {
  state: string;             // 2-letter abbreviation
  ghi: number;               // Global Horizontal Irradiance (kWh/m²/day)
  dni: number;               // Direct Normal Irradiance / lat-tilt (kWh/m²/day)
  windSpeed: number;         // m/s (0 if not available)
}

// ── Infrastructure Refresh Log ─────────────────────────────────────────────

export interface InfraRefreshLog {
  lastRefreshedAt: Timestamp | number;
  recordCounts: {
    powerPlants: number;
    substations: number;
    eiaStates: number;
    solarStates: number;
  };
}

// ── Bounding box for geo queries ───────────────────────────────────────────

export interface GeoBBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}
