import { describe, it, expect } from 'vitest';
import {
  getDescendantIds,
  isDescendant,
  getSubtreeSize,
  hasDirectReports,
  getDirectReportCount,
} from '../utils/subtreeUtils';
import type { Employee } from '../types';

/* ------------------------------------------------------------------ */
/*  Test data helpers                                                  */
/* ------------------------------------------------------------------ */

function makeEmployee(
  id: string,
  name: string,
  managerId: string | null,
): Employee {
  return {
    _id: id,
    scenarioId: 'scenario-1',
    name,
    title: 'Test',
    department: 'Engineering',
    level: 'IC3',
    location: 'SF',
    employmentType: 'FTE',
    status: 'Active',
    managerId,
    order: 0,
  };
}

/*
 * Test hierarchy:
 *
 *   CEO (1)
 *   ├── VP-Eng (2)
 *   │   ├── Manager-A (3)
 *   │   │   ├── Eng-1 (4)
 *   │   │   └── Eng-2 (5)
 *   │   └── Manager-B (6)
 *   │       └── Eng-3 (7)
 *   └── VP-Sales (8)
 *       └── Sales-Rep (9)
 */
const employees: Employee[] = [
  makeEmployee('1', 'CEO', null),
  makeEmployee('2', 'VP-Eng', '1'),
  makeEmployee('3', 'Manager-A', '2'),
  makeEmployee('4', 'Eng-1', '3'),
  makeEmployee('5', 'Eng-2', '3'),
  makeEmployee('6', 'Manager-B', '2'),
  makeEmployee('7', 'Eng-3', '6'),
  makeEmployee('8', 'VP-Sales', '1'),
  makeEmployee('9', 'Sales-Rep', '8'),
];

/* ------------------------------------------------------------------ */
/*  getDescendantIds                                                   */
/* ------------------------------------------------------------------ */

describe('getDescendantIds', () => {
  it('returns all direct and indirect reports', () => {
    const descendants = getDescendantIds('2', employees);
    expect(descendants).toEqual(new Set(['3', '4', '5', '6', '7']));
  });

  it('returns empty set for leaf node', () => {
    const descendants = getDescendantIds('4', employees);
    expect(descendants.size).toBe(0);
  });

  it('returns full tree for root node', () => {
    const descendants = getDescendantIds('1', employees);
    expect(descendants).toEqual(new Set(['2', '3', '4', '5', '6', '7', '8', '9']));
  });

  it('returns only direct children if no grandchildren', () => {
    const descendants = getDescendantIds('8', employees);
    expect(descendants).toEqual(new Set(['9']));
  });
});

/* ------------------------------------------------------------------ */
/*  isDescendant                                                       */
/* ------------------------------------------------------------------ */

describe('isDescendant', () => {
  it('returns true for self-reference', () => {
    expect(isDescendant('2', '2', employees)).toBe(true);
  });

  it('returns true for a direct child', () => {
    expect(isDescendant('2', '3', employees)).toBe(true);
  });

  it('returns true for an indirect descendant', () => {
    expect(isDescendant('2', '4', employees)).toBe(true);
  });

  it('returns false for parent → child direction', () => {
    // VP-Eng (2) is NOT a descendant of Eng-1 (4)
    expect(isDescendant('4', '2', employees)).toBe(false);
  });

  it('returns false for unrelated nodes', () => {
    // Sales-Rep (9) is NOT a descendant of VP-Eng (2)
    expect(isDescendant('2', '9', employees)).toBe(false);
  });

  it('returns false for sibling nodes', () => {
    expect(isDescendant('3', '6', employees)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  getSubtreeSize                                                     */
/* ------------------------------------------------------------------ */

describe('getSubtreeSize', () => {
  it('returns 1 for leaf node (no children)', () => {
    expect(getSubtreeSize('4', employees)).toBe(1);
  });

  it('returns correct size for middle manager', () => {
    // Manager-A has Eng-1 and Eng-2 → size = 3
    expect(getSubtreeSize('3', employees)).toBe(3);
  });

  it('returns correct size for VP with nested reports', () => {
    // VP-Eng has Manager-A (with Eng-1, Eng-2), Manager-B (with Eng-3) → 6 total
    expect(getSubtreeSize('2', employees)).toBe(6);
  });

  it('returns 9 for root (entire org)', () => {
    expect(getSubtreeSize('1', employees)).toBe(9);
  });
});

/* ------------------------------------------------------------------ */
/*  hasDirectReports                                                   */
/* ------------------------------------------------------------------ */

describe('hasDirectReports', () => {
  it('returns true for a manager', () => {
    expect(hasDirectReports('2', employees)).toBe(true);
    expect(hasDirectReports('3', employees)).toBe(true);
  });

  it('returns false for a leaf node', () => {
    expect(hasDirectReports('4', employees)).toBe(false);
    expect(hasDirectReports('9', employees)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  getDirectReportCount                                               */
/* ------------------------------------------------------------------ */

describe('getDirectReportCount', () => {
  it('returns correct count for CEO (2 direct reports)', () => {
    expect(getDirectReportCount('1', employees)).toBe(2);
  });

  it('returns correct count for VP-Eng (2 direct reports)', () => {
    expect(getDirectReportCount('2', employees)).toBe(2);
  });

  it('returns 0 for leaf node', () => {
    expect(getDirectReportCount('4', employees)).toBe(0);
  });
});
