import { create } from 'zustand';
import type { Organization, Scenario, Employee } from '@/types';
import * as orgsApi from '@/api/orgs';
import * as scenariosApi from '@/api/scenarios';
import * as employeesApi from '@/api/employees';
import { useUndoRedoStore } from './undoRedoStore';
import type { UndoableCommand } from './undoRedoStore';

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
  /** Execute an undo command (reverse the operation) */
  executeUndo: (command: UndoableCommand) => Promise<void>;
  /** Execute a redo command (re-apply the operation) */
  executeRedo: (command: UndoableCommand) => Promise<void>;
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

  executeUndo: async (command) => {
    switch (command.type) {
      case 'create': {
        // Undo create = delete the employee
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
        // Undo edit = restore previous data
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
        // Undo delete = re-create the employee with all original data
        const { _id, ...rest } = command.employee;
        const restored = await employeesApi.createEmployee(
          command.scenarioId,
          rest as Partial<Employee>,
        );
        set((state) => ({
          employees: [...state.employees, restored],
        }));
        // Update the command's employee reference with the new _id for potential redo
        command.employee = { ...command.employee, _id: restored._id };
        break;
      }
      case 'move': {
        // Undo move = move back to previous manager/order
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

  executeRedo: async (command) => {
    switch (command.type) {
      case 'create': {
        // Redo create = re-create the employee
        const { _id, ...rest } = command.employee;
        const created = await employeesApi.createEmployee(
          command.scenarioId,
          rest as Partial<Employee>,
        );
        set((state) => ({
          employees: [...state.employees, created],
        }));
        // Update reference for future undo
        command.employee = { ...command.employee, _id: created._id };
        break;
      }
      case 'edit': {
        // Redo edit = re-apply next data
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
        // Redo delete = delete the employee again
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
        // Redo move = move to next manager/order again
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
}));
