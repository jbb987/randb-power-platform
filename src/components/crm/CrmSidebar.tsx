export type CrmView = 'pipeline' | 'pool';

interface Props {
  view: CrmView;
  onViewChange: (view: CrmView) => void;
  onCreateLead: () => void;
  pipelineCount: number;
  poolCount: number;
}

export default function CrmSidebar({
  view,
  onViewChange,
  onCreateLead,
  pipelineCount,
  poolCount,
}: Props) {
  const menuItems: { id: CrmView; label: string; count: number; icon: React.ReactNode }[] = [
    {
      id: 'pipeline',
      label: 'My Pipeline',
      count: pipelineCount,
      icon: (
        <svg
          className="h-4.5 w-4.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.792 2.938A49.069 49.069 0 0112 2.25c2.797 0 5.54.236 8.209.688a1.857 1.857 0 011.541 1.836v1.044a3 3 0 01-.879 2.121l-6.182 6.182a1.5 1.5 0 00-.439 1.061v2.927a3 3 0 01-1.658 2.684l-1.757.878A.75.75 0 019.75 21v-5.818a1.5 1.5 0 00-.44-1.06L3.13 7.938A3 3 0 012.25 5.818V4.774c0-.897.64-1.683 1.542-1.836z"
          />
        </svg>
      ),
    },
    {
      id: 'pool',
      label: 'Prospects',
      count: poolCount,
      icon: (
        <svg
          className="h-4.5 w-4.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
          />
        </svg>
      ),
    },
  ];

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col gap-1">
      {/* Navigation */}
      <nav className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
              view === item.id
                ? 'bg-[#ED202B]/10 text-[#ED202B]'
                : 'text-[#201F1E] hover:bg-stone-50'
            }`}
          >
            <span className={view === item.id ? 'text-[#ED202B]' : 'text-[#7A756E]'}>
              {item.icon}
            </span>
            <span className="flex-1 text-left">{item.label}</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                view === item.id ? 'bg-[#ED202B]/20 text-[#ED202B]' : 'bg-stone-100 text-[#7A756E]'
              }`}
            >
              {item.count}
            </span>
          </button>
        ))}
      </nav>

      {/* Actions */}
      <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-3 flex flex-col gap-2 mt-1">
        <button
          onClick={onCreateLead}
          className="w-full flex items-center justify-center gap-2 bg-[#ED202B] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#9B0E18] transition"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Lead
        </button>
      </div>
    </aside>
  );
}
