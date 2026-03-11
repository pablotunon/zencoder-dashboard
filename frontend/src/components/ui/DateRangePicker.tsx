import { useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from "react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import "react-day-picker/style.css";
import { CalendarIcon, ClockIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { DATE_RANGE_PRESETS } from "@/lib/constants";
import type { DateRange } from "@/types/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse an ISO string into a local Date. */
function parseISO(iso: string): Date {
  return new Date(iso);
}

/** Format a Date to "HH:MM" for time input value. */
function toTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Apply HH:MM time string to a Date, returning a new Date. Returns original date if time is invalid. */
function applyTime(date: Date, time: string): Date {
  if (!time || !time.includes(":")) return date;
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return date;
  const result = new Date(date);
  result.setHours(h, m, 0, 0);
  return result;
}

/** Format a Date for the trigger button display. */
function formatDisplay(d: Date): string {
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();

  let str = sameYear ? `${month} ${day}` : `${month} ${day}, ${d.getFullYear()}`;

  // Only show time if it's not exactly midnight
  if (hours !== 0 || minutes !== 0) {
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    str += `, ${hh}:${mm}`;
  }

  return str;
}

/** Find the matching preset index for a given DateRange, or -1 for custom. */
function findPresetIndex(range: DateRange): number {
  // Presets compute ranges relative to "now", so we check if the range
  // roughly matches a preset (within 2 minutes tolerance for the end,
  // and matching start offset).
  const end = parseISO(range.end);
  const start = parseISO(range.start);
  const durationMs = end.getTime() - start.getTime();

  const toleranceMs = 2 * 60 * 1000; // 2 minutes

  for (let i = 0; i < DATE_RANGE_PRESETS.length; i++) {
    const preset = DATE_RANGE_PRESETS[i];
    const pRange = preset.getRange();
    const pEnd = parseISO(pRange.end);
    const pStart = parseISO(pRange.start);
    const pDurationMs = pEnd.getTime() - pStart.getTime();

    if (Math.abs(durationMs - pDurationMs) < toleranceMs && Math.abs(end.getTime() - pEnd.getTime()) < toleranceMs) {
      return i;
    }
  }

  return -1;
}

/** Validate and normalize an HH:MM string. Returns the valid time or the fallback. */
function normalizeTime(raw: string, fallback: string): string {
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Return first of previous month (for default calendar view). */
function previousMonth(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 1, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Generate array of dates between two dates (inclusive, date-only comparison). */
function datesInRange(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Controlled 24h time input (HH:MM text field). */
function TimeInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Keep draft in sync when value changes externally (e.g. preset click)
  useEffect(() => { setDraft(value); }, [value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Allow typing freely — only digits and colon
    const v = e.target.value.replace(/[^\d:]/g, "");
    setDraft(v);
  };

  const handleBlur = () => {
    const normalized = normalizeTime(draft, value);
    setDraft(normalized);
    if (normalized !== value) {
      onChange(normalized);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const normalized = normalizeTime(draft, value);
      setDraft(normalized);
      if (normalized !== value) {
        onChange(normalized);
      }
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1">
      <label htmlFor={id} className="text-xs font-medium text-gray-500">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          maxLength={5}
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-[4.5rem] rounded-md border border-gray-300 py-1 pl-2 pr-7 text-sm tabular-nums text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <ClockIcon className="pointer-events-none absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Draft state (only committed on "Apply")
  const [draftFrom, setDraftFrom] = useState<Date | undefined>();
  const [draftTo, setDraftTo] = useState<Date | undefined>();
  const [fromTime, setFromTime] = useState("00:00");
  const [toTime, setToTime] = useState("23:59");
  const [activePreset, setActivePreset] = useState(-1);

  // Controlled month for the calendar (show previous + current by default)
  const [calendarMonth, setCalendarMonth] = useState(previousMonth);

  // Hover state for range preview when picking the end date
  const [hoveredDay, setHoveredDay] = useState<Date | undefined>();

  // Sync draft from value when popover opens
  useEffect(() => {
    if (open) {
      const start = parseISO(value.start);
      const end = parseISO(value.end);
      setDraftFrom(start);
      setDraftTo(end);
      setFromTime(toTimeString(start));
      setToTime(toTimeString(end));
      setActivePreset(findPresetIndex(value));
      setCalendarMonth(previousMonth());
      setHoveredDay(undefined);
    }
  }, [open, value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handlePreset = useCallback((index: number) => {
    const range = DATE_RANGE_PRESETS[index].getRange();
    const start = parseISO(range.start);
    const end = parseISO(range.end);
    setDraftFrom(start);
    setDraftTo(end);
    setFromTime(toTimeString(start));
    setToTime(toTimeString(end));
    setActivePreset(index);
    setHoveredDay(undefined);
  }, []);

  // Derive selection phase
  const selectionPhase: "from" | "to" | "complete" =
    !draftFrom ? "from" : !draftTo ? "to" : "complete";

  // Two-click selection: click 1 = set start & clear end, click 2 = set end
  const handleDayClick = useCallback(
    (day: Date) => {
      setActivePreset(-1);

      if (selectionPhase === "complete" || selectionPhase === "from") {
        // First click: set start, clear end (keep times)
        setDraftFrom(applyTime(day, fromTime));
        setDraftTo(undefined);
        setHoveredDay(undefined);
      } else {
        // Second click (selectionPhase === "to"): set end
        let from = draftFrom!;
        let to = applyTime(day, toTime);

        // If user clicked before the start, swap
        if (to < from) {
          const tmpDate = from;
          from = applyTime(day, fromTime);
          to = applyTime(tmpDate, toTime);
          setDraftFrom(from);
          setFromTime(toTimeString(from));
          setToTime(toTimeString(to));
        }

        setDraftTo(to);
        setHoveredDay(undefined);
      }
    },
    [selectionPhase, draftFrom, fromTime, toTime],
  );

  const handleDayMouseEnter = useCallback(
    (day: Date) => {
      if (selectionPhase === "to") {
        setHoveredDay(day);
      }
    },
    [selectionPhase],
  );

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

  const handleToTimeChange = useCallback(
    (timeStr: string) => {
      setToTime(timeStr);
      setActivePreset(-1);
      if (draftTo && timeStr && timeStr.includes(":")) {
        setDraftTo(applyTime(draftTo, timeStr));
      }
    },
    [draftTo],
  );

  /** Short date label for the phase indicator. */
  const shortDate = (d: Date | undefined) => {
    if (!d) return "";
    return d.toLocaleString("en-US", { month: "short", day: "numeric" });
  };

  const canApply = draftFrom && draftTo && draftFrom < draftTo;

  const handleApply = useCallback(() => {
    if (!canApply) return;
    onChange({
      start: draftFrom!.toISOString(),
      end: draftTo!.toISOString(),
    });
    setOpen(false);
  }, [canApply, draftFrom, draftTo, onChange]);

  // Display text for the trigger button
  const displayText = useMemo(() => {
    const presetIdx = findPresetIndex(value);
    if (presetIdx >= 0) {
      return DATE_RANGE_PRESETS[presetIdx].label;
    }
    const start = parseISO(value.start);
    const end = parseISO(value.end);
    return `${formatDisplay(start)} - ${formatDisplay(end)}`;
  }, [value]);

  // Build modifiers for visual range highlighting
  const modifiers = useMemo(() => {
    const mods: Record<string, Date | Date[] | { from: Date; to: Date }> = {};

    if (draftFrom) {
      mods.range_start = draftFrom;
    }

    if (draftFrom && draftTo) {
      // Complete range
      mods.range_middle = datesInRange(draftFrom, draftTo);
      mods.range_end = draftTo;
    } else if (draftFrom && !draftTo && hoveredDay) {
      // Hover preview range
      const previewStart = hoveredDay < draftFrom ? hoveredDay : draftFrom;
      const previewEnd = hoveredDay < draftFrom ? draftFrom : hoveredDay;
      mods.range_start = previewStart;
      mods.range_middle = datesInRange(previewStart, previewEnd);
      mods.range_end = previewEnd;
    }

    return mods;
  }, [draftFrom, draftTo, hoveredDay]);

  const defaultClassNames = getDefaultClassNames();

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <CalendarIcon className="h-4 w-4 text-gray-400" />
        <span>{displayText}</span>
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full z-50 mt-2 flex rounded-xl border border-gray-200 bg-white shadow-xl"
        >
          {/* Left panel: Presets */}
          <div className="flex flex-col border-r border-gray-200 py-2">
            <span className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Presets
            </span>
            {DATE_RANGE_PRESETS.map((preset, i) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(i)}
                className={`px-4 py-1.5 text-left text-sm whitespace-nowrap transition-colors ${
                  activePreset === i
                    ? "bg-indigo-50 font-medium text-indigo-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Right panel: Calendar + time + actions */}
          <div className="flex flex-col">
            {/* Calendar */}
            <div className="p-3">
              <DayPicker
                mode="single"
                numberOfMonths={2}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selected={draftFrom && draftTo ? undefined : draftFrom}
                onDayClick={handleDayClick}
                onDayMouseEnter={handleDayMouseEnter}
                onDayMouseLeave={() => setHoveredDay(undefined)}
                disabled={{ after: new Date() }}
                modifiers={modifiers}
                modifiersClassNames={{
                  range_start: "!bg-indigo-600 !text-white !rounded-l-full !rounded-r-none",
                  range_middle: "!bg-indigo-50 !text-indigo-900 !rounded-none",
                  range_end: "!bg-indigo-600 !text-white !rounded-r-full !rounded-l-none",
                }}
                classNames={{
                  root: `${defaultClassNames.root} text-sm`,
                  today: "font-bold text-indigo-600",
                  selected: "bg-indigo-600 text-white rounded-full",
                  chevron: `${defaultClassNames.chevron} fill-indigo-500`,
                }}
              />
            </div>

            {/* Selection phase indicator */}
            <div className="border-t border-gray-200 px-4 py-2 text-xs font-medium" data-testid="selection-phase">
              {selectionPhase === "from" && (
                <span className="text-indigo-600">&#9654; Select start date</span>
              )}
              {selectionPhase === "to" && (
                <span className="text-indigo-600">
                  &#9654; Start: {shortDate(draftFrom)} &mdash; select end date
                </span>
              )}
              {selectionPhase === "complete" && draftFrom && draftTo && (
                <span className="text-gray-500">
                  {formatDisplay(draftFrom)} &mdash; {formatDisplay(draftTo)}
                </span>
              )}
            </div>

            {/* Time inputs */}
            <div className="flex items-center gap-4 border-t border-gray-200 px-4 py-3">
              <TimeInput
                id="drp-from-time"
                label="From"
                value={fromTime}
                onChange={handleFromTimeChange}
              />
              <span className="text-gray-300">&mdash;</span>
              <TimeInput
                id="drp-to-time"
                label="To"
                value={toTime}
                onChange={handleToTimeChange}
              />
            </div>

            {/* Footer: validation + actions */}
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
              <div className="text-xs text-gray-500">
                {draftFrom && draftTo && draftFrom >= draftTo && (
                  <span className="text-red-500">
                    Start must be before end
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!canApply}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
