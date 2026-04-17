import { create } from 'zustand';
import type { BudgetEnvelope } from '@/types';
import * as budgetsApi from '@/api/budgets';

interface BudgetState {
  envelopes: BudgetEnvelope[];
  loading: boolean;
  error: string | null;

  /** Refresh envelopes for a scenario from the server. */
  fetchEnvelopes: (scenarioId: string) => Promise<void>;
  /** Create a new envelope; returns the created envelope. */
  createEnvelope: (
    scenarioId: string,
    payload: { department: string; totalBudget: number; headcountCap: number },
  ) => Promise<BudgetEnvelope>;
  /** Update an envelope by id. */
  updateEnvelope: (
    scenarioId: string,
    budgetId: string,
    updates: Partial<Pick<BudgetEnvelope, 'department' | 'totalBudget' | 'headcountCap'>>,
  ) => Promise<void>;
  /** Delete an envelope by id. */
  deleteEnvelope: (scenarioId: string, budgetId: string) => Promise<void>;
  /** Clear envelopes (e.g., when switching scenarios). */
  clearEnvelopes: () => void;
}

export const useBudgetStore = create<BudgetState>((set) => ({
  envelopes: [],
  loading: false,
  error: null,

  fetchEnvelopes: async (scenarioId) => {
    set({ loading: true, error: null });
    try {
      const envelopes = await budgetsApi.getBudgetEnvelopes(scenarioId);
      set({ envelopes });
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to load budget envelopes',
      });
    } finally {
      set({ loading: false });
    }
  },

  createEnvelope: async (scenarioId, payload) => {
    set({ error: null });
    try {
      const envelope = await budgetsApi.createBudgetEnvelope(scenarioId, payload);
      set((state) => ({
        envelopes: [...state.envelopes, envelope].sort((a, b) =>
          a.department.localeCompare(b.department),
        ),
      }));
      return envelope;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create budget envelope';
      set({ error: message });
      throw err;
    }
  },

  updateEnvelope: async (scenarioId, budgetId, updates) => {
    set({ error: null });
    try {
      const updated = await budgetsApi.updateBudgetEnvelope(
        scenarioId,
        budgetId,
        updates,
      );
      set((state) => ({
        envelopes: state.envelopes
          .map((e) => (e._id === budgetId ? updated : e))
          .sort((a, b) => a.department.localeCompare(b.department)),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update budget envelope';
      set({ error: message });
      throw err;
    }
  },

  deleteEnvelope: async (scenarioId, budgetId) => {
    set({ error: null });
    try {
      await budgetsApi.deleteBudgetEnvelope(scenarioId, budgetId);
      set((state) => ({
        envelopes: state.envelopes.filter((e) => e._id !== budgetId),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete budget envelope';
      set({ error: message });
      throw err;
    }
  },

  clearEnvelopes: () => set({ envelopes: [], error: null }),
}));
