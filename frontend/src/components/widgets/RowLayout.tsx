import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { WidgetRenderer } from "./WidgetRenderer";
import type { Period } from "@/types/api";
import type { DashboardRow } from "@/types/widget";

/** CSS grid class per column count. */
const GRID_COLS: Record<1 | 2 | 3 | 4, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
};

interface RowLayoutProps {
  rows: DashboardRow[];
  globalPeriod: Period;
  /** When provided, empty slots show a "+" button. */
  onAddWidget?: (rowId: string, slotIndex: number) => void;
  /** When provided, widgets show a remove button. */
  onRemoveWidget?: (rowId: string, slotIndex: number) => void;
  /** When provided, each row shows a delete row button. */
  onRemoveRow?: (rowId: string) => void;
}

export function RowLayout({
  rows,
  globalPeriod,
  onAddWidget,
  onRemoveWidget,
  onRemoveRow,
}: RowLayoutProps) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-6">
      {rows.map((row) => (
        <div key={row.id} className="group/row relative">
          {/* Row delete button — visible on hover when editable */}
          {onRemoveRow && (
            <button
              onClick={() => onRemoveRow(row.id)}
              className="absolute -right-2 -top-2 z-10 hidden rounded-full bg-red-100 p-1 text-red-600 hover:bg-red-200 group-hover/row:block"
              title="Remove row"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}

          <div className={`grid gap-6 ${GRID_COLS[row.columns]}`}>
            {row.widgets.map((widget, slotIndex) =>
              widget ? (
                <WidgetRenderer
                  key={widget.id}
                  widget={widget}
                  globalPeriod={globalPeriod}
                  onRemove={
                    onRemoveWidget
                      ? () => onRemoveWidget(row.id, slotIndex)
                      : undefined
                  }
                />
              ) : (
                <EmptySlot
                  key={`${row.id}-empty-${slotIndex}`}
                  onClick={
                    onAddWidget
                      ? () => onAddWidget(row.id, slotIndex)
                      : undefined
                  }
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Grayed-out placeholder for an empty slot. */
function EmptySlot({ onClick }: { onClick?: () => void }) {
  if (!onClick) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50" />
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex min-h-[200px] items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/50 transition-colors hover:border-indigo-400 hover:bg-indigo-50/50"
    >
      <PlusIcon className="h-8 w-8 text-gray-400" />
    </button>
  );
}
