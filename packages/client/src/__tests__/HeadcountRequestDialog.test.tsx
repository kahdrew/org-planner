import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HeadcountRequestDialog from '@/components/panels/HeadcountRequestDialog';
import type { ApprovalChain, Scenario } from '@/types';

const standardChain: ApprovalChain = {
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

const execChain: ApprovalChain = {
  _id: 'chain-exec',
  orgId: 'org-1',
  name: 'Executive',
  steps: [
    { role: 'Manager', approverIds: ['u1'] },
    { role: 'VP', approverIds: ['u2'] },
    { role: 'Finance', approverIds: ['u3'] },
    { role: 'CHRO', approverIds: ['u4'] },
  ],
  conditions: { minCost: 200000, minLevel: 'Director' },
  priority: 10,
  isDefault: false,
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

const currentScenario: Scenario = {
  _id: 'scn-1',
  orgId: 'org-1',
  name: 'Scenario',
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

vi.mock('@/stores/orgStore', () => ({
  useOrgStore: () => ({ currentScenario }),
}));

const submitRequest = vi.fn(async () => ({ _id: 'r1' }));
let chainsValue: ApprovalChain[] = [];

vi.mock('@/stores/approvalStore', () => ({
  useApprovalStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      chains: chainsValue,
      submitRequest,
    };
    return selector(state);
  },
}));

describe('HeadcountRequestDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainsValue = [standardChain, execChain];
  });

  it('renders all required form fields', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    expect(screen.getByText(/Submit Headcount Request/i)).toBeInTheDocument();
    expect(screen.getByText(/Title/i)).toBeInTheDocument();
    expect(screen.getByText(/Department/i)).toBeInTheDocument();
    expect(screen.getByText(/Level/i)).toBeInTheDocument();
    expect(screen.getByText(/Employment Type/i)).toBeInTheDocument();
    expect(screen.getByText(/Salary/i)).toBeInTheDocument();
    expect(screen.getByText(/Equity/i)).toBeInTheDocument();
    expect(screen.getByText(/Justification/i)).toBeInTheDocument();
  });

  it('shows projected total cost from salary + equity', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    const salaryInput = screen.getByPlaceholderText('120000');
    const equityInput = screen.getByPlaceholderText('25000');
    fireEvent.change(salaryInput, { target: { value: '150000' } });
    fireEvent.change(equityInput, { target: { value: '30000' } });
    expect(screen.getByText(/\$180,000/)).toBeInTheDocument();
  });

  it('previews Executive chain routing for Director + high-cost', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    const salaryInput = screen.getByPlaceholderText('120000');
    const equityInput = screen.getByPlaceholderText('25000');
    const levelInput = screen.getByPlaceholderText(/IC4/);
    fireEvent.change(salaryInput, { target: { value: '300000' } });
    fireEvent.change(equityInput, { target: { value: '100000' } });
    fireEvent.change(levelInput, { target: { value: 'Director' } });
    expect(screen.getByText(/Routed to approval chain/i)).toBeInTheDocument();
    // The chain name "Executive" is surfaced inside the budget-impact box.
    // Find it as a span with font-medium class close to the routing label.
    const routed = screen
      .getByText(/Routed to approval chain/i)
      .closest('div');
    expect(routed).not.toBeNull();
    expect(routed!.textContent).toMatch(/Executive/);
  });

  it('submit is disabled without required fields', () => {
    render(<HeadcountRequestDialog onClose={() => {}} />);
    const submitBtn = screen.getByTestId('submit-request-btn');
    expect(submitBtn).toBeDisabled();
  });

  it('submits request with the correct payload', async () => {
    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    render(
      <HeadcountRequestDialog onClose={onClose} onSubmitted={onSubmitted} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/candidate name/i), {
      target: { value: 'Priya' },
    });
    // Title: first input in the Title/Level grid (first input after "Title" label)
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    // inputs: [name, title, level, location, justification(textarea - not in textbox)]
    // Actually textarea is a textbox role. Use placeholders where possible.
    fireEvent.change(inputs[1], { target: { value: 'Senior Engineer' } });
    fireEvent.change(screen.getByPlaceholderText(/IC4/), {
      target: { value: 'IC4' },
    });
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'Engineering' },
    });
    // Location input (default "Remote" already passes validation)
    fireEvent.change(screen.getByPlaceholderText('120000'), {
      target: { value: '150000' },
    });
    fireEvent.click(screen.getByTestId('submit-request-btn'));
    await waitFor(() => {
      expect(submitRequest).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
    const call = submitRequest.mock.calls[0] as unknown as [
      string,
      { employeeData: { name: string; salary: number } },
    ];
    expect(call[0]).toBe('scn-1');
    expect(call[1].employeeData.name).toBe('Priya');
    expect(call[1].employeeData.salary).toBe(150000);
  });

  it('shows "no approval chain" warning when chains are empty', () => {
    chainsValue = [];
    render(<HeadcountRequestDialog onClose={() => {}} />);
    expect(screen.getByText(/No approval chain configured/i)).toBeInTheDocument();
    expect(screen.getByTestId('submit-request-btn')).toBeDisabled();
  });
});
