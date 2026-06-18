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
  ALL_TODO_STATUSES,
  TODO_CATEGORY_LABELS,
  TODO_CATEGORY_COLORS,
  TODO_PRIORITY_LABELS,
  TODO_STATUS_LABELS,
  TODO_VISIBILITY_LABELS,
  effectiveTodoAssignee,
  effectiveTodoVisibility,
  defaultTodoVisibility,
  type UserTask,
  type TodoCategory,
  type TodoPriority,
  type TodoStatus,
  type TodoVisibility,
} from '../types';

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white px-3 py-2 text-sm transition focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none';

const PRIORITIES: TodoPriority[] = ['low', 'normal', 'high'];

// Sort weight for active tasks — lower sorts higher (high priority first).
const PRIORITY_RANK: Record<TodoPriority, number> = { high: 0, normal: 1, low: 2 };

// Two scopes ("tabs"): Personal = your own plate; Company = the shared board.
// Each scope has three view modes:
//   • List     — date-grouped (Personal) / person-grouped (Company)
//   • Calendar — a Week or Month span (toggled in the nav): the days-as-columns /
//                people × days week boards, or a shared month grid
//   • Board    — Kanban by status (To do / In progress / Done), drag to advance
type TodoTab = 'personal' | 'company';
type TodoMode = 'list' | 'calendar' | 'board';
type CalendarSpan = 'week' | 'month';
const TAB_LABELS: Record<TodoTab, string> = { personal: 'Personal', company: 'Company' };
const MODE_LABELS: Record<TodoMode, string> = {
  list: 'List',
  calendar: 'Calendar',
  board: 'Board',
};

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

