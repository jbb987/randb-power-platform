import { useMemo, useState } from 'react';
import { useUsers, userLabel } from '../../hooks/useUsers';
import { useJobTasks } from '../../hooks/useJobTasks';
import { useAuth } from '../../hooks/useAuth';
import type { JobPermissions } from '../../hooks/useJobPermissions';
import type {
  ConstructionJob,
  JobTask,
  JobTaskStatus,
} from '../../types';
import TaskListView from './TaskListView';
import TaskEditModal from './TaskEditModal';

interface Props {
  job: ConstructionJob;
  perms: JobPermissions;
}

/** When a task has subtasks, its displayed status is rolled up from them.
 *  All subtasks done → done. Any in-progress, or a mix of done+todo → in-progress.
 *  All todo → todo. Tasks with no subtasks return their own stored status. */
export function effectiveStatus(task: JobTask, subtasks: JobTask[]): JobTaskStatus {
  if (subtasks.length === 0) return task.status;
  const done = subtasks.filter((s) => s.status === 'done').length;
  const inProg = subtasks.filter((s) => s.status === 'in-progress').length;
  if (done === subtasks.length) return 'done';
  if (inProg > 0 || done > 0) return 'in-progress';
  return 'todo';
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none';

export default function JobTasksSection({ job, perms }: Props) {
  const { user } = useAuth();
  const { users } = useUsers();
  const { tasks, loading, create, update, remove, reorder } = useJobTasks(job.id);

  // Inline-add row.
  const [adding, setAdding] = useState(false);
  const [addingParent, setAddingParent] = useState<string | null>(null); // null = top-level
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit modal.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(() => tasks.find((t) => t.id === editingId) ?? null, [tasks, editingId]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const eligibleAssignees = useMemo(() => {
    const ids = new Set<string>([job.projectManagerId, ...(job.workerIds ?? [])]);
    return users.filter((u) => ids.has(u.id));
  }, [users, job.projectManagerId, job.workerIds]);

  // Sort siblings by (order, createdAt). Then split into top-level + by-parent maps.
  const { topLevel, childrenByParent } = useMemo(() => {
    const sortFn = (a: JobTask, b: JobTask) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.createdAt - b.createdAt;
    };
    const top: JobTask[] = [];
    const byParent = new Map<string, JobTask[]>();
    for (const t of tasks) {
      if (t.parentTaskId) {
        const list = byParent.get(t.parentTaskId) ?? [];
        list.push(t);
        byParent.set(t.parentTaskId, list);
      } else {
        top.push(t);
      }
    }
    top.sort(sortFn);
    for (const [, list] of byParent) list.sort(sortFn);
    return { topLevel: top, childrenByParent: byParent };
  }, [tasks]);

  const openCount = useMemo(
    () => tasks.filter((t) => t.status !== 'done').length,
    [tasks],
  );

  function resetDraft() {
    setDraftTitle('');
    setDraftAssignee('');
    setDraftDue('');
    setError(null);
  }

  function startAdd(parentId: string | null) {
    resetDraft();
    setAddingParent(parentId);
    setAdding(true);
  }

  function cancelAdd() {
    setAdding(false);
    setAddingParent(null);
    resetDraft();
  }

  async function handleCreate() {
    if (!user) return;
    if (!draftTitle.trim()) {
      setError('Task title is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const dueMs = draftDue ? Date.parse(draftDue) : NaN;
      // Position the new task at the end of its sibling group.
      const siblings = addingParent
        ? childrenByParent.get(addingParent) ?? []
        : topLevel;
      const lastOrder = siblings.length > 0
        ? Math.max(...siblings.map((t) => t.order ?? 0))
        : 0;
      await create({
        title: draftTitle.trim(),
        status: 'todo',
        ...(draftAssignee && { assigneeId: draftAssignee }),
        ...(Number.isFinite(dueMs) && { dueDate: dueMs }),
        ...(addingParent && { parentTaskId: addingParent }),
        order: lastOrder + 1000,
        createdBy: user.uid,
      });
      cancelAdd();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(taskId: string, next: JobTaskStatus, assigneeId?: string): Promise<boolean> {
    if (!perms.canUpdateTaskStatus(assigneeId)) return false;

    // Cascade to subtasks the user is allowed to update. A worker assigned to
    // the parent can't silently flip subtasks owned by someone else; rules
    // would reject those writes anyway.
    const subs = childrenByParent.get(taskId) ?? [];
    const cascadable = subs.filter((s) => perms.canUpdateTaskStatus(s.assigneeId));

    // For 2+ subtasks, require explicit confirmation — flipping a parent of
    // 8 subtasks should not be a casual mis-tap.
    if (cascadable.length >= 2) {
      const verb = next === 'done' ? 'mark done' : next === 'in-progress' ? 'mark in progress' : 'reset';
      const ok = window.confirm(
        `${verb.charAt(0).toUpperCase() + verb.slice(1)} this task and ${cascadable.length} subtasks?`,
      );
      if (!ok) return false;
    }

    try {
      await Promise.all([
        update(taskId, { status: next }),
        ...cascadable.map((s) => update(s.id, { status: next })),
      ]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task.');
      return false;
    }
  }

  async function handleDelete(t: JobTask) {
    if (!perms.canDeleteTasks) return;
    const subCount = childrenByParent.get(t.id)?.length ?? 0;
    const msg = subCount > 0
      ? `Delete task "${t.title}" and its ${subCount} subtask${subCount === 1 ? '' : 's'}?`
      : `Delete task "${t.title}"?`;
    if (!window.confirm(msg)) return;
    try {
      await remove(t.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task.');
    }
  }

  async function handleReorder(
    updates: Array<{ id: string; order: number }>,
    statusChange?: { id: string; status: JobTaskStatus },
  ) {
    try {
      // Apply the status change first so completedAt gets stamped/cleared
      // independently of the order updates.
      if (statusChange) {
        await update(statusChange.id, { status: statusChange.status });
      }
      await reorder(updates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder tasks.');
    }
  }

  async function handleEditSave(updates: Partial<JobTask>) {
    if (!editingId) return;
    await update(editingId, updates);
  }

  return (
    <section className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-heading font-semibold text-[#201F1E]">
          Tasks
          {openCount > 0 && (
            <span className="text-[#7A756E] font-normal ml-2">· {openCount} open</span>
          )}
        </h3>
        {perms.canCreateTasks && !adding && (
          <button
            onClick={() => startAdd(null)}
            className="text-sm font-medium text-[#ED202B] border border-[#ED202B] px-3 py-1 rounded-lg hover:bg-[#ED202B]/5 transition"
          >
            + Add task
          </button>
        )}
      </div>

      {/* Inline add row */}
      {adding && (
        <div className="rounded-lg border border-[#D8D5D0] bg-stone-50 p-3 mb-3 space-y-2">
          {addingParent && (
            <p className="text-[11px] text-[#7A756E] uppercase tracking-wide">
              Subtask of: <span className="font-medium normal-case">
                {tasks.find((t) => t.id === addingParent)?.title ?? '…'}
              </span>
            </p>
          )}
          <input
            type="text"
            autoFocus
            className={inputClass}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder={addingParent ? 'Subtask title…' : 'Task title…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') cancelAdd();
            }}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              className={inputClass}
              value={draftAssignee}
              onChange={(e) => setDraftAssignee(e.target.value)}
            >
              <option value="">— Unassigned —</option>
              {eligibleAssignees.map((u) => (
                <option key={u.id} value={u.id}>{userLabel(u)}</option>
              ))}
            </select>
            <input
              type="date"
              className={inputClass}
              value={draftDue}
              onChange={(e) => setDraftDue(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancelAdd}
              disabled={submitting}
              className="px-3 py-1.5 text-sm font-medium text-[#201F1E] hover:text-[#ED202B] transition disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={submitting || !draftTitle.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#ED202B] hover:bg-[#9B0E18] transition disabled:opacity-40"
            >
              {submitting ? 'Saving…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <p className="text-sm text-[#7A756E]">Loading…</p>
      ) : topLevel.length === 0 && !adding ? (
        <p className="text-sm text-[#7A756E]">
          {perms.canCreateTasks ? 'No tasks yet. Click + Add task to create the first one.' : 'No tasks yet.'}
        </p>
      ) : (
        <TaskListView
          topLevel={topLevel}
          childrenByParent={childrenByParent}
          userById={userById}
          perms={perms}
          onStatusChange={handleStatusChange}
          onEdit={(t) => setEditingId(t.id)}
          onDelete={handleDelete}
          onAddSubtask={(pid) => startAdd(pid)}
          onReorder={handleReorder}
        />
      )}

      {error && <p className="text-sm text-[#ED202B] mt-2" role="alert">{error}</p>}

      {editing && (
        <TaskEditModal
          task={editing}
          eligibleAssignees={eligibleAssignees}
          canEdit={perms.canEditBasicInfo}
          onSave={handleEditSave}
          onClose={() => setEditingId(null)}
        />
      )}
    </section>
  );
}
