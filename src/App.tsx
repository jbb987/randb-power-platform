import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import GridPowerAnalyzer from './tools/GridPowerAnalyzer';
import SalesCrmTool from './tools/SalesCrmTool';
import SalesAdminDashboard from './tools/SalesAdminDashboard';
import SiteAnalyzerIndex from './tools/SiteAnalyzerIndex';
import SiteAnalyzerNew from './tools/SiteAnalyzerNew';
import SiteAnalyzerDetail from './tools/SiteAnalyzerDetail';
import CrmTool from './tools/CrmTool';
import CompanyDetailTool from './tools/CompanyDetailTool';
import ContactDetailTool from './tools/ContactDetailTool';
import ConstructionTrackerIndex from './tools/ConstructionTrackerIndex';
import ConstructionTrackerNew from './tools/ConstructionTrackerNew';
import ConstructionTrackerDetail from './tools/ConstructionTrackerDetail';
import WellFinderTool from './tools/WellFinderTool';
import DocumentsTool from './tools/DocumentsTool';
import AdminActivity from './pages/AdminActivity';

function LegacyAnalyzerRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/site-analyzer${search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-management"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <UserManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/grid-power-analyzer"
            element={
              <ProtectedRoute toolId="grid-power-analyzer">
                <GridPowerAnalyzer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-crm"
            element={
              <ProtectedRoute toolId="sales-crm">
                <SalesCrmTool />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-admin"
            element={
              <ProtectedRoute toolId="sales-admin">
                <SalesAdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/site-analyzer"
            element={
              <ProtectedRoute toolId="site-analyzer">
                <SiteAnalyzerIndex />
              </ProtectedRoute>
            }
          />
          <Route
            path="/site-analyzer/new"
            element={
              <ProtectedRoute toolId="site-analyzer">
                <SiteAnalyzerNew />
              </ProtectedRoute>
            }
          />
          <Route
            path="/site-analyzer/:siteId"
            element={
              <ProtectedRoute toolId="site-analyzer">
                <SiteAnalyzerDetail />
              </ProtectedRoute>
            }
          />
          {/* Legacy redirect: /power-infrastructure-report → /site-analyzer (preserves query string) */}
          <Route path="/power-infrastructure-report" element={<LegacyAnalyzerRedirect />} />
          <Route
            path="/crm"
            element={
              <ProtectedRoute toolId="crm">
                <CrmTool />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm/companies/:id"
            element={
              <ProtectedRoute toolId="crm">
                <CompanyDetailTool />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm/people/:id"
            element={
              <ProtectedRoute toolId="crm">
                <ContactDetailTool />
              </ProtectedRoute>
            }
          />
          <Route
            path="/construction-tracker"
            element={
              <ProtectedRoute toolId="construction-tracker">
                <ConstructionTrackerIndex />
              </ProtectedRoute>
            }
          />
          <Route
            path="/construction-tracker/new"
            element={
              <ProtectedRoute toolId="construction-tracker">
                <ConstructionTrackerNew />
              </ProtectedRoute>
            }
          />
          <Route
            path="/construction-tracker/:jobId"
            element={
              <ProtectedRoute toolId="construction-tracker">
                <ConstructionTrackerDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/well-finder"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <WellFinderTool />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute>
                <DocumentsTool />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/activity"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminActivity />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
