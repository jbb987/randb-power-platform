interface Props {
  coordinates: string;
}

function parseCoordinates(coords: string | undefined): { lat: number; lng: number } | null {
  if (!coords || !coords.trim()) return null;
  const parts = coords.split(',').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export default function SiteMapCard({ coordinates }: Props) {
  const parsed = parseCoordinates(coordinates);

  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-5">
        Site Location
      </h3>

      {parsed ? (
        <div className="space-y-4">
          <div className="w-full overflow-hidden rounded-xl border border-[#D8D5D0]">
            <iframe
              title="Site location map"
              width="100%"
              height="350"
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
            className="inline-flex items-center gap-2 rounded-lg border border-[#D8D5D0] bg-white/80 px-4 py-2.5 text-sm font-medium text-[#201F1E] transition hover:border-[#ED202B]/40 hover:text-[#ED202B]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Zm7.25-.75a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V6.31l-5.47 5.47a.75.75 0 1 1-1.06-1.06l5.47-5.47H12.25a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
            </svg>
            Open in Google Maps
          </a>
        </div>
      ) : (
        <p className="text-sm text-[#7A756E]">
          Enter coordinates above to see the site on a map.
        </p>
      )}
    </div>
  );
}
