import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  ApprovalChain,
  BudgetEnvelope,
  Employee,
  Scenario,
} from '@/types';
import { computeBudgetSummary } from '@/utils/budgetMetrics';

/* ------------------------------------------------------------------ */
/*  Fix 2: client budgetMetrics normalizes department keys             */
/* ------------------------------------------------------------------ */

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

describe('computeBudgetSummary — department key normalization (Fix 2)', () => {
  it('groups envelope "Engineering " with employees "Engineering" into a single entry', () => {
    const envelopes = [
      makeEnvelope({ department: 'Engineering ', totalBudget: 300_000, headcountCap: 3 }),
    ];
    const employees = [
      makeEmployee({ _id: 'a', department: 'Engineering', salary: 100_000, equity: 0 }),
      makeEmployee({ _id: 'b', department: ' Engineering', salary: 50_000, equity: 0 }),
    ];
    const summary = computeBudgetSummary(envelopes, employees);

    // Only one Engineering row — not split across trimmed/untrimmed keys
    const engRows = summary.departments.filter(
      (d) => d.department.trim() === 'Engineering',
    );
    expect(engRows.length).toBe(1);

    const eng = engRows[0];
    expect(eng.totalBudget).toBe(300_000);
    expect(eng.actualSpend).toBe(150_000);
    expect(eng.actualHeadcount).toBe(2);
    expect(eng.remainingBudget).toBe(150_000);
    expect(eng.budgetStatus).toBe('under');
  });

  it('normalizes whitespace-only departments to "Unassigned" for envelopes and employees alike', () => {
    const envelopes = [
      makeEnvelope({ department: '   ', totalBudget: 100_000, headcountCap: 1 }),
    ];
    const employees = [
      makeEmployee({ _id: 'x', department: '   ', salary: 50_000, equity: 0 }),
    ];
    const summary = computeBudgetSummary(envelopes, employees);
    const unassigned = summary.departments.find(
      (d) => d.department === 'Unassigned',
    );
    expect(unassigned).toBeDefined();
    expect(unassigned?.totalBudget).toBe(100_000);
    expect(unassigned?.actualSpend).toBe(50_000);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix 3: Direct employee creation gating                             */
/* ------------------------------------------------------------------ */

const currentScenario: Scenario = {
  _id: 'scn-1',
  orgId: 'org-1',
  name: 'Scenario',
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

const mockAddEmployee = vi.fn(async () => ({}));

let toolbarChains: ApprovalChain[] = [];
let panelChains: ApprovalChain[] = [];

const chain: ApprovalChain = {
  _id: 'chain-1',
  orgId: 'org-1',
  name: 'Standard',
  steps: [{ role: 'Manager', approverIds: ['u2'] }],
  conditions: {},
  priority: 0,
  isDefault: true,
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
};

vi.mock('@/stores/orgStore', () => ({
  useOrgStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        employees: [],
        currentScenario,
        addEmployee: mockAddEmployee,
        updateEmployee: vi.fn(),
        removeEmployee: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
    {
      getState: vi.fn(() => ({
        employees: [],
        currentScenario,
        addEmployee: mockAddEmployee,
        updateEmployee: vi.fn(),
        removeEmployee: vi.fn(),
      })),
      setState: vi.fn(),
    },
  ),
}));

vi.mock('@/stores/selectionStore', () => ({
  useSelectionStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = { selectedIds: new Set<string>() };
      return selector ? selector(state) : state;
    },
    {
      getState: vi.fn(() => ({ selectedIds: new Set<string>() })),
    },
  ),
}));

vi.mock('@/stores/invitationStore', () => ({
  useInvitationStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { currentRole: 'admin' };
    return selector ? selector(state) : state;
  },
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

// Pointer we swap between tests to tell the shared mock which chain list to
// expose (toolbar vs panel tests use separate arrays). Use vi.hoisted so the
// factory below can read it.
const { activeChainsRef } = vi.hoisted(() => ({
  activeChainsRef: { value: [] as ApprovalChain[] },
}));

vi.mock('@/stores/approvalStore', () => ({
  useApprovalStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      chains: activeChainsRef.value,
    };
    return selector(state);
  },
}));

// Mock useUndoRedo (used by Toolbar)
vi.mock('@/hooks/useUndoRedo', () => ({
  useUndoRedo: () => ({
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
    canUndo: () => false,
    canRedo: () => false,
  }),
}));

// OverlaySelector and employees API are irrelevant to these tests; use stubs
vi.mock('@/components/panels/OverlaySelector', () => ({
  default: () => null,
}));

vi.mock('@/api/employees', () => ({
  bulkCreateEmployees: vi.fn(),
}));

// Import AFTER mocks
import Toolbar from '@/components/layout/Toolbar';
import EmployeeDetailPanel from '@/components/panels/EmployeeDetailPanel';

describe('Toolbar — Add Employee gating (Fix 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolbarChains = [];
    activeChainsRef.value = toolbarChains;
  });

  it('Add Employee is enabled when no approval chains exist', () => {
    activeChainsRef.value = [];
    const onAdd = vi.fn();
    render(
      <MemoryRouter>
        <Toolbar
          onAddEmployee={onAdd}
          statusFilters={['Active']}
          onToggleStatus={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
          isViewer={false}
        />
      </MemoryRouter>,
    );
    const btn = screen.getByTestId('add-employee-btn');
    expect(btn).not.toBeDisabled();
    expect(btn.getAttribute('data-approval-gated')).toBe('false');
    fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalled();
  });

  it('Add Employee is disabled when approval chains exist and click does not fire callback', () => {
    activeChainsRef.value = [chain];
    const onAdd = vi.fn();
    render(
      <MemoryRouter>
        <Toolbar
          onAddEmployee={onAdd}
          statusFilters={['Active']}
          onToggleStatus={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
          isViewer={false}
        />
      </MemoryRouter>,
    );
    const btn = screen.getByTestId('add-employee-btn');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('data-approval-gated')).toBe('true');
    expect(btn.getAttribute('title')).toMatch(/Request Hire/);
    fireEvent.click(btn);
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('EmployeeDetailPanel — direct creation gated when chains exist (Fix 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    panelChains = [];
    activeChainsRef.value = panelChains;
  });

  it('shows approval-gating notice and disables save when isNew + chains exist', () => {
    activeChainsRef.value = [chain];
    render(
      <EmployeeDetailPanel employee={null} isNew={true} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId('approval-gating-notice')).toBeInTheDocument();

    // Fill the name so that `!form.name.trim()` would otherwise allow saving.
    const nameInput = screen.getAllByPlaceholderText('Full name')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Person' } });

    const save = screen.getByTestId('save-employee-btn');
    expect(save).toBeDisabled();

    fireEvent.click(save);
    expect(mockAddEmployee).not.toHaveBeenCalled();
  });

  it('does not show gating notice and allows save when no chains exist', () => {
    activeChainsRef.value = [];
    render(
      <EmployeeDetailPanel employee={null} isNew={true} onClose={vi.fn()} />,
    );

    expect(screen.queryByTestId('approval-gating-notice')).not.toBeInTheDocument();

    const nameInput = screen.getAllByPlaceholderText('Full name')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Person' } });

    const save = screen.getByTestId('save-employee-btn');
    expect(save).not.toBeDisabled();
  });
});
