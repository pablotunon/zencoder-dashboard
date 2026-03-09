import { useCallback, useState } from "react";
import type { WidgetConfig } from "@/types/widget";

let nextId = 1;

function generateId(): string {
  return `w-${Date.now()}-${nextId++}`;
}

export function useDashboard() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);

  const addWidget = useCallback((config: Omit<WidgetConfig, "id">) => {
    const widget: WidgetConfig = { ...config, id: generateId() };
    setWidgets((prev) => [...prev, widget]);
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const updateWidget = useCallback(
    (id: string, updates: Partial<Omit<WidgetConfig, "id">>) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...updates } : w)),
      );
    },
    [],
  );

  return { widgets, addWidget, removeWidget, updateWidget };
}
