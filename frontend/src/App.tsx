import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { DashboardPage } from "@/pages/Dashboard";
import { OverviewPage } from "@/pages/Overview";
import { UsagePage } from "@/pages/Usage";
import { CostPage } from "@/pages/Cost";
import { PerformancePage } from "@/pages/Performance";
import { LoginPage } from "@/pages/Login";
import { useAuth } from "@/hooks/useAuth";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="/cost" element={<CostPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
