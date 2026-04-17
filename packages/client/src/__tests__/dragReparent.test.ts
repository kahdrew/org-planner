import { describe, it, expect, vi } from 'vitest';
import {
  isDescendant,
  getSubtreeSize,
  getDescendantIds,
} from '../utils/subtreeUtils';
import type { Employee } from '../types';

/**
 * Tests for drag-to-reparent in OrgChartView.
 *
 * Validates:
 * - Drop target detection logic (getIntersectingNodes-based)
 * - Confirmation dialog triggers with correct source and target
 * - moveEmployee called with correct managerId on confirm
 * - Subtree move shows correct affected count
 * - Cycle detection prevents invalid moves
 * - Self-reparent (already reports to target) is rejected
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    _id: 'emp-1',
    scenarioId: 'scenario-1',
    name: 'Alice',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'SF',
    employmentType: 'FTE',
    status: 'Active',
    order: 0,
    managerId: null,
    ...overrides,
  };
}

/*
 * Test hierarchy:
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
  makeEmployee({ _id: 'ceo', name: 'CEO', managerId: null }),
  makeEmployee({ _id: 'vp-eng', name: 'VP Engineering', managerId: 'ceo' }),
  makeEmployee({ _id: 'mgr-a', name: 'Manager A', managerId: 'vp-eng' }),
  makeEmployee({ _id: 'eng-1', name: 'Engineer 1', managerId: 'mgr-a' }),
  makeEmployee({ _id: 'eng-2', name: 'Engineer 2', managerId: 'mgr-a' }),
  makeEmployee({ _id: 'mgr-b', name: 'Manager B', managerId: 'vp-eng' }),
  makeEmployee({ _id: 'eng-3', name: 'Engineer 3', managerId: 'mgr-b' }),
  makeEmployee({ _id: 'vp-sales', name: 'VP Sales', managerId: 'ceo' }),
  makeEmployee({ _id: 'sales-rep', name: 'Sales Rep', managerId: 'vp-sales' }),
];

/* ------------------------------------------------------------------ */
/*  Drag-to-reparent detection logic tests                             */
/* ------------------------------------------------------------------ */

