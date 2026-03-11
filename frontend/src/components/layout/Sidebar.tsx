import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  ArrowRightStartOnRectangleIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/hooks/useAuth";
import { usePages, useDeletePage } from "@/api/pages";
import { getIcon } from "@/lib/icon-registry";
import { PageCreateModal } from "@/components/pages/PageCreateModal";

export function Sidebar() {
  const { org, user, logout } = useAuth();
  const { data: pages } = usePages();
  const deletePage = useDeletePage();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = (slug: string) => {
    deletePage.mutate(slug, {
      onSuccess: () => {
        setConfirmDelete(null);
        // If we deleted the page we're currently viewing, redirect to root
        if (window.location.pathname === `/p/${slug}`) {
          navigate("/");
        }
      },
    });
  };

  return (
    <aside className="flex h-screen w-64 flex-col bg-gray-900 text-gray-100">
      {/* Logo / Org */}
      <div className="flex items-center gap-3 border-b border-gray-700 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">
          {org?.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{org?.name}</p>
          <p className="text-xs text-gray-400 capitalize">{org?.plan} plan</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {pages?.map((page) => {
          const Icon = getIcon(page.icon);
          return (
            <div key={page.page_id} className="group relative">
              <NavLink
                to={`/p/${page.slug}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{page.name}</span>
              </NavLink>

              {/* Delete button on hover */}
              {confirmDelete === page.slug ? (
                <div className="absolute right-1 top-1 flex items-center gap-1 rounded bg-gray-800 px-1.5 py-1">
                  <button
                    onClick={() => handleDelete(page.slug)}
                    className="rounded px-1.5 py-0.5 text-xs font-medium text-red-400 hover:bg-red-500/20"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="rounded px-1.5 py-0.5 text-xs font-medium text-gray-400 hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(page.slug)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 opacity-0 transition-opacity hover:bg-gray-700 hover:text-red-400 group-hover:opacity-100"
                  title="Delete page"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* New Page button */}
        <button
          onClick={() => setCreateOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
        >
          <PlusIcon className="h-5 w-5 shrink-0" />
          New Page
        </button>
      </nav>

      {/* User */}
      <div className="border-t border-gray-700 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-xs font-medium">
            {user?.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Page creation modal */}
      <PageCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </aside>
  );
}
