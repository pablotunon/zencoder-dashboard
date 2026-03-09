/**
 * Splits time-series data so that partial (today's) data points render
 * as a separate series with a lighter color in Tremor charts.
 *
 * For each category, the last data point (where is_partial=true) is moved
 * to a "{category}_partial" key. The second-to-last point gets duplicated
 * into the partial series so the line/area connects seamlessly.
 *
 * Example:
 *   splitPartialData([{date:"03-07", runs:100}, {date:"03-08", runs:50, is_partial:true}], ["runs"])
 *   => [
 *     {date:"03-07", runs:100, runs_partial:100},
 *     {date:"03-08", runs:null, runs_partial:50, is_partial:true},
 *   ]
 *
 * Returns { data, categories, colors } ready to spread into a Tremor chart.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function splitPartialData(
  data: any[],
  categories: string[],
  colors: string[],
  partialColors: string[],
): {
  data: any[];
  categories: string[];
  colors: string[];
} {
  if (data.length === 0) {
    return { data: [], categories, colors };
  }

  const lastIdx = data.length - 1;
  const hasPartial = data[lastIdx]?.is_partial === true;

  if (!hasPartial) {
    return { data, categories, colors };
  }

  const transformed = data.map((row: Record<string, unknown>, idx: number) => {
    const out: Record<string, unknown> = { ...row };

    for (const cat of categories) {
      if (idx === lastIdx) {
        // Last point: move value to partial series, null out complete
        out[`${cat}_partial`] = row[cat];
        out[cat] = null;
      } else if (idx === lastIdx - 1) {
        // Second-to-last: duplicate value into partial series for line continuity
        out[`${cat}_partial`] = row[cat];
      } else {
        out[`${cat}_partial`] = null;
      }
    }

    return out;
  });

  return {
    data: transformed,
    categories: [
      ...categories,
      ...categories.map((c) => `${c}_partial`),
    ],
    colors: [...colors, ...partialColors],
  };
}