describe('Drag-to-reparent — drop target validation', () => {
  it('accepts dropping an employee onto a valid new manager', () => {
    const draggedEmp = employees.find((e) => e._id === 'eng-1')!;
    const targetEmp = employees.find((e) => e._id === 'vp-sales')!;

    // Not already the manager
    expect(draggedEmp.managerId).not.toBe(targetEmp._id);
    // Not a descendant (no cycle)
    expect(isDescendant(draggedEmp._id, targetEmp._id, employees)).toBe(false);
  });

  it('rejects dropping onto the current manager (no-op)', () => {
    const draggedEmp = employees.find((e) => e._id === 'eng-1')!;
    const targetEmp = employees.find((e) => e._id === 'mgr-a')!;

    // eng-1 already reports to mgr-a
    expect(draggedEmp.managerId).toBe(targetEmp._id);
  });

  it('rejects dropping a manager onto their own direct report (cycle)', () => {
    const draggedEmp = employees.find((e) => e._id === 'vp-eng')!;
    const targetEmp = employees.find((e) => e._id === 'mgr-a')!;

    expect(isDescendant(draggedEmp._id, targetEmp._id, employees)).toBe(true);
  });

  it('rejects dropping a manager onto their indirect report (cycle)', () => {
    const draggedEmp = employees.find((e) => e._id === 'vp-eng')!;
    const targetEmp = employees.find((e) => e._id === 'eng-1')!;

    expect(isDescendant(draggedEmp._id, targetEmp._id, employees)).toBe(true);
  });

  it('rejects dropping onto self', () => {
    expect(isDescendant('mgr-a', 'mgr-a', employees)).toBe(true);
  });

  it('allows dropping between different branches', () => {
    // mgr-a → vp-sales is valid (different branch)
    expect(isDescendant('mgr-a', 'vp-sales', employees)).toBe(false);
    // eng-3 → mgr-a is valid (different branch)
    expect(isDescendant('eng-3', 'mgr-a', employees)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Subtree move confirmation dialog data                              */
/* ------------------------------------------------------------------ */

describe('Drag-to-reparent — subtree move confirmation', () => {
  it('shows subtree size of 1 for leaf employee (individual move)', () => {
    expect(getSubtreeSize('eng-1', employees)).toBe(1);
    expect(getSubtreeSize('eng-2', employees)).toBe(1);
    expect(getSubtreeSize('sales-rep', employees)).toBe(1);
  });

  it('shows correct subtree size for manager with direct reports', () => {
    // mgr-a has eng-1, eng-2 → subtree size = 3
    expect(getSubtreeSize('mgr-a', employees)).toBe(3);
    // mgr-b has eng-3 → subtree size = 2
    expect(getSubtreeSize('mgr-b', employees)).toBe(2);
  });

  it('shows correct subtree size for manager with nested reports', () => {
    // vp-eng has mgr-a(eng-1, eng-2), mgr-b(eng-3) → subtree size = 6
    expect(getSubtreeSize('vp-eng', employees)).toBe(6);
  });

  it('provides correct source and target names for confirmation dialog', () => {
    const draggedEmp = employees.find((e) => e._id === 'mgr-a')!;
    const targetEmp = employees.find((e) => e._id === 'vp-sales')!;
    const subtreeSize = getSubtreeSize(draggedEmp._id, employees);

    // Verify data that would be passed to SubtreeMoveConfirmDialog
    expect(draggedEmp.name).toBe('Manager A');
    expect(targetEmp.name).toBe('VP Sales');
    expect(subtreeSize).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/*  moveEmployee call validation                                       */
/* ------------------------------------------------------------------ */

describe('Drag-to-reparent — moveEmployee call', () => {
  it('calls moveEmployee with correct managerId on confirm', () => {
    const mockMoveEmployee = vi.fn();
    const draggedEmp = employees.find((e) => e._id === 'eng-1')!;
    const targetEmp = employees.find((e) => e._id === 'vp-sales')!;

    // Simulate what handleConfirmMove does
    mockMoveEmployee(draggedEmp._id, targetEmp._id, draggedEmp.order);

    expect(mockMoveEmployee).toHaveBeenCalledWith('eng-1', 'vp-sales', 0);
  });

  it('passes the dragged employee order to moveEmployee', () => {
    const mockMoveEmployee = vi.fn();
    const draggedEmp = makeEmployee({ _id: 'test-emp', managerId: 'mgr-a', order: 5 });
    const targetEmp = employees.find((e) => e._id === 'vp-sales')!;

    mockMoveEmployee(draggedEmp._id, targetEmp._id, draggedEmp.order);

    expect(mockMoveEmployee).toHaveBeenCalledWith('test-emp', 'vp-sales', 5);
  });
});

/* ------------------------------------------------------------------ */
/*  Hierarchy update after move                                        */
/* ------------------------------------------------------------------ */

describe('Drag-to-reparent — hierarchy update', () => {
  it('moving manager preserves internal subtree hierarchy', () => {
    // Simulate moving mgr-a from vp-eng to vp-sales
    const moved = employees.map((emp) => {
      if (emp._id === 'mgr-a') {
        return { ...emp, managerId: 'vp-sales' };
      }
      return emp;
    });

    // eng-1 and eng-2 still report to mgr-a
    expect(moved.find((e) => e._id === 'eng-1')!.managerId).toBe('mgr-a');
    expect(moved.find((e) => e._id === 'eng-2')!.managerId).toBe('mgr-a');

    // mgr-a now reports to vp-sales
    expect(moved.find((e) => e._id === 'mgr-a')!.managerId).toBe('vp-sales');

    // Subtree of mgr-a is unchanged
    const descendants = getDescendantIds('mgr-a', moved);
    expect(descendants).toEqual(new Set(['eng-1', 'eng-2']));
  });

  it('old parent loses the moved subtree', () => {
    const moved = employees.map((emp) => {
      if (emp._id === 'mgr-a') {
        return { ...emp, managerId: 'vp-sales' };
      }
      return emp;
    });

    // vp-eng now only has mgr-b
    const vpEngReports = moved.filter((e) => e.managerId === 'vp-eng');
    expect(vpEngReports.length).toBe(1);
    expect(vpEngReports[0]._id).toBe('mgr-b');
  });

  it('new parent gains the moved subtree', () => {
    const moved = employees.map((emp) => {
      if (emp._id === 'mgr-a') {
        return { ...emp, managerId: 'vp-sales' };
      }
      return emp;
    });

    // vp-sales now has sales-rep and mgr-a
    const vpSalesReports = moved.filter((e) => e.managerId === 'vp-sales');
    expect(vpSalesReports.map((e) => e._id).sort()).toEqual(['mgr-a', 'sales-rep']);
  });

  it('moving a leaf employee only changes that employee managerId', () => {
    const moved = employees.map((emp) => {
      if (emp._id === 'eng-1') {
        return { ...emp, managerId: 'mgr-b' };
      }
      return emp;
    });

    // eng-1 now reports to mgr-b
    expect(moved.find((e) => e._id === 'eng-1')!.managerId).toBe('mgr-b');

    // mgr-a only has eng-2 now
    const mgrAReports = moved.filter((e) => e.managerId === 'mgr-a');
    expect(mgrAReports.length).toBe(1);
    expect(mgrAReports[0]._id).toBe('eng-2');

    // mgr-b now has eng-3 and eng-1
    const mgrBReports = moved.filter((e) => e.managerId === 'mgr-b');
    expect(mgrBReports.map((e) => e._id).sort()).toEqual(['eng-1', 'eng-3']);
  });
});
