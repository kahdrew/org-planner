import { memo, useState, useCallback, useRef } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Clock } from 'lucide-react';
import type { Employee } from '@/types';
import { cn } from '@/utils/cn';
import { useOrgStore } from '@/stores/orgStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useScheduledChangeStore } from '@/stores/scheduledChangeStore';
import { useInvitationStore } from '@/stores/invitationStore';
import InlineEditableField from '@/components/inline/InlineEditableField';
import type { InlineEditableFieldHandle } from '@/components/inline/InlineEditableField';

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
type CardField = 'name' | 'title' | 'department' | 'level';

/** Deterministic field order for Tab traversal */
const CARD_FIELD_ORDER: CardField[] = ['name', 'title', 'department', 'level'];

function validateName(value: string): string | null {
  if (!value.trim()) return 'Name is required';
  return null;
}

type EmployeeNodeData = Employee & { label?: string };

function EmployeeCard({ data, selected }: NodeProps & { data: EmployeeNodeData }) {
  const employee = data as Employee;
  const updateEmployee = useOrgStore((s) => s.updateEmployee);
  const isMultiSelected = useSelectionStore((s) => s.isSelected(employee._id));
  const toggleSelect = useSelectionStore((s) => s.toggleSelect);
  const hasPendingChanges = useScheduledChangeStore((s) => s.hasPendingChanges(employee._id));
  const isViewer = useInvitationStore((s) => s.currentRole) === 'viewer';
  const [isInlineEditing, setIsInlineEditing] = useState(false);

  // Refs for each editable field to enable Tab traversal
  const fieldRefs = useRef<Record<CardField, InlineEditableFieldHandle | null>>({
    name: null,
    title: null,
    department: null,
    level: null,
  });

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isModKey = isMac ? e.metaKey : e.ctrlKey;

      if (isModKey) {
        // Cmd/Ctrl+Click: toggle multi-select
        e.stopPropagation();
        toggleSelect(employee._id);
        return;
      }

      if (!isInlineEditing) {
        useOrgStore.setState({ selectedEmployee: employee });
      }
    },
    [employee, isInlineEditing, toggleSelect],
  );

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

  const handleTab = useCallback((field: CardField, shiftKey: boolean) => {
    const currentIndex = CARD_FIELD_ORDER.indexOf(field);
    if (currentIndex === -1) return;
    const nextIndex = shiftKey ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex >= 0 && nextIndex < CARD_FIELD_ORDER.length) {
      const nextField = CARD_FIELD_ORDER[nextIndex];
      // Use setTimeout to allow current field's save/blur to complete before activating next
      setTimeout(() => {
        fieldRefs.current[nextField]?.startEditing();
      }, 0);
    }
  }, []);

  return (
    <div
      onClick={handleClick}
      className={cn(
        'w-[220px] cursor-pointer rounded-lg border border-gray-200 border-l-4 bg-white shadow-sm transition-shadow hover:shadow-md',
        STATUS_COLORS[employee.status],
        isMultiSelected && 'ring-2 ring-blue-500 ring-offset-1 bg-blue-50',
        selected && !isMultiSelected && 'ring-2 ring-blue-500 ring-offset-1',
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
              ref={(el) => { fieldRefs.current.name = el; }}
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
              disabled={isViewer}
            />
            <InlineEditableField
              ref={(el) => { fieldRefs.current.title = el; }}
              value={employee.title}
              fieldName="title"
              onSave={(v) => handleSave('title', v)}
              displayClassName="truncate text-xs text-gray-500"
              inputClassName="text-xs"
              testIdPrefix="card-inline"
              onEditStart={handleEditStart}
              onEditEnd={handleEditEnd}
              onTab={(shiftKey) => handleTab('title', shiftKey)}
              disabled={isViewer}
            />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <InlineEditableField
            ref={(el) => { fieldRefs.current.department = el; }}
            value={employee.department}
            fieldName="department"
            onSave={(v) => handleSave('department', v)}
            displayClassName="truncate text-xs text-gray-400"
            inputClassName="text-xs"
            testIdPrefix="card-inline"
            onEditStart={handleEditStart}
            onEditEnd={handleEditEnd}
            onTab={(shiftKey) => handleTab('department', shiftKey)}
            disabled={isViewer}
          />
        </div>

        {employee.salary != null && (
          <div
            className="mt-2 text-xs text-gray-500"
            data-export-salary="true"
            data-testid="card-salary"
          >
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(employee.salary)}
            {employee.equity != null && (
              <span className="ml-1 text-gray-400">
                + {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(employee.equity)} equity
              </span>
            )}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1">
          {hasPendingChanges && (
            <span
              className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600"
              title="Has pending scheduled changes"
              data-testid="pending-change-indicator"
            >
              <Clock size={10} className="mr-0.5" />
              Pending
            </span>
          )}
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
            <InlineEditableField
              ref={(el) => { fieldRefs.current.level = el; }}
              value={employee.level}
              fieldName="level"
              onSave={(v) => handleSave('level', v)}
              displayClassName="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
              inputClassName="text-[10px]"
              testIdPrefix="card-inline"
              onEditStart={handleEditStart}
              onEditEnd={handleEditEnd}
              onTab={(shiftKey) => handleTab('level', shiftKey)}
              disabled={isViewer}
            />
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-300 !w-2 !h-2" />
    </div>
  );
}

export default memo(EmployeeCard);
