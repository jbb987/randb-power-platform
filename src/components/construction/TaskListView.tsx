import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  topLevel: JobTask[];                              // already-sorted top-level tasks
  childrenByParent: Map<string, JobTask[]>;         // parentId → sorted subtasks
  userById: Map<string, UserRecord>;
  perms: JobPermissions;
  /** Update a task's status. Returns true if the user has permission. */
  onStatusChange: (taskId: string, next: JobTaskStatus, assigneeId?: string) => Promise<boolean>;
  onEdit: (task: JobTask) => void;
  onDelete: (task: JobTask) => void;
  onAddSubtask: (parentId: string) => void;
  /** Persist new orders for a set of sibling tasks within one status group / parent. */
  onReorder: (updates: Array<{ id: string; order: number }>, statusChange?: { id: string; status: JobTaskStatus }) => Promise<void>;
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
  draggable: boolean;
}

function TaskRowInner({
  task, childrenTasks, userById, perms, onStatusChange, onEdit, onDelete, onAddSubtask, isSubtask, draggable,
}: RowProps) {
  // Parents with subtasks have their status derived from children — drag and
  // status menu are both disabled in that case.
  const hasSubtasks = childrenTasks.length > 0;
  const displayStatus = hasSubtasks ? effectiveStatus(task, childrenTasks) : task.status;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !draggable || hasSubtasks,
  });

  const [expanded, setExpanded] = useState(true);

  const assignee = task.assigneeId ? userById.get(task.assigneeId) : undefined;
  const isDone = displayStatus === 'done';
  const overdue = !isDone && task.dueDate && task.dueDate < Date.now();
  const subtaskTotal = childrenTasks.length;
  const subtaskDone = childrenTasks.filter((c) => c.status === 'done').length;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={isSubtask ? 'pl-8' : ''}>
      <div className="py-2 flex items-start gap-2">
        {draggable && !hasSubtasks ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="-mt-0.5 -ml-1 p-1 text-[#7A756E] hover:text-[#201F1E] cursor-grab active:cursor-grabbing touch-none shrink-0"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <circle cx="7" cy="5" r="1.5" /><circle cx="13" cy="5" r="1.5" />
              <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
              <circle cx="7" cy="15" r="1.5" /><circle cx="13" cy="15" r="1.5" />
            </svg>
          </button>
        ) : (
          <span className="mt-1 w-5 shrink-0" />
        )}

        <TaskStatusMenu
          status={displayStatus}
          variant="circle"
          disabled={!perms.canUpdateTaskStatus(task.assigneeId)}
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
                <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                Due {formatDate(task.dueDate)}{overdue && ' (overdue)'}
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
        <SubtaskList
          parentId={task.id}
          tasks={childrenTasks}
          userById={userById}
          perms={perms}
          onStatusChange={onStatusChange}
          onEdit={onEdit}
          onDelete={onDelete}
          draggable={draggable}
        />
      )}
    </div>
  );
}

interface SubtaskListProps {
  parentId: string;
  tasks: JobTask[];
  userById: Map<string, UserRecord>;
  perms: JobPermissions;
  onStatusChange: Props['onStatusChange'];
  onEdit: Props['onEdit'];
  onDelete: Props['onDelete'];
  draggable: boolean;
}

function SubtaskList({ tasks, userById, perms, onStatusChange, onEdit, onDelete, draggable }: SubtaskListProps) {
  return (
    <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
      <div className="border-l-2 border-stone-100 ml-2">
        {tasks.map((t) => (
          <TaskRowInner
            key={t.id}
            task={t}
            childrenTasks={[]}
            userById={userById}
            perms={perms}
            onStatusChange={onStatusChange}
            onEdit={onEdit}
            onDelete={onDelete}
            isSubtask
            draggable={draggable}
          />
        ))}
      </div>
    </SortableContext>
  );
}

