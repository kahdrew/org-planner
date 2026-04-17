import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUndoRedoStore } from '@/stores/undoRedoStore';
import { useOrgStore } from '@/stores/orgStore';
import type { Employee } from '@/types';

/**
 * Tests for VAL-UNDO-004: Undo reverts drag-to-reparent (manager reassignment).
 *
 * The OrgChartView drag-to-reparent handler calls orgStore.moveEmployee(),
 * which pushes a MoveCommand to the undo stack. On undo, the employee
 * should return to their original manager.
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

const SCENARIO_ID = 'scenario-1';

/* ------------------------------------------------------------------ */
/*  Mock the API layer so that store operations don't hit a real server */
/* ------------------------------------------------------------------ */

vi.mock('@/api/employees', () => ({
  moveEmployee: vi.fn(async (id: string, managerId: string | null, order: number) => ({
    _id: id,
    scenarioId: SCENARIO_ID,
    name: 'Alice',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'SF',
    employmentType: 'FTE',
    status: 'Active',
    order,
    managerId,
  })),
  getEmployees: vi.fn(async () => []),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
}));

vi.mock('@/api/orgs', () => ({
  getOrgs: vi.fn(async () => []),
  createOrg: vi.fn(),
}));

vi.mock('@/api/scenarios', () => ({
  getScenarios: vi.fn(async () => []),
}));

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('drag-to-reparent undo (VAL-UNDO-004)', () => {
  beforeEach(() => {
    // Reset stores
    useUndoRedoStore.getState().clearAll();
    useUndoRedoStore.getState().setActiveScenario(SCENARIO_ID);

    // Seed orgStore with employees and a current scenario
    const manager = makeEmployee({
      _id: 'mgr-1',
      name: 'Bob (Manager)',
      title: 'Engineering Manager',
    });
    const newManager = makeEmployee({
      _id: 'mgr-2',
      name: 'Carol (New Manager)',
      title: 'Product Manager',
      department: 'Product',
    });
    const employee = makeEmployee({
      _id: 'emp-1',
      name: 'Alice',
      managerId: 'mgr-1', // starts under Bob
    });

    useOrgStore.setState({
      currentScenario: { _id: SCENARIO_ID, name: 'Base', orgId: 'org-1' } as never,
      employees: [manager, newManager, employee],
      selectedEmployee: null,
    });
  });

  it('moveEmployee pushes a MoveCommand to the undo stack', async () => {
    const store = useOrgStore.getState();

    // Simulate drag-to-reparent: move emp-1 from mgr-1 to mgr-2
    await store.moveEmployee('emp-1', 'mgr-2', 0);

    // The undo stack should have exactly one MoveCommand
    const undoStore = useUndoRedoStore.getState();
    expect(undoStore.canUndo()).toBe(true);

    const command = undoStore.undo();
    expect(command).not.toBeNull();
    expect(command!.type).toBe('move');

    if (command!.type === 'move') {
      expect(command!.employeeId).toBe('emp-1');
      expect(command!.previousManagerId).toBe('mgr-1');
      expect(command!.nextManagerId).toBe('mgr-2');
    }
  });

  it('undo of moveEmployee reverts to original manager', async () => {
    const store = useOrgStore.getState();

    // Move employee from mgr-1 to mgr-2
    await store.moveEmployee('emp-1', 'mgr-2', 0);

    // Verify the move happened
    let employees = useOrgStore.getState().employees;
    const movedEmp = employees.find((e) => e._id === 'emp-1');
    expect(movedEmp?.managerId).toBe('mgr-2');

    // Undo the move
    const command = useUndoRedoStore.getState().undo();
    expect(command).not.toBeNull();
    await useOrgStore.getState().executeUndo(command!);

    // Employee should be back under original manager
    employees = useOrgStore.getState().employees;
    const restoredEmp = employees.find((e) => e._id === 'emp-1');
    expect(restoredEmp?.managerId).toBe('mgr-1');
  });

  it('redo after undo re-applies the move', async () => {
    const store = useOrgStore.getState();

    // Move employee
    await store.moveEmployee('emp-1', 'mgr-2', 0);

    // Undo
    const undoCmd = useUndoRedoStore.getState().undo();
    await useOrgStore.getState().executeUndo(undoCmd!);

    // Verify reverted
    let emp = useOrgStore.getState().employees.find((e) => e._id === 'emp-1');
    expect(emp?.managerId).toBe('mgr-1');

    // Redo
    const redoCmd = useUndoRedoStore.getState().redo();
    expect(redoCmd).not.toBeNull();
    await useOrgStore.getState().executeRedo(redoCmd!);

    // Should be back under new manager
    emp = useOrgStore.getState().employees.find((e) => e._id === 'emp-1');
    expect(emp?.managerId).toBe('mgr-2');
  });

  it('multiple drag moves undo in reverse order', async () => {
    const store = useOrgStore.getState();

    // Move 1: emp-1 from mgr-1 → mgr-2
    await store.moveEmployee('emp-1', 'mgr-2', 0);

    // Move 2: emp-1 from mgr-2 → null (top-level)
    await store.moveEmployee('emp-1', null, 0);

    // Verify final state
    let emp = useOrgStore.getState().employees.find((e) => e._id === 'emp-1');
    expect(emp?.managerId).toBeNull();

    // Undo move 2: should go back to mgr-2
    const cmd2 = useUndoRedoStore.getState().undo();
    await useOrgStore.getState().executeUndo(cmd2!);
    emp = useOrgStore.getState().employees.find((e) => e._id === 'emp-1');
    expect(emp?.managerId).toBe('mgr-2');

    // Undo move 1: should go back to mgr-1
    const cmd1 = useUndoRedoStore.getState().undo();
    await useOrgStore.getState().executeUndo(cmd1!);
    emp = useOrgStore.getState().employees.find((e) => e._id === 'emp-1');
    expect(emp?.managerId).toBe('mgr-1');
  });

  it('canUndo and canRedo update correctly after drag operations', async () => {
    const undoStore = useUndoRedoStore.getState();

    // Initially no undo/redo available
    expect(undoStore.canUndo()).toBe(false);
    expect(undoStore.canRedo()).toBe(false);

    // After move: undo available, redo not
    await useOrgStore.getState().moveEmployee('emp-1', 'mgr-2', 0);
    expect(useUndoRedoStore.getState().canUndo()).toBe(true);
    expect(useUndoRedoStore.getState().canRedo()).toBe(false);

    // After undo: redo available, undo not
    const cmd = useUndoRedoStore.getState().undo();
    await useOrgStore.getState().executeUndo(cmd!);
    expect(useUndoRedoStore.getState().canUndo()).toBe(false);
    expect(useUndoRedoStore.getState().canRedo()).toBe(true);

    // After redo: undo available, redo not
    const redoCmd = useUndoRedoStore.getState().redo();
    await useOrgStore.getState().executeRedo(redoCmd!);
    expect(useUndoRedoStore.getState().canUndo()).toBe(true);
    expect(useUndoRedoStore.getState().canRedo()).toBe(false);
  });
});
