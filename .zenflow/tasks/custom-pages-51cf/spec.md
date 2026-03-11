# Custom Pages — Technical Specification

**Difficulty**: Hard
**Scope**: Full-stack feature (Postgres schema, Python API, React frontend)

## Summary

Replace the hardcoded dashboard pages (Overview, Usage, Cost, Performance) and the empty customizable Dashboard with a **user-owned pages system**. Each user gets a set of custom pages stored in PostgreSQL. Pages are seeded from templates at first login. Users can create new pages (blank or from templates), rename/reorder/delete them, and customize widget layouts — all persisted server-side.

---

## 1. Database

### Schema change: `init-scripts/postgres/002-user-pages.sql`

The existing file needs a `slug` column added and a unique constraint:

```sql
CREATE TABLE user_pages (
    page_id     VARCHAR(64) PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    org_id      VARCHAR(64) NOT NULL REFERENCES organizations(org_id),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(128) NOT NULL,
    icon        VARCHAR(64) NOT NULL DEFAULT 'squares-2x2',
    layout      JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, slug)
);

CREATE INDEX idx_user_pages_user ON user_pages(user_id, sort_order);
CREATE INDEX idx_user_pages_org  ON user_pages(org_id, user_id);
```

- `layout` stores the full `DashboardRow[]` JSON (same structure already used in the frontend)
- `slug` is derived from `name` (e.g. "Cost & Efficiency" → `cost-efficiency`), unique per user
- `org_id` denormalized for future sharing queries
- `ON DELETE CASCADE` on `user_id` for cleanup

### Why JSONB for layout

The `DashboardRow[]` / `WidgetConfig` structure is inherently schemaless (variable metrics, optional fields, nested arrays). JSONB gives:
- Atomic save/load of the full layout (single write)
- No complex joins for page rendering
- Full compatibility with the existing frontend types
- PostgreSQL JSONB indexing available if needed later

---

## 2. Backend (analytics-api)

### 2.1 Templates module: `analytics-api/app/services/page_templates.py`

A Python module defining the 4 default page templates. Each template is a dict with `name`, `slug`, `icon`, and `layout` (the `DashboardRow[]` JSON). The layouts are extracted from the current frontend page files:

| Template | Icon | Source |
|----------|------|--------|
| Overview | `chart-bar` | `Overview.tsx` → `makeOverviewRows()` |
| Usage & Adoption | `users` | `Usage.tsx` → `makeUsageRows()` |
| Cost & Efficiency | `currency-dollar` | `Cost.tsx` → `makeCostRows()` |
| Performance | `bolt` | `Performance.tsx` → `makePerformanceRows()` |

Template layouts use `timeRange: { useGlobal: true }` (not hardcoded periods) since the page has its own period selector.

### 2.2 Pages service: `analytics-api/app/services/page_service.py`

Database access functions using `asyncpg`:

- `get_user_pages(user_id) -> list[dict]` — all pages ordered by `sort_order`
- `get_page_by_slug(user_id, slug) -> dict | None` — single page lookup
- `create_page(user_id, org_id, name, icon, layout?) -> dict` — auto-generates `page_id` (uuid) and `slug` from name
- `update_page(user_id, slug, *, name?, icon?, layout?) -> dict` — partial update, recalculates slug if name changes
- `delete_page(user_id, slug) -> bool`
- `reorder_pages(user_id, page_ids: list[str]) -> None` — batch update `sort_order`
- `seed_default_pages(user_id, org_id) -> list[dict]` — create the 4 template pages if user has zero pages
- `get_page_count(user_id) -> int` — for seeding check

Slug generation: `re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')` with collision handling (append `-2`, `-3`, etc.)

### 2.3 Pages router: `analytics-api/app/routers/pages.py`

| Method | Path | Body/Params | Response |
|--------|------|-------------|----------|
| `GET` | `/api/pages` | — | `[{ page_id, name, slug, icon, sort_order }]` (no layout, for sidebar) |
| `GET` | `/api/pages/templates` | — | `[{ id, name, icon, description }]` |
| `POST` | `/api/pages` | `{ name, icon, template? }` | `{ page_id, name, slug, icon, layout, sort_order }` |
| `GET` | `/api/pages/:slug` | — | `{ page_id, name, slug, icon, layout }` |
| `PUT` | `/api/pages/:slug` | `{ name?, icon?, layout? }` | `{ page_id, name, slug, icon, layout }` |
| `PATCH` | `/api/pages/reorder` | `{ page_ids: string[] }` | `204` |
| `DELETE` | `/api/pages/:slug` | — | `204` |

