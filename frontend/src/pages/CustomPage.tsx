import { useState, useCallback, useRef, useEffect } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useParams, Navigate } from "react-router-dom";
import { ChevronDownIcon, PencilIcon } from "@heroicons/react/24/outline";
import { usePage, usePages, useUpdatePage } from "@/api/pages";
import { useDashboard } from "@/hooks/useDashboard";
import { RowLayout } from "@/components/widgets/RowLayout";
import { AddRowPicker } from "@/components/widgets/AddRowPicker";
import { WidgetModal } from "@/components/widgets/WidgetModal";
import { UndoToast } from "@/components/ui/UndoToast";
import { getIcon, PAGE_ICON_OPTIONS } from "@/lib/icon-registry";
import { getDefaultDateRange } from "@/lib/constants";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import type { DateRange } from "@/types/api";
import type { DashboardRow, WidgetConfig } from "@/types/widget";

const AUTOSAVE_DELAY = 1000;

export function CustomPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: page, isLoading, isError } = usePage(slug ?? "");
  const updatePage = useUpdatePage(slug ?? "");

  const [globalDateRange, setGlobalDateRange] = useState<DateRange>(getDefaultDateRange);
  const [modalTarget, setModalTarget] = useState<{
    rowId: string;
    slotIndex: number;
  } | null>(null);

  // Inline editing state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const iconPickerRef = useRef<HTMLDivElement>(null);

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

  const {
    rows,
    addRow,
    removeRow,
    addWidgetToSlot,
    removeWidgetFromSlot,
    addColumn,
    removeColumn,
    restoreRows,
  } = useDashboard({
    initialRows: page?.layout,
    onChange: handleLayoutChange,
  });

  // Undo state for destructive deletions
  const undoKeyRef = useRef(0);
  const [undoState, setUndoState] = useState<{
    snapshot: DashboardRow[];
    message: string;
    key: number;
  } | null>(null);

  const handleRemoveRow = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (row && row.widgets.some((w) => w !== null)) {
        undoKeyRef.current += 1;
        setUndoState({ snapshot: rows, message: "Row deleted", key: undoKeyRef.current });
      }
      removeRow(rowId);
    },
    [rows, removeRow],
  );

  const handleRemoveWidget = useCallback(
    (rowId: string, slotIndex: number) => {
      undoKeyRef.current += 1;
      setUndoState({ snapshot: rows, message: "Widget removed", key: undoKeyRef.current });
      removeWidgetFromSlot(rowId, slotIndex);
    },
    [rows, removeWidgetFromSlot],
  );

  const handleUndo = useCallback(() => {
    if (undoState) {
      restoreRows(undoState.snapshot);
      setUndoState(null);
    }
  }, [undoState, restoreRows]);

  const dismissUndo = useCallback(() => {
    setUndoState(null);
  }, []);

  // Focus input when editing name
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  // Close icon picker on outside click or Escape
  const closeIconPicker = useCallback(() => setIconPickerOpen(false), []);
  useOutsideClick(iconPickerRef, closeIconPicker, iconPickerOpen);

  const startEditingName = () => {
    if (!page) return;
    setNameValue(page.name);
    setEditingName(true);
  };

  const saveName = () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== page?.name) {
      updatePage.mutate({ name: trimmed });
    }
  };

  const handleIconChange = (iconKey: string) => {
    setIconPickerOpen(false);
    if (iconKey !== page?.icon) {
      updatePage.mutate({ icon: iconKey });
    }
  };

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

  const PageIcon = getIcon(page.icon);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Icon button with picker */}
          <div className="relative" ref={iconPickerRef}>
            <button
              onClick={() => setIconPickerOpen(!iconPickerOpen)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Change icon"
            >
              <PageIcon className="h-6 w-6" />
              <ChevronDownIcon className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-gray-400" />
            </button>

            {iconPickerOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                <div className="grid grid-cols-8 gap-1">
                  {PAGE_ICON_OPTIONS.map((entry) => {
                    const Icon = entry.component;
                    const selected = page.icon === entry.key;
                    return (
                      <button
                        key={entry.key}
                        type="button"
                        onClick={() => handleIconChange(entry.key)}
                        title={entry.label}
                        className={`flex items-center justify-center rounded p-1.5 transition-colors ${
                          selected
                            ? "bg-indigo-100 text-indigo-700"
                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Editable title */}
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditingName(false);
              }}
              maxLength={100}
              className="rounded-md border border-gray-300 px-2 py-1 text-2xl font-semibold text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <button
              onClick={startEditingName}
              className="group flex items-center gap-2"
            >
              <h1 className="text-2xl font-semibold text-gray-900">
                {page.name}
              </h1>
              <PencilIcon className="h-4 w-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {updatePage.isPending && (
            <span className="text-xs text-gray-400">Saving...</span>
          )}
          <DateRangePicker
            value={globalDateRange}
            onChange={setGlobalDateRange}
          />
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
        globalDateRange={globalDateRange}
        onAddWidget={(rowId, slotIndex) =>
          setModalTarget({ rowId, slotIndex })
        }
        onRemoveWidget={handleRemoveWidget}
        onRemoveRow={handleRemoveRow}
        onAddColumn={addColumn}
        onRemoveColumn={removeColumn}
      />

      {/* Add row picker */}
      <AddRowPicker onAddRow={addRow} />

      {/* Widget creation modal */}
      <WidgetModal
        open={modalTarget !== null}
        onClose={() => setModalTarget(null)}
        onAdd={handleAddWidget}
      />

      {/* Undo toast for destructive deletions */}
      {undoState && (
        <UndoToast
          key={undoState.key}
          message={undoState.message}
          onUndo={handleUndo}
          onDismiss={dismissUndo}
        />
      )}
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
