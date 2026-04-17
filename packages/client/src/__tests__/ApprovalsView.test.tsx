import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  ApprovalChain,
  HeadcountRequest,
  Organization,
  Scenario,
  User,
  OrgRole,
} from '@/types';
import ApprovalsView from '@/components/views/ApprovalsView';

// --- Store mocks ---

let currentUserValue: User | null = {
  _id: 'user-me',
  email: 'me@example.com',
  name: 'Me',
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = { user: currentUserValue };
    return selector(state);
  },
}));

const currentOrgValue: Organization | null = {
  _id: 'org-1',
  name: 'Acme',
  ownerId: 'user-owner',
  memberIds: ['user-owner', 'user-me', 'user-approver'],
};
const currentScenarioValue: Scenario | null = {
  _id: 'scn-1',
  orgId: 'org-1',
  name: 'Q1 Plan',
  createdBy: 'user-owner',
  createdAt: '',
  updatedAt: '',
};
const fetchEmployees = vi.fn(async () => {});
vi.mock('@/stores/orgStore', () => ({
  useOrgStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      currentOrg: currentOrgValue,
      currentScenario: currentScenarioValue,
      fetchEmployees,
    };
    return selector ? selector(state) : state;
  },
}));

let roleValue: OrgRole | null = 'admin';
vi.mock('@/stores/invitationStore', () => ({
  useInvitationStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { currentRole: roleValue };
    return selector ? selector(state) : state;
  },
}));

// --- Approval store fake ---

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

const baseRequest: HeadcountRequest = {
  _id: 'req-1',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'Test Hire',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    salary: 120000,
    equity: 20000,
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
      timestamp: new Date().toISOString(),
    },
  ],
  createdAt: '',
  updatedAt: '',
};

const ownRequest: HeadcountRequest = {
  ...baseRequest,
  _id: 'req-own',
  requestedBy: 'user-me',
  employeeData: {
    ...baseRequest.employeeData,
    name: 'My Own Hire',
  },
};

const approvedRequest: HeadcountRequest = {
  ...baseRequest,
  _id: 'req-approved',
  status: 'approved',
  employeeData: { ...baseRequest.employeeData, name: 'Approved Hire' },
};

const approveRequest = vi.fn(async () => {});
const rejectRequest = vi.fn(async () => {});
const requestChanges = vi.fn(async () => {});
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

describe('ApprovalsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainsValue = [standardChain];
    requestsValue = [baseRequest, ownRequest, approvedRequest];
    pendingApprovalsValue = [baseRequest]; // only baseRequest is actionable for me
    roleValue = 'admin';
    currentUserValue = {
      _id: 'user-me',
      email: 'me@example.com',
      name: 'Me',
    };
  });

  it('fetches chains, requests, and pending approvals on mount', async () => {
    renderView();
    await waitFor(() => {
      expect(fetchChains).toHaveBeenCalledWith('org-1');
      expect(fetchOrgRequests).toHaveBeenCalledWith('org-1');
      expect(fetchPendingApprovals).toHaveBeenCalledWith('org-1');
    });
  });

  it('renders requests table with status badges', async () => {
    renderView();
    expect(await screen.findByText('Test Hire')).toBeInTheDocument();
    expect(screen.getByText('My Own Hire')).toBeInTheDocument();
  });

  it('shows "Own Request" blocker (disabled) for the submitter\'s own pending request', async () => {
    renderView();
    const blockerBtn = await screen.findByTestId(
      'self-approve-blocked-req-own',
    );
    expect(blockerBtn).toBeDisabled();
  });

  it('shows approve/reject/changes action buttons for actionable requests', async () => {
    renderView();
    expect(await screen.findByTestId('approve-req-1')).toBeInTheDocument();
    expect(screen.getByTestId('reject-req-1')).toBeInTheDocument();
    expect(screen.getByTestId('changes-req-1')).toBeInTheDocument();
    // Non-actionable request (approved) should not have these buttons
    expect(screen.queryByTestId('approve-req-approved')).toBeNull();
  });

  it('clicking approve opens dialog and calls approveRequest with comment', async () => {
    renderView();
    const approveBtn = await screen.findByTestId('approve-req-1');
    fireEvent.click(approveBtn);

    const textarea = await screen.findByPlaceholderText(/Looks good/i);
    fireEvent.change(textarea, { target: { value: 'looks good' } });

    // The action dialog's confirm button (the last Approve Request button)
    const confirmBtns = screen.getAllByRole('button', {
      name: /^Approve Request$/i,
    });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);

    await waitFor(() => {
      expect(approveRequest).toHaveBeenCalledWith('req-1', 'looks good');
    });
  });

  it('reject requires a reason; submit is disabled without one', async () => {
    renderView();
    fireEvent.click(await screen.findByTestId('reject-req-1'));
    const textarea = await screen.findByPlaceholderText(/explain your decision/i);
    const confirmBtn = screen.getByRole('button', { name: /^Reject Request$/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'Budget cuts' } });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(rejectRequest).toHaveBeenCalledWith('req-1', 'Budget cuts');
    });
  });

  it('bulk-approve appears after selecting actionable requests', async () => {
    renderView();
    const checkbox = (await screen.findByLabelText(
      'Select Test Hire',
    )) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(
      await screen.findByText(/1 request selected/i),
    ).toBeInTheDocument();
    const bulkBtn = screen.getByTestId('bulk-approve-btn');
    fireEvent.click(bulkBtn);
    // The action dialog appears
    const confirmBtns = await screen.findAllByRole('button', {
      name: /^Approve Request$/i,
    });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);
    await waitFor(() => {
      expect(bulkApprove).toHaveBeenCalledWith(['req-1'], '');
    });
  });

  it('filter tabs show correct counts and filter the table', async () => {
    renderView();
    const approvedTab = await screen.findByTestId('filter-approved');
    fireEvent.click(approvedTab);
    expect(screen.getByText('Approved Hire')).toBeInTheDocument();
    expect(screen.queryByText('Test Hire')).toBeNull();
  });

  it('clicking a candidate name opens the detail panel with audit trail', async () => {
    renderView();
    fireEvent.click(await screen.findByText('Test Hire'));
    expect(
      await screen.findByText('Request Details'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('audit-trail')).toBeInTheDocument();
  });
});
