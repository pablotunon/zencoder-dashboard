/**
 * Reusable time-series chart with partial-day visual treatment.
 *
 * Supports both "area" and "line" variants. When the data contains an
 * `is_partial: true` point (always the last point — today's incomplete data),
 * the chart renders:
 *   1. A horizontal SVG gradient that fades the stroke + fill in the last
 *      interval (between the second-to-last and last data points).
 *   2. A dashed vertical reference line at the boundary.
 *   3. A larger, ring-style dot on the partial point.
 */

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { PartialDayTooltip } from "@/components/charts/PartialDayTooltip";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataRow = Record<string, any>;

interface SeriesConfig {
  key: string;
  color: string;
}

interface TimeSeriesChartProps {
  /** "area" fills under the line; "line" draws only the stroke. */
  variant?: "area" | "line";
  /** The data array — must include `is_partial?: boolean` per row. */
  data: DataRow[];
  /** Data key used for the X axis. */
  index?: string;
  /** Series to render. Derived from `config` if omitted. */
  series?: SeriesConfig[];
  /** ChartConfig for labels + colors. */
  config: ChartConfig;
  /** Format Y-axis tick labels. */
  yFormatter?: (value: number) => string;
  /** Format tooltip values. */
  valueFormatter?: (value: number) => string;
  /** Tailwind className for the chart container (height + width). */
  className?: string;
}

/**
 * Compute the fractional X offset (0–1) where partial data begins.
 * For N data points the boundary sits between point N-2 and N-1.
 */
function partialOffset(dataLength: number): number | null {
  if (dataLength < 2) return null;
  return (dataLength - 2) / (dataLength - 1);
}

export function TimeSeriesChart({
  variant = "area",
  data,
  index = "date",
  series: seriesProp,
  config,
  yFormatter,
  valueFormatter,
  className = "h-64 w-full",
}: TimeSeriesChartProps) {
  const uid = useId().replace(/:/g, "");

  const hasPartial = data.length > 0 && data[data.length - 1]?.is_partial === true;
  const offset = useMemo(() => (hasPartial ? partialOffset(data.length) : null), [hasPartial, data.length]);

  // Derive series from config if not explicitly provided.
  const series: SeriesConfig[] = useMemo(
    () =>
      seriesProp ??
      Object.entries(config).map(([key, v]) => ({
        key,
        color: v.color ?? "#888",
      })),
    [seriesProp, config],
  );

  // The X-axis value of the second-to-last point (for the ReferenceLine).
  const boundaryX = hasPartial && data.length >= 2 ? data[data.length - 2]?.[index] : null;

  const ChartComponent = variant === "area" ? AreaChart : LineChart;

  return (
    <ChartContainer config={config} className={className}>
      <ChartComponent data={data} accessibilityLayer>
        {/* ── SVG gradient defs ──────────────────────────────── */}
        <defs>
          {series.map((s) => {
            const gradientId = `grad-${uid}-${s.key}`;
            return offset !== null ? (
              <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="1" y2="0">
                {/* Full color up to the boundary */}
                <stop offset={offset} stopColor={s.color} stopOpacity={1} />
                {/* Fade to low opacity for the partial segment */}
                <stop offset={1} stopColor={s.color} stopOpacity={0.3} />
              </linearGradient>
            ) : null;
          })}
          {/* Vertical fill gradients for area variant */}
          {variant === "area" &&
            series.map((s) => {
              const fillGradId = `fill-${uid}-${s.key}`;
              if (offset === null) {
                // No partial — simple vertical gradient
                return (
                  <linearGradient key={fillGradId} id={fillGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                );
              }
              // With partial: full fill fades, then near-transparent in partial zone
              return (
                <linearGradient key={fillGradId} id={fillGradId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset={offset} stopColor={s.color} stopOpacity={0.15} />
                  <stop offset={1} stopColor={s.color} stopOpacity={0.04} />
                </linearGradient>
              );
            })}
        </defs>

        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={index} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={yFormatter} />
        <Tooltip
          content={(props) => (
            <PartialDayTooltip
              {...props}
              config={config}
              valueFormatter={valueFormatter}
            />
          )}
        />

        {/* ── Dashed boundary line ────────────────────────── */}
        {boundaryX != null && (
          <ReferenceLine
            x={boundaryX}
            stroke="#9ca3af"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
        )}

        {/* ── Series ──────────────────────────────────────── */}
        {series.map((s) => {
          const strokeGrad = offset !== null ? `url(#grad-${uid}-${s.key})` : s.color;
          const fillGrad = `url(#fill-${uid}-${s.key})`;

          // Shared dot renderer for partial-day indicator
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dotRenderer = (props: any) => {
            const { cx, cy, payload } = props;
            if (!payload?.is_partial) return <circle key={`dot-${s.key}-${cx}`} r={0} />;
            return (
              <circle
                key={`dot-${s.key}-${cx}`}
                cx={cx}
                cy={cy}
                r={5}
                fill="white"
                stroke={s.color}
                strokeOpacity={0.6}
                strokeWidth={2.5}
              />
            );
          };

          if (variant === "area") {
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={strokeGrad}
                strokeWidth={2}
                fill={fillGrad}
                fillOpacity={1}
                dot={dotRenderer}
                activeDot={{ r: 4 }}
              />
            );
          }

          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={strokeGrad}
              strokeWidth={2}
              dot={dotRenderer}
              activeDot={{ r: 4 }}
            />
          );
        })}
      </ChartComponent>
    </ChartContainer>
  );
}
