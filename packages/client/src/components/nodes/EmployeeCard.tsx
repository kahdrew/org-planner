import { memo, useState, useCallback } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { Employee } from '@/types';
import { cn } from '@/utils/cn';
import { useOrgStore } from '@/stores/orgStore';
import InlineEditableField from '@/components/inline/InlineEditableField';

const STATUS_COLORS: Record<Employee['status'], string> = {
  Active: 'border-l-blue-500',
  Planned: 'border-l-amber-500',
  'Open Req': 'border-l-green-500',
  Backfill: 'border-l-purple-500',
};

const STATUS_BG: Record<Employee['status'], string> = {
  Active: 'bg-blue-50 text-blue-700',
  Planned: 'bg-amber-50 text-amber-700',
  'Open Req': 'bg-green-50 text-green-700',
  Backfill: 'bg-purple-50 text-purple-700',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-pink-500',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Editable field names on the card */
type CardField = 'name' | 'title' | 'department';

function validateName(value: string): string | null {
  if (!value.trim()) return 'Name is required';
  return null;
}

type EmployeeNodeData = Employee & { label?: string };

function EmployeeCard({ data, selected }: NodeProps & { data: EmployeeNodeData }) {
  const employee = data as Employee;
  const updateEmployee = useOrgStore((s) => s.updateEmployee);
  const [isInlineEditing, setIsInlineEditing] = useState(false);

  const handleClick = useCallback(() => {
    if (!isInlineEditing) {
      useOrgStore.setState({ selectedEmployee: employee });
    }
  }, [employee, isInlineEditing]);

  const handleSave = useCallback(
    (field: string, value: string) => {
      updateEmployee(employee._id, { [field]: value });
    },
    [employee._id, updateEmployee],
  );

  const handleEditStart = useCallback(() => {
    setIsInlineEditing(true);
  }, []);

  const handleEditEnd = useCallback(() => {
    setIsInlineEditing(false);
  }, []);

  const handleTab = useCallback((_field: CardField, _shiftKey: boolean) => {
    // Tab navigation between fields — currently handled by save + blur
  }, []);

  return (
    <div
      onClick={handleClick}
      className={cn(
        'w-[220px] cursor-pointer rounded-lg border border-gray-200 border-l-4 bg-white shadow-sm transition-shadow hover:shadow-md',
        STATUS_COLORS[employee.status],
        selected && 'ring-2 ring-blue-500 ring-offset-1',
        isInlineEditing && 'nopan nodrag',
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-300 !w-2 !h-2" />

      <div className="p-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
              getAvatarColor(employee.name)
            )}
          >
            {getInitials(employee.name)}
          </div>

          <div className="min-w-0 flex-1">
            <InlineEditableField
              value={employee.name}
              fieldName="name"
              onSave={(v) => handleSave('name', v)}
              validate={validateName}
              displayClassName="truncate text-sm font-semibold text-gray-900"
              inputClassName="text-sm font-semibold"
              testIdPrefix="card-inline"
              onEditStart={handleEditStart}
              onEditEnd={handleEditEnd}
              onTab={(shiftKey) => handleTab('name', shiftKey)}
            />
            <InlineEditableField
              value={employee.title}
              fieldName="title"
              onSave={(v) => handleSave('title', v)}
              displayClassName="truncate text-xs text-gray-500"
              inputClassName="text-xs"
              testIdPrefix="card-inline"
              onEditStart={handleEditStart}
              onEditEnd={handleEditEnd}
              onTab={(shiftKey) => handleTab('title', shiftKey)}
            />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <InlineEditableField
            value={employee.department}
            fieldName="department"
            onSave={(v) => handleSave('department', v)}
            displayClassName="truncate text-xs text-gray-400"
            inputClassName="text-xs"
            testIdPrefix="card-inline"
            onEditStart={handleEditStart}
            onEditEnd={handleEditEnd}
            onTab={(shiftKey) => handleTab('department', shiftKey)}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              STATUS_BG[employee.status]
            )}
          >
            {employee.status}
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
            {employee.employmentType}
          </span>
          {employee.level && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              {employee.level}
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-300 !w-2 !h-2" />
    </div>
  );
}

export default memo(EmployeeCard);
