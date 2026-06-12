import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import { useUserTasks } from '../hooks/useUserTasks';
import { useAuth } from '../hooks/useAuth';
import { useUsers, userLabel, type UserRecord } from '../hooks/useUsers';
import {
  ALL_TODO_CATEGORIES,
  TODO_CATEGORY_LABELS,
  TODO_CATEGORY_COLORS,
  TODO_PRIORITY_LABELS,
  TODO_VISIBILITY_LABELS,
  effectiveTodoAssignee,
  effectiveTodoVisibility,
  defaultTodoVisibility,
  type UserTask,
  type TodoCategory,
  type TodoPriority,
  type TodoVisibility,
} from '../types';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none';

const PRIORITIES: TodoPriority[] = ['low', 'normal', 'high'];

// Sort weight for active tasks — lower sorts higher (high priority first).
const PRIORITY_RANK: Record<TodoPriority, number> = { high: 0, normal: 1, low: 2 };

// Person-scoped views: tasks on my plate / tasks I handed out / the whole
// company board (every 'company'-visible task).
type TodoView = 'mine' | 'delegated' | 'team';
const VIEW_LABELS: Record<TodoView, string> = {
  mine: 'My tasks',
  delegated: 'Delegated',
  team: 'Team',
};

// ── date helpers ────────────────────────────────────────────────────────────
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 'YYYY-MM-DD' (local) → Unix ms at local midnight, or undefined. */
function dateInputToMs(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).getTime();
}

/** Unix ms → 'YYYY-MM-DD' (local) for <input type="date">. */
function msToDateInput(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── small presentational pieces ──────────────────────────────────────────────
function CategoryChip({ category }: { category: TodoCategory }) {
  const color = TODO_CATEGORY_COLORS[category];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      {TODO_CATEGORY_LABELS[category]}
    </span>
  );
}

function sortActive(tasks: UserTask[], today: number): UserTask[] {
  // Overdue first, then priority (high → normal → low), then soonest date.
  return [...tasks].sort((a, b) => {
    const aOver = a.dueDate !== undefined && a.dueDate < today ? 0 : 1;
    const bOver = b.dueDate !== undefined && b.dueDate < today ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    const ap = PRIORITY_RANK[a.priority ?? 'normal'];
    const bp = PRIORITY_RANK[b.priority ?? 'normal'];
    if (ap !== bp) return ap - bp;
    const ad = a.dueDate ?? a.scheduledDate ?? Infinity;
    const bd = b.dueDate ?? b.scheduledDate ?? Infinity;
    if (ad !== bd) return ad - bd;
    return b.createdAt - a.createdAt;
  });
}

