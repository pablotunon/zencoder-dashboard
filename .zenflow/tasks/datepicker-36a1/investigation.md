# Investigation: Datepicker UX and Console Errors

## Bug Summary

The datepicker component (`DateRangePicker.tsx`) has three categories of issues:

1. **Console errors when clicking on hours** in the time inputs
2. **AM/PM format** used in display when 24h format is requested
3. **Unclear from/to selection** in the calendar — users can't tell which date they're picking

---

## Root Cause Analysis

### 1. Console Errors on Time Input Interaction

**File:** `frontend/src/components/ui/DateRangePicker.tsx` lines 166-185

The `<input type="time">` element fires `onChange` events that can produce an empty string value when the user clicks on the hour segment of the time input (browser clears a segment during edit). The handlers `handleFromTimeChange` and `handleToTimeChange` pass this empty string to `applyTime()`:

```typescript
function applyTime(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);  // "" → [NaN]
  const result = new Date(date);
  result.setHours(h, m, 0, 0);  // setHours(NaN, undefined, 0, 0) → Invalid Date
  return result;
}
```

When `time` is `""` (empty string), `split(":").map(Number)` produces `[NaN]`, and `m` is `undefined`. `setHours(NaN, undefined, 0, 0)` creates an **Invalid Date**, which then propagates through the component. This causes:
- `toISOString()` to throw on invalid dates
- React warnings about controlled input values becoming `NaN`
- Downstream rendering errors

**Fix:** Guard `applyTime` and the time change handlers against empty/invalid time strings.

### 2. AM/PM Display Format

**File:** `frontend/src/components/ui/DateRangePicker.tsx` lines 29-48

The `formatDisplay()` function converts hours to 12-hour format with AM/PM:

```typescript
const period = hours >= 12 ? "PM" : "AM";
const h12 = hours % 12 || 12;
str += `, ${h12}:${mm} ${period}`;
```

**Fix:** Replace with 24-hour format:
```typescript
const hh = String(hours).padStart(2, "0");
str += `, ${hh}:${mm}`;
```

The `<input type="time">` elements already use 24h format natively (they store HH:MM), so no changes needed there. The only change is the display string in the trigger button.

### 3. Unclear From/To Calendar Selection (UX)

**Current behavior:** The `react-day-picker` in `mode="range"` lets users click two dates, but there's no visual indication of which click sets "from" and which sets "to". The time inputs are labeled "From" and "To" below the calendar, but the calendar itself gives no feedback about what stage of selection the user is in.

**The core UX problem:** Users click a date on the calendar and don't know if they just set the start or the end of the range. After the first click, `draftTo` becomes `undefined` (line 160), but nothing tells the user to "now pick an end date."

---

## Affected Components

| File | What changes |
|------|-------------|
| `frontend/src/components/ui/DateRangePicker.tsx` | All three fixes |
| `frontend/src/__tests__/date-range-picker.test.tsx` | New/updated tests |

---

## Proposed Solution

### Fix 1: Guard against invalid time strings

In `applyTime()` and the time change handlers, validate the time string before parsing:

```typescript
function applyTime(date: Date, time: string): Date {
  if (!time || !time.includes(":")) return date;
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return date;
  const result = new Date(date);
  result.setHours(h, m, 0, 0);
  return result;
}
```

Also guard the time change handlers to not update state with invalid time:

```typescript
const handleFromTimeChange = useCallback(
  (timeStr: string) => {
    setFromTime(timeStr);
    setActivePreset(-1);
    if (draftFrom && timeStr && timeStr.includes(":")) {
      setDraftFrom(applyTime(draftFrom, timeStr));
    }
  },
  [draftFrom],
);
```

Same pattern for `handleToTimeChange`.

### Fix 2: Remove AM/PM, use 24h format

Replace the `formatDisplay` function's time formatting:

```typescript
// Replace lines 41-44:
if (hours !== 0 || minutes !== 0) {
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  str += `, ${hh}:${mm}`;
}
```

### Fix 3: Add selection phase indicator for from/to clarity

Add a visual indicator showing the current selection phase. The approach:

1. **Track selection phase** — derive from draft state: if `draftFrom` exists but `draftTo` is undefined, user needs to pick the end date.

2. **Show a status banner** above or below the calendar indicating:
   - "Select start date" (when neither is selected, or user just reset)
   - "Select end date" (after first click, when `draftFrom` is set but `draftTo` is undefined)
   - "Mar 5 — Mar 12" (when both are selected, showing the range summary)

3. **Color-code the time input section** — highlight the "From" input area when picking the start date, highlight "To" when picking the end date. Use a subtle left-border accent or background tint.

Implementation detail:

```typescript
// Derive selection phase
const selectionPhase: "from" | "to" | "complete" =
  !draftFrom ? "from" :
  !draftTo ? "to" :
  "complete";
```

Then render a status line inside the calendar panel:

```tsx
<div className="px-3 pb-2 text-xs font-medium">
  {selectionPhase === "from" && (
    <span className="text-indigo-600">Select start date</span>
  )}
  {selectionPhase === "to" && (
    <span className="text-indigo-600">Select end date</span>
  )}
  {selectionPhase === "complete" && draftFrom && draftTo && (
    <span className="text-gray-500">
      {formatDisplay(draftFrom)} — {formatDisplay(draftTo)}
    </span>
  )}
</div>
```

And add visual emphasis to the active time input:

