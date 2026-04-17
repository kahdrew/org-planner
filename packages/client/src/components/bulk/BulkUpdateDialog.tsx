import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { getInvalidManagerIds } from '@/utils/hierarchy';
import type { Employee } from '@/types';

export type BulkField = 'department' | 'level' | 'status' | 'managerId';

const FIELD_LABELS: Record<BulkField, string> = {
  department: 'Department',
  level: 'Level',
  status: 'Status',
  managerId: 'Manager',
};

const STATUS_OPTIONS: Employee['status'][] = ['Active', 'Planned', 'Open Req', 'Backfill'];

interface BulkUpdateDialogProps {
  field: BulkField;
  count: number;
  employees: Employee[];
  /** IDs of the currently selected employees (used to filter invalid manager choices) */
  selectedIds: Set<string>;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function BulkUpdateDialog({
  field,
  count,
  employees,
  selectedIds,
  onConfirm,
  onCancel,
}: BulkUpdateDialogProps) {
  const [value, setValue] = useState('');

  // Build manager options, excluding selected employees and their descendants
  // to prevent self-referential or cyclic hierarchy assignments
  const managerOptions = useMemo(() => {
    if (field !== 'managerId') return [];

    const invalidIds = getInvalidManagerIds(selectedIds, employees);
    return employees
      .filter(
        (e) =>
          (e.status === 'Active' || e.status === 'Planned') &&
          !invalidIds.has(e._id),
      )
      .map((e) => ({ id: e._id, name: `${e.name} — ${e.title}` }));
  }, [field, employees, selectedIds]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() && field !== 'managerId') return;
    if (field === 'managerId' && !value) return;
    onConfirm(value);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="bulk-update-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Update {FIELD_LABELS[field]}
          </h3>
          <button
            onClick={onCancel}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          Update {FIELD_LABELS[field].toLowerCase()} for{' '}
          <span className="font-semibold">{count}</span> selected{' '}
          {count === 1 ? 'employee' : 'employees'}.
        </p>

        <form onSubmit={handleSubmit}>
          {field === 'status' ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="bulk-update-select"
              autoFocus
            >
              <option value="">Select status...</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : field === 'managerId' ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="bulk-update-select"
              autoFocus
            >
              <option value="">Select manager...</option>
              <option value="__none__">No manager (top-level)</option>
              {managerOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Enter new ${FIELD_LABELS[field].toLowerCase()}...`}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="bulk-update-input"
              autoFocus
            />
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value.trim() && field !== 'managerId'}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium text-white transition-colors',
                value.trim() || field === 'managerId'
                  ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
                  : 'cursor-not-allowed bg-gray-300',
              )}
              data-testid="bulk-update-confirm"
            >
              Update {count} {count === 1 ? 'Employee' : 'Employees'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
