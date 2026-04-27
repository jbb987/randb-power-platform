import type { UserRole } from '../../types';

export interface NavLink {
  label: string;
  path: string;
  roles?: UserRole[];
}

export const navLinks: NavLink[] = [
  { label: 'Power Infrastructure Due Diligence Report', path: '/' },
  { label: 'Power Calculator', path: '/power-calculator' },
  { label: 'Site Analyzer', path: '/site-analyzer' },
];
