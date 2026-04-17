import { useMemo } from 'react';
import { AlertTriangle, DollarSign } from 'lucide-react';
import type { BudgetEnvelope, Employee } from '@/types';
import { cn } from '@/utils/cn';
import { classifyStatus, computeBudgetSummary } from '@/utils/budgetMetrics';

interface BudgetImpactCardProps {
  /** Department name to show budget impact for. */
  department: string;
  /** Employees in the scenario (used to compute current spend). */
  employees: Employee[];
  /** Budget envelopes for the scenario (may be empty). */
  envelopes: BudgetEnvelope[];
  /**
   * Additional spend added by the pending change. For new hires this is
   * the projected total comp; for comp changes this is the delta (which
   * may be negative).
   */
  additionalCost: number;
  /** Optional additional headcount added (new hire = 1; comp change = 0). */
  additionalHeadcount?: number;
  /**
   * If provided, exclude this employee's current comp from the "current spend"
   * baseline (e.g. for an approver who wants to see spend excluding the
   * target). The HeadcountRequestDialog does NOT pass this for comp
   * changes — it applies the delta model instead.
   */
  excludeEmployeeId?: string | null;
  /** Rendering style — compact for dialogs, roomy for panels. */
  variant?: 'compact' | 'detailed';
  /** Optional classname for the outer container. */
  className?: string;
  /** Optional override title (defaults to "Budget Impact"). */
  title?: string;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function normalizeDept(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'Unassigned';
}

/**
 * Renders the projected budget impact of a pending headcount change on a
 * single department. Used in HeadcountRequestDialog (submitter view),
 * ApprovalsView RequestDetail (approver view), and anywhere else we
 * preview headcount changes.
 *
 * Displays: current dept spend, projected spend (with this change),
 * remaining budget, utilization %, and a warning/exceeded indicator.
 */
export default function BudgetImpactCard({
  department,
  employees,
  envelopes,
  additionalCost,
  additionalHeadcount = 1,
  excludeEmployeeId = null,
  variant = 'compact',
  className,
  title = 'Budget Impact',
}: BudgetImpactCardProps) {
  const normalized = normalizeDept(department);

  const {
    totalBudget,
    headcountCap,
    currentSpend,
    currentHeadcount,
    projectedSpend,
    projectedHeadcount,
    remainingAfter,
    remainingHeadcountAfter,
    projectedUtilizationPct,
    currentUtilizationPct,
    status,
    headcountStatus,
  } = useMemo(() => {
    const filtered = excludeEmployeeId
      ? employees.filter((e) => e._id !== excludeEmployeeId)
      : employees;
    const summary = computeBudgetSummary(envelopes, filtered);
    const dept = summary.departments.find((d) => d.department === normalized);
    const totalBudgetLocal = dept?.totalBudget ?? null;
    const headcountCapLocal = dept?.headcountCap ?? null;
    const currentSpendLocal = dept?.actualSpend ?? 0;
    const currentHeadcountLocal = dept?.actualHeadcount ?? 0;
    const projectedSpendLocal = currentSpendLocal + additionalCost;
    const projectedHeadcountLocal = currentHeadcountLocal + additionalHeadcount;
    const remainingAfterLocal =
      totalBudgetLocal === null ? null : totalBudgetLocal - projectedSpendLocal;
    const remainingHeadcountAfterLocal =
      headcountCapLocal === null
        ? null
        : headcountCapLocal - projectedHeadcountLocal;
    const projectedUtilizationLocal =
      totalBudgetLocal === null
        ? null
        : totalBudgetLocal === 0
          ? projectedSpendLocal > 0
            ? 100
            : 0
          : (projectedSpendLocal / totalBudgetLocal) * 100;
    const currentUtilizationLocal =
      totalBudgetLocal === null
        ? null
        : totalBudgetLocal === 0
          ? currentSpendLocal > 0
            ? 100
            : 0
          : (currentSpendLocal / totalBudgetLocal) * 100;
    const statusLocal = classifyStatus(projectedSpendLocal, totalBudgetLocal);
    const headcountStatusLocal = classifyStatus(
      projectedHeadcountLocal,
      headcountCapLocal,
    );
    return {
      totalBudget: totalBudgetLocal,
      headcountCap: headcountCapLocal,
      currentSpend: currentSpendLocal,
      currentHeadcount: currentHeadcountLocal,
      projectedSpend: projectedSpendLocal,
      projectedHeadcount: projectedHeadcountLocal,
      remainingAfter: remainingAfterLocal,
      remainingHeadcountAfter: remainingHeadcountAfterLocal,
      projectedUtilizationPct: projectedUtilizationLocal,
      currentUtilizationPct: currentUtilizationLocal,
      status: statusLocal,
      headcountStatus: headcountStatusLocal,
    };
  }, [
    envelopes,
    employees,
    normalized,
    additionalCost,
    additionalHeadcount,
    excludeEmployeeId,
  ]);

  const badgeColor =
    status === 'exceeded'
      ? 'border-red-300 bg-red-50 text-red-800'
      : status === 'warning'
        ? 'border-amber-300 bg-amber-50 text-amber-800'
        : 'border-gray-200 bg-gray-50 text-gray-700';

  const fmt = (n: number | null | undefined): string =>
    n === null || n === undefined ? '—' : currencyFormatter.format(n);

  const fmtPct = (n: number | null): string =>
    n === null ? '—' : `${n.toFixed(1)}%`;

  return (
    <div
      data-testid="budget-impact-card"
      className={cn(
        'rounded-md border p-3 text-xs',
        badgeColor,
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1 font-medium">
        <DollarSign size={12} /> {title}
        <span className="ml-auto text-[11px] font-normal text-gray-500">
          {normalized}
        </span>
      </div>
      {totalBudget === null ? (
        <div
          data-testid="budget-impact-no-envelope"
          className="text-[11px] text-gray-500"
        >
          No budget envelope set for this department.
          {variant === 'detailed' && (
            <div className="mt-1 text-gray-500">
              Projected additional cost:{' '}
              <span className="font-semibold">
                {currencyFormatter.format(additionalCost)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                Current Spend
              </div>
              <div
                className="font-semibold text-gray-900"
                data-testid="budget-impact-current"
              >
                {fmt(currentSpend)}
              </div>
              <div className="text-[11px] text-gray-500">
                of {fmt(totalBudget)} ({fmtPct(currentUtilizationPct)})
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                Projected (with change)
              </div>
              <div
                className={cn(
                  'font-semibold',
                  status === 'exceeded' && 'text-red-700',
                  status === 'warning' && 'text-amber-700',
                  !status || status === 'under' ? 'text-gray-900' : '',
                )}
                data-testid="budget-impact-projected"
              >
                {fmt(projectedSpend)}
              </div>
              <div className="text-[11px] text-gray-500">
                ({fmtPct(projectedUtilizationPct)})
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                Remaining After
              </div>
              <div
                className={cn(
                  'font-semibold',
                  remainingAfter !== null && remainingAfter < 0
                    ? 'text-red-700'
                    : 'text-gray-900',
                )}
                data-testid="budget-impact-remaining"
              >
                {fmt(remainingAfter)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                Headcount
              </div>
              <div
                className={cn(
                  'font-semibold',
                  headcountStatus === 'exceeded' && 'text-red-700',
                )}
                data-testid="budget-impact-headcount"
              >
                {projectedHeadcount}
                {headcountCap !== null ? ` / ${headcountCap}` : ''}
              </div>
              {remainingHeadcountAfter !== null && (
                <div className="text-[11px] text-gray-500">
                  {remainingHeadcountAfter >= 0
                    ? `${remainingHeadcountAfter} slot${remainingHeadcountAfter === 1 ? '' : 's'} remaining`
                    : `${-remainingHeadcountAfter} over cap`}
                </div>
              )}
            </div>
          </div>
          {(status === 'warning' ||
            status === 'exceeded' ||
            headcountStatus === 'exceeded') && (
            <div
              className={cn(
                'mt-2 flex items-start gap-1 rounded border px-2 py-1 text-[11px]',
                status === 'exceeded' || headcountStatus === 'exceeded'
                  ? 'border-red-300 bg-red-100 text-red-800'
                  : 'border-amber-300 bg-amber-100 text-amber-800',
              )}
              data-testid="budget-impact-warning"
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                {status === 'exceeded'
                  ? `This change puts the department over budget by ${currencyFormatter.format(-Math.min(0, remainingAfter ?? 0))}.`
                  : status === 'warning'
                    ? `This change will push utilization to ${fmtPct(projectedUtilizationPct)} — approaching cap.`
                    : `This change exceeds the headcount cap.`}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
