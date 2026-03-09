import { describe, it, expect } from "vitest";
import {
  AGENT_TYPE_LABELS,
  AGENT_TYPE_COLORS,
} from "@/lib/constants";

describe("AGENT_TYPE_COLORS", () => {
  const KNOWN_AGENT_TYPES = ["coding", "review", "testing", "ci", "debugging", "general"];

  it("should have an entry for every known agent type", () => {
    for (const type of KNOWN_AGENT_TYPES) {
      expect(AGENT_TYPE_COLORS[type]).toBeDefined();
    }
  });

  it("should map to distinct hex color values", () => {
    const colors = KNOWN_AGENT_TYPES.map((t) => AGENT_TYPE_COLORS[t]);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });

  it("should never map to undefined or empty string", () => {
    for (const type of KNOWN_AGENT_TYPES) {
      const color = AGENT_TYPE_COLORS[type];
      expect(color).toBeTruthy();
      expect(color!.length).toBeGreaterThan(0);
    }
  });

  it("should cover the same types as AGENT_TYPE_LABELS", () => {
    const labelKeys = Object.keys(AGENT_TYPE_LABELS).sort();
    const colorKeys = Object.keys(AGENT_TYPE_COLORS).sort();
    expect(colorKeys).toEqual(labelKeys);
  });
});
