import { NavLink as RouterNavLink } from 'react-router-dom';
import { navLinks } from './navConfig';

export default function NavLinks() {
  return (
    <nav className="hidden md:flex items-center gap-6">
      {navLinks.map((link) => (
        <RouterNavLink
          key={link.path}
          to={link.path}
          className={({ isActive }) =>
            `text-sm font-medium transition ${
              isActive
                ? 'text-[#C1121F] border-b-2 border-[#C1121F] pb-0.5'
                : 'text-[#7A756E] hover:text-[#201F1E]'
            }`
          }
        >
          {link.label}
        </RouterNavLink>
      ))}
    </nav>
  );
}
