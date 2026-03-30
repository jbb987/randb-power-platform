import type { MapPowerPlant } from '../../lib/powerMapData';
import { getSourceColor } from '../../lib/powerMapData';

interface PlantPopupProps {
  plant: MapPowerPlant;
  onClose: () => void;
}

export default function PlantPopup({ plant, onClose }: PlantPopupProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg border border-[#D8D5D0] p-3 min-w-[220px] max-w-[280px]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-heading font-semibold text-sm text-[#201F1E] leading-tight">
          {plant.name}
        </h4>
        <button
          onClick={onClose}
          className="text-[#7A756E] hover:text-[#201F1E] flex-shrink-0 -mt-0.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: getSourceColor(plant.primarySource) }}
          />
          <span className="text-xs text-[#7A756E]">{plant.primarySource}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[#7A756E]">Capacity</span>
          <span className="font-medium text-[#201F1E]">{plant.capacityMW.toLocaleString()} MW</span>
        </div>
        {plant.totalMW > 0 && plant.totalMW !== plant.capacityMW && (
          <div className="flex justify-between text-xs">
            <span className="text-[#7A756E]">Total MW</span>
            <span className="font-medium text-[#201F1E]">{plant.totalMW.toLocaleString()} MW</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-[#7A756E]">Operator</span>
          <span className="font-medium text-[#201F1E] text-right max-w-[150px] truncate" title={plant.operator}>
            {plant.operator}
          </span>
        </div>
      </div>
    </div>
  );
}
