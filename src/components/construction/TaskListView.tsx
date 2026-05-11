import { useMemo, useState } from 'react';
import { userLabel, type UserRecord } from '../../hooks/useUsers';
import type { JobPermissions } from '../../hooks/useJobPermissions';
import {
  ALL_JOB_TASK_STATUSES,
  JOB_TASK_STATUS_LABELS,
  type JobTask,
  type JobTaskStatus,
} from '../../types';
import TaskStatusMenu from './TaskStatusMenu';
import { effectiveStatus } from './JobTasksSection';

interface Props {
  topLevel: JobTask[]; // already-sorted top-level tasks
  childrenByParent: Map<string, JobTask[]>; // parentId → sorted subtasks
  userById: Map<string, UserRecord>;
  perms: JobPermissions;
  /** Update a task's status. Returns true if the user has permission. */
  onStatusChange: (taskId: string, next: JobTaskStatus, assigneeId?: string) => Promise<boolean>;
  onEdit: (task: JobTask) => void;
  onDelete: (task: JobTask) => void;
  onAddSubtask: (parentId: string) => void;
}

function formatDate(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface RowProps {
  task: JobTask;
  childrenTasks: JobTask[];
  userById: Map<string, UserRecord>;
  perms: JobPermissions;
  onStatusChange: Props['onStatusChange'];
  onEdit: Props['onEdit'];
  onDelete: Props['onDelete'];
  onAddSubtask?: (parentId: string) => void;
  isSubtask?: boolean;
}

function TaskRow({
  task,
  childrenTasks,
  userById,
  perms,
  onStatusChange,
  onEdit,
  onDelete,
  onAddSubtask,
  isSubtask,
}: RowProps) {
  // Parents with subtasks have their status derived from children — the
  // status menu is disabled in that case (children drive the state).
  const hasSubtasks = childrenTasks.length > 0;
  const displayStatus = hasSubtasks ? effectiveStatus(task, childrenTasks) : task.status;

  const [expanded, setExpanded] = useState(true);

  const assignee = task.assigneeId ? userById.get(task.assigneeId) : undefined;
  const isDone = displayStatus === 'done';
  const overdue = !isDone && task.dueDate && task.dueDate < Date.now();
  const subtaskTotal = childrenTasks.length;
  const subtaskDone = childrenTasks.filter((c) => c.status === 'done').length;

  return (
    <div className={isSubtask ? 'pl-8' : ''}>
      <div className="py-2 flex items-start gap-2">
        <TaskStatusMenu
          status={displayStatus}
          variant="circle"
          disabled={!perms.canUpdateTaskStatus(task.assigneeId) || hasSubtasks}
          onChange={(s) => onStatusChange(task.id, s, task.assigneeId)}
        />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(task)}
              className={`text-sm text-left ${isDone ? 'line-through text-[#7A756E]' : 'text-[#201F1E]'} hover:text-[#ED202B] hover:underline`}
            >
              {task.title}
            </button>
            {!isSubtask && subtaskTotal > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-stone-100 text-[10px] font-medium text-[#7A756E] hover:bg-stone-200"
              >
                <svg
                  className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {subtaskDone}/{subtaskTotal}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#7A756E] mt-0.5">
            {assignee && <span>{userLabel(assignee)}</span>}
            {task.dueDate && (
              <span className={overdue ? 'text-[#ED202B] font-medium' : ''}>
                Due {formatDate(task.dueDate)}
                {overdue && ' (overdue)'}
              </span>
            )}
            {isDone && task.completedAt && <span>Completed {formatDate(task.completedAt)}</span>}
            {task.notes && <span className="italic">has notes</span>}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {!isSubtask && perms.canCreateTasks && onAddSubtask && (
            <button
              type="button"
              onClick={() => onAddSubtask(task.id)}
              className="text-xs text-[#7A756E] hover:text-[#201F1E] px-2 py-1 rounded hover:bg-stone-100"
              title="Add subtask"
            >
              + Sub
            </button>
          )}
          {perms.canEditBasicInfo && (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="text-xs text-[#7A756E] hover:text-[#201F1E] px-2 py-1 rounded hover:bg-stone-100"
              title="Edit"
            >
              Edit
            </button>
          )}
          {perms.canDeleteTasks && (
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="text-xs text-[#ED202B]/70 hover:text-[#ED202B] px-2 py-1 rounded hover:bg-[#ED202B]/5"
              title="Delete"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {!isSubtask && expanded && childrenTasks.length > 0 && (
        <div className="border-l-2 border-stone-100 ml-2">
          {childrenTasks.map((c) => (
            <TaskRow
              key={c.id}
              task={c}
              childrenTasks={[]}
              userById={userById}
              perms={perms}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              onDelete={onDelete}
              isSubtask
            />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_BG: Record<JobTaskStatus, string> = {
  todo: 'bg-stone-50',
  'in-progress': 'bg-[#3B82F6]/5',
  done: 'bg-[#10B981]/5',
};

export default function TaskListView({
  topLevel,
  childrenByParent,
  userById,
  perms,
  onStatusChange,
  onEdit,
  onDelete,
  onAddSubtask,
}: Props) {
  const groups = useMemo(() => {
    const out: Record<JobTaskStatus, JobTask[]> = { todo: [], 'in-progress': [], done: [] };
    for (const t of topLevel) {
      const subs = childrenByParent.get(t.id) ?? [];
      out[effectiveStatus(t, subs)].push(t);
    }
    return out;
  }, [topLevel, childrenByParent]);

  return (
    <div className="space-y-3">
      {ALL_JOB_TASK_STATUSES.map((s) => {
        const list = groups[s];
        return (
          <div key={s} className={`rounded-lg ${STATUS_BG[s]} px-2`}>
            <div className="flex items-center justify-between px-1 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#7A756E]">
                {JOB_TASK_STATUS_LABELS[s]}
                <span className="ml-1.5 text-[#7A756E]/60">{list.length}</span>
              </h4>
            </div>
            {list.length === 0 ? (
              <p className="px-1 py-2 text-xs text-[#7A756E]/70">No tasks.</p>
            ) : (
              <div className="divide-y divide-white/60">
                {list.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    childrenTasks={childrenByParent.get(t.id) ?? []}
                    userById={userById}
                    perms={perms}
                    onStatusChange={onStatusChange}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onAddSubtask={onAddSubtask}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
