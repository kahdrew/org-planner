import { create } from 'zustand';
import type { Organization, Scenario, Employee } from '@/types';
import * as orgsApi from '@/api/orgs';
import * as scenariosApi from '@/api/scenarios';
import * as employeesApi from '@/api/employees';
import { useUndoRedoStore } from './undoRedoStore';
import type { UndoableCommand, SingleCommand } from './undoRedoStore';

interface OrgState {
  orgs: Organization[];
  currentOrg: Organization | null;
  scenarios: Scenario[];
  currentScenario: Scenario | null;
  employees: Employee[];
  selectedEmployee: Employee | null;
  loading: boolean;

  selectEmployee: (employee: Employee | null) => void;
  fetchOrgs: () => Promise<void>;
  createOrg: (name: string) => Promise<Organization>;
  setCurrentOrg: (org: Organization) => void;
  fetchScenarios: (orgId: string) => Promise<void>;
  setCurrentScenario: (scenario: Scenario) => void;
  fetchEmployees: (scenarioId: string) => Promise<void>;
  addEmployee: (scenarioId: string, data: Partial<Employee>) => Promise<void>;
  updateEmployee: (id: string, data: Partial<Employee>) => Promise<void>;
  removeEmployee: (id: string) => Promise<void>;
  moveEmployee: (id: string, managerId: string | null, order: number) => Promise<void>;
  /** Bulk update a field on multiple employees (undoable as single unit) */
  bulkUpdateEmployees: (ids: string[], data: Partial<Employee>) => Promise<void>;
  /** Bulk delete multiple employees (undoable as single unit) */
  bulkDeleteEmployees: (ids: string[]) => Promise<void>;
  /** Execute an undo command (reverse the operation) */
  executeUndo: (command: UndoableCommand) => Promise<void>;
  /** Execute a redo command (re-apply the operation) */
  executeRedo: (command: UndoableCommand) => Promise<void>;
  /** Execute a single (non-batch) undo */
  executeSingleUndo: (command: SingleCommand) => Promise<void>;
  /** Execute a single (non-batch) redo */
  executeSingleRedo: (command: SingleCommand) => Promise<void>;
}

