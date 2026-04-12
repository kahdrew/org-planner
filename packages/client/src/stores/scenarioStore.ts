import { create } from 'zustand';
import type { ScenarioDiff } from '@/types';
import * as scenariosApi from '@/api/scenarios';

interface ScenarioCompareState {
  compareScenarioA: string | null;
  compareScenarioB: string | null;
  diffResult: ScenarioDiff | null;
  diffLoading: boolean;

  setCompareA: (id: string | null) => void;
  setCompareB: (id: string | null) => void;
  fetchDiff: () => Promise<void>;
}

export const useScenarioStore = create<ScenarioCompareState>((set, get) => ({
  compareScenarioA: null,
  compareScenarioB: null,
  diffResult: null,
  diffLoading: false,

  setCompareA: (id) => {
    set({ compareScenarioA: id, diffResult: null });
  },

  setCompareB: (id) => {
    set({ compareScenarioB: id, diffResult: null });
  },

  fetchDiff: async () => {
    const { compareScenarioA, compareScenarioB } = get();
    if (!compareScenarioA || !compareScenarioB) return;

    set({ diffLoading: true });
    try {
      const diff = await scenariosApi.diffScenarios(compareScenarioA, compareScenarioB);
      set({ diffResult: diff });
    } finally {
      set({ diffLoading: false });
    }
  },
}));
