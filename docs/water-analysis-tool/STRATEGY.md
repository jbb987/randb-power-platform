# R&B Power Platform — Water Analysis Tool Build Plan

## 1. Context & Objective

R&B Power's PIDDR reports include a Section 8: Water and Wastewater that is currently empty across all reports. The goal is to build a standalone water analysis tool that:

- Works for any US site (address or coordinates)
- Provides comprehensive, primary-source water data for power infrastructure due diligence
- Can be used independently OR combined into the full PIDDR report
- Matches or exceeds the quality of competitor reports

Target use cases: 100MW+ data centers, HPC facilities, crypto mining, industrial loads — all of which have significant water requirements for cooling (evaporative cooling can use 1-3M gallons/day for a 100MW facility).

## 2. Competitor Baseline (EnergySAM)

Their water section covers 5 subsections:

- GCD Jurisdiction
- Production Limits
- Aquifer Data (formation, thickness, TDS, modeled available GW)
- Regional Water Supply Context
- Cooling Strategy Recommendation

Their gaps (where R&B differentiates):

- No flood zone analysis (FEMA data)
- No surface water assessment
- No municipal water supply evaluation
- No drought risk / climate projection data
- No wastewater discharge analysis
- No wetlands / environmental water constraints
- No water quality detail beyond TDS
- No water pricing / cost modeling

## 3. Data Categories (Prioritized)

### Tier 1 — MUST HAVE

A. Groundwater Assessment — GCD jurisdiction, permitted production limits, aquifer ID, water quality, modeled available GW
B. Flood Risk — FEMA flood zone, Base Flood Elevation, 500-year floodplain
C. Surface Water — Nearest streams, USGS gage data, upstream basin
D. Municipal Water Supply — Nearest utility, treatment plant capacity, connection feasibility
E. Regional Water Planning — State water plan region, projected supply vs demand
F. Drought Risk — US Drought Monitor, historical PDSI, climate projections

### Tier 2 — SHOULD HAVE

G. Water Quality Detail — Full chemistry for cooling (TDS, hardness, pH, alkalinity, silica, chlorides, sulfates)
H. Wastewater & Discharge — Nearest WWTP, NPDES permits, ZLD considerations
I. Environmental Constraints — NWI wetlands, Sole Source Aquifer, ESA Section 7

### Tier 3 — NICE TO HAVE

J. Water Cost Modeling — Utility rates, annual cost estimates, source comparison
K. Cooling Strategy Analysis — Recommended cooling tech, consumption estimates, storage

## 4. APIs & Data Sources

### Already in platform (reusable):

- ArcGIS Geocoding — address to coordinates
- Census TIGER — state/county detection
- FCC Census Block — FIPS codes for drought lookups

### New APIs to integrate:

Priority 1 (No auth, CORS-friendly):

- FEMA NFHL (hazards.fema.gov) — flood zone, BFE at a point — ArcGIS REST
- USGS NLDI (api.water.usgs.gov/nldi/) — nearest stream, upstream basin, linked gages — GeoJSON
- NWI Wetlands (fwspublicservices.wim.usgs.gov) — wetland features — ArcGIS REST

Priority 2 (Free API key):

- USGS Modern API (api.waterdata.usgs.gov) — groundwater levels, streamflow, water quality — Free key, OGC/GeoJSON
- EPA ECHO (echo.epa.gov) — discharge permits, compliance — REST/JSON
- EPA WATERS/ATTAINS — impaired waters, TMDLs

Priority 3 (Needs proxy):

- NOAA CDO — historical precipitation — Free key
- US Drought Monitor — weekly drought by county
- NWS API (api.weather.gov) — precipitation forecasts
- USDA Soil Data — hydrologic soil group
- Overpass API — water infrastructure from OSM

## 5. Technical Architecture

Follows existing platform pattern:

```
src/
  lib/waterAnalysis.ts              — API fetch logic (parallel queries)
  lib/waterAnalysis.types.ts        — TypeScript interfaces
  hooks/useWaterAnalysis.ts         — State management
  tools/WaterAnalysisTool.tsx       — Tool UI
  components/water/
    WaterReport.tsx                 — Main report container
    FloodZoneSection.tsx            — FEMA flood analysis
    GroundwaterSection.tsx          — Aquifer & GCD data
    SurfaceWaterSection.tsx         — Streams, flow data
    DroughtRiskSection.tsx          — Drought monitor & climate
    WetlandsSection.tsx             — NWI features
    WaterQualitySection.tsx         — Chemistry data
    WastewaterSection.tsx           — Discharge & permits
    WaterSummary.tsx                — Executive summary with risk flags
```

Verification statuses per data point: VERIFIED, PARTIAL, NOT AVAILABLE, ACTION REQUIRED

## 6. Build Phases

### Phase 1: Core MVP (1-2 days)

- FEMA flood zone lookup
- USGS NLDI stream/basin delineation
- NWI wetlands check
- Basic report layout with risk flags

### Phase 2: Groundwater & Drought (2-3 days)

- USGS groundwater levels and quality
- US Drought Monitor integration
- Historical precipitation from NOAA
- GCD jurisdiction identification

### Phase 3: Water Supply & Discharge (2-3 days)

- EPA ECHO discharge permits
- Municipal water infrastructure proximity
- Regional water plan references
- Water quality detail for cooling

### Phase 4: Premium Analysis (3-5 days)

- Cooling strategy recommendation engine
- Water cost modeling
- Full PIDDR Section 8 auto-population
- PDF export for standalone reports

## 7. Data Quality Principles

- Primary sources only (FEMA, USGS, EPA, state agencies)
- Verification status on every data point
- Use USGS Modern API (legacy retiring early 2027)
- Conservative risk flagging
- Manual verification prompts for non-automatable data
