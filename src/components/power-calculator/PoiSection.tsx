interface Props {
  nearestPoiName: string;
  nearestPoiDistMi: number;
  className?: string;
}

const readOnlyClass =
  'rounded-lg border border-[#D8D5D0] bg-[#F5F4F2] px-3 py-2.5 text-sm text-[#201F1E]';

export default function PoiSection({ nearestPoiName, nearestPoiDistMi, className }: Props) {
  return (
    <div className={className ?? 'grid grid-cols-1 md:grid-cols-2 gap-5 mt-5'}>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[#7A756E]">Nearest Point of Interconnection</span>
        <div className={readOnlyClass}>{nearestPoiName || 'Not Available'}</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[#7A756E]">Distance to POI</span>
        <div className={readOnlyClass}>{nearestPoiDistMi > 0 ? `${nearestPoiDistMi.toFixed(1)} mi` : '\u2014'}</div>
      </div>
    </div>
  );
}
