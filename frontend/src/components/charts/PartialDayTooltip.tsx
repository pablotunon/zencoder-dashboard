/**
 * Custom tooltip for Tremor charts that annotates partial-day data points.
 *
 * When the hovered data point has `is_partial: true`, a "(partial day)"
 * label is appended to the date header inside the tooltip.
 */

import type { CustomTooltipProps } from "@tremor/react";

interface Props extends CustomTooltipProps {
  valueFormatter?: (value: number) => string;
}

export function PartialDayTooltip({
  active,
  payload,
  label,
  valueFormatter = (v) => String(v),
}: Props) {
  if (!active || !payload || payload.length === 0) return null;

  const isPartial =
    (payload[0]?.payload as Record<string, unknown>)?.is_partial === true;

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
        {payload.map((item) => (
          <div
            key={String(item.dataKey)}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-gray-600">{String(item.dataKey)}</span>
            </div>
            <span className="font-medium text-gray-900">
              {valueFormatter(Number(item.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
