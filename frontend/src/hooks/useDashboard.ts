import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardRow, WidgetConfig } from "@/types/widget";

let nextId = 1;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${nextId++}`;
}

interface UseDashboardOptions {
  initialRows?: DashboardRow[];
  onChange?: (rows: DashboardRow[]) => void;
}

export function useDashboard(options: UseDashboardOptions = {}) {
  const { initialRows, onChange } = options;
  const [rows, setRows] = useState<DashboardRow[]>(initialRows ?? []);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reset rows when initialRows identity changes (e.g. new page loaded)
  const initialRef = useRef(initialRows);
  useEffect(() => {
    if (initialRows && initialRows !== initialRef.current) {
      initialRef.current = initialRows;
      setRows(initialRows);
    }
  }, [initialRows]);

  // Notify parent of changes
  const notifyChange = useCallback((nextRows: DashboardRow[]) => {
    onChangeRef.current?.(nextRows);
  }, []);

  /** Add a new empty row with the given column count. */
  const addRow = useCallback((columns: 1 | 2 | 3 | 4) => {
    const row: DashboardRow = {
      id: generateId("row"),
      columns,
      widgets: Array.from({ length: columns }, () => null),
    };
    setRows((prev) => {
      const next = [...prev, row];
      notifyChange(next);
      return next;
    });
  }, [notifyChange]);

  /** Remove an entire row by id. */
  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== rowId);
      notifyChange(next);
      return next;
    });
  }, [notifyChange]);

  /** Place a widget into a specific slot (column index) of a row. */
  const addWidgetToSlot = useCallback(
    (rowId: string, slotIndex: number, config: Omit<WidgetConfig, "id">) => {
      const widget: WidgetConfig = { ...config, id: generateId("w") };
      setRows((prev) => {
        const next = prev.map((row) => {
          if (row.id !== rowId) return row;
          const widgets = [...row.widgets];
          widgets[slotIndex] = widget;
          return { ...row, widgets };
        });
        notifyChange(next);
        return next;
      });
    },
    [notifyChange],
  );

  /** Remove a widget from a specific slot, leaving the slot null. */
  const removeWidgetFromSlot = useCallback(
    (rowId: string, slotIndex: number) => {
      setRows((prev) => {
        const next = prev.map((row) => {
          if (row.id !== rowId) return row;
          const widgets = [...row.widgets];
          widgets[slotIndex] = null;
          return { ...row, widgets };
        });
        notifyChange(next);
        return next;
      });
    },
    [notifyChange],
  );

  return { rows, addRow, removeRow, addWidgetToSlot, removeWidgetFromSlot };
}
