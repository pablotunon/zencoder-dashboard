import * as React from "react";
import * as RechartsPrimitive from "recharts";

// ── ChartConfig ──────────────────────────────────────────────────────────────

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
  }
>;

// ── Context ──────────────────────────────────────────────────────────────────

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return context;
}

// ── ChartContainer ───────────────────────────────────────────────────────────

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={className}
        style={
          {
            ...Object.fromEntries(
              Object.entries(config).map(([key, value]) => [
                `--color-${key}`,
                value.color,
              ]),
            ),
          } as React.CSSProperties
        }
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

// ── ChartTooltip ─────────────────────────────────────────────────────────────

const ChartTooltip = RechartsPrimitive.Tooltip;

// ── ChartTooltipContent ──────────────────────────────────────────────────────

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
    valueFormatter?: (value: number) => string;
    labelFormatter?: (label: string, payload: unknown[]) => React.ReactNode;
  }
>(
  (
    {
      active,
      payload,
      label,
      hideLabel = false,
      hideIndicator = false,
      indicator = "dot",
      nameKey,
      labelKey,
      valueFormatter,
      labelFormatter,
    },
    ref,
  ) => {
    const { config } = useChart();

    if (!active || !payload?.length) return null;

    const displayLabel = labelFormatter
      ? labelFormatter(String(label), payload)
      : labelKey
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (payload[0] as any)?.payload?.[labelKey] ?? label
        : label;

    return (
      <div
        ref={ref}
        className="rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg"
      >
        {!hideLabel && displayLabel && (
          <p className="mb-1 font-medium text-gray-900">
            {String(displayLabel)}
          </p>
        )}
        <div className="space-y-0.5">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {payload.map((item: any, i: number) => {
            if (item.value == null) return null;
            const key = nameKey
              ? String(item.payload?.[nameKey] ?? item.dataKey)
              : String(item.dataKey);
            const configEntry = config[key as keyof typeof config] || config[String(item.dataKey) as keyof typeof config];
            const displayName = configEntry?.label ?? key;
            const color = String(item.color || configEntry?.color || "#888");
            const formatted = valueFormatter
              ? valueFormatter(Number(item.value))
              : String(item.value);

            return (
              <div
                key={`${key}-${i}`}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-1.5">
                  {!hideIndicator && (
                    <span
                      className={
                        indicator === "dot"
                          ? "inline-block h-2.5 w-2.5 rounded-full"
                          : indicator === "line"
                            ? "inline-block h-0.5 w-3 rounded-full"
                            : "inline-block h-2.5 w-2.5 rounded-sm border-2 border-dashed"
                      }
                      style={{ backgroundColor: indicator !== "dashed" ? color : undefined, borderColor: indicator === "dashed" ? color : undefined }}
                    />
                  )}
                  <span className="text-gray-600">{String(displayName)}</span>
                </div>
                <span className="font-medium text-gray-900">{formatted}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
ChartTooltipContent.displayName = "ChartTooltipContent";

// ── Exports ──────────────────────────────────────────────────────────────────

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  useChart,
};
