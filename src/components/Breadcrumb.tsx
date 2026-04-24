import { Fragment } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useCompany, useCompanies } from '../hooks/useCompanies';
import { useContact } from '../hooks/useContacts';

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
 */
export default function Breadcrumb() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const companyMatch = useMatch('/crm/companies/:id');
  const contactMatch = useMatch('/crm/people/:id');

  const companyParamId =
    companyMatch && companyMatch.params.id !== 'new' ? companyMatch.params.id : undefined;
  const contactParamId =
    contactMatch && contactMatch.params.id !== 'new' ? contactMatch.params.id : undefined;

  const { company: companyOnPage } = useCompany(companyParamId);
  const { contact } = useContact(contactParamId);
  const { companies } = useCompanies();
  const contactCompany = contact ? companies.find((c) => c.id === contact.companyId) : undefined;

  if (pathname === '/') return null;

  // Always start the trail at Dashboard so there's a text path back to home
  // from anywhere in the app — not just the navbar logo.
  const segments: Segment[] = [{ label: 'Dashboard', path: '/' }];

  if (pathname === '/crm') {
    segments.push({ label: 'Directory' });
  } else if (pathname.startsWith('/crm/')) {
    segments.push({ label: 'Directory', path: '/crm' });

    if (companyMatch) {
      const label =
        companyMatch.params.id === 'new'
          ? 'New Company'
          : companyOnPage?.name ?? '…';
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
  }
  // Non-CRM tool routes: breadcrumb stays as just "‹ Dashboard". The tool's
  // own h2 already names the page, so we don't duplicate it here.

  // Back button destination: the last segment in the trail that has a path
  // (i.e. the immediate parent of the current page). This is always "up one
  // level" regardless of trail depth, and is what most users instinctively
  // reach for on the left of the screen.
  const backTarget = [...segments].reverse().find((s) => s.path);

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
            {i > 0 && <li aria-hidden="true" className="text-[#D8D5D0] select-none">›</li>}
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
