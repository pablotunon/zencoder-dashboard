import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { DATE_RANGE_PRESETS } from "@/lib/constants";

function makeRange(startOffset: number, endOffset: number = 0): {
  start: string;
  end: string;
} {
  const now = Date.now();
  return {
    start: new Date(now - startOffset).toISOString(),
    end: new Date(now - endOffset).toISOString(),
  };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

describe("DateRangePicker", () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  it("renders trigger button with preset label when matching a preset", () => {
    const range = DATE_RANGE_PRESETS[3].getRange(); // "Last 30 days"
    render(<DateRangePicker value={range} onChange={onChange} />);

    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("renders trigger button with formatted dates for custom ranges", () => {
    const value = {
      start: "2026-03-01T14:30:00.000Z",
      end: "2026-03-08T18:45:00.000Z",
    };
    render(<DateRangePicker value={value} onChange={onChange} />);

    // Should show formatted dates, not a preset label
    const button = screen.getByRole("button");
    expect(button.textContent).not.toContain("Last");
  });

  it("opens popover when trigger button is clicked", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    // Popover should not be visible initially
    expect(screen.queryByText("Presets")).not.toBeInTheDocument();

    // Click trigger
    fireEvent.click(screen.getByRole("button"));

    // Popover should now be visible
    expect(screen.getByText("Presets")).toBeInTheDocument();
  });

  it("shows all preset buttons in the popover", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));

    for (const preset of DATE_RANGE_PRESETS) {
      // Preset labels appear both in trigger (possibly) and in the panel
      expect(
        screen.getAllByText(preset.label).length,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("shows time inputs in the popover", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });

  it("shows Apply and Cancel buttons in the popover", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));

    expect(
      screen.getByRole("button", { name: "Apply" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
  });

  it("closes popover when Cancel is clicked", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Presets")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Presets")).not.toBeInTheDocument();
  });

  it("calls onChange with preset range when preset is selected and Apply clicked", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));

    // Click "Last 7 days" preset
    const preset7d = screen.getAllByText("Last 7 days");
    // The preset button is inside the popover panel
    fireEvent.click(preset7d[preset7d.length - 1]);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0];
    expect(result).toHaveProperty("start");
    expect(result).toHaveProperty("end");

    // Verify the range is approximately 7 days
    const startMs = new Date(result.start).getTime();
    const endMs = new Date(result.end).getTime();
    const durationDays = (endMs - startMs) / (24 * 60 * 60 * 1000);
    expect(durationDays).toBeCloseTo(7, 0);
  });

  it("does not call onChange when popover is cancelled", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));

    // Select a different preset
    const preset1h = screen.getAllByText("Last 1 hour");
    fireEvent.click(preset1h[preset1h.length - 1]);

    // Cancel instead of Apply
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("highlights the active preset", () => {
    const range = DATE_RANGE_PRESETS[2].getRange(); // "Last 7 days"
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));

    // The "Last 7 days" button in the presets panel should have the active styling
    const presetButtons = DATE_RANGE_PRESETS.map((p) => {
      const matches = screen.getAllByText(p.label);
      // Get the button inside the popover (last match if trigger also shows it)
      return matches[matches.length - 1];
    });

    // "Last 7 days" (index 2) should have active class
    expect(presetButtons[2].className).toContain("indigo");
  });

  it("updates time inputs when preset is clicked", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));

    // Click "Last 1 hour"
    const preset1h = screen.getAllByText("Last 1 hour");
    fireEvent.click(preset1h[preset1h.length - 1]);

    // The time inputs should reflect the preset's times (not midnight)
    const fromInput = screen.getByLabelText("From") as HTMLInputElement;
    const toInput = screen.getByLabelText("To") as HTMLInputElement;

    // Both should have non-empty values
    expect(fromInput.value).toBeTruthy();
    expect(toInput.value).toBeTruthy();
  });

  it("closes popover on Escape key", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Presets")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Presets")).not.toBeInTheDocument();
  });

  it("does not throw when time input receives an empty string", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));

    const fromInput = screen.getByLabelText("From") as HTMLInputElement;
    const toInput = screen.getByLabelText("To") as HTMLInputElement;

    // Simulating browser behavior: clicking on hour segment can send empty value
    expect(() => {
      fireEvent.change(fromInput, { target: { value: "" } });
      fireEvent.change(toInput, { target: { value: "" } });
    }).not.toThrow();
  });

  it("displays time in 24h format without AM/PM in trigger button", () => {
    // 14:30 UTC — local time depends on timezone, but should never show AM/PM
    const value = {
      start: "2026-03-01T14:30:00.000Z",
      end: "2026-03-08T18:45:00.000Z",
    };
    render(<DateRangePicker value={value} onChange={onChange} />);

    const button = screen.getByRole("button");
    expect(button.textContent).not.toContain("AM");
    expect(button.textContent).not.toContain("PM");
  });

  it("shows selection phase indicator when popover is open", () => {
    const range = makeRange(THIRTY_DAYS_MS);
    render(<DateRangePicker value={range} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));

    // With a preset loaded, both from and to are set → "complete" phase shows range summary
    const phaseEl = screen.getByTestId("selection-phase");
    expect(phaseEl).toBeInTheDocument();
    // It should have text content (either the phase label or the range summary)
    expect(phaseEl.textContent!.length).toBeGreaterThan(0);
  });
});
