import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import AdminStats from '../components/crm/AdminStats';
import type { Lead } from '../types';
import { subscribeLeads } from '../lib/leads';

export default function SalesAdminDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to ALL leads (admin tool — no filtering)
  useEffect(() => {
    const unsub = subscribeLeads(
      (remoteLeads) => {
        setLeads(remoteLeads);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="py-2">
        <div className="mb-5">
          <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">Sales Dashboard</h2>
          <p className="text-sm text-[#7A756E] mt-0.5">Performance overview across all salespeople</p>
        </div>
        <AdminStats leads={leads} />
      </main>
    </Layout>
  );
}
