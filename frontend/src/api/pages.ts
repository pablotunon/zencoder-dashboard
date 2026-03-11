import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  fetchJson,
  postJson,
  putJson,
  patchJson,
  deleteJson,
} from "@/api/client";
import type {
  PageSummary,
  PageDetail,
  PageCreateRequest,
  PageUpdateRequest,
  PageReorderRequest,
  TemplateSummary,
} from "@/types/pages";

const PAGES_KEY = ["pages"] as const;
const TEMPLATES_KEY = ["pages", "templates"] as const;

function pageDetailKey(slug: string) {
  return ["pages", slug] as const;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** GET /api/pages — sidebar listing of all user pages. */
export function usePages() {
  return useQuery({
    queryKey: PAGES_KEY,
    queryFn: () => fetchJson<PageSummary[]>("/api/pages"),
    staleTime: 30_000,
  });
}

/** GET /api/pages/:slug — single page with full layout. */
export function usePage(slug: string) {
  return useQuery({
    queryKey: pageDetailKey(slug),
    queryFn: () => fetchJson<PageDetail>(`/api/pages/${slug}`),
    staleTime: 30_000,
  });
}

/** GET /api/pages/templates — available templates for the create flow. */
export function usePageTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => fetchJson<TemplateSummary[]>("/api/pages/templates"),
    staleTime: 10 * 60_000,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

/** POST /api/pages — create a new page (blank or from template). */
export function useCreatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PageCreateRequest) =>
      postJson<PageDetail>("/api/pages", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAGES_KEY });
    },
  });
}

/** PUT /api/pages/:slug — update page name, icon, or layout. */
export function useUpdatePage(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PageUpdateRequest) =>
      putJson<PageDetail>(`/api/pages/${slug}`, body),
    onSuccess: (updated) => {
      qc.setQueryData(pageDetailKey(slug), updated);
      qc.invalidateQueries({ queryKey: PAGES_KEY });
    },
  });
}

/** PATCH /api/pages/reorder — set page order. */
export function useReorderPages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PageReorderRequest) =>
      patchJson("/api/pages/reorder", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAGES_KEY });
    },
  });
}

/** DELETE /api/pages/:slug — delete a page. */
export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => deleteJson(`/api/pages/${slug}`),
    onSuccess: (_data, slug) => {
      qc.removeQueries({ queryKey: pageDetailKey(slug) });
      qc.invalidateQueries({ queryKey: PAGES_KEY });
    },
  });
}
