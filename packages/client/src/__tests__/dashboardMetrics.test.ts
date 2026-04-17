import { describe, it, expect } from 'vitest';
import type { Employee } from '@/types';
import {
  computeHeadcountTrend,
  computeHiringVelocity,
  computeCostBreakdown,
  computeEmploymentDistribution,
  computeOpenPositions,
} from '@/utils/dashboardMetrics';

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    _id: 'emp-' + Math.random().toString(36).slice(2, 9),
    scenarioId: 'scen-1',
    name: 'Alice',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'NYC',
    employmentType: 'FTE',
    status: 'Active',
    order: 0,
    managerId: null,
    salary: 100_000,
    equity: 20_000,
    ...overrides,
  };
}

const NOW = new Date('2026-06-15T00:00:00Z');

describe('computeHeadcountTrend', () => {
  it('returns an empty array when there are no employees', () => {
    expect(computeHeadcountTrend([], 12, NOW)).toEqual([]);
  });

  it('returns N monthly points covering the trailing window', () => {
    const emp = makeEmployee({ startDate: '2025-01-01T00:00:00Z' });
    const trend = computeHeadcountTrend([emp], 12, NOW);
    expect(trend).toHaveLength(12);
    // Final bucket should be June 2026
    expect(trend[trend.length - 1].label).toBe('Jun 26');
    // First bucket should be July 2025 (12-month window ending June 2026)
    expect(trend[0].label).toBe('Jul 25');
  });

  it('accumulates headcount as employees start', () => {
    const employees: Employee[] = [
      makeEmployee({ _id: 'a', startDate: '2026-01-15T00:00:00Z' }),
      makeEmployee({ _id: 'b', startDate: '2026-03-10T00:00:00Z' }),
      makeEmployee({ _id: 'c', startDate: '2026-06-01T00:00:00Z' }),
    ];
    const trend = computeHeadcountTrend(employees, 12, NOW);
    // Find Jan 2026 — 1 employee by end of Jan
    const jan = trend.find((p) => p.label === 'Jan 26');
    const feb = trend.find((p) => p.label === 'Feb 26');
    const mar = trend.find((p) => p.label === 'Mar 26');
    const jun = trend.find((p) => p.label === 'Jun 26');
    expect(jan?.count).toBe(1);
    expect(feb?.count).toBe(1);
    expect(mar?.count).toBe(2);
    expect(jun?.count).toBe(3);
  });

  it('counts employees without a startDate in every bucket', () => {
    const employees: Employee[] = [
      makeEmployee({ _id: 'a', startDate: undefined }),
      makeEmployee({ _id: 'b', startDate: '2026-06-01T00:00:00Z' }),
    ];
    const trend = computeHeadcountTrend(employees, 6, NOW);
    // First point includes the undated employee already.
    expect(trend[0].count).toBe(1);
    // Last point includes both.
    expect(trend[trend.length - 1].count).toBe(2);
  });

  it('final point matches the total roster size', () => {
    const employees: Employee[] = [
      makeEmployee({ _id: 'a', startDate: '2025-01-01T00:00:00Z' }),
      makeEmployee({ _id: 'b', startDate: '2026-02-01T00:00:00Z' }),
      makeEmployee({ _id: 'c' }), // no startDate
    ];
    const trend = computeHeadcountTrend(employees, 12, NOW);
    expect(trend[trend.length - 1].count).toBe(employees.length);
  });
});

describe('computeHiringVelocity', () => {
  it('returns N monthly buckets with zero when no hires', () => {
    const velocity = computeHiringVelocity([], 6, NOW);
    expect(velocity).toHaveLength(6);
    expect(velocity.every((p) => p.count === 0)).toBe(true);
  });

  it('groups hires by start month', () => {
    const employees: Employee[] = [
      makeEmployee({ _id: 'a', startDate: '2026-05-10T00:00:00Z' }),
      makeEmployee({ _id: 'b', startDate: '2026-05-25T00:00:00Z' }),
      makeEmployee({ _id: 'c', startDate: '2026-06-02T00:00:00Z' }),
    ];
    const velocity = computeHiringVelocity(employees, 12, NOW);
    expect(velocity.find((p) => p.label === 'May 26')?.count).toBe(2);
    expect(velocity.find((p) => p.label === 'Jun 26')?.count).toBe(1);
    expect(velocity.find((p) => p.label === 'Apr 26')?.count).toBe(0);
  });

  it('ignores hires outside the window and those without a startDate', () => {
    const employees: Employee[] = [
      makeEmployee({ _id: 'old', startDate: '2024-01-15T00:00:00Z' }),
      makeEmployee({ _id: 'none', startDate: undefined }),
      makeEmployee({ _id: 'now', startDate: '2026-05-15T00:00:00Z' }),
    ];
    const velocity = computeHiringVelocity(employees, 12, NOW);
    const total = velocity.reduce((s, p) => s + p.count, 0);
    expect(total).toBe(1);
  });
});

