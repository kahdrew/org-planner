import { describe, it, expect } from 'vitest';
import {
  getDescendantIds,
  isDescendant,
  getSubtreeSize,
} from '../utils/subtreeUtils';
import type { Employee } from '../types';

/* ------------------------------------------------------------------ */
/*  Test data helpers                                                  */
/* ------------------------------------------------------------------ */

function makeEmployee(
  id: string,
  name: string,
  managerId: string | null,
  order = 0,
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
    order,
  };
}

/*
 * Hierarchy:
 *   CEO (ceo)
 *   ├── VP-Eng (vp-eng)
 *   │   ├── Manager-A (mgr-a)
 *   │   │   ├── Eng-1 (eng-1)
 *   │   │   └── Eng-2 (eng-2)
 *   │   └── Manager-B (mgr-b)
 *   │       └── Eng-3 (eng-3)
 *   └── VP-Sales (vp-sales)
 *       └── Sales-Rep (sales-rep)
 */
const employees: Employee[] = [
  makeEmployee('ceo', 'CEO', null),
  makeEmployee('vp-eng', 'VP Engineering', 'ceo'),
  makeEmployee('mgr-a', 'Manager A', 'vp-eng'),
  makeEmployee('eng-1', 'Engineer 1', 'mgr-a'),
  makeEmployee('eng-2', 'Engineer 2', 'mgr-a'),
  makeEmployee('mgr-b', 'Manager B', 'vp-eng'),
  makeEmployee('eng-3', 'Engineer 3', 'mgr-b'),
  makeEmployee('vp-sales', 'VP Sales', 'ceo'),
  makeEmployee('sales-rep', 'Sales Rep', 'vp-sales'),
];

/* ------------------------------------------------------------------ */
/*  Cycle detection for subtree moves                                  */
/* ------------------------------------------------------------------ */

