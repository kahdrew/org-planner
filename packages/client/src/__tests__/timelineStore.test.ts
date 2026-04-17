import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTimelineStore } from '@/stores/timelineStore';

vi.mock('@/api/timeline', () => ({
  getTimeline: vi.fn(),
  getHistoryAtDate: vi.fn(),
}));

import * as api from '@/api/timeline';

const mockApi = api as {
  getTimeline: ReturnType<typeof vi.fn>;
  getHistoryAtDate: ReturnType<typeof vi.fn>;
};

const mockEvent = {
  _id: 'evt1',
  scenarioId: 'scen1',
  employeeId: 'emp1',
  action: 'create' as const,
  snapshot: { name: 'Alice' },
  timestamp: '2026-01-01T00:00:00.000Z',
};

const mockFutureMarker = {
  _id: 'sc1',
  scenarioId: 'scen1',
  employeeId: 'emp1',
  action: 'scheduled' as const,
  changeType: 'promotion',
  changeData: { title: 'Senior' },
  timestamp: '2026-06-01T00:00:00.000Z',
  isFuture: true,
};

const mockEmployee = {
  _id: 'emp1',
  scenarioId: 'scen1',
  name: 'Alice',
  title: 'Engineer',
  department: 'Eng',
  level: 'IC3',
  location: 'Remote',
  employmentType: 'FTE' as const,
  status: 'Active' as const,
  order: 0,
};

describe('timelineStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTimelineStore.setState({
      events: [],
      futureMarkers: [],
      granularity: 'day',
      scrubDate: null,
      historicalEmployees: null,
      loadingTimeline: false,
      loadingHistory: false,
      loadedScenarioId: null,
    });
  });

  describe('fetchTimeline', () => {
    it('populates events and futureMarkers from the API', async () => {
      mockApi.getTimeline.mockResolvedValue({
        events: [mockEvent],
        futureMarkers: [mockFutureMarker],
      });

      await useTimelineStore.getState().fetchTimeline('scen1');

      expect(mockApi.getTimeline).toHaveBeenCalledWith('scen1');
      const state = useTimelineStore.getState();
      expect(state.events).toEqual([mockEvent]);
      expect(state.futureMarkers).toEqual([mockFutureMarker]);
      expect(state.loadedScenarioId).toBe('scen1');
      expect(state.loadingTimeline).toBe(false);
    });

    it('sets loadingTimeline during the fetch', async () => {
      let resolvePromise!: (v: { events: unknown[]; futureMarkers: unknown[] }) => void;
      mockApi.getTimeline.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      const promise = useTimelineStore.getState().fetchTimeline('scen1');
      expect(useTimelineStore.getState().loadingTimeline).toBe(true);

      resolvePromise({ events: [], futureMarkers: [] });
      await promise;
      expect(useTimelineStore.getState().loadingTimeline).toBe(false);
    });
  });

  describe('fetchHistoryAtDate', () => {
    it('sets historicalEmployees and scrubDate', async () => {
      mockApi.getHistoryAtDate.mockResolvedValue([mockEmployee]);

      await useTimelineStore.getState().fetchHistoryAtDate('scen1', '2026-03-01T00:00:00Z');

      const state = useTimelineStore.getState();
      expect(mockApi.getHistoryAtDate).toHaveBeenCalledWith('scen1', '2026-03-01T00:00:00Z');
      expect(state.historicalEmployees).toEqual([mockEmployee]);
      expect(state.scrubDate).toBe('2026-03-01T00:00:00Z');
    });
  });

  describe('setScrubDate', () => {
    it('fetches history when a date is provided', async () => {
      mockApi.getHistoryAtDate.mockResolvedValue([mockEmployee]);
      await useTimelineStore.getState().setScrubDate('scen1', '2026-03-01T00:00:00Z');
      expect(mockApi.getHistoryAtDate).toHaveBeenCalled();
      expect(useTimelineStore.getState().historicalEmployees).toEqual([mockEmployee]);
    });

    it('resets to current when date is null', async () => {
      useTimelineStore.setState({
        historicalEmployees: [mockEmployee],
        scrubDate: '2026-03-01T00:00:00Z',
      });

      await useTimelineStore.getState().setScrubDate('scen1', null);

      const state = useTimelineStore.getState();
      expect(state.historicalEmployees).toBeNull();
      expect(state.scrubDate).toBeNull();
      expect(mockApi.getHistoryAtDate).not.toHaveBeenCalled();
    });
  });

  describe('setGranularity', () => {
    it('updates the granularity', () => {
      useTimelineStore.getState().setGranularity('week');
      expect(useTimelineStore.getState().granularity).toBe('week');
      useTimelineStore.getState().setGranularity('month');
      expect(useTimelineStore.getState().granularity).toBe('month');
    });
  });

  describe('resetToCurrent', () => {
    it('clears scrubDate and historicalEmployees', () => {
      useTimelineStore.setState({
        scrubDate: '2026-03-01T00:00:00Z',
        historicalEmployees: [mockEmployee],
      });

      useTimelineStore.getState().resetToCurrent();

      const state = useTimelineStore.getState();
      expect(state.scrubDate).toBeNull();
      expect(state.historicalEmployees).toBeNull();
    });
  });

  describe('clear', () => {
    it('resets all timeline state', () => {
      useTimelineStore.setState({
        events: [mockEvent],
        futureMarkers: [mockFutureMarker],
        scrubDate: '2026-03-01T00:00:00Z',
        historicalEmployees: [mockEmployee],
        loadedScenarioId: 'scen1',
      });

      useTimelineStore.getState().clear();

      const state = useTimelineStore.getState();
      expect(state.events).toEqual([]);
      expect(state.futureMarkers).toEqual([]);
      expect(state.scrubDate).toBeNull();
      expect(state.historicalEmployees).toBeNull();
      expect(state.loadedScenarioId).toBeNull();
    });
  });
});
