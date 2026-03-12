import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import type {
  WidgetConfig,
  WidgetTimeseriesResponse,
  WidgetBreakdownResponse,
} from "@/types/widget";

// Recharts components don't render in jsdom — stub them
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

// Mock hooks used by WidgetRenderer
const mockWidgetData: {
  data: WidgetTimeseriesResponse | WidgetBreakdownResponse | null;
  isLoading: boolean;
  error: Error | null;
} = {
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

function makeTableWidget(overrides?: Partial<WidgetConfig>): WidgetConfig {
  return {
    id: "test-table",
    title: "Test Table",
    chartType: "table",
    metrics: ["run_count"],
    timeRange: { useGlobal: true },
    ...overrides,
  };
}

function makeTimeseriesResponse(
  overrides?: Partial<WidgetTimeseriesResponse>,
): WidgetTimeseriesResponse {
  return {
    type: "timeseries",
    metric: "run_count",
    granularity: "day",
    summary: { value: 750, change_pct: 5.0 },
    data: [
      { timestamp: "2025-01-01", value: 100, is_partial: false },
      { timestamp: "2025-01-02", value: 250, is_partial: false },
      { timestamp: "2025-01-03", value: 400, is_partial: false },
    ],
    ...overrides,
  };
}

function makeBreakdownResponse(
  overrides?: Partial<WidgetBreakdownResponse>,
): WidgetBreakdownResponse {
  return {
    type: "breakdown",
    metric: "run_count",
    dimension: "team",
    data: [
      { label: "Platform", value: 300 },
      { label: "Backend", value: 250 },
      { label: "Frontend", value: 200 },
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

describe("TableWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWidgetData.data = null;
    mockWidgetData.isLoading = false;
    mockWidgetData.error = null;
  });

  describe("with timeseries data (no breakdown)", () => {
    it("renders a table with date and metric columns", () => {
      mockWidgetData.data = makeTimeseriesResponse();
      renderWidget(makeTableWidget());

      expect(screen.getByText("Date")).toBeInTheDocument();
      expect(screen.getByText("Run Count")).toBeInTheDocument();
    });

    it("renders a row for each data point", () => {
      mockWidgetData.data = makeTimeseriesResponse();
      renderWidget(makeTableWidget());

      const rows = screen.getAllByRole("row");
      // 1 header row + 3 data rows
      expect(rows).toHaveLength(4);
    });

    it("displays formatted values in each row", () => {
      mockWidgetData.data = makeTimeseriesResponse();
      renderWidget(makeTableWidget());

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText("250")).toBeInTheDocument();
      expect(screen.getByText("400")).toBeInTheDocument();
    });

    it("excludes partial data points", () => {
      mockWidgetData.data = makeTimeseriesResponse({
        data: [
          { timestamp: "2025-01-01", value: 100, is_partial: false },
          { timestamp: "2025-01-02", value: 250, is_partial: false },
          { timestamp: "2025-01-03", value: 9999, is_partial: true },
        ],
      });
      renderWidget(makeTableWidget());

      const rows = screen.getAllByRole("row");
      // 1 header row + 2 non-partial data rows
      expect(rows).toHaveLength(3);
      expect(screen.queryByText("9,999")).not.toBeInTheDocument();
    });

    it("renders empty table body when all points are partial", () => {
      mockWidgetData.data = makeTimeseriesResponse({
        data: [
          { timestamp: "2025-01-01", value: 100, is_partial: true },
          { timestamp: "2025-01-02", value: 200, is_partial: true },
        ],
      });
      renderWidget(makeTableWidget());

      // Header row only
      const rows = screen.getAllByRole("row");
      expect(rows).toHaveLength(1);
    });
  });

  describe("with breakdown data", () => {
    it("renders dimension and value columns", () => {
      mockWidgetData.data = makeBreakdownResponse();
      renderWidget(
        makeTableWidget({ breakdownDimension: "team" }),
      );

      expect(screen.getByText("Team")).toBeInTheDocument();
      expect(screen.getByText("Value")).toBeInTheDocument();
    });

    it("renders a row for each breakdown item", () => {
      mockWidgetData.data = makeBreakdownResponse();
      renderWidget(
        makeTableWidget({ breakdownDimension: "team" }),
      );

      const rows = screen.getAllByRole("row");
      // 1 header + 3 data rows
      expect(rows).toHaveLength(4);

      expect(screen.getByText("Platform")).toBeInTheDocument();
      expect(screen.getByText("Backend")).toBeInTheDocument();
      expect(screen.getByText("Frontend")).toBeInTheDocument();
    });

    it("capitalizes the dimension name in the header", () => {
      mockWidgetData.data = makeBreakdownResponse({
        dimension: "agent_type",
      });
      renderWidget(
        makeTableWidget({ breakdownDimension: "agent_type" }),
      );

      expect(screen.getByText("Agent_type")).toBeInTheDocument();
    });
  });
});
