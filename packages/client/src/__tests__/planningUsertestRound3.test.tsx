import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { createElement } from 'react';
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

// --- Shared fixtures ---

const user: User = {
  _id: 'user-me',
  email: 'me@example.com',
  name: 'Me',
};

const org: Organization = {
  _id: 'org-1',
  name: 'Acme',
  ownerId: 'user-me',
  memberIds: ['user-me', 'user-approver', 'user-submitter'],
};

const scenario: Scenario = {
  _id: 'scn-1',
  orgId: 'org-1',
  name: 'Plan',
  createdBy: 'user-me',
  createdAt: '',
  updatedAt: '',
};

const members: OrgMember[] = [
  { _id: 'user-me', email: 'me@example.com', name: 'Me', role: 'owner' },
  {
    _id: 'user-approver',
    email: 'ap@example.com',
    name: 'Alice Approver',
    role: 'admin',
  },
  {
    _id: 'user-submitter',
    email: 'sub@example.com',
    name: 'Sam Submitter',
    role: 'admin',
  },
];

const employee: Employee = {
  _id: 'emp-1',
  scenarioId: 'scn-1',
  name: 'Existing Eng',
  title: 'Engineer',
  department: 'Engineering',
  level: 'IC3',
  location: 'Remote',
  salary: 100_000,
  equity: 20_000,
  employmentType: 'FTE',
  status: 'Active',
  managerId: null,
  order: 0,
};

const envEng: BudgetEnvelope = {
  _id: 'env-eng',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  department: 'Engineering',
  totalBudget: 1_000_000,
  headcountCap: 10,
  createdBy: 'user-me',
  createdAt: '',
  updatedAt: '',
};

const envSales: BudgetEnvelope = {
  _id: 'env-sales',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  department: 'Sales',
  totalBudget: 500_000,
  headcountCap: 5,
  createdBy: 'user-me',
  createdAt: '',
  updatedAt: '',
};

const standardChain: ApprovalChain = {
  _id: 'chain-std',
  orgId: 'org-1',
  name: 'Standard',
  steps: [{ role: 'Manager', approverIds: ['user-approver'] }],
  conditions: {},
  priority: 0,
  isDefault: true,
  createdBy: 'user-me',
  createdAt: '',
  updatedAt: '',
};

const pendingNewHire: HeadcountRequest = {
  _id: 'req-pending-new',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'New Engineer',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 150_000,
    equity: 30_000,
  },
  requestedBy: 'user-submitter',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'pending',
  audit: [
    {
      action: 'submit',
      performedBy: 'user-submitter',
      stepIndex: 0,
      stepRole: 'Manager',
      timestamp: new Date('2025-01-01T10:00:00Z').toISOString(),
    },
  ],
  createdAt: '',
  updatedAt: '',
};

const resubmittedRequest: HeadcountRequest = {
  _id: 'req-resubmitted',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'Edited Hire',
    title: 'Senior Engineer',
    department: 'Engineering',
    level: 'IC4',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 175_000,
    equity: 40_000,
  },
  requestedBy: 'user-me',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'pending',
  audit: [
    {
      action: 'submit',
      performedBy: 'user-me',
      stepIndex: 0,
      stepRole: 'Manager',
      timestamp: new Date('2025-01-01T10:00:00Z').toISOString(),
    },
    {
      action: 'request_changes',
      performedBy: 'user-approver',
      stepIndex: 0,
      stepRole: 'Manager',
      comment: 'Please justify the level.',
      timestamp: new Date('2025-01-02T10:00:00Z').toISOString(),
    },
    {
      action: 'resubmit',
      performedBy: 'user-me',
      stepIndex: 0,
      stepRole: 'Manager',
      timestamp: new Date('2025-01-03T10:00:00Z').toISOString(),
      changes: [
        { field: 'title', from: 'Engineer', to: 'Senior Engineer' },
        { field: 'level', from: 'IC3', to: 'IC4' },
        { field: 'salary', from: 150_000, to: 175_000 },
      ],
    },
  ],
  createdAt: '',
  updatedAt: '',
};

// --- Shared store mocks ---

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user }),
}));

