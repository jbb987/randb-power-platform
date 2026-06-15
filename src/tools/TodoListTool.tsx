import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import { useUserTasks, useArchivedUserTasks } from '../hooks/useUserTasks';
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

// My Work = organize your own plate; Team = the company board grouped by
// person; Week = the meeting view (people × days grid, presentable fullscreen).
type TodoView = 'my' | 'team' | 'week';
const VIEW_LABELS: Record<TodoView, string> = { my: 'My Work', team: 'Team', week: 'Week' };

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

/** Short, calm date for row faces: "Jun 14" (year only if not this year). */
function formatShortDate(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// ── people helpers ───────────────────────────────────────────────────────────

// Restrained, brand-compatible hues for avatars — deterministic per uid so a
// person keeps their color everywhere.
const AVATAR_COLORS = [
  '#2563EB', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#7C3AED', // violet
  '#EC4899', // pink
  '#0EA5E9', // sky
  '#B45309', // burnt orange
  '#6B7280', // slate-gray
];

function avatarColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initialsFor(user: UserRecord | undefined): string {
  if (!user) return '?';
  const name = user.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}

function Avatar({
  uid,
  user,
  size = 'sm',
}: {
  uid: string;
  user: UserRecord | undefined;
  size?: 'sm' | 'md';
}) {
  const color = avatarColor(uid);
  const cls = size === 'md' ? 'h-8 w-8 text-xs' : 'h-5 w-5 text-[9px]';
  return (
    <span
      className={`${cls} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: color }}
      title={userLabel(user)}
    >
      {initialsFor(user)}
    </span>
  );
}

/** Monday-based start of the week containing `ms`, at local midnight. */
function startOfWeek(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - day);
  return d.getTime();
}

/**
 * Calendar-correct day stepping. Never add raw 24h multiples to a midnight
 * timestamp — DST transition days are 23h/25h long and fixed-ms arithmetic
 * drifts off local midnight (wrong day labels, vanished tasks twice a year).
 */
function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Row-face date: "Today" / "Tomorrow" beat calendar dates for scanning. */
function formatRelativeDate(ms: number, today: number): string {
  if (ms >= today && ms < addDays(today, 1)) return 'Today';
  if (ms >= addDays(today, 1) && ms < addDays(today, 2)) return 'Tomorrow';
  return formatShortDate(ms);
}

/** Date field that opens the calendar on click anywhere, not just the icon. */
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      className={`${inputClass} cursor-pointer`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => {
        try {
          e.currentTarget.showPicker();
        } catch {
          // Older browsers without showPicker keep the native icon behavior.
        }
      }}
    />
  );
}

/** Quiet category signal for row faces: a small colored dot, name on hover. */
function CategoryDot({ category }: { category: TodoCategory }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: TODO_CATEGORY_COLORS[category] }}
      title={TODO_CATEGORY_LABELS[category]}
    />
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

  // All task creation goes through the New-task window. The value, when set,
  // holds prefilled defaults (e.g. a Week-cell click seeds assignee + day);
  // an empty object means a blank new task.
  const [creating, setCreating] = useState<Partial<UserTask> | null>(null);

  // ── view state ──
  const [view, setView] = useState<TodoView>('my');
  const [status, setStatus] = useState<'active' | 'done'>('active');
  const [showArchived, setShowArchived] = useState(false);
  const [filterCategory, setFilterCategory] = useState<TodoCategory | 'all'>('all');
  const [filterPerson, setFilterPerson] = useState<string>('all'); // Team only
  const [assignedByMe, setAssignedByMe] = useState(false); // Team only — delegation tracker
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<UserTask | null>(null);

  // Week (meeting) view: which week is shown + fullscreen presentation mode.
  const [weekStart, setWeekStart] = useState(() => startOfWeek(startOfToday()));
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting]);

  const today = startOfToday();

  // Shared view + filter predicates. Team view shows the company board PLUS
  // the viewer's own delegations whatever their visibility — a private task
  // assigned to someone else must stay reachable by its creator (only the
  // creator receives it; nobody else's subscription matches it).
  const scopeTask = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (t: UserTask) => {
      const inView =
        view === 'my'
          ? effectiveTodoAssignee(t) === uid
          : effectiveTodoVisibility(t) === 'company' ||
            (t.ownerUid === uid && effectiveTodoAssignee(t) !== uid);
      return (
        inView &&
        (filterCategory === 'all' || t.category === filterCategory) &&
        (q === '' ||
          t.title.toLowerCase().includes(q) ||
          (t.notes ?? '').toLowerCase().includes(q)) &&
        (view !== 'team' ||
          ((filterPerson === 'all' || effectiveTodoAssignee(t) === filterPerson) &&
            (!assignedByMe || (t.ownerUid === uid && effectiveTodoAssignee(t) !== uid))))
      );
    };
  }, [view, filterCategory, filterPerson, assignedByMe, search, uid]);

  const { activeTasks, doneTasks } = useMemo(() => {
    const live = tasks.filter(scopeTask);
    return {
      activeTasks: sortActive(
        live.filter((t) => t.status !== 'done'),
        today,
      ),
      doneTasks: live
        .filter((t) => t.status === 'done')
        .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)),
    };
  }, [tasks, scopeTask, today]);

  // Archived tasks live in their own on-demand subscription (the main
  // listener excludes them server-side so it doesn't grow forever).
  const { archivedTasks: archivedRaw, loading: archivedLoading } =
    useArchivedUserTasks(showArchived);
  const archivedTasks = useMemo(
    () =>
      archivedRaw.filter(scopeTask).sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
    [archivedRaw, scopeTask],
  );

  const list = showArchived ? archivedTasks : status === 'active' ? activeTasks : doneTasks;

  // My Work groups active tasks into sections by due/"do on" date:
  // Overdue, Today, This week, Next week, Week of <date>…, then No date.
  const weekSections = useMemo(() => {
    if (view !== 'my' || showArchived || status !== 'active') return [];
    const thisWeek = startOfWeek(today);
    // key: week start ms; -1 overdue; 0 today; Infinity no date. 0 sorts
    // ahead of any real week-start timestamp, so Today lands after Overdue.
    const sections = new Map<number, UserTask[]>();
    activeTasks.forEach((t) => {
      const date = t.dueDate ?? t.scheduledDate;
      const key =
        t.dueDate !== undefined && t.dueDate < today
          ? -1
          : date === undefined
            ? Infinity
            : date >= today && date < addDays(today, 1)
              ? 0
              : startOfWeek(date);
      sections.set(key, [...(sections.get(key) ?? []), t]);
    });
    const label = (key: number): string => {
      if (key === -1) return 'Overdue';
      if (key === 0) return 'Today';
      if (key === Infinity) return 'No date';
      if (key === thisWeek) return 'This week';
      if (key === addDays(thisWeek, 7)) return 'Next week';
      if (key < thisWeek) return 'This week'; // dated earlier but not overdue (scheduled past, no due)
      return `Week of ${formatShortDate(key)}`;
    };
    // Merge any pre-this-week keys into the This-week bucket the label points at.
    const ordered = [...sections.keys()].sort((a, b) => a - b);
    const out: { key: number; label: string; tasks: UserTask[] }[] = [];
    ordered.forEach((key) => {
      const l = label(key);
      const prev = out.find((s) => s.label === l);
      if (prev) prev.tasks.push(...(sections.get(key) ?? []));
      else out.push({ key, label: l, tasks: sections.get(key) ?? [] });
    });
    return out;
  }, [view, showArchived, status, activeTasks, today]);

  // Done gets week sections too, by completion date, newest week first:
  // This week, Last week, Week of <date>…
  const doneSections = useMemo(() => {
    if (view !== 'my' || showArchived || status !== 'done') return [];
    const thisWeek = startOfWeek(today);
    const sections = new Map<number, UserTask[]>();
    doneTasks.forEach((t) => {
      const key = startOfWeek(t.completedAt ?? t.updatedAt);
      sections.set(key, [...(sections.get(key) ?? []), t]);
    });
    const label = (key: number): string => {
      if (key >= thisWeek) return 'This week';
      if (key === addDays(thisWeek, -7)) return 'Last week';
      return `Week of ${formatShortDate(key)}`;
    };
    return [...sections.keys()]
      .sort((a, b) => b - a)
      .map((key) => ({ key, label: label(key), tasks: sections.get(key) ?? [] }));
  }, [view, showArchived, status, doneTasks, today]);

  // Week board: one row per person, tasks placed on the day they're due /
  // planned (done tasks by completion day). Company-visible tasks only —
  // it's a meeting screen. Undated tasks are not shown (the Week view is a
  // calendar); manage their date from the task window or My Work / Team.
  const weekBoard = useMemo(() => {
    if (view !== 'week') return [];
    // Calendar-day boundaries (addDays, not raw 24h steps — see addDays note).
    const dayBounds = Array.from({ length: 8 }, (_, i) => addDays(weekStart, i));
    const weekEnd = dayBounds[7];
    const inWeek = (ms?: number) => ms !== undefined && ms >= weekStart && ms < weekEnd;
    const dayIdx = (ms: number) => {
      for (let i = 6; i >= 0; i--) if (ms >= dayBounds[i]) return i;
      return 0;
    };
    const rows = new Map<string, { days: UserTask[][] }>();
    // The main subscription already excludes archived tasks server-side.
    tasks
      .filter((t) => effectiveTodoVisibility(t) === 'company')
      .forEach((t) => {
        const date = t.dueDate ?? t.scheduledDate;
        let slot: number | null = null;
        if (t.status === 'done') {
          // Done belongs to the week it was finished in; fall back to its date.
          if (inWeek(t.completedAt)) slot = dayIdx(t.completedAt as number);
          else if (inWeek(date)) slot = dayIdx(date as number);
        } else if (inWeek(date)) {
          slot = dayIdx(date as number);
        }
        if (slot === null) return;
        const a = effectiveTodoAssignee(t);
        const row = rows.get(a) ?? {
          days: Array.from({ length: 7 }, () => [] as UserTask[]),
        };
        row.days[slot].push(t);
        rows.set(a, row);
      });
    const ordered: { uid: string; days: UserTask[][] }[] = [];
    users.forEach((u) => {
      const r = rows.get(u.id);
      if (r) {
        ordered.push({ uid: u.id, ...r });
        rows.delete(u.id);
      }
    });
    rows.forEach((r, a) => ordered.push({ uid: a, ...r }));
    return ordered;
  }, [view, tasks, users, weekStart]);

  // Weekend columns only appear when something is actually scheduled there.
  const weekDayCount = weekBoard.some((r) => r.days[5].length > 0 || r.days[6].length > 0)
    ? 7
    : 5;

  // Team view groups by assignee: directory order first, unknown uids last.
  const teamGroups = useMemo(() => {
    if (view !== 'team') return [];
    const byAssignee = new Map<string, UserTask[]>();
    list.forEach((t) => {
      const a = effectiveTodoAssignee(t);
      byAssignee.set(a, [...(byAssignee.get(a) ?? []), t]);
    });
    const ordered: { uid: string; tasks: UserTask[] }[] = [];
    users.forEach((u) => {
      const ts = byAssignee.get(u.id);
      if (ts) {
        ordered.push({ uid: u.id, tasks: ts });
        byAssignee.delete(u.id);
      }
    });
    byAssignee.forEach((ts, a) => ordered.push({ uid: a, tasks: ts }));
    return ordered;
  }, [view, list, users]);

  const emptyMessage = showArchived
    ? 'No archived tasks here.'
    : status === 'done'
      ? 'Nothing completed yet.'
      : view === 'my'
        ? 'Nothing on your list. Click + New task to get started.'
        : 'No company tasks match these filters.';

  // Row face: checkbox + title + quiet right-aligned signals. Everything else
  // is on the "back of the card" — click the row to open it.
  const renderRow = (task: UserTask, opts?: { hideAssignee?: boolean }) => {
    const overdue =
      task.status !== 'done' && task.dueDate !== undefined && task.dueDate < today;
    const assigneeUid = effectiveTodoAssignee(task);
    const isPrivate = effectiveTodoVisibility(task) === 'private';
    const delegatedToMe = assigneeUid === uid && task.ownerUid !== uid;
    const showAvatarFor = !opts?.hideAssignee && assigneeUid !== uid ? assigneeUid : delegatedToMe ? task.ownerUid : null;
    const rowDate = showArchived
      ? task.archivedAt
      : status === 'done'
        ? task.completedAt
        : (task.dueDate ?? task.scheduledDate);
    return (
      <li key={task.id}>
        <div
          onClick={() => {
            if (!showArchived) setEditing(task);
          }}
          className={`flex items-center gap-3 px-4 py-3 transition ${
            showArchived ? '' : 'cursor-pointer hover:bg-[#FAFAF9]'
          }`}
        >
          <input
            type="checkbox"
            checked={task.status === 'done'}
            onChange={() => toggleDone(task)}
            onClick={(e) => e.stopPropagation()}
            disabled={showArchived}
            className="h-[18px] w-[18px] shrink-0 accent-[#ED202B] cursor-pointer disabled:cursor-default"
            aria-label={task.status === 'done' ? 'Mark as not done' : 'Mark as done'}
          />
          <span className="flex-1 min-w-0">
            <span
              className={`block truncate text-[15px] ${
                task.status === 'done' ? 'text-[#7A756E] line-through' : 'text-[#201F1E]'
              }`}
            >
              {task.title}
              {task.status === 'doing' && (
                <span className="ml-2 text-xs font-medium text-[#7A756E]">in progress</span>
              )}
            </span>
            {task.notes && (
              <span className="block truncate text-xs text-[#7A756E] mt-0.5">{task.notes}</span>
            )}
          </span>
          <span className="flex items-center gap-2.5 shrink-0 text-xs text-[#7A756E]">
            {isPrivate && (
              <svg viewBox="0 0 16 16" className="h-3 w-3 fill-[#7A756E]" aria-label="Private">
                <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
              </svg>
            )}
            {task.priority === 'high' && !showArchived && status === 'active' && (
              <span className="font-semibold text-[#ED202B]">!</span>
            )}
            {showAvatarFor && (
              <span className="inline-flex items-center gap-1">
                {delegatedToMe && !opts?.hideAssignee && 'from'}
                <Avatar uid={showAvatarFor} user={usersById.get(showAvatarFor)} />
              </span>
            )}
            {rowDate && (
              <span className={overdue ? 'font-semibold text-[#ED202B]' : ''}>
                {showArchived || status === 'done'
                  ? formatShortDate(rowDate)
                  : formatRelativeDate(rowDate, today)}
              </span>
            )}
            <CategoryDot category={task.category} />
            {showArchived && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  restoreTask(task.id);
                }}
                className="text-xs font-medium text-[#7A756E] hover:text-[#ED202B] transition"
              >
                Restore
              </button>
            )}
          </span>
        </div>
      </li>
    );
  };

  return (
    <Layout>
      <main className="py-6 space-y-5">
        {/* Header: title + view tabs + quiet controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-3xl font-semibold text-[#201F1E]">To-Do</h1>
          <div className="inline-flex rounded-lg border border-[#D8D5D0] overflow-hidden">
            {(['my', 'team', 'week'] as const).map((v) => (
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
        </div>

        {view === 'week' ? (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4">
            <WeekBoard
              board={weekBoard}
              weekStart={weekStart}
              today={today}
              dayCount={weekDayCount}
              usersById={usersById}
              currentUid={uid}
              presenting={false}
              onWeekChange={setWeekStart}
              onPresent={() => setPresenting(true)}
              onOpenTask={setEditing}
              onToggleDone={toggleDone}
              onQuickAdd={(assigneeUid, dayMs) =>
                setCreating({ assigneeUid, dueDate: dayMs, visibility: 'company' })
              }
              onMoveTask={(task, assigneeUid, dueDate) => {
                const fields: Partial<UserTask> = { assigneeUid, dueDate };
                // Fold away any legacy "Do on" so the new placement sticks
                // (otherwise scheduledDate would resurface via the fallback).
                if (task.scheduledDate !== undefined) fields.scheduledDate = undefined;
                updateTask(task.id, fields);
              }}
            />
          </div>
        ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden">
          <button
            onClick={() => setCreating({})}
            className="w-full px-4 py-3 flex items-center gap-3 border-b border-[#EEECE9] text-left transition hover:bg-[#FAFAF9] group"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ED202B] text-lg leading-none text-white transition group-hover:bg-[#9B0E18]">
              +
            </span>
            <span className="text-[15px] font-medium text-[#7A756E] transition group-hover:text-[#201F1E]">
              New task
            </span>
          </button>

          {/* Quiet control strip */}
          <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#EEECE9] bg-[#FAFAF9] text-xs">
            <div className="flex items-center gap-1 font-medium">
              {(['active', 'done'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStatus(s);
                    setShowArchived(false);
                  }}
                  className={`rounded-md px-2.5 py-1 transition ${
                    status === s && !showArchived
                      ? 'bg-[#ED202B]/10 text-[#ED202B]'
                      : 'text-[#7A756E] hover:text-[#ED202B]'
                  }`}
                >
                  {s === 'active' ? `To do ${activeTasks.length}` : `Done ${doneTasks.length}`}
                </button>
              ))}
              <button
                onClick={() => setShowArchived((x) => !x)}
                className={`rounded-md px-2.5 py-1 transition ${
                  showArchived
                    ? 'bg-[#ED202B]/10 text-[#ED202B]'
                    : 'text-[#7A756E] hover:text-[#ED202B]'
                }`}
              >
                Archived{showArchived ? ` ${archivedTasks.length}` : ''}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                className="w-28 rounded-md border border-[#D8D5D0] bg-white px-2 py-1 text-xs placeholder-[#A8A29B] focus:outline-none focus:border-[#ED202B] focus:w-44 transition-all"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {view === 'team' && (
                <>
                  <label className="inline-flex items-center gap-1.5 font-medium text-[#7A756E] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignedByMe}
                      onChange={(e) => setAssignedByMe(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#ED202B]"
                    />
                    Assigned by me
                  </label>
                  <select
                    className="rounded-md border border-[#D8D5D0] bg-white px-2 py-1 text-xs focus:outline-none focus:border-[#ED202B]"
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
                </>
              )}
              <select
                className="rounded-md border border-[#D8D5D0] bg-white px-2 py-1 text-xs focus:outline-none focus:border-[#ED202B]"
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
            </div>
          </div>

          {/* List */}
          {loading || (showArchived && archivedLoading) ? (
            <p className="px-4 py-6 text-sm text-[#7A756E]">Loading…</p>
          ) : list.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#7A756E]">{emptyMessage}</p>
          ) : view === 'my' ? (
            weekSections.length > 0 || doneSections.length > 0 ? (
              <div className="divide-y divide-[#EEECE9]">
                {(weekSections.length > 0 ? weekSections : doneSections).map((section) => (
                  <section key={section.key}>
                    <div className="px-4 pt-3.5 pb-1.5 flex items-baseline gap-2">
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          section.label === 'Overdue' ? 'text-[#ED202B]' : 'text-[#7A756E]'
                        }`}
                      >
                        {section.label}
                      </span>
                      <span className="text-xs text-[#A8A29B]">{section.tasks.length}</span>
                    </div>
                    <ul className="divide-y divide-[#EEECE9]">
                      {section.tasks.map((t) => renderRow(t))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-[#EEECE9]">{list.map((t) => renderRow(t))}</ul>
            )
          ) : (
            <div className="divide-y divide-[#EEECE9]">
              {teamGroups.map((group) => (
                <section key={group.uid}>
                  <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#FAFAF9] border-b border-[#EEECE9]">
                    <Avatar uid={group.uid} user={usersById.get(group.uid)} size="md" />
                    <span className="font-heading text-sm font-semibold text-[#201F1E]">
                      {group.uid === uid ? 'Me' : userLabel(usersById.get(group.uid))}
                    </span>
                    <span className="text-xs text-[#7A756E]">
                      {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                  <ul className="divide-y divide-[#EEECE9]">
                    {group.tasks.map((t) => renderRow(t, { hideAssignee: true }))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        )}
      </main>

      {/* Fullscreen presentation overlay for the Week board */}
      {presenting && (
        <div className="fixed inset-0 z-[60] bg-[#FAFAF9] overflow-auto">
          <div className="min-h-full p-8">
            <WeekBoard
              board={weekBoard}
              weekStart={weekStart}
              today={today}
              dayCount={weekDayCount}
              usersById={usersById}
              currentUid={uid}
              presenting
              onWeekChange={setWeekStart}
              onPresent={() => setPresenting(false)}
              onOpenTask={setEditing}
            />
          </div>
        </div>
      )}

      {creating && (
        <TaskModal
          prefill={creating}
          users={users}
          currentUid={uid}
          onClose={() => setCreating(null)}
          onSave={async (fields) => {
            await createTask({
              title: fields.title ?? '',
              category: fields.category ?? 'admin',
              priority: fields.priority,
              assigneeUid: fields.assigneeUid,
              visibility: fields.visibility,
              dueDate: fields.dueDate,
              notes: fields.notes,
            });
            setCreating(null);
          }}
        />
      )}
      {editing && (
        <TaskModal
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

// ── week board drag-and-drop pieces ─────────────────────────────────────────
// A move is just a field write: drop a chip on another person/day to change its
// assignee + Due date. updateTask handles the rest; the live subscription
// re-renders the board.

function chipClassName(done: boolean, presenting: boolean, dragging?: boolean): string {
  return `block w-full text-left rounded-md border px-2 py-1.5 leading-snug transition hover:border-[#ED202B]/40 ${
    done ? 'border-[#EEECE9] bg-[#FAFAF9]' : 'border-[#D8D5D0] bg-white'
  } ${presenting ? 'text-sm' : 'text-xs'} ${dragging ? 'opacity-30' : ''}`;
}

function ChipBody({ task }: { task: UserTask }) {
  const done = task.status === 'done';
  return (
    <span className="flex items-start gap-1.5">
      <span className="mt-[5px]">
        <CategoryDot category={task.category} />
      </span>
      <span className={done ? 'line-through text-[#7A756E]' : 'text-[#201F1E]'}>{task.title}</span>
    </span>
  );
}

/** A task chip that opens on click and (when enabled) can be dragged to a cell.
 *  When `onToggleDone` is supplied, a leading checkbox lets you mark the task
 *  done straight from the board (the rest of the chip still opens it). */
function DraggableChip({
  task,
  presenting,
  enabled,
  onOpen,
  onToggleDone,
}: {
  task: UserTask;
  presenting: boolean;
  enabled: boolean;
  onOpen: (t: UserTask) => void;
  onToggleDone?: (t: UserTask) => void;
}) {
  // Done tasks sit on their completion day, so dragging one would snap back —
  // only open chips are draggable. (They still open on click.)
  const canDrag = enabled && task.status !== 'done';
  const done = task.status === 'done';
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !canDrag,
  });
  // The container carries the drag listeners (a div, since it now holds a
  // checkbox + an open button — buttons can't nest). We deliberately omit
  // dnd-kit's `attributes` here: they'd put role="button" + a dead tab-stop on
  // the wrapper (there's no KeyboardSensor, so no keyboard drag to enable) and
  // nest interactive controls inside a role="button". The checkbox stops its
  // own pointer/click events so toggling done never starts a drag or opens the
  // task window.
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={`${chipClassName(done, presenting, isDragging)} flex items-start gap-1.5 ${
        canDrag ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      {onToggleDone && (
        <input
          type="checkbox"
          checked={done}
          onChange={() => onToggleDone(task)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-pointer accent-[#ED202B]"
          aria-label={done ? 'Mark as not done' : 'Mark as done'}
        />
      )}
      <button onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <ChipBody task={task} />
      </button>
    </div>
  );
}

/** A day cell that accepts a dropped chip (reassign + reschedule). */
function DroppableCell({
  id,
  data,
  enabled,
  className,
  children,
}: {
  id: string;
  data: { assigneeUid: string; dueDate: number };
  enabled: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled: !enabled });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? 'ring-2 ring-inset ring-[#ED202B]/50 bg-[#FFF1F1]' : ''}`}
    >
      {children}
    </div>
  );
}

// ── week board (meeting view): people × days grid ───────────────────────────
function WeekBoard({
  board,
  weekStart,
  today,
  dayCount,
  usersById,
  currentUid,
  presenting,
  onWeekChange,
  onPresent,
  onOpenTask,
  onToggleDone,
  onQuickAdd,
  onMoveTask,
}: {
  board: { uid: string; days: UserTask[][] }[];
  weekStart: number;
  today: number;
  dayCount: number;
  usersById: Map<string, UserRecord>;
  currentUid: string;
  presenting: boolean;
  onWeekChange: (ms: number) => void;
  onPresent: () => void;
  onOpenTask: (t: UserTask) => void;
  // Quick done-toggle on each chip. Omitted in Present mode (read-only).
  onToggleDone?: (t: UserTask) => void;
  // Click an empty spot in a person's cell to add a task there. `dayMs` is the
  // cell's day (the new task's Due date). Omitted in Present mode so the
  // projection stays read-only.
  onQuickAdd?: (assigneeUid: string, dayMs: number) => void;
  // Drag a chip to a cell: reassign + reschedule onto that day. Omitted in
  // Present mode (read-only).
  onMoveTask?: (task: UserTask, assigneeUid: string, dueDate: number) => void;
}) {
  const thisWeek = startOfWeek(today);
  const days = Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i));
  const dndEnabled = !!onMoveTask;
  const cols = dayCount;
  const navBtn =
    'flex h-7 w-7 items-center justify-center rounded-md border border-[#D8D5D0] text-[#7A756E] transition hover:text-[#ED202B] hover:border-[#ED202B]/40';

  // Drag-and-drop wiring. Sensors: mouse needs an 8px move before a drag starts
  // (so a plain click still opens the task); touch needs a 200ms press (so a
  // quick swipe scrolls the board instead of grabbing a chip).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const [activeTask, setActiveTask] = useState<UserTask | null>(null);
  // A click fires right after a drop; this guard stops that stray click from
  // re-opening the task window.
  const justDragged = useRef(false);

  const openTask = (t: UserTask) => {
    if (justDragged.current) return;
    onOpenTask(t);
  };

  const handleDragStart = (e: DragStartEvent) => {
    justDragged.current = true;
    setActiveTask((e.active.data.current?.task as UserTask | undefined) ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
    const task = e.active.data.current?.task as UserTask | undefined;
    const target = e.over?.data.current as
      | { assigneeUid: string; dueDate: number }
      | undefined;
    if (!task || !target) return;
    const sameAssignee = effectiveTodoAssignee(task) === target.assigneeUid;
    const sameDate = (task.dueDate ?? task.scheduledDate) === target.dueDate;
    if (sameAssignee && sameDate) return; // dropped back where it already was
    onMoveTask?.(task, target.assigneeUid, target.dueDate);
  };

  // Hover-revealed quick-add target filling the rest of an empty cell. Sits
  // below any chips so it never overlaps a chip's own click. Hidden entirely
  // in Present mode (onQuickAdd omitted).
  const addBtn = (assigneeUid: string, dayMs: number) =>
    onQuickAdd ? (
      <button
        onClick={() => onQuickAdd(assigneeUid, dayMs)}
        className="block w-full rounded-md border border-dashed border-[#EEECE9] px-2 py-1 text-left text-xs font-medium text-[#A8A29B] opacity-0 transition group-hover:opacity-100 hover:border-[#ED202B]/40 hover:text-[#ED202B]"
        aria-label="Add task"
      >
        + Add
      </button>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            className={navBtn}
            onClick={() => onWeekChange(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            ‹
          </button>
          <span
            className={`font-heading font-semibold text-[#201F1E] ${
              presenting ? 'text-2xl' : 'text-base'
            }`}
          >
            {weekStart === thisWeek ? 'This week' : `Week of ${formatShortDate(weekStart)}`}
          </span>
          <span className="text-xs text-[#7A756E]">
            {formatShortDate(weekStart)} – {formatShortDate(addDays(weekStart, 6))}
          </span>
          <button
            className={navBtn}
            onClick={() => onWeekChange(addDays(weekStart, 7))}
            aria-label="Next week"
          >
            ›
          </button>
          {weekStart !== thisWeek && (
            <button
              onClick={() => onWeekChange(thisWeek)}
              className="text-xs font-medium text-[#ED202B] hover:underline"
            >
              Back to this week
            </button>
          )}
        </div>
        <Button onClick={onPresent}>{presenting ? 'Exit' : 'Present'}</Button>
      </div>

      {board.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#7A756E]">
          No company tasks scheduled this week.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          <div className="overflow-x-auto">
          <div
            className="grid gap-px rounded-lg border border-[#EEECE9] bg-[#EEECE9] overflow-hidden"
            style={{
              gridTemplateColumns: `${presenting ? 200 : 150}px repeat(${cols}, minmax(${
                presenting ? 150 : 110
              }px, 1fr))`,
            }}
          >
            {/* header row */}
            <div className="bg-[#FAFAF9] px-3 py-2" />
            {days.map((ms, i) => (
              <div
                key={ms}
                className={`bg-[#FAFAF9] px-3 py-2 text-xs font-semibold ${
                  ms === today ? 'text-[#ED202B]' : 'text-[#7A756E]'
                }`}
              >
                {DAY_NAMES[i]} {new Date(ms).getDate()}
                {ms === today && ' · Today'}
              </div>
            ))}

            {/* person rows */}
            {board.map((row) => {
              const all = row.days.flat();
              const doneCount = all.filter((t) => t.status === 'done').length;
              return (
                <Fragment key={row.uid}>
                  <div className="bg-white px-3 py-3 flex items-center gap-2.5">
                    <Avatar uid={row.uid} user={usersById.get(row.uid)} size="md" />
                    <div className="min-w-0">
                      <div
                        className={`font-heading font-semibold text-[#201F1E] truncate ${
                          presenting ? 'text-base' : 'text-sm'
                        }`}
                      >
                        {row.uid === currentUid ? 'Me' : userLabel(usersById.get(row.uid))}
                      </div>
                      <div className="text-xs text-[#7A756E]">
                        {doneCount}/{all.length} done
                      </div>
                    </div>
                  </div>
                  {days.map((ms, i) => (
                    <DroppableCell
                      key={ms}
                      id={`cell:${row.uid}:${ms}`}
                      data={{ assigneeUid: row.uid, dueDate: ms }}
                      enabled={dndEnabled}
                      className={`group px-1.5 py-1.5 space-y-1.5 ${
                        ms === today ? 'bg-[#FFF7F7]' : 'bg-white'
                      }`}
                    >
                      {row.days[i].map((t) => (
                        <DraggableChip
                          key={t.id}
                          task={t}
                          presenting={presenting}
                          enabled={dndEnabled}
                          onOpen={openTask}
                          onToggleDone={onToggleDone}
                        />
                      ))}
                      {addBtn(row.uid, ms)}
                    </DroppableCell>
                  ))}
                </Fragment>
              );
            })}
          </div>
          </div>
          <DragOverlay>
            {activeTask ? (
              <div
                className={`${chipClassName(
                  activeTask.status === 'done',
                  presenting,
                )} cursor-grabbing shadow-lg`}
              >
                <ChipBody task={activeTask} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

// ── task window (the "back of the card"; doubles as New-task when no task) ──
function TaskModal({
  task,
  prefill,
  users,
  currentUid,
  onClose,
  onSave,
  onArchive,
}: {
  task?: UserTask;
  // Seed values for a brand-new task (no `task`). A Week-cell click passes the
  // clicked person, the cell's day as the Due date, and company visibility so
  // the new task lands back in that cell. Ignored when editing an existing task.
  prefill?: Partial<UserTask>;
  users: UserRecord[];
  currentUid: string;
  onClose: () => void;
  onSave: (fields: Partial<UserTask>) => Promise<void>;
  onArchive?: () => Promise<void>;
}) {
  // Clicking a task opens the read view; editing is an explicit step.
  // New tasks (no task prop) go straight to the form.
  const [editMode, setEditMode] = useState(!task);
  const [title, setTitle] = useState(task?.title ?? '');
  const initialCategory = task?.category ?? prefill?.category ?? 'admin';
  const [category, setCategory] = useState<TodoCategory>(initialCategory);
  const [priority, setPriority] = useState<TodoPriority>(task?.priority ?? 'normal');
  const [assignee, setAssignee] = useState(
    task ? effectiveTodoAssignee(task) : (prefill?.assigneeUid ?? currentUid),
  );
  const [visibility, setVisibility] = useState<TodoVisibility>(
    task
      ? effectiveTodoVisibility(task)
      : (prefill?.visibility ?? defaultTodoVisibility(initialCategory)),
  );
  // Seed from the effective date. Legacy tasks may carry only the deprecated
  // scheduledDate ("Do on"); it should still show — and be editable — as "Due".
  const [dueInput, setDueInput] = useState(
    msToDateInput(task?.dueDate ?? task?.scheduledDate ?? prefill?.dueDate),
  );
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [busy, setBusy] = useState(false);

  // Close on Escape — quick keyboard exit, matching the click-outside behavior.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Click-outside-to-close, but only when the press *started* on the backdrop.
  // A naive onClick={onClose} also fires when you drag-select text inside an
  // input and release outside — silently closing and losing a half-typed task.
  const pressedBackdrop = useRef(false);
  const backdropProps = {
    onMouseDown: (e: React.MouseEvent) => {
      pressedBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
    },
  };

  const userById = (id: string) => users.find((u) => u.id === id);
  const personLabel = (id: string) =>
    id === currentUid ? 'Me' : userLabel(userById(id));

  // New tasks: picking a category re-derives the visibility default
  // (Personal ⇒ private); existing tasks keep whatever was chosen.
  const handleCategoryChange = (next: TodoCategory) => {
    setCategory(next);
    if (!task) setVisibility(defaultTodoVisibility(next));
  };

  // The assignee may be a removed user — keep them selectable so opening the
  // modal doesn't silently reassign the task.
  const assigneeKnown = users.some((u) => u.id === assignee);

  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const fields: Partial<UserTask> = {
        title: title.trim(),
        category,
        priority,
        assigneeUid: assignee,
        visibility,
        dueDate: dateInputToMs(dueInput),
        notes: notes.trim() || undefined,
      };
      if (task) {
        // Anyone can edit a shared task, so only write the fields this user
        // actually changed — a full-field write from a snapshot taken at
        // open-time would silently revert a teammate's concurrent edits.
        const baseline: Partial<UserTask> = {
          title: task.title,
          category: task.category,
          priority: task.priority ?? 'normal',
          assigneeUid: effectiveTodoAssignee(task),
          visibility: effectiveTodoVisibility(task),
          dueDate: task.dueDate,
          notes: task.notes,
        };
        for (const key of Object.keys(fields) as (keyof UserTask)[]) {
          if (fields[key] === baseline[key]) delete fields[key];
        }
        // One-time migration: fold a legacy "Do on" (scheduledDate) into the
        // single dueDate and drop it, so the merged-date model has one source
        // of truth — otherwise clearing the date wouldn't stick, since the old
        // scheduledDate would resurface through the dueDate ?? scheduledDate
        // read-fallback. Forced after the diff loop (these keys must always
        // write for such tasks, even when the visible date is unchanged).
        if (task.scheduledDate !== undefined) {
          fields.dueDate = dateInputToMs(dueInput);
          fields.scheduledDate = undefined; // → deleteField() in the lib
        }
      }
      await onSave(fields);
    } finally {
      setBusy(false);
    }
  };

  // ── read view ──
  if (task && !editMode) {
    const assigneeUid = effectiveTodoAssignee(task);
    const isPrivate = effectiveTodoVisibility(task) === 'private';
    const catColor = TODO_CATEGORY_COLORS[task.category];
    const overdue =
      task.status !== 'done' && task.dueDate !== undefined && task.dueDate < startOfToday();
    const chip = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium';
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        {...backdropProps}
      >
        <div
          className="bg-white rounded-xl shadow-lg border border-[#D8D5D0] w-full max-w-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Category-tinted header band */}
          <div
            className="px-6 py-3 flex items-center justify-between"
            style={{ backgroundColor: `${catColor}14`, borderBottom: `2px solid ${catColor}` }}
          >
            <span className="text-xs font-semibold" style={{ color: catColor }}>
              {TODO_CATEGORY_LABELS[task.category]}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                task.status === 'done'
                  ? 'bg-[#10B981]/15 text-[#0B815E]'
                  : task.status === 'doing'
                    ? 'bg-[#F59E0B]/15 text-[#B45309]'
                    : 'bg-[#6B7280]/10 text-[#6B7280]'
              }`}
            >
              {task.status === 'done' ? 'Done' : task.status === 'doing' ? 'In progress' : 'To do'}
            </span>
          </div>

          <div className="p-6 space-y-5">
            <h2 className="font-heading text-2xl font-semibold text-[#201F1E] leading-snug">
              {task.title}
            </h2>

            {/* People row */}
            <div className="flex items-center gap-3">
              <Avatar uid={assigneeUid} user={userById(assigneeUid)} size="md" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#201F1E]">
                  {personLabel(assigneeUid)}
                </div>
                <div className="text-xs text-[#7A756E]">Assignee</div>
              </div>
              {task.ownerUid !== assigneeUid && (
                <div className="ml-4 flex items-center gap-2 text-xs text-[#7A756E]">
                  assigned by
                  <Avatar uid={task.ownerUid} user={userById(task.ownerUid)} />
                  {personLabel(task.ownerUid)}
                </div>
              )}
            </div>

            {/* Signal chips */}
            <div className="flex flex-wrap gap-2">
              {task.dueDate && (
                <span
                  className={`${chip} ${
                    overdue
                      ? 'border-[#ED202B]/40 bg-[#ED202B]/5 text-[#ED202B]'
                      : 'border-[#D8D5D0] text-[#201F1E]'
                  }`}
                >
                  Due {formatShortDate(task.dueDate)}
                  {overdue && ' · overdue'}
                </span>
              )}
              {task.completedAt && (
                <span className={`${chip} border-[#10B981]/40 bg-[#10B981]/5 text-[#0B815E]`}>
                  Completed {formatShortDate(task.completedAt)}
                </span>
              )}
              {task.priority === 'high' && (
                <span className={`${chip} border-[#ED202B]/40 bg-[#ED202B]/5 text-[#ED202B]`}>
                  High priority
                </span>
              )}
              {task.priority === 'low' && (
                <span className={`${chip} border-[#D8D5D0] text-[#7A756E]`}>Low priority</span>
              )}
              {isPrivate && (
                <span className={`${chip} border-[#D8D5D0] text-[#7A756E]`}>
                  <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current">
                    <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
                  </svg>
                  Private
                </span>
              )}
            </div>

            {/* Description panel */}
            {task.notes ? (
              <div className="rounded-lg bg-[#FAFAF9] border border-[#EEECE9] p-4 text-sm text-[#201F1E] whitespace-pre-wrap leading-relaxed">
                {task.notes}
              </div>
            ) : (
              <p className="text-sm italic text-[#A8A29B]">No description.</p>
            )}

            {/* Archive lives only in Edit mode — keeping it off the read view
                prevents a stray double-click (e.g. on a calendar chip) from
                archiving a task outright. */}
            <div className="flex items-center justify-end pt-1">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={() => setEditMode(true)}>Edit</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── edit / create form ──
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      {...backdropProps}
    >
      <div
        className="bg-white rounded-xl shadow-lg border border-[#D8D5D0] w-full max-w-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-xl font-semibold text-[#201F1E]">
          {task ? 'Edit task' : 'New task'}
        </h2>
        <div>
          <label className="block text-xs font-medium text-[#7A756E] mb-1">Title</label>
          <input
            className={inputClass}
            value={title}
            placeholder="What needs to get done?"
            autoFocus={!task}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#7A756E] mb-1">Description</label>
          <textarea
            className={inputClass}
            rows={3}
            placeholder="Anything the assignee should know…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
            <label className="block text-xs font-medium text-[#7A756E] mb-1">Category</label>
            <select
              className={inputClass}
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as TodoCategory)}
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
            <DateInput value={dueInput} onChange={setDueInput} />
          </div>
        </div>
        {visibility === 'private' && (
          <p className="text-xs text-[#7A756E]">
            Private tasks are visible only to the creator and the assignee.
          </p>
        )}
        <div className={`flex items-center pt-1 ${onArchive ? 'justify-between' : 'justify-end'}`}>
          {onArchive && (
            <Button variant="ghost" onClick={onArchive}>
              Archive
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => (task ? setEditMode(false) : onClose())}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!title.trim() || busy}>
              {task ? 'Save' : 'Add task'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
