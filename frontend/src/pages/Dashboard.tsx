import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useDashboard } from "@/hooks/useDashboard";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { WidgetModal } from "@/components/widgets/WidgetModal";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Period } from "@/types/api";

export function DashboardPage() {
  const { widgets, addWidget, removeWidget } = useDashboard();
  const [globalPeriod, setGlobalPeriod] = useState<Period>("30d");
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-3">
          <select
            value={globalPeriod}
            onChange={(e) => setGlobalPeriod(e.target.value as Period)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <PlusIcon className="h-4 w-4" />
            Add Widget
          </button>
        </div>
      </div>

      {/* Widget grid */}
      {widgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-20">
          <div className="text-center">
            <p className="text-lg font-medium text-gray-900">
              No widgets yet
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Add your first widget to start building your custom dashboard.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <PlusIcon className="h-4 w-4" />
              Add Widget
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {widgets.map((widget) => (
            <WidgetRenderer
              key={widget.id}
              widget={widget}
              globalPeriod={globalPeriod}
              onRemove={() => removeWidget(widget.id)}
            />
          ))}
        </div>
      )}

      {/* Widget creation modal */}
      <WidgetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addWidget}
      />
    </div>
  );
}
