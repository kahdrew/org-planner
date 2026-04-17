import { describe, it, expect, beforeEach } from 'vitest';
import { useUndoRedoStore } from '@/stores/undoRedoStore';
import type { BatchCommand, MoveCommand } from '@/stores/undoRedoStore';
import { getDescendantIds, getInvalidManagerIds } from '@/utils/hierarchy';
import type { Employee } from '@/types';

const SCENARIO_A = 'scenario-a';

function makeEmployee(id: string, overrides: Partial<Employee> = {}): Employee {
  return {
    _id: id,
    scenarioId: SCENARIO_A,
    name: `Employee ${id}`,
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

describe('bulk manager change undo/redo', () => {
  beforeEach(() => {
    const store = useUndoRedoStore.getState();
    store.clearAll();
    store.setActiveScenario(SCENARIO_A);
  });

  it('bulk move commands should be pushed as a single batch command', () => {
    const store = useUndoRedoStore.getState();

    // Simulate what the fixed BulkOperationsToolbar should do:
    // Push a single batch of move commands
    const moveCommands: MoveCommand[] = [
      {
        type: 'move',
        employeeId: 'emp-1',
        previousManagerId: 'old-mgr-1',
        previousOrder: 0,
        nextManagerId: 'new-mgr',
        nextOrder: 0,
        timestamp: Date.now(),
        description: 'Move Employee 1',
      },
      {
        type: 'move',
        employeeId: 'emp-2',
        previousManagerId: 'old-mgr-2',
        previousOrder: 0,
        nextManagerId: 'new-mgr',
        nextOrder: 0,
        timestamp: Date.now(),
        description: 'Move Employee 2',
      },
      {
        type: 'move',
        employeeId: 'emp-3',
        previousManagerId: null,
        previousOrder: 0,
        nextManagerId: 'new-mgr',
        nextOrder: 0,
        timestamp: Date.now(),
        description: 'Move Employee 3',
      },
    ];

    store.pushCommand({
      type: 'batch',
      commands: moveCommands,
      timestamp: Date.now(),
      description: 'Bulk change manager for 3 employees',
    });

    // Should be a single undo operation
    expect(store.canUndo()).toBe(true);
    const undone = store.undo();
    expect(undone?.type).toBe('batch');
    expect((undone as BatchCommand).commands).toHaveLength(3);
    expect((undone as BatchCommand).commands.every(c => c.type === 'move')).toBe(true);

    // After a single undo, nothing left to undo
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(true);
  });

  it('bulk move batch redo re-applies all moves', () => {
    const store = useUndoRedoStore.getState();

    const moveCommands: MoveCommand[] = [
      {
        type: 'move',
        employeeId: 'emp-1',
        previousManagerId: 'old-mgr',
        previousOrder: 0,
        nextManagerId: 'new-mgr',
        nextOrder: 1,
        timestamp: Date.now(),
        description: 'Move Employee 1',
      },
      {
        type: 'move',
        employeeId: 'emp-2',
        previousManagerId: 'old-mgr',
        previousOrder: 1,
        nextManagerId: 'new-mgr',
        nextOrder: 2,
        timestamp: Date.now(),
        description: 'Move Employee 2',
      },
    ];

    store.pushCommand({
      type: 'batch',
      commands: moveCommands,
      timestamp: Date.now(),
      description: 'Bulk change manager for 2 employees',
    });

    store.undo();
    expect(store.canRedo()).toBe(true);

    const redone = store.redo();
    expect(redone?.type).toBe('batch');
    expect((redone as BatchCommand).commands).toHaveLength(2);
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
  });
});

describe('getDescendantIds helper for cycle prevention', () => {
  it('returns all descendants of a given employee', () => {
    const employees: Employee[] = [
      makeEmployee('ceo', { managerId: null }),
      makeEmployee('vp', { managerId: 'ceo' }),
      makeEmployee('mgr', { managerId: 'vp' }),
      makeEmployee('eng1', { managerId: 'mgr' }),
      makeEmployee('eng2', { managerId: 'mgr' }),
      makeEmployee('other', { managerId: null }),
    ];

    const descendants = getDescendantIds('ceo', employees);
    expect(descendants).toContain('vp');
    expect(descendants).toContain('mgr');
    expect(descendants).toContain('eng1');
    expect(descendants).toContain('eng2');
    expect(descendants).not.toContain('ceo');
    expect(descendants).not.toContain('other');
  });

  it('returns empty set for leaf nodes', () => {
    const employees: Employee[] = [
      makeEmployee('ceo', { managerId: null }),
      makeEmployee('eng', { managerId: 'ceo' }),
    ];

    const descendants = getDescendantIds('eng', employees);
    expect(descendants.size).toBe(0);
  });

  it('handles multiple roots correctly', () => {
    const employees: Employee[] = [
      makeEmployee('root1', { managerId: null }),
      makeEmployee('root2', { managerId: null }),
      makeEmployee('child1', { managerId: 'root1' }),
      makeEmployee('child2', { managerId: 'root2' }),
    ];

    const descendants = getDescendantIds('root1', employees);
    expect(descendants).toContain('child1');
    expect(descendants).not.toContain('child2');
    expect(descendants).not.toContain('root2');
  });
});

describe('getInvalidManagerIds for bulk operations', () => {
  it('excludes selected employees and all their descendants', () => {
    const employees: Employee[] = [
      makeEmployee('ceo', { managerId: null }),
      makeEmployee('vp', { managerId: 'ceo' }),
      makeEmployee('mgr', { managerId: 'vp' }),
      makeEmployee('eng', { managerId: 'mgr' }),
      makeEmployee('other', { managerId: null }),
    ];

    // If VP is selected for bulk manager change, VP + descendants should be invalid
    const invalidIds = getInvalidManagerIds(new Set(['vp']), employees);
    expect(invalidIds.has('vp')).toBe(true);     // self
    expect(invalidIds.has('mgr')).toBe(true);    // descendant
    expect(invalidIds.has('eng')).toBe(true);    // descendant
    expect(invalidIds.has('ceo')).toBe(false);   // parent — valid
    expect(invalidIds.has('other')).toBe(false); // unrelated — valid
  });

  it('handles multiple selected employees', () => {
    const employees: Employee[] = [
      makeEmployee('root1', { managerId: null }),
      makeEmployee('child1a', { managerId: 'root1' }),
      makeEmployee('child1b', { managerId: 'root1' }),
      makeEmployee('root2', { managerId: null }),
      makeEmployee('child2a', { managerId: 'root2' }),
    ];

    const invalidIds = getInvalidManagerIds(new Set(['root1', 'child2a']), employees);
    // root1 selected + its descendants
    expect(invalidIds.has('root1')).toBe(true);
    expect(invalidIds.has('child1a')).toBe(true);
    expect(invalidIds.has('child1b')).toBe(true);
    // child2a selected (leaf, no descendants)
    expect(invalidIds.has('child2a')).toBe(true);
    // root2 is not selected and not a descendant of any selected
    expect(invalidIds.has('root2')).toBe(false);
  });
});
