/**
 * Tests for user-testing planning fixes (round 4):
 *
 *   VAL-APPROVAL-009: Submitter-side "Edit & Resubmit" path is prominent
 *     and discoverable — a banner surfaces when the signed-in user has
 *     their own request in `changes_requested` state.
 *   VAL-APPROVAL-013: The disabled self-approve control renders a
 *     tooltip containing the exact contract copy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

import type {
  ApprovalChain,
  BudgetEnvelope,
  HeadcountRequest,
  OrgMember,
  OrgRole,
} from '@/types';

const user = { _id: 'user-me', email: 'me@test.io', name: 'Me' };
const org = { _id: 'org-1', name: 'Test Org' } as unknown as Record<
  string,
  unknown
>;
const scenario = { _id: 'scn-1', name: 'Baseline' } as unknown as Record<
  string,
  unknown
>;

const members: OrgMember[] = [
  { _id: 'user-me', email: 'me@test.io', name: 'Me', role: 'admin' },
  {
    _id: 'user-approver',
    email: 'ap@test.io',
    name: 'Alex Approver',
    role: 'admin',
  },
];

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

// Pending request where I'm the approver (not submitter)
const pendingRequest: HeadcountRequest = {
  _id: 'req-pending-other',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'Pending Hire',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 150_000,
    equity: 30_000,
  },
  requestedBy: 'user-approver',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'pending',
  audit: [
    {
      action: 'submit',
      performedBy: 'user-approver',
      stepIndex: 0,
      stepRole: 'Manager',
      timestamp: new Date('2026-04-17T10:00:00Z').toISOString(),
    },
  ],
  createdAt: '',
  updatedAt: '',
};

// My own pending request (so self-approve guard is tested)
const ownPendingRequest: HeadcountRequest = {
  _id: 'req-my-pending',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'My Own Hire',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 150_000,
    equity: 30_000,
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
      timestamp: new Date('2026-04-17T10:00:00Z').toISOString(),
    },
  ],
  createdAt: '',
  updatedAt: '',
};

// My own changes_requested request (so banner is tested)
const ownChangesRequestedRequest: HeadcountRequest = {
  _id: 'req-my-changes',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'Changes Needed Hire',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 150_000,
    equity: 30_000,
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
      timestamp: new Date('2026-04-17T10:00:00Z').toISOString(),
    },
    {
      action: 'request_changes',
      performedBy: 'user-approver',
      stepIndex: 0,
      stepRole: 'Manager',
      comment: 'Please justify level',
      timestamp: new Date('2026-04-17T12:00:00Z').toISOString(),
    },
  ],
  createdAt: '',
  updatedAt: '',
};

const envEng: BudgetEnvelope = {
  _id: 'env-eng',
  scenarioId: 'scn-1',
  department: 'Engineering',
  totalBudget: 1_000_000,
  headcountCap: 10,
  createdAt: '',
  updatedAt: '',
};

/* ------------------------------------------------------------------ */
/*  Store mocks                                                        */
/* ------------------------------------------------------------------ */

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user }),
}));

vi.mock('@/stores/orgStore', () => ({
  useOrgStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      currentOrg: org,
      currentScenario: scenario,
      employees: [],
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

let envelopesValue: BudgetEnvelope[] = [envEng];
const fetchEnvelopes = vi.fn(async () => {});
vi.mock('@/stores/budgetStore', () => ({
  useBudgetStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      envelopes: envelopesValue,
      fetchEnvelopes,
      clearEnvelopes: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

let chainsValue: ApprovalChain[] = [standardChain];
let requestsValue: HeadcountRequest[] = [];
let pendingApprovalsValue: HeadcountRequest[] = [];
const fetchChains = vi.fn(async () => {});
const fetchOrgRequests = vi.fn(async () => {});
const fetchPendingApprovals = vi.fn(async () => {});
const approveRequest = vi.fn(async () => {});
const rejectRequest = vi.fn(async () => {});
const requestChanges = vi.fn(async () => {});
const resubmitRequest = vi.fn(async () => {});
const bulkApprove = vi.fn(async () => {});
const bulkReject = vi.fn(async () => {});
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

// Recharts stub
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

import ApprovalsView from '@/components/views/ApprovalsView';

function renderApprovals() {
  return render(
    <MemoryRouter>
      <ApprovalsView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  chainsValue = [standardChain];
  requestsValue = [];
  pendingApprovalsValue = [];
  rolesValue = 'admin';
  envelopesValue = [envEng];
});

/* ------------------------------------------------------------------ */
/*  VAL-APPROVAL-009: Resubmit banner                                  */
/* ------------------------------------------------------------------ */

describe('ApprovalsView VAL-APPROVAL-009 — submitter resubmit surface', () => {
  it('renders a "resubmit required" banner when my request is in changes_requested', async () => {
    requestsValue = [ownChangesRequestedRequest];
    renderApprovals();
    const banner = await screen.findByTestId('resubmit-required-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/awaiting your edits/i);
    expect(
      within(banner).getByTestId('resubmit-banner-open'),
    ).toBeInTheDocument();
  });

  it('does NOT render the banner when no changes_requested requests belong to me', async () => {
    requestsValue = [pendingRequest];
    pendingApprovalsValue = [pendingRequest];
    renderApprovals();
    await screen.findByText('Pending Hire');
    expect(
      screen.queryByTestId('resubmit-required-banner'),
    ).not.toBeInTheDocument();
  });

  it('also shows my own changes_requested rows under the Pending → My queue filter', async () => {
    requestsValue = [ownChangesRequestedRequest];
    renderApprovals();
    // Default filter is pending / mine. The row for my changes_requested
    // request should still appear so I can edit & resubmit.
    expect(await screen.findByText('Changes Needed Hire')).toBeInTheDocument();
    // Row-level Edit & Resubmit button should be available
    expect(
      screen.getByTestId('resubmit-req-my-changes'),
    ).toBeInTheDocument();
  });

  it('clicking Edit & Resubmit on the banner opens the resubmit dialog', async () => {
    requestsValue = [ownChangesRequestedRequest];
    renderApprovals();
    fireEvent.click(await screen.findByTestId('resubmit-banner-open'));
    expect(await screen.findByTestId('resubmit-dialog')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  VAL-APPROVAL-013: Self-approve tooltip copy                        */
/* ------------------------------------------------------------------ */

describe('ApprovalsView VAL-APPROVAL-013 — disabled self-approve with exact tooltip', () => {
  it('row-level disabled Approve control has the exact contract tooltip', async () => {
    requestsValue = [ownPendingRequest];
    renderApprovals();
    const blocker = await screen.findByTestId(
      'self-approve-blocked-req-my-pending',
    );
    expect(blocker).toBeDisabled();
    expect(blocker.getAttribute('title')).toBe(
      'You cannot approve your own request.',
    );
    // Exposed label should match the tooltip copy for a11y tools.
    expect(blocker.getAttribute('aria-label')).toBe(
      'You cannot approve your own request.',
    );
    // The visible button text should say "Approve" (not "Own Request").
    expect(blocker.textContent).toMatch(/Approve/);
  });

  it('detail panel self-approve tooltip matches the exact contract copy', async () => {
    requestsValue = [ownPendingRequest];
    renderApprovals();
    fireEvent.click(await screen.findByText('My Own Hire'));
    const btn = await screen.findByTestId('detail-self-approve-disabled');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title')).toBe(
      'You cannot approve your own request.',
    );
    expect(btn.getAttribute('aria-label')).toBe(
      'You cannot approve your own request.',
    );
  });
});
