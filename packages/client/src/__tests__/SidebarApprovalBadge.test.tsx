import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import type { HeadcountRequest, Organization, Scenario } from '@/types';

const org: Organization = {
  _id: 'org-1',
  name: 'Acme',
  ownerId: 'user-me',
  memberIds: ['user-me'],
};

const scenario: Scenario = {
  _id: 'scn-1',
  orgId: 'org-1',
  name: 'Q1',
  createdBy: 'user-me',
  createdAt: '',
  updatedAt: '',
};

const fakeRequest: HeadcountRequest = {
  _id: 'r1',
  orgId: 'org-1',
  scenarioId: 'scn-1',
  requestType: 'new_hire',
  employeeData: {
    name: 'X',
    title: 'T',
    department: 'D',
    level: 'L',
    location: 'Remote',
    employmentType: 'FTE',
  },
  requestedBy: 'user-other',
  chainId: 'chain-1',
  currentStep: 0,
  status: 'pending',
  audit: [],
  createdAt: '',
  updatedAt: '',
};

vi.mock('@/stores/orgStore', () => ({
  useOrgStore: () => ({
    orgs: [org],
    currentOrg: org,
    setCurrentOrg: vi.fn(),
    createOrg: vi.fn(async () => org),
    scenarios: [scenario],
    currentScenario: scenario,
    setCurrentScenario: vi.fn(),
    fetchScenarios: vi.fn(async () => {}),
    fetchEmployees: vi.fn(async () => {}),
  }),
}));

vi.mock('@/stores/scheduledChangeStore', () => ({
  useScheduledChangeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ scheduledChanges: [] }),
}));

let pendingApprovalsValue: HeadcountRequest[] = [];

vi.mock('@/stores/approvalStore', () => ({
  useApprovalStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      pendingApprovals: pendingApprovalsValue,
      fetchPendingApprovals: vi.fn(async () => {}),
    }),
}));

vi.mock('@/components/panels/PendingInvitations', () => ({
  default: () => null,
}));

describe('Sidebar Approvals badge — VAL-APPROVAL-008/010', () => {
  beforeEach(() => {
    pendingApprovalsValue = [];
  });

  it('does not show the badge when there are no pending approvals', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('approvals-nav-badge')).toBeNull();
  });

  it('shows a pulsing badge with count when there are pending approvals', () => {
    pendingApprovalsValue = [fakeRequest];
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const badge = screen.getByTestId('approvals-nav-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('1');
    // Badge should have a pulsing CSS class
    expect(badge.className).toContain('animate-pulse');
    expect(badge.getAttribute('data-pulse')).toBe('true');
  });
});
