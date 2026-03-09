/**
 * Custom tooltip for Tremor charts that annotates partial-day data points.
 *
 * When the hovered data point has `is_partial: true`, a "(partial day)"
 * label is appended to the date header inside the tooltip.
 *
 * Handles the split-series approach: filters out `_partial` duplicate
 * entries so each category only appears once.
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

  // Deduplicate: for the bridge point both "runs" and "runs_partial" have
  // values. Keep only the non-partial entry for those; for the actual partial
  // point, keep only the _partial entry (since the base is null).
  const seen = new Set<string>();
  const items = payload.filter((item) => {
    if (item.value == null) return false;
    const key = String(item.dataKey);
    const baseName = key.replace(/_partial$/, "");
    if (seen.has(baseName)) return false;
    seen.add(baseName);
    return true;
  });

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
        {items.map((item) => (
          <div
            key={String(item.dataKey)}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-gray-600">
                {String(item.dataKey).replace(/_partial$/, "")}
              </span>
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
