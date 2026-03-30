import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole, ToolId } from '../types';

interface Props {
  children: ReactNode;
  allowedRoles?: UserRole[];
  toolId?: ToolId;
}

export default function ProtectedRoute({ children, allowedRoles, toolId }: Props) {
  const { user, role, allowedTools, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#D8D5D0] border-t-[#ED202B]" />
          <span className="text-sm text-[#7A756E]">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user || role === null) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" />;
  }

  // Admins bypass tool-level checks
  if (toolId && role !== 'admin' && !allowedTools.includes(toolId)) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}
