import type { NearbyLine } from '../../types';
import CollapsibleSection from './CollapsibleSection';

interface Props {
  lines: NearbyLine[];
  hasRunAnalysis: boolean;
  collapsible?: boolean;
}

const thClass = 'text-left text-[10px] font-semibold uppercase tracking-wider text-[#7A756E] pb-2';
const tdClass = 'py-1.5 text-sm text-[#201F1E]';

export default function TransmissionLinesTable({ lines, hasRunAnalysis, collapsible = true }: Props) {
  if (lines.length === 0 && hasRunAnalysis) {
    return (
      <CollapsibleSection title="Nearby Transmission Lines" count={0} collapsible={collapsible}>
        <p className="text-sm text-[#7A756E] italic">Not Available — no transmission lines found within the search radius.</p>
      </CollapsibleSection>
    );
  }

  if (lines.length === 0) return null;

  return (
    <CollapsibleSection title="Nearby Transmission Lines" count={lines.length} collapsible={collapsible}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-[#D8D5D0]">
              <th className={thClass}>Owner</th>
              <th className={thClass}>Voltage (kV)</th>
              <th className={thClass}>Class</th>
              <th className={thClass}>From</th>
              <th className={thClass}>To</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-b border-[#D8D5D0]/50">
                <td className={`${tdClass} font-medium`}>{line.owner || '\u2014'}</td>
                <td className={`${tdClass} tabular-nums`}>{line.voltage > 0 ? line.voltage : '\u2014'}</td>
                <td className={tdClass}>{line.voltClass || '\u2014'}</td>
                <td className={tdClass}>{line.sub1 || '\u2014'}</td>
                <td className={tdClass}>{line.sub2 || '\u2014'}</td>
                <td className={tdClass}>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    line.status === 'IN SERVICE'
                      ? 'bg-green-50 text-green-700'
                      : line.status?.toUpperCase() === 'NOT AVAILABLE'
                        ? 'bg-blue-50 text-blue-700'
                        : line.status
                          ? 'bg-red-50 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                  }`}>
                    {line.status?.toUpperCase() === 'NOT AVAILABLE' ? 'Capacity Available' : line.status || '\u2014'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
