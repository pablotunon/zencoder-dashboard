/**
 * Small annotation shown below charts when the data includes a partial day.
 */
export function PartialDayNote({
  data,
}: {
  data: Array<{ is_partial?: boolean }>;
}) {
  const hasPartial = data.some((d) => d.is_partial);
  if (!hasPartial) return null;

  return (
    <p className="mt-2 text-xs text-amber-600">
      * Today's data is incomplete (partial day)
    </p>
  );
}
