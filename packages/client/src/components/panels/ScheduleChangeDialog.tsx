import { useState } from 'react';
import { X, Calendar, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { Employee, ScheduledChangeType } from '@/types';

const CHANGE_TYPES: { value: ScheduledChangeType; label: string; description: string }[] = [
  { value: 'promotion', label: 'Promotion', description: 'Change title, level, or salary' },
  { value: 'transfer', label: 'Transfer', description: 'Change department or location' },
  { value: 'departure', label: 'Departure', description: 'Schedule employee departure' },
  { value: 'edit', label: 'Other Edit', description: 'Any other field change' },
];

interface ScheduleChangeDialogProps {
  employee: Employee;
  onSchedule: (data: {
    effectiveDate: string;
    changeType: ScheduledChangeType;
    changeData: Record<string, unknown>;
  }) => Promise<void>;
  onClose: () => void;
}

export default function ScheduleChangeDialog({
  employee,
  onSchedule,
  onClose,
}: ScheduleChangeDialogProps) {
  const [changeType, setChangeType] = useState<ScheduledChangeType>('promotion');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Change data fields
  const [title, setTitle] = useState(employee.title);
  const [department, setDepartment] = useState(employee.department);
  const [level, setLevel] = useState(employee.level);
  const [location, setLocation] = useState(employee.location);
  const [salary, setSalary] = useState(employee.salary?.toString() ?? '');
  const [status, setStatus] = useState(employee.status);

  const todayStr = new Date().toISOString().split('T')[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!effectiveDate) {
      setError('Please select an effective date');
      return;
    }

    if (effectiveDate < todayStr) {
      setError('Effective date cannot be in the past');
      return;
    }

    // Build change data based on type
    const changeData: Record<string, unknown> = {};

    switch (changeType) {
      case 'promotion':
        if (title !== employee.title) changeData.title = title;
        if (level !== employee.level) changeData.level = level;
        if (salary && Number(salary) !== employee.salary) changeData.salary = Number(salary);
        break;
      case 'transfer':
        if (department !== employee.department) changeData.department = department;
        if (location !== employee.location) changeData.location = location;
        break;
      case 'departure':
        changeData.status = status !== employee.status ? status : 'Backfill';
        break;
      case 'edit':
        if (title !== employee.title) changeData.title = title;
        if (department !== employee.department) changeData.department = department;
        if (level !== employee.level) changeData.level = level;
        if (location !== employee.location) changeData.location = location;
        if (salary && Number(salary) !== employee.salary) changeData.salary = Number(salary);
        break;
    }

    if (Object.keys(changeData).length === 0) {
      setError('No changes specified');
      return;
    }

    setSaving(true);
    try {
      await onSchedule({ effectiveDate, changeType, changeData });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to schedule change');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="schedule-change-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Schedule Change for {employee.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Change Type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Change Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CHANGE_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => setChangeType(ct.value)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    changeType === ct.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                  )}
                >
                  <span className="font-medium">{ct.label}</span>
                  <span className="block text-xs text-gray-500">{ct.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Effective Date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Effective Date
            </label>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              min={todayStr}
              className="input-field"
              data-testid="schedule-date-input"
            />
          </div>

          {/* Dynamic fields based on change type */}
          {(changeType === 'promotion' || changeType === 'edit') && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field"
                  placeholder="Job title"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Level</label>
                <input
                  type="text"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="input-field"
                  placeholder="e.g. IC3, M1"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Salary</label>
                <input
                  type="number"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  className="input-field"
                  placeholder="0"
                  min={0}
                />
              </div>
            </>
          )}

          {(changeType === 'transfer' || changeType === 'edit') && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="input-field"
                  placeholder="Department"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="input-field"
                  placeholder="Location"
                />
              </div>
            </>
          )}

          {changeType === 'departure' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Post-Departure Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Employee['status'])}
                className="input-field"
              >
                <option value="Backfill">Backfill</option>
                <option value="Open Req">Open Req</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !effectiveDate}
              className={cn(
                'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors',
                saving || !effectiveDate
                  ? 'cursor-not-allowed bg-blue-300'
                  : 'bg-blue-600 hover:bg-blue-700',
              )}
              data-testid="schedule-change-submit"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Schedule Change
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