```tsx
<div className={`flex items-center gap-2 rounded-md px-2 py-1 ${
  selectionPhase === "from" ? "bg-indigo-50 ring-1 ring-indigo-200" : ""
}`}>
  <label ...>From</label>
  <input ... />
</div>
```

### Test Updates

1. **New test:** Verify no errors when time input receives empty string (simulating partial edit)
2. **New test:** Verify 24h format in trigger button display (no "AM"/"PM" text)
3. **New test:** Verify selection phase indicator appears ("Select start date" / "Select end date")
4. **Update existing test:** The custom range formatting test should expect 24h format

---

## Edge Cases & Side Effects

- **Browser locale:** `<input type="time">` may render with AM/PM controls in some browsers (e.g., Chrome on US locale). The `step="60"` attribute helps but doesn't force 24h. We cannot fully control this browser-native rendering, but the *display* in the trigger button will be 24h.
- **Empty time on popover open:** When the popover opens and syncs from `value`, times are always valid ISO strings, so `toTimeString()` always produces valid "HH:MM". The issue only arises during user interaction with the native time input.
- **Single day selection:** When user clicks the same date for from and to, the times determine validity. This already works correctly with the `draftFrom < draftTo` check — same day is valid if from-time < to-time.
- **Preset selection:** Presets bypass the calendar entirely and set both from/to immediately, so the phase indicator should show "complete" after preset click. This works naturally since presets set both `draftFrom` and `draftTo`.

---

## Implementation Notes

All three fixes were implemented in `frontend/src/components/ui/DateRangePicker.tsx`:

### Fix 1: Invalid time string guard
- `applyTime()` now returns the original date unchanged if the time string is empty, missing `:`, or contains `NaN` values after parsing.
- `handleFromTimeChange` and `handleToTimeChange` now check `timeStr && timeStr.includes(":")` before calling `applyTime`, preventing invalid dates from entering state.

### Fix 2: 24h time format
- `formatDisplay()` now uses `padStart(2, "0")` for hours instead of 12-hour conversion. Removed the `period` (AM/PM) variable entirely.
- Replaced native `<input type="time">` with a custom `TimeInput` component using `<input type="text" inputMode="numeric">`. The native time input renders AM/PM controls based on browser locale regardless of the stored value. The custom component:
  - Accepts only digits and colons during typing
  - Validates HH:MM format on blur (hours 0-23, minutes 0-59)
  - Reverts to the previous valid value if input is invalid
  - Shows a clock icon for visual consistency
  - Includes `normalizeTime()` helper for validation

### Fix 3: Selection phase indicator (revised)
- Initial version had a `selectionPhase` derived state (`"from"` | `"to"` | `"complete"`) but it was ineffective because react-day-picker's `mode="range"` always returns both `from` and `to` when clicking inside an existing range — `selectionPhase` was perpetually "complete".
- **Root cause**: react-day-picker adjusts the nearest boundary on click within range, never clearing `to`. The "Select start/end date" messages were never displayed during normal interaction.
- **Revised approach**: Added a `lastChanged` state (`"from"` | `"to"` | null) that tracks which boundary was actually modified. The `handleCalendarSelect` callback compares old vs new date values to detect changes.
- The indicator now shows actionable feedback: "Start changed → Feb 8" or "End changed → Mar 5" in indigo, with the full range summary in gray parentheses.
- The corresponding time input (From or To) gets highlighted (`bg-indigo-50 ring-1 ring-indigo-200`) based on `lastChanged`.
- `lastChanged` resets to `null` on popover open and preset selection.

### Granularity Investigation
- **Finding**: Granularity is NOT broken. The backend `resolve_granularity()` correctly returns `"minute"` for ≤6h spans regardless of whether the range is "Last 1 hour" or a custom past window.
- **Evidence**: "Last 1 hour" returns 61 data points with `granularity: "minute"`. Custom 1-hour past window (Mar 3, 14:00-15:00) returns 16 data points with `granularity: "minute"`.
- **Root cause of perceived issue**: The simulated data is sparser for past periods. "Last 1 hour" has ~61 data points (one per minute) because the simulator generates events in real time. A random past hour may only have 16 data points because the simulator doesn't backfill every minute uniformly.

### Test Results
- 3 new tests added to `frontend/src/__tests__/date-range-picker.test.tsx`:
  1. "does not throw when time input receives an empty string" — verifies no errors on empty time input
  2. "displays time in 24h format without AM/PM in trigger button" — verifies no AM/PM in display
  3. "shows selection phase indicator when popover is open" — verifies the phase indicator renders
- All 26 tests pass (15 in date-range-picker, 7 in api-auth, 4 in widget-filters)
- 0 lint errors introduced

### Playwright Browser Verification
- Confirmed time inputs display 24h format visually (no AM/PM controls)
- Confirmed invalid input ("99:99") reverts to previous valid value on blur
- Confirmed valid input ("14:30") is accepted and updates the range display
- Confirmed no console errors triggered by any datepicker interaction (only pre-existing Vite HMR WebSocket errors)
- Confirmed "End changed → Feb 20" shows when clicking inside range (moves end boundary)
- Confirmed "Start changed → Feb 8" shows when clicking before range start (moves start boundary)
- Confirmed "From" time input highlights on start change, "To" highlights on end change
- Confirmed preset selection clears indicator and shows neutral range summary
- Confirmed granularity = "minute" for both "Last 1 hour" preset and custom 1-hour past window