All endpoints require auth (via `get_org_context` dependency). User is extracted from JWT.

### 2.4 Auto-seeding on login

In `analytics-api/app/routers/auth.py`, after successful login, check if the user has zero pages. If so, call `seed_default_pages()`. This runs once per user (existing users get seeded on their next login after the feature ships, new users get seeded on first login).

### 2.5 Pydantic models: `analytics-api/app/models/pages.py`

```python
class PageSummary(BaseModel):
    page_id: str
    name: str
    slug: str
    icon: str
    sort_order: int

class PageDetail(PageSummary):
    layout: list  # DashboardRow[] JSON

class PageCreateRequest(BaseModel):
    name: str  # 1-100 chars
    icon: str  # from allowed icon set
    template: str | None = None  # template ID

class PageUpdateRequest(BaseModel):
    name: str | None = None
    icon: str | None = None
    layout: list | None = None  # DashboardRow[] JSON

class PageReorderRequest(BaseModel):
    page_ids: list[str]

class TemplateSummary(BaseModel):
    id: str
    name: str
    icon: str
    description: str
```

### 2.6 Register router

In `analytics-api/app/main.py`, add `router` from `app.routers.pages`.

---

## 3. Frontend

### 3.1 New API hooks: `frontend/src/api/pages.ts`

React Query hooks wrapping the pages API:

- `usePages()` — `GET /api/pages` (sidebar list, stale time: 30s)
- `usePageDetail(slug)` — `GET /api/pages/:slug` (page layout, stale time: 30s)
- `usePageTemplates()` — `GET /api/pages/templates`
- `useCreatePage()` — mutation, invalidates pages list
- `useUpdatePage(slug)` — mutation, debounced for layout auto-save (1s)
- `useDeletePage(slug)` — mutation, invalidates pages list + navigates away
- `useReorderPages()` — mutation

### 3.2 Icon registry: `frontend/src/lib/icon-registry.ts`

Map of icon keys to Heroicon components:

```typescript
const PAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "squares-2x2": Squares2X2Icon,
  "chart-bar": ChartBarIcon,
  "users": UsersIcon,
  "currency-dollar": CurrencyDollarIcon,
  "bolt": BoltIcon,
  "globe": GlobeAltIcon,
  "cog": CogIcon,
  "document": DocumentTextIcon,
  "star": StarIcon,
  "heart": HeartIcon,
  "fire": FireIcon,
  "rocket": RocketLaunchIcon,
};
```

### 3.3 New page component: `frontend/src/pages/CustomPage.tsx`

Replaces both `Dashboard.tsx` and the pre-built pages. Structure:

1. Read `slug` from route params (`useParams`)
2. Fetch page data via `usePageDetail(slug)`
3. Initialize `useDashboard(initialRows)` with layout from API
4. Render page title (editable inline), period selector, `RowLayout`, `AddRowPicker`, `WidgetModal`
5. On any layout change, debounced auto-save via `useUpdatePage`

### 3.4 Refactor `useDashboard` hook: `frontend/src/hooks/useDashboard.ts`

Change signature to accept initial rows:

```typescript
function useDashboard(initialRows: DashboardRow[]) {
  const [rows, setRows] = useState<DashboardRow[]>(initialRows);
  // ... same add/remove/update logic
  // Add: onChange callback for auto-save
}
```

### 3.5 Page creation modal: `frontend/src/components/pages/PageCreateModal.tsx`

Modal with:
- Name text input
- Icon picker (grid of icons from `PAGE_ICONS`)
- Template selector (optional, shows template cards from `GET /api/pages/templates`)
- Create button → `POST /api/pages` → navigate to `/p/:slug`

### 3.6 Sidebar changes: `frontend/src/components/layout/Sidebar.tsx`

- Replace static `navItems` with data from `usePages()` hook
- Each page renders as a `NavLink` to `/p/:slug` with its icon from the registry
- After the page list: a "New Page" button (last item) → opens `PageCreateModal`
- Right-click or hover menu on pages for rename/delete (stretch — can start with just delete)

