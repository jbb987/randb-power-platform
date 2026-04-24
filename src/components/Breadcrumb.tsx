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

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-sm">
        {segments.map((seg, i) => {
          // The back arrow goes on the immediate parent of the current page
          // — the last segment that has a path. That way "‹" always means
          // "up one level" regardless of how deep we are.
          const isBackParent = seg.path && !segments.slice(i + 1).some((s) => s.path);
          return (
            <Fragment key={i}>
              {i > 0 && <li aria-hidden="true" className="text-[#D8D5D0] select-none">›</li>}
              <li className="truncate max-w-[180px] sm:max-w-[240px]">
                {seg.path ? (
                  <button
                    onClick={() => navigate(seg.path!)}
                    className="group inline-flex items-center gap-1 text-[#7A756E] hover:text-[#ED202B] transition font-medium"
                  >
                    {isBackParent && (
                      <svg
                        className="h-3.5 w-3.5 flex-shrink-0 transition-transform group-hover:-translate-x-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    )}
                    {seg.label}
                  </button>
                ) : (
                  <span className="text-[#7A756E] font-medium">{seg.label}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
