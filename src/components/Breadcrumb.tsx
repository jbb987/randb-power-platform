import { Fragment } from 'react';
import { useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { useCompany, useCompanies } from '../hooks/useCompanies';
import { useContact } from '../hooks/useContacts';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useConstructionJob } from '../hooks/useConstructionJobs';
import { usePreConSite } from '../hooks/usePreConSites';
import { useOneLineDocument } from '../hooks/useOneLineDiagrams';
import {
  BAILEY_PROJECT_CONFIG,
  CONSTRUCTION_PROJECTS_CONFIG,
  JobToolConfigProvider,
  type JobToolConfig,
} from '../lib/jobToolConfig';

interface Segment {
  label: string;
  path?: string; // undefined = current page (not clickable)
}

/**
 * Hierarchy-based breadcrumb. Builds the ancestor trail from the current
 * pathname and the linked data (company for a contact, etc.) rather than
 * from how the user arrived. The breadcrumb is the same for a given page
 * regardless of navigation history.
 *
 * The last segment is always the current page, rendered muted and not
 * clickable. Every preceding segment is a link.
 *
 * Dispatcher: only the CRM and Site Analyzer routes need to read companies /
 * contacts / the site registry to label parent segments. Every other tool
 * route renders a "‹ Dashboard" stub. We split the component so that the
 * minimal variant doesn't mount full-collection onSnapshot listeners on
 * routes that won't use them — those listeners were doubling read volume on
 * Power Calculator, Water, Gas, Broadband, Site Appraiser, and Sales CRM.
 */
export default function Breadcrumb() {
  const { pathname } = useLocation();
  if (pathname === '/') return null;
  const needsData =
    pathname === '/crm' ||
    pathname.startsWith('/crm/') ||
    pathname === '/site-analyzer' ||
    pathname.startsWith('/site-analyzer/') ||
    pathname === BAILEY_PROJECT_CONFIG.routeBase ||
    pathname.startsWith(`${BAILEY_PROJECT_CONFIG.routeBase}/`) ||
    pathname === CONSTRUCTION_PROJECTS_CONFIG.routeBase ||
    pathname.startsWith(`${CONSTRUCTION_PROJECTS_CONFIG.routeBase}/`) ||
    pathname === '/llr' ||
    pathname.startsWith('/llr/') ||
    pathname === '/one-line-generator' ||
    pathname.startsWith('/one-line-generator/');
  // Resolve which job-tool config (if any) applies to this URL — the inner
  // `useConstructionJob` runs unconditionally, so we wrap the data variant in
  // the matching provider so the hook reads from the right Firestore
  // collection. Non-construction pages fall through to Bailey's config as a
  // harmless default (no jobId is passed in those cases).
  const jobConfig: JobToolConfig =
    pathname === CONSTRUCTION_PROJECTS_CONFIG.routeBase ||
    pathname.startsWith(`${CONSTRUCTION_PROJECTS_CONFIG.routeBase}/`)
      ? CONSTRUCTION_PROJECTS_CONFIG
      : BAILEY_PROJECT_CONFIG;
  if (!needsData) return <BreadcrumbMinimal />;
  return (
    <JobToolConfigProvider config={jobConfig}>
      <BreadcrumbWithData jobConfig={jobConfig} />
    </JobToolConfigProvider>
  );
}

function BreadcrumbMinimal() {
  const navigate = useNavigate();
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-3 flex-wrap">
      <button
        onClick={() => navigate('/')}
        aria-label="Back to Dashboard"
        title="Back to Dashboard"
        className="group h-8 w-8 rounded-full bg-white border border-[#D8D5D0] shadow-sm flex items-center justify-center text-[#7A756E] hover:text-[#ED202B] hover:border-[#ED202B]/30 hover:shadow transition shrink-0"
      >
        <svg
          className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <ol className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-sm min-w-0">
        <li className="truncate max-w-[180px] sm:max-w-[240px]">
          <button
            onClick={() => navigate('/')}
            className="text-[#7A756E] hover:text-[#ED202B] transition font-medium"
          >
            Dashboard
          </button>
        </li>
      </ol>
    </nav>
  );
}

