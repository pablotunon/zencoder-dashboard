import { useCallback, useState } from "react";
import type { DashboardRow, WidgetConfig } from "@/types/widget";

let nextId = 1;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${nextId++}`;
}

export function useDashboard() {
  const [rows, setRows] = useState<DashboardRow[]>([]);

  /** Add a new empty row with the given column count. */
  const addRow = useCallback((columns: 1 | 2 | 3 | 4) => {
    const row: DashboardRow = {
      id: generateId("row"),
      columns,
      widgets: Array.from({ length: columns }, () => null),
    };
    setRows((prev) => [...prev, row]);
  }, []);

  /** Remove an entire row by id. */
  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  /** Place a widget into a specific slot (column index) of a row. */
  const addWidgetToSlot = useCallback(
    (rowId: string, slotIndex: number, config: Omit<WidgetConfig, "id">) => {
      const widget: WidgetConfig = { ...config, id: generateId("w") };
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row;
          const next = [...row.widgets];
          next[slotIndex] = widget;
          return { ...row, widgets: next };
        }),
      );
    },
    [],
  );

  /** Remove a widget from a specific slot, leaving the slot null. */
  const removeWidgetFromSlot = useCallback(
    (rowId: string, slotIndex: number) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row;
          const next = [...row.widgets];
          next[slotIndex] = null;
          return { ...row, widgets: next };
        }),
      );
    },
    [],
  );

  return { rows, addRow, removeRow, addWidgetToSlot, removeWidgetFromSlot };
}
