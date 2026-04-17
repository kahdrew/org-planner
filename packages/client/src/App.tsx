import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import LoginPage from '@/components/auth/LoginPage';
import RegisterPage from '@/components/auth/RegisterPage';
import AppShell from '@/components/layout/AppShell';
import OrgChartView from '@/components/views/OrgChartView';
import HierarchyView from '@/components/views/HierarchyView';
import SpreadsheetView from '@/components/views/SpreadsheetView';
import KanbanView from '@/components/views/KanbanView';
import CompareView from '@/components/views/CompareView';
import DashboardView from '@/components/views/DashboardView';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <AuthRoute>
              <LoginPage />
            </AuthRoute>
          }
        />
        <Route
          path="/register"
          element={
            <AuthRoute>
              <RegisterPage />
            </AuthRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<OrgChartView />} />
          <Route path="hierarchy" element={<HierarchyView />} />
          <Route path="spreadsheet" element={<SpreadsheetView />} />
          <Route path="kanban" element={<KanbanView />} />
          <Route path="compare" element={<CompareView />} />
          <Route path="dashboard" element={<DashboardView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
