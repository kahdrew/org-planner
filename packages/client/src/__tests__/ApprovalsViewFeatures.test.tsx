import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  ApprovalChain,
  BudgetEnvelope,
  Employee,
  HeadcountRequest,
  Organization,
  OrgMember,
  OrgRole,
  Scenario,
  User,
} from '@/types';
import ApprovalsView from '@/components/views/ApprovalsView';

// --- Shared test data ---

const currentUserValue: User = {
  _id: 'user-me',
  email: 'me@example.com',
  name: 'Me',
};

const currentOrgValue: Organization = {
  _id: 'org-1',
  name: 'Acme',
  ownerId: 'user-owner',
  memberIds: ['user-owner', 'user-me', 'user-approver'],
};

const currentScenarioValue: Scenario = {
  _id: 'scn-1',
  orgId: 'org-1',
  name: 'Q1 Plan',
  createdBy: 'user-owner',
  createdAt: '',
  updatedAt: '',
};

const membersValue: OrgMember[] = [
  { _id: 'user-me', email: 'me@example.com', name: 'Me', role: 'admin' },
  {
    _id: 'user-approver',
    email: 'a@example.com',
    name: 'Alice Approver',
    role: 'admin',
  },
  {
    _id: 'user-other',
    email: 'bob@example.com',
    name: 'Bob Bystander',
    role: 'admin',
  },
  {
    _id: 'user-owner',
    email: 'o@example.com',
    name: 'Owen Owner',
    role: 'owner',
  },
];

const targetEmployee: Employee = {
  _id: 'emp-target',
  scenarioId: 'scn-1',
  name: 'Compy Changer',
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

const envelope: BudgetEnvelope = {
  _id: 'env-1',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  department: 'Engineering',
  totalBudget: 1_000_000,
  headcountCap: 10,
  createdBy: 'user-owner',
  createdAt: '',
  updatedAt: '',
};

const standardChain: ApprovalChain = {
  _id: 'chain-std',
  orgId: 'org-1',
  name: 'Standard',
  steps: [
    { role: 'Manager', approverIds: ['user-approver'] },
    { role: 'VP', approverIds: ['user-owner'] },
  ],
  conditions: {},
  priority: 0,
  isDefault: true,
  createdBy: 'user-owner',
  createdAt: '',
  updatedAt: '',
};

const actionablePending: HeadcountRequest = {
  _id: 'req-actionable',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'New Hire One',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 155_000,
    equity: 20_000,
  },
  requestedBy: 'user-other',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'pending',
  audit: [
    {
      action: 'submit',
      performedBy: 'user-other',
      stepIndex: 0,
      stepRole: 'Manager',
      timestamp: new Date('2025-01-01T12:00:00Z').toISOString(),
    },
  ],
  createdAt: '',
  updatedAt: '',
};

const pendingAtOtherStep: HeadcountRequest = {
  _id: 'req-other-step',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'Other Step Hire',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 100_000,
    equity: 10_000,
  },
  requestedBy: 'user-other',
  chainId: 'chain-std',
  currentStep: 1, // at a step the current user isn't responsible for
  status: 'pending',
  audit: [],
  createdAt: '',
  updatedAt: '',
};

const ownPending: HeadcountRequest = {
  _id: 'req-own-pending',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'My Own Pending',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 120_000,
    equity: 10_000,
  },
  requestedBy: 'user-me',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'pending',
  audit: [],
  createdAt: '',
  updatedAt: '',
};

const compChangeRequest: HeadcountRequest = {
  _id: 'req-compchg',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'comp_change',
  employeeData: {
    name: targetEmployee.name,
    title: targetEmployee.title,
    department: 'Engineering',
    level: 'IC4',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 160_000,
    equity: 30_000,
  },
  targetEmployeeId: 'emp-target',
  requestedBy: 'user-other',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'pending',
  audit: [
    {
      action: 'submit',
      performedBy: 'user-other',
      stepIndex: 0,
      stepRole: 'Manager',
      timestamp: new Date('2025-01-02T12:00:00Z').toISOString(),
    },
    {
      action: 'request_changes',
      performedBy: 'user-approver',
      stepIndex: 0,
      stepRole: 'Manager',
      comment: 'Please justify.',
      timestamp: new Date('2025-01-03T12:00:00Z').toISOString(),
    },
  ],
  createdAt: '',
  updatedAt: '',
};

