import { create } from 'zustand';
import type {
  ApprovalChain,
  ApprovalConditions,
  ApprovalStep,
  HeadcountRequest,
  HeadcountRequestEmployeeData,
} from '@/types';
import * as approvalsApi from '@/api/approvals';

interface ApprovalState {
  chains: ApprovalChain[];
  requests: HeadcountRequest[];
  pendingApprovals: HeadcountRequest[];
  loading: boolean;
  error: string | null;

  // Chains
  fetchChains: (orgId: string) => Promise<void>;
  createChain: (
    orgId: string,
    payload: {
      name: string;
      description?: string;
      steps: ApprovalStep[];
      conditions?: ApprovalConditions;
      priority?: number;
      isDefault?: boolean;
    },
  ) => Promise<ApprovalChain>;
  updateChain: (
    orgId: string,
    chainId: string,
    updates: Partial<ApprovalChain>,
  ) => Promise<void>;
  deleteChain: (orgId: string, chainId: string) => Promise<void>;

  // Requests
  fetchOrgRequests: (orgId: string) => Promise<void>;
  fetchPendingApprovals: (orgId: string) => Promise<void>;
  submitRequest: (
    scenarioId: string,
    payload: {
      employeeData: HeadcountRequestEmployeeData;
      requestType?: 'new_hire' | 'comp_change';
      targetEmployeeId?: string;
      chainId?: string;
    },
  ) => Promise<HeadcountRequest>;
  approveRequest: (id: string, comment?: string) => Promise<void>;
  rejectRequest: (id: string, comment?: string) => Promise<void>;
  requestChanges: (id: string, comment?: string) => Promise<void>;
  resubmitRequest: (
    id: string,
    employeeData?: HeadcountRequestEmployeeData,
  ) => Promise<void>;
  bulkApprove: (ids: string[], comment?: string) => Promise<void>;
  bulkReject: (ids: string[], comment?: string) => Promise<void>;

  clear: () => void;
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  chains: [],
  requests: [],
  pendingApprovals: [],
  loading: false,
  error: null,

  fetchChains: async (orgId) => {
    set({ loading: true, error: null });
    try {
      const chains = await approvalsApi.getApprovalChains(orgId);
      set({ chains });
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to load approval chains',
      });
    } finally {
      set({ loading: false });
    }
  },

  createChain: async (orgId, payload) => {
    set({ error: null });
    try {
      const chain = await approvalsApi.createApprovalChain(orgId, payload);
      set((state) => ({ chains: [...state.chains, chain] }));
      return chain;
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to create approval chain',
      });
      throw err;
    }
  },

  updateChain: async (orgId, chainId, updates) => {
    set({ error: null });
    try {
      const updated = await approvalsApi.updateApprovalChain(
        orgId,
        chainId,
        updates,
      );
      set((state) => ({
        chains: state.chains.map((c) => (c._id === chainId ? updated : c)),
      }));
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to update approval chain',
      });
      throw err;
    }
  },

  deleteChain: async (orgId, chainId) => {
    set({ error: null });
    try {
      await approvalsApi.deleteApprovalChain(orgId, chainId);
      set((state) => ({
        chains: state.chains.filter((c) => c._id !== chainId),
      }));
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to delete approval chain',
      });
      throw err;
    }
  },

  fetchOrgRequests: async (orgId) => {
    set({ loading: true, error: null });
    try {
      const requests = await approvalsApi.getOrgRequests(orgId);
      set({ requests });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load requests',
      });
    } finally {
      set({ loading: false });
    }
  },

  fetchPendingApprovals: async (orgId) => {
    set({ error: null });
    try {
      const pending = await approvalsApi.getPendingApprovals(orgId);
      set({ pendingApprovals: pending });
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load pending approvals',
      });
    }
  },

  submitRequest: async (scenarioId, payload) => {
    set({ error: null });
    try {
      const r = await approvalsApi.submitHeadcountRequest(scenarioId, payload);
      set((state) => ({ requests: [r, ...state.requests] }));
      return r;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to submit request',
      });
      throw err;
    }
  },

  approveRequest: async (id, comment) => {
    const updated = await approvalsApi.approveRequest(id, comment);
    set((state) => ({
      requests: state.requests.map((r) => (r._id === id ? updated : r)),
      pendingApprovals: state.pendingApprovals.filter((r) => r._id !== id),
    }));
  },

  rejectRequest: async (id, comment) => {
    const updated = await approvalsApi.rejectRequest(id, comment);
    set((state) => ({
      requests: state.requests.map((r) => (r._id === id ? updated : r)),
      pendingApprovals: state.pendingApprovals.filter((r) => r._id !== id),
    }));
  },

  requestChanges: async (id, comment) => {
    const updated = await approvalsApi.requestChangesOnRequest(id, comment);
    set((state) => ({
      requests: state.requests.map((r) => (r._id === id ? updated : r)),
      pendingApprovals: state.pendingApprovals.filter((r) => r._id !== id),
    }));
  },

  resubmitRequest: async (id, employeeData) => {
    const updated = await approvalsApi.resubmitRequest(id, employeeData);
    set((state) => ({
      requests: state.requests.map((r) => (r._id === id ? updated : r)),
    }));
  },

  bulkApprove: async (ids, comment) => {
    await approvalsApi.bulkApprove(ids, comment);
    // Refresh the requests after bulk action
    const orgId = get().requests[0]?.orgId;
    if (orgId) {
      await get().fetchOrgRequests(orgId);
      await get().fetchPendingApprovals(orgId);
    }
  },

  bulkReject: async (ids, comment) => {
    await approvalsApi.bulkReject(ids, comment);
    const orgId = get().requests[0]?.orgId;
    if (orgId) {
      await get().fetchOrgRequests(orgId);
      await get().fetchPendingApprovals(orgId);
    }
  },

  clear: () =>
    set({ chains: [], requests: [], pendingApprovals: [], error: null }),
}));