vi.mock('@/stores/orgStore', () => ({
  useOrgStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      currentOrg: org,
      currentScenario: scenario,
      employees: [employee],
      fetchEmployees: vi.fn(async () => {}),
    };
    return selector ? selector(state) : state;
  },
}));

let rolesValue: OrgRole | null = 'admin';
const fetchMembers = vi.fn(async () => {});
vi.mock('@/stores/invitationStore', () => ({
  useInvitationStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      currentRole: rolesValue,
      members,
      fetchMembers,
    };
    return selector ? selector(state) : state;
  },
}));

let envelopesValue: BudgetEnvelope[] = [envEng, envSales];
const fetchEnvelopes = vi.fn(async () => {});
const clearEnvelopes = vi.fn(() => {});
vi.mock('@/stores/budgetStore', () => ({
  useBudgetStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      envelopes: envelopesValue,
      fetchEnvelopes,
      clearEnvelopes,
    };
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

// Stub recharts heavy SVG rendering for the dashboard test cases.
vi.mock('recharts', () => {
  const Noop = ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'recharts-stub' }, children);
  return {
    ResponsiveContainer: Noop,
    LineChart: Noop,
    Line: () => null,
    BarChart: Noop,
    Bar: () => null,
    PieChart: Noop,
    Pie: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

// --- Imports after mocks ---
import DashboardView from '@/components/views/DashboardView';
import ApprovalsView from '@/components/views/ApprovalsView';
import NotificationBell from '@/components/panels/NotificationBell';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardView />
    </MemoryRouter>,
  );
}

function renderApprovals() {
  return render(
    <MemoryRouter>
      <ApprovalsView />
    </MemoryRouter>,
  );
}

function renderBell() {
  return render(<NotificationBell />);
}

beforeEach(() => {
  vi.clearAllMocks();
  chainsValue = [standardChain];
  requestsValue = [pendingNewHire, resubmittedRequest];
  pendingApprovalsValue = [pendingNewHire];
  rolesValue = 'admin';
  envelopesValue = [envEng, envSales];
});

// ----------------------------------------------------------------------
// VAL-BUDGET-007 — Department Budget Breakdown table in DashboardView
// ----------------------------------------------------------------------

describe('DashboardView VAL-BUDGET-007 — department budget breakdown', () => {
  it('renders a table with columns: Department, Envelope, Committed, Planned, Remaining, Utilization %', () => {
    renderDashboard();
    const table = screen.getByTestId('budget-breakdown-table');
    expect(table).toBeInTheDocument();
    const head = within(table).getAllByRole('columnheader');
    const headTexts = head.map((h) => h.textContent?.trim());
    expect(headTexts).toEqual([
      'Department',
      'Envelope',
      'Committed',
      'Planned',
      'Remaining',
      'Utilization %',
    ]);
  });

  it('shows per-department envelope, committed, and planned values', () => {
    // Isolate to a single pending new-hire request so the expected math is
    // straightforward: envelope=1M, committed=120k, planned=180k.
    requestsValue = [pendingNewHire];
    pendingApprovalsValue = [pendingNewHire];
    renderDashboard();
    expect(
      screen.getByTestId('breakdown-envelope-Engineering').textContent,
    ).toMatch(/\$1,000,000/);
    expect(
      screen.getByTestId('breakdown-committed-Engineering').textContent,
    ).toMatch(/\$120,000/);
    expect(
      screen.getByTestId('breakdown-planned-Engineering').textContent,
    ).toMatch(/\$180,000/);
    // Remaining = 1,000,000 - 120,000 - 180,000 = 700,000
    expect(
      screen.getByTestId('breakdown-remaining-Engineering').textContent,
    ).toMatch(/\$700,000/);
    // Utilization = (120,000 + 180,000) / 1,000,000 = 30%
    expect(
      screen.getByTestId('breakdown-utilization-Engineering').textContent,
    ).toMatch(/30\.0%/);
  });

  it('shows Sales department with zero committed/planned spend', () => {
    renderDashboard();
    expect(
      screen.getByTestId('breakdown-envelope-Sales').textContent,
    ).toMatch(/\$500,000/);
    expect(
      screen.getByTestId('breakdown-committed-Sales').textContent,
    ).toMatch(/\$0/);
    expect(
      screen.getByTestId('breakdown-planned-Sales').textContent,
    ).toMatch(/\$0/);
    expect(
      screen.getByTestId('breakdown-utilization-Sales').textContent,
    ).toMatch(/0\.0%/);
  });
});

// ----------------------------------------------------------------------
// VAL-APPROVAL-013 — Disabled Approve button with tooltip in detail
// ----------------------------------------------------------------------

describe('ApprovalsView VAL-APPROVAL-013 — self-approve detail guard', () => {
  it('shows disabled Approve button in detail panel with tooltip for the submitter', async () => {
    renderApprovals();
    // Switch to Changes Requested filter to surface resubmittedRequest
    fireEvent.click(await screen.findByTestId('pending-scope-all'));
    // Open detail for my own request
    fireEvent.click(screen.getByText('Edited Hire'));
    const btn = await screen.findByTestId('detail-self-approve-disabled');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title')).toMatch(
      /cannot approve your own request/i,
    );
  });

  it('shows enabled Approve/Reject/Request Changes buttons in detail panel for an approver', async () => {
    renderApprovals();
    // pendingNewHire is actionable for current user (me in pendingApprovalsValue)
    fireEvent.click(await screen.findByText('New Engineer'));
    expect(screen.getByTestId('detail-approve-btn')).toBeEnabled();
    expect(screen.getByTestId('detail-reject-btn')).toBeEnabled();
    expect(screen.getByTestId('detail-request-changes-btn')).toBeEnabled();
    // No self-approve guard shown
    expect(screen.queryByTestId('detail-self-approve-disabled')).toBeNull();
  });
});

