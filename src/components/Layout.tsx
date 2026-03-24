import type { ReactNode } from 'react';
import Navbar from './navbar/Navbar';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#E8E6E3]">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
