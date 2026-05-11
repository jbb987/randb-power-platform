import { useState } from 'react';
import Layout from '../components/Layout';

type TaskTab = 'timeline' | 'giant-list' | 'my-stuff';

const TABS: { id: TaskTab; label: string; sub: string }[] = [
  { id: 'timeline', label: 'Timeline', sub: "The company's week — milestones, events, meetings." },
  {
    id: 'giant-list',
    label: 'Giant List',
    sub: "Everyone's actions — planned, in progress, done.",
  },
  { id: 'my-stuff', label: 'My Stuff', sub: 'Your work today and the week ahead.' },
];

export default function TaskTool() {
  const [tab, setTab] = useState<TaskTab>('my-stuff');
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <Layout>
      <main className="py-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="font-heading text-2xl font-semibold text-[#201F1E]">Task</h1>
          <p className="text-sm text-[#7A756E] mt-0.5">
            Your work, the team's work, and the company's week — in one place.
          </p>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-[#D8D5D0]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-[#ED202B] text-[#ED202B]'
                  : 'border-transparent text-[#7A756E] hover:text-[#201F1E]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — stubs until later PRs fill these in. */}
        <div className="rounded-xl border border-[#D8D5D0] bg-white p-10 text-center">
          <p className="font-heading text-lg text-[#201F1E]">Coming soon</p>
          <p className="text-sm text-[#7A756E] mt-1">{active.sub}</p>
        </div>
      </main>
    </Layout>
  );
}
