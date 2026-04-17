import { describe, it, expect, beforeEach } from 'vitest';
import { useUndoRedoStore } from '@/stores/undoRedoStore';
import type { BatchCommand, EditCommand, DeleteCommand } from '@/stores/undoRedoStore';
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

function makeBatchEditCommand(count: number): BatchCommand {
  const commands: EditCommand[] = [];
  for (let i = 0; i < count; i++) {
    commands.push({
      type: 'edit',
      employeeId: `emp-${i}`,
      previousData: { department: 'Engineering' },
      nextData: { department: 'Sales' },
      timestamp: Date.now(),
      description: `Edit employee emp-${i}`,
    });
  }
  return {
    type: 'batch',
    commands,
    timestamp: Date.now(),
    description: `Bulk update ${count} employees`,
  };
}

function makeBatchDeleteCommand(count: number): BatchCommand {
  const commands: DeleteCommand[] = [];
  for (let i = 0; i < count; i++) {
    commands.push({
      type: 'delete',
      scenarioId: SCENARIO_A,
      employee: makeEmployee(`emp-${i}`),
      timestamp: Date.now(),
      description: `Delete employee emp-${i}`,
    });
  }
  return {
    type: 'batch',
    commands,
    timestamp: Date.now(),
    description: `Bulk delete ${count} employees`,
  };
}

describe('batch undo/redo in undoRedoStore', () => {
  beforeEach(() => {
    const store = useUndoRedoStore.getState();
    store.clearAll();
    store.setActiveScenario(SCENARIO_A);
  });

  it('batch command can be pushed and undone as single unit', () => {
    const store = useUndoRedoStore.getState();
    const batch = makeBatchEditCommand(3);
    store.pushCommand(batch);
    expect(store.canUndo()).toBe(true);

    const undone = store.undo();
    expect(undone?.type).toBe('batch');
    expect((undone as BatchCommand).commands).toHaveLength(3);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(true);
  });

  it('batch command can be redone after undo', () => {
    const store = useUndoRedoStore.getState();
    const batch = makeBatchEditCommand(3);
    store.pushCommand(batch);
    store.undo();

    const redone = store.redo();
    expect(redone?.type).toBe('batch');
    expect((redone as BatchCommand).commands).toHaveLength(3);
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
  });

  it('batch delete command stores employee data for restoration', () => {
    const store = useUndoRedoStore.getState();
    const batch = makeBatchDeleteCommand(2);
    store.pushCommand(batch);

    const undone = store.undo() as BatchCommand;
    expect(undone.commands[0].type).toBe('delete');
    const delCmd = undone.commands[0] as DeleteCommand;
    expect(delCmd.employee._id).toBe('emp-0');
    expect(delCmd.employee.name).toBe('Employee emp-0');
  });

  it('new command after batch undo clears redo stack', () => {
    const store = useUndoRedoStore.getState();
    store.pushCommand(makeBatchEditCommand(3));
    store.undo();
    expect(store.canRedo()).toBe(true);

    // Push a new single command
    store.pushCommand({
      type: 'edit',
      employeeId: 'emp-new',
      previousData: { title: 'A' },
      nextData: { title: 'B' },
      timestamp: Date.now(),
      description: 'New edit',
    });

    expect(store.canRedo()).toBe(false);
  });

  it('batch commands interleave with single commands correctly', () => {
    const store = useUndoRedoStore.getState();

    // Push single, then batch, then single
    store.pushCommand({
      type: 'edit',
      employeeId: 'emp-solo-1',
      previousData: { title: 'A' },
      nextData: { title: 'B' },
      timestamp: Date.now(),
      description: 'Solo edit 1',
    });

    store.pushCommand(makeBatchEditCommand(3));

    store.pushCommand({
      type: 'edit',
      employeeId: 'emp-solo-2',
      previousData: { title: 'C' },
      nextData: { title: 'D' },
      timestamp: Date.now(),
      description: 'Solo edit 2',
    });

    // Undo in reverse order
    const cmd3 = store.undo();
    expect(cmd3?.type).toBe('edit');
    expect((cmd3 as EditCommand).employeeId).toBe('emp-solo-2');

    const cmd2 = store.undo();
    expect(cmd2?.type).toBe('batch');
    expect((cmd2 as BatchCommand).commands).toHaveLength(3);

    const cmd1 = store.undo();
    expect(cmd1?.type).toBe('edit');
    expect((cmd1 as EditCommand).employeeId).toBe('emp-solo-1');
  });
});
