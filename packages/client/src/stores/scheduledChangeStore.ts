import { create } from 'zustand';
import type { ScheduledChange } from '@/types';
import * as scheduledChangesApi from '@/api/scheduledChanges';

interface ScheduledChangeState {
  scheduledChanges: ScheduledChange[];
  loading: boolean;

  fetchScheduledChanges: (scenarioId: string) => Promise<void>;
  createScheduledChange: (
    scenarioId: string,
    payload: {
      employeeId: string;
      effectiveDate: string;
      changeType: string;
      changeData: Record<string, unknown>;
    },
  ) => Promise<ScheduledChange>;
  updateScheduledChange: (
    id: string,
    updates: Partial<Pick<ScheduledChange, 'effectiveDate' | 'changeType' | 'changeData'>>,
  ) => Promise<void>;
  cancelScheduledChange: (id: string) => Promise<void>;
  applyDueChanges: (scenarioId: string) => Promise<number>;
  /** Get all pending changes for a specific employee */
  getPendingChangesForEmployee: (employeeId: string) => ScheduledChange[];
  /** Check if an employee has any pending changes */
  hasPendingChanges: (employeeId: string) => boolean;
  /** Clear changes (e.g., on scenario switch) */
  clearChanges: () => void;
}

export const useScheduledChangeStore = create<ScheduledChangeState>((set, get) => ({
  scheduledChanges: [],
  loading: false,

  fetchScheduledChanges: async (scenarioId) => {
    set({ loading: true });
    try {
      const changes = await scheduledChangesApi.getScheduledChanges(scenarioId);
      set({ scheduledChanges: changes });
    } finally {
      set({ loading: false });
    }
  },

  createScheduledChange: async (scenarioId, payload) => {
    const change = await scheduledChangesApi.createScheduledChange(scenarioId, payload);
    set((state) => ({
      scheduledChanges: [...state.scheduledChanges, change],
    }));
    return change;
  },

  updateScheduledChange: async (id, updates) => {
    const updated = await scheduledChangesApi.updateScheduledChange(id, updates);
    set((state) => ({
      scheduledChanges: state.scheduledChanges.map((c) =>
        c._id === id ? updated : c,
      ),
    }));
  },

  cancelScheduledChange: async (id) => {
    const updated = await scheduledChangesApi.deleteScheduledChange(id);
    set((state) => ({
      scheduledChanges: state.scheduledChanges.map((c) =>
        c._id === id ? updated : c,
      ),
    }));
  },

  applyDueChanges: async (scenarioId) => {
    const result = await scheduledChangesApi.applyDueChanges(scenarioId);
    if (result.count > 0) {
      // Update local state: mark applied changes
      set((state) => ({
        scheduledChanges: state.scheduledChanges.map((c) =>
          result.applied.includes(c._id) ? { ...c, status: 'applied' as const } : c,
        ),
      }));
    }
    return result.count;
  },

  getPendingChangesForEmployee: (employeeId) => {
    return get().scheduledChanges.filter(
      (c) => c.employeeId === employeeId && c.status === 'pending',
    );
  },

  hasPendingChanges: (employeeId) => {
    return get().scheduledChanges.some(
      (c) => c.employeeId === employeeId && c.status === 'pending',
    );
  },

  clearChanges: () => set({ scheduledChanges: [] }),
}));
