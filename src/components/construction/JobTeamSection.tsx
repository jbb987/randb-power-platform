import { useMemo } from 'react';
import { useUsers, userLabel } from '../../hooks/useUsers';
import type { ConstructionJob } from '../../types';

export default function JobTeamSection({ job }: { job: ConstructionJob }) {
  const { users } = useUsers();
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const pm = userById.get(job.projectManagerId);

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <h3 className="font-heading font-semibold text-[#201F1E] mb-3">Team</h3>
      <div className="space-y-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-[#7A756E] mb-1">
            Project manager
          </div>
          {pm ? (
            <div className="text-sm text-[#201F1E]">
              {userLabel(pm)}
              {pm.displayName && (
                <span className="text-[#7A756E] ml-2 text-xs">{pm.email}</span>
              )}
            </div>
          ) : (
            <div className="text-sm italic text-[#7A756E]">
              {job.projectManagerId ? 'User not found' : 'Not assigned'}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-[#7A756E] mb-1">
            Workers {job.workerIds.length > 0 && (
              <span className="font-normal normal-case text-[#7A756E]/80">· {job.workerIds.length}</span>
            )}
          </div>
          {job.workerIds.length === 0 ? (
            <div className="text-sm italic text-[#7A756E]">No workers assigned yet.</div>
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
