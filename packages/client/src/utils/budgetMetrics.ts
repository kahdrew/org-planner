import type {
  BudgetEnvelope,
  BudgetStatus,
  BudgetSummary,
  DepartmentBudgetSummary,
  Employee,
  HeadcountRequest,
} from '@/types';

/** Compensation used for budget math: salary + equity. */
export function totalComp(emp: Employee): number {
  return (emp.salary ?? 0) + (emp.equity ?? 0);
}

/** Warning threshold (percentage of budget). */
export const WARNING_THRESHOLD_PCT = 80;
/** Exceeded threshold (percentage of budget). */
export const EXCEEDED_THRESHOLD_PCT = 100;

/**
 * Classify the current usage against a cap.
 * - Returns 'exceeded' if >= 100%
 * - Returns 'warning' if >= 80%
 * - Returns 'under' otherwise
 * - Returns null when there is no cap to compare against.
 */
export function classifyStatus(
  actual: number,
  cap: number | null | undefined,
): BudgetStatus | null {
  if (cap === null || cap === undefined) return null;
  if (cap === 0) {
    return actual > 0 ? 'exceeded' : 'under';
  }
  const pct = (actual / cap) * 100;
  if (pct >= EXCEEDED_THRESHOLD_PCT) return 'exceeded';
  if (pct >= WARNING_THRESHOLD_PCT) return 'warning';
  return 'under';
}

/**
 * Compute the incremental spend + headcount from a list of pending
 * headcount requests, grouped by normalized department name.
 *
 * - `new_hire` requests contribute full comp (salary + equity) and +1 HC.
 * - `comp_change` requests contribute the *delta* (new comp - current comp)
 *   and no HC change, using the target employee's current comp as baseline.
 *
 * Only `pending` requests are counted. Approved/rejected/changes_requested
 * requests are excluded — approved headcount shows up in `actualSpend`
 * once the employee record is created on final approval.
 */
export function computePendingByDept(
  pendingRequests: HeadcountRequest[],
  employees: Employee[],
): Map<string, { spend: number; headcount: number }> {
  const normalizeDept = (raw: unknown): string => {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed.length > 0 ? trimmed : 'Unassigned';
  };
  const byEmpId = new Map<string, Employee>();
  for (const e of employees) byEmpId.set(e._id, e);

  const result = new Map<string, { spend: number; headcount: number }>();
  for (const req of pendingRequests) {
    if (req.status !== 'pending') continue;
    const dept = normalizeDept(req.employeeData.department);
    const proposedSpend =
      (req.employeeData.salary ?? 0) + (req.employeeData.equity ?? 0);
    let addSpend: number;
    let addHc: number;
    if (req.requestType === 'comp_change') {
      const target = req.targetEmployeeId
        ? byEmpId.get(req.targetEmployeeId)
        : undefined;
      const currentSpend = target
        ? (target.salary ?? 0) + (target.equity ?? 0)
        : 0;
      addSpend = proposedSpend - currentSpend;
      addHc = 0;
    } else {
      addSpend = proposedSpend;
      addHc = 1;
    }
    const entry = result.get(dept) ?? { spend: 0, headcount: 0 };
    entry.spend += addSpend;
    entry.headcount += addHc;
    result.set(dept, entry);
  }
  return result;
}

/**
 * Compute a full department budget summary locally (mirrors server summary).
 * Useful for real-time updates — when an employee is added/edited/deleted we
 * can recompute immediately without a round-trip.
 *
 * If `pendingRequests` is provided, the summary will also populate
 * `plannedSpend`/`plannedHeadcount` per department and a
 * `projectedBudgetStatus` that reflects the state if all pending
 * requests were approved (VAL-BUDGET-004/007).
 */