/** First day of the month containing `ms`, at local midnight. */
function startOfMonth(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

/** Step whole calendar months from a month-start (day-of-month preserved at 1). */
function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** "June 2026" — month label for the calendar's Month span. */
function formatMonthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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

/**
 * Builds the week-placement rule for the week starting at `weekStart`, shared by
 * both week boards. Returns the calendar-day slot (0=Mon … 6=Sun) a task sits in
 * — done tasks on their completion day (falling back to their date), open tasks
 * on their due/planned day — or null when the task isn't on this week's
 * calendar (undated, or dated outside the week). Day boundaries use addDays, not
 * raw 24h steps (see addDays note), and are computed once per call, not per task.
 */
function makeWeekPlacer(weekStart: number): (task: UserTask) => number | null {
  const dayBounds = Array.from({ length: 8 }, (_, i) => addDays(weekStart, i));
  const weekEnd = dayBounds[7];
  const inWeek = (ms?: number) => ms !== undefined && ms >= weekStart && ms < weekEnd;
  const dayIdx = (ms: number) => {
    for (let i = 6; i >= 0; i--) if (ms >= dayBounds[i]) return i;
    return 0;
  };
  return (task: UserTask) => {
    const date = task.dueDate ?? task.scheduledDate;
    if (task.status === 'done') {
      if (inWeek(task.completedAt)) return dayIdx(task.completedAt as number);
      if (inWeek(date)) return dayIdx(date as number);
      return null;
    }
    return inWeek(date) ? dayIdx(date as number) : null;
  };
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
  const {
    tasks,
    loading,
    createTask,
    updateTask,
    toggleDone,
    archiveTask,
    restoreTask,
    setStatus: setTaskStatus,
  } = useUserTasks();
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
  const [tab, setTab] = useState<TodoTab>('personal');
  const [mode, setMode] = useState<TodoMode>('list');
  const [calendarSpan, setCalendarSpan] = useState<CalendarSpan>('week');
  const [status, setStatus] = useState<'active' | 'done'>('active');
  const [showArchived, setShowArchived] = useState(false);
  const [filterCategory, setFilterCategory] = useState<TodoCategory | 'all'>('all');
  const [filterPerson, setFilterPerson] = useState<string>('all'); // Company only
  const [assignedByMe, setAssignedByMe] = useState(false); // Company only — delegation tracker
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<UserTask | null>(null);

  // Calendar view: which week / month is shown + fullscreen presentation mode.
  const [weekStart, setWeekStart] = useState(() => startOfWeek(startOfToday()));
  const [monthStart, setMonthStart] = useState(() => startOfMonth(startOfToday()));
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

  // Shared scope + filter predicates. The Company scope shows the company board
  // PLUS the viewer's own delegations whatever their visibility — a private task
  // assigned to someone else must stay reachable by its creator (only the
  // creator receives it; nobody else's subscription matches it).
  const scopeTask = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (t: UserTask) => {
      const inScope =
        tab === 'personal'
          ? effectiveTodoAssignee(t) === uid
          : effectiveTodoVisibility(t) === 'company' ||
            (t.ownerUid === uid && effectiveTodoAssignee(t) !== uid);
      return (
        inScope &&
        (filterCategory === 'all' || t.category === filterCategory) &&
        (q === '' ||
          t.title.toLowerCase().includes(q) ||
          (t.notes ?? '').toLowerCase().includes(q)) &&
        (tab !== 'company' ||
          ((filterPerson === 'all' || effectiveTodoAssignee(t) === filterPerson) &&
            (!assignedByMe || (t.ownerUid === uid && effectiveTodoAssignee(t) !== uid))))
      );
    };
  }, [tab, filterCategory, filterPerson, assignedByMe, search, uid]);

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

  // Personal list groups active tasks into sections by due/"do on" date:
  // Overdue, Today, This week, Next week, Week of <date>…, then No date.
  const weekSections = useMemo(() => {
    if (tab !== 'personal' || mode !== 'list' || showArchived || status !== 'active') return [];
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
  }, [tab, mode, showArchived, status, activeTasks, today]);

  // Done gets week sections too, by completion date, newest week first:
  // This week, Last week, Week of <date>…
  const doneSections = useMemo(() => {
    if (tab !== 'personal' || mode !== 'list' || showArchived || status !== 'done') return [];
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
  }, [tab, mode, showArchived, status, doneTasks, today]);

  // Week board: one row per person, tasks placed on the day they're due /
  // planned (done tasks by completion day). Company-visible tasks only —
  // it's a meeting screen. Undated tasks are not shown (the Week view is a
  // calendar); manage their date from the task window or My Work / Team.
  const weekBoard = useMemo(() => {
    if (!(tab === 'company' && mode === 'calendar' && calendarSpan === 'week')) return [];
    const placeInWeek = makeWeekPlacer(weekStart);
    const rows = new Map<string, { days: UserTask[][] }>();
    // The main subscription already excludes archived tasks server-side.
    tasks
      .filter((t) => effectiveTodoVisibility(t) === 'company')
      .forEach((t) => {
        const slot = placeInWeek(t);
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
  }, [tab, mode, calendarSpan, tasks, users, weekStart]);

  // Personal week: my tasks only, bucketed into the 7 day-columns of the shown
  // week. Same placement rule as the company board (done on completion day,
  // open tasks on their due/planned day); undated tasks aren't on the calendar.
  const personalWeek = useMemo(() => {
    if (!(tab === 'personal' && mode === 'calendar' && calendarSpan === 'week')) return null;
    const placeInWeek = makeWeekPlacer(weekStart);
    const days = Array.from({ length: 7 }, () => [] as UserTask[]);
    tasks
      .filter((t) => effectiveTodoAssignee(t) === uid)
      .forEach((t) => {
        const slot = placeInWeek(t);
        if (slot !== null) days[slot].push(t);
      });
    return days;
  }, [tab, mode, calendarSpan, tasks, uid, weekStart]);

  // Weekend columns only appear when something is actually scheduled there.
  const weekDayCount = (
    personalWeek
      ? personalWeek[5].length > 0 || personalWeek[6].length > 0
      : weekBoard.some((r) => r.days[5].length > 0 || r.days[6].length > 0)
  )
    ? 7
    : 5;

  // Month grid: a Mon-anchored 6×7 day matrix covering the shown month, each day
  // carrying the tasks dated on it (open tasks by due/planned day; done tasks by
  // completion day, falling back to their date). One shared grid for both tabs —
  // Personal shows my tasks, Company shows company-visible tasks (the chips carry
  // an assignee avatar). `scopeTask` is intentionally NOT applied: the calendar,
  // like the week boards, is a pure date view independent of the list filters.
  const monthGrid = useMemo(() => {
    if (!(mode === 'calendar' && calendarSpan === 'month')) return null;
    const gridStart = startOfWeek(monthStart);
    // 6 weeks (42 days) always fully covers any month from its Monday-aligned
    // start, so the grid shape is constant and never clips trailing days.
    const byDay = new Map<number, UserTask[]>();
    for (let i = 0; i < 42; i++) byDay.set(addDays(gridStart, i), []);
    // Floor a timestamp to local midnight and return it only if it's on the grid.
    const dayOnGrid = (ms?: number): number | undefined => {
      if (ms === undefined) return undefined;
      const day = addDays(ms, 0);
      return byDay.has(day) ? day : undefined;
    };
    const mine = (t: UserTask) =>
      tab === 'personal'
        ? effectiveTodoAssignee(t) === uid
        : effectiveTodoVisibility(t) === 'company';
    tasks.filter(mine).forEach((t) => {
      const date = t.dueDate ?? t.scheduledDate;
      const dayMs =
        t.status === 'done' ? (dayOnGrid(t.completedAt) ?? dayOnGrid(date)) : dayOnGrid(date);
      if (dayMs !== undefined) byDay.get(dayMs)!.push(t);
    });
    const cells = Array.from({ length: 42 }, (_, i) => {
      const ms = addDays(gridStart, i);
      return { ms, tasks: sortActive(byDay.get(ms) ?? [], today) };
    });
    return { gridStart, cells };
  }, [mode, calendarSpan, tab, tasks, uid, monthStart, today]);

  // Board (Kanban) columns: scoped + filtered tasks split by status. Built from
  // `tasks.filter(scopeTask)` so search / category / person filters apply, like
  // the List. Active columns sort by priority→date; Done by completion, newest.
  const boardColumns = useMemo(() => {
    if (mode !== 'board') return [];
    const scoped = tasks.filter(scopeTask);
    return ALL_TODO_STATUSES.map((s) => {
      const inCol = scoped.filter((t) => (t.status ?? 'todo') === s);
      const tasksForCol =
        s === 'done'
          ? inCol.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))
          : sortActive(inCol, today);
      return { status: s, tasks: tasksForCol };
    });
  }, [mode, tasks, scopeTask, today]);

  // Company list groups by assignee: directory order first, unknown uids last.
  const teamGroups = useMemo(() => {
    if (!(tab === 'company' && mode === 'list')) return [];
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
  }, [tab, mode, list, users]);

  const emptyMessage = showArchived
    ? 'No archived tasks here.'
    : status === 'done'
      ? 'Nothing completed yet.'
      : tab === 'personal'
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

  // Shared "+ New task" header button (List + Board cards).
  const newTaskButton = (
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
  );

  // Search + category (+ Company person/delegation) filters, shared by List and
  // Board. `withStatusToggles` adds the to-do/done/archived switch on the left —
  // List-only (the Board shows every status as a column, archived has its own).
  const renderFilterStrip = (withStatusToggles: boolean) => (
    <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#EEECE9] bg-[#FAFAF9] text-xs">
      <div className="flex items-center gap-1 font-medium">
        {withStatusToggles &&
          (['active', 'done'] as const).map((s) => (
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
        {withStatusToggles && (
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
        )}
      </div>
      <div className="flex items-center gap-3">
        <input
          className="w-28 rounded-md border border-[#D8D5D0] bg-white px-2 py-1 text-xs placeholder-[#A8A29B] focus:outline-none focus:border-[#ED202B] focus:w-44 transition-all"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {tab === 'company' && (
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
  );

  return (
    <Layout>
      <main className="py-6 space-y-5">
        {/* Header: title + scope tabs (Personal / Company) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-3xl font-semibold text-[#201F1E]">To-Do</h1>
          <div className="inline-flex rounded-lg border border-[#D8D5D0] overflow-hidden">
            {(['personal', 'company'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setShowArchived(false);
                  setPresenting(false);
                }}
                className={`px-4 py-2 text-sm font-medium transition ${
                  tab === t
                    ? 'bg-[#ED202B] text-white'
                    : 'bg-white text-[#7A756E] hover:text-[#ED202B]'
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* View-mode toggle (List / Calendar / Board) — available inside both tabs */}
        <div className="flex items-center">
          <div className="inline-flex rounded-lg border border-[#D8D5D0] overflow-hidden">
            {(['list', 'calendar', 'board'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setShowArchived(false);
                  setPresenting(false);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium transition ${
                  mode === m
                    ? 'bg-[#ED202B]/10 text-[#ED202B]'
                    : 'bg-white text-[#7A756E] hover:text-[#ED202B]'
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {mode === 'calendar' ? (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4">
            {calendarSpan === 'month' ? (
              <MonthCalendar
                grid={monthGrid ?? { gridStart: monthStart, cells: [] }}
                monthStart={monthStart}
                today={today}
                span={calendarSpan}
                showAssignee={tab === 'company'}
                usersById={usersById}
                onSpanChange={setCalendarSpan}
                onMonthChange={setMonthStart}
                onOpenTask={setEditing}
                onToggleDone={toggleDone}
                onQuickAdd={(dayMs) =>
                  setCreating(
                    tab === 'company'
                      ? { dueDate: dayMs, visibility: 'company' }
                      : { assigneeUid: uid, dueDate: dayMs },
                  )
                }
                onMoveTask={(task, dueDate) => {
                  const fields: Partial<UserTask> = { dueDate };
                  if (task.scheduledDate !== undefined) fields.scheduledDate = undefined;
                  updateTask(task.id, fields);
                }}
              />
            ) : tab === 'company' ? (
              <WeekBoard
                board={weekBoard}
                weekStart={weekStart}
                today={today}
                dayCount={weekDayCount}
                usersById={usersById}
                currentUid={uid}
                presenting={false}
                span={calendarSpan}
                onSpanChange={setCalendarSpan}
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
            ) : (
              <PersonalWeekBoard
                days={personalWeek ?? []}
                weekStart={weekStart}
                today={today}
                dayCount={weekDayCount}
                span={calendarSpan}
                onSpanChange={setCalendarSpan}
                onWeekChange={setWeekStart}
                onOpenTask={setEditing}
                onToggleDone={toggleDone}
                onQuickAdd={(dayMs) => setCreating({ assigneeUid: uid, dueDate: dayMs })}
                onMoveTask={(task, dueDate) => {
                  const fields: Partial<UserTask> = { dueDate };
                  // Fold away any legacy "Do on" so the new placement sticks.
                  if (task.scheduledDate !== undefined) fields.scheduledDate = undefined;
                  updateTask(task.id, fields);
                }}
              />
            )}
          </div>
        ) : mode === 'board' ? (
          <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden">
            {newTaskButton}
            {renderFilterStrip(false)}
            <div className="p-4">
              <StatusBoard
                columns={boardColumns}
                showAssignee={tab === 'company'}
                usersById={usersById}
                onOpenTask={setEditing}
                onSetStatus={(task, s) => setTaskStatus(task.id, s)}
                onQuickAdd={() => setCreating({ assigneeUid: tab === 'company' ? undefined : uid })}
              />
            </div>
          </div>
        ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] overflow-hidden">
          {newTaskButton}
          {renderFilterStrip(true)}

          {/* List */}
          {loading || (showArchived && archivedLoading) ? (
            <p className="px-4 py-6 text-sm text-[#7A756E]">Loading…</p>
          ) : list.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#7A756E]">{emptyMessage}</p>
          ) : tab === 'personal' ? (
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

      {/* Fullscreen presentation overlay for the Company Week board. Pinned to
          that quadrant — `presenting` is only ever set from there, but the guard
          keeps the company board from leaking into the Personal tab if the flag
          is ever left set across a tab/mode switch. */}
      {presenting && tab === 'company' && mode === 'calendar' && calendarSpan === 'week' && (
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

function ChipBody({ task, trailing }: { task: UserTask; trailing?: React.ReactNode }) {
  const done = task.status === 'done';
  return (
    <span className="flex items-start gap-1.5">
      <span className="mt-[5px]">
        <CategoryDot category={task.category} />
      </span>
      <span className={`min-w-0 flex-1 ${done ? 'line-through text-[#7A756E]' : 'text-[#201F1E]'}`}>
        {task.title}
      </span>
      {trailing && <span className="mt-[1px] shrink-0">{trailing}</span>}
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
  trailing,
  draggableWhenDone = false,
}: {
  task: UserTask;
  presenting: boolean;
  enabled: boolean;
  onOpen: (t: UserTask) => void;
  onToggleDone?: (t: UserTask) => void;
  // Optional right-aligned adornment (e.g. assignee avatar on the company month).
  trailing?: React.ReactNode;
  // The status board wants Done cards draggable (to pull them back to another
  // column); the calendars don't (a done chip sits on its completion day).
  draggableWhenDone?: boolean;
}) {
  // On the calendars, done chips sit on their completion day, so dragging one
  // would snap back — only open chips are draggable there. (They still open on
  // click.) The status board overrides this so a Done card can move columns.
  const canDrag = enabled && (draggableWhenDone || task.status !== 'done');
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
        <ChipBody task={task} trailing={trailing} />
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
  // Carried into the drag's `onDrop` target — week cells pass assignee+date, the
  // status board passes a status, so the shape is left open here.
  data: Record<string, unknown>;
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

/**
 * Shared chip drag-and-drop plumbing for both week boards. Sensors: mouse needs
 * an 8px move before a drag starts (so a plain click still opens the task);
 * touch needs a 200ms press (so a quick swipe scrolls the board instead of
 * grabbing a chip). A click fires right after a drop, so `justDragged` swallows
 * that stray click. Each board supplies what a drop means via `onDrop`.
 */
function useChipDrag<T = { assigneeUid: string; dueDate: number }>(
  onOpenTask: (t: UserTask) => void,
  // `target` is the dropped-on cell's `data`. Its shape is the board's own (the
  // week boards carry assignee+date; the status board carries a status), so it's
  // generic and inferred from this callback's annotation.
  onDrop: (task: UserTask, target: T) => void,
) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const [activeTask, setActiveTask] = useState<UserTask | null>(null);
  const justDragged = useRef(false);

  const openTask = (t: UserTask) => {
    if (justDragged.current) return;
    onOpenTask(t);
  };

  const dndProps = {
    sensors,
    onDragStart: (e: DragStartEvent) => {
      justDragged.current = true;
      setActiveTask((e.active.data.current?.task as UserTask | undefined) ?? null);
    },
    onDragEnd: (e: DragEndEvent) => {
      setActiveTask(null);
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
      const task = e.active.data.current?.task as UserTask | undefined;
      const target = e.over?.data.current as T | undefined;
      if (!task || !target) return;
      onDrop(task, target);
    },
    onDragCancel: () => setActiveTask(null),
  };

  return { activeTask, openTask, dndProps };
}

/** Hover-revealed quick-add affordance filling the rest of a day/person cell.
 *  Sits below any chips so it never overlaps a chip's own click. */
function AddTaskButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-md border border-dashed border-[#EEECE9] px-2 py-1 text-left text-xs font-medium text-[#A8A29B] opacity-0 transition group-hover:opacity-100 hover:border-[#ED202B]/40 hover:text-[#ED202B]"
      aria-label="Add task"
    >
      + Add
    </button>
  );
}

// ── shared calendar navigation header ────────────────────────────────────────
// prev / label / next / "back to today" on the left; the [Week | Month] span
// toggle and optional Present button on the right. Stepping is delegated to the
// parent (week steps ±7 days, month steps ±1 month), so this stays span-agnostic.
function CalendarNav({
  label,
  subLabel,
  atToday,
  presenting,
  span,
  onPrev,
  onNext,
  onToday,
  onSpanChange,
  onPresent,
}: {
  label: string; // "This week" / "June 2026"
  subLabel?: string; // optional date range (week span)
  atToday: boolean; // showing the current week/month
  presenting: boolean;
  span: CalendarSpan;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSpanChange: (span: CalendarSpan) => void;
  // Present toggle (company meeting board only). Omitted elsewhere.
  onPresent?: () => void;
}) {
  const navBtn =
    'flex h-7 w-7 items-center justify-center rounded-md border border-[#D8D5D0] text-[#7A756E] transition hover:text-[#ED202B] hover:border-[#ED202B]/40';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <button className={navBtn} onClick={onPrev} aria-label={`Previous ${span}`}>
          ‹
        </button>
        <span
          className={`font-heading font-semibold text-[#201F1E] ${
            presenting ? 'text-2xl' : 'text-base'
          }`}
        >
          {label}
        </span>
        {subLabel && <span className="text-xs text-[#7A756E]">{subLabel}</span>}
        <button className={navBtn} onClick={onNext} aria-label={`Next ${span}`}>
          ›
        </button>
        {!atToday && (
          <button
            onClick={onToday}
            className="text-xs font-medium text-[#ED202B] hover:underline"
          >
            Back to this {span}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        {/* Week / Month span toggle — hidden in Present mode (week-only). */}
        {!presenting && (
          <div className="inline-flex rounded-lg border border-[#D8D5D0] overflow-hidden">
            {(['week', 'month'] as const).map((s) => (
              <button
                key={s}
                onClick={() => onSpanChange(s)}
                className={`px-3 py-1 text-xs font-medium capitalize transition ${
                  span === s
                    ? 'bg-[#ED202B]/10 text-[#ED202B]'
                    : 'bg-white text-[#7A756E] hover:text-[#ED202B]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {onPresent && <Button onClick={onPresent}>{presenting ? 'Exit' : 'Present'}</Button>}
      </div>
    </div>
  );
}

// ── personal week (days-as-columns): just my tasks, one card list per day ────
function PersonalWeekBoard({
  days: dayTasks,
  weekStart,
  today,
  dayCount,
  span,
  onSpanChange,
  onWeekChange,
  onOpenTask,
  onToggleDone,
  onQuickAdd,
  onMoveTask,
}: {
  // 7 buckets (Mon…Sun) of my tasks placed on that calendar day.
  days: UserTask[][];
  weekStart: number;
  today: number;
  dayCount: number;
  span: CalendarSpan;
  onSpanChange: (span: CalendarSpan) => void;
  onWeekChange: (ms: number) => void;
  onOpenTask: (t: UserTask) => void;
  onToggleDone: (t: UserTask) => void;
  // Add a task on a given day (seeds Due date + assigns me upstream).
  onQuickAdd: (dayMs: number) => void;
  // Drag a chip to another day → reschedule (assignee stays me).
  onMoveTask: (task: UserTask, dueDate: number) => void;
}) {
  const days = Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i));
  const thisWeek = startOfWeek(today);

  // Drag a chip to another day → reschedule (assignee stays me, so the cell's
  // assigneeUid is ignored here). Dropping back on the same day is a no-op.
  const { activeTask, openTask, dndProps } = useChipDrag(onOpenTask, (task, target) => {
    if ((task.dueDate ?? task.scheduledDate) === target.dueDate) return;
    onMoveTask(task, target.dueDate);
  });

  return (
    <div className="space-y-4">
      <CalendarNav
        label={weekStart === thisWeek ? 'This week' : `Week of ${formatShortDate(weekStart)}`}
        subLabel={`${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`}
        atToday={weekStart === thisWeek}
        presenting={false}
        span={span}
        onPrev={() => onWeekChange(addDays(weekStart, -7))}
        onNext={() => onWeekChange(addDays(weekStart, 7))}
        onToday={() => onWeekChange(thisWeek)}
        onSpanChange={onSpanChange}
      />

      {/* The grid renders even on an empty week so + Add stays reachable on any
          day. Undated tasks live in the List view, not here. */}
      <DndContext {...dndProps}>
          <div className="overflow-x-auto">
            <div
              className="grid gap-px rounded-lg border border-[#EEECE9] bg-[#EEECE9] overflow-hidden"
              style={{ gridTemplateColumns: `repeat(${dayCount}, minmax(150px, 1fr))` }}
            >
              {/* header row */}
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
              {/* one tall cell per day, tasks stacked as cards */}
              {days.map((ms, i) => (
                <DroppableCell
                  key={ms}
                  id={`day:${ms}`}
                  data={{ assigneeUid: '', dueDate: ms }}
                  enabled
                  className={`group min-h-[8rem] px-1.5 py-1.5 space-y-1.5 ${
                    ms === today ? 'bg-[#FFF7F7]' : 'bg-white'
                  }`}
                >
                  {dayTasks[i].map((t) => (
                    <DraggableChip
                      key={t.id}
                      task={t}
                      presenting={false}
                      enabled
                      onOpen={openTask}
                      onToggleDone={onToggleDone}
                    />
                  ))}
                  <AddTaskButton onClick={() => onQuickAdd(ms)} />
                </DroppableCell>
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeTask ? (
              <div
                className={`${chipClassName(
                  activeTask.status === 'done',
                  false,
                )} cursor-grabbing shadow-lg`}
              >
                <ChipBody task={activeTask} />
              </div>
            ) : null}
          </DragOverlay>
      </DndContext>
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
  span,
  onSpanChange,
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
  // Span toggle — omitted in Present mode (the overlay is week-only).
  span?: CalendarSpan;
  onSpanChange?: (span: CalendarSpan) => void;
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
  const days = Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i));
  const dndEnabled = !!onMoveTask;
  const cols = dayCount;

  // Drag a chip to a cell → reassign + reschedule onto that person/day. Dropping
  // back where it already was is a no-op. In Present mode onMoveTask is omitted,
  // so chips/cells are disabled (dndEnabled false) and onDrop never fires.
  const { activeTask, openTask, dndProps } = useChipDrag(onOpenTask, (task, target) => {
    const sameAssignee = effectiveTodoAssignee(task) === target.assigneeUid;
    const sameDate = (task.dueDate ?? task.scheduledDate) === target.dueDate;
    if (sameAssignee && sameDate) return;
    onMoveTask?.(task, target.assigneeUid, target.dueDate);
  });

  // Hidden entirely in Present mode (onQuickAdd omitted).
  const addBtn = (assigneeUid: string, dayMs: number) =>
    onQuickAdd ? <AddTaskButton onClick={() => onQuickAdd(assigneeUid, dayMs)} /> : null;

  const thisWeek = startOfWeek(today);

  return (
    <div className="space-y-4">
      <CalendarNav
        label={weekStart === thisWeek ? 'This week' : `Week of ${formatShortDate(weekStart)}`}
        subLabel={`${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`}
        atToday={weekStart === thisWeek}
        presenting={presenting}
        span={span ?? 'week'}
        onPrev={() => onWeekChange(addDays(weekStart, -7))}
        onNext={() => onWeekChange(addDays(weekStart, 7))}
        onToday={() => onWeekChange(thisWeek)}
        onSpanChange={onSpanChange ?? (() => {})}
        onPresent={onPresent}
      />

      {board.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#7A756E]">
          No company tasks scheduled this week.
        </p>
      ) : (
        <DndContext {...dndProps}>
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

// ── month calendar (shared by both tabs): a Mon-anchored 6×7 day grid ────────
function MonthCalendar({
  grid,
  monthStart,
  today,
  span,
  showAssignee,
  usersById,
  onSpanChange,
  onMonthChange,
  onOpenTask,
  onToggleDone,
  onQuickAdd,
  onMoveTask,
}: {
  grid: { gridStart: number; cells: { ms: number; tasks: UserTask[] }[] };
  monthStart: number;
  today: number;
  span: CalendarSpan;
  // Company shows an assignee avatar on each chip; Personal omits it (all mine).
  showAssignee: boolean;
  usersById: Map<string, UserRecord>;
  onSpanChange: (span: CalendarSpan) => void;
  onMonthChange: (ms: number) => void;
  onOpenTask: (t: UserTask) => void;
  onToggleDone: (t: UserTask) => void;
  onQuickAdd: (dayMs: number) => void;
  onMoveTask: (task: UserTask, dueDate: number) => void;
}) {
  const thisMonth = startOfMonth(today);
  const shownMonth = new Date(monthStart).getMonth();
  const MAX_CHIPS = 3; // beyond this, collapse to a "+N more" line per day.

  // Drag a chip to another day → reschedule (date only; assignee unchanged).
  const { activeTask, openTask, dndProps } = useChipDrag(onOpenTask, (task, target) => {
    if ((task.dueDate ?? task.scheduledDate) === target.dueDate) return;
    onMoveTask(task, target.dueDate);
  });

  return (
    <div className="space-y-4">
      <CalendarNav
        label={formatMonthLabel(monthStart)}
        atToday={monthStart === thisMonth}
        presenting={false}
        span={span}
        onPrev={() => onMonthChange(addMonths(monthStart, -1))}
        onNext={() => onMonthChange(addMonths(monthStart, 1))}
        onToday={() => onMonthChange(thisMonth)}
        onSpanChange={onSpanChange}
      />
      <DndContext {...dndProps}>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[#EEECE9] bg-[#EEECE9] min-w-[44rem]">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="bg-[#FAFAF9] px-2 py-1.5 text-xs font-semibold text-[#7A756E]"
              >
                {d}
              </div>
            ))}
            {grid.cells.map(({ ms, tasks }) => {
              const inMonth = new Date(ms).getMonth() === shownMonth;
              const isToday = ms === today;
              const shown = tasks.slice(0, MAX_CHIPS);
              const extra = tasks.length - shown.length;
              return (
                <DroppableCell
                  key={ms}
                  id={`month:${ms}`}
                  data={{ assigneeUid: '', dueDate: ms }}
                  enabled
                  className={`group min-h-[7rem] space-y-1 px-1 py-1 ${
                    isToday ? 'bg-[#FFF7F7]' : inMonth ? 'bg-white' : 'bg-[#FAFAF9]'
                  }`}
                >
                  <div className="px-1">
                    <span
                      className={`text-xs font-semibold ${
                        isToday
                          ? 'text-[#ED202B]'
                          : inMonth
                            ? 'text-[#201F1E]'
                            : 'text-[#A8A29B]'
                      }`}
                    >
                      {new Date(ms).getDate()}
                    </span>
                  </div>
                  {shown.map((t) => (
                    <DraggableChip
                      key={t.id}
                      task={t}
                      presenting={false}
                      enabled
                      onOpen={openTask}
                      onToggleDone={onToggleDone}
                      trailing={
                        showAssignee ? (
                          <Avatar
                            uid={effectiveTodoAssignee(t)}
                            user={usersById.get(effectiveTodoAssignee(t))}
                          />
                        ) : undefined
                      }
                    />
                  ))}
                  {extra > 0 && (
                    <div className="px-1 text-[11px] font-medium text-[#7A756E]">
                      +{extra} more
                    </div>
                  )}
                  <AddTaskButton onClick={() => onQuickAdd(ms)} />
                </DroppableCell>
              );
            })}
          </div>
        </div>
        <DragOverlay>
          {activeTask ? (
            <div
              className={`${chipClassName(activeTask.status === 'done', false)} cursor-grabbing shadow-lg`}
            >
              <ChipBody task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── status board (Kanban): To do / In progress / Done columns ────────────────
function StatusBoard({
  columns,
  showAssignee,
  usersById,
  onOpenTask,
  onSetStatus,
  onQuickAdd,
}: {
  columns: { status: TodoStatus; tasks: UserTask[] }[];
  // Company shows an assignee avatar on each card; Personal omits it.
  showAssignee: boolean;
  usersById: Map<string, UserRecord>;
  onOpenTask: (t: UserTask) => void;
  onSetStatus: (task: UserTask, status: TodoStatus) => void;
  onQuickAdd: () => void;
}) {
  // Drag a card to a column → set that status (setUserTodoStatus stamps/clears
  // completedAt). Dropping back on the same column is a no-op.
  const { activeTask, openTask, dndProps } = useChipDrag(
    onOpenTask,
    (task, target: { status: TodoStatus }) => {
      if ((task.status ?? 'todo') === target.status) return;
      onSetStatus(task, target.status);
    },
  );

  return (
    <DndContext {...dndProps}>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((col) => (
          <DroppableCell
            key={col.status}
            id={`status:${col.status}`}
            data={{ status: col.status }}
            enabled
            className="group flex min-h-[8rem] flex-col gap-2 rounded-lg border border-[#EEECE9] bg-[#FAFAF9] p-2"
          >
            <div className="flex items-center justify-between px-1 pt-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#7A756E]">
                {TODO_STATUS_LABELS[col.status]}
              </span>
              <span className="text-xs text-[#A8A29B]">{col.tasks.length}</span>
            </div>
            {col.tasks.map((t) => (
              <DraggableChip
                key={t.id}
                task={t}
                presenting={false}
                enabled
                draggableWhenDone
                onOpen={openTask}
                trailing={
                  showAssignee ? (
                    <Avatar
                      uid={effectiveTodoAssignee(t)}
                      user={usersById.get(effectiveTodoAssignee(t))}
                    />
                  ) : undefined
                }
              />
            ))}
            {col.status === 'todo' && <AddTaskButton onClick={onQuickAdd} />}
          </DroppableCell>
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div
            className={`${chipClassName(activeTask.status === 'done', false)} cursor-grabbing shadow-lg`}
          >
            <ChipBody task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
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
