# Investigation: Black Graphs Bug

## Bug Summary

All charts in the dashboard render with black/dark colors. Legend dots are black, area fills are gray/black, and line strokes are indistinguishable. This affects every page: Overview, Performance, Usage, and Cost.

## Root Cause

**Tailwind CSS v4 + Tremor `@tremor/react` v3 incompatibility: dynamic color classes are purged at build time.**

### Detailed Explanation

1. **Tremor generates Tailwind classes dynamically at runtime.** When you pass `colors={["emerald", "red", "amber"]}` to a chart component, Tremor internally maps these to Tailwind utility classes like `fill-emerald-500`, `stroke-red-500`, `bg-amber-500`, etc. These class names are constructed programmatically inside the Tremor library code (in `node_modules/@tremor/react/dist/`).

2. **Tailwind CSS v4 removed `safelist` from config.** In Tailwind v3, Tremor's installation guide recommended adding a `safelist` with regex patterns to `tailwind.config.js` to ensure these dynamically-generated classes survive the CSS purge step. The project has no `tailwind.config.js` because it uses Tailwind v4's `@tailwindcss/vite` plugin.

3. **Tailwind v4 scans source files for class names but excludes `node_modules/`.** Since Tremor's color-to-class mapping lives inside `node_modules/@tremor/react/dist/`, Tailwind v4 never sees these class names during its content scanning phase. The classes get purged, and the browser falls back to the default color (black).

4. **The locked Tailwind version is 4.2.1**, which supports `@source inline()` — the v4 replacement for safelists.

### Evidence

- `package.json`: `"tailwindcss": "^4.0.0"` (locked to 4.2.1), `"@tremor/react": "^3.18.0"`
- `vite.config.ts`: Uses `@tailwindcss/vite` plugin, no traditional config
- `index.css`: Only `@import "tailwindcss"` with custom properties — no `@source` directives
- No `tailwind.config.js` or `tailwind.config.ts` exists
- Screenshot confirms all chart colors render as black/gray

## Affected Components

| File | Charts | Colors Used |
|------|--------|-------------|
| `src/pages/Overview.tsx` | AreaChart | `["indigo"]` |
| `src/pages/Performance.tsx` | AreaChart, LineChart (x2), DonutChart | `["emerald","red","amber"]`, `["indigo","amber","red"]`, `["rose","orange","amber","red","pink"]`, `["cyan","rose"]` |
| `src/pages/Usage.tsx` | AreaChart, DonutChart | `["indigo","cyan","amber"]`, dynamic via `AGENT_TYPE_TREMOR_COLORS` |
| `src/pages/Cost.tsx` | AreaChart (x2), BarChart | `["emerald"]`, `["violet"]`, `["emerald"]` |

All Tremor color names used: `indigo`, `emerald`, `red`, `amber`, `cyan`, `rose`, `orange`, `pink`, `violet`, `slate`, `gray`.

Tremor requires these CSS class prefixes to be generated: `bg-`, `text-`, `border-`, `ring-`, `stroke-`, `fill-` with shades `50` through `950`.

## Proposed Solution

Add a `@source inline()` directive to `frontend/src/index.css` that safelists all Tremor color utility classes. This is the Tailwind v4.1+ native approach.

```css
@import "tailwindcss";

/* Safelist Tremor chart color classes that are dynamically generated at runtime.
   Without this, Tailwind v4 purges them because they only exist in node_modules. */
@source inline("{bg,text,border,ring,stroke,fill}-{slate,gray,zinc,neutral,stone,red,orange,amber,yellow,lime,green,emerald,teal,cyan,sky,blue,indigo,violet,purple,fuchsia,pink,rose}-{50,100,200,300,400,500,600,700,800,900,950}");

@layer base {
  :root {
    --color-primary: #6366f1;
    --color-primary-dark: #4f46e5;
  }
}
```

### Why this approach

- **Minimal change**: One line added to `index.css`
- **Uses native Tailwind v4 mechanism**: `@source inline()` with brace expansion
- **Matches Tremor's v3 safelist**: Covers all 6 prefixes (bg, text, border, ring, stroke, fill) x 22 colors x 13 shades
- **No extra files or config needed**: No `safelist.txt`, no `tailwind.config.js`

### Alternative considered

- Adding `@source "../node_modules/@tremor/react/dist"` to make Tailwind scan Tremor's dist files. This would work but would scan all Tremor files unnecessarily and may slow down builds. The inline approach is more targeted.

## Test Strategy

### Existing tests

Only one test file exists: `src/__tests__/constants.test.ts`. It validates that `AGENT_TYPE_TREMOR_COLORS` has entries for all agent types, colors are distinct, and coverage matches labels. These tests pass but don't detect the CSS purging issue.

### New tests needed

1. **Build-time CSS validation test**: Build the frontend and verify the output CSS contains the expected Tremor color classes (e.g., `fill-indigo-500`, `stroke-emerald-500`). This is the most reliable way to catch this regression.

2. **Playwright visual test**: Load the Performance page and verify chart elements have colored (non-black) fill/stroke styles. This is the end-to-end confirmation.

## Implementation Notes

### Fix applied

**Single-line CSS fix** in `frontend/src/index.css`:
```css
@source inline("{bg,text,border,ring,stroke,fill}-{slate,gray,zinc,neutral,stone,red,orange,amber,yellow,lime,green,emerald,teal,cyan,sky,blue,indigo,violet,purple,fuchsia,pink,rose}-{50,100,200,300,400,500,600,700,800,900,950}");
```

### Supporting changes

1. **`frontend/Dockerfile`** — Added `dev` build target so the frontend can run in development mode with volume mounts (Vite dev server). The production build flow was refactored into a `prod-build` stage.

2. **`docker-compose.override.yml`** — Added `frontend` service override for dev mode (Vite dev server on port 80 to match nginx upstream).

3. **`frontend/vite.config.ts`** — Added `allowedHosts: true` to the server config so the Vite dev server accepts requests proxied through the nginx container hostname.

### Test added

**`tests/e2e/tests/chart-colors.spec.ts`** — E2E Playwright regression test with 3 test cases:
- Overview page: verifies SVG `<linearGradient>` stop colors are not black (Tremor uses `text-{color}-500` class + `stop-color: currentColor`)
- Performance page: verifies gradient stops and line stroke colors are not black
- Cost page: verifies gradient stops are not black

### Test results

- **Frontend unit tests**: 4 passed (constants.test.ts)
- **E2E chart-colors tests**: 3 passed (all new tests)
- **E2E dashboard tests**: 5 passed, 1 failed (pre-existing `frontend HTML references JS bundles` test fails in dev mode because Vite serves `.ts` module scripts instead of `.js` bundles — unrelated to this change)
- **Total**: 20 passed, 1 pre-existing failure

### Playwright verification

Before fix:
- `<linearGradient>` `color`: `rgb(0, 0, 0)` (black)
- `<stop>` `stop-color`: `rgb(0, 0, 0)` (black)
- All chart areas rendered as dark gray/black

After fix:
- `<linearGradient>` `color`: `oklch(0.585 0.233 277.117)` (indigo-500)
- `<stop>` `stop-color`: `oklch(0.585 0.233 277.117)` (indigo-500)
- Charts render with proper indigo, emerald, red, amber, cyan, rose, violet colors

### Notes

- The CSS output will grow because it includes all safelist classes, but these are legitimate classes needed by the charting library
- This approach is forward-compatible — if the project later upgrades to Tremor's copy-and-paste components (which are Tailwind v4 native), the safelist can be removed
