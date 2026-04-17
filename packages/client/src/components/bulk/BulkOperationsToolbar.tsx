import { useState } from 'react';
import { Pencil, Trash2, Users, X } from 'lucide-react';
import { useSelectionStore } from '@/stores/selectionStore';
import { useOrgStore } from '@/stores/orgStore';
import { useUndoRedoStore } from '@/stores/undoRedoStore';
import type { SingleCommand } from '@/stores/undoRedoStore';
import * as employeesApi from '@/api/employees';
import BulkUpdateDialog, { type BulkField } from './BulkUpdateDialog';
import BulkDeleteDialog from './BulkDeleteDialog';

export default function BulkOperationsToolbar() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const employees = useOrgStore((s) => s.employees);
  const bulkUpdateEmployees = useOrgStore((s) => s.bulkUpdateEmployees);
  const bulkDeleteEmployees = useOrgStore((s) => s.bulkDeleteEmployees);

  const [updateField, setUpdateField] = useState<BulkField | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const count = selectedIds.size;
  if (count === 0) return null;

  const handleBulkUpdate = async (value: string) => {
    if (!updateField) return;
    const ids = Array.from(selectedIds);

    if (updateField === 'managerId') {
      // Handle manager change — move each employee but collect commands
      // into a single BatchCommand so undo/redo works as a single unit
      const newManagerId = value === '__none__' ? null : value;
      const capturedScenarioId = useOrgStore.getState().currentScenario?._id;
      const moveCommands: SingleCommand[] = [];

      for (const id of ids) {
        const emp = employees.find((e) => e._id === id);
        if (!emp) continue;

        const previousManagerId = emp.managerId ?? null;
        const previousOrder = emp.order ?? 0;

        const updated = await employeesApi.moveEmployee(id, newManagerId, emp.order);
        useOrgStore.setState((state) => ({
          employees: state.employees.map((e) => (e._id === id ? updated : e)),
        }));

        moveCommands.push({
          type: 'move',
          employeeId: id,
          previousManagerId,
          previousOrder,
          nextManagerId: newManagerId,
          nextOrder: emp.order,
          timestamp: Date.now(),
          description: `Move employee "${emp.name}"`,
        });
      }

      // Push as a single batch command for single-step undo
      if (moveCommands.length > 0 && capturedScenarioId) {
        useUndoRedoStore.getState().pushCommand(
          {
            type: 'batch',
            commands: moveCommands,
            timestamp: Date.now(),
            description: `Bulk change manager for ${moveCommands.length} employees`,
          },
          capturedScenarioId,
        );
      }
    } else {
      await bulkUpdateEmployees(ids, { [updateField]: value });
    }

    setUpdateField(null);
    clearSelection();
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    await bulkDeleteEmployees(ids);
    setShowDeleteConfirm(false);
    clearSelection();
  };

  return (
    <>
      <div
        className="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-6 py-2"
        data-testid="bulk-operations-toolbar"
      >
        <div className="flex items-center gap-2">
          <Users size={16} className="text-blue-600" />
          <span className="text-sm font-medium text-blue-700" data-testid="selection-count">
            {count} selected
          </span>
        </div>

        <div className="mx-2 h-5 w-px bg-blue-200" />

        <button
          onClick={() => setUpdateField('department')}
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          data-testid="bulk-update-department"
        >
          <Pencil size={14} />
          Update Department
        </button>

        <button
          onClick={() => setUpdateField('level')}
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          data-testid="bulk-update-level"
        >
          <Pencil size={14} />
          Update Level
        </button>

        <button
          onClick={() => setUpdateField('status')}
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          data-testid="bulk-update-status"
        >
          <Pencil size={14} />
          Update Status
        </button>

        <button
          onClick={() => setUpdateField('managerId')}
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          data-testid="bulk-change-manager"
        >
          <Pencil size={14} />
          Change Manager
        </button>

        <div className="mx-2 h-5 w-px bg-blue-200" />

        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-100"
          data-testid="bulk-delete"
        >
          <Trash2 size={14} />
          Delete Selected
        </button>

        <div className="flex-1" />

        <button
          onClick={clearSelection}
          className="rounded-md p-1.5 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-600"
          title="Clear selection (Escape)"
          data-testid="clear-selection"
        >
          <X size={18} />
        </button>
      </div>

      {/* Dialogs */}
      {updateField && (
        <BulkUpdateDialog
          field={updateField}
          count={count}
          employees={employees}
          selectedIds={selectedIds}
          onConfirm={handleBulkUpdate}
          onCancel={() => setUpdateField(null)}
        />
      )}

      {showDeleteConfirm && (
        <BulkDeleteDialog
          count={count}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
