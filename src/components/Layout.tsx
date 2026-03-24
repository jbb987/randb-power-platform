import type { ReactNode } from 'react';
// import Navbar from './navbar/Navbar';
import Breadcrumb from './Breadcrumb';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#E8E6E3]">
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
        <Breadcrumb />
        {children}
      </div>
    </div>
  );
}
