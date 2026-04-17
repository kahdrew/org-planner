import { memo, useState, useCallback, useRef, useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import type { Employee } from '@/types';
import { cn } from '@/utils/cn';
import { useOrgStore } from '@/stores/orgStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useScheduledChangeStore } from '@/stores/scheduledChangeStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { useOverlayStore } from '@/stores/overlayStore';
import { buildOverlayContext, getOverlayColor } from '@/utils/overlayColors';
import { getEmployeeSpanFlag, OVERLOAD_THRESHOLD, UNDERUTILIZATION_THRESHOLD } from '@/utils/spanOfControl';
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

/**
 * Node data attached by OrgChartView when it renders the chart. `_chartEmployees`
 * is the currently rendered dataset (filtered, and — when the timeline slider
 * is active — possibly a historical snapshot). When present, span-of-control
 * warning badges use this list so the flags stay consistent with the
 * displayed employees rather than the live roster.
 */
type EmployeeNodeData = Employee & { label?: string; _chartEmployees?: Employee[] };

function EmployeeCard({ data, selected }: NodeProps & { data: EmployeeNodeData }) {
  const { _chartEmployees, ...employeeData } = data;
  const employee = employeeData as Employee;
  const updateEmployee = useOrgStore((s) => s.updateEmployee);
  const storeEmployees = useOrgStore((s) => s.employees);
  const isMultiSelected = useSelectionStore((s) => s.isSelected(employee._id));
  const toggleSelect = useSelectionStore((s) => s.toggleSelect);
  const hasPendingChanges = useScheduledChangeStore((s) => s.hasPendingChanges(employee._id));
  const isViewer = useInvitationStore((s) => s.currentRole) === 'viewer';
  const overlayMode = useOverlayStore((s) => s.mode);
  const [isInlineEditing, setIsInlineEditing] = useState(false);

  /**
   * The dataset to analyze for relational card state (overlay, span flags).
   * Prefer the rendered dataset supplied via node data so timeline-scrubbed
   * historical snapshots are reflected correctly; fall back to the live
   * store when absent (e.g., tests rendering the card in isolation).
   */
  const allEmployees = _chartEmployees ?? storeEmployees;

  /**
   * Resolve the overlay color for this employee. When the overlay is off,
   * `overlayColor` is null and the card falls back to the default status
   * colors (left border, etc.). When active, we apply the overlay color
   * as the left border and a soft tint to the card background.
   */
  const overlayColor = useMemo(() => {
    if (overlayMode === 'none') return null;
    return getOverlayColor(employee, overlayMode, buildOverlayContext(allEmployees));
  }, [employee, overlayMode, allEmployees]);

  /**
   * Compute the span-of-control flag for this employee (manager). Returns
   * null for individual contributors (no reports), which keeps ICs free of
   * warning badges — only managers are analyzed.
   */
  const spanFlag = useMemo(
    () => getEmployeeSpanFlag(employee._id, allEmployees),
    [employee._id, allEmployees],
  );
  const directReportCount = useMemo(
    () => allEmployees.reduce((acc, e) => (e.managerId === employee._id ? acc + 1 : acc), 0),
    [employee._id, allEmployees],
  );

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
      data-testid={`employee-card-${employee._id}`}
      data-overlay-mode={overlayMode}
      data-overlay-color={overlayColor?.color ?? ''}
      style={
        overlayColor
          ? {
              borderLeftColor: overlayColor.color,
              // Soft tint — the overlay color at ~18% opacity so the card
              // stays legible. Categorical colors still pop because the
              // left border is full-opacity.
              backgroundColor: `${overlayColor.color}2E`,
            }
          : undefined
      }
      title={overlayColor ? `${overlayColor.label}` : undefined}
      className={cn(
        'w-[220px] cursor-pointer rounded-lg border border-gray-200 border-l-4 bg-white shadow-sm transition-shadow hover:shadow-md',
        // Only apply the default status-based border color when there is no
        // active overlay — otherwise we keep the overlay color on the border.
        !overlayColor && STATUS_COLORS[employee.status],
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
          {spanFlag === 'overloaded' && (
            <span
              className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
              title={`Overloaded: ${directReportCount} direct reports (threshold > ${OVERLOAD_THRESHOLD})`}
              data-testid="span-warning-overloaded"
              data-span-flag="overloaded"
            >
              <AlertTriangle size={10} className="mr-0.5" />
              {directReportCount} reports
            </span>
          )}
          {spanFlag === 'underutilized' && (
            <span
              className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
              title={`Underutilized: ${directReportCount} direct report${directReportCount === 1 ? '' : 's'} (threshold < ${UNDERUTILIZATION_THRESHOLD})`}
              data-testid="span-warning-underutilized"
              data-span-flag="underutilized"
            >
              <AlertCircle size={10} className="mr-0.5" />
              {directReportCount} report
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