export function computeBudgetSummary(
  envelopes: BudgetEnvelope[],
  employees: Employee[],
  pendingRequests: HeadcountRequest[] = [],
): BudgetSummary {
  // Normalize department keys (trim) so envelopes and actuals match even if
  // one side carries whitespace. Mirrors the server's `getBudgetSummary`.
  const normalizeDept = (raw: unknown): string => {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed.length > 0 ? trimmed : 'Unassigned';
  };

  const envelopeByDept = new Map<string, BudgetEnvelope>();
  for (const env of envelopes) {
    envelopeByDept.set(normalizeDept(env.department), env);
  }

  const actualsByDept = new Map<string, { spend: number; headcount: number }>();
  for (const emp of employees) {
    const dept = normalizeDept(emp.department);
    const entry = actualsByDept.get(dept) ?? { spend: 0, headcount: 0 };
    entry.spend += totalComp(emp);
    entry.headcount += 1;
    actualsByDept.set(dept, entry);
  }

  const pendingByDept = computePendingByDept(pendingRequests, employees);

  const allDepartments = new Set<string>([
    ...envelopeByDept.keys(),
    ...actualsByDept.keys(),
    ...pendingByDept.keys(),
  ]);

  const departments: DepartmentBudgetSummary[] = Array.from(allDepartments)
    .sort((a, b) => a.localeCompare(b))
    .map((department) => {
      const env = envelopeByDept.get(department);
      const actual = actualsByDept.get(department) ?? { spend: 0, headcount: 0 };
      const planned = pendingByDept.get(department) ?? {
        spend: 0,
        headcount: 0,
      };

      const totalBudget = env ? env.totalBudget : null;
      const headcountCap = env ? env.headcountCap : null;

      const remainingBudget =
        totalBudget === null ? null : totalBudget - actual.spend;
      const remainingHeadcount =
        headcountCap === null ? null : headcountCap - actual.headcount;

      const utilizationPct =
        totalBudget === null
          ? null
          : totalBudget === 0
            ? actual.spend > 0
              ? 100
              : 0
            : (actual.spend / totalBudget) * 100;

      const headcountUtilizationPct =
        headcountCap === null
          ? null
          : headcountCap === 0
            ? actual.headcount > 0
              ? 100
              : 0
            : (actual.headcount / headcountCap) * 100;

      return {
        department,
        envelopeId: env ? env._id : null,
        totalBudget,
        headcountCap,
        actualSpend: actual.spend,
        actualHeadcount: actual.headcount,
        plannedSpend: planned.spend,
        plannedHeadcount: planned.headcount,
        remainingBudget,
        remainingHeadcount,
        utilizationPct,
        headcountUtilizationPct,
        budgetStatus: classifyStatus(actual.spend, totalBudget),
        headcountStatus: classifyStatus(actual.headcount, headcountCap),
        projectedBudgetStatus: classifyStatus(
          actual.spend + planned.spend,
          totalBudget,
        ),
        projectedHeadcountStatus: classifyStatus(
          actual.headcount + planned.headcount,
          headcountCap,
        ),
      };
    });

  const totalBudget = envelopes.reduce((s, e) => s + e.totalBudget, 0);
  const headcountCap = envelopes.reduce((s, e) => s + e.headcountCap, 0);
  const actualSpend = departments.reduce((s, d) => s + d.actualSpend, 0);
  const actualHeadcount = departments.reduce((s, d) => s + d.actualHeadcount, 0);

  return {
    departments,
    totals: {
      totalBudget,
      headcountCap,
      actualSpend,
      actualHeadcount,
      remainingBudget: totalBudget - actualSpend,
      remainingHeadcount: headcountCap - actualHeadcount,
      utilizationPct:
        totalBudget === 0 ? null : (actualSpend / totalBudget) * 100,
      headcountUtilizationPct:
        headcountCap === 0 ? null : (actualHeadcount / headcountCap) * 100,
    },
  };
}

export interface ProjectionPoint {
  /** ISO string for the first day of the month. */
  date: string;
  /** Short label (e.g. "Mar 26"). */
  label: string;
  /** Projected compensation committed through that month. */
  projected: number;
  /** Actual/committed compensation for employees with startDate in or before this month. */
  committed: number;
  /** Incremental planned spend added in this month (Planned/Open Req). */
  plannedAdded: number;
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function formatMonthLabel(d: Date): string {
  return `${MONTH_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function parseStart(e: Employee): Date | null {
  if (!e.startDate) return null;
  const d = new Date(e.startDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Project future monthly spend based on current run rate and planned hires.
 *
 * - "Committed" spend is the sum of comp for employees already Active
 *   (including those without a startDate; we assume they are active now).
 * - Planned/Open Req/Backfill employees are added into the projection on
 *   their startDate month (or immediately if none provided).
 *
 * Returns one point per month for `months` months starting at the current
 * month.
 */
export function computeCostProjection(
  employees: Employee[],
  months = 12,
  now: Date = new Date(),
  department?: string,
): ProjectionPoint[] {
  const filtered = department
    ? employees.filter((e) => (e.department?.trim() || 'Unassigned') === department)
    : employees;

  const start = firstOfMonth(now);

  const committedBaseline = filtered
    .filter((e) => e.status === 'Active')
    .reduce((s, e) => s + totalComp(e), 0);

  const plannedAdditionsByMonthIdx = new Map<number, number>();

  for (const emp of filtered) {
    if (emp.status === 'Active') continue;
    if (emp.status !== 'Planned' && emp.status !== 'Open Req' && emp.status !== 'Backfill') {
      continue;
    }

    const comp = totalComp(emp);
    if (comp === 0) continue;

    const sd = parseStart(emp);
    let idx = 0;
    if (sd) {
      const empMonth = firstOfMonth(sd);
      idx = Math.max(
        0,
        (empMonth.getUTCFullYear() - start.getUTCFullYear()) * 12 +
          (empMonth.getUTCMonth() - start.getUTCMonth()),
      );
    }

    if (idx >= months) continue;
    plannedAdditionsByMonthIdx.set(
      idx,
      (plannedAdditionsByMonthIdx.get(idx) ?? 0) + comp,
    );
  }

  const points: ProjectionPoint[] = [];
  let runningProjected = committedBaseline;
  for (let i = 0; i < months; i++) {
    const bucket = addMonths(start, i);
    const added = plannedAdditionsByMonthIdx.get(i) ?? 0;
    runningProjected += added;
    points.push({
      date: bucket.toISOString(),
      label: formatMonthLabel(bucket),
      committed: committedBaseline,
      plannedAdded: added,
      projected: runningProjected,
    });
  }
  return points;
}
