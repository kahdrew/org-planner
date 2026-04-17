import { create } from 'zustand';
import type { Employee } from '@/types';
import * as timelineApi from '@/api/timeline';
import type { TimelineEvent } from '@/api/timeline';

export type Granularity = 'day' | 'week' | 'month';

interface TimelineState {
  /** Past events (audit log) for the current scenario */
  events: TimelineEvent[];
  /** Future markers (pending scheduled changes) for the current scenario */
  futureMarkers: TimelineEvent[];
  /** Granularity of the slider tick marks */
  granularity: Granularity;
  /**
   * The date the user has scrubbed to. null means "current state" (right edge).
   * When set, the org chart shows the historical state at that date.
   */
  scrubDate: string | null;
  /** Historical employee state at the scrubDate (null when showing current) */
  historicalEmployees: Employee[] | null;
  /** Loading states */
  loadingTimeline: boolean;
  loadingHistory: boolean;
  /** Track which scenario the current data is for, so we can refetch on switch */
  loadedScenarioId: string | null;

  fetchTimeline: (scenarioId: string) => Promise<void>;
  fetchHistoryAtDate: (scenarioId: string, date: string) => Promise<void>;
  setGranularity: (granularity: Granularity) => void;
  setScrubDate: (scenarioId: string, date: string | null) => Promise<void>;
  resetToCurrent: () => void;
  /** Clear all state (e.g., on scenario switch) */
  clear: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  events: [],
  futureMarkers: [],
  granularity: 'day',
  scrubDate: null,
  historicalEmployees: null,
  loadingTimeline: false,
  loadingHistory: false,
  loadedScenarioId: null,

  fetchTimeline: async (scenarioId) => {
    set({ loadingTimeline: true });
    try {
      const data = await timelineApi.getTimeline(scenarioId);
      set({
        events: data.events,
        futureMarkers: data.futureMarkers,
        loadedScenarioId: scenarioId,
      });
    } finally {
      set({ loadingTimeline: false });
    }
  },

  fetchHistoryAtDate: async (scenarioId, date) => {
    set({ loadingHistory: true });
    try {
      const employees = await timelineApi.getHistoryAtDate(scenarioId, date);
      set({ historicalEmployees: employees, scrubDate: date });
    } finally {
      set({ loadingHistory: false });
    }
  },

  setGranularity: (granularity) => set({ granularity }),

  setScrubDate: async (scenarioId, date) => {
    if (date === null) {
      set({ scrubDate: null, historicalEmployees: null });
      return;
    }
    await get().fetchHistoryAtDate(scenarioId, date);
  },

  resetToCurrent: () => set({ scrubDate: null, historicalEmployees: null }),

  clear: () =>
    set({
      events: [],
      futureMarkers: [],
      scrubDate: null,
      historicalEmployees: null,
      loadedScenarioId: null,
    }),
}));
