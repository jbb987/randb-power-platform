import { Link } from 'react-router-dom';
import NavLinks from './NavLinks';
import UserMenu from './UserMenu';
import MobileMenu from './MobileMenu';
import { navItems } from './navConfig';

export default function Navbar() {
  return (
    <nav
      className="sticky top-0 z-50 bg-white border-b border-[#D8D5D0] no-print"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex-shrink-0">
          <img
            src={import.meta.env.BASE_URL + 'logo.svg'}
            alt="R&B Power Platform home"
            className="h-10"
          />
        </Link>

        {/* Desktop nav links */}
        <NavLinks items={navItems} />

        {/* Right: User menu (desktop) + Hamburger (mobile) */}
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <UserMenu />
          </div>
          <MobileMenu items={navItems} />
        </div>
      </div>
    </nav>
  );
}
