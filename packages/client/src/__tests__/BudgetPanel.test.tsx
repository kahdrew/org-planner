import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { BudgetEnvelope, Employee, OrgRole, Scenario } from '@/types';
import BudgetPanel from '@/components/panels/BudgetPanel';

/* Mock recharts so jsdom doesn't choke on SVG measurements. */
vi.mock('recharts', () => {
  const Noop = ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'recharts-stub' }, children);
  return {
    ResponsiveContainer: Noop,
    LineChart: Noop,
    Line: () => null,
    BarChart: Noop,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

let employeesValue: Employee[] = [];
let currentScenarioValue: Scenario | null = null;
vi.mock('@/stores/orgStore', () => {
  return {
    useOrgStore: (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        employees: employeesValue,
        currentScenario: currentScenarioValue,
      };
      return selector ? selector(state) : state;
    },
  };
});

let roleValue: OrgRole | null = 'owner';
vi.mock('@/stores/invitationStore', () => {
  return {
    useInvitationStore: (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = { currentRole: roleValue };
      return selector ? selector(state) : state;
    },
  };
});

/* Fake budget store */
let envelopesValue: BudgetEnvelope[] = [];
const fetchEnvelopes = vi.fn(async () => {});
const createEnvelope = vi.fn(async (_sid: string, p: Partial<BudgetEnvelope>) => {
  const env: BudgetEnvelope = {
    _id: 'env-' + Math.random().toString(36).slice(2, 9),
    orgId: 'org-1',
    scenarioId: _sid,
    department: p.department!,
    totalBudget: p.totalBudget!,
    headcountCap: p.headcountCap!,
    createdBy: 'u1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  envelopesValue = [...envelopesValue, env];
  return env;
});
const updateEnvelope = vi.fn(
  async (_sid: string, id: string, updates: Partial<BudgetEnvelope>) => {
    envelopesValue = envelopesValue.map((e) =>
      e._id === id ? { ...e, ...updates } : e,
    );
  },
);
const deleteEnvelope = vi.fn(async (_sid: string, id: string) => {
  envelopesValue = envelopesValue.filter((e) => e._id !== id);
});
const clearEnvelopes = vi.fn(() => {
  envelopesValue = [];
});

vi.mock('@/stores/budgetStore', () => {
  return {
    useBudgetStore: (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        envelopes: envelopesValue,
        loading: false,
        error: null,
        fetchEnvelopes,
        createEnvelope,
        updateEnvelope,
        deleteEnvelope,
        clearEnvelopes,
      };
      return selector ? selector(state) : state;
    },
  };
});

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
    headcountCap: 10,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const SCEN: Scenario = {
  _id: 'scen-1',
  orgId: 'org-1',
  name: 'Baseline FY26',
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('BudgetPanel', () => {
  beforeEach(() => {
    employeesValue = [];
    envelopesValue = [];
    currentScenarioValue = SCEN;
    roleValue = 'owner';
    fetchEnvelopes.mockClear();
    createEnvelope.mockClear();
    updateEnvelope.mockClear();
    deleteEnvelope.mockClear();
    clearEnvelopes.mockClear();
  });

  it('returns null when closed', () => {
    const { container } = render(<BudgetPanel open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders and fetches envelopes on open', () => {
    render(<BudgetPanel open onClose={vi.fn()} />);
    expect(screen.getByTestId('budget-panel')).toBeInTheDocument();
    expect(fetchEnvelopes).toHaveBeenCalledWith(SCEN._id);
  });

  it('shows org-wide overview with totals', () => {
    envelopesValue = [
      makeEnvelope({ department: 'Engineering', totalBudget: 500_000, headcountCap: 5 }),
      makeEnvelope({ department: 'Sales', totalBudget: 200_000, headcountCap: 3 }),
    ];
    employeesValue = [
      makeEmployee({ department: 'Engineering', salary: 100_000, equity: 20_000 }),
      makeEmployee({ department: 'Sales', salary: 80_000, equity: 10_000 }),
    ];
    render(<BudgetPanel open onClose={vi.fn()} />);
    // Totals: 700k budget, 210k actual
    expect(screen.getByTestId('overview-total-budget')).toHaveTextContent(
      '$700,000',
    );
    expect(screen.getByTestId('overview-total-spend')).toHaveTextContent(
      '$210,000',
    );
    expect(screen.getByTestId('overview-remaining')).toHaveTextContent(
      '$490,000',
    );
  });

  it('shows a warning badge when department crosses 80%', () => {
    envelopesValue = [
      makeEnvelope({ department: 'Engineering', totalBudget: 100_000, headcountCap: 5 }),
    ];
    employeesValue = [
      makeEmployee({ department: 'Engineering', salary: 85_000, equity: 0 }),
    ];
    render(<BudgetPanel open onClose={vi.fn()} />);
    const row = screen.getByTestId('department-row-Engineering');
    expect(within(row).getByTestId('budget-status-warning')).toBeInTheDocument();
  });

  it('shows exceeded when actual spend meets or exceeds envelope', () => {
    envelopesValue = [
      makeEnvelope({ department: 'Engineering', totalBudget: 100_000, headcountCap: 5 }),
    ];
    employeesValue = [
      makeEmployee({ department: 'Engineering', salary: 150_000, equity: 0 }),
    ];
    render(<BudgetPanel open onClose={vi.fn()} />);
    const row = screen.getByTestId('department-row-Engineering');
    expect(within(row).getByTestId('budget-status-exceeded')).toBeInTheDocument();
    expect(within(row).getByTestId('remaining-Engineering')).toHaveTextContent(
      '-$50,000',
    );
  });

  it('displays real-time used %, remaining $, and headcount remaining per department', () => {
    envelopesValue = [
      makeEnvelope({ department: 'Engineering', totalBudget: 500_000, headcountCap: 5 }),
    ];
    employeesValue = [
      makeEmployee({ _id: 'a', salary: 200_000, equity: 0 }),
      makeEmployee({ _id: 'b', salary: 200_000, equity: 0 }),
    ];
    render(<BudgetPanel open onClose={vi.fn()} />);
    const row = screen.getByTestId('department-row-Engineering');
    expect(within(row).getByTestId('used-pct-Engineering')).toHaveTextContent('80.0%');
    expect(within(row).getByTestId('remaining-Engineering')).toHaveTextContent('$100,000');
    expect(within(row).getByTestId('hc-remaining-Engineering')).toHaveTextContent('3');
  });

  it('admin/owner can add an envelope for a new department', async () => {
    employeesValue = [];
    render(<BudgetPanel open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('add-envelope-button'));

    const form = screen.getByTestId('new-envelope-form');
    fireEvent.change(within(form).getByTestId('new-envelope-input-department'), {
      target: { value: 'Engineering' },
    });
    fireEvent.change(within(form).getByTestId('new-envelope-input-budget'), {
      target: { value: '250000' },
    });
    fireEvent.change(within(form).getByTestId('new-envelope-input-headcount'), {
      target: { value: '4' },
    });
    fireEvent.click(within(form).getByTestId('new-envelope-submit'));

    await waitFor(() => {
      expect(createEnvelope).toHaveBeenCalledWith(SCEN._id, {
        department: 'Engineering',
        totalBudget: 250_000,
        headcountCap: 4,
      });
    });
  });

  it('viewer role cannot add or edit envelopes (shows read-only notice)', () => {
    roleValue = 'viewer';
    envelopesValue = [makeEnvelope({ department: 'Engineering' })];
    employeesValue = [makeEmployee()];
    render(<BudgetPanel open onClose={vi.fn()} />);
    expect(screen.queryByTestId('add-envelope-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-envelope-Engineering')).not.toBeInTheDocument();
    expect(screen.getByTestId('viewer-notice')).toBeInTheDocument();
  });

  it('shows alert badge count when any department is warning/exceeded', () => {
    envelopesValue = [
      makeEnvelope({ department: 'Engineering', totalBudget: 100_000 }),
      makeEnvelope({ department: 'Sales', totalBudget: 100_000 }),
    ];
    employeesValue = [
      makeEmployee({ department: 'Engineering', salary: 90_000, equity: 0 }),
      makeEmployee({ department: 'Sales', salary: 150_000, equity: 0 }),
    ];
    render(<BudgetPanel open onClose={vi.fn()} />);
    expect(screen.getByTestId('budget-alert-count')).toHaveTextContent('2');
  });

  it('renders comparison chart when there is at least one envelope', () => {
    envelopesValue = [makeEnvelope({ department: 'Engineering' })];
    employeesValue = [makeEmployee({ salary: 100_000 })];
    render(<BudgetPanel open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('budget-tab-comparison'));
    expect(screen.getByTestId('budget-comparison-chart')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-row-Engineering')).toBeInTheDocument();
  });

  it('renders projection chart when there are active/planned employees', () => {
    envelopesValue = [];
    employeesValue = [makeEmployee({ salary: 100_000 })];
    render(<BudgetPanel open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('budget-tab-projection'));
    expect(screen.getByTestId('projection-chart')).toBeInTheDocument();
    expect(screen.getByTestId('projection-current')).toHaveTextContent('$120,000');
  });

  it('deletes an envelope on confirm', async () => {
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => true);
    envelopesValue = [makeEnvelope({ _id: 'to-del', department: 'Engineering' })];
    render(<BudgetPanel open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('delete-envelope-Engineering'));
    await waitFor(() => {
      expect(deleteEnvelope).toHaveBeenCalledWith(SCEN._id, 'to-del');
    });
    confirmSpy.mockRestore();
  });

  it('opens an edit form and saves updated values', async () => {
    const env = makeEnvelope({
      _id: 'edit-me',
      department: 'Engineering',
      totalBudget: 100_000,
      headcountCap: 3,
    });
    envelopesValue = [env];
    render(<BudgetPanel open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('edit-envelope-Engineering'));
    const form = screen.getByTestId('edit-Engineering-form');
    fireEvent.change(within(form).getByTestId('edit-Engineering-input-budget'), {
      target: { value: '250000' },
    });
    fireEvent.click(within(form).getByTestId('edit-Engineering-submit'));
    await waitFor(() => {
      expect(updateEnvelope).toHaveBeenCalledWith(SCEN._id, 'edit-me', {
        department: 'Engineering',
        totalBudget: 250_000,
        headcountCap: 3,
      });
    });
  });
});
