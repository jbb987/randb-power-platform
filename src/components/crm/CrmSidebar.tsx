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
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
    {
      id: 'pool',
      label: 'Pool',
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
            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
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
