import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { FilterBar } from "./FilterBar";

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <FilterBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