// ----------------------------------------------------------------------
// VAL-APPROVAL-012 — editHistory rendered in audit trail
// ----------------------------------------------------------------------

describe('ApprovalsView VAL-APPROVAL-012 — edit history in audit trail', () => {
  it('renders changed fields on a resubmit audit entry', async () => {
    renderApprovals();
    fireEvent.click(await screen.findByTestId('pending-scope-all'));
    fireEvent.click(screen.getByText('Edited Hire'));
    // The resubmit entry is the third audit entry (index 2)
    const edit = await screen.findByTestId('audit-edit-history-2');
    expect(edit).toBeInTheDocument();
    // Three change entries
    expect(
      screen.getByTestId('audit-edit-history-2-title').textContent,
    ).toMatch(/Engineer.*Senior Engineer/);
    expect(
      screen.getByTestId('audit-edit-history-2-level').textContent,
    ).toMatch(/IC3.*IC4/);
    expect(
      screen.getByTestId('audit-edit-history-2-salary').textContent,
    ).toMatch(/150,000.*175,000/);
  });
});

// ----------------------------------------------------------------------
// VAL-APPROVAL-010 — Notification bell dropdown
// ----------------------------------------------------------------------

describe('NotificationBell VAL-APPROVAL-010', () => {
  it('renders a badge with count of items awaiting current user', async () => {
    renderBell();
    expect(await screen.findByTestId('notification-bell-btn')).toBeInTheDocument();
    expect(
      screen.getByTestId('notification-bell-badge').textContent,
    ).toMatch(/1/);
  });

  it('opens a dropdown listing recent events with timestamps', async () => {
    renderBell();
    fireEvent.click(await screen.findByTestId('notification-bell-btn'));
    const dropdown = await screen.findByTestId('notification-dropdown');
    expect(dropdown).toBeInTheDocument();
    const list = screen.getByTestId('notification-list');
    // 1 event from pendingNewHire + 3 events from resubmittedRequest = 4
    expect(list.children.length).toBe(4);
    // There should be at least one timestamp
    const times = list.querySelectorAll('[data-testid^="notification-time-"]');
    expect(times.length).toBe(4);
  });

  it('dropdown shows empty state if there are no events', async () => {
    requestsValue = [];
    pendingApprovalsValue = [];
    renderBell();
    fireEvent.click(await screen.findByTestId('notification-bell-btn'));
    expect(await screen.findByTestId('notification-empty')).toBeInTheDocument();
  });
});
