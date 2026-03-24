import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

const tools = [
  {
    id: 'valuator',
    name: 'Site Valuator',
    description: 'Evaluate site value based on power capacity and land comps',
    path: '/valuator',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <Layout>
      <main className="py-6">
        <h2 className="font-heading text-2xl font-semibold text-[#201F1E] mb-6">Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => navigate(tool.path)}
              className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-6 text-left hover:shadow-md hover:border-[#C1121F]/30 transition group"
            >
              <div className="h-10 w-10 rounded-lg bg-[#C1121F]/10 flex items-center justify-center mb-4">
                <svg className="h-5 w-5 text-[#C1121F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-heading font-semibold text-[#201F1E] mb-1 group-hover:text-[#C1121F] transition">
                {tool.name}
              </h3>
              <p className="text-sm text-[#7A756E]">{tool.description}</p>
            </button>
          ))}
        </div>
      </main>
    </Layout>
  );
}
