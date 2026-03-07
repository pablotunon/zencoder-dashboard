import type { KpiCard } from "@/types/api";
import { formatChangePct } from "@/lib/formatters";

interface KpiCardComponentProps {
  title: string;
  data: KpiCard;
  formatter: (value: number) => string;
}

export function KpiCardComponent({
  title,
  data,
  formatter,
}: KpiCardComponentProps) {
  const changePositive =
    data.change_pct !== null ? data.change_pct >= 0 : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-3xl font-semibold text-gray-900">
        {formatter(data.value)}
      </p>
      {data.change_pct !== null && (
        <p
          className={`mt-1 text-sm font-medium ${
            changePositive ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatChangePct(data.change_pct)}{" "}
          <span className="font-normal text-gray-500">
            vs prev {data.period}
          </span>
        </p>
      )}
    </div>
  );
}
