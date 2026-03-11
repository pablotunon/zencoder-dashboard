# Technical Specification: Rows UX Improvement

## Difficulty: Easy

Straightforward UI refactoring with no backend changes. All modifications are confined to 4 frontend files. The data model (`DashboardRow`) is unchanged — `columns` is still `1 | 2 | 3 | 4` and `widgets` is still `(WidgetConfig | null)[]`. The change is purely how users grow/shrink column counts after row creation.

## Technical Context

- **Language**: TypeScript (React)
- **Styling**: Tailwind CSS utility classes
- **Icons**: `@heroicons/react/24/outline`
- **State management**: `useDashboard` custom hook with `useState` + callbacks
- **Persistence**: Auto-save via React Query mutation (PUT `/api/pages/:slug`), 1s debounce
- **Data model**: `DashboardRow` stored as JSONB in PostgreSQL — no schema changes needed

## Problem

The current `AddRowPicker` forces users to pre-select a column count (1/2/3/4) before creating a row. This is unintuitive — users must decide layout before content. Empty column placeholders have no way to be removed individually.

## Implementation Approach

### Design Decision: Hover-revealed edge buttons (Approach A)

Matches the existing design language — the row delete button already uses `group-hover/row:block` to appear on hover. Add column buttons use the same pattern. Empty slot remove buttons use a nested `group-hover/slot:block` pattern.

### Changes by File

#### 1. `frontend/src/components/widgets/AddRowPicker.tsx`
**Before**: 4 buttons ("1 column", "2 columns", "3 columns", "4 columns") with `ROW_OPTIONS` array.
**After**: Single "Add row" button that always calls `onAddRow(1)`. The `ROW_OPTIONS` constant is removed.

The `onAddRow` prop type stays `(columns: 1 | 2 | 3 | 4) => void` for backwards compatibility, though only `1` is ever passed.

#### 2. `frontend/src/hooks/useDashboard.ts`
Two new functions added to the hook:

- **`addColumn(rowId, side: "left" | "right")`**: Inserts a `null` slot at the beginning or end of `row.widgets`, increments `row.columns`. No-op if `row.columns >= 4`.
- **`removeColumn(rowId, slotIndex)`**: Removes the slot at `slotIndex` from `row.widgets`, decrements `row.columns`. Guards: only removes if slot is `null` (empty) and `row.columns > 1`.

Both returned from the hook alongside existing functions.

#### 3. `frontend/src/components/widgets/RowLayout.tsx`
**New props**: `onAddColumn?: (rowId, side) => void` and `onRemoveColumn?: (rowId, slotIndex) => void`.

**Structural change**: The grid is wrapped in a `flex items-stretch gap-1` container. Left and right `AddColumnButton` components flank the grid, visible only on row hover (`opacity-0 group-hover/row:opacity-100`) and only when `row.columns < 4`.

**`AddColumnButton`** (new private component): A 24px-wide vertical strip on the row edge. Shows a `PlusIcon`. Invisible by default, fades in on row hover.

**`EmptySlot`** (modified): Changed from a single `<button>` to a `<div>` wrapper with `group/slot` class. Contains the existing "+" button for adding widgets, plus a new `XMarkIcon` remove button at top-right, visible on slot hover (`group-hover/slot:block`). The remove button is hidden when the row has only 1 column (`row.columns > 1` guard is applied by the parent).

#### 4. `frontend/src/pages/CustomPage.tsx`
Destructures `addColumn` and `removeColumn` from `useDashboard()`. Passes them as `onAddColumn` and `onRemoveColumn` props to `<RowLayout>`.

## Data Model / API Changes

**None.** The `DashboardRow` interface is unchanged:
```typescript
interface DashboardRow {
  id: string;
  columns: 1 | 2 | 3 | 4;
  widgets: (WidgetConfig | null)[];
}
```

The `columns` field is now mutable during the row's lifetime (was effectively immutable before), but the type and valid range are identical. The backend stores `layout` as opaque JSONB, so no migration or API change is needed.

## Edge Cases and Guards

| Scenario | Behavior |
|----------|----------|
| Row already at 4 columns | Add-column buttons hidden |
| Row has only 1 column | Remove-column button hidden on the sole empty slot |
| Slot contains a widget | Remove-column button not shown (only empty slots can be removed) |
| Add column left with widgets | Prepends `null`, shifting existing widget indices rightward |
| Template/read-only pages | `onAddColumn`/`onRemoveColumn` not passed, so buttons don't render |

## Verification

1. **Lint**: `docker compose exec frontend npm run lint`
2. **Unit tests**: `docker compose exec frontend npm run test`
3. **E2E tests**: `./scripts/test.sh e2e`
4. **Manual verification**:
   - Create a blank page, click "Add row" — should create 1-column row
   - Hover row edges — add-column buttons should appear on left and right
   - Click right add-column — row becomes 2 columns
   - Add widget to first slot, hover second (empty) slot — remove button should appear
   - Click remove on empty slot — row shrinks back to 1 column
   - Add 3 more columns to reach 4 — add-column buttons should disappear
   - Verify existing template pages render correctly (no add/remove buttons on read-only views)
