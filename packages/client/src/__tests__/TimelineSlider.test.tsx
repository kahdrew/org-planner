import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TimelineSlider from '@/components/panels/TimelineSlider';
import { useTimelineStore } from '@/stores/timelineStore';
import { useOrgStore } from '@/stores/orgStore';
import type { Scenario } from '@/types';

vi.mock('@/api/timeline', () => ({
  getTimeline: vi.fn().mockResolvedValue({ events: [], futureMarkers: [] }),
  getHistoryAtDate: vi.fn().mockResolvedValue([]),
}));

import * as timelineApi from '@/api/timeline';

const mockApi = timelineApi as {
  getTimeline: ReturnType<typeof vi.fn>;
  getHistoryAtDate: ReturnType<typeof vi.fn>;
};

const mockScenario: Scenario = {
  _id: 'scen1',
  orgId: 'org1',
  name: 'Test',
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function seedStoreWithHistory() {
  useTimelineStore.setState({
    events: [
      {
        _id: 'evt1',
        scenarioId: 'scen1',
        employeeId: 'emp1',
        action: 'create',
        snapshot: {},
        timestamp: '2026-01-15T00:00:00Z',
      },
      {
        _id: 'evt2',
        scenarioId: 'scen1',
        employeeId: 'emp2',
        action: 'move',
        snapshot: {},
        timestamp: '2026-03-10T00:00:00Z',
      },
      {
        _id: 'evt3',
        scenarioId: 'scen1',
        employeeId: 'emp1',
        action: 'delete',
        snapshot: {},
        timestamp: '2026-05-01T00:00:00Z',
      },
    ],
    futureMarkers: [
      {
        _id: 'sc1',
        scenarioId: 'scen1',
        employeeId: 'emp3',
        action: 'scheduled',
        changeType: 'promotion',
        changeData: { title: 'Senior' },
        timestamp: '2026-12-01T00:00:00Z',
        isFuture: true,
      },
    ],
    granularity: 'day',
    scrubDate: null,
    historicalEmployees: null,
    loadingTimeline: false,
    loadingHistory: false,
    loadedScenarioId: 'scen1',
  });
}

function seedOrgStore() {
  useOrgStore.setState({ currentScenario: mockScenario });
}

function resetStores() {
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
  useOrgStore.setState({ currentScenario: null });
}

describe('TimelineSlider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    mockApi.getTimeline.mockResolvedValue({ events: [], futureMarkers: [] });
    mockApi.getHistoryAtDate.mockResolvedValue([]);
  });

  it('shows empty state when no scenario is selected', () => {
    render(<TimelineSlider />);
    expect(screen.getByTestId('timeline-slider-empty')).toBeInTheDocument();
  });

  it('shows no-history empty state when events and markers are empty', () => {
    seedOrgStore();
    useTimelineStore.setState({
      loadedScenarioId: 'scen1',
      events: [],
      futureMarkers: [],
    });
    render(<TimelineSlider scenarioId="scen1" />);
    expect(screen.getByTestId('timeline-slider-no-history')).toBeInTheDocument();
    expect(
      screen.getByText(/No history yet/i),
    ).toBeInTheDocument();
  });

  it('renders the slider, granularity controls, and markers', () => {
    seedOrgStore();
    seedStoreWithHistory();
    render(<TimelineSlider scenarioId="scen1" />);
    expect(screen.getByTestId('timeline-slider')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-range-input')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-granularity')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-granularity-day')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-granularity-week')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-granularity-month')).toBeInTheDocument();
    // Past event markers + future marker
    expect(screen.getAllByTestId(/^timeline-marker-/).length).toBeGreaterThanOrEqual(4);
  });

  it('renders a future marker for pending scheduled changes', () => {
    seedOrgStore();
    seedStoreWithHistory();
    render(<TimelineSlider scenarioId="scen1" />);
    expect(screen.getByTestId('timeline-marker-future')).toBeInTheDocument();
  });

  it('renders a Now indicator for the current state', () => {
    seedOrgStore();
    seedStoreWithHistory();
    render(<TimelineSlider scenarioId="scen1" />);
    expect(screen.getByTestId('timeline-current-indicator')).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
  });

  it('switches granularity when a button is clicked', async () => {
    seedOrgStore();
    seedStoreWithHistory();
    render(<TimelineSlider scenarioId="scen1" />);

    await userEvent.click(screen.getByTestId('timeline-granularity-week'));
    expect(useTimelineStore.getState().granularity).toBe('week');

    await userEvent.click(screen.getByTestId('timeline-granularity-month'));
    expect(useTimelineStore.getState().granularity).toBe('month');
  });

  it('scrubs to a historical date when the slider is moved', async () => {
    seedOrgStore();
    seedStoreWithHistory();
    mockApi.getHistoryAtDate.mockResolvedValue([]);

    render(<TimelineSlider scenarioId="scen1" />);

    const input = screen.getByTestId('timeline-range-input') as HTMLInputElement;
    const min = Number(input.min);
    const max = Number(input.max);
    const mid = Math.floor((min + max) / 2);

    fireEvent.change(input, { target: { value: String(mid) } });

    // Wait for async history fetch
    await new Promise((r) => setTimeout(r, 0));

    expect(mockApi.getHistoryAtDate).toHaveBeenCalled();
    const call = mockApi.getHistoryAtDate.mock.calls[0];
    expect(call[0]).toBe('scen1');
    expect(typeof call[1]).toBe('string');
  });

  it('shows jump-to-current and reset controls when scrubbing', () => {
    seedOrgStore();
    seedStoreWithHistory();
    useTimelineStore.setState({ scrubDate: '2026-02-01T00:00:00Z' });

    render(<TimelineSlider scenarioId="scen1" />);
    expect(screen.getByTestId('timeline-jump-now')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-reset')).toBeInTheDocument();
  });

  it('resets to current when jump-to-current is clicked', async () => {
    seedOrgStore();
    seedStoreWithHistory();
    useTimelineStore.setState({
      scrubDate: '2026-02-01T00:00:00Z',
      historicalEmployees: [],
    });

    render(<TimelineSlider scenarioId="scen1" />);
    await userEvent.click(screen.getByTestId('timeline-jump-now'));

    const state = useTimelineStore.getState();
    expect(state.scrubDate).toBeNull();
    expect(state.historicalEmployees).toBeNull();
  });

  it('fetches timeline when a new scenario is selected', async () => {
    seedOrgStore();
    useTimelineStore.setState({ loadedScenarioId: null });
    mockApi.getTimeline.mockResolvedValue({ events: [], futureMarkers: [] });

    render(<TimelineSlider scenarioId="scen1" />);

    await new Promise((r) => setTimeout(r, 0));

    expect(mockApi.getTimeline).toHaveBeenCalledWith('scen1');
  });

  it('shows current-state label when not scrubbing', () => {
    seedOrgStore();
    seedStoreWithHistory();
    render(<TimelineSlider scenarioId="scen1" />);
    expect(screen.getByText(/Current/i)).toBeInTheDocument();
  });
});
