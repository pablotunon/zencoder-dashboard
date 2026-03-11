import { PlusIcon } from "@heroicons/react/24/outline";

interface AddRowPickerProps {
  onAddRow: (columns: 1 | 2 | 3 | 4) => void;
}

export function AddRowPicker({ onAddRow }: AddRowPickerProps) {
  return (
    <button
      onClick={() => onAddRow(1)}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
    >
      <PlusIcon className="h-3.5 w-3.5" />
      Add row
    </button>
  );
}
