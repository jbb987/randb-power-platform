import { Link } from 'react-router-dom';
// import NavLinks from './NavLinks';
import UserMenu from './UserMenu';
import MobileMenu from './MobileMenu';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#D8D5D0]">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-10">
          <Link to="/" className="flex-shrink-0">
            <img
              src={import.meta.env.BASE_URL + 'logo.svg'}
              alt="R&B Power"
              className="h-11"
            />
          </Link>
          {/* <NavLinks /> */}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <UserMenu />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
