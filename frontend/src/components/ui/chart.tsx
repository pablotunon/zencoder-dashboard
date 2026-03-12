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

// ── Exports ──────────────────────────────────────────────────────────────────

export {
  ChartContainer,
};
