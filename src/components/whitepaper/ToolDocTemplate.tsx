import type { ReactNode } from 'react';
import { DocTitle, DocH2, DocTable, DocPlaceholder, KeyFacts, Code } from './DocBlocks';

/**
 * Uniform shape for one tool's whitepaper page. Tool pages are data, not
 * hand-written layouts, so every tool documents the same dimensions and gaps
 * show up as explicit placeholders instead of silently missing sections.
 */
export interface ToolDoc {
  /** Whitepaper section id (also the URL segment, e.g. /whitepaper/site-analyzer). */
  id: string;
  title: string;
  /** One-paragraph purpose shown as the page lead. */
  purpose: ReactNode;
  /** Who can open it: tool-gated id, admin-only, etc. */
  access: ReactNode;
  routes: Array<{ path: string; description: string }>;
  /** External + internal data the tool reads/writes. Empty array = placeholder. */
  dataSources: Array<{
    name: string;
    kind: 'External API' | 'Firestore' | 'Storage' | 'Computed';
    notes: string;
  }>;
  keyFiles: Array<{ path: string; role: string }>;
  /** Free-form "how it works" content; omit to show a placeholder. */
  howItWorks?: ReactNode;
  /** Extra free-form sections appended after the standard ones. */
  extra?: ReactNode;
}

export default function ToolDocTemplate({ doc }: { doc: ToolDoc }) {
  return (
    <article>
      <DocTitle lead={doc.purpose}>{doc.title}</DocTitle>

      <KeyFacts
        facts={[
          { label: 'Access', value: doc.access },
          { label: 'Entry route', value: <Code>{doc.routes[0]?.path ?? '—'}</Code> },
        ]}
      />

      <DocH2 id="routes">Routes</DocH2>
      <DocTable
        head={['Path', 'Purpose']}
        rows={doc.routes.map((r) => [<Code>{r.path}</Code>, r.description])}
      />

      <DocH2 id="how-it-works">How it works</DocH2>
      {doc.howItWorks ?? (
        <DocPlaceholder>Walkthrough of the tool's logic, flows, and edge cases.</DocPlaceholder>
      )}

      <DocH2 id="data-sources">Data sources</DocH2>
      {doc.dataSources.length > 0 ? (
        <DocTable
          head={['Source', 'Kind', 'Notes']}
          rows={doc.dataSources.map((d) => [d.name, d.kind, d.notes])}
        />
      ) : (
        <DocPlaceholder>
          Inventory of the APIs, collections, and computed inputs this tool relies on.
        </DocPlaceholder>
      )}

      <DocH2 id="key-files">Key files</DocH2>
      <DocTable
        head={['File', 'Role']}
        rows={doc.keyFiles.map((f) => [<Code>{f.path}</Code>, f.role])}
      />

      {doc.extra}
    </article>
  );
}
