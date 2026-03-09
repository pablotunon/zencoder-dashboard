/**
 * Legacy WidgetRenderer — placeholder pending replacement by Widget.tsx
 * in the "Frontend — Widget Renderer Component" step.
 *
 * This file compiles against the new widget type system but is not
 * actively used. It will be replaced with the full renderer that
 * handles all 6 chart types and the new POST /api/metrics/widget endpoint.
 */

import { METRIC_REGISTRY } from "@/lib/widget-registry";
import { ChartSkeleton } from "@/components/ui/Skeleton";
import type { WidgetConfig } from "@/types/widget";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface WidgetRendererProps {
  widget: WidgetConfig;
  onRemove?: () => void;
}

export function WidgetRenderer({ widget, onRemove }: WidgetRendererProps) {
  const meta = METRIC_REGISTRY[widget.metric];

  if (!meta) {
    return <ChartSkeleton />;
  }

  return (
    <WidgetCard title={widget.title} onRemove={onRemove}>
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        {meta.label} — {widget.chartType} chart (renderer pending)
      </div>
    </WidgetCard>
  );
}

function WidgetCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-medium text-gray-900">{title}</h2>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Remove widget"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
