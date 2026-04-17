import { create } from 'zustand';
import type { Employee } from '@/types';

/* ------------------------------------------------------------------ */
/*  Command types                                                      */
/* ------------------------------------------------------------------ */

/** Base shape for all undoable commands. */
interface BaseCommand {
  /** Timestamp for ordering / debugging */
  timestamp: number;
  /** Human-readable description */
  description: string;
}

/** Employee was created. Undo = delete, redo = re-create. */
export interface CreateCommand extends BaseCommand {
  type: 'create';
  scenarioId: string;
  employee: Employee;
}

/** Employee field(s) were edited. Undo = restore prev, redo = apply next. */
export interface EditCommand extends BaseCommand {
  type: 'edit';
  employeeId: string;
  previousData: Partial<Employee>;
  nextData: Partial<Employee>;
}

/** Employee was deleted. Undo = re-create, redo = re-delete. */
export interface DeleteCommand extends BaseCommand {
  type: 'delete';
  scenarioId: string;
  employee: Employee;
}

/** Employee was moved / reparented. Undo = move back, redo = move again. */
export interface MoveCommand extends BaseCommand {
  type: 'move';
  employeeId: string;
  previousManagerId: string | null;
  previousOrder: number;
  nextManagerId: string | null;
  nextOrder: number;
}

/** Batch of commands that should be undone/redone as a single unit. */
export interface BatchCommand extends BaseCommand {
  type: 'batch';
  commands: SingleCommand[];
}

/** A single (non-batch) undoable command. */
export type SingleCommand =
  | CreateCommand
  | EditCommand
  | DeleteCommand
  | MoveCommand;

export type UndoableCommand =
  | SingleCommand
  | BatchCommand;

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface UndoRedoState {
  /** Undo stacks keyed by scenarioId */
  undoStacks: Record<string, UndoableCommand[]>;
  /** Redo stacks keyed by scenarioId */
  redoStacks: Record<string, UndoableCommand[]>;
  /** Currently active scenario id */
  activeScenarioId: string | null;

  /** Set the active scenario (clears nothing — stacks are per-scenario). */
  setActiveScenario: (scenarioId: string | null) => void;

  /** Push a new command onto the undo stack of the active scenario.
   *  Clears the redo stack (new action invalidates redo history). */
  pushCommand: (command: UndoableCommand) => void;

  /** Pop the top command from the active undo stack → push to redo stack.
   *  Returns the command to execute, or null if nothing to undo. */
  undo: () => UndoableCommand | null;

  /** Pop the top command from the active redo stack → push to undo stack.
   *  Returns the command to execute, or null if nothing to redo. */
  redo: () => UndoableCommand | null;

  /** Whether undo is available for the current scenario */
  canUndo: () => boolean;

  /** Whether redo is available for the current scenario */
  canRedo: () => boolean;

  /** Clear all stacks for a given scenario (e.g., on scenario delete). */
  clearScenario: (scenarioId: string) => void;

  /** Clear everything. */
  clearAll: () => void;
}

export const useUndoRedoStore = create<UndoRedoState>((set, get) => ({
  undoStacks: {},
  redoStacks: {},
  activeScenarioId: null,

  setActiveScenario: (scenarioId) => {
    set({ activeScenarioId: scenarioId });
  },

  pushCommand: (command) => {
    const { activeScenarioId } = get();
    if (!activeScenarioId) return;

    set((state) => ({
      undoStacks: {
        ...state.undoStacks,
        [activeScenarioId]: [
          ...(state.undoStacks[activeScenarioId] ?? []),
          command,
        ],
      },
      // New change clears the redo stack
      redoStacks: {
        ...state.redoStacks,
        [activeScenarioId]: [],
      },
    }));
  },

  undo: () => {
    const { activeScenarioId, undoStacks, redoStacks } = get();
    if (!activeScenarioId) return null;

    const stack = undoStacks[activeScenarioId];
    if (!stack || stack.length === 0) return null;

    const command = stack[stack.length - 1];
    set({
      undoStacks: {
        ...undoStacks,
        [activeScenarioId]: stack.slice(0, -1),
      },
      redoStacks: {
        ...redoStacks,
        [activeScenarioId]: [
          ...(redoStacks[activeScenarioId] ?? []),
          command,
        ],
      },
    });

    return command;
  },

  redo: () => {
    const { activeScenarioId, undoStacks, redoStacks } = get();
    if (!activeScenarioId) return null;

    const stack = redoStacks[activeScenarioId];
    if (!stack || stack.length === 0) return null;

    const command = stack[stack.length - 1];
    set({
      redoStacks: {
        ...redoStacks,
        [activeScenarioId]: stack.slice(0, -1),
      },
      undoStacks: {
        ...undoStacks,
        [activeScenarioId]: [
          ...(undoStacks[activeScenarioId] ?? []),
          command,
        ],
      },
    });

    return command;
  },

  canUndo: () => {
    const { activeScenarioId, undoStacks } = get();
    if (!activeScenarioId) return false;
    return (undoStacks[activeScenarioId]?.length ?? 0) > 0;
  },

  canRedo: () => {
    const { activeScenarioId, redoStacks } = get();
    if (!activeScenarioId) return false;
    return (redoStacks[activeScenarioId]?.length ?? 0) > 0;
  },

  clearScenario: (scenarioId) => {
    set((state) => {
      const { [scenarioId]: _u, ...restUndo } = state.undoStacks;
      const { [scenarioId]: _r, ...restRedo } = state.redoStacks;
      return { undoStacks: restUndo, redoStacks: restRedo };
    });
  },

  clearAll: () => {
    set({ undoStacks: {}, redoStacks: {} });
  },
}));
