import { describe, it, expect } from 'vitest';
import type { Employee } from '@/types';
import {
  computeSpanOfControl,
  countDirectReports,
  getSpanFlag,
  getSpanRecommendation,
  getEmployeeSpanFlag,
  summarizeSpanOfControl,
  OVERLOAD_THRESHOLD,
  UNDERUTILIZATION_THRESHOLD,
} from '@/utils/spanOfControl';

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  _id: 'emp-1',
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
  ...overrides,
});

/**
 * Build a simple manager with N reports. Returns [manager, ...reports].
 */
function managerWithReports(
  managerId: string,
  name: string,
  reportCount: number,
): Employee[] {
  const manager = makeEmployee({ _id: managerId, name });
  const reports: Employee[] = [];
  for (let i = 0; i < reportCount; i++) {
    reports.push(
      makeEmployee({
        _id: `${managerId}-r${i}`,
        name: `${name} Report ${i + 1}`,
        managerId,
      }),
    );
  }
  return [manager, ...reports];
}

describe('getSpanFlag', () => {
  it('returns "underutilized" for < 2 reports', () => {
    expect(getSpanFlag(0)).toBe('underutilized');
    expect(getSpanFlag(1)).toBe('underutilized');
  });

  it('returns "healthy" for 2..8 reports', () => {
    for (let i = 2; i <= OVERLOAD_THRESHOLD; i++) {
      expect(getSpanFlag(i)).toBe('healthy');
    }
  });

  it('returns "overloaded" for > 8 reports', () => {
    expect(getSpanFlag(OVERLOAD_THRESHOLD + 1)).toBe('overloaded');
    expect(getSpanFlag(20)).toBe('overloaded');
  });

  it('boundary: exactly the overload threshold is still healthy', () => {
    expect(getSpanFlag(OVERLOAD_THRESHOLD)).toBe('healthy');
  });

  it('boundary: exactly the underutilization threshold is healthy', () => {
    expect(getSpanFlag(UNDERUTILIZATION_THRESHOLD)).toBe('healthy');
  });
});

describe('getSpanRecommendation', () => {
  it('returns a split-team recommendation for overloaded managers', () => {
    const rec = getSpanRecommendation(10);
    expect(rec).toBeDefined();
    expect(rec?.toLowerCase()).toContain('split');
    expect(rec).toContain('10');
  });

  it('returns a consolidation recommendation for underutilized managers with 1 report', () => {
    const rec = getSpanRecommendation(1);
    expect(rec).toBeDefined();
    expect(rec?.toLowerCase()).toContain('consolidat');
  });

  it('returns undefined for healthy managers', () => {
    expect(getSpanRecommendation(3)).toBeUndefined();
    expect(getSpanRecommendation(OVERLOAD_THRESHOLD)).toBeUndefined();
  });
});

describe('countDirectReports', () => {
  it('returns an empty object when no one has a manager', () => {
    const employees = [makeEmployee({ _id: '1' })];
    expect(countDirectReports(employees)).toEqual({});
  });

  it('counts direct reports for each manager', () => {
    const employees = [
      makeEmployee({ _id: 'm1' }),
      makeEmployee({ _id: 'r1', managerId: 'm1' }),
      makeEmployee({ _id: 'r2', managerId: 'm1' }),
      makeEmployee({ _id: 'r3', managerId: 'm1' }),
      makeEmployee({ _id: 'm2' }),
      makeEmployee({ _id: 'r4', managerId: 'm2' }),
    ];
    expect(countDirectReports(employees)).toEqual({ m1: 3, m2: 1 });
  });

  it('treats null/undefined managerId as no manager', () => {
    const employees = [
      makeEmployee({ _id: 'a', managerId: null }),
      makeEmployee({ _id: 'b', managerId: undefined }),
    ];
    expect(countDirectReports(employees)).toEqual({});
  });
});

