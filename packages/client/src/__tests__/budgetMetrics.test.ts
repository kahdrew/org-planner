import { describe, it, expect } from 'vitest';
import type { BudgetEnvelope, Employee } from '@/types';
import {
  classifyStatus,
  computeBudgetSummary,
  computeCostProjection,
  WARNING_THRESHOLD_PCT,
  EXCEEDED_THRESHOLD_PCT,
} from '@/utils/budgetMetrics';

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

function makeEnvelope(overrides: Partial<BudgetEnvelope> = {}): BudgetEnvelope {
  return {
    _id: 'env-' + Math.random().toString(36).slice(2, 9),
    orgId: 'org-1',
    scenarioId: 'scen-1',
    department: 'Engineering',
    totalBudget: 500_000,
    headcountCap: 10,
    createdBy: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('classifyStatus', () => {
  it('returns null when cap is null/undefined', () => {
    expect(classifyStatus(100, null)).toBeNull();
    expect(classifyStatus(0, undefined)).toBeNull();
  });

  it("returns 'under' below the warning threshold", () => {
    expect(classifyStatus(50, 100)).toBe('under');
    expect(classifyStatus(79.9, 100)).toBe('under');
  });

  it(`returns 'warning' at or above ${WARNING_THRESHOLD_PCT}% and below ${EXCEEDED_THRESHOLD_PCT}%`, () => {
    expect(classifyStatus(80, 100)).toBe('warning');
    expect(classifyStatus(95, 100)).toBe('warning');
  });

  it(`returns 'exceeded' at or above ${EXCEEDED_THRESHOLD_PCT}%`, () => {
    expect(classifyStatus(100, 100)).toBe('exceeded');
    expect(classifyStatus(125, 100)).toBe('exceeded');
  });

  it("handles a zero cap gracefully (any positive actual is exceeded)", () => {
    expect(classifyStatus(0, 0)).toBe('under');
    expect(classifyStatus(1, 0)).toBe('exceeded');
  });
});

describe('computeBudgetSummary', () => {
  it('returns empty departments when no data', () => {
    const summary = computeBudgetSummary([], []);
    expect(summary.departments).toEqual([]);
    expect(summary.totals.totalBudget).toBe(0);
    expect(summary.totals.actualSpend).toBe(0);
  });

  it('aggregates actuals by department and pairs with envelope', () => {
    const employees: Employee[] = [
      makeEmployee({ _id: 'a', salary: 150_000, equity: 50_000 }),
      makeEmployee({ _id: 'b', salary: 100_000, equity: 30_000 }),
      makeEmployee({
        _id: 'c',
        department: 'Sales',
        salary: 80_000,
        equity: 20_000,
      }),
    ];
    const envelopes: BudgetEnvelope[] = [
      makeEnvelope({ department: 'Engineering', totalBudget: 500_000, headcountCap: 5 }),
    ];

    const summary = computeBudgetSummary(envelopes, employees);
    const eng = summary.departments.find((d) => d.department === 'Engineering');
    expect(eng?.actualSpend).toBe(330_000); // 200k + 130k
    expect(eng?.actualHeadcount).toBe(2);
    expect(eng?.remainingBudget).toBe(170_000);
    expect(eng?.remainingHeadcount).toBe(3);
    expect(eng?.budgetStatus).toBe('under');

    const sales = summary.departments.find((d) => d.department === 'Sales');
    expect(sales?.totalBudget).toBeNull();
    expect(sales?.actualSpend).toBe(100_000);
    expect(sales?.budgetStatus).toBeNull();
  });

  it('flags warning when utilization crosses 80%', () => {
    const employees: Employee[] = [
      makeEmployee({ salary: 400_000, equity: 50_000 }), // 450k
    ];
    const envelopes = [
      makeEnvelope({ totalBudget: 500_000, headcountCap: 5 }),
    ];
    const summary = computeBudgetSummary(envelopes, employees);
    expect(summary.departments[0].budgetStatus).toBe('warning');
    expect(summary.departments[0].utilizationPct).toBe(90);
  });

  it('flags exceeded when actual spend meets or exceeds the budget', () => {
    const employees: Employee[] = [
      makeEmployee({ salary: 300_000, equity: 250_000 }), // 550k
    ];
    const envelopes = [
      makeEnvelope({ totalBudget: 500_000, headcountCap: 2 }),
    ];
    const summary = computeBudgetSummary(envelopes, employees);
    expect(summary.departments[0].budgetStatus).toBe('exceeded');
    expect(summary.departments[0].remainingBudget).toBeLessThan(0);
  });

  it('flags exceeded for headcount when actual >= cap', () => {
    const employees: Employee[] = Array.from({ length: 6 }, (_, i) =>
      makeEmployee({ _id: 'e' + i, salary: 10_000, equity: 0 }),
    );
    const envelopes = [
      makeEnvelope({ totalBudget: 10_000_000, headcountCap: 5 }),
    ];
    const summary = computeBudgetSummary(envelopes, employees);
    expect(summary.departments[0].headcountStatus).toBe('exceeded');
    expect(summary.departments[0].remainingHeadcount).toBe(-1);
  });

  it('includes unbudgeted departments (union of envelopes + employees)', () => {
    const employees: Employee[] = [
      makeEmployee({ department: 'Design' }),
    ];
    const envelopes: BudgetEnvelope[] = [
      makeEnvelope({ department: 'Engineering' }),
    ];
    const summary = computeBudgetSummary(envelopes, employees);
    expect(summary.departments.map((d) => d.department).sort()).toEqual([
      'Design',
      'Engineering',
    ]);
    // Engineering has envelope but no actuals → 0 spend, 0 headcount
    const eng = summary.departments.find((d) => d.department === 'Engineering');
    expect(eng?.actualSpend).toBe(0);
    expect(eng?.actualHeadcount).toBe(0);
    // Design has actuals but no envelope → null budget/cap
    const design = summary.departments.find((d) => d.department === 'Design');
    expect(design?.totalBudget).toBeNull();
  });

  it('buckets blank departments under "Unassigned"', () => {
    const employees: Employee[] = [makeEmployee({ department: '  ' })];
    const summary = computeBudgetSummary([], employees);
    expect(summary.departments[0].department).toBe('Unassigned');
  });

  it('computes org-wide utilization totals', () => {
    const employees: Employee[] = [
      makeEmployee({ department: 'A', salary: 100_000, equity: 0 }),
      makeEmployee({ department: 'B', salary: 200_000, equity: 0 }),
    ];
    const envelopes: BudgetEnvelope[] = [
      makeEnvelope({ department: 'A', totalBudget: 200_000, headcountCap: 2 }),
      makeEnvelope({ department: 'B', totalBudget: 200_000, headcountCap: 2 }),
    ];
    const summary = computeBudgetSummary(envelopes, employees);
    expect(summary.totals.totalBudget).toBe(400_000);
    expect(summary.totals.actualSpend).toBe(300_000);
    expect(summary.totals.utilizationPct).toBe(75);
  });
});

describe('computeCostProjection', () => {
  const NOW = new Date(Date.UTC(2026, 5, 1)); // June 1, 2026

  it('returns N monthly points starting at the current month', () => {
    const proj = computeCostProjection([], 12, NOW);
    expect(proj).toHaveLength(12);
    expect(proj[0].label).toBe('Jun 26');
    expect(proj[11].label).toBe('May 27');
  });

  it('treats Active employees as committed baseline throughout the horizon', () => {
    const employees: Employee[] = [
      makeEmployee({ salary: 100_000, equity: 20_000, status: 'Active' }),
    ];
    const proj = computeCostProjection(employees, 6, NOW);
    expect(proj[0].committed).toBe(120_000);
    expect(proj[5].committed).toBe(120_000);
    expect(proj[0].projected).toBe(120_000);
    expect(proj[5].projected).toBe(120_000);
  });

  it('adds Planned hires into the projection at their start month', () => {
    const employees: Employee[] = [
      makeEmployee({ _id: 'a', salary: 100_000, equity: 0, status: 'Active' }),
      makeEmployee({
        _id: 'b',
        salary: 150_000,
        equity: 0,
        status: 'Planned',
        startDate: '2026-08-15T00:00:00Z',
      }),
    ];
    const proj = computeCostProjection(employees, 12, NOW);
    // Jun/Jul 26 → only the 100k active
    expect(proj[0].projected).toBe(100_000);
    expect(proj[1].projected).toBe(100_000);
    // Aug 26 → 100k + 150k
    const aug = proj.find((p) => p.label === 'Aug 26');
    expect(aug?.projected).toBe(250_000);
    // Committed stays at 100k
    expect(aug?.committed).toBe(100_000);
    // plannedAdded is 150k in Aug
    expect(aug?.plannedAdded).toBe(150_000);
  });

  it('layers Open Req and Backfill hires without a startDate at month 0', () => {
    const employees: Employee[] = [
      makeEmployee({ salary: 80_000, equity: 0, status: 'Active' }),
      makeEmployee({
        _id: 'b',
        salary: 120_000,
        equity: 0,
        status: 'Open Req',
      }),
    ];
    const proj = computeCostProjection(employees, 3, NOW);
    expect(proj[0].projected).toBe(200_000);
  });

  it('filters by department when provided', () => {
    const employees: Employee[] = [
      makeEmployee({ department: 'Eng', salary: 100_000, equity: 0 }),
      makeEmployee({ department: 'Sales', salary: 200_000, equity: 0 }),
    ];
    const proj = computeCostProjection(employees, 3, NOW, 'Eng');
    expect(proj[0].projected).toBe(100_000);
  });

  it('ignores planned hires whose start date falls outside the horizon', () => {
    const employees: Employee[] = [
      makeEmployee({
        _id: 'b',
        status: 'Planned',
        salary: 1_000_000,
        startDate: '2030-01-01',
      }),
    ];
    const proj = computeCostProjection(employees, 12, NOW);
    expect(proj[proj.length - 1].projected).toBe(0);
  });
});
