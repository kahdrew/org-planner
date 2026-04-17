/**
 * VAL-BUDGET-004/007: ApprovalsView must surface over-budget / at-risk
 * warning indicators per request row based on the department's envelope
 * and the request's projected impact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const currentUserValue: User = {
  _id: 'user-me',
  email: 'me@example.com',
  name: 'Me',
};

const currentOrgValue: Organization = {
  _id: 'org-1',
  name: 'Acme',
  ownerId: 'user-me',
  memberIds: ['user-me', 'user-approver'],
};

const currentScenarioValue: Scenario = {
  _id: 'scn-1',
  orgId: 'org-1',
  name: 'Q1 Plan',
  createdBy: 'user-me',
  createdAt: '',
  updatedAt: '',
};

const membersValue: OrgMember[] = [
  { _id: 'user-me', email: 'me@example.com', name: 'Me', role: 'owner' },
  {
    _id: 'user-approver',
    email: 'a@example.com',
    name: 'Approver',
    role: 'admin',
  },
];

const existingEng: Employee = {
  _id: 'emp-1',
  scenarioId: 'scn-1',
  name: 'Existing',
  title: 'Eng',
  department: 'Engineering',
  level: 'IC3',
  location: 'SF',
  employmentType: 'FTE',
  status: 'Active',
  managerId: null,
  order: 0,
  salary: 300_000,
  equity: 100_000,
};

const envelope: BudgetEnvelope = {
  _id: 'env-1',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  department: 'Engineering',
  totalBudget: 500_000,
  headcountCap: 3,
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

// This request will push Engineering over budget (400k existing + 200k new = 600k > 500k)
const overBudgetRequest: HeadcountRequest = {
  _id: 'req-over',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'Over Budget Hire',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC4',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 180_000,
    equity: 20_000,
  },
  requestedBy: 'user-other',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'pending',
  audit: [],
  createdAt: '',
  updatedAt: '',
};

// 400k existing + 50k = 450k → 90% → warning band
const atRiskRequest: HeadcountRequest = {
  _id: 'req-warn',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'At Risk Hire',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC2',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 40_000,
    equity: 10_000,
  },
  requestedBy: 'user-other',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'pending',
  audit: [],
  createdAt: '',
  updatedAt: '',
};

// Request for a department with no envelope → no status indicator
const unbudgetedRequest: HeadcountRequest = {
  _id: 'req-ub',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'Unbudgeted Hire',
    title: 'Engineer',
    department: 'Marketing',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 90_000,
    equity: 0,
  },
  requestedBy: 'user-other',
  chainId: 'chain-std',
  currentStep: 0,
  status: 'pending',
  audit: [],
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
      employees: [existingEng],
      fetchEmployees,
    };
    return selector ? selector(state) : state;
  },
}));

let roleValue: OrgRole | null = 'owner';
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

const chainsValue: ApprovalChain[] = [standardChain];
let requestsValue: HeadcountRequest[] = [];
let pendingApprovalsValue: HeadcountRequest[] = [];

vi.mock('@/stores/approvalStore', () => ({
  useApprovalStore: (selector?: (s: Record<string, unknown>) => unknown) => {
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

import ApprovalsView from '@/components/views/ApprovalsView';

function renderView() {
  return render(
    <MemoryRouter>
      <ApprovalsView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  roleValue = 'owner';
  requestsValue = [overBudgetRequest, atRiskRequest, unbudgetedRequest];
  // All pending at step 0 → I (owner) act on them; owner-me is not in
  // chain but listing assumes items my queue can act on come via
  // pendingApprovals.  For rendering filter by status we use "All pending".
  pendingApprovalsValue = [
    overBudgetRequest,
    atRiskRequest,
    unbudgetedRequest,
  ];
});

describe('ApprovalsView budget warning badges (VAL-BUDGET-004/007)', () => {
  it('shows Over badge on requests that push department past 100% budget', async () => {
    renderView();
    expect(
      await screen.findByTestId('budget-exceeded-req-over'),
    ).toBeInTheDocument();
  });

  it('shows At risk badge on requests that push department into 80-99% band', async () => {
    renderView();
    expect(
      await screen.findByTestId('budget-warning-req-warn'),
    ).toBeInTheDocument();
  });

  it('does not show any indicator for departments without an envelope', async () => {
    renderView();
    // Ensure the row exists
    expect(await screen.findByText('Unbudgeted Hire')).toBeInTheDocument();
    expect(screen.queryByTestId('budget-exceeded-req-ub')).toBeNull();
    expect(screen.queryByTestId('budget-warning-req-ub')).toBeNull();
  });
});