const STATUS_BG: Record<JobTaskStatus, string> = {
  'todo':         'bg-stone-50',
  'in-progress':  'bg-[#3B82F6]/5',
  'done':         'bg-[#10B981]/5',
};

export default function TaskListView(props: Props) {
  const { topLevel, childrenByParent, userById, perms, onStatusChange, onEdit, onDelete, onAddSubtask, onReorder } = props;

  const groups = useMemo(() => {
    const out: Record<JobTaskStatus, JobTask[]> = { 'todo': [], 'in-progress': [], 'done': [] };
    for (const t of topLevel) {
      const subs = childrenByParent.get(t.id) ?? [];
      out[effectiveStatus(t, subs)].push(t);
    }
    return out;
  }, [topLevel, childrenByParent]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // Find which top-level group a task id belongs to (by status). Used to
  // decide whether a drag is within-group (reorder only) or cross-group
  // (reorder + status change).
  function groupOf(taskId: string): JobTaskStatus | null {
    for (const s of ALL_JOB_TASK_STATUSES) {
      if (groups[s].some((t) => t.id === taskId)) return s;
    }
    return null;
  }

  // Subtask siblings live under one parent.
  function subtaskParentOf(taskId: string): string | null {
    for (const [pid, list] of childrenByParent.entries()) {
      if (list.some((t) => t.id === taskId)) return pid;
    }
    return null;
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Subtask reorder (within one parent only — no promoting to top-level).
    const subtaskParent = subtaskParentOf(activeId);
    if (subtaskParent) {
      const overParent = subtaskParentOf(overId);
      if (overParent !== subtaskParent) return;
      const siblings = childrenByParent.get(subtaskParent) ?? [];
      const fromIdx = siblings.findIndex((t) => t.id === activeId);
      const toIdx = siblings.findIndex((t) => t.id === overId);
      if (fromIdx < 0 || toIdx < 0) return;
      const reordered = [...siblings];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      const updates = reordered.map((t, i) => ({ id: t.id, order: (i + 1) * 1000 }));
      await onReorder(updates);
      return;
    }

    // Top-level reorder (possibly cross-status).
    const fromStatus = groupOf(activeId);
    const toStatus = groupOf(overId);
    if (!fromStatus || !toStatus) return;

    const sourceList = groups[fromStatus];
    const fromIdx = sourceList.findIndex((t) => t.id === activeId);
    if (fromIdx < 0) return;

    if (fromStatus === toStatus) {
      // Pure reorder within group.
      const reordered = [...sourceList];
      const toIdx = reordered.findIndex((t) => t.id === overId);
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      const updates = reordered.map((t, i) => ({ id: t.id, order: (i + 1) * 1000 }));
      await onReorder(updates);
    } else {
      // Cross-status: change status + place at the dropped position in the
      // destination group, AND renumber the source group so it doesn't keep
      // gaps where the moved task used to sit (drift was a real issue with
      // repeated cross-status drags).
      const moved = sourceList[fromIdx];
      const sourceRemaining = sourceList.filter((t) => t.id !== activeId);
      const destList = [...groups[toStatus]];
      const toIdx = destList.findIndex((t) => t.id === overId);
      const insertAt = toIdx >= 0 ? toIdx : destList.length;
      destList.splice(insertAt, 0, { ...moved, status: toStatus });

      const updates = [
        ...destList.map((t, i) => ({ id: t.id, order: (i + 1) * 1000 })),
        ...sourceRemaining.map((t, i) => ({ id: t.id, order: (i + 1) * 1000 })),
      ];
      await onReorder(updates, { id: moved.id, status: toStatus });
    }
  }

  const draggable = perms.canEditBasicInfo;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="divide-y divide-white/60">
                    {list.map((t) => (
                      <TaskRowInner
                        key={t.id}
                        task={t}
                        childrenTasks={childrenByParent.get(t.id) ?? []}
                        userById={userById}
                        perms={perms}
                        onStatusChange={onStatusChange}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onAddSubtask={onAddSubtask}
                        draggable={draggable}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