function BreadcrumbWithData({ jobConfig }: { jobConfig: JobToolConfig }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const companyMatch = useMatch('/crm/companies/:id');
  const contactMatch = useMatch('/crm/people/:id');
  const siteIndexMatch = useMatch('/site-analyzer');
  const siteNewMatch = useMatch('/site-analyzer/new');
  const siteDetailMatch = useMatch('/site-analyzer/:siteId');
  const ctIndexMatch = useMatch(jobConfig.routeBase);
  const ctNewMatch = useMatch(`${jobConfig.routeBase}/new`);
  const ctDetailMatch = useMatch(`${jobConfig.routeBase}/:jobId`);
  const ctJobIdParam =
    ctDetailMatch && ctDetailMatch.params.jobId !== 'new' ? ctDetailMatch.params.jobId : undefined;
  // /site-analyzer/new also matches /site-analyzer/:siteId — disambiguate.
  const siteIdParam =
    siteDetailMatch && siteDetailMatch.params.siteId !== 'new'
      ? siteDetailMatch.params.siteId
      : undefined;

  const companyParamId =
    companyMatch && companyMatch.params.id !== 'new' ? companyMatch.params.id : undefined;
  const contactParamId =
    contactMatch && contactMatch.params.id !== 'new' ? contactMatch.params.id : undefined;

  const { company: companyOnPage } = useCompany(companyParamId);
  const { contact } = useContact(contactParamId);
  const { companies } = useCompanies();
  const contactPrimaryCompanyId = contact?.affiliations.find((a) => a.isPrimary)?.companyId
    ?? contact?.affiliations[0]?.companyId;
  const contactCompany = contactPrimaryCompanyId
    ? companies.find((c) => c.id === contactPrimaryCompanyId)
    : undefined;

  // Same load-once pattern as `useCompanies` above: the site registry is small
  // and already pulled on most pages, so subscribing here doesn't add a
  // meaningful cost and keeps hook order stable.
  const { sites } = useSiteRegistry();
  const siteOnPage = siteIdParam ? sites.find((s) => s.id === siteIdParam) : undefined;
  const siteCompany = siteOnPage?.companyId
    ? companies.find((c) => c.id === siteOnPage.companyId)
    : undefined;
  const newSiteCompanyId = siteNewMatch ? searchParams.get('companyId') : null;
  const newSiteCompany = newSiteCompanyId
    ? companies.find((c) => c.id === newSiteCompanyId)
    : undefined;

  // Construction Tracker job detail / new-from-company.
  const { job: jobOnPage } = useConstructionJob(ctJobIdParam);
  const newJobCompanyId = ctNewMatch ? searchParams.get('companyId') : null;
  const newJobCompany = newJobCompanyId
    ? companies.find((c) => c.id === newJobCompanyId)
    : undefined;

  // Large Load Request (formerly Pre-Construction) site detail / new-from-company.
  const preConIndexMatch = useMatch('/llr');
  const preConNewMatch = useMatch('/llr/new');
  const preConDetailMatch = useMatch('/llr/:siteId');
  const preConSiteIdParam =
    preConDetailMatch && preConDetailMatch.params.siteId !== 'new'
      ? preConDetailMatch.params.siteId
      : undefined;
  const { site: preConSiteOnPage } = usePreConSite(preConSiteIdParam);
  const newPreConCompanyId = preConNewMatch ? searchParams.get('companyId') : null;
  const newPreConCompany = newPreConCompanyId
    ? companies.find((c) => c.id === newPreConCompanyId)
    : undefined;

  // One-Line Generator index / new / detail.
  const oneLineIndexMatch = useMatch('/one-line-generator');
  const oneLineNewMatch = useMatch('/one-line-generator/new');
  const oneLineDetailMatch = useMatch('/one-line-generator/:documentId');
  const oneLineDocId =
    oneLineDetailMatch && oneLineDetailMatch.params.documentId !== 'new'
      ? oneLineDetailMatch.params.documentId
      : undefined;
  const { doc: oneLineDoc } = useOneLineDocument(oneLineDocId);

  // Always start the trail at Dashboard so there's a text path back to home
  // from anywhere in the app — not just the navbar logo.
  const segments: Segment[] = [{ label: 'Dashboard', path: '/' }];

  if (pathname === '/crm') {
    segments.push({ label: 'Directory' });
  } else if (pathname.startsWith('/crm/')) {
    segments.push({ label: 'Directory', path: '/crm' });

    if (companyMatch) {
      const label = companyMatch.params.id === 'new' ? 'New Customer' : (companyOnPage?.name ?? '…');
      segments.push({ label });
    } else if (contactMatch) {
      if (contactCompany) {
        segments.push({ label: contactCompany.name, path: `/crm/companies/${contactCompany.id}` });
      }
      const label =
        contactMatch.params.id === 'new'
          ? 'New Person'
          : contact
            ? `${contact.firstName} ${contact.lastName}`
            : '…';
      segments.push({ label });
    }
  } else if (ctIndexMatch || ctNewMatch || ctJobIdParam) {
    // Construction Tracker. Same pattern as Site Analyzer: a job created from
    // a company profile keeps that company as its parent so the back arrow
    // returns there. Otherwise the parent is the Construction Tracker index.
    if (ctIndexMatch) {
      segments.push({ label: jobConfig.label });
    } else if (ctNewMatch) {
      if (newJobCompany) {
        segments.push({ label: 'Directory', path: '/crm' });
        segments.push({ label: newJobCompany.name, path: `/crm/companies/${newJobCompany.id}` });
      } else {
        segments.push({ label: jobConfig.label, path: jobConfig.routeBase });
      }
      segments.push({ label: 'New Project' });
    } else if (ctJobIdParam) {
      segments.push({ label: jobConfig.label, path: jobConfig.routeBase });
      segments.push({ label: jobOnPage?.name || '…' });
    }
  } else if (preConIndexMatch || preConNewMatch || preConSiteIdParam) {
    // Large Load Request. Detail page returns to the tool index (not the
    // company) so the back arrow lands on /llr — matching Construction
    // Tracker's pattern. New-from-company keeps the Directory › Company
    // parent so the back arrow returns the user to the company profile they
    // came from.
    if (preConIndexMatch) {
      segments.push({ label: 'Large Load Request' });
    } else if (preConNewMatch) {
      if (newPreConCompany) {
        segments.push({ label: 'Directory', path: '/crm' });
        segments.push({
          label: newPreConCompany.name,
          path: `/crm/companies/${newPreConCompany.id}`,
        });
      } else {
        segments.push({ label: 'Large Load Request', path: '/llr' });
      }
      segments.push({ label: 'New Site' });
    } else if (preConSiteIdParam) {
      segments.push({ label: 'Large Load Request', path: '/llr' });
      segments.push({ label: preConSiteOnPage?.name || '…' });
    }
  } else if (oneLineIndexMatch || oneLineNewMatch || oneLineDocId) {
    if (oneLineIndexMatch) {
      segments.push({ label: 'One-Line Generator' });
    } else if (oneLineNewMatch) {
      segments.push({ label: 'One-Line Generator', path: '/one-line-generator' });
      segments.push({ label: 'New diagram' });
    } else if (oneLineDocId) {
      segments.push({ label: 'One-Line Generator', path: '/one-line-generator' });
      segments.push({ label: oneLineDoc?.name || '…' });
    }
  } else if (siteIndexMatch || siteNewMatch || siteIdParam) {
    // Site detail/new pages use their linked company as the canonical parent
    // when one exists, so the back arrow returns to the company profile the
    // user came from. Unlinked sites fall back to the Site Analyzer index.
    if (siteIndexMatch) {
      segments.push({ label: 'Site Analyzer' });
    } else if (siteNewMatch) {
      if (newSiteCompany) {
        segments.push({ label: 'Directory', path: '/crm' });
        segments.push({ label: newSiteCompany.name, path: `/crm/companies/${newSiteCompany.id}` });
      } else {
        segments.push({ label: 'Site Analyzer', path: '/site-analyzer' });
      }
      segments.push({ label: 'New Site' });
    } else if (siteIdParam) {
      if (siteCompany) {
        segments.push({ label: 'Directory', path: '/crm' });
        segments.push({ label: siteCompany.name, path: `/crm/companies/${siteCompany.id}` });
      } else {
        segments.push({ label: 'Site Analyzer', path: '/site-analyzer' });
      }
      segments.push({ label: siteOnPage?.name || '…' });
    }
  }
  // Other tool routes: breadcrumb stays as just "‹ Dashboard". The tool's
  // own h2 already names the page, so we don't duplicate it here.

  // Back button destination: when the caller passed `?returnTo=<path>`,
  // honor that as an explicit override — useful when a page is reached from
  // somewhere other than its canonical parent (e.g. opening the Site Analyzer
  // from a pre-con site). Otherwise fall back to the last segment in the
  // trail that has a path — i.e. the canonical "up one level".
  const returnTo = searchParams.get('returnTo');
  const backTarget = returnTo
    ? { label: 'Back', path: returnTo }
    : [...segments].reverse().find((s) => s.path);

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-3 flex-wrap">
      {backTarget && (
        <button
          onClick={() => navigate(backTarget.path!)}
          aria-label={`Back to ${backTarget.label}`}
          title={`Back to ${backTarget.label}`}
          className="group h-8 w-8 rounded-full bg-white border border-[#D8D5D0] shadow-sm flex items-center justify-center text-[#7A756E] hover:text-[#ED202B] hover:border-[#ED202B]/30 hover:shadow transition shrink-0"
        >
          <svg
            className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <ol className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-sm min-w-0">
        {segments.map((seg, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <li aria-hidden="true" className="text-[#D8D5D0] select-none">
                ›
              </li>
            )}
            <li className="truncate max-w-[180px] sm:max-w-[240px]">
              {seg.path ? (
                <button
                  onClick={() => navigate(seg.path!)}
                  className="text-[#7A756E] hover:text-[#ED202B] transition font-medium"
                >
                  {seg.label}
                </button>
              ) : (
                <span className="text-[#7A756E] font-medium">{seg.label}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
