import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "Failed to load data",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 py-12">
      <ExclamationTriangleIcon className="mb-3 h-10 w-10 text-red-400" />
      <p className="mb-1 text-sm font-medium text-red-800">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200"
        >
          Retry
        </button>
      )}
    </div>
  );
}
