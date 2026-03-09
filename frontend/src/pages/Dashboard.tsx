import { useState } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { RowLayout } from "@/components/widgets/RowLayout";
import { AddRowPicker } from "@/components/widgets/AddRowPicker";
import { WidgetModal } from "@/components/widgets/WidgetModal";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Period } from "@/types/api";
import type { WidgetConfig } from "@/types/widget";

export function DashboardPage() {
  const { rows, addRow, removeRow, addWidgetToSlot, removeWidgetFromSlot } =
    useDashboard();
  const [globalPeriod, setGlobalPeriod] = useState<Period>("30d");

  // Track which slot the modal is adding a widget to
  const [modalTarget, setModalTarget] = useState<{
    rowId: string;
    slotIndex: number;
  } | null>(null);

  const handleAddWidget = (config: Omit<WidgetConfig, "id">) => {
    if (!modalTarget) return;
    addWidgetToSlot(modalTarget.rowId, modalTarget.slotIndex, config);
    setModalTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
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
      </div>

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-20">
          <p className="text-lg font-medium text-gray-900">No rows yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Add a row to start building your custom dashboard.
          </p>
        </div>
      )}

      {/* Row layout */}
      <RowLayout
        rows={rows}
        globalPeriod={globalPeriod}
        onAddWidget={(rowId, slotIndex) =>
          setModalTarget({ rowId, slotIndex })
        }
        onRemoveWidget={removeWidgetFromSlot}
        onRemoveRow={removeRow}
      />

      {/* Add row picker */}
      <AddRowPicker onAddRow={addRow} />

      {/* Widget creation modal */}
      <WidgetModal
        open={modalTarget !== null}
        onClose={() => setModalTarget(null)}
        onAdd={handleAddWidget}
      />
    </div>
  );
}
