import { useState } from 'react';
import Layout from '../components/Layout';
import CrmSidebar, { type CrmView } from '../components/crm/CrmSidebar';
import LeadTable from '../components/crm/LeadTable';
import LeadDetail from '../components/crm/LeadDetail';
import LeadForm from '../components/crm/LeadForm';
import BulkUpload from '../components/crm/BulkUpload';
import CrmStats from '../components/crm/CrmStats';
import CrmArchive from '../components/crm/CrmArchive';
import { useLeads } from '../hooks/useLeads';
import { useAuth } from '../hooks/useAuth';
import { useUsers } from '../hooks/useUsers';

export default function SalesCrmTool() {
  const { leads, loading, createLead, createLeadsBulk, updateStatus, updateLead, addNote, removeLead, seedDemoLeads } = useLeads();
  const { user, role } = useAuth();
  const { users } = useUsers();
  const [view, setView] = useState<CrmView>('fresh');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;
  const displayName = user?.email?.split('@')[0] || 'there';

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
    <Layout fullWidth>
      <main className="py-2">
        {/* Header with greeting */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">Leads</h2>
            <p className="text-sm text-[#7A756E] mt-0.5">Welcome back, <span className="font-medium text-[#201F1E]">{displayName}</span></p>
          </div>
          {leads.length === 0 && (
            <button
              onClick={seedDemoLeads}
              className="text-sm font-medium text-[#ED202B] border border-[#ED202B] px-4 py-2 rounded-lg hover:bg-[#ED202B]/5 transition"
            >
              Load Demo Data
            </button>
          )}
        </div>

        <div className="flex gap-5 items-start">
          <CrmSidebar
            view={view}
            onViewChange={(v) => { setView(v); setSelectedLeadId(null); }}
            onCreateLead={() => setShowForm(true)}
            onBulkUpload={() => setShowBulkUpload(true)}
            leads={leads}
          />

          {/* Main content area */}
          {view === 'fresh' && (
            <LeadTable
              leads={leads}
              selectedLeadId={selectedLeadId}
              onSelectLead={setSelectedLeadId}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          )}

          {view === 'archive' && (
            <CrmArchive
              leads={leads}
              onSelectLead={setSelectedLeadId}
            />
          )}

          {view === 'stats' && (
            <CrmStats leads={leads} />
          )}
        </div>
      </main>

      {/* Modals */}
      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          onUpdateStatus={updateStatus}
          onUpdateLead={updateLead}
          onAddNote={addNote}
          onClose={() => setSelectedLeadId(null)}
          onDelete={removeLead}
          users={users}
          isAdmin={role === 'admin'}
        />
      )}

      {showForm && (
        <LeadForm
          onSubmit={createLead}
          onClose={() => setShowForm(false)}
          users={users}
          isAdmin={role === 'admin'}
        />
      )}

      {showBulkUpload && (
        <BulkUpload
          onUpload={createLeadsBulk}
          onClose={() => setShowBulkUpload(false)}
        />
      )}
    </Layout>
  );
}
