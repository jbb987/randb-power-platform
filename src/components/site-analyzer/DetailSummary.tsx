import type { SiteRegistryEntry } from '../../types';

interface Props {
  site: SiteRegistryEntry;
  companyName: string | null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-[#7A756E] sm:w-40 sm:shrink-0">
        {label}
      </span>
      <span className="text-sm text-[#201F1E] sm:text-right break-words">
        {children}
      </span>
    </div>
  );
}

/**
 * Read-only summary of a site's input fields. Rendered in view mode on the
 * detail page; replaced by DetailEditForm when editing.
 */
export default function DetailSummary({ site, companyName }: Props) {
  const coords = site.coordinates ? `${site.coordinates.lat.toFixed(5)}, ${site.coordinates.lng.toFixed(5)}` : 'Not set';
  const ppa =
    site.dollarPerAcreLow && site.dollarPerAcreHigh && site.dollarPerAcreLow !== site.dollarPerAcreHigh
      ? `$${site.dollarPerAcreLow.toLocaleString()} – $${site.dollarPerAcreHigh.toLocaleString()}/ac`
      : site.dollarPerAcreLow
        ? `$${site.dollarPerAcreLow.toLocaleString()}/ac`
        : null;

  return (
    <section className="bg-white rounded-2xl border border-[#D8D5D0] p-4 sm:p-5 mb-5">
      <h2 className="font-heading text-base font-semibold text-[#201F1E] mb-3">
        Site details
      </h2>

      <div className="divide-y divide-[#F0EEEB]">
        <Row label="Coordinates">{coords}</Row>
        {site.address && <Row label="Address">{site.address}</Row>}
        {site.acreage > 0 && <Row label="Acreage">{site.acreage.toLocaleString()} ac</Row>}
        {site.mwCapacity > 0 && <Row label="MW Capacity">{site.mwCapacity} MW</Row>}
        {ppa && <Row label="$/Acre">{ppa}</Row>}
        <Row label="Company">
          {companyName || <span className="italic text-[#7A756E]">Unlinked</span>}
        </Row>
        {site.priorUsage && <Row label="Prior Usage">{site.priorUsage}</Row>}
        {site.county && <Row label="County">{site.county}</Row>}
        {site.parcelId && <Row label="Parcel ID">{site.parcelId}</Row>}
        {site.legalDescription && <Row label="Legal Description">{site.legalDescription}</Row>}
      </div>
    </section>
  );
}
