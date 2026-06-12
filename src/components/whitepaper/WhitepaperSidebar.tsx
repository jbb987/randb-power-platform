import { useNavigate } from 'react-router-dom';
import { WHITEPAPER_GROUPS } from '../../content/whitepaper/registry';

interface Props {
  activeId: string;
}

/**
 * Docs-style left navigation. Desktop: sticky grouped link list. The mobile
 * counterpart (a select) lives in WhitepaperTool so the sidebar can stay
 * hidden entirely below lg.
 */
export default function WhitepaperSidebar({ activeId }: Props) {
  const navigate = useNavigate();

  return (
    <nav aria-label="Whitepaper sections" className="space-y-6">
      {WHITEPAPER_GROUPS.map((group) => (
        <div key={group.title}>
          <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-[#7A756E]">
            {group.title}
          </h3>
          <ul className="space-y-0.5">
            {group.sections.map((section) => {
              const active = section.id === activeId;
              return (
                <li key={section.id}>
                  <button
                    onClick={() => navigate(`/whitepaper/${section.id}`)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${
                      active
                        ? 'bg-[#ED202B]/[0.07] font-medium text-[#ED202B]'
                        : 'text-[#3F3C38] hover:bg-[#201F1E]/[0.04] hover:text-[#201F1E]'
                    }`}
                  >
                    {section.title}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
