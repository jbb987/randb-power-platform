import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import SiteAppraiserTool from './tools/SiteAppraiserTool';
import SiteRequestPipeline from './tools/SiteRequestPipeline';
import SiteRequestForm from './pages/SiteRequestForm';
import UserManagement from './pages/UserManagement';
import BroadbandLookupTool from './tools/BroadbandLookupTool';
import GridPowerAnalyzer from './tools/GridPowerAnalyzer';

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
          <Route path="/site-pipeline" element={
            <ProtectedRoute toolId="site-pipeline">
              <SiteRequestPipeline />
            </ProtectedRoute>
          } />
          <Route path="/site-request/form" element={
            <ProtectedRoute toolId="site-request-form">
              <SiteRequestForm />
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
          {/* Redirect old route */}
          <Route path="/site-request" element={<Navigate to="/site-pipeline" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
