import { useEffect, useRef } from "react";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";

const UNDO_TIMEOUT = 5_000;

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, UNDO_TIMEOUT);
    return () => clearTimeout(timerRef.current);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-lg">
        <span className="text-sm text-gray-700">{message}</span>
        <button
          onClick={onUndo}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
        >
          <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
          Undo
        </button>
      </div>
    </div>
  );
}
