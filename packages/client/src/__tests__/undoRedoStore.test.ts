import { describe, it, expect, beforeEach } from 'vitest';
import { useUndoRedoStore } from '@/stores/undoRedoStore';
import type { CreateCommand, EditCommand, DeleteCommand, MoveCommand } from '@/stores/undoRedoStore';
import type { Employee } from '@/types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SCENARIO_A = 'scenario-a';
const SCENARIO_B = 'scenario-b';

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    _id: 'emp-1',
    scenarioId: SCENARIO_A,
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

function makeCreateCommand(employee?: Employee): CreateCommand {
  return {
    type: 'create',
    scenarioId: SCENARIO_A,
    employee: employee ?? makeEmployee(),
    timestamp: Date.now(),
    description: 'Add employee',
  };
}

function makeEditCommand(): EditCommand {
  return {
    type: 'edit',
    employeeId: 'emp-1',
    previousData: { title: 'Engineer' },
    nextData: { title: 'Senior Engineer' },
    timestamp: Date.now(),
    description: 'Edit employee',
  };
}

function makeDeleteCommand(): DeleteCommand {
  return {
    type: 'delete',
    scenarioId: SCENARIO_A,
    employee: makeEmployee(),
    timestamp: Date.now(),
    description: 'Delete employee',
  };
}

