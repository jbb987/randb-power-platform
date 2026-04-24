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

  const segments: Segment[] = [];

  if (pathname.startsWith('/crm')) {
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
  } else {
    segments.push({ label: 'Dashboard', path: '/' });
  }

  // Drop the trail entirely if it's only the root anchor with no current page.
  if (segments.length === 0) return null;

  // If we only have a single root segment (e.g. /crm), the trail would just
  // repeat the page heading. Hide it for cleanliness.
  if (segments.length === 1 && segments[0].path === pathname) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-sm">
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const isFirst = i === 0;
          return (
            <Fragment key={i}>
              {i > 0 && <li aria-hidden="true" className="text-[#D8D5D0] select-none">›</li>}
              <li className="truncate max-w-[180px] sm:max-w-[240px]">
                {seg.path && !isLast ? (
                  <button
                    onClick={() => navigate(seg.path!)}
                    className="group inline-flex items-center gap-1 text-[#7A756E] hover:text-[#ED202B] transition font-medium"
                  >
                    {isFirst && (
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
