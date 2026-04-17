import type { Employee } from '@/types';

/**
 * Threshold above which a manager is considered *overloaded*
 * (i.e., has too many direct reports). Matches the product spec: >8.
 */
export const OVERLOAD_THRESHOLD = 8;

/**
 * Threshold below which a manager is considered *underutilized*
 * (i.e., has too few direct reports). Matches the product spec: <2.
 */
export const UNDERUTILIZATION_THRESHOLD = 2;

/** Possible span-of-control health classifications for a manager. */
export type SpanFlag = 'healthy' | 'overloaded' | 'underutilized';

/** Summary row for a single manager in the span-of-control analysis. */
export interface ManagerSpan {
  /** The manager employee. */
  employee: Employee;
  /** Number of direct reports (always >= 1 — ICs are excluded). */
  reportCount: number;
  /** Classification based on report count. */
  flag: SpanFlag;
  /** Recommendation text, if any (present for overloaded/underutilized). */
  recommendation?: string;
}

/**
 * Classify a direct report count into a span-of-control health flag.
 *
 * Rules (per feature spec):
 * - `> OVERLOAD_THRESHOLD` (i.e. > 8) → overloaded
 * - `< UNDERUTILIZATION_THRESHOLD` (i.e. < 2) → underutilized
 * - otherwise → healthy
 *
 * Note: this function is only meaningful for managers (count >= 1).
 * An IC with 0 reports is technically also `< 2`, but ICs are excluded
 * from the span-of-control analysis by `computeSpanOfControl`.
 */
export function getSpanFlag(reportCount: number): SpanFlag {
  if (reportCount > OVERLOAD_THRESHOLD) return 'overloaded';
  if (reportCount < UNDERUTILIZATION_THRESHOLD) return 'underutilized';
  return 'healthy';
}

/**
 * Generate a human-readable recommendation for a manager based on their
 * span-of-control flag. Returns `undefined` for healthy managers.
 */
export function getSpanRecommendation(
  reportCount: number,
  flag: SpanFlag = getSpanFlag(reportCount),
): string | undefined {
  if (flag === 'overloaded') {
    return `Consider splitting this team: ${reportCount} direct reports exceeds the healthy limit of ${OVERLOAD_THRESHOLD}. Promote a senior report to a team lead or redistribute reports across peer managers.`;
  }
  if (flag === 'underutilized') {
    if (reportCount === 1) {
      return `Only 1 direct report: consider consolidating under another manager or growing the team.`;
    }
    return `This manager has no direct reports. Consider moving them to an IC role or assigning reports.`;
  }
  return undefined;
}

/**
 * Count the direct reports for each employee. Returned as a plain object
 * keyed by employee id.
 */
export function countDirectReports(employees: Employee[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const emp of employees) {
    const managerId = emp.managerId ?? null;
    if (managerId) {
      counts[managerId] = (counts[managerId] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Compute span-of-control analytics for the given employee list.
 *
 * - Only employees who manage at least one other employee are included.
 * - Individual contributors (no reports) are excluded entirely.
 * - Results are sorted by `reportCount` descending (ties broken by name
 *   ascending for determinism).
 */
export function computeSpanOfControl(employees: Employee[]): ManagerSpan[] {
  const counts = countDirectReports(employees);
  const byId = new Map(employees.map((e) => [e._id, e]));

  const rows: ManagerSpan[] = [];
  for (const [managerId, reportCount] of Object.entries(counts)) {
    const employee = byId.get(managerId);
    // Skip "phantom" manager IDs that don't correspond to an employee in
    // the current list (e.g., dangling managerId after deletion).
    if (!employee) continue;
    if (reportCount <= 0) continue;

    const flag = getSpanFlag(reportCount);
    rows.push({
      employee,
      reportCount,
      flag,
      recommendation: getSpanRecommendation(reportCount, flag),
    });
  }

  rows.sort((a, b) => {
    if (b.reportCount !== a.reportCount) return b.reportCount - a.reportCount;
    return a.employee.name.localeCompare(b.employee.name);
  });

  return rows;
}

/**
 * Convenience helper: return the span flag for a single employee given
 * the full employee list. Returns `null` if the employee has no reports
 * (ICs are not part of the analysis).
 */
export function getEmployeeSpanFlag(
  employeeId: string,
  employees: Employee[],
): SpanFlag | null {
  const count = employees.reduce(
    (acc, emp) => (emp.managerId === employeeId ? acc + 1 : acc),
    0,
  );
  if (count === 0) return null;
  return getSpanFlag(count);
}

/** Counts for dashboard-style summaries. */
export interface SpanSummary {
  totalManagers: number;
  overloadedCount: number;
  underutilizedCount: number;
  healthyCount: number;
}

/** Aggregate counts across all managers. */
export function summarizeSpanOfControl(rows: ManagerSpan[]): SpanSummary {
  const summary: SpanSummary = {
    totalManagers: rows.length,
    overloadedCount: 0,
    underutilizedCount: 0,
    healthyCount: 0,
  };
  for (const row of rows) {
    if (row.flag === 'overloaded') summary.overloadedCount++;
    else if (row.flag === 'underutilized') summary.underutilizedCount++;
    else summary.healthyCount++;
  }
  return summary;
}