const myChangesRequested: HeadcountRequest = {
  _id: 'req-my-cr',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'My Request Needs Edits',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 130_000,
    equity: 15_000,
    justification: 'Needed urgently',
  },
  requestedBy: 'user-me',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'changes_requested',
  audit: [
    {
      action: 'submit',
      performedBy: 'user-me',
      stepIndex: 0,
      stepRole: 'Manager',
      timestamp: new Date('2025-01-02T08:00:00Z').toISOString(),
    },
    {
      action: 'request_changes',
      performedBy: 'user-approver',
      stepIndex: 0,
      stepRole: 'Manager',
      comment: 'Please revise',
      timestamp: new Date('2025-01-02T09:00:00Z').toISOString(),
    },
    {
      action: 'resubmit',
      performedBy: 'user-me',
      stepIndex: 0,
      stepRole: 'Manager',
      timestamp: new Date('2025-01-02T10:00:00Z').toISOString(),
    },
  ],
  createdAt: '',
  updatedAt: '',
};

// --- Mocks ---

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: currentUserValue }),
}));

const fetchEmployees = vi.fn(async () => {});
vi.mock('@/stores/orgStore', () => ({
  useOrgStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      currentOrg: currentOrgValue,
      currentScenario: currentScenarioValue,
      employees: [targetEmployee],
      fetchEmployees,
    };
    return selector ? selector(state) : state;
  },
}));

let roleValue: OrgRole | null = 'admin';
const fetchMembers = vi.fn(async () => {});
vi.mock('@/stores/invitationStore', () => ({
  useInvitationStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      currentRole: roleValue,
      members: membersValue,
      fetchMembers,
    };
    return selector ? selector(state) : state;
  },
}));

const fetchEnvelopes = vi.fn(async () => {});
vi.mock('@/stores/budgetStore', () => ({
  useBudgetStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { envelopes: [envelope], fetchEnvelopes };
    return selector ? selector(state) : state;
  },
}));

const approveRequest = vi.fn(async () => {});
const rejectRequest = vi.fn(async () => {});
const requestChanges = vi.fn(async () => {});
const resubmitRequest = vi.fn(async () => {});
const bulkApprove = vi.fn(async () => {});
const bulkReject = vi.fn(async () => {});
const fetchChains = vi.fn(async () => {});
const fetchOrgRequests = vi.fn(async () => {});
const fetchPendingApprovals = vi.fn(async () => {});

let chainsValue: ApprovalChain[] = [standardChain];
let requestsValue: HeadcountRequest[] = [];
let pendingApprovalsValue: HeadcountRequest[] = [];

vi.mock('@/stores/approvalStore', () => ({
  useApprovalStore: (
    selector?: (s: Record<string, unknown>) => unknown,
  ) => {
    const state = {
      chains: chainsValue,
      requests: requestsValue,
      pendingApprovals: pendingApprovalsValue,
      loading: false,
      error: null,
      fetchChains,
      fetchOrgRequests,
      fetchPendingApprovals,
      approveRequest,
      rejectRequest,
      requestChanges,
      resubmitRequest,
      bulkApprove,
      bulkReject,
    };
    return selector ? selector(state) : state;
  },
}));

function renderView() {
  return render(
    <MemoryRouter>
      <ApprovalsView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  chainsValue = [standardChain];
  requestsValue = [
    actionablePending,
    pendingAtOtherStep,
    ownPending,
    compChangeRequest,
    myChangesRequested,
  ];
  // The current user is only an approver for `actionablePending`.
  pendingApprovalsValue = [actionablePending, compChangeRequest];
  roleValue = 'admin';
});

describe('ApprovalsView VAL-APPROVAL-005 — filter to actionable', () => {
  it('by default pending tab shows items actionable by me + my submissions, hides others', async () => {
    renderView();
    // actionable
    expect(
      await screen.findByText('New Hire One'),
    ).toBeInTheDocument();
    // comp change request (actionable by me per pendingApprovalsValue)
    expect(screen.getByText('Compy Changer')).toBeInTheDocument();
    // my own submission still shown (submitter sees own)
    expect(screen.getByText('My Own Pending')).toBeInTheDocument();
    // pending at step 1 (not my step, not mine) is hidden
    expect(screen.queryByText('Other Step Hire')).toBeNull();
  });

  it('toggling to "All pending" shows all pending items regardless of approver', async () => {
    renderView();
    fireEvent.click(await screen.findByTestId('pending-scope-all'));
    expect(screen.getByText('Other Step Hire')).toBeInTheDocument();
    expect(screen.getByText('New Hire One')).toBeInTheDocument();
  });
});

