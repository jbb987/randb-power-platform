import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import FolderBrowser from '../components/crm-directory/FolderBrowser';
import PreConHeader from '../components/precon/PreConHeader';
import PreConAppraisalSummary from '../components/precon/PreConAppraisalSummary';
import PreConStatusCard from '../components/precon/PreConStatusCard';
import PreConLoaTimeline from '../components/precon/PreConLoaTimeline';
import PreConDocumentChecklist from '../components/precon/PreConDocumentChecklist';
import { useAuth } from '../hooks/useAuth';
import { useCompany } from '../hooks/useCompanies';
import { usePreConSite } from '../hooks/usePreConSites';
import { usePreConPermissions } from '../hooks/usePreConPermissions';
import {
  advanceLoaStatus,
  archivePreConSite,
  saveSiteStatus,
  setChecklistItemStatus,
  setLoaStepDate,
  updatePreConSite,
} from '../lib/preConSites';
import { suggestGradeFromAppraisal, appendLoaStep } from '../lib/preConWorkflow';
import { getSiteEntry, updateSiteEntry } from '../lib/siteRegistry';
import type {
  PreConChecklistItemStatus,
  PreConGrade,
  PreConLoaStatus,
  PreConUtility,
  SiteRegistryEntry,
} from '../types';

export default function PreConDetail() {
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const { user } = useAuth();
  const { site, loading } = usePreConSite(siteId);
  const { company } = useCompany(site?.companyId);
  const perms = usePreConPermissions(site);

  const [registryEntry, setRegistryEntry] = useState<SiteRegistryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pull the linked SiteRegistryEntry once we know the id, so the appraisal
  // summary can render its current numbers. Re-fetches when the link changes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!site?.siteRegistryId) {
        setRegistryEntry(null);
        return;
      }
      const entry = await getSiteEntry(site.siteRegistryId);
      if (!cancelled) setRegistryEntry(entry);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [site?.siteRegistryId]);

  // Keep gradeSuggested in sync with the latest appraisal numbers — if the
  // user re-runs the appraisal in Site Analyzer and the multiple shifts, the
  // suggestion should update next time they open this page.
  useEffect(() => {
    if (!site || !registryEntry?.appraisalResult) return;
    const suggested = suggestGradeFromAppraisal(registryEntry.appraisalResult);
    if (suggested && site.gradeSuggested !== suggested) {
      void updatePreConSite(site.id, { gradeSuggested: suggested });
    }
  }, [site, registryEntry?.appraisalResult]);

  // LOA timeline unlocks once the engineer's verdict is in and the site is
  // a viable deal — i.e. graded GO or CONDITIONAL GO. NO GO keeps it locked.
  const loaUnlocked = useMemo(
    () => site?.grade === 'go' || site?.grade === 'conditional-go',
    [site?.grade],
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
        </div>
      </Layout>
    );
  }

  if (!site) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-[#7A756E]">Large Load Request site not found.</p>
          <button
            onClick={() => navigate('/llr')}
            className="mt-4 text-sm font-medium text-[#ED202B] hover:underline"
          >
            Back to Large Load Request
          </button>
        </div>
      </Layout>
    );
  }

  async function handleSaveStatus(input: {
    engineerReviewerId: string | undefined;
    verifiedMW: number | undefined;
    grade: PreConGrade | undefined;
  }) {
    if (!site || !user) return;
    await saveSiteStatus(site.id, site.siteRegistryId, {
      ...input,
      userId: user.uid,
      previous: {
        engineerReviewerId: site.engineerReviewerId,
        engineerVerifiedMW: site.engineerVerifiedMW,
        grade: site.grade,
        engineerReviewStatus: site.engineerReviewStatus,
      },
    });
  }

  async function handleAdvanceLoa(next: PreConLoaStatus) {
    if (!site || !user) return;
    const steps = appendLoaStep(site, next, user.uid);
    await advanceLoaStatus(site.id, next, steps);
  }

  async function handleSetStepDate(status: PreConLoaStatus, dateMs: number | null) {
    if (!site) return;
    await setLoaStepDate(site.id, status, dateMs);
  }

  async function handleSetChecklistStatus(itemId: string, status: PreConChecklistItemStatus) {
    if (!site || !user) return;
    await setChecklistItemStatus(site.id, itemId, status, user.uid);
  }

  async function handleSetUtility(utility: PreConUtility) {
    if (!site) return;
    await updatePreConSite(site.id, { utility });
  }

  async function handleArchive() {
    if (!site) return;
    if (
      !window.confirm(
        `Send "${site.name}" back to the Site Analyzer? Its LLR tracking will be cleared. The Site Analyzer site stays intact.`,
      )
    )
      return;
    try {
      await archivePreConSite(site.id);
      navigate('/llr', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send back.');
    }
  }

  async function handleSaveHeader(updates: { name?: string; utilityPlatformUrl?: string }) {
    if (!site) return;
    await updatePreConSite(site.id, updates);
    // Mirror the name to the linked registry entry so Site Analyzer + dashboards
    // see the new title. The utility URL is pre-con-only and doesn't propagate.
    if (updates.name !== undefined) {
      await updateSiteEntry(site.siteRegistryId, { name: updates.name });
    }
  }

  return (
    <Layout>
      <main className="py-6 space-y-5">
        <PreConHeader
          site={site}
          company={company}
          canManageSite={perms.canManageSite}
          onSave={handleSaveHeader}
          onArchive={handleArchive}
        />

        <PreConAppraisalSummary
          registryEntry={registryEntry}
          siteRegistryId={site.siteRegistryId}
          preConSiteId={site.id}
        />

        <PreConStatusCard
          site={site}
          canEditStatus={perms.canEditStatus}
          onSave={handleSaveStatus}
        />

        <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
          <h2 className="font-heading text-lg font-semibold text-[#201F1E] mb-3">
            Large Load Request process
          </h2>
          <PreConLoaTimeline
            site={site}
            canManageLoa={perms.canManageLoa}
            loaUnlocked={loaUnlocked}
            onAdvance={handleAdvanceLoa}
            onSetStepDate={handleSetStepDate}
          />
        </div>

        <PreConDocumentChecklist
          site={site}
          canEdit={perms.canManageLoa}
          onSetStatus={handleSetChecklistStatus}
          onSetUtility={handleSetUtility}
        />

        <FolderBrowser
          companyId={site.companyId}
          projectId={site.projectId}
          rootFolderId={site.rootFolderId ?? `precon_${site.id}_root`}
          title="Large Load Request documents"
          description=""
        />

        {error && (
          <div className="bg-[#ED202B]/5 border border-[#ED202B]/30 rounded-lg p-3">
            <p className="text-sm text-[#ED202B]">{error}</p>
          </div>
        )}
      </main>
    </Layout>
  );
}
