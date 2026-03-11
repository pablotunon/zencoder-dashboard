import { PlusIcon } from "@heroicons/react/24/outline";

interface AddRowPickerProps {
  onAddRow: (columns: 1 | 2 | 3 | 4) => void;
}

export function AddRowPicker({ onAddRow }: AddRowPickerProps) {
  return (
    <button
      onClick={() => onAddRow(1)}
      className="group/add flex w-full items-center gap-3 py-2"
    >
      <div className="h-px flex-1 bg-gray-200 transition-colors group-hover/add:bg-indigo-300" />
      <span className="flex items-center gap-1 text-xs text-gray-400 opacity-0 transition-opacity group-hover/add:opacity-100">
        <PlusIcon className="h-3.5 w-3.5" />
        Add row
      </span>
      <div className="h-px flex-1 bg-gray-200 transition-colors group-hover/add:bg-indigo-300" />
    </button>
  );
}
