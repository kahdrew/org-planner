import { describe, it, expect } from 'vitest';
import type { Employee } from '@/types';
import {
  getOverlayColor,
  gradientGreenToRed,
  getCategoricalColor,
  computeSalaryRange,
  computeTenureRange,
  buildOverlayContext,
  buildLegend,
  NEUTRAL_COLOR,
  EMPLOYMENT_TYPE_COLORS,
  STATUS_COLORS,
} from '@/utils/overlayColors';

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

describe('gradientGreenToRed', () => {
  it('returns green-ish at t=0', () => {
    const color = gradientGreenToRed(0);
    // Green #22c55e → starts with 22
    expect(color.toLowerCase()).toBe('#22c55e');
  });

  it('returns red-ish at t=1', () => {
    const color = gradientGreenToRed(1);
    expect(color.toLowerCase()).toBe('#ef4444');
  });

  it('returns a mid-range color at t=0.5', () => {
    const color = gradientGreenToRed(0.5);
    expect(color.toLowerCase()).toBe('#f59e0b');
  });

  it('clamps values below 0 to the green end', () => {
    expect(gradientGreenToRed(-1).toLowerCase()).toBe('#22c55e');
  });

  it('clamps values above 1 to the red end', () => {
    expect(gradientGreenToRed(2).toLowerCase()).toBe('#ef4444');
  });
});

