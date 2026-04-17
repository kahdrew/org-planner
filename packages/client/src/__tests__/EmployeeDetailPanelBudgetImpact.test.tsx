/**
 * VAL-BUDGET-003: EmployeeDetailPanel must show a real-time BudgetImpactCard
 * reflecting how the current form state (department, salary, equity) would
 * affect the selected department's budget.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Employee, BudgetEnvelope, Scenario } from '@/types';

const envelope: BudgetEnvelope = {
  _id: 'env-1',
  orgId: 'org-1',
  scenarioId: 'scen-1',
  department: 'Engineering',
  totalBudget: 500_000,
  headcountCap: 5,
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

const existingEmployee: Employee = {
  _id: 'emp-1',
  scenarioId: 'scen-1',
  name: 'Alice',
  title: 'Engineer',
  department: 'Engineering',
  level: 'IC3',
  location: 'SF',
  employmentType: 'FTE',
  status: 'Active',
  managerId: null,
  order: 0,
  salary: 200_000,
  equity: 0,
};

const currentScenario: Scenario = {
  _id: 'scen-1',
  orgId: 'org-1',
  name: 'S',
  description: '',
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

// ----- Store mocks -----

vi.mock('@/stores/orgStore', () => ({
  useOrgStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        employees: [existingEmployee],
        currentScenario,
        addEmployee: vi.fn(),
        updateEmployee: vi.fn(),
        removeEmployee: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
    {
      getState: vi.fn(() => ({
        employees: [existingEmployee],
        currentScenario,
        addEmployee: vi.fn(),
        updateEmployee: vi.fn(),
        removeEmployee: vi.fn(),
      })),
    },
  ),
}));

vi.mock('@/stores/invitationStore', () => ({
  useInvitationStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { currentRole: 'admin' };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/stores/approvalStore', () => ({
  useApprovalStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ chains: [] }),
}));

vi.mock('@/stores/scheduledChangeStore', () => ({
  useScheduledChangeStore: (
    selector?: (s: Record<string, unknown>) => unknown,
  ) => {
    const state = {
      createScheduledChange: vi.fn(),
      getPendingChangesForEmployee: () => [],
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/stores/budgetStore', () => ({
  useBudgetStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      envelopes: [envelope],
      fetchEnvelopes: vi.fn(async () => {}),
    }),
}));

// Import after mocks
import EmployeeDetailPanel from '@/components/panels/EmployeeDetailPanel';

describe('EmployeeDetailPanel budget impact (VAL-BUDGET-003)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a BudgetImpactCard with current spend and projected impact for a new hire', () => {
    render(
      <EmployeeDetailPanel employee={null} isNew={true} onClose={vi.fn()} />,
    );

    // Select Engineering in the form
    const deptSelect = screen.getByDisplayValue(
      'Select department',
    ) as HTMLSelectElement;
    fireEvent.change(deptSelect, { target: { value: 'Engineering' } });

    // Fill salary
    const salaryInput = screen.getAllByPlaceholderText(
      '0',
    )[0] as HTMLInputElement;
    fireEvent.change(salaryInput, { target: { value: '150000' } });

    const card = screen.getByTestId('budget-impact-card');
    expect(card).toBeInTheDocument();

    // Current spend = 200k (existing Alice)
    expect(screen.getByTestId('budget-impact-current').textContent).toMatch(
      /\$200,000/,
    );
    // Projected = 200k + 150k = 350k
    expect(screen.getByTestId('budget-impact-projected').textContent).toMatch(
      /\$350,000/,
    );
    // Remaining = 500k - 350k = 150k
    expect(screen.getByTestId('budget-impact-remaining').textContent).toMatch(
      /\$150,000/,
    );
    // Headcount = existing 1 + new 1 = 2 of 5
    expect(screen.getByTestId('budget-impact-headcount').textContent).toMatch(
      /2.*\/ 5/,
    );
  });

  it('shows budget impact delta for editing an existing employee (same department)', () => {
    render(
      <EmployeeDetailPanel
        employee={existingEmployee}
        isNew={false}
        onClose={vi.fn()}
      />,
    );

    // Existing salary is 200k; change to 300k → delta +100k
    const salaryInput = screen.getAllByPlaceholderText(
      '0',
    )[0] as HTMLInputElement;
    fireEvent.change(salaryInput, { target: { value: '300000' } });

    // Current (excl. this employee) = 0; projected = 0 + 100k delta = 100k
    expect(screen.getByTestId('budget-impact-current').textContent).toMatch(
      /\$0/,
    );
    expect(screen.getByTestId('budget-impact-projected').textContent).toMatch(
      /\$100,000/,
    );
    // No HC change for same-dept edit → headcount stays at 0 (current
    // dept excluding self) + 0 added = 0, displayed as "0 / 5"
    expect(screen.getByTestId('budget-impact-headcount').textContent).toMatch(
      /0.*\/ 5/,
    );
  });

  it('warns when the new hire would push the department over budget', () => {
    render(
      <EmployeeDetailPanel employee={null} isNew={true} onClose={vi.fn()} />,
    );
    fireEvent.change(
      screen.getByDisplayValue('Select department') as HTMLSelectElement,
      { target: { value: 'Engineering' } },
    );
    fireEvent.change(
      screen.getAllByPlaceholderText('0')[0] as HTMLInputElement,
      { target: { value: '500000' } },
    );
    // 200k existing + 500k new = 700k > 500k budget
    expect(screen.getByTestId('budget-impact-warning')).toBeInTheDocument();
  });
});
