import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import type { ToolId } from '../types';

interface Tool {
  id: ToolId | 'user-management';
  name: string;
  description: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
}

interface ToolSection {
  title: string;
  tools: Tool[];
}

const toolSections: ToolSection[] = [
  {
    title: 'Directory',
    tools: [
      {
        id: 'crm',
        name: 'Directory',
        description: 'Manage companies and people across every dimension',
        path: '/crm',
        icon: 'directory',
      },
    ],
  },
  {
    title: 'Power Infrastructure Due Diligence Report',
    tools: [
      {
        id: 'piddr',
        name: 'Infrastructure Report',
        description: '',
        path: '/power-infrastructure-report',
        icon: 'report',
      },
      {
        id: 'site-pipeline',
        name: 'Site Pipeline',
        description: '',
        path: '/site-pipeline',
        icon: 'pipeline',
      },
      {
        id: 'site-request-form',
        name: 'Submit Site Request',
        description: '',
        path: '/site-request/form',
        icon: 'clipboard',
      },
      {
        id: 'power-calculator',
        name: 'Power Calculator',
        description: '',
        path: '/power-calculator',
        icon: 'bolt',
      },
      {
        id: 'grid-power-analyzer',
        name: 'Grid Power Analyzer',
        description: '',
        path: '/grid-power-analyzer',
        icon: 'grid',
      },
      {
        id: 'water-analysis',
        name: 'Water Analysis',
        description: '',
        path: '/water-analysis',
        icon: 'water',
      },
      {
        id: 'gas-analysis',
        name: 'Gas Infrastructure Analysis',
        description: '',
        path: '/gas-analysis',
        icon: 'flame',
      },
      {
        id: 'broadband-lookup',
        name: 'Broadband Lookup',
        description: '',
        path: '/broadband-lookup',
        icon: 'wifi',
      },
      {
        id: 'site-appraiser',
        name: 'Site Appraiser',
        description: '',
        path: '/site-appraiser',
        icon: 'dollar',
      },
    ],
  },
  {
    title: 'Sales',
    tools: [
      {
        id: 'sales-crm',
        name: 'Leads',
        description: 'Manage and track sales leads through the outreach pipeline',
        path: '/sales-crm',
        icon: 'crm',
      },
      {
        id: 'sales-admin',
        name: 'Sales Dashboard',
        description: 'View sales performance and leaderboard across all salespeople',
        path: '/sales-admin',
        icon: 'chart',
        adminOnly: true,
      },
    ],
  },
  {
    title: 'Settings',
    tools: [
      {
        id: 'user-management',
        name: 'User Management',
        description: 'Manage platform users and their roles',
        path: '/user-management',
        icon: 'users',
        adminOnly: true,
      },
    ],
  },
];

function ToolIcon({ type }: { type: string }) {
  if (type === 'dollar') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v22m-5-4h7a4 4 0 004-4 4 4 0 00-4-4H9a4 4 0 01-4-4 4 4 0 014-4h7" />
      </svg>
    );
  }
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
  if (type === 'wifi') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
      </svg>
    );
  }
  if (type === 'grid') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    );
  }
  if (type === 'chart') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    );
  }
  if (type === 'crm') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    );
  }
  if (type === 'bolt') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    );
  }
  if (type === 'report') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (type === 'water') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.25C10.5 5.25 7.5 8.25 7.5 11.25a4.5 4.5 0 009 0c0-3-3-6-4.5-9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 18.75c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3-1.5 4.5 0" />
      </svg>
    );
  }
  if (type === 'flame') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    );
  }
  if (type === 'directory') {
    return (
      <svg className="h-5 w-5 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
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
  const { role, allowedTools } = useAuth();

  const isToolVisible = (tool: Tool) => {
    if (!role) return false;
    if (role === 'admin') return true;
    if (tool.adminOnly) return false;
    return allowedTools.includes(tool.id as ToolId);
  };

  return (
    <Layout>
      <main className="py-6 space-y-10">
        {toolSections.map((section) => {
          const visibleTools = section.tools.filter(isToolVisible);
          if (visibleTools.length === 0) return null;

          return (
            <section key={section.title}>
              <h2 className="font-heading text-2xl font-semibold text-[#201F1E] mb-6">{section.title}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {visibleTools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => navigate(tool.path)}
                    className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] px-4 py-3 text-left hover:shadow-md hover:border-[#ED202B]/30 transition group flex items-center gap-3"
                  >
                    <div className="h-9 w-9 rounded-lg bg-[#ED202B]/10 flex items-center justify-center shrink-0">
                      <ToolIcon type={tool.icon} />
                    </div>
                    <h3 className="font-heading font-semibold text-sm text-[#201F1E] group-hover:text-[#ED202B] transition">
                      {tool.name}
                    </h3>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </Layout>
  );
}
