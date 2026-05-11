import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useUsers, userLabel } from '../../hooks/useUsers';
import { useContacts } from '../../hooks/useContacts';
import type { ConstructionJob } from '../../types';

export default function JobTeamSection({ job }: { job: ConstructionJob }) {
  const { users } = useUsers();
  const { contacts } = useContacts();
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const supervisors = job.projectSupervisorIds
    .map((uid) => userById.get(uid))
    .filter((u): u is NonNullable<typeof u> => !!u);
  const pmContacts = job.projectManagerContactIds
    .map((id) => contactById.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <h3 className="font-heading font-semibold text-[#201F1E] mb-3">Team</h3>
      <div className="space-y-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-[#7A756E] mb-1">
            Project supervisor
            {supervisors.length > 1 && (
              <span className="font-normal normal-case text-[#7A756E]/80">
                {' '}
                · {supervisors.length}
              </span>
            )}
          </div>
          {supervisors.length === 0 ? (
            <div className="text-sm italic text-[#7A756E]">
              {job.projectSupervisorIds.length > 0 ? 'User not found' : 'Not assigned'}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {supervisors.map((s) => (
                <li key={s.id} className="text-sm text-[#201F1E]">
                  {userLabel(s)}
                  {s.displayName && <span className="text-[#7A756E] ml-2 text-xs">{s.email}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-[#7A756E] mb-1">
            Project manager
            {pmContacts.length > 1 && (
              <span className="font-normal normal-case text-[#7A756E]/80">
                {' '}
                · {pmContacts.length}
              </span>
            )}
          </div>
          {pmContacts.length === 0 ? (
            <div className="text-sm italic text-[#7A756E]">
              {job.projectManagerContactIds.length > 0 ? 'Contact not found' : 'Not assigned'}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {pmContacts.map((c) => {
                const title =
                  c.affiliations.find((a) => a.isPrimary)?.title ?? c.affiliations[0]?.title;
                return (
                  <li key={c.id} className="text-sm text-[#201F1E]">
                    <Link
                      to={`/crm/people/${c.id}`}
                      className="font-medium hover:text-[#ED202B] hover:underline"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                    {title && <span className="text-[#7A756E] ml-2 text-xs">{title}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-[#7A756E] mb-1">
            Labor{' '}
            {job.workerIds.length > 0 && (
              <span className="font-normal normal-case text-[#7A756E]/80">
                · {job.workerIds.length}
              </span>
            )}
          </div>
          {job.workerIds.length === 0 ? (
            <div className="text-sm italic text-[#7A756E]">No labor assigned yet.</div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {job.workerIds.map((uid) => {
                const u = userById.get(uid);
                return (
                  <li
                    key={uid}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-stone-100 text-xs text-[#201F1E]"
                  >
                    {userLabel(u)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
