import { PlusIcon } from "@heroicons/react/24/outline";

interface AddRowPickerProps {
  onAddRow: (columns: 1 | 2 | 3 | 4) => void;
}

export function AddRowPicker({ onAddRow }: AddRowPickerProps) {
  return (
    <button
      onClick={() => onAddRow(1)}
      className="flex w-full items-center justify-center gap-1 rounded-md py-2 text-xs text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
    >
      <PlusIcon className="h-3.5 w-3.5" />
      Add row
    </button>
  );
}
