import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import type {
  WidgetConfig,
  WidgetTimeseriesResponse,
} from "@/types/widget";

// Recharts components don't render in jsdom — stub them to pass through children/props
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    AreaChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
      <div data-testid="area-chart" data-points={data.length}>
        {children}
      </div>
    ),
    Area: () => <div data-testid="area" />,
  };
});

// Mock hooks used by WidgetRenderer
const mockWidgetData: { data: WidgetTimeseriesResponse | null; isLoading: boolean; error: Error | null } = {
  data: null,
  isLoading: false,
  error: null,
};

vi.mock("@/api/widget", () => ({
  useWidgetData: () => ({ ...mockWidgetData, refetch: vi.fn() }),
  useMultiMetricWidgetData: () => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/api/hooks", () => ({
  useUsageMetrics: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
  useOrg: () => ({ data: null, isLoading: false, error: null }),
}));

function makeKpiWidget(overrides?: Partial<WidgetConfig>): WidgetConfig {
  return {
    id: "test-kpi",
    title: "Test KPI",
    chartType: "kpi",
    metrics: ["cost"],
    timeRange: { useGlobal: true },
    ...overrides,
  };
}

function makeTimeseriesResponse(
  overrides?: Partial<WidgetTimeseriesResponse>,
): WidgetTimeseriesResponse {
  return {
    type: "timeseries",
    metric: "cost",
    granularity: "day",
    summary: { value: 12345, change_pct: 8.3 },
    data: [
      { timestamp: "2025-01-01", value: 100, is_partial: false },
      { timestamp: "2025-01-02", value: 250, is_partial: false },
      { timestamp: "2025-01-03", value: 180, is_partial: false },
      { timestamp: "2025-01-04", value: 300, is_partial: false },
      { timestamp: "2025-01-05", value: 50, is_partial: false },
    ],
    ...overrides,
  };
}

function renderWidget(widget: WidgetConfig) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WidgetRenderer
        widget={widget}
        globalDateRange={{ start: "2025-01-01", end: "2025-01-31" }}
      />
    </QueryClientProvider>,
  );
}

describe("KpiWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWidgetData.data = null;
    mockWidgetData.isLoading = false;
    mockWidgetData.error = null;
  });

  it("renders value and change percentage", () => {
    mockWidgetData.data = makeTimeseriesResponse();
    renderWidget(makeKpiWidget());

    expect(screen.getByText("$12.3K")).toBeInTheDocument();
    expect(screen.getByText(/\+8\.3%/)).toBeInTheDocument();
    expect(screen.getByText("vs prev period")).toBeInTheDocument();
  });

  it("derives and displays previous period value", () => {
    // value = 12345, change_pct = 8.3 → prevValue = 12345 / 1.083 ≈ 11,399.82
    mockWidgetData.data = makeTimeseriesResponse();
    renderWidget(makeKpiWidget());

    expect(screen.getByText(/was \$11\.4K/)).toBeInTheDocument();
  });

  it("shows metric description as card subtitle", () => {
    mockWidgetData.data = makeTimeseriesResponse();
    renderWidget(makeKpiWidget());

    expect(
      screen.getByText("Total spend across all agent runs"),
    ).toBeInTheDocument();
  });

  it("renders info icon with tooltip text", () => {
    mockWidgetData.data = makeTimeseriesResponse();
    renderWidget(makeKpiWidget());

    // The tooltip text from the registry should be present (hidden until hover)
    expect(
      screen.getByText(/Sum of all LLM API charges/),
    ).toBeInTheDocument();
  });

  it("renders sparkline when multiple non-partial data points exist", () => {
    mockWidgetData.data = makeTimeseriesResponse();
    renderWidget(makeKpiWidget());

    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    expect(screen.getByTestId("area-chart")).toBeInTheDocument();
  });

  it("shows period high/low from non-partial data", () => {
    mockWidgetData.data = makeTimeseriesResponse();
    renderWidget(makeKpiWidget());

    // min = 50, max = 300
    expect(screen.getByText(/Low \$50\.00/)).toBeInTheDocument();
    expect(screen.getByText(/High \$300\.00/)).toBeInTheDocument();
  });

  it("excludes partial buckets from sparkline and high/low", () => {
    mockWidgetData.data = makeTimeseriesResponse({
      data: [
        { timestamp: "2025-01-01", value: 100, is_partial: false },
        { timestamp: "2025-01-02", value: 200, is_partial: false },
        { timestamp: "2025-01-03", value: 9999, is_partial: true },
      ],
    });
    renderWidget(makeKpiWidget());

    // Sparkline should have 2 non-partial points
    const chart = screen.getByTestId("area-chart");
    expect(chart).toHaveAttribute("data-points", "2");

    // High/low should be 100–200, not include 9999
    expect(screen.getByText(/Low \$100\.00/)).toBeInTheDocument();
    expect(screen.getByText(/High \$200\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/9,999/)).not.toBeInTheDocument();
  });

  it("hides sparkline and high/low when data is empty", () => {
    mockWidgetData.data = makeTimeseriesResponse({ data: [] });
    renderWidget(makeKpiWidget());

    expect(screen.queryByTestId("responsive-container")).not.toBeInTheDocument();
    expect(screen.queryByText(/Low/)).not.toBeInTheDocument();
    expect(screen.queryByText(/High/)).not.toBeInTheDocument();
  });

  it("hides sparkline and high/low when all data is partial", () => {
    mockWidgetData.data = makeTimeseriesResponse({
      data: [
        { timestamp: "2025-01-01", value: 100, is_partial: true },
        { timestamp: "2025-01-02", value: 200, is_partial: true },
      ],
    });
    renderWidget(makeKpiWidget());

    expect(screen.queryByTestId("responsive-container")).not.toBeInTheDocument();
    expect(screen.queryByText(/Low/)).not.toBeInTheDocument();
  });

  it("hides previous value when change_pct is null", () => {
    mockWidgetData.data = makeTimeseriesResponse({
      summary: { value: 500, change_pct: null },
    });
    renderWidget(makeKpiWidget());

    expect(screen.queryByText(/was/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vs prev period/)).not.toBeInTheDocument();
  });

  it("shows neutral style when change_pct is 0", () => {
    mockWidgetData.data = makeTimeseriesResponse({
      summary: { value: 500, change_pct: 0 },
    });
    renderWidget(makeKpiWidget());

    const changeLine = screen.getByText(/0\.0%/);
    expect(changeLine).toHaveClass("text-gray-500");
  });

  it("shows constant value when high equals low (single data point)", () => {
    mockWidgetData.data = makeTimeseriesResponse({
      data: [
        { timestamp: "2025-01-01", value: 42, is_partial: false },
      ],
    });
    renderWidget(makeKpiWidget());

    // Single point: no sparkline, but high/low still computed (high === low)
    expect(screen.queryByTestId("responsive-container")).not.toBeInTheDocument();
    expect(screen.getByText(/Constant \$42\.00/)).toBeInTheDocument();
  });
});
