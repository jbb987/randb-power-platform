import { AnimatePresence } from 'framer-motion';
import { useValuation } from '../hooks/useValuation';
import { useSites } from '../hooks/useSites';
import Layout from '../components/Layout';
import Header from '../components/Header';
import PresentationView from '../components/PresentationView';
import SetupPanel from '../components/SetupPanel';
import SiteSwitcher from '../components/SiteSwitcher';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const emptyInputs = {
  id: '',
  siteName: '',
  totalAcres: 0,
  currentPPA: 0,
  mw: 50,
  parcelId: '',
  substationName: '',
  county: '',
};

export default function ValuatorTool() {
  const {
    sites,
    activeSite,
    activeId,
    loading,
    updateInputs,
    updateMW,
    createSite,
    deleteSite,
    switchSite,
  } = useSites();

  const [setupOpen, setSetupOpen] = useState(false);
  const inputs = activeSite?.inputs ?? emptyInputs;
  const result = useValuation(inputs);
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Auto-create first site if database is empty
  useEffect(() => {
    if (!loading && sites.length === 0) {
      createSite('New Site');
    }
  }, [loading, sites.length, createSite]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#C1121F]" />
            <span className="text-sm text-[#7A756E]">Loading sites...</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Top bar with back + logout */}
      <div className="no-print flex items-center justify-between py-2 px-1">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </button>
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

      <Header
        onToggleSetup={() => setSetupOpen(!setupOpen)}
        isSetupOpen={setupOpen}
      />

      <SiteSwitcher
        sites={sites}
        activeId={activeId}
        onSwitch={switchSite}
        onCreate={createSite}
        onDelete={deleteSite}
      />

      <PresentationView
        inputs={inputs}
        result={result}
        onMWChange={updateMW}
        onSiteNameChange={(name) => updateInputs({ ...inputs, siteName: name })}
      />

      {/* Setup Panel overlay */}
      <AnimatePresence>
        {setupOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/20 z-40"
              onClick={() => setSetupOpen(false)}
              aria-label="Close setup panel"
              role="button"
              tabIndex={-1}
            />
            <SetupPanel
              inputs={inputs}
              onChange={updateInputs}
              onClose={() => setSetupOpen(false)}
            />
          </>
        )}
      </AnimatePresence>
    </Layout>
  );
}