describe('computeCostBreakdown', () => {
  it('groups by department and sums total comp (salary + equity)', () => {
    const employees: Employee[] = [
      makeEmployee({ department: 'Eng', salary: 100_000, equity: 10_000 }),
      makeEmployee({ department: 'Eng', salary: 150_000, equity: 20_000 }),
      makeEmployee({ department: 'Sales', salary: 90_000, equity: 5_000 }),
    ];
    const rows = computeCostBreakdown(employees, 'department');
    const eng = rows.find((r) => r.name === 'Eng');
    const sales = rows.find((r) => r.name === 'Sales');
    expect(eng?.value).toBe(280_000);
    expect(eng?.headcount).toBe(2);
    expect(sales?.value).toBe(95_000);
    expect(sales?.headcount).toBe(1);
  });

  it('sorts buckets by total comp descending', () => {
    const employees: Employee[] = [
      makeEmployee({ department: 'A', salary: 100, equity: 0 }),
      makeEmployee({ department: 'B', salary: 300, equity: 0 }),
      makeEmployee({ department: 'C', salary: 200, equity: 0 }),
    ];
    const rows = computeCostBreakdown(employees, 'department');
    expect(rows.map((r) => r.name)).toEqual(['B', 'C', 'A']);
  });

  it('labels empty/missing bucket keys as Unassigned', () => {
    const employees: Employee[] = [
      makeEmployee({ department: '', salary: 50 }),
      makeEmployee({ department: 'Eng', salary: 100 }),
    ];
    const rows = computeCostBreakdown(employees, 'department');
    expect(rows.some((r) => r.name === 'Unassigned')).toBe(true);
  });

  it('can group by level and location', () => {
    const employees: Employee[] = [
      makeEmployee({ level: 'IC3', location: 'NYC', salary: 100 }),
      makeEmployee({ level: 'IC4', location: 'NYC', salary: 200 }),
    ];
    expect(computeCostBreakdown(employees, 'level').map((r) => r.name).sort())
      .toEqual(['IC3', 'IC4']);
    expect(computeCostBreakdown(employees, 'location').map((r) => r.name))
      .toEqual(['NYC']);
  });

  it('returns zero values when comp is undefined', () => {
    const employees: Employee[] = [
      makeEmployee({ department: 'Eng', salary: undefined, equity: undefined }),
    ];
    const rows = computeCostBreakdown(employees, 'department');
    expect(rows[0].value).toBe(0);
    expect(rows[0].headcount).toBe(1);
  });
});

describe('computeEmploymentDistribution', () => {
  it('always returns FTE, Contractor, Intern in that order', () => {
    const rows = computeEmploymentDistribution([]);
    expect(rows.map((r) => r.name)).toEqual(['FTE', 'Contractor', 'Intern']);
    expect(rows.every((r) => r.value === 0)).toBe(true);
  });

  it('counts each employment type accurately', () => {
    const employees: Employee[] = [
      makeEmployee({ employmentType: 'FTE' }),
      makeEmployee({ employmentType: 'FTE' }),
      makeEmployee({ employmentType: 'Contractor' }),
      makeEmployee({ employmentType: 'Intern' }),
    ];
    const rows = computeEmploymentDistribution(employees);
    expect(rows.find((r) => r.name === 'FTE')?.value).toBe(2);
    expect(rows.find((r) => r.name === 'Contractor')?.value).toBe(1);
    expect(rows.find((r) => r.name === 'Intern')?.value).toBe(1);
  });
});

describe('computeOpenPositions', () => {
  it('returns zero counts when no open positions exist', () => {
    const employees: Employee[] = [
      makeEmployee({ status: 'Active' }),
      makeEmployee({ status: 'Planned' }),
    ];
    const result = computeOpenPositions(employees);
    expect(result.openReqCount).toBe(0);
    expect(result.backfillCount).toBe(0);
    expect(result.total).toBe(0);
    expect(result.list).toEqual([]);
  });

  it('separates Open Req and Backfill counts and lists them together', () => {
    const employees: Employee[] = [
      makeEmployee({ _id: 'o1', name: 'Req One', status: 'Open Req' }),
      makeEmployee({ _id: 'o2', name: 'Req Two', status: 'Open Req' }),
      makeEmployee({ _id: 'b1', name: 'BF One', status: 'Backfill' }),
      makeEmployee({ _id: 'a1', name: 'Active', status: 'Active' }),
    ];
    const result = computeOpenPositions(employees);
    expect(result.openReqCount).toBe(2);
    expect(result.backfillCount).toBe(1);
    expect(result.total).toBe(3);
    expect(result.list.map((p) => p._id).sort()).toEqual(['b1', 'o1', 'o2']);
  });
});