export const useOrgStore = create<OrgState>((set, get) => ({
  orgs: [],
  currentOrg: null,
  scenarios: [],
  currentScenario: null,
  employees: [],
  selectedEmployee: null,
  loading: false,

  selectEmployee: (employee) => set({ selectedEmployee: employee }),

  fetchOrgs: async () => {
    set({ loading: true });
    try {
      const orgs = await orgsApi.getOrgs();
      set({ orgs });
      if (orgs.length > 0 && !get().currentOrg) {
        set({ currentOrg: orgs[0] });
      }
    } finally {
      set({ loading: false });
    }
  },

  createOrg: async (name) => {
    const org = await orgsApi.createOrg(name);
    set((state) => ({
      orgs: [...state.orgs, org],
      currentOrg: org,
      scenarios: [],
      currentScenario: null,
      employees: [],
      selectedEmployee: null,
    }));
    return org;
  },

  setCurrentOrg: (org) => {
    set({ currentOrg: org, scenarios: [], currentScenario: null, employees: [], selectedEmployee: null });
  },

  fetchScenarios: async (orgId) => {
    set({ loading: true });
    try {
      const scenarios = await scenariosApi.getScenarios(orgId);
      set({ scenarios });
      if (scenarios.length > 0 && !get().currentScenario) {
        set({ currentScenario: scenarios[0] });
      }
    } finally {
      set({ loading: false });
    }
  },

  setCurrentScenario: (scenario) => {
    set({ currentScenario: scenario, employees: [], selectedEmployee: null });
  },

  fetchEmployees: async (scenarioId) => {
    set({ loading: true });
    try {
      const employees = await employeesApi.getEmployees(scenarioId);
      set({ employees });
    } finally {
      set({ loading: false });
    }
  },

  addEmployee: async (scenarioId, data) => {
    const employee = await employeesApi.createEmployee(scenarioId, data);
    set((state) => ({ employees: [...state.employees, employee] }));

    // Record undo command
    useUndoRedoStore.getState().pushCommand({
      type: 'create',
      scenarioId,
      employee,
      timestamp: Date.now(),
      description: `Add employee "${employee.name}"`,
    });
  },

  updateEmployee: async (id, data) => {
    // Capture previous values before updating
    const previous = get().employees.find((e) => e._id === id);
    const previousData: Partial<Employee> = {};
    if (previous) {
      for (const key of Object.keys(data) as (keyof Employee)[]) {
        previousData[key] = previous[key] as never;
      }
    }

    const updated = await employeesApi.updateEmployee(id, data);
    set((state) => ({
      employees: state.employees.map((e) => (e._id === id ? updated : e)),
      selectedEmployee: state.selectedEmployee?._id === id ? updated : state.selectedEmployee,
    }));

    // Record undo command
    if (previous) {
      useUndoRedoStore.getState().pushCommand({
        type: 'edit',
        employeeId: id,
        previousData,
        nextData: data,
        timestamp: Date.now(),
        description: `Edit employee "${previous.name}"`,
      });
    }
  },

  removeEmployee: async (id) => {
    // Capture full employee data before deleting for undo restore
    const employee = get().employees.find((e) => e._id === id);
    const scenarioId = get().currentScenario?._id;

    await employeesApi.deleteEmployee(id);
    set((state) => ({
      employees: state.employees.filter((e) => e._id !== id),
      selectedEmployee: state.selectedEmployee?._id === id ? null : state.selectedEmployee,
    }));

    // Record undo command
    if (employee && scenarioId) {
      useUndoRedoStore.getState().pushCommand({
        type: 'delete',
        scenarioId,
        employee,
        timestamp: Date.now(),
        description: `Delete employee "${employee.name}"`,
      });
    }
  },

  moveEmployee: async (id, managerId, order) => {
    // Capture previous position
    const previous = get().employees.find((e) => e._id === id);
    const previousManagerId = previous?.managerId ?? null;
    const previousOrder = previous?.order ?? 0;

    const updated = await employeesApi.moveEmployee(id, managerId, order);
    set((state) => ({
      employees: state.employees.map((e) => (e._id === id ? updated : e)),
    }));

    // Record undo command
    if (previous) {
      useUndoRedoStore.getState().pushCommand({
        type: 'move',
        employeeId: id,
        previousManagerId,
        previousOrder,
        nextManagerId: managerId,
        nextOrder: order,
        timestamp: Date.now(),
        description: `Move employee "${previous.name}"`,
      });
    }
  },

  bulkUpdateEmployees: async (ids, data) => {
    const editCommands: SingleCommand[] = [];

    for (const id of ids) {
      const previous = get().employees.find((e) => e._id === id);
      if (!previous) continue;

      const previousData: Partial<Employee> = {};
      for (const key of Object.keys(data) as (keyof Employee)[]) {
        previousData[key] = previous[key] as never;
      }

      const updated = await employeesApi.updateEmployee(id, data);
      set((state) => ({
        employees: state.employees.map((e) => (e._id === id ? updated : e)),
        selectedEmployee: state.selectedEmployee?._id === id ? updated : state.selectedEmployee,
      }));

      editCommands.push({
        type: 'edit',
        employeeId: id,
        previousData,
        nextData: data,
        timestamp: Date.now(),
        description: `Edit employee "${previous.name}"`,
      });
    }

    // Record as a batch command for single-step undo
    if (editCommands.length > 0) {
      useUndoRedoStore.getState().pushCommand({
        type: 'batch',
        commands: editCommands,
        timestamp: Date.now(),
        description: `Bulk update ${editCommands.length} employees`,
      });
    }
  },

  bulkDeleteEmployees: async (ids) => {
    const deleteCommands: SingleCommand[] = [];
    const scenarioId = get().currentScenario?._id;
    if (!scenarioId) return;

    for (const id of ids) {
      const employee = get().employees.find((e) => e._id === id);
      if (!employee) continue;

      await employeesApi.deleteEmployee(id);
      set((state) => ({
        employees: state.employees.filter((e) => e._id !== id),
        selectedEmployee: state.selectedEmployee?._id === id ? null : state.selectedEmployee,
      }));

      deleteCommands.push({
        type: 'delete',
        scenarioId,
        employee,
        timestamp: Date.now(),
        description: `Delete employee "${employee.name}"`,
      });
    }

    // Record as a batch command for single-step undo
    if (deleteCommands.length > 0) {
      useUndoRedoStore.getState().pushCommand({
        type: 'batch',
        commands: deleteCommands,
        timestamp: Date.now(),
        description: `Bulk delete ${deleteCommands.length} employees`,
      });
    }
  },

  executeSingleUndo: async (command) => {
    switch (command.type) {
      case 'create': {
        await employeesApi.deleteEmployee(command.employee._id);
        set((state) => ({
          employees: state.employees.filter((e) => e._id !== command.employee._id),
          selectedEmployee:
            state.selectedEmployee?._id === command.employee._id
              ? null
              : state.selectedEmployee,
        }));
        break;
      }
      case 'edit': {
        const updated = await employeesApi.updateEmployee(
          command.employeeId,
          command.previousData,
        );
        set((state) => ({
          employees: state.employees.map((e) =>
            e._id === command.employeeId ? updated : e,
          ),
          selectedEmployee:
            state.selectedEmployee?._id === command.employeeId
              ? updated
              : state.selectedEmployee,
        }));
        break;
      }
      case 'delete': {
        const { _id, ...rest } = command.employee;
        const restored = await employeesApi.createEmployee(
          command.scenarioId,
          rest as Partial<Employee>,
        );
        set((state) => ({
          employees: [...state.employees, restored],
        }));
        command.employee = { ...command.employee, _id: restored._id };
        break;
      }
      case 'move': {
        const updated = await employeesApi.moveEmployee(
          command.employeeId,
          command.previousManagerId,
          command.previousOrder,
        );
        set((state) => ({
          employees: state.employees.map((e) =>
            e._id === command.employeeId ? updated : e,
          ),
        }));
        break;
      }
    }
  },

  executeSingleRedo: async (command) => {
    switch (command.type) {
      case 'create': {
        const { _id, ...rest } = command.employee;
        const created = await employeesApi.createEmployee(
          command.scenarioId,
          rest as Partial<Employee>,
        );
        set((state) => ({
          employees: [...state.employees, created],
        }));
        command.employee = { ...command.employee, _id: created._id };
        break;
      }
      case 'edit': {
        const updated = await employeesApi.updateEmployee(
          command.employeeId,
          command.nextData,
        );
        set((state) => ({
          employees: state.employees.map((e) =>
            e._id === command.employeeId ? updated : e,
          ),
          selectedEmployee:
            state.selectedEmployee?._id === command.employeeId
              ? updated
              : state.selectedEmployee,
        }));
        break;
      }
      case 'delete': {
        await employeesApi.deleteEmployee(command.employee._id);
        set((state) => ({
          employees: state.employees.filter(
            (e) => e._id !== command.employee._id,
          ),
          selectedEmployee:
            state.selectedEmployee?._id === command.employee._id
              ? null
              : state.selectedEmployee,
        }));
        break;
      }
      case 'move': {
        const updated = await employeesApi.moveEmployee(
          command.employeeId,
          command.nextManagerId,
          command.nextOrder,
        );
        set((state) => ({
          employees: state.employees.map((e) =>
            e._id === command.employeeId ? updated : e,
          ),
        }));
        break;
      }
    }
  },

  executeUndo: async (command) => {
    if (command.type === 'batch') {
      // Undo batch commands in reverse order
      for (let i = command.commands.length - 1; i >= 0; i--) {
        await get().executeSingleUndo(command.commands[i]);
      }
    } else {
      await get().executeSingleUndo(command);
    }
  },

  executeRedo: async (command) => {
    if (command.type === 'batch') {
      // Redo batch commands in original order
      for (const cmd of command.commands) {
        await get().executeSingleRedo(cmd);
      }
    } else {
      await get().executeSingleRedo(command);
    }
  },
}));
