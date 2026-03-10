import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { XMarkIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useCreatePage, usePageTemplates } from "@/api/pages";
import { PAGE_ICON_OPTIONS } from "@/lib/icon-registry";

interface PageCreateModalProps {
  open: boolean;
  onClose: () => void;
}

export function PageCreateModal({ open, onClose }: PageCreateModalProps) {
  const navigate = useNavigate();
  const createPage = useCreatePage();
  const { data: templates } = usePageTemplates();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("squares-2x2");
  const [template, setTemplate] = useState<string>("");

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName("");
      setIcon("squares-2x2");
      setTemplate("");
    }
  }, [open]);

  const isValid = name.trim().length > 0 && name.trim().length <= 100;

  const handleSubmit = () => {
    if (!isValid || createPage.isPending) return;

    createPage.mutate(
      {
        name: name.trim(),
        icon,
        ...(template ? { template } : {}),
      },
      {
        onSuccess: (page) => {
          onClose();
          navigate(`/p/${page.slug}`);
        },
      },
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">New Page</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* Name */}
          <div>
            <label
              htmlFor="page-name"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Page Name
            </label>
            <input
              id="page-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="e.g. API Monitoring"
              maxLength={100}
              autoFocus
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Icon
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {PAGE_ICON_OPTIONS.map((entry) => {
                const Icon = entry.component;
                const selected = icon === entry.key;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setIcon(entry.key)}
                    title={entry.label}
                    className={`flex items-center justify-center rounded-lg p-2 transition-colors ${
                      selected
                        ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template selector */}
          {templates && templates.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Start from template
                <span className="ml-1 font-normal text-gray-400">
                  (optional)
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {/* Blank option */}
                <button
                  type="button"
                  onClick={() => setTemplate("")}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left text-sm transition-colors ${
                    template === ""
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <CheckIcon
                    className={`h-4 w-4 shrink-0 ${
                      template === "" ? "text-indigo-600" : "text-transparent"
                    }`}
                  />
                  <div>
                    <p className="font-medium">Blank</p>
                    <p className="text-xs text-gray-400">Start empty</p>
                  </div>
                </button>

                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left text-sm transition-colors ${
                      template === t.id
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <CheckIcon
                      className={`h-4 w-4 shrink-0 ${
                        template === t.id
                          ? "text-indigo-600"
                          : "text-transparent"
                      }`}
                    />
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="line-clamp-1 text-xs text-gray-400">
                        {t.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || createPage.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createPage.isPending ? "Creating..." : "Create Page"}
          </button>
        </div>
      </div>
    </div>
  );
}
