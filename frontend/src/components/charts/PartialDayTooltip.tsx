/**
 * Custom Recharts tooltip content that annotates partial-day data points.
 *
 * When the hovered data point has `is_partial: true`, a "(partial day)"
 * label is appended to the date header inside the tooltip.
 */

import type { ChartConfig } from "@/components/ui/chart";

interface PartialDayTooltipProps {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  config: ChartConfig;
  valueFormatter?: (value: number) => string;
}

export function PartialDayTooltip({
  active,
  payload,
  label,
  config,
  valueFormatter = (v) => String(v),
}: PartialDayTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = payload[0]?.payload as any;
  const isPartial = row?.is_partial === true;

  const items = payload.filter((item) => item.value != null);
  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg">
      <p className="mb-1 font-medium text-gray-900">
        {label}
        {isPartial && (
          <span className="ml-1 font-normal text-amber-600">
            (partial day)
          </span>
        )}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const key = String(item.dataKey);
          const configEntry = config[key];
          const displayName = configEntry?.label ?? key;
          const color = String(item.color || configEntry?.color || "#888");

          return (
            <div
              key={key}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-gray-600">
                  {String(displayName)}
                </span>
              </div>
              <span className="font-medium text-gray-900">
                {valueFormatter(Number(item.value))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
