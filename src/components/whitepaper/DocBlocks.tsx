import type { ReactNode } from 'react';

/**
 * Typography primitives for Whitepaper content pages. Every content section
 * under src/content/whitepaper/ composes these instead of raw Tailwind so the
 * whole document keeps one consistent voice and can be restyled in one place.
 */

export function DocTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="font-heading text-3xl font-semibold text-[#201F1E]">{children}</h1>
      {lead && <p className="mt-3 text-base leading-7 text-[#7A756E]">{lead}</p>}
    </header>
  );
}

export function DocH2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="font-heading mt-10 mb-3 text-xl font-semibold text-[#201F1E] scroll-mt-24 border-b border-[#D8D5D0] pb-2"
    >
      {children}
    </h2>
  );
}

export function DocH3({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-heading mt-6 mb-2 text-base font-semibold text-[#201F1E]">{children}</h3>
  );
}

export function DocP({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-[15px] leading-7 text-[#3F3C38]">{children}</p>;
}

export function DocList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mb-4 space-y-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-7 text-[#3F3C38]">
          <span
            aria-hidden="true"
            className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ED202B]/60"
          />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function DocTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mb-5 overflow-x-auto rounded-xl border border-[#D8D5D0] bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#D8D5D0] bg-[#FAFAF9]">
            {head.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 font-heading font-semibold text-[#201F1E] whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#D8D5D0]/60 last:border-0 align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-[#3F3C38]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Inline file path / identifier chip, e.g. <Code>src/lib/firebase.ts</Code>. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-[#201F1E]/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-[#201F1E]">
      {children}
    </code>
  );
}

export function Callout({
  variant = 'info',
  children,
}: {
  variant?: 'info' | 'warn';
  children: ReactNode;
}) {
  const styles =
    variant === 'warn'
      ? 'border-[#ED202B]/30 bg-[#ED202B]/[0.04] text-[#3F3C38]'
      : 'border-[#D8D5D0] bg-white text-[#3F3C38]';
  return (
    <div className={`mb-5 rounded-xl border px-4 py-3 text-sm leading-6 ${styles}`}>{children}</div>
  );
}

/** Compact key/value facts grid shown at the top of tool pages. */
export function KeyFacts({ facts }: { facts: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[#D8D5D0] bg-[#D8D5D0]/60 sm:grid-cols-2">
      {facts.map((f) => (
        <div key={f.label} className="bg-white px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-[#7A756E]">{f.label}</dt>
          <dd className="mt-1 text-sm leading-6 text-[#201F1E]">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Marks a part of the whitepaper that is structured but not yet written. */
export function DocPlaceholder({ children }: { children?: ReactNode }) {
  return (
    <div className="mb-5 rounded-xl border border-dashed border-[#D8D5D0] bg-[#FAFAF9] px-4 py-3 text-sm text-[#7A756E]">
      <span className="font-medium text-[#201F1E]/70">To be documented.</span>{' '}
      {children ?? 'This section is scaffolded and will be filled in progressively.'}
    </div>
  );
}
