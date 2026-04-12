import { create } from 'zustand';
import type { Organization, Scenario, Employee } from '@/types';
import * as orgsApi from '@/api/orgs';
import * as scenariosApi from '@/api/scenarios';
import * as employeesApi from '@/api/employees';

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
  setCurrentOrg: (org: Organization) => void;
  fetchScenarios: (orgId: string) => Promise<void>;
  setCurrentScenario: (scenario: Scenario) => void;
  fetchEmployees: (scenarioId: string) => Promise<void>;
  addEmployee: (scenarioId: string, data: Partial<Employee>) => Promise<void>;
  updateEmployee: (id: string, data: Partial<Employee>) => Promise<void>;
  removeEmployee: (id: string) => Promise<void>;
  moveEmployee: (id: string, managerId: string | null, order: number) => Promise<void>;
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
  },

  updateEmployee: async (id, data) => {
    const updated = await employeesApi.updateEmployee(id, data);
    set((state) => ({
      employees: state.employees.map((e) => (e._id === id ? updated : e)),
      selectedEmployee: state.selectedEmployee?._id === id ? updated : state.selectedEmployee,
    }));
  },

  removeEmployee: async (id) => {
    await employeesApi.deleteEmployee(id);
    set((state) => ({
      employees: state.employees.filter((e) => e._id !== id),
      selectedEmployee: state.selectedEmployee?._id === id ? null : state.selectedEmployee,
    }));
  },

  moveEmployee: async (id, managerId, order) => {
    const updated = await employeesApi.moveEmployee(id, managerId, order);
    set((state) => ({
      employees: state.employees.map((e) => (e._id === id ? updated : e)),
    }));
  },
}));
