import { useState } from 'react';
import { X, Clock, Calendar, Pencil, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useScheduledChangeStore } from '@/stores/scheduledChangeStore';
import { useOrgStore } from '@/stores/orgStore';
import type { ScheduledChange, ScheduledChangeType } from '@/types';

const CHANGE_TYPE_LABELS: Record<ScheduledChangeType, string> = {
  promotion: 'Promotion',
  transfer: 'Transfer',
  departure: 'Departure',
  edit: 'Edit',
};

const CHANGE_TYPE_COLORS: Record<ScheduledChangeType, string> = {
  promotion: 'bg-emerald-50 text-emerald-700',
  transfer: 'bg-blue-50 text-blue-700',
  departure: 'bg-red-50 text-red-700',
  edit: 'bg-gray-100 text-gray-700',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatChangeData(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

interface PendingChangesPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function PendingChangesPanel({ open, onClose }: PendingChangesPanelProps) {
  const scheduledChanges = useScheduledChangeStore((s) => s.scheduledChanges);
  const cancelChange = useScheduledChangeStore((s) => s.cancelScheduledChange);
  const updateChange = useScheduledChangeStore((s) => s.updateScheduledChange);
  const employees = useOrgStore((s) => s.employees);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');

  if (!open) return null;

  const pendingChanges = scheduledChanges.filter((c) => c.status === 'pending');
  const pastChanges = scheduledChanges.filter((c) => c.status !== 'pending');

  const getEmployeeName = (employeeId: string) => {
    return employees.find((e) => e._id === employeeId)?.name ?? 'Unknown';
  };

  const handleCancel = async (id: string) => {
    setCancelling(id);
    try {
      await cancelChange(id);
    } finally {
      setCancelling(null);
    }
  };

  const handleEditDate = (change: ScheduledChange) => {
    setEditingId(change._id);
    setEditDate(change.effectiveDate.split('T')[0]);
  };

  const handleSaveDate = async (id: string) => {
    try {
      await updateChange(id, { effectiveDate: editDate });
      setEditingId(null);
    } catch {
      // Error handled by store
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-96 flex-col border-l border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-800">Scheduled Changes</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {pendingChanges.length === 0 && pastChanges.length === 0 && (
          <div className="py-12 text-center">
            <Clock size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">No scheduled changes</p>
            <p className="mt-1 text-xs text-gray-400">
              Schedule changes from the employee detail panel
            </p>
          </div>
        )}

        {/* Pending Changes */}
        {pendingChanges.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
              Pending ({pendingChanges.length})
            </h3>
            <div className="space-y-3">
              {pendingChanges.map((change) => (
                <div
                  key={change._id}
                  className="rounded-lg border border-gray-200 p-3 transition-colors hover:border-gray-300"
                  data-testid="pending-change-item"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {getEmployeeName(change.employeeId)}
                      </span>
                      <span
                        className={cn(
                          'ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          CHANGE_TYPE_COLORS[change.changeType],
                        )}
                      >
                        {CHANGE_TYPE_LABELS[change.changeType]}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditDate(change)}
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        title="Edit date"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleCancel(change._id)}
                        disabled={cancelling === change._id}
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Cancel change"
                        data-testid="cancel-scheduled-change"
                      >
                        {cancelling === change._id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Calendar size={12} />
                    {editingId === change._id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          min={todayStr}
                          className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                        />
                        <button
                          onClick={() => handleSaveDate(change._id)}
                          className="rounded bg-blue-500 px-2 py-0.5 text-xs text-white hover:bg-blue-600"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span>{formatDate(change.effectiveDate)}</span>
                    )}
                  </div>

                  <div className="mt-1 text-xs text-gray-400">
                    {formatChangeData(change.changeData)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past Changes (applied/cancelled) */}
        {pastChanges.length > 0 && (
          <div>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
              History ({pastChanges.length})
            </h3>
            <div className="space-y-2">
              {pastChanges.map((change) => (
                <div
                  key={change._id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3 opacity-60"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {getEmployeeName(change.employeeId)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        change.status === 'applied'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500',
                      )}
                    >
                      {change.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {CHANGE_TYPE_LABELS[change.changeType]} — {formatDate(change.effectiveDate)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
