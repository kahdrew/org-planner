import { AlertTriangle, X } from 'lucide-react';

interface BulkDeleteDialogProps {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function BulkDeleteDialog({
  count,
  onConfirm,
  onCancel,
}: BulkDeleteDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="bulk-delete-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Delete {count} {count === 1 ? 'Employee' : 'Employees'}?
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-6 text-sm text-gray-600">
          Are you sure you want to delete{' '}
          <span className="font-semibold">{count}</span> selected{' '}
          {count === 1 ? 'employee' : 'employees'}? This action can be undone
          with Cmd+Z.
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            data-testid="bulk-delete-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            data-testid="bulk-delete-confirm"
          >
            Delete {count} {count === 1 ? 'Employee' : 'Employees'}
          </button>
        </div>
      </div>
    </div>
  );
}
