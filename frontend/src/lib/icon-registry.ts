import type { ComponentType, SVGProps } from "react";
import {
  Squares2X2Icon,
  ChartBarIcon,
  UsersIcon,
  CurrencyDollarIcon,
  BoltIcon,
  HomeIcon,
  CpuChipIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  ServerStackIcon,
  CodeBracketIcon,
  ClockIcon,
  BeakerIcon,
  ChartPieIcon,
  PresentationChartLineIcon,
  RocketLaunchIcon,
  SparklesIcon,
  SignalIcon,
  CommandLineIcon,
  CubeIcon,
  DocumentChartBarIcon,
  FolderIcon,
  StarIcon,
} from "@heroicons/react/24/outline";

export type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface IconEntry {
  key: string;
  label: string;
  component: HeroIcon;
}

/**
 * Maps backend icon key strings to Heroicon components.
 *
 * Keys follow kebab-case matching the Heroicon component name without
 * the "Icon" suffix (e.g. "chart-bar" → ChartBarIcon).
 */
const ICON_MAP: Record<string, HeroIcon> = {
  "squares-2x2": Squares2X2Icon,
  "chart-bar": ChartBarIcon,
  users: UsersIcon,
  "currency-dollar": CurrencyDollarIcon,
  bolt: BoltIcon,
  home: HomeIcon,
  "cpu-chip": CpuChipIcon,
  "globe-alt": GlobeAltIcon,
  "shield-check": ShieldCheckIcon,
  "wrench-screwdriver": WrenchScrewdriverIcon,
  "server-stack": ServerStackIcon,
  "code-bracket": CodeBracketIcon,
  clock: ClockIcon,
  beaker: BeakerIcon,
  "chart-pie": ChartPieIcon,
  "presentation-chart-line": PresentationChartLineIcon,
  "rocket-launch": RocketLaunchIcon,
  sparkles: SparklesIcon,
  signal: SignalIcon,
  "command-line": CommandLineIcon,
  cube: CubeIcon,
  "document-chart-bar": DocumentChartBarIcon,
  folder: FolderIcon,
  star: StarIcon,
};

/** Resolve an icon key to a Heroicon component. Falls back to Squares2X2Icon. */
export function getIcon(key: string): HeroIcon {
  return ICON_MAP[key] ?? Squares2X2Icon;
}

/** All available icons for the page creation gallery. */
export const PAGE_ICON_OPTIONS: IconEntry[] = Object.entries(ICON_MAP).map(
  ([key, component]) => ({
    key,
    label: key
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    component,
  }),
);