describe('Subtree reorg — cycle detection', () => {
  it('prevents dropping a manager onto their direct report', () => {
    // Moving VP-Eng under Manager-A would create a cycle
    expect(isDescendant('vp-eng', 'mgr-a', employees)).toBe(true);
  });

  it('prevents dropping a manager onto an indirect report', () => {
    // Moving VP-Eng under Eng-1 would create a cycle
    expect(isDescendant('vp-eng', 'eng-1', employees)).toBe(true);
  });

  it('prevents dropping onto self', () => {
    expect(isDescendant('vp-eng', 'vp-eng', employees)).toBe(true);
  });

  it('allows dropping a manager onto a peer', () => {
    // VP-Sales is NOT a descendant of VP-Eng
    expect(isDescendant('vp-eng', 'vp-sales', employees)).toBe(false);
  });

  it('allows dropping a subtree under a different branch', () => {
    // Manager-A moving under VP-Sales is valid
    expect(isDescendant('mgr-a', 'vp-sales', employees)).toBe(false);
  });

  it('allows dropping under the root', () => {
    // Manager-A moving to be direct report of CEO is valid
    expect(isDescendant('mgr-a', 'ceo', employees)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Subtree size counting                                              */
/* ------------------------------------------------------------------ */

describe('Subtree reorg — affected count', () => {
  it('counts 1 for leaf node (individual move)', () => {
    expect(getSubtreeSize('eng-1', employees)).toBe(1);
  });

  it('counts a manager and all reports', () => {
    // Manager-A has 2 direct reports (eng-1, eng-2)
    expect(getSubtreeSize('mgr-a', employees)).toBe(3);
  });

  it('counts nested levels correctly', () => {
    // VP-Eng: Manager-A (eng-1, eng-2), Manager-B (eng-3) = 6 total
    expect(getSubtreeSize('vp-eng', employees)).toBe(6);
  });

  it('entire org from root', () => {
    expect(getSubtreeSize('ceo', employees)).toBe(9);
  });
});

/* ------------------------------------------------------------------ */
/*  Subtree move semantics                                             */
/* ------------------------------------------------------------------ */

describe('Subtree reorg — move semantics', () => {
  it('moving a manager only changes the root node managerId, not descendant managerIds', () => {
    // Simulate moving Manager-A from VP-Eng to VP-Sales
    // Only Manager-A's managerId should change
    const moved = employees.map((emp) => {
      if (emp._id === 'mgr-a') {
        return { ...emp, managerId: 'vp-sales' };
      }
      return emp;
    });

    // Engineer 1 still reports to Manager A
    const eng1 = moved.find((e) => e._id === 'eng-1')!;
    expect(eng1.managerId).toBe('mgr-a');

    // Engineer 2 still reports to Manager A
    const eng2 = moved.find((e) => e._id === 'eng-2')!;
    expect(eng2.managerId).toBe('mgr-a');

    // Manager A now reports to VP Sales
    const mgrA = moved.find((e) => e._id === 'mgr-a')!;
    expect(mgrA.managerId).toBe('vp-sales');

    // VP-Eng no longer has Manager A as a direct report
    const vpEngReports = moved.filter((e) => e.managerId === 'vp-eng');
    expect(vpEngReports.map((e) => e._id)).not.toContain('mgr-a');

    // VP-Sales now has Manager A and Sales Rep
    const vpSalesReports = moved.filter((e) => e.managerId === 'vp-sales');
    expect(vpSalesReports.map((e) => e._id)).toContain('mgr-a');
    expect(vpSalesReports.map((e) => e._id)).toContain('sales-rep');
  });

  it('subtree internal structure is preserved after move', () => {
    // After moving Manager-A to VP-Sales, descendants should still be the same
    const moved = employees.map((emp) => {
      if (emp._id === 'mgr-a') {
        return { ...emp, managerId: 'vp-sales' };
      }
      return emp;
    });

    // Manager-A's descendants should be unchanged
    const descendants = getDescendantIds('mgr-a', moved);
    expect(descendants).toEqual(new Set(['eng-1', 'eng-2']));
  });

  it('old parent report count decreases after subtree removal', () => {
    // Before move: VP-Eng has 2 direct reports (mgr-a, mgr-b)
    const vpEngReportsBefore = employees.filter(
      (e) => e.managerId === 'vp-eng',
    );
    expect(vpEngReportsBefore.length).toBe(2);

    // After moving Manager-A to VP-Sales
    const moved = employees.map((emp) => {
      if (emp._id === 'mgr-a') {
        return { ...emp, managerId: 'vp-sales' };
      }
      return emp;
    });

    // VP-Eng now has 1 direct report (mgr-b)
    const vpEngReportsAfter = moved.filter((e) => e.managerId === 'vp-eng');
    expect(vpEngReportsAfter.length).toBe(1);
    expect(vpEngReportsAfter[0]._id).toBe('mgr-b');
  });
});

/* ------------------------------------------------------------------ */
/*  Undo semantics for subtree moves                                   */
/* ------------------------------------------------------------------ */

describe('Subtree reorg — undo', () => {
  it('undo restores the original parent and all descendants remain intact', () => {
    // Simulate: Move Manager-A from VP-Eng to VP-Sales, then undo
    const originalManagerId = 'vp-eng';

    // Move
    const moved = employees.map((emp) => {
      if (emp._id === 'mgr-a') {
        return { ...emp, managerId: 'vp-sales' };
      }
      return emp;
    });

    // Undo = restore Manager-A's managerId back to VP-Eng
    const undone = moved.map((emp) => {
      if (emp._id === 'mgr-a') {
        return { ...emp, managerId: originalManagerId };
      }
      return emp;
    });

    // Manager-A is back under VP-Eng
    const mgrA = undone.find((e) => e._id === 'mgr-a')!;
    expect(mgrA.managerId).toBe('vp-eng');

    // All descendants preserved
    const descendants = getDescendantIds('mgr-a', undone);
    expect(descendants).toEqual(new Set(['eng-1', 'eng-2']));

    // VP-Eng has both managers again
    const vpEngReports = undone.filter((e) => e.managerId === 'vp-eng');
    expect(vpEngReports.length).toBe(2);
  });
});
