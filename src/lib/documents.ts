import type { UserRole } from '../types';

export interface DocumentShortcut {
  id: string;
  name: string;
  description: string;
  url: string;
  allowedRoles: UserRole[];
}

export const TEMPLATES_FOLDER_URL =
  'https://drive.google.com/drive/folders/1Q97rAvO5OQrotwB9hbpfce8HKo9Dz_Zh';

export const COMPANY_DRIVE_URL = 'https://drive.google.com/drive/folders/0AGZwPQ1NHtIbUk9PVA';

export const MY_DRIVE_URL = 'https://drive.google.com/drive/my-drive';

export const DOCUMENT_SHORTCUTS: DocumentShortcut[] = [
  {
    id: 'my-documents',
    name: 'My Documents',
    description: 'Your personal Google Drive',
    url: MY_DRIVE_URL,
    allowedRoles: ['admin', 'employee', 'worker'],
  },
  {
    id: 'templates',
    name: 'Templates',
    description: 'Shared templates and forms',
    url: TEMPLATES_FOLDER_URL,
    allowedRoles: ['admin', 'employee', 'worker'],
  },
  {
    id: 'company-drive',
    name: 'Company Drive',
    description: 'Browse all R&B Power shared files',
    url: COMPANY_DRIVE_URL,
    allowedRoles: ['admin', 'employee', 'worker'],
  },
];

export function getShortcutsForRole(role: UserRole | null): DocumentShortcut[] {
  if (!role) return [];
  return DOCUMENT_SHORTCUTS.filter((s) => s.allowedRoles.includes(role));
}
