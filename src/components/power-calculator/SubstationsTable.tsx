import type { NearbySubstation } from '../../types';
import CollapsibleSection from './CollapsibleSection';

interface Props {
  substations: NearbySubstation[];
  hasRunAnalysis: boolean;
  collapsible?: boolean;
}

const thClass = 'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] pb-2';
const tdClass = 'py-1.5 text-sm text-[#201F1E]';

export default function SubstationsTable({ substations, hasRunAnalysis, collapsible = true }: Props) {
  if (substations.length === 0 && hasRunAnalysis) {
    return (
      <CollapsibleSection title="Nearby Substations" count={0} collapsible={collapsible}>
        <p className="text-sm text-[#7A756E] italic">Not Available — no substations found within the search radius.</p>
      </CollapsibleSection>
    );
  }

  if (substations.length === 0) return null;

  return (
    <CollapsibleSection title="Nearby Substations" count={substations.length} collapsible={collapsible}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-[#D8D5D0]">
              <th className={thClass}>Name</th>
              <th className={thClass}>Owner</th>
              <th className={thClass}>Voltage (kV)</th>
              <th className={thClass}>Lines</th>
              <th className={thClass}>Status</th>
              <th className={`${thClass} text-right`}>Distance</th>
            </tr>
          </thead>
          <tbody>
            {substations.map((sub, i) => (
              <tr key={i} className="border-b border-[#D8D5D0]/50">
                <td className={`${tdClass} font-medium`}>{sub.name || '\u2014'}</td>
                <td className={tdClass}>{sub.owner || '\u2014'}</td>
                <td className={tdClass}>
                  {sub.minVolt > 0 && sub.maxVolt > 0
                    ? `${sub.minVolt}\u2013${sub.maxVolt}`
                    : sub.maxVolt > 0
                      ? String(sub.maxVolt)
                      : '\u2014'}
                </td>
                <td className={tdClass}>{sub.lines || '\u2014'}</td>
                <td className={tdClass}>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    sub.status === 'IN SERVICE'
                      ? 'bg-green-50 text-green-700'
                      : sub.status?.toUpperCase() === 'NOT AVAILABLE'
                        ? 'bg-blue-50 text-blue-700'
                        : sub.status
                          ? 'bg-red-50 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                  }`}>
                    {sub.status?.toUpperCase() === 'NOT AVAILABLE' ? 'Capacity Available' : sub.status || '\u2014'}
                  </span>
                </td>
                <td className={`${tdClass} text-right tabular-nums`}>{sub.distanceMi > 0 ? `${sub.distanceMi.toFixed(1)} mi` : '\u2014'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