function makeMoveCommand(): MoveCommand {
  return {
    type: 'move',
    employeeId: 'emp-1',
    previousManagerId: null,
    previousOrder: 0,
    nextManagerId: 'mgr-1',
    nextOrder: 1,
    timestamp: Date.now(),
    description: 'Move employee',
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('undoRedoStore', () => {
  beforeEach(() => {
    const store = useUndoRedoStore.getState();
    store.clearAll();
    store.setActiveScenario(SCENARIO_A);
  });

  /* -- pushCommand & canUndo/canRedo ------------------------------ */

  it('starts with empty stacks', () => {
    const store = useUndoRedoStore.getState();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });

  it('pushCommand adds to undo stack and enables canUndo', () => {
    const store = useUndoRedoStore.getState();
    store.pushCommand(makeCreateCommand());
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
  });

  it('pushCommand clears the redo stack', () => {
    const store = useUndoRedoStore.getState();
    store.pushCommand(makeCreateCommand());
    // Undo to move to redo stack
    store.undo();
    expect(store.canRedo()).toBe(true);
    // Push new command → redo should be cleared
    store.pushCommand(makeEditCommand());
    expect(store.canRedo()).toBe(false);
  });

  it('does not push command if no active scenario', () => {
    const store = useUndoRedoStore.getState();
    store.setActiveScenario(null);
    store.pushCommand(makeCreateCommand());
    // No scenario → canUndo is false
    expect(store.canUndo()).toBe(false);
  });

  /* -- undo -------------------------------------------------------- */

  it('undo returns the last pushed command', () => {
    const store = useUndoRedoStore.getState();
    const cmd1 = makeCreateCommand();
    const cmd2 = makeEditCommand();
    store.pushCommand(cmd1);
    store.pushCommand(cmd2);

    const undone = store.undo();
    expect(undone).toBe(cmd2);
  });

  it('undo moves command from undo stack to redo stack', () => {
    const store = useUndoRedoStore.getState();
    store.pushCommand(makeCreateCommand());
    store.undo();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(true);
  });

  it('undo returns null when stack is empty', () => {
    const store = useUndoRedoStore.getState();
    expect(store.undo()).toBeNull();
  });

  it('multiple undos pop in reverse order', () => {
    const store = useUndoRedoStore.getState();
    const cmd1 = makeCreateCommand();
    const cmd2 = makeEditCommand();
    const cmd3 = makeMoveCommand();
    store.pushCommand(cmd1);
    store.pushCommand(cmd2);
    store.pushCommand(cmd3);

    expect(store.undo()).toBe(cmd3);
    expect(store.undo()).toBe(cmd2);
    expect(store.undo()).toBe(cmd1);
    expect(store.undo()).toBeNull();
  });

  /* -- redo -------------------------------------------------------- */

  it('redo returns the last undone command', () => {
    const store = useUndoRedoStore.getState();
    const cmd = makeCreateCommand();
    store.pushCommand(cmd);
    store.undo();

    const redone = store.redo();
    expect(redone).toBe(cmd);
  });

  it('redo moves command from redo stack back to undo stack', () => {
    const store = useUndoRedoStore.getState();
    store.pushCommand(makeCreateCommand());
    store.undo();
    store.redo();
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
  });

  it('redo returns null when redo stack is empty', () => {
    const store = useUndoRedoStore.getState();
    expect(store.redo()).toBeNull();
  });

  /* -- per-scenario scoping --------------------------------------- */

  it('undo stack is per-scenario', () => {
    const store = useUndoRedoStore.getState();

    // Push command in scenario A
    store.pushCommand(makeCreateCommand());
    expect(store.canUndo()).toBe(true);

    // Switch to scenario B
    store.setActiveScenario(SCENARIO_B);
    expect(store.canUndo()).toBe(false);

    // Push command in scenario B
    store.pushCommand(makeEditCommand());
    expect(store.canUndo()).toBe(true);

    // Switch back to A
    store.setActiveScenario(SCENARIO_A);
    expect(store.canUndo()).toBe(true);
  });

  it('redo stack is per-scenario', () => {
    const store = useUndoRedoStore.getState();

    store.pushCommand(makeCreateCommand());
    store.undo();
    expect(store.canRedo()).toBe(true);

    store.setActiveScenario(SCENARIO_B);
    expect(store.canRedo()).toBe(false);

    store.setActiveScenario(SCENARIO_A);
    expect(store.canRedo()).toBe(true);
  });

  it('switching scenarios does not mix undo history', () => {
    const store = useUndoRedoStore.getState();

    const cmdA = makeCreateCommand();
    store.pushCommand(cmdA);

    store.setActiveScenario(SCENARIO_B);
    const cmdB = makeEditCommand();
    store.pushCommand(cmdB);

    // Undo in B should return cmdB, not cmdA
    expect(store.undo()).toBe(cmdB);
    expect(store.undo()).toBeNull();

    // Switch to A and undo
    store.setActiveScenario(SCENARIO_A);
    expect(store.undo()).toBe(cmdA);
  });

  /* -- clearScenario / clearAll ----------------------------------- */

  it('clearScenario removes stacks for that scenario only', () => {
    const store = useUndoRedoStore.getState();

    store.pushCommand(makeCreateCommand());
    store.setActiveScenario(SCENARIO_B);
    store.pushCommand(makeEditCommand());

    store.clearScenario(SCENARIO_A);

    store.setActiveScenario(SCENARIO_A);
    expect(store.canUndo()).toBe(false);

    store.setActiveScenario(SCENARIO_B);
    expect(store.canUndo()).toBe(true);
  });

  it('clearAll removes all stacks', () => {
    const store = useUndoRedoStore.getState();
    store.pushCommand(makeCreateCommand());
    store.setActiveScenario(SCENARIO_B);
    store.pushCommand(makeEditCommand());

    store.clearAll();

    store.setActiveScenario(SCENARIO_A);
    expect(store.canUndo()).toBe(false);
    store.setActiveScenario(SCENARIO_B);
    expect(store.canUndo()).toBe(false);
  });

  /* -- all command types ------------------------------------------ */

  it('handles all four command types', () => {
    const store = useUndoRedoStore.getState();
    store.pushCommand(makeCreateCommand());
    store.pushCommand(makeEditCommand());
    store.pushCommand(makeDeleteCommand());
    store.pushCommand(makeMoveCommand());

    expect(store.canUndo()).toBe(true);

    const move = store.undo();
    expect(move?.type).toBe('move');

    const del = store.undo();
    expect(del?.type).toBe('delete');

    const edit = store.undo();
    expect(edit?.type).toBe('edit');

    const create = store.undo();
    expect(create?.type).toBe('create');

    expect(store.undo()).toBeNull();
    expect(store.canRedo()).toBe(true);
  });

  /* -- undo→new change→redo cleared -------------------------------- */

  it('new change after undo clears the redo stack (full cycle)', () => {
    const store = useUndoRedoStore.getState();

    store.pushCommand(makeCreateCommand());
    store.pushCommand(makeEditCommand());
    store.pushCommand(makeMoveCommand());

    // Undo two operations
    store.undo();
    store.undo();
    expect(store.canRedo()).toBe(true);

    // Make a new change
    store.pushCommand(makeDeleteCommand());

    // Redo should no longer be possible
    expect(store.canRedo()).toBe(false);
    expect(store.redo()).toBeNull();

    // Undo stack has: create + delete
    expect(store.undo()?.type).toBe('delete');
    expect(store.undo()?.type).toBe('create');
    expect(store.undo()).toBeNull();
  });
});