describe('getCategoricalColor', () => {
  it('returns the same color for the same input', () => {
    expect(getCategoricalColor('Engineering')).toBe(getCategoricalColor('Engineering'));
  });

  it('returns different colors for different inputs', () => {
    const a = getCategoricalColor('Engineering');
    const b = getCategoricalColor('Sales');
    const c = getCategoricalColor('Design');
    // Not all three should collide (palette has 12 colors)
    const unique = new Set([a, b, c]);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('returns neutral color for empty string', () => {
    expect(getCategoricalColor('')).toBe(NEUTRAL_COLOR);
  });
});

describe('computeSalaryRange', () => {
  it('returns null when no employee has a salary', () => {
    const employees = [
      makeEmployee({ _id: '1', salary: undefined }),
      makeEmployee({ _id: '2', salary: undefined }),
    ];
    expect(computeSalaryRange(employees)).toBeNull();
  });

  it('returns min/max across employees with salaries', () => {
    const employees = [
      makeEmployee({ _id: '1', salary: 100000 }),
      makeEmployee({ _id: '2', salary: 200000 }),
      makeEmployee({ _id: '3', salary: 150000 }),
      makeEmployee({ _id: '4', salary: undefined }),
    ];
    expect(computeSalaryRange(employees)).toEqual({ min: 100000, max: 200000 });
  });
});

describe('computeTenureRange', () => {
  it('returns null when no employee has a startDate', () => {
    const employees = [makeEmployee({ startDate: undefined })];
    expect(computeTenureRange(employees)).toBeNull();
  });

  it('computes days between startDate and now', () => {
    const now = new Date('2026-01-11T00:00:00Z');
    const employees = [
      makeEmployee({ _id: '1', startDate: '2026-01-01T00:00:00Z' }), // 10 days
      makeEmployee({ _id: '2', startDate: '2025-12-02T00:00:00Z' }), // 40 days
    ];
    const range = computeTenureRange(employees, now);
    expect(range).not.toBeNull();
    expect(Math.round(range!.minDays)).toBe(10);
    expect(Math.round(range!.maxDays)).toBe(40);
  });

  it('ignores invalid startDate strings', () => {
    const employees = [
      makeEmployee({ _id: '1', startDate: 'not-a-date' }),
      makeEmployee({ _id: '2', startDate: '2026-01-01T00:00:00Z' }),
    ];
    const range = computeTenureRange(employees, new Date('2026-01-11T00:00:00Z'));
    expect(range).not.toBeNull();
    expect(Math.round(range!.minDays)).toBe(10);
    expect(Math.round(range!.maxDays)).toBe(10);
  });
});

describe('getOverlayColor', () => {
  const now = new Date('2026-01-11T00:00:00Z');
  const employees = [
    makeEmployee({ _id: '1', salary: 100000, startDate: '2025-01-11T00:00:00Z', department: 'Eng', employmentType: 'FTE', status: 'Active' }),
    makeEmployee({ _id: '2', salary: 200000, startDate: '2025-07-11T00:00:00Z', department: 'Sales', employmentType: 'Contractor', status: 'Planned' }),
    makeEmployee({ _id: '3', salary: 150000, startDate: '2025-04-11T00:00:00Z', department: 'Eng', employmentType: 'Intern', status: 'Open Req' }),
  ];
  const context = buildOverlayContext(employees, now);

  it('returns neutral color when mode is "none"', () => {
    const result = getOverlayColor(employees[0], 'none', context);
    expect(result.color).toBe(NEUTRAL_COLOR);
    expect(result.isNeutral).toBe(true);
  });

  describe('salary mode', () => {
    it('returns the green end for the lowest salary', () => {
      const result = getOverlayColor(employees[0], 'salary', context);
      expect(result.color.toLowerCase()).toBe('#22c55e');
      expect(result.isNeutral).toBe(false);
    });

    it('returns the red end for the highest salary', () => {
      const result = getOverlayColor(employees[1], 'salary', context);
      expect(result.color.toLowerCase()).toBe('#ef4444');
    });

    it('returns neutral color when salary is missing', () => {
      const emp = makeEmployee({ salary: undefined });
      const result = getOverlayColor(emp, 'salary', context);
      expect(result.color).toBe(NEUTRAL_COLOR);
      expect(result.isNeutral).toBe(true);
    });

    it('returns neutral color when context has no salary range', () => {
      const emp = makeEmployee({ salary: 100000 });
      const result = getOverlayColor(emp, 'salary', { salaryRange: null });
      expect(result.color).toBe(NEUTRAL_COLOR);
    });
  });

  describe('tenure mode', () => {
    it('returns neutral color when startDate is missing', () => {
      const emp = makeEmployee({ startDate: undefined });
      const result = getOverlayColor(emp, 'tenure', context);
      expect(result.color).toBe(NEUTRAL_COLOR);
      expect(result.isNeutral).toBe(true);
    });

    it('returns different colors for different tenures', () => {
      // Employee 0 has 365 days; employee 2 has ~275 days; employee 1 has ~184 days
      const longest = getOverlayColor(employees[0], 'tenure', context);
      const shortest = getOverlayColor(employees[1], 'tenure', context);
      expect(longest.color).not.toBe(shortest.color);
    });
  });

  describe('department mode', () => {
    it('same department → same color', () => {
      const a = getOverlayColor(employees[0], 'department', context);
      const c = getOverlayColor(employees[2], 'department', context);
      expect(a.color).toBe(c.color);
    });

    it('different departments → different colors (usually)', () => {
      const a = getOverlayColor(employees[0], 'department', context);
      const b = getOverlayColor(employees[1], 'department', context);
      expect(a.color).not.toBe(b.color);
    });

    it('returns neutral when department is missing', () => {
      const emp = makeEmployee({ department: '' });
      const result = getOverlayColor(emp, 'department', context);
      expect(result.color).toBe(NEUTRAL_COLOR);
    });
  });

  describe('employmentType mode', () => {
    it('returns a distinct color for each employment type', () => {
      const fte = getOverlayColor(makeEmployee({ employmentType: 'FTE' }), 'employmentType', context);
      const contractor = getOverlayColor(makeEmployee({ employmentType: 'Contractor' }), 'employmentType', context);
      const intern = getOverlayColor(makeEmployee({ employmentType: 'Intern' }), 'employmentType', context);
      expect(fte.color).toBe(EMPLOYMENT_TYPE_COLORS.FTE);
      expect(contractor.color).toBe(EMPLOYMENT_TYPE_COLORS.Contractor);
      expect(intern.color).toBe(EMPLOYMENT_TYPE_COLORS.Intern);
      expect(new Set([fte.color, contractor.color, intern.color]).size).toBe(3);
    });
  });

  describe('status mode', () => {
    it('returns a distinct color for each status', () => {
      const active = getOverlayColor(makeEmployee({ status: 'Active' }), 'status', context);
      const planned = getOverlayColor(makeEmployee({ status: 'Planned' }), 'status', context);
      const openReq = getOverlayColor(makeEmployee({ status: 'Open Req' }), 'status', context);
      const backfill = getOverlayColor(makeEmployee({ status: 'Backfill' }), 'status', context);
      expect(active.color).toBe(STATUS_COLORS.Active);
      expect(planned.color).toBe(STATUS_COLORS.Planned);
      expect(openReq.color).toBe(STATUS_COLORS['Open Req']);
      expect(backfill.color).toBe(STATUS_COLORS.Backfill);
      expect(new Set([active.color, planned.color, openReq.color, backfill.color]).size).toBe(4);
    });
  });
});

describe('buildLegend', () => {
  const employees = [
    makeEmployee({ _id: '1', salary: 100000, department: 'Eng', employmentType: 'FTE', status: 'Active' }),
    makeEmployee({ _id: '2', salary: 200000, department: 'Sales', employmentType: 'Contractor', status: 'Planned' }),
  ];

  it('returns type "none" for mode none', () => {
    expect(buildLegend('none', employees)).toEqual({ type: 'none' });
  });

  it('returns a gradient legend for salary', () => {
    const legend = buildLegend('salary', employees);
    expect(legend.type).toBe('gradient');
    if (legend.type === 'gradient') {
      expect(legend.minLabel).toContain('$100,000');
      expect(legend.maxLabel).toContain('$200,000');
      expect(legend.stops.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns "No data" gradient labels when no salary exists', () => {
    const empty = [makeEmployee({ salary: undefined })];
    const legend = buildLegend('salary', empty);
    if (legend.type === 'gradient') {
      expect(legend.minLabel).toBe('No data');
      expect(legend.maxLabel).toBe('No data');
    } else {
      throw new Error('Expected gradient legend');
    }
  });

  it('returns a categorical legend for department with one entry per department', () => {
    const legend = buildLegend('department', employees);
    expect(legend.type).toBe('categorical');
    if (legend.type === 'categorical') {
      expect(legend.entries).toHaveLength(2);
      expect(legend.entries.map((e) => e.label).sort()).toEqual(['Eng', 'Sales']);
    }
  });

  it('returns a fixed categorical legend for employment type', () => {
    const legend = buildLegend('employmentType', employees);
    if (legend.type === 'categorical') {
      expect(legend.entries.map((e) => e.label)).toEqual(['FTE', 'Contractor', 'Intern']);
    } else {
      throw new Error('Expected categorical legend');
    }
  });

  it('returns a fixed categorical legend for status', () => {
    const legend = buildLegend('status', employees);
    if (legend.type === 'categorical') {
      expect(legend.entries.map((e) => e.label)).toEqual(['Active', 'Planned', 'Open Req', 'Backfill']);
    } else {
      throw new Error('Expected categorical legend');
    }
  });
});
