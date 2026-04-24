import { COMPANY_TAG_COLORS, type CompanyTag } from '../../types';

export default function TagChip({ tag, size = 'sm' }: { tag: CompanyTag; size?: 'xs' | 'sm' }) {
  const color = COMPANY_TAG_COLORS[tag];
  const padding = size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center ${padding} rounded-full font-medium`}
      style={{ backgroundColor: `${color}1A`, color }}
    >
      {tag}
    </span>
  );
}
