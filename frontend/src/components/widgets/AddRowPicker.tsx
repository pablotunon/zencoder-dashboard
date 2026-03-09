import { PlusIcon } from "@heroicons/react/24/outline";

const ROW_OPTIONS: { columns: 1 | 2 | 3 | 4; label: string }[] = [
  { columns: 1, label: "1 column" },
  { columns: 2, label: "2 columns" },
  { columns: 3, label: "3 columns" },
  { columns: 4, label: "4 columns" },
];

interface AddRowPickerProps {
  onAddRow: (columns: 1 | 2 | 3 | 4) => void;
}

export function AddRowPicker({ onAddRow }: AddRowPickerProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-500">Add row:</span>
      <div className="flex gap-2">
        {ROW_OPTIONS.map((opt) => (
          <button
            key={opt.columns}
            onClick={() => onAddRow(opt.columns)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
