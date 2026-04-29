import type { NearbyPowerPlant } from '../../types';
import CollapsibleSection from './CollapsibleSection';

interface Props {
  plants: NearbyPowerPlant[];
  hasRunAnalysis: boolean;
  collapsible?: boolean;
}

const thClass = 'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] pb-2';
const tdClass = 'py-1.5 text-sm text-[#201F1E]';

export default function PowerPlantsTable({ plants, hasRunAnalysis, collapsible = true }: Props) {
  if (plants.length === 0 && hasRunAnalysis) {
    return (
      <CollapsibleSection title="Nearby Power Plants" count={0} collapsible={collapsible}>
        <p className="text-sm text-[#7A756E] italic">Not Available — no power plants found within the search radius.</p>
      </CollapsibleSection>
    );
  }

  if (plants.length === 0) return null;

  return (
    <CollapsibleSection title="Nearby Power Plants" count={plants.length} collapsible={collapsible}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-[#D8D5D0]">
              <th className={thClass}>Name</th>
              <th className={thClass}>Operator</th>
              <th className={thClass}>Source</th>
              <th className={thClass}>Capacity</th>
              <th className={thClass}>Status</th>
              <th className={`${thClass} text-right`}>Distance</th>
            </tr>
          </thead>
          <tbody>
            {plants.map((plant, i) => (
              <tr key={i} className="border-b border-[#D8D5D0]/50">
                <td className={`${tdClass} font-medium`}>{plant.name || '\u2014'}</td>
                <td className={tdClass}>{plant.operator || '\u2014'}</td>
                <td className={tdClass}>{plant.primarySource || '\u2014'}</td>
                <td className={`${tdClass} tabular-nums`}>
                  {plant.capacityMW > 0 ? `${plant.capacityMW} MW` : '\u2014'}
                </td>
                <td className={tdClass}>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    plant.status === 'OP'
                      ? 'bg-green-50 text-green-700'
                      : plant.status?.toUpperCase() === 'NOT AVAILABLE'
                        ? 'bg-blue-50 text-blue-700'
                        : plant.status
                          ? 'bg-red-50 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                  }`}>
                    {plant.status?.toUpperCase() === 'NOT AVAILABLE' ? 'Capacity Available' : plant.status || '\u2014'}
                  </span>
                </td>
                <td className={`${tdClass} text-right tabular-nums`}>{plant.distanceMi > 0 ? `${plant.distanceMi.toFixed(1)} mi` : '\u2014'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
