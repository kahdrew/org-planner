import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Users, AlertTriangle, AlertCircle, CheckCircle2, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useOrgStore } from '@/stores/orgStore';
import { useSelectionStore } from '@/stores/selectionStore';
import {
  computeSpanOfControl,
  summarizeSpanOfControl,
  OVERLOAD_THRESHOLD,
  UNDERUTILIZATION_THRESHOLD,
  type ManagerSpan,
  type SpanFlag,
} from '@/utils/spanOfControl';
import type { Employee } from '@/types';

interface SpanOfControlPanelProps {
  open: boolean;
  onClose: () => void;
}

const FLAG_STYLES: Record<
  SpanFlag,
  {
    badge: string;
    badgeLabel: string;
    dotClass: string;
    rowRing: string;
    Icon: typeof AlertTriangle;
  }
> = {
  overloaded: {
    badge: 'bg-red-100 text-red-700',
    badgeLabel: 'Overloaded',
    dotClass: 'bg-red-500',
    rowRing: 'border-red-200 bg-red-50/40',
    Icon: AlertTriangle,
  },
  underutilized: {
    badge: 'bg-amber-100 text-amber-700',
    badgeLabel: 'Underutilized',
    dotClass: 'bg-amber-500',
    rowRing: 'border-amber-200 bg-amber-50/40',
    Icon: AlertCircle,
  },
  healthy: {
    badge: 'bg-emerald-100 text-emerald-700',
    badgeLabel: 'Healthy',
    dotClass: 'bg-emerald-500',
    rowRing: 'border-gray-200 bg-white',
    Icon: CheckCircle2,
  },
};

/**
 * Slide-in panel showing span-of-control analytics for the current scenario.
 * Lists every manager with their direct report count, sorted descending, and
 * flags overloaded (>8) and underutilized (<2) managers.
 */
export default function SpanOfControlPanel({ open, onClose }: SpanOfControlPanelProps) {
  const employees = useOrgStore((s) => s.employees);
  const selectEmployee = useOrgStore((s) => s.selectEmployee);
  const singleSelect = useSelectionStore((s) => s.singleSelect);
  const navigate = useNavigate();

  const rows = useMemo(() => computeSpanOfControl(employees), [employees]);
  const summary = useMemo(() => summarizeSpanOfControl(rows), [rows]);

  if (!open) return null;

  const handleNavigate = (manager: Employee) => {
    // Select employee so detail panel opens AND highlight in org chart.
    selectEmployee(manager);
    singleSelect(manager._id);
    // Send the user to the org chart view where the node is visible.
    navigate('/');
    onClose();
  };

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-[420px] flex-col border-l border-gray-200 bg-white shadow-xl"
      role="dialog"
      aria-label="Span of Control"
      data-testid="span-of-control-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-800">Span of Control</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close span of control panel"
          data-testid="span-of-control-close"
        >
          <X size={20} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 border-b border-gray-200 px-5 py-4">
        <SummaryTile
          label="Managers"
          value={summary.totalManagers}
          tone="neutral"
          testId="span-summary-total"
        />
        <SummaryTile
          label={`Overloaded (>${OVERLOAD_THRESHOLD})`}
          value={summary.overloadedCount}
          tone="red"
          testId="span-summary-overloaded"
        />
        <SummaryTile
          label={`Underutilized (<${UNDERUTILIZATION_THRESHOLD})`}
          value={summary.underutilizedCount}
          tone="amber"
          testId="span-summary-underutilized"
        />
      </div>

      {/* Manager list */}
      <div className="flex-1 overflow-y-auto px-5 py-4" data-testid="span-of-control-list">
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <ManagerRow key={row.employee._id} row={row} onSelect={handleNavigate} />
            ))}
          </ul>
        )}
      </div>

      {/* Footer help */}
      <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 text-[11px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <Info size={12} />
          <span>
            ICs excluded. Overloaded: &gt;{OVERLOAD_THRESHOLD} reports, Underutilized: &lt;
            {UNDERUTILIZATION_THRESHOLD}.
          </span>
        </div>
      </div>
    </div>
  );
}

interface ManagerRowProps {
  row: ManagerSpan;
  onSelect: (manager: Employee) => void;
}

function ManagerRow({ row, onSelect }: ManagerRowProps) {
  const styles = FLAG_STYLES[row.flag];
  const { Icon } = styles;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(row.employee)}
        className={cn(
          'group flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/60',
          styles.rowRing,
        )}
        data-testid={`span-row-${row.employee._id}`}
        data-flag={row.flag}
      >
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <span
            className={cn('flex h-7 w-7 items-center justify-center rounded-full text-white', styles.dotClass)}
            aria-hidden
          >
            <Icon size={14} />
          </span>
          <span
            className="text-xs font-semibold text-gray-700"
            data-testid={`span-row-count-${row.employee._id}`}
          >
            {row.reportCount}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">
              {row.employee.name}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                styles.badge,
              )}
              data-testid={`span-row-flag-${row.employee._id}`}
            >
              {styles.badgeLabel}
            </span>
          </div>
          <div className="truncate text-xs text-gray-500">
            {row.employee.title}
            {row.employee.department ? ` · ${row.employee.department}` : ''}
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            {row.reportCount} direct report{row.reportCount === 1 ? '' : 's'} · 1:
            {row.reportCount}
          </div>
          {row.recommendation && (
            <p
              className="mt-2 rounded-md bg-white/80 px-2 py-1.5 text-[11px] leading-snug text-gray-700 ring-1 ring-inset ring-gray-200"
              data-testid={`span-row-recommendation-${row.employee._id}`}
            >
              {row.recommendation}
            </p>
          )}
        </div>

        <ChevronRight
          size={16}
          className="mt-1 shrink-0 text-gray-300 transition-colors group-hover:text-blue-500"
          aria-hidden
        />
      </button>
    </li>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center"
      data-testid="span-of-control-empty"
    >
      <Users size={22} className="text-gray-400" />
      <p className="text-sm font-medium text-gray-700">No managers yet</p>
      <p className="text-xs text-gray-500">
        Assign reports to an employee to see span-of-control analytics here.
      </p>
    </div>
  );
}

interface SummaryTileProps {
  label: string;
  value: number;
  tone: 'neutral' | 'red' | 'amber';
  testId?: string;
}

function SummaryTile({ label, value, tone, testId }: SummaryTileProps) {
  const toneClass = {
    neutral: 'bg-gray-50 text-gray-700 ring-gray-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  }[tone];

  return (
    <div
      className={cn('rounded-md px-2 py-2 text-center ring-1 ring-inset', toneClass)}
      data-testid={testId}
    >
      <div className="text-xl font-semibold leading-tight">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}
