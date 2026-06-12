import type { ReactNode } from 'react';
import OverviewSection from './overview';
import ArchitectureSection from './architecture';
import AuthRolesSection from './auth-roles';
import DataModelSection from './data-model';
import DataSourcesSection from './data-sources';
import FolderSystemSection from './folder-system';
import BackendSection from './backend';
import McpServerSection from './mcp-server';
import ToolDocTemplate from '../../components/whitepaper/ToolDocTemplate';
import { toolDocs } from './toolDocs';

export interface WhitepaperSection {
  /** URL segment: /whitepaper/:id */
  id: string;
  title: string;
  render: () => ReactNode;
}

export interface WhitepaperGroup {
  title: string;
  sections: WhitepaperSection[];
}

export const WHITEPAPER_GROUPS: WhitepaperGroup[] = [
  {
    title: 'Platform',
    sections: [
      { id: 'overview', title: 'Platform Overview', render: () => <OverviewSection /> },
      {
        id: 'architecture',
        title: 'Architecture & Tech Stack',
        render: () => <ArchitectureSection />,
      },
      { id: 'auth-roles', title: 'Authentication & Roles', render: () => <AuthRolesSection /> },
      { id: 'data-model', title: 'Data Model', render: () => <DataModelSection /> },
      { id: 'data-sources', title: 'External Data Sources', render: () => <DataSourcesSection /> },
      {
        id: 'folder-system',
        title: 'Folder & Document System',
        render: () => <FolderSystemSection />,
      },
    ],
  },
  {
    title: 'Tools',
    sections: toolDocs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      render: () => <ToolDocTemplate doc={doc} />,
    })),
  },
  {
    title: 'Backend & Data',
    sections: [
      { id: 'backend', title: 'Backend Services & Pipelines', render: () => <BackendSection /> },
      { id: 'mcp-server', title: 'MCP Server', render: () => <McpServerSection /> },
    ],
  },
];

/** Flat, ordered list — drives prev/next navigation and id lookup. */
export const WHITEPAPER_SECTIONS: WhitepaperSection[] = WHITEPAPER_GROUPS.flatMap(
  (g) => g.sections,
);

export const DEFAULT_SECTION_ID = WHITEPAPER_SECTIONS[0].id;

export function findSection(id: string | undefined): WhitepaperSection | undefined {
  return WHITEPAPER_SECTIONS.find((s) => s.id === id);
}