describe('ApprovalsView VAL-APPROVAL-008/010 — notification dots', () => {
  it('renders pulse dot on rows actionable by the current user', async () => {
    renderView();
    expect(
      await screen.findByTestId('pending-dot-req-actionable'),
    ).toBeInTheDocument();
    // No dot on the user's own request (not actionable)
    expect(screen.queryByTestId('pending-dot-req-own-pending')).toBeNull();
  });
});

describe('ApprovalsView VAL-APPROVAL-013 — self-approval prevention', () => {
  it('disables approve button on own pending request with tooltip', async () => {
    renderView();
    const blockerBtn = await screen.findByTestId(
      'self-approve-blocked-req-own-pending',
    );
    expect(blockerBtn).toBeDisabled();
    expect(blockerBtn.getAttribute('title')).toMatch(
      /cannot approve your own request/i,
    );
  });
});

describe('ApprovalsView VAL-APPROVAL-002 — comp change delta & type badge', () => {
  it('renders Comp Change badge in the list row', async () => {
    renderView();
    expect(
      await screen.findByTestId('request-type-req-compchg'),
    ).toHaveTextContent(/Comp Change/i);
  });

  it('shows before/after delta when opening the comp change detail', async () => {
    renderView();
    fireEvent.click(await screen.findByText('Compy Changer'));
    expect(
      await screen.findByTestId('comp-change-delta-detail'),
    ).toBeInTheDocument();
    // Current total = 130k + 20k = 150k
    // New total = 160k + 30k = 190k
    // Delta = +40k
    const delta = await screen.findByTestId('comp-change-delta-value');
    expect(delta.textContent).toMatch(/\+\$40,000/);
  });
});

describe('ApprovalsView VAL-APPROVAL-003 — budget impact in detail', () => {
  it('shows BudgetImpactCard in request detail panel', async () => {
    renderView();
    fireEvent.click(await screen.findByText('New Hire One'));
    const card = await screen.findByTestId('budget-impact-card');
    expect(card).toBeInTheDocument();
    // Current spend for Engineering = 130k + 20k (target) = 150k
    expect(screen.getByTestId('budget-impact-current').textContent).toMatch(
      /\$150,000/,
    );
    // Projected = current + 175k (new hire comp) = 325k
    expect(screen.getByTestId('budget-impact-projected').textContent).toMatch(
      /\$325,000/,
    );
  });
});

describe('ApprovalsView VAL-APPROVAL-012 — audit trail actor names', () => {
  it('shows actor names and timestamps, and marks resubmit entries', async () => {
    renderView();
    // Switch to Changes Requested filter to surface the my-cr row
    fireEvent.click(await screen.findByTestId('filter-changes_requested'));
    // Open my changes_requested detail
    fireEvent.click(await screen.findByText('My Request Needs Edits'));
    const audit = await screen.findByTestId('audit-trail');
    expect(audit).toBeInTheDocument();
    // Three audit entries
    expect(audit.children.length).toBe(3);
    // First entry: submitted by "Me" (self → "You")
    expect(screen.getByTestId('audit-actor-0').textContent).toMatch(/You/);
    // Second entry: request_changes by "Alice Approver"
    expect(screen.getByTestId('audit-actor-1').textContent).toMatch(
      /Alice Approver/,
    );
    // Third entry: resubmit — badge visible
    expect(
      screen.getByTestId('audit-resubmit-badge-2'),
    ).toBeInTheDocument();
  });
});

describe('ApprovalsView VAL-APPROVAL-009 — resubmit flow', () => {
  it('shows Edit & Resubmit button for submitter on changes_requested', async () => {
    renderView();
    fireEvent.click(await screen.findByTestId('filter-changes_requested'));
    expect(
      await screen.findByTestId('resubmit-req-my-cr'),
    ).toBeInTheDocument();
  });

  it('clicking Edit & Resubmit opens the dialog and resubmits on confirm', async () => {
    renderView();
    fireEvent.click(await screen.findByTestId('filter-changes_requested'));
    fireEvent.click(await screen.findByTestId('resubmit-req-my-cr'));
    const dialog = await screen.findByTestId('resubmit-dialog');
    expect(dialog).toBeInTheDocument();

    const salaryInput = screen.getByTestId('resubmit-salary');
    fireEvent.change(salaryInput, { target: { value: '145000' } });

    fireEvent.click(screen.getByTestId('resubmit-confirm-btn'));

    await waitFor(() => {
      expect(resubmitRequest).toHaveBeenCalledWith(
        'req-my-cr',
        expect.objectContaining({ salary: 145_000 }),
      );
    });
  });
});
