import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { DashboardPage } from "@/pages/Dashboard";
import { OverviewPage } from "@/pages/Overview";
import { UsagePage } from "@/pages/Usage";
import { CostPage } from "@/pages/Cost";
import { PerformancePage } from "@/pages/Performance";

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
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
