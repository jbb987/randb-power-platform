import { useState } from 'react';
import Layout from '../components/Layout';
import CrmSidebar, { type CrmView } from '../components/crm/CrmSidebar';
import LeadTable, { type LeadFilter } from '../components/crm/LeadTable';
import LeadDetail from '../components/crm/LeadDetail';
import LeadForm from '../components/crm/LeadForm';
import { useLeads } from '../hooks/useLeads';
import { useAuth } from '../hooks/useAuth';
import { useUsers } from '../hooks/useUsers';

export default function SalesCrmTool() {
  const {
    leads,
    loading,
    createLead,
    updateStatus,
    updateLead,
    addNote,
    removeLead,
    grabLead,
    dropLead,
    grabLeads,
    dropLeads,
    reassignLeads,
    seedDemoLeads,
  } = useLeads();
  const { user, role } = useAuth();
  const { users } = useUsers();
  const [view, setView] = useState<CrmView>('pipeline');
  const [statusFilter, setStatusFilter] = useState<LeadFilter>('all');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;
  const displayName = user?.email?.split('@')[0] || 'there';
  const isAdmin = role === 'admin';

  // Single grab/drop can lose a race (a lead changed owner first) → the Firestore
  // write rejects. Surface it instead of failing silently.
  const safeGrab = (id: string) =>
    grabLead(id).catch(() =>
      window.alert('Could not grab this lead — it may have just been taken by someone else.'),
    );
  const safeDrop = (id: string) =>
    dropLead(id).catch(() => window.alert('Could not return this lead to prospects.'));

  // Pool = unassigned leads anyone can grab. Pipeline = my owned leads (for an
  // admin: every assigned lead across all reps).
  const poolLeads = leads.filter((l) => !l.assignedTo);
  const myLeads = isAdmin
    ? leads.filter((l) => l.assignedTo)
    : leads.filter((l) => l.assignedTo === user?.uid);
  const shownLeads = view === 'pool' ? poolLeads : myLeads;

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
            <p className="text-sm text-[#7A756E] mt-0.5">
              Welcome back, <span className="font-medium text-[#201F1E]">{displayName}</span>
            </p>
          </div>
          {leads.length === 0 && (
            <button
              onClick={seedDemoLeads}
              className="text-sm font-medium bg-[#ED202B] text-white px-4 py-2 rounded-lg hover:bg-[#9B0E18] transition"
            >
              Load Demo Data
            </button>
          )}
        </div>

        <div className="flex gap-5 items-start">
          <CrmSidebar
            view={view}
            onViewChange={(v) => {
              setView(v);
              setSelectedLeadId(null);
            }}
            onCreateLead={() => setShowForm(true)}
            pipelineCount={myLeads.length}
            poolCount={poolLeads.length}
          />

          {/* Main content area — same table for both views; the Pool view adds a
              Grab action and the table never shows an Owner for pool rows. */}
          <LeadTable
            leads={shownLeads}
            selectedLeadId={selectedLeadId}
            onSelectLead={setSelectedLeadId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onGrab={view === 'pool' ? safeGrab : undefined}
            scopeKey={view}
            onBulkGrab={view === 'pool' ? grabLeads : undefined}
            onBulkDrop={view === 'pipeline' ? dropLeads : undefined}
            reassignUsers={
              isAdmin ? users.map((u) => ({ id: u.id, label: u.email.split('@')[0] })) : undefined
            }
            onBulkReassign={isAdmin ? reassignLeads : undefined}
          />
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
          onGrab={safeGrab}
          onDrop={(id) => {
            void safeDrop(id);
            setSelectedLeadId(null);
          }}
          users={users}
          isAdmin={isAdmin}
        />
      )}

      {showForm && (
        <LeadForm
          onSubmit={createLead}
          onClose={() => setShowForm(false)}
          users={users}
          isAdmin={isAdmin}
        />
      )}
    </Layout>
  );
}
