import { parseCoordinates } from '../../utils/parseCoordinates';

interface Props {
  coordinates: string;
}

export default function SiteOverviewSection({ coordinates }: Props) {
  const parsed = parseCoordinates(coordinates);

  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h2 className="font-heading text-base font-semibold text-[#201F1E]">
          Site Overview
        </h2>
      </div>

      {parsed ? (
        <div className="space-y-3">
          <div className="w-full overflow-hidden rounded-xl border border-[#D8D5D0]">
            <iframe
              title="Site location map"
              width="100%"
              height="300"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${parsed.lat},${parsed.lng}&t=k&z=15&output=embed`}
            />
          </div>
          <a
            href={`https://www.google.com/maps/@${parsed.lat},${parsed.lng},15z/data=!3m1!1e3`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#ED202B] hover:underline"
          >
            Open in Google Maps
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>
      ) : (
        <p className="text-sm text-[#7A756E]">
          No coordinates available to display map.
        </p>
      )}
    </div>
  );
}