### 3.7 Routing changes: `frontend/src/App.tsx`

```
/login                → LoginPage
/p/:slug              → CustomPage (new)
/                     → redirect to first page slug (from usePages)
*                     → redirect to /
```

Remove: `/overview`, `/usage`, `/cost`, `/performance` routes and their page components.

### 3.8 Files to delete

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Overview.tsx`
- `frontend/src/pages/Usage.tsx`
- `frontend/src/pages/Cost.tsx`
- `frontend/src/pages/Performance.tsx`

### 3.9 Page settings (inline editing)

On the `CustomPage`, the page title is editable inline (click to edit). An icon next to the title opens a small dropdown to change the icon. Changes saved via `PUT /api/pages/:slug`.

---

## 4. Source Code Change Summary

### New files

| File | Purpose |
|------|---------|
| `analytics-api/app/routers/pages.py` | Pages API router |
| `analytics-api/app/models/pages.py` | Pydantic request/response models |
| `analytics-api/app/services/page_service.py` | DB access for user_pages |
| `analytics-api/app/services/page_templates.py` | Template definitions (layout JSON) |
| `frontend/src/pages/CustomPage.tsx` | Universal page component |
| `frontend/src/api/pages.ts` | React Query hooks for pages API |
| `frontend/src/lib/icon-registry.ts` | Icon key → component mapping |
| `frontend/src/components/pages/PageCreateModal.tsx` | New page creation form |

### Modified files

| File | Change |
|------|--------|
| `init-scripts/postgres/002-user-pages.sql` | Add `slug` column + unique constraint |
| `analytics-api/app/main.py` | Register pages router |
| `analytics-api/app/routers/auth.py` | Add page seeding on login |
| `frontend/src/App.tsx` | Replace routes with `/p/:slug` |
| `frontend/src/components/layout/Sidebar.tsx` | Dynamic nav from API |
| `frontend/src/hooks/useDashboard.ts` | Accept initial rows, add onChange |

### Deleted files

| File | Reason |
|------|--------|
| `frontend/src/pages/Dashboard.tsx` | Replaced by `CustomPage.tsx` |
| `frontend/src/pages/Overview.tsx` | Layout moved to backend template |
| `frontend/src/pages/Usage.tsx` | Layout moved to backend template |
| `frontend/src/pages/Cost.tsx` | Layout moved to backend template |
| `frontend/src/pages/Performance.tsx` | Layout moved to backend template |

---

## 5. URL Architecture

Current URL: `/p/:slug` (user-scoped, slug unique per user)

Future sharing URL: `/u/:userId/p/:slug` (add when sharing is implemented — `org_id` index already in place)

The `CustomPage` component will read the slug from `useParams().slug`. The routing is designed so that adding a `/u/:userId` prefix later only requires a route change and an API parameter, not a data model change.

---

## 6. Verification Approach

### Backend tests
- `analytics-api/tests/test_pages.py` — unit tests for pages router:
  - CRUD operations (create, read, update, delete)
  - Slug generation and collision handling
  - Template seeding
  - Reorder
  - Auth requirement (401 without token)
  - Layout validation (valid JSON)

### Frontend tests
- `frontend/src/pages/CustomPage.test.tsx` — renders page from API data
- `frontend/src/components/pages/PageCreateModal.test.tsx` — form validation, template selection
- `frontend/src/components/layout/Sidebar.test.tsx` — dynamic nav rendering

### E2E tests
- `tests/e2e/tests/custom-pages.spec.ts`:
  - Login → pages seeded → sidebar shows 4 pages
  - Navigate between pages
  - Create new page (blank + from template)
  - Rename page
  - Delete page
  - Add/remove widgets → refresh → layout persisted

### Manual verification
- `docker compose up --build -d` → full stack running
- Login → see 4 seeded pages in sidebar
- Click through pages, verify widget rendering
- Create new page, verify it appears in sidebar
- Modify layout, refresh, verify persistence
- Delete a page, verify sidebar updates

### Linting
- `docker compose exec analytics-api pytest`
- `docker compose exec frontend npm run lint`
- `docker compose exec frontend npx tsc --noEmit`
