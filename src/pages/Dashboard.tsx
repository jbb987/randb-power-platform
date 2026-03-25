import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types';

interface Tool {
  id: string;
  name: string;
  description: string;
  path: string;
  icon: string;
  roles: UserRole[];
}

const tools: Tool[] = [
  {
    id: 'site-appraiser',
    name: 'Site Appraiser',
    description: 'Appraise site value based on power capacity and land comps',
    path: '/site-appraiser',
    icon: 'bolt',
    roles: ['admin'],
  },
  {
    id: 'site-pipeline',
    name: 'Site Pipeline',
    description: 'Track and manage site requests through the pipeline',
    path: '/site-pipeline',
    icon: 'pipeline',
    roles: ['admin'],
  },
  {
    id: 'site-request-form',
    name: 'Submit Site Request',
    description: 'Submit new site requests with customer and address details',
    path: '/site-request/form',
    icon: 'clipboard',
    roles: ['admin', 'agent'],
  },
  {
    id: 'user-management',
    name: 'User Management',
    description: 'Manage platform users and their roles',
    path: '/user-management',
    icon: 'users',
    roles: ['admin'],
  },
];

function ToolIcon({ type }: { type: string }) {
  if (type === 'clipboard') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    );
  }
  if (type === 'pipeline') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    );
  }
  if (type === 'users') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { role } = useAuth();

  const visibleTools = tools.filter((t) => role && t.roles.includes(role));

  return (
    <Layout>
      <main className="py-6">
        <h2 className="font-heading text-2xl font-semibold text-[#201F1E] mb-6">Power Infrastructure Due Diligence Report</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleTools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => navigate(tool.path)}
              className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-6 text-left hover:shadow-md hover:border-[#ED202B]/30 transition group"
            >
              <div className="h-10 w-10 rounded-lg bg-[#ED202B]/10 flex items-center justify-center mb-4">
                <ToolIcon type={tool.icon} />
              </div>
              <h3 className="font-heading font-semibold text-[#201F1E] mb-1 group-hover:text-[#ED202B] transition">
                {tool.name}
              </h3>
              <p className="text-sm text-[#7A756E]">{tool.description}</p>
            </button>
          ))}

          {/* Placeholder — Land Analyzer (coming soon) */}
          {role === 'admin' && (
            <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-6 text-left opacity-75">
              <div className="flex items-start justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
                  <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-[#7A756E] bg-[#FAFAF9] rounded-full px-2.5 py-0.5">
                  Coming Soon
                </span>
              </div>
              <h3 className="font-heading font-semibold text-[#201F1E] mb-1">Land Analyzer</h3>
              <p className="text-sm text-[#7A756E]">Analyze land parcels and zoning data</p>
            </div>
          )}
        </div>
      </main>
    </Layout>
  );
}
