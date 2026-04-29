import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import SiteAppraiserTool from './tools/SiteAppraiserTool';
import UserManagement from './pages/UserManagement';
import BroadbandLookupTool from './tools/BroadbandLookupTool';
import GridPowerAnalyzer from './tools/GridPowerAnalyzer';
import SalesCrmTool from './tools/SalesCrmTool';
import SalesAdminDashboard from './tools/SalesAdminDashboard';
import PowerCalculatorTool from './tools/PowerCalculatorTool';
import SiteAnalyzerIndex from './tools/SiteAnalyzerIndex';
import SiteAnalyzerNew from './tools/SiteAnalyzerNew';
import SiteAnalyzerDetail from './tools/SiteAnalyzerDetail';
import WaterAnalysisTool from './tools/WaterAnalysisTool';
import GasAnalysisTool from './tools/GasAnalysisTool';
import CrmTool from './tools/CrmTool';
import CompanyDetailTool from './tools/CompanyDetailTool';
import ContactDetailTool from './tools/ContactDetailTool';

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
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/site-appraiser" element={
            <ProtectedRoute toolId="site-appraiser">
              <SiteAppraiserTool />
            </ProtectedRoute>
          } />
          <Route path="/broadband-lookup" element={
            <ProtectedRoute toolId="broadband-lookup">
              <BroadbandLookupTool />
            </ProtectedRoute>
          } />
          <Route path="/user-management" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <UserManagement />
            </ProtectedRoute>
          } />
          <Route path="/grid-power-analyzer" element={
            <ProtectedRoute toolId="grid-power-analyzer">
              <GridPowerAnalyzer />
            </ProtectedRoute>
          } />
          <Route path="/sales-crm" element={
            <ProtectedRoute toolId="sales-crm">
              <SalesCrmTool />
            </ProtectedRoute>
          } />
          <Route path="/sales-admin" element={
            <ProtectedRoute toolId="sales-admin">
              <SalesAdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/power-calculator" element={
            <ProtectedRoute toolId="power-calculator">
              <PowerCalculatorTool />
            </ProtectedRoute>
          } />
          <Route path="/site-analyzer" element={
            <ProtectedRoute toolId="site-analyzer">
              <SiteAnalyzerIndex />
            </ProtectedRoute>
          } />
          <Route path="/site-analyzer/new" element={
            <ProtectedRoute toolId="site-analyzer">
              <SiteAnalyzerNew />
            </ProtectedRoute>
          } />
          <Route path="/site-analyzer/:siteId" element={
            <ProtectedRoute toolId="site-analyzer">
              <SiteAnalyzerDetail />
            </ProtectedRoute>
          } />
          {/* Legacy redirect: /power-infrastructure-report → /site-analyzer (preserves query string) */}
          <Route path="/power-infrastructure-report" element={<LegacyAnalyzerRedirect />} />
          <Route path="/water-analysis" element={
            <ProtectedRoute toolId="water-analysis">
              <WaterAnalysisTool />
            </ProtectedRoute>
          } />
          <Route path="/gas-analysis" element={
            <ProtectedRoute toolId="gas-analysis">
              <GasAnalysisTool />
            </ProtectedRoute>
          } />
          <Route path="/crm" element={
            <ProtectedRoute toolId="crm">
              <CrmTool />
            </ProtectedRoute>
          } />
          <Route path="/crm/companies/:id" element={
            <ProtectedRoute toolId="crm">
              <CompanyDetailTool />
            </ProtectedRoute>
          } />
          <Route path="/crm/people/:id" element={
            <ProtectedRoute toolId="crm">
              <ContactDetailTool />
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
