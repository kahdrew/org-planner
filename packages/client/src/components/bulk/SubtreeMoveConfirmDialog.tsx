import { ArrowRightLeft, X, Users } from 'lucide-react';

interface SubtreeMoveConfirmDialogProps {
  /** Name of the employee (subtree root) being moved */
  employeeName: string;
  /** Name of the new parent / drop target */
  targetName: string;
  /** Total number of people in the subtree (including the root) */
  subtreeSize: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog shown when a manager with reports is dragged to a new parent.
 * Shows how many people will be affected by the subtree move.
 */
export default function SubtreeMoveConfirmDialog({
  employeeName,
  targetName,
  subtreeSize,
  onConfirm,
  onCancel,
}: SubtreeMoveConfirmDialogProps) {
  const isSubtree = subtreeSize > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="subtree-move-confirm-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={20} className="text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Move {isSubtree ? 'Team' : 'Employee'}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            data-testid="subtree-move-confirm-close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Move <span className="font-semibold">{employeeName}</span> to report
            to <span className="font-semibold">{targetName}</span>?
          </p>
        </div>

        {isSubtree && (
          <div className="mb-4 flex items-center gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            <Users size={16} className="shrink-0 text-amber-500" />
            <span>
              This will move{' '}
              <span className="font-semibold" data-testid="subtree-move-affected-count">
                {subtreeSize} {subtreeSize === 1 ? 'person' : 'people'}
              </span>{' '}
              (including {subtreeSize - 1} {subtreeSize - 1 === 1 ? 'report' : 'reports'}).
            </span>
          </div>
        )}

        <p className="mb-6 text-xs text-gray-500">
          This action can be undone with Cmd+Z.
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            data-testid="subtree-move-confirm-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            data-testid="subtree-move-confirm-ok"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
