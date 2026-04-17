import type { Employee } from '@/types';

export interface HeadcountTrendPoint {
  /** ISO date string for the first day of the month (e.g. "2026-03-01"). */
  date: string;
  /** Short label for the x-axis (e.g. "Mar 26"). */
  label: string;
  /** Cumulative count of employees whose startDate is on or before `date`. */
  count: number;
}

export interface HiringVelocityPoint {
  /** ISO date string for the first day of the month. */
  date: string;
  /** Short label for the x-axis (e.g. "Mar 26"). */
  label: string;
  /** Number of new hires in that month. */
  count: number;
}

export interface BreakdownRow {
  /** Bucket label (e.g. department, level, or location). */
  name: string;
  /** Total compensation ($ salary + equity) in the bucket. */
  value: number;
  /** Headcount in the bucket. */
  headcount: number;
}

export interface EmploymentDistributionRow {
  /** Employment type label (FTE, Contractor, Intern). */
  name: string;
  /** Headcount for that type. */
  value: number;
}

export interface OpenPosition {
  _id: string;
  name: string;
  title: string;
  department: string;
  status: 'Open Req' | 'Backfill';
}

export interface OpenPositionsSummary {
  openReqCount: number;
  backfillCount: number;
  total: number;
  list: OpenPosition[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatMonthLabel(date: Date): string {
  const month = MONTH_SHORT[date.getUTCMonth()];
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month} ${year}`;
}

function firstOfMonthISO(date: Date): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  ).toISOString();
}

function parseStartDate(employee: Employee): Date | null {
  if (!employee.startDate) return null;
  const d = new Date(employee.startDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonths(date: Date, n: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
}

function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/* -------------------------------------------------------------------------- */
/*  Trends                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Returns a month-by-month cumulative headcount trend. Employees without a
 * startDate are counted at the earliest bucket so totals always match the
 * live roster size. The returned array is sorted chronologically. If `now` is
 * not provided, uses the current date.
 */
export function computeHeadcountTrend(
  employees: Employee[],
  months = 12,
  now: Date = new Date(),
): HeadcountTrendPoint[] {
  if (employees.length === 0) return [];

  // Determine the range: from (now - months + 1) through now, inclusive.
  const end = startOfMonthUTC(now);
  const start = addMonths(end, -(months - 1));

  // Parse startDates. Employees without a startDate are slotted at the start.
  const starts = employees.map((e) => parseStartDate(e));

  const points: HeadcountTrendPoint[] = [];
  for (let i = 0; i < months; i++) {
    const bucketStart = addMonths(start, i);
    // End-of-bucket is the first day of next month.
    const bucketEnd = addMonths(bucketStart, 1);
    const count = starts.reduce((acc, d) => {
      // Employees without startDate count throughout the range.
      if (!d) return acc + 1;
      return d.getTime() < bucketEnd.getTime() ? acc + 1 : acc;
    }, 0);
    points.push({
      date: firstOfMonthISO(bucketStart),
      label: formatMonthLabel(bucketStart),
      count,
    });
  }
  return points;
}

/**
 * Returns new hires per month (by startDate) over the most recent N months.
 * Employees without a startDate are ignored for velocity calculations.
 */
export function computeHiringVelocity(
  employees: Employee[],
  months = 12,
  now: Date = new Date(),
): HiringVelocityPoint[] {
  const end = startOfMonthUTC(now);
  const start = addMonths(end, -(months - 1));
  const buckets = new Map<string, number>();

  for (let i = 0; i < months; i++) {
    const bucket = addMonths(start, i);
    buckets.set(firstOfMonthISO(bucket), 0);
  }

  for (const emp of employees) {
    const d = parseStartDate(emp);
    if (!d) continue;
    const bucketDate = startOfMonthUTC(d);
    // Skip hires outside our window.
    if (bucketDate.getTime() < start.getTime()) continue;
    if (bucketDate.getTime() > end.getTime()) continue;
    const key = firstOfMonthISO(bucketDate);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const points: HiringVelocityPoint[] = [];
  for (let i = 0; i < months; i++) {
    const bucket = addMonths(start, i);
    const key = firstOfMonthISO(bucket);
    points.push({
      date: key,
      label: formatMonthLabel(bucket),
      count: buckets.get(key) ?? 0,
    });
  }
  return points;
}

/* -------------------------------------------------------------------------- */
/*  Breakdowns                                                                */
/* -------------------------------------------------------------------------- */

function totalComp(emp: Employee): number {
  return (emp.salary ?? 0) + (emp.equity ?? 0);
}

export type BreakdownDimension = 'department' | 'level' | 'location';

/**
 * Groups employees by the selected dimension, aggregating headcount and total
 * compensation. Sorted by value descending. Empty/missing labels are bucketed
 * under "Unassigned".
 */
export function computeCostBreakdown(
  employees: Employee[],
  dimension: BreakdownDimension,
): BreakdownRow[] {
  const map = new Map<string, { value: number; headcount: number }>();

  for (const emp of employees) {
    const raw = emp[dimension] as string | undefined;
    const key = raw && raw.trim() ? raw : 'Unassigned';
    const entry = map.get(key) ?? { value: 0, headcount: 0 };
    entry.value += totalComp(emp);
    entry.headcount += 1;
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([name, v]) => ({ name, value: v.value, headcount: v.headcount }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Counts employees by employmentType, always returning rows for the three
 * canonical types in a stable order (FTE → Contractor → Intern).
 */
export function computeEmploymentDistribution(
  employees: Employee[],
): EmploymentDistributionRow[] {
  const types: Employee['employmentType'][] = ['FTE', 'Contractor', 'Intern'];
  return types.map((name) => ({
    name,
    value: employees.filter((e) => e.employmentType === name).length,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Open positions                                                            */
/* -------------------------------------------------------------------------- */

export function computeOpenPositions(
  employees: Employee[],
): OpenPositionsSummary {
  const list: OpenPosition[] = employees
    .filter((e) => e.status === 'Open Req' || e.status === 'Backfill')
    .map((e) => ({
      _id: e._id,
      name: e.name,
      title: e.title,
      department: e.department,
      status: e.status as 'Open Req' | 'Backfill',
    }));

  const openReqCount = list.filter((p) => p.status === 'Open Req').length;
  const backfillCount = list.filter((p) => p.status === 'Backfill').length;
  return {
    openReqCount,
    backfillCount,
    total: list.length,
    list,
  };
}
