export function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDuration(ms: number): string {
  if (ms >= 60_000) {
    return `${(ms / 60_000).toFixed(1)}m`;
  }
  if (ms >= 1_000) {
    return `${(ms / 1_000).toFixed(1)}s`;
  }
  return `${ms.toFixed(0)}ms`;
}

/**
 * Format an ISO timestamp for chart x-axis ticks based on granularity.
 *   minute → "HH:mm"
 *   hour   → "Mar 5 14:00"
 *   day    → "Mar 5"
 *   week   → "Mar 5"
 */
export function formatTimestamp(iso: string, granularity: "minute" | "hour" | "day" | "week"): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);

  const pad = (n: number) => String(n).padStart(2, "0");
  const monthDay = `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;

  switch (granularity) {
    case "minute":
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case "hour":
      return `${monthDay} ${pad(d.getHours())}:00`;
    case "day":
    case "week":
    default:
      return monthDay;
  }
}

export function formatChangePct(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