export default function TodoListTool() {
  const { tasks, loading, createTask, updateTask, toggleDone, archiveTask, restoreTask } =
    useUserTasks();
  const { user } = useAuth();
  const { users } = useUsers();
  const uid = user?.uid ?? '';

  const usersById = useMemo(() => {
    const map = new Map<string, UserRecord>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);
  const nameOf = (taskUid: string) =>
    taskUid === uid ? 'me' : userLabel(usersById.get(taskUid));

  // quick-add state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TodoCategory>('admin');
  const [priority, setPriority] = useState<TodoPriority>('normal');
  const [assignee, setAssignee] = useState(''); // '' ⇒ myself
  const [dueInput, setDueInput] = useState('');
  const [scheduledInput, setScheduledInput] = useState('');
  const [saving, setSaving] = useState(false);

  // filters / view
  const [view, setView] = useState<TodoView>('mine');
  const [status, setStatus] = useState<'active' | 'done'>('active');
  const [showArchived, setShowArchived] = useState(false);
  const [filterCategory, setFilterCategory] = useState<TodoCategory | 'all'>('all');
  const [filterPerson, setFilterPerson] = useState<string>('all'); // Team view only

  const [editing, setEditing] = useState<UserTask | null>(null);

  const today = startOfToday();

  const { activeTasks, doneTasks, archivedTasks } = useMemo(() => {
    const inView = (t: UserTask) => {
      switch (view) {
        case 'mine':
          return effectiveTodoAssignee(t) === uid;
        case 'delegated':
          return t.ownerUid === uid && effectiveTodoAssignee(t) !== uid;
        case 'team':
          return effectiveTodoVisibility(t) === 'company';
      }
    };
    const byFilters = (t: UserTask) =>
      (filterCategory === 'all' || t.category === filterCategory) &&
      (view !== 'team' || filterPerson === 'all' || effectiveTodoAssignee(t) === filterPerson);
    const scoped = tasks.filter((t) => inView(t) && byFilters(t));

    const live = scoped.filter((t) => t.archivedAt === undefined);
    return {
      activeTasks: sortActive(
        live.filter((t) => t.status !== 'done'),
        today,
      ),
      doneTasks: live
        .filter((t) => t.status === 'done')
        .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)),
      archivedTasks: scoped
        .filter((t) => t.archivedAt !== undefined)
        .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
    };
  }, [tasks, view, filterCategory, filterPerson, uid, today]);

  const handleAdd = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await createTask({
        title: trimmed,
        category,
        priority,
        assigneeUid: assignee || undefined,
        visibility: defaultTodoVisibility(category),
        dueDate: dateInputToMs(dueInput),
        scheduledDate: dateInputToMs(scheduledInput),
      });
      setTitle('');
      setDueInput('');
      setScheduledInput('');
      setPriority('normal');
      setAssignee('');
    } finally {
      setSaving(false);
    }
  };

  const list = showArchived ? archivedTasks : status === 'active' ? activeTasks : doneTasks;

  const emptyMessage = showArchived
    ? 'No archived tasks here.'
    : status === 'done'
      ? "No completed tasks yet — they'll show here once checked off."
      : view === 'mine'
        ? 'Nothing on your list. Add a task above to get started.'
        : view === 'delegated'
          ? "You haven't assigned any tasks to teammates."
          : 'No company-visible tasks match these filters.';

  return (
    <Layout>
      <main className="py-6 space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-[#201F1E]">To-Do List</h1>
        </div>

        {/* Quick add */}
        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Task</label>
              <input
                className={inputClass}
                placeholder="What needs to get done?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Category</label>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value as TodoCategory)}
              >
                {ALL_TODO_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {TODO_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-44">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Assign to</label>
              <select
                className={inputClass}
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">Myself</option>
                {users
                  .filter((u) => u.id !== uid)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {userLabel(u)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="w-full sm:w-32">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Priority</label>
              <select
                className={inputClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value as TodoPriority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TODO_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Due</label>
              <input
                type="date"
                className={inputClass}
                value={dueInput}
                onChange={(e) => setDueInput(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-[#7A756E] mb-1">Do on</label>
              <input
                type="date"
                className={inputClass}
                value={scheduledInput}
                onChange={(e) => setScheduledInput(e.target.value)}
              />
            </div>
            <Button onClick={handleAdd} disabled={!title.trim() || saving}>
              Add task
            </Button>
          </div>
          {category === 'personal' && (
            <p className="mt-2 text-xs text-[#7A756E]">
              Personal tasks are private — only you can see them.
            </p>
          )}
        </div>

        {/* View tabs + status toggle + filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-[#D8D5D0] overflow-hidden">
              {(Object.keys(VIEW_LABELS) as TodoView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setView(v);
                    setShowArchived(false);
                  }}
                  className={`px-4 py-2 text-sm font-medium transition ${
                    view === v
                      ? 'bg-[#ED202B] text-white'
                      : 'bg-white text-[#7A756E] hover:text-[#ED202B]'
                  }`}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-[#D8D5D0] overflow-hidden">
              {(['active', 'done'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStatus(s);
                    setShowArchived(false);
                  }}
                  className={`px-4 py-2 text-sm font-medium transition ${
                    status === s && !showArchived
                      ? 'bg-[#ED202B] text-white'
                      : 'bg-white text-[#7A756E] hover:text-[#ED202B]'
                  }`}
                >
                  {s === 'active' ? `To do (${activeTasks.length})` : `Done (${doneTasks.length})`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {view === 'team' && (
              <select
                className={`${inputClass} w-auto`}
                value={filterPerson}
                onChange={(e) => setFilterPerson(e.target.value)}
              >
                <option value="all">Everyone</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            )}
            <select
              className={`${inputClass} w-auto`}
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as TodoCategory | 'all')}
            >
              <option value="all">All categories</option>
              {ALL_TODO_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {TODO_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowArchived((s) => !s)}
              className={`text-xs font-medium transition ${
                showArchived ? 'text-[#ED202B]' : 'text-[#7A756E] hover:text-[#ED202B]'
              }`}
            >
              {showArchived ? 'Hide archived' : `Archived (${archivedTasks.length})`}
            </button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-sm text-[#7A756E]">Loading…</p>
        ) : list.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-8 text-center text-sm text-[#7A756E]">
            {emptyMessage}
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((task) => {
              const overdue =
                task.status !== 'done' && task.dueDate !== undefined && task.dueDate < today;
              const assigneeUid = effectiveTodoAssignee(task);
              const isPrivate = effectiveTodoVisibility(task) === 'private';
              return (
                <li
                  key={task.id}
                  className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] px-4 py-3 flex items-center gap-3"
                >
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    onChange={() => toggleDone(task)}
                    disabled={showArchived}
                    className="h-5 w-5 shrink-0 accent-[#ED202B] cursor-pointer disabled:cursor-default"
                    aria-label={task.status === 'done' ? 'Mark as not done' : 'Mark as done'}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium ${
                        task.status === 'done'
                          ? 'text-[#7A756E] line-through'
                          : 'text-[#201F1E]'
                      }`}
                    >
                      {task.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#7A756E]">
                      <CategoryChip category={task.category} />
                      {/* People context: who it's for, and who handed it over. */}
                      {assigneeUid !== uid && <span>→ {nameOf(assigneeUid)}</span>}
                      {assigneeUid === uid && task.ownerUid !== uid && (
                        <span>from {nameOf(task.ownerUid)}</span>
                      )}
                      {isPrivate && <span className="italic">Private</span>}
                      {task.priority === 'high' && (
                        <span className="font-semibold text-[#ED202B]">High</span>
                      )}
                      {task.status === 'doing' && <span>In progress</span>}
                      {showArchived ? (
                        <span>Archived {formatDate(task.archivedAt)}</span>
                      ) : status === 'done' ? (
                        task.completedAt && <span>Done {formatDate(task.completedAt)}</span>
                      ) : (
                        <>
                          {task.dueDate && (
                            <span className={overdue ? 'font-semibold text-[#ED202B]' : ''}>
                              Due {formatDate(task.dueDate)}
                              {overdue ? ' · overdue' : ''}
                            </span>
                          )}
                          {task.scheduledDate && <span>Do {formatDate(task.scheduledDate)}</span>}
                        </>
                      )}
                    </div>
                  </div>
                  {showArchived ? (
                    <button
                      onClick={() => restoreTask(task.id)}
                      className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditing(task)}
                      className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition"
                    >
                      Edit
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {editing && (
        <EditTaskModal
          task={editing}
          users={users}
          currentUid={uid}
          onClose={() => setEditing(null)}
          onSave={async (fields) => {
            await updateTask(editing.id, fields);
            setEditing(null);
          }}
          onArchive={async () => {
            await archiveTask(editing.id);
            setEditing(null);
          }}
        />
      )}
    </Layout>
  );
}

// ── edit modal ────────────────────────────────────────────────────────────────
function EditTaskModal({
  task,
  users,
  currentUid,
  onClose,
  onSave,
  onArchive,
}: {
  task: UserTask;
  users: UserRecord[];
  currentUid: string;
  onClose: () => void;
  onSave: (fields: Partial<UserTask>) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<TodoCategory>(task.category);
  const [priority, setPriority] = useState<TodoPriority>(task.priority ?? 'normal');
  const [assignee, setAssignee] = useState(effectiveTodoAssignee(task));
  const [visibility, setVisibility] = useState<TodoVisibility>(effectiveTodoVisibility(task));
  const [dueInput, setDueInput] = useState(msToDateInput(task.dueDate));
  const [scheduledInput, setScheduledInput] = useState(msToDateInput(task.scheduledDate));
  const [notes, setNotes] = useState(task.notes ?? '');
  const [busy, setBusy] = useState(false);

  // The assignee may be a removed user — keep them selectable so opening the
  // modal doesn't silently reassign the task.
  const assigneeKnown = users.some((u) => u.id === assignee);

  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onSave({
        title: title.trim(),
        category,
        priority,
        assigneeUid: assignee,
        visibility,
        dueDate: dateInputToMs(dueInput),
        scheduledDate: dateInputToMs(scheduledInput),
        notes: notes.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg border border-[#D8D5D0] w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-xl font-semibold text-[#201F1E]">Edit task</h2>
        <div>
          <label className="block text-xs font-medium text-[#7A756E] mb-1">Task</label>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Category</label>
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as TodoCategory)}
            >
              {ALL_TODO_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {TODO_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Priority</label>
            <select
              className={inputClass}
              value={priority}
              onChange={(e) => setPriority(e.target.value as TodoPriority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TODO_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Assignee</label>
            <select
              className={inputClass}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              {!assigneeKnown && <option value={assignee}>Unknown user</option>}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === currentUid ? 'Myself' : userLabel(u)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Visibility</label>
            <select
              className={inputClass}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as TodoVisibility)}
            >
              {(Object.keys(TODO_VISIBILITY_LABELS) as TodoVisibility[]).map((v) => (
                <option key={v} value={v}>
                  {TODO_VISIBILITY_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Due</label>
            <input
              type="date"
              className={inputClass}
              value={dueInput}
              onChange={(e) => setDueInput(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Do on</label>
            <input
              type="date"
              className={inputClass}
              value={scheduledInput}
              onChange={(e) => setScheduledInput(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#7A756E] mb-1">Notes</label>
          <textarea
            className={inputClass}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {visibility === 'private' && (
          <p className="text-xs text-[#7A756E]">
            Private tasks are visible only to the creator and the assignee.
          </p>
        )}
        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" onClick={onArchive}>
            Archive
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!title.trim() || busy}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
