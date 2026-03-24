import { NavLink as RouterNavLink } from 'react-router-dom';
import { navLinks } from './navConfig';
import { useAuth } from '../../hooks/useAuth';

export default function NavLinks() {
  const { role } = useAuth();

  const visibleLinks = navLinks.filter(
    (link) => !link.roles || (role && link.roles.includes(role))
  );

  return (
    <nav className="hidden md:flex items-center gap-8">
      {visibleLinks.map((link) => (
        <RouterNavLink
          key={link.path}
          to={link.path}
          className={({ isActive }) =>
            `text-sm font-medium transition px-1 py-1 ${
              isActive
                ? 'text-[#C1121F] border-b-2 border-[#C1121F]'
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
