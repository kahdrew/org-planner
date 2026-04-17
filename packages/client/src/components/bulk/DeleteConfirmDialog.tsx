import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmDialogProps {
  /** Number of employees to delete */
  count: number;
  /** Name(s) of employee(s) — shown for a single employee */
  employeeName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog for keyboard-triggered delete (Backspace/Delete key).
 * Reuses the same visual style as BulkDeleteDialog.
 */
export default function DeleteConfirmDialog({
  count,
  employeeName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="delete-confirm-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              {count === 1 && employeeName
                ? `Delete "${employeeName}"?`
                : `Delete ${count} ${count === 1 ? 'Employee' : 'Employees'}?`}
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
          {count === 1 && employeeName ? (
            <>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{employeeName}</span>? This action
              can be undone with Cmd+Z.
            </>
          ) : (
            <>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{count}</span> selected employees?
              This action can be undone with Cmd+Z.
            </>
          )}
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            data-testid="delete-confirm-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            data-testid="delete-confirm-ok"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
