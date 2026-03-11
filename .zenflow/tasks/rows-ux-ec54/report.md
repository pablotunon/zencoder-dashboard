# Implementation Report: Rows UX

## What was implemented

The row creation UX for custom pages was redesigned from a pre-selected column count to a dynamic column management approach:

### 1. Simplified row creation
- **Before**: Users picked from 4 buttons ("1 column", "2 columns", "3 columns", "4 columns") to create a row.
- **After**: A single "Add row" button creates a row with 1 column. Users grow the row incrementally.

### 2. Dynamic column management (`useDashboard` hook)
- Added `addColumn(rowId, side)` — appends an empty column to the left or right of a row (max 4 columns).
- Added `removeColumn(rowId, slotIndex)` — removes an empty column at a given index (min 1 column, only empty slots can be removed).

### 3. Visual hints for adding columns
- Subtle "+" buttons appear on the left and right edges of each row on hover.
- Buttons only appear when the row has fewer than 4 columns.
- Uses Tailwind's `group-hover` with `opacity-0 → opacity-100` transition for a non-intrusive reveal.

### 4. Remove column button on empty slots
- Empty slot placeholders now show an "X" button in the top-right corner on hover.
- The button only appears when the row has more than 1 column (preventing removal of the last column).
- Occupied slots (with widgets) cannot be removed — users must remove the widget first.

## Files modified

| File | Change |
|------|--------|
| `frontend/src/hooks/useDashboard.ts` | Added `addColumn` and `removeColumn` callbacks |
| `frontend/src/components/widgets/AddRowPicker.tsx` | Simplified to single "Add row" button (always 1 column) |
| `frontend/src/components/widgets/RowLayout.tsx` | Added `AddColumnButton` side buttons, added remove-column button to `EmptySlot`, new props `onAddColumn`/`onRemoveColumn` |
| `frontend/src/pages/CustomPage.tsx` | Wired `addColumn` and `removeColumn` to `RowLayout` |

## How the solution was tested

- **Linter**: `docker compose exec frontend npm run lint` — 0 errors (3 pre-existing warnings unrelated to changes).
- **Unit tests**: `docker compose exec frontend npm run test` — 15/15 passed.
- **TypeScript check**: `npx tsc --noEmit` — 3 pre-existing errors in test file (unrelated `"total_runs"` type), no new errors introduced.

## Challenges encountered

- **No major challenges**. The existing architecture (hook-based state management, responsive grid layout, auto-save via debounced mutation) made this a clean incremental change.
- The `DashboardRow.columns` field uses a `1 | 2 | 3 | 4` union type, which required a cast when incrementing/decrementing but keeps the type safety intact.
