import client from './client';
import type {
  ApprovalChain,
  ApprovalStep,
  ApprovalConditions,
  HeadcountRequest,
  HeadcountRequestEmployeeData,
  HeadcountRequestStatus,
} from '@/types';

// --- Approval Chains ---

export async function getApprovalChains(orgId: string): Promise<ApprovalChain[]> {
  const { data } = await client.get<ApprovalChain[]>(
    `/orgs/${orgId}/approval-chains`,
  );
  return data;
}

export async function createApprovalChain(
  orgId: string,
  payload: {
    name: string;
    description?: string;
    steps: ApprovalStep[];
    conditions?: ApprovalConditions;
    priority?: number;
    isDefault?: boolean;
  },
): Promise<ApprovalChain> {
  const { data } = await client.post<ApprovalChain>(
    `/orgs/${orgId}/approval-chains`,
    payload,
  );
  return data;
}

export async function updateApprovalChain(
  orgId: string,
  chainId: string,
  updates: Partial<{
    name: string;
    description: string;
    steps: ApprovalStep[];
    conditions: ApprovalConditions;
    priority: number;
    isDefault: boolean;
  }>,
): Promise<ApprovalChain> {
  const { data } = await client.patch<ApprovalChain>(
    `/orgs/${orgId}/approval-chains/${chainId}`,
    updates,
  );
  return data;
}

export async function deleteApprovalChain(
  orgId: string,
  chainId: string,
): Promise<void> {
  await client.delete(`/orgs/${orgId}/approval-chains/${chainId}`);
}

// --- Headcount Requests ---

export async function submitHeadcountRequest(
  scenarioId: string,
  payload: {
    employeeData: HeadcountRequestEmployeeData;
    requestType?: 'new_hire' | 'comp_change';
    targetEmployeeId?: string;
    chainId?: string;
  },
): Promise<HeadcountRequest> {
  const { data } = await client.post<HeadcountRequest>(
    `/scenarios/${scenarioId}/headcount-requests`,
    payload,
  );
  return data;
}

export async function getScenarioRequests(
  scenarioId: string,
  status?: HeadcountRequestStatus,
): Promise<HeadcountRequest[]> {
  const query = status ? `?status=${status}` : '';
  const { data } = await client.get<HeadcountRequest[]>(
    `/scenarios/${scenarioId}/headcount-requests${query}`,
  );
  return data;
}

export async function getOrgRequests(
  orgId: string,
  filters?: { status?: HeadcountRequestStatus; scenarioId?: string },
): Promise<HeadcountRequest[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.scenarioId) params.set('scenarioId', filters.scenarioId);
  const qs = params.toString();
  const { data } = await client.get<HeadcountRequest[]>(
    `/orgs/${orgId}/headcount-requests${qs ? `?${qs}` : ''}`,
  );
  return data;
}

export async function getPendingApprovals(
  orgId: string,
): Promise<HeadcountRequest[]> {
  const { data } = await client.get<HeadcountRequest[]>(
    `/orgs/${orgId}/headcount-requests/pending`,
  );
  return data;
}

export async function getHeadcountRequest(
  id: string,
): Promise<HeadcountRequest> {
  const { data } = await client.get<HeadcountRequest>(
    `/headcount-requests/${id}`,
  );
  return data;
}

export async function approveRequest(
  id: string,
  comment?: string,
): Promise<HeadcountRequest> {
  const { data } = await client.post<HeadcountRequest>(
    `/headcount-requests/${id}/approve`,
    { comment },
  );
  return data;
}

export async function rejectRequest(
  id: string,
  comment?: string,
): Promise<HeadcountRequest> {
  const { data } = await client.post<HeadcountRequest>(
    `/headcount-requests/${id}/reject`,
    { comment },
  );
  return data;
}

export async function requestChangesOnRequest(
  id: string,
  comment?: string,
): Promise<HeadcountRequest> {
  const { data } = await client.post<HeadcountRequest>(
    `/headcount-requests/${id}/request-changes`,
    { comment },
  );
  return data;
}

export async function resubmitRequest(
  id: string,
  employeeData?: HeadcountRequestEmployeeData,
): Promise<HeadcountRequest> {
  const { data } = await client.post<HeadcountRequest>(
    `/headcount-requests/${id}/resubmit`,
    employeeData ? { employeeData } : {},
  );
  return data;
}

export async function bulkApprove(
  requestIds: string[],
  comment?: string,
): Promise<{ results: { id: string; status: string; reason?: string }[] }> {
  const { data } = await client.post(`/headcount-requests/bulk-approve`, {
    requestIds,
    comment,
  });
  return data;
}

export async function bulkReject(
  requestIds: string[],
  comment?: string,
): Promise<{ results: { id: string; status: string; reason?: string }[] }> {
  const { data } = await client.post(`/headcount-requests/bulk-reject`, {
    requestIds,
    comment,
  });
  return data;
}
