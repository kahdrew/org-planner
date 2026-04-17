import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HeadcountRequestDialog from '@/components/panels/HeadcountRequestDialog';
import type {
  ApprovalChain,
  BudgetEnvelope,
  Employee,
  Scenario,
} from '@/types';

const scenario: Scenario = {
  _id: 'scn-1',
  orgId: 'org-1',
  name: 'Plan',
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

const chain: ApprovalChain = {
  _id: 'chain-std',
  orgId: 'org-1',
  name: 'Standard',
  steps: [{ role: 'Manager', approverIds: ['u1'] }],
  conditions: {},
  priority: 0,
  isDefault: true,
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

const alice: Employee = {
  _id: 'emp-1',
  scenarioId: 'scn-1',
  name: 'Alice',
  title: 'Engineer',
  department: 'Engineering',
  level: 'IC3',
  location: 'Remote',
  salary: 130_000,
  equity: 20_000,
  employmentType: 'FTE',
  status: 'Active',
  managerId: null,
  order: 0,
};

const bob: Employee = {
  _id: 'emp-2',
  scenarioId: 'scn-1',
  name: 'Bob',
  title: 'Senior Engineer',
  department: 'Engineering',
  level: 'IC4',
  location: 'Remote',
  salary: 180_000,
  equity: 40_000,
  employmentType: 'FTE',
  status: 'Active',
  managerId: null,
  order: 0,
};

const engineeringEnvelope: BudgetEnvelope = {
  _id: 'env-1',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  department: 'Engineering',
  totalBudget: 500_000,
  headcountCap: 10,
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

vi.mock('@/stores/orgStore', () => ({
  useOrgStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      currentScenario: scenario,
      employees: [alice, bob],
    };
    return selector ? selector(state) : state;
  },
}));

const submitRequest = vi.fn(async () => ({ _id: 'r1' }));
vi.mock('@/stores/approvalStore', () => ({
  useApprovalStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      chains: [chain],
      submitRequest,
    }),
}));

const fetchEnvelopes = vi.fn(async () => {});
vi.mock('@/stores/budgetStore', () => ({
  useBudgetStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { envelopes: [engineeringEnvelope], fetchEnvelopes };
    return selector ? selector(state) : state;
  },
}));

describe('HeadcountRequestDialog VAL-APPROVAL-002 — compensation change mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a mode toggle with New Hire and Comp Change tabs', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    expect(screen.getByTestId('mode-new-hire')).toBeInTheDocument();
    expect(screen.getByTestId('mode-comp-change')).toBeInTheDocument();
  });

  it('selecting Comp Change reveals an employee selector', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('mode-comp-change'));
    expect(
      screen.getByTestId('comp-change-employee-select'),
    ).toBeInTheDocument();
  });

  it('prefills form with current employee values when selected', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('mode-comp-change'));
    fireEvent.change(screen.getByTestId('comp-change-employee-select'), {
      target: { value: 'emp-1' },
    });
    // Salary input (placeholder 120000) should now have 130000 prefilled
    const salaryInput = screen.getByPlaceholderText('120000') as HTMLInputElement;
    expect(salaryInput.value).toBe('130000');
  });

  it('shows before/after delta when new salary differs from current', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('mode-comp-change'));
    fireEvent.change(screen.getByTestId('comp-change-employee-select'), {
      target: { value: 'emp-1' },
    });
    const salaryInput = screen.getByPlaceholderText('120000') as HTMLInputElement;
    fireEvent.change(salaryInput, { target: { value: '160000' } });
    // Delta: 160k+20k - (130k+20k) = +30k
    const deltaElem = screen.getByTestId('comp-change-delta-total');
    expect(deltaElem.textContent).toMatch(/\+\$30,000/);
  });

  it('submits comp_change requestType with targetEmployeeId', async () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('mode-comp-change'));
    fireEvent.change(screen.getByTestId('comp-change-employee-select'), {
      target: { value: 'emp-2' },
    });
    const salaryInput = screen.getByPlaceholderText('120000') as HTMLInputElement;
    fireEvent.change(salaryInput, { target: { value: '200000' } });
    fireEvent.click(screen.getByTestId('submit-request-btn'));
    await waitFor(() => {
      expect(submitRequest).toHaveBeenCalled();
    });
    const [, payload] = submitRequest.mock.calls[0] as unknown as [
      string,
      {
        requestType: string;
        targetEmployeeId: string;
        employeeData: { salary: number };
      },
    ];
    expect(payload.requestType).toBe('comp_change');
    expect(payload.targetEmployeeId).toBe('emp-2');
    expect(payload.employeeData.salary).toBe(200_000);
  });
});

describe('HeadcountRequestDialog VAL-APPROVAL-003 — budget impact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders BudgetImpactCard when a department is selected', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    // Pick Engineering and enter salary to trigger impact card
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'Engineering' },
    });
    fireEvent.change(screen.getByPlaceholderText('120000'), {
      target: { value: '200000' },
    });
    const card = screen.getByTestId('budget-impact-card');
    expect(card).toBeInTheDocument();
    // Current spend = 150k (Alice) + 220k (Bob) = 370k
    expect(screen.getByTestId('budget-impact-current').textContent).toMatch(
      /\$370,000/,
    );
    // Projected = 370k + 200k = 570k (exceeds 500k)
    expect(screen.getByTestId('budget-impact-projected').textContent).toMatch(
      /\$570,000/,
    );
    expect(screen.getByTestId('budget-impact-warning')).toBeInTheDocument();
  });

  it('comp_change uses delta (not full cost) for budget impact projection', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('mode-comp-change'));
    fireEvent.change(screen.getByTestId('comp-change-employee-select'), {
      target: { value: 'emp-1' }, // Alice, current 150k (130k salary + 20k equity)
    });
    const salaryInput = screen.getByPlaceholderText('120000') as HTMLInputElement;
    fireEvent.change(salaryInput, { target: { value: '160000' } });
    // Current = Alice (150k) + Bob (220k) = 370k (full baseline, unchanged)
    expect(screen.getByTestId('budget-impact-current').textContent).toMatch(
      /\$370,000/,
    );
    // Delta = (160k + 20k) - (130k + 20k) = +30k
    // Projected = 370k + 30k = 400k
    expect(screen.getByTestId('budget-impact-projected').textContent).toMatch(
      /\$400,000/,
    );
  });
});
