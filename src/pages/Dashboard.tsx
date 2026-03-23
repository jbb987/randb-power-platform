import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const tools = [
  {
    id: 'valuator',
    name: 'Site Valuator',
    description: 'Evaluate site value based on power capacity and land comps',
    path: '/valuator',
  },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#E8E6E3]">
      {/* Platform header */}
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <img
              src={import.meta.env.BASE_URL + 'logo.svg'}
              alt="R&B Power"
              className="h-7 w-7"
            />
            <span className="font-heading text-base font-semibold text-[#201F1E]">
              R&B Power
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#7A756E] hidden sm:inline">
              {user?.email}
            </span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tool cards grid */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="font-heading text-lg font-semibold text-[#201F1E] mb-4">Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => navigate(tool.path)}
              className="text-left bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#C1121F]/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#C1121F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#201F1E]">{tool.name}</h3>
                  <p className="text-xs text-[#7A756E] mt-0.5 leading-relaxed">{tool.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
