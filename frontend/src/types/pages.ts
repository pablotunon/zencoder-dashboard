import type { DashboardRow } from "./widget";

/** Icon key string used by the page system (maps to Heroicon components). */
export type PageIconKey = string;

/** Summary returned by GET /api/pages (sidebar listing). */
export interface PageSummary {
  page_id: string;
  name: string;
  slug: string;
  icon: PageIconKey;
  sort_order: number;
}

/** Full page detail returned by GET /api/pages/:slug. */
export interface PageDetail extends PageSummary {
  layout: DashboardRow[];
}

/** Body for POST /api/pages. */
export interface PageCreateRequest {
  name: string;
  icon?: PageIconKey;
  template?: string;
}

/** Body for PUT /api/pages/:slug. */
export interface PageUpdateRequest {
  name?: string;
  icon?: PageIconKey;
  layout?: DashboardRow[];
}

/** Body for PATCH /api/pages/reorder. */
export interface PageReorderRequest {
  page_ids: string[];
}

/** Template summary returned by GET /api/pages/templates. */
export interface TemplateSummary {
  id: string;
  name: string;
  icon: PageIconKey;
  description: string;
}
