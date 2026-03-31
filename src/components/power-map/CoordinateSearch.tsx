import { useState, useCallback } from 'react';
import { parseCoordinates } from '../../utils/parseCoordinates';
import { geocodeAddress } from '../../lib/infraLookup';

interface CoordinateSearchProps {
  onSearch: (coords: { lat: number; lng: number }) => void;
  loading?: boolean;
  compact?: boolean;
}

export default function CoordinateSearch({ onSearch, loading, compact }: CoordinateSearchProps) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setError(null);
    setSearching(true);

    try {
      // Try parsing as coordinates first
      const coords = parseCoordinates(trimmed);
      if (coords) {
        onSearch(coords);
        setSearching(false);
        return;
      }

      // Fall back to address geocoding
      const geo = await geocodeAddress(trimmed);
      onSearch(geo);
    } catch {
      setError('Could not find that location. Try coordinates like "28.65, -98.84" or a US address.');
    } finally {
      setSearching(false);
    }
  }, [query, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  const isLoading = searching || loading;

  return (
    <div className={compact ? '' : 'mb-4'}>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="Coordinates (28.65, -98.84) or address..."
            className={`w-full bg-white border border-[#D8D5D0] rounded-lg text-sm text-[#201F1E] placeholder:text-[#7A756E]/60 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 outline-none transition ${
              compact ? 'px-3 py-1.5 text-xs' : 'px-3 py-2'
            }`}
            disabled={isLoading}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
          className={`bg-[#ED202B] text-white rounded-lg hover:bg-[#9B0E18] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center shrink-0 ${
            compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
          }`}
          title="Search location"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </button>
      </div>
      {error && (
        <p className="text-xs text-[#ED202B] mt-1.5">{error}</p>
      )}
    </div>
  );
}
