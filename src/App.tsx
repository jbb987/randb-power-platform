import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import SiteAppraiserTool from './tools/SiteAppraiserTool';
import SiteRequestPipeline from './tools/SiteRequestPipeline';
import SiteRequestForm from './pages/SiteRequestForm';

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
            <ProtectedRoute>
              <SiteAppraiserTool />
            </ProtectedRoute>
          } />
          <Route path="/site-pipeline" element={
            <ProtectedRoute>
              <SiteRequestPipeline />
            </ProtectedRoute>
          } />
          <Route path="/site-request/form" element={
            <ProtectedRoute>
              <SiteRequestForm />
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
