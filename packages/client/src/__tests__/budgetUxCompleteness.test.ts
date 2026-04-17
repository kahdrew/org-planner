/**
 * Tests for the "Budget UX completeness" feature:
 *   - VAL-BUDGET-003/004/007: pending-approval-aware budget summary
 *     (committed / planned / remaining, projected status)
 *   - VAL-CROSS-019: orgStore cascade — deleting a manager clears
 *     managerId on their direct reports in the local store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  BudgetEnvelope,
  Employee,
  HeadcountRequest,
} from '@/types';
import {
  computeBudgetSummary,
  computePendingByDept,
} from '@/utils/budgetMetrics';

// Mock the employees API before importing the store
vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(async () => []),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(async (_id: string) => ({
    message: 'Employee deleted',
    affectedReportIds: [] as string[],
  })),
  moveEmployee: vi.fn(),
  bulkCreateEmployees: vi.fn(),
}));
vi.mock('@/api/orgs', () => ({
  getOrgs: vi.fn(async () => []),
  createOrg: vi.fn(),
}));
vi.mock('@/api/scenarios', () => ({
  getScenarios: vi.fn(async () => []),
}));

import * as employeesApi from '@/api/employees';
import { useOrgStore } from '@/stores/orgStore';
import { useUndoRedoStore } from '@/stores/undoRedoStore';

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    _id: 'emp-' + Math.random().toString(36).slice(2, 9),
    scenarioId: 'scen-1',
    name: 'Alice',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'NYC',
    employmentType: 'FTE',
    status: 'Active',
    order: 0,
    managerId: null,
    salary: 100_000,
    equity: 20_000,
    ...overrides,
  };
}

function makeEnvelope(overrides: Partial<BudgetEnvelope> = {}): BudgetEnvelope {
  return {
    _id: 'env-' + Math.random().toString(36).slice(2, 9),
    orgId: 'org-1',
    scenarioId: 'scen-1',
    department: 'Engineering',
    totalBudget: 500_000,
    headcountCap: 5,
    createdBy: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<HeadcountRequest> = {}): HeadcountRequest {
  return {
    _id: 'req-' + Math.random().toString(36).slice(2, 9),
    orgId: 'org-1',
    scenarioId: 'scen-1',
    requestType: 'new_hire',
    employeeData: {
      name: 'New Hire',
      title: 'Engineer',
      department: 'Engineering',
      level: 'IC3',
      location: 'SF',
      employmentType: 'FTE',
      salary: 150_000,
      equity: 0,
    },
    targetEmployeeId: null,
    requestedBy: 'user-1',
    chainId: 'chain-1',
    currentStep: 0,
    status: 'pending',
    audit: [],
    approvedEmployeeId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('computePendingByDept (VAL-BUDGET-004/007)', () => {
  it('sums full comp per new_hire pending request', () => {
    const result = computePendingByDept(
      [
        makeRequest({
          employeeData: {
            ...makeRequest().employeeData,
            department: 'Engineering',
            salary: 100_000,
            equity: 20_000,
          },
        }),
        makeRequest({
          employeeData: {
            ...makeRequest().employeeData,
            department: 'Sales',
            salary: 80_000,
            equity: 0,
          },
        }),
      ],
      [],
    );
    expect(result.get('Engineering')).toEqual({ spend: 120_000, headcount: 1 });
    expect(result.get('Sales')).toEqual({ spend: 80_000, headcount: 1 });
  });

  it('uses the delta for comp_change requests and does not add headcount', () => {
    const target = makeEmployee({
      _id: 'target-1',
      department: 'Engineering',
      salary: 100_000,
      equity: 20_000,
    });
    const request = makeRequest({
      requestType: 'comp_change',
      targetEmployeeId: 'target-1',
      employeeData: {
        ...makeRequest().employeeData,
        department: 'Engineering',
        salary: 130_000,
        equity: 30_000,
      },
    });
    const result = computePendingByDept([request], [target]);
    // Proposed 160k - current 120k = +40k delta, 0 HC change
    expect(result.get('Engineering')).toEqual({ spend: 40_000, headcount: 0 });
  });

  it('ignores non-pending requests', () => {
    const result = computePendingByDept(
      [makeRequest({ status: 'approved' }), makeRequest({ status: 'rejected' })],
      [],
    );
    expect(result.size).toBe(0);
  });
});

describe('computeBudgetSummary with pending approvals', () => {
  it('populates plannedSpend/plannedHeadcount and projected status', () => {
    const envelopes = [makeEnvelope({ totalBudget: 500_000, headcountCap: 5 })];
    const employees = [
      makeEmployee({ salary: 200_000, equity: 0 }),
      makeEmployee({ _id: 'b', salary: 100_000, equity: 0 }),
    ];
    // 300k committed out of 500k → 60% utilization (under)
    // Pending new hire of 250k pushes projected to 550k → exceeded
    const pending = [
      makeRequest({
        employeeData: {
          ...makeRequest().employeeData,
          department: 'Engineering',
          salary: 250_000,
          equity: 0,
        },
      }),
    ];
    const summary = computeBudgetSummary(envelopes, employees, pending);
    const eng = summary.departments.find(
      (d) => d.department === 'Engineering',
    )!;
    expect(eng.actualSpend).toBe(300_000);
    expect(eng.plannedSpend).toBe(250_000);
    expect(eng.plannedHeadcount).toBe(1);
    // committed spend is under (60%); projected spend (110%) is exceeded
    expect(eng.budgetStatus).toBe('under');
    expect(eng.projectedBudgetStatus).toBe('exceeded');
    // HC cap is 5, actual 2 + pending 1 = 3 → still under
    expect(eng.projectedHeadcountStatus).toBe('under');
  });

  it('adds a department that only has a pending request (no actuals, no envelope)', () => {
    const pending = [
      makeRequest({
        employeeData: {
          ...makeRequest().employeeData,
          department: 'NewTeam',
          salary: 100_000,
          equity: 0,
        },
      }),
    ];
    const summary = computeBudgetSummary([], [], pending);
    expect(summary.departments.some((d) => d.department === 'NewTeam')).toBe(
      true,
    );
    const team = summary.departments.find(
      (d) => d.department === 'NewTeam',
    )!;
    expect(team.plannedSpend).toBe(100_000);
    expect(team.totalBudget).toBeNull();
  });

  it('defaults to empty pending array (backwards compatible)', () => {
    const summary = computeBudgetSummary(
      [makeEnvelope()],
      [makeEmployee({ salary: 100_000, equity: 0 })],
    );
    expect(summary.departments[0].plannedSpend).toBe(0);
    expect(summary.departments[0].plannedHeadcount).toBe(0);
  });
});

describe('orgStore.removeEmployee manager cascade (VAL-CROSS-019)', () => {
  beforeEach(() => {
    useUndoRedoStore.getState().clearAll();
    vi.clearAllMocks();
  });

  it('clears local managerId on reports reported by the server', async () => {
    const managerId = 'mgr-1';
    const report1 = 'r1';
    const report2 = 'r2';
    const unrelated = 'u1';

    useOrgStore.setState({
      currentScenario: {
        _id: 'scen-1',
        orgId: 'org-1',
        name: 'S',
        description: '',
        createdBy: 'u',
        createdAt: '',
        updatedAt: '',
      },
      employees: [
        makeEmployee({ _id: managerId, managerId: null }),
        makeEmployee({ _id: report1, managerId }),
        makeEmployee({ _id: report2, managerId }),
        makeEmployee({ _id: unrelated, managerId: null }),
      ],
    });

    (employeesApi.deleteEmployee as ReturnType<typeof vi.fn>).mockResolvedValue({
      message: 'Employee deleted',
      affectedReportIds: [report1, report2],
    });

    await useOrgStore.getState().removeEmployee(managerId);

    const state = useOrgStore.getState().employees;
    expect(state.some((e) => e._id === managerId)).toBe(false);
    const r1 = state.find((e) => e._id === report1);
    const r2 = state.find((e) => e._id === report2);
    expect(r1?.managerId).toBeNull();
    expect(r2?.managerId).toBeNull();
    // Unrelated employees untouched
    const u = state.find((e) => e._id === unrelated);
    expect(u?.managerId).toBeNull(); // already null
  });

  it("falls back to client-side cascade when the server response doesn't include affectedReportIds", async () => {
    const managerId = 'mgr-2';
    const report1 = 'r3';

    useOrgStore.setState({
      currentScenario: {
        _id: 'scen-1',
        orgId: 'org-1',
        name: 'S',
        description: '',
        createdBy: 'u',
        createdAt: '',
        updatedAt: '',
      },
      employees: [
        makeEmployee({ _id: managerId, managerId: null }),
        makeEmployee({ _id: report1, managerId }),
      ],
    });

    // Simulate an older server response shape with no affectedReportIds
    (employeesApi.deleteEmployee as ReturnType<typeof vi.fn>).mockResolvedValue({
      message: 'Employee deleted',
    });

    await useOrgStore.getState().removeEmployee(managerId);

    const state = useOrgStore.getState().employees;
    const r1 = state.find((e) => e._id === report1);
    expect(r1?.managerId).toBeNull();
  });
});
