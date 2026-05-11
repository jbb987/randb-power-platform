import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './navbar/Navbar';
import Breadcrumb from './Breadcrumb';
import { useAuth } from '../hooks/useAuth';
import { logView } from '../lib/userHistory';
import { describeRoute, shouldLogView } from '../lib/routeToolMap';

export default function Layout({
  children,
  fullWidth,
}: {
  children: ReactNode;
  fullWidth?: boolean;
}) {
  const { user } = useAuth();
  const location = useLocation();

  // Audit: log a `view` event when a signed-in user lands on a tool/page.
  // Detail pages may follow up with a more specific logView (resource id +
  // label); both entries are useful — the route-level one is the baseline.
  useEffect(() => {
    if (!user) return;
    const route = describeRoute(location.pathname);
    if (!route) return;
    // Detail routes self-log with resource identity (id + label).
    if (route.isDetailRoute) return;
    if (!shouldLogView(user.uid, location.pathname)) return;
    void logView({
      userId: user.uid,
      toolId: route.toolId,
      routePath: location.pathname,
      routeLabel: route.label,
    });
  }, [user, location.pathname]);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <Navbar />
      {fullWidth ? (
        <div className="px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumb />
          {children}
        </div>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumb />
          {children}
        </div>
      )}
    </div>
  );
}
