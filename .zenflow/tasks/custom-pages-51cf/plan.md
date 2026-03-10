# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

If you are blocked and need user clarification, mark the current step with `[!]` in plan.md before stopping.

---

## Workflow Steps

### [x] Step: Technical Specification
<!-- chat-id: adb8d01e-d2e1-4245-83a9-e224ef7c8020 -->

Spec saved to `.zenflow/tasks/custom-pages-51cf/spec.md`. Difficulty: Hard. Full-stack feature covering Postgres schema, Python API (FastAPI), and React frontend.

---

### [x] Step: Database schema and backend templates
<!-- chat-id: ab1aa7e3-a059-41d7-a597-b4a3e3549abe -->

Update `init-scripts/postgres/002-user-pages.sql` to add the `slug` column and unique constraint. Create `analytics-api/app/services/page_templates.py` with the 4 default page templates (Overview, Usage, Cost, Performance) extracted from the current frontend page components.

- Update the SQL schema (add `slug VARCHAR(128) NOT NULL`, `UNIQUE(user_id, slug)`, `ON DELETE CASCADE`)
- Create template definitions with layout JSON matching current page layouts
- Run `docker compose exec analytics-api pytest` to verify no regressions

---

### [x] Step: Backend pages API
<!-- chat-id: d295f46c-e497-4dbb-af61-53562002003c -->

Create the pages service layer and API router.

- Create `analytics-api/app/models/pages.py` — Pydantic models for requests/responses
- Create `analytics-api/app/services/page_service.py` — DB access (CRUD, slug generation, seeding, reorder)
- Create `analytics-api/app/routers/pages.py` — REST endpoints (list, get, create, update, delete, reorder, templates)
- Register the router in `analytics-api/app/main.py`
- Add page seeding logic to `analytics-api/app/routers/auth.py` (seed on login if zero pages)
- Write tests in `analytics-api/tests/test_pages.py`
- Run `docker compose exec analytics-api pytest`

---

### [x] Step: Frontend API layer and icon registry
<!-- chat-id: 69989162-ee12-469b-a846-5b0f70031948 -->

Create the frontend API hooks and icon mapping needed by the UI components.

- Create `frontend/src/api/pages.ts` — React Query hooks for all pages endpoints
- Create `frontend/src/lib/icon-registry.ts` — icon key to Heroicon component mapping
- Add TypeScript types for page API responses in `frontend/src/types/`
- Run `docker compose exec frontend npx tsc --noEmit`

---

### [ ] Step: CustomPage component and routing

Replace all existing page components with a single dynamic CustomPage and update routing.

- Create `frontend/src/pages/CustomPage.tsx` — universal page component (loads layout from API, auto-saves changes)
- Refactor `frontend/src/hooks/useDashboard.ts` — accept initial rows, add onChange callback for auto-save
- Update `frontend/src/App.tsx` — replace static routes with `/p/:slug`, add redirect from `/` to first page
- Delete `frontend/src/pages/Dashboard.tsx`, `Overview.tsx`, `Usage.tsx`, `Cost.tsx`, `Performance.tsx`
- Run `docker compose exec frontend npx tsc --noEmit` and `docker compose exec frontend npm run lint`

---

### [ ] Step: Dynamic sidebar and page creation

Update the sidebar to load pages from the API and add the page creation flow.

- Update `frontend/src/components/layout/Sidebar.tsx` — dynamic nav from `usePages()`, "New Page" button
- Create `frontend/src/components/pages/PageCreateModal.tsx` — name input, icon picker, template selector
- Add inline page title editing and icon changing on `CustomPage`
- Add page delete functionality (from sidebar or page)
- Run frontend lint and type checks

---

### [ ] Step: Integration testing and polish

End-to-end testing and final verification.

- Rebuild stack: `docker compose up --build -d`
- Write E2E test `tests/e2e/tests/custom-pages.spec.ts` (seed, navigate, create, edit, delete, persist)
- Run `./scripts/test.sh` for all service tests
- Run `./scripts/test.sh e2e` for E2E tests
- Manual verification: login flow, seeded pages, widget persistence, page CRUD
- Write report to `.zenflow/tasks/custom-pages-51cf/report.md`
