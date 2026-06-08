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
import PreConIndex from './tools/PreConIndex';
import PreConNew from './tools/PreConNew';
import PreConDetail from './tools/PreConDetail';
import WellFinderTool from './tools/WellFinderTool';
import DocumentsTool from './tools/DocumentsTool';
import TodoListTool from './tools/TodoListTool';
import MarketIntelTool from './tools/MarketIntelTool';
import OneLineGeneratorIndex from './tools/OneLineGeneratorIndex';
import OneLineGeneratorNew from './tools/OneLineGeneratorNew';
import OneLineGeneratorDetail from './tools/OneLineGeneratorDetail';
import AdminActivity from './pages/AdminActivity';
import {
  BAILEY_PROJECT_CONFIG,
  CONSTRUCTION_PROJECTS_CONFIG,
  JobToolConfigProvider,
} from './lib/jobToolConfig';

function LegacyAnalyzerRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/site-analyzer${search}`} replace />;
}

/** Legacy `/precon...` URL → new `/llr...` (Large Load Request). Preserves
 *  trailing path (`/new`, `/:siteId`) and query string. */
function LegacyPreConRedirect() {
  const { pathname, search } = useLocation();
  const suffix = pathname.replace(/^\/precon/, '');
  return <Navigate to={`/llr${suffix}${search}`} replace />;
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
          {/* Bailey Project — kept on the original collection so the CEO's
              existing data is preserved as-is. */}
          <Route
            path="/construction-tracker"
            element={
              <ProtectedRoute toolId="construction-tracker">
                <JobToolConfigProvider config={BAILEY_PROJECT_CONFIG}>
                  <ConstructionTrackerIndex />
                </JobToolConfigProvider>
              </ProtectedRoute>
            }
          />
          <Route
            path="/construction-tracker/new"
            element={
              <ProtectedRoute toolId="construction-tracker">
                <JobToolConfigProvider config={BAILEY_PROJECT_CONFIG}>
                  <ConstructionTrackerNew />
                </JobToolConfigProvider>
              </ProtectedRoute>
            }
          />
          <Route
            path="/construction-tracker/:jobId"
            element={
              <ProtectedRoute toolId="construction-tracker">
                <JobToolConfigProvider config={BAILEY_PROJECT_CONFIG}>
                  <ConstructionTrackerDetail />
                </JobToolConfigProvider>
              </ProtectedRoute>
            }
          />
          {/* Construction Projects — fresh duplicate for the construction
              team. Reads/writes a separate Firestore collection and Storage
              prefix; shares the same component tree as Bailey's tool. */}
          <Route
            path="/construction-projects"
            element={
              <ProtectedRoute toolId="construction-projects">
                <JobToolConfigProvider config={CONSTRUCTION_PROJECTS_CONFIG}>
                  <ConstructionTrackerIndex />
                </JobToolConfigProvider>
              </ProtectedRoute>
            }
          />
          <Route
            path="/construction-projects/new"
            element={
              <ProtectedRoute toolId="construction-projects">
                <JobToolConfigProvider config={CONSTRUCTION_PROJECTS_CONFIG}>
                  <ConstructionTrackerNew />
                </JobToolConfigProvider>
              </ProtectedRoute>
            }
          />
          <Route
            path="/construction-projects/:jobId"
            element={
              <ProtectedRoute toolId="construction-projects">
                <JobToolConfigProvider config={CONSTRUCTION_PROJECTS_CONFIG}>
                  <ConstructionTrackerDetail />
                </JobToolConfigProvider>
              </ProtectedRoute>
            }
          />
          <Route
            path="/llr"
            element={
              <ProtectedRoute toolId="large-load-request">
                <PreConIndex />
              </ProtectedRoute>
            }
          />
          <Route
            path="/llr/new"
            element={
              <ProtectedRoute toolId="large-load-request">
                <PreConNew />
              </ProtectedRoute>
            }
          />
          <Route
            path="/llr/:siteId"
            element={
              <ProtectedRoute toolId="large-load-request">
                <PreConDetail />
              </ProtectedRoute>
            }
          />
          {/* Legacy redirect: /precon* → /llr* (renamed Pre-Construction → Large Load Request on 2026-05-27) */}
          <Route path="/precon" element={<LegacyPreConRedirect />} />
          <Route path="/precon/new" element={<LegacyPreConRedirect />} />
          <Route path="/precon/:siteId" element={<LegacyPreConRedirect />} />
          <Route
            path="/one-line-generator"
            element={
              <ProtectedRoute toolId="one-line-generator">
                <OneLineGeneratorIndex />
              </ProtectedRoute>
            }
          />
          <Route
            path="/one-line-generator/new"
            element={
              <ProtectedRoute toolId="one-line-generator">
                <OneLineGeneratorNew />
              </ProtectedRoute>
            }
          />
          <Route
            path="/one-line-generator/:documentId"
            element={
              <ProtectedRoute toolId="one-line-generator">
                <OneLineGeneratorDetail />
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
            path="/todo-list"
            element={
              <ProtectedRoute>
                <TodoListTool />
              </ProtectedRoute>
            }
          />
          <Route
            path="/market-intel"
            element={
              <ProtectedRoute toolId="market-intel">
                <MarketIntelTool />
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