describe('computeSpanOfControl', () => {
  it('returns an empty list when there are no employees', () => {
    expect(computeSpanOfControl([])).toEqual([]);
  });

  it('excludes IC employees (those with 0 direct reports)', () => {
    const employees = [
      makeEmployee({ _id: 'ceo', name: 'CEO' }),
      makeEmployee({ _id: 'ic1', name: 'IC One', managerId: 'ceo' }),
      makeEmployee({ _id: 'ic2', name: 'IC Two', managerId: 'ceo' }),
    ];
    const rows = computeSpanOfControl(employees);
    expect(rows).toHaveLength(1);
    expect(rows[0].employee._id).toBe('ceo');
    // IC employees with no reports must not appear in the output.
    expect(rows.find((r) => r.employee._id === 'ic1')).toBeUndefined();
    expect(rows.find((r) => r.employee._id === 'ic2')).toBeUndefined();
  });

  it('sorts managers by report count descending, breaking ties by name asc', () => {
    const employees = [
      ...managerWithReports('big', 'Big Boss', 10),
      ...managerWithReports('alice', 'Alice', 3),
      ...managerWithReports('bob', 'Bob', 3),
      ...managerWithReports('zoe', 'Zoe', 5),
    ];
    const rows = computeSpanOfControl(employees);
    expect(rows.map((r) => r.employee._id)).toEqual(['big', 'zoe', 'alice', 'bob']);
  });

  it('flags managers with >8 reports as "overloaded" (red)', () => {
    const employees = managerWithReports('over', 'Overloaded', 9);
    const rows = computeSpanOfControl(employees);
    expect(rows).toHaveLength(1);
    expect(rows[0].reportCount).toBe(9);
    expect(rows[0].flag).toBe('overloaded');
    expect(rows[0].recommendation).toBeDefined();
    expect(rows[0].recommendation?.toLowerCase()).toContain('split');
  });

  it('flags managers with <2 reports as "underutilized" (yellow)', () => {
    const employees = managerWithReports('under', 'Underutilized', 1);
    const rows = computeSpanOfControl(employees);
    expect(rows).toHaveLength(1);
    expect(rows[0].reportCount).toBe(1);
    expect(rows[0].flag).toBe('underutilized');
    expect(rows[0].recommendation).toBeDefined();
  });

  it('flags managers with 2..8 reports as "healthy" with no recommendation', () => {
    const employees = managerWithReports('healthy', 'Healthy', 4);
    const rows = computeSpanOfControl(employees);
    expect(rows[0].flag).toBe('healthy');
    expect(rows[0].recommendation).toBeUndefined();
  });

  it('handles multi-level hierarchy: every manager counted only for *direct* reports', () => {
    // CEO → VP → Manager → IC × 3
    const employees = [
      makeEmployee({ _id: 'ceo', name: 'CEO' }),
      makeEmployee({ _id: 'vp', name: 'VP', managerId: 'ceo' }),
      makeEmployee({ _id: 'mgr', name: 'Manager', managerId: 'vp' }),
      makeEmployee({ _id: 'ic1', name: 'IC1', managerId: 'mgr' }),
      makeEmployee({ _id: 'ic2', name: 'IC2', managerId: 'mgr' }),
      makeEmployee({ _id: 'ic3', name: 'IC3', managerId: 'mgr' }),
    ];
    const rows = computeSpanOfControl(employees);
    const byId = Object.fromEntries(rows.map((r) => [r.employee._id, r.reportCount]));
    expect(byId).toEqual({ ceo: 1, vp: 1, mgr: 3 });
    // IC employees excluded
    expect(byId.ic1).toBeUndefined();
  });

  it('ignores managerId references that no longer exist in the employee list', () => {
    const employees = [
      makeEmployee({ _id: 'orphan', managerId: 'ghost-manager' }),
      makeEmployee({ _id: 'solo' }),
    ];
    const rows = computeSpanOfControl(employees);
    // "ghost-manager" is not in employees, so no row is emitted for it.
    // "solo" and "orphan" both have 0 direct reports → excluded.
    expect(rows).toEqual([]);
  });
});

describe('getEmployeeSpanFlag', () => {
  it('returns null for an IC (no reports)', () => {
    const employees = [makeEmployee({ _id: 'ic' })];
    expect(getEmployeeSpanFlag('ic', employees)).toBeNull();
  });

  it('returns "overloaded" when > 8 reports', () => {
    const employees = managerWithReports('m', 'Mgr', 9);
    expect(getEmployeeSpanFlag('m', employees)).toBe('overloaded');
  });

  it('returns "underutilized" when == 1 report', () => {
    const employees = managerWithReports('m', 'Mgr', 1);
    expect(getEmployeeSpanFlag('m', employees)).toBe('underutilized');
  });

  it('returns "healthy" within range', () => {
    const employees = managerWithReports('m', 'Mgr', 5);
    expect(getEmployeeSpanFlag('m', employees)).toBe('healthy');
  });
});

describe('summarizeSpanOfControl', () => {
  it('tallies overloaded / underutilized / healthy counts', () => {
    const employees = [
      ...managerWithReports('over', 'Over', 9), // overloaded
      ...managerWithReports('under', 'Under', 1), // underutilized
      ...managerWithReports('healthyA', 'Healthy A', 3), // healthy
      ...managerWithReports('healthyB', 'Healthy B', 5), // healthy
    ];
    const rows = computeSpanOfControl(employees);
    const summary = summarizeSpanOfControl(rows);
    expect(summary).toEqual({
      totalManagers: 4,
      overloadedCount: 1,
      underutilizedCount: 1,
      healthyCount: 2,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(summarizeSpanOfControl([])).toEqual({
      totalManagers: 0,
      overloadedCount: 0,
      underutilizedCount: 0,
      healthyCount: 0,
    });
  });
});
