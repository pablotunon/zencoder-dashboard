import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import { usePage, usePages, useUpdatePage } from "@/api/pages";
import { useDashboard } from "@/hooks/useDashboard";
import { RowLayout } from "@/components/widgets/RowLayout";
import { AddRowPicker } from "@/components/widgets/AddRowPicker";
import { WidgetModal } from "@/components/widgets/WidgetModal";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Period } from "@/types/api";
import type { DashboardRow, WidgetConfig } from "@/types/widget";

const AUTOSAVE_DELAY = 1000;

export function CustomPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: page, isLoading, isError } = usePage(slug ?? "");
  const updatePage = useUpdatePage(slug ?? "");

  const [globalPeriod, setGlobalPeriod] = useState<Period>("30d");
  const [modalTarget, setModalTarget] = useState<{
    rowId: string;
    slotIndex: number;
  } | null>(null);

  // Debounced auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleLayoutChange = useCallback(
    (rows: DashboardRow[]) => {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updatePage.mutate({ layout: rows });
      }, AUTOSAVE_DELAY);
    },
    [updatePage],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(saveTimerRef.current);
  }, []);

  const { rows, addRow, removeRow, addWidgetToSlot, removeWidgetFromSlot } =
    useDashboard({
      initialRows: page?.layout,
      onChange: handleLayoutChange,
    });

  const handleAddWidget = (config: Omit<WidgetConfig, "id">) => {
    if (!modalTarget) return;
    addWidgetToSlot(modalTarget.rowId, modalTarget.slotIndex, config);
    setModalTarget(null);
  };

  if (!slug) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-gray-500">Loading page...</p>
      </div>
    );
  }

  if (isError || !page) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-red-500">Page not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{page.name}</h1>
        <div className="flex items-center gap-3">
          {updatePage.isPending && (
            <span className="text-xs text-gray-400">Saving...</span>
          )}
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
      </div>

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-20">
          <p className="text-lg font-medium text-gray-900">No rows yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Add a row to start building your page.
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

/** Redirects / to the first page's slug. */
export function RootRedirect() {
  const { data: pages, isLoading } = usePages();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  const firstSlug = pages?.[0]?.slug;
  if (firstSlug) {
    return <Navigate to={`/p/${firstSlug}`} replace />;
  }

  // No pages at all — show empty state
  return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm text-gray-500">
        No pages found. Create one to get started.
      </p>
    </div>
  );
}
