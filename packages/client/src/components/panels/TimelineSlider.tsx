import { useEffect, useMemo, useCallback, useState } from 'react';
import { Clock, Loader2, RotateCcw, UserPlus, UserMinus, ArrowRightLeft, Pencil, CalendarClock } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTimelineStore, type Granularity } from '@/stores/timelineStore';
import { useOrgStore } from '@/stores/orgStore';
import type { TimelineEvent } from '@/api/timeline';

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/** One tick in the timeline domain */
interface Tick {
  date: Date;
  label: string;
}

function startOf(date: Date, granularity: Granularity): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (granularity === 'week') {
    // Normalize to start of week (Sunday)
    d.setDate(d.getDate() - d.getDay());
  } else if (granularity === 'month') {
    d.setDate(1);
  }
  return d;
}

function stepForward(date: Date, granularity: Granularity): Date {
  const d = new Date(date);
  if (granularity === 'day') d.setDate(d.getDate() + 1);
  else if (granularity === 'week') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function formatTick(date: Date, granularity: Granularity): string {
  if (granularity === 'month') {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Get the min/max dates from events + futureMarkers */
function computeDomain(
  events: TimelineEvent[],
  futureMarkers: TimelineEvent[],
  nowMs: number,
): { min: Date; max: Date } | null {
  if (events.length === 0 && futureMarkers.length === 0) return null;

  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;

  const all = [...events, ...futureMarkers];
  for (const e of all) {
    const ms = new Date(e.timestamp).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms < minMs) minMs = ms;
    if (ms > maxMs) maxMs = ms;
  }

  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null;

  // Ensure "now" is always within the domain (so the Now indicator is visible)
  if (nowMs > maxMs) maxMs = nowMs;
  if (nowMs < minMs) minMs = nowMs;

  // Pad the domain slightly so the slider handle isn't pinned on the edge
  const span = Math.max(maxMs - minMs, 1);
  const pad = Math.max(span * 0.02, 86400000); // at least one day of padding

  return {
    min: new Date(minMs - pad),
    max: new Date(maxMs + pad),
  };
}

function generateTicks(min: Date, max: Date, granularity: Granularity): Tick[] {
  const ticks: Tick[] = [];
  let cursor = startOf(min, granularity);
  // Limit the number of ticks to prevent runaway generation
  const MAX_TICKS = 200;
  while (cursor.getTime() <= max.getTime() && ticks.length < MAX_TICKS) {
    ticks.push({ date: new Date(cursor), label: formatTick(cursor, granularity) });
    cursor = stepForward(cursor, granularity);
  }
  return ticks;
}

function iconForAction(action: string) {
  switch (action) {
    case 'create':
    case 'bulk_create':
      return UserPlus;
    case 'delete':
      return UserMinus;
    case 'move':
      return ArrowRightLeft;
    case 'update':
      return Pencil;
    case 'scheduled':
      return CalendarClock;
    default:
      return Clock;
  }
}

function colorForAction(action: string, isFuture?: boolean): string {
  if (isFuture || action === 'scheduled') return 'bg-amber-400 border-amber-600';
  switch (action) {
    case 'create':
    case 'bulk_create':
      return 'bg-emerald-400 border-emerald-600';
    case 'delete':
      return 'bg-red-400 border-red-600';
    case 'move':
      return 'bg-blue-400 border-blue-600';
    case 'update':
      return 'bg-gray-400 border-gray-600';
    default:
      return 'bg-gray-300 border-gray-500';
  }
}

interface TimelineSliderProps {
  /** Optional: override the scenarioId (mainly for tests). Falls back to useOrgStore.currentScenario */
  scenarioId?: string;
  /** Optional: className for the wrapper */
  className?: string;
}

export default function TimelineSlider({ scenarioId: scenarioIdProp, className }: TimelineSliderProps) {
  const currentScenario = useOrgStore((s) => s.currentScenario);
  const scenarioId = scenarioIdProp ?? currentScenario?._id ?? null;

  const {
    events,
    futureMarkers,
    granularity,
    scrubDate,
    loadingTimeline,
    loadingHistory,
    loadedScenarioId,
    fetchTimeline,
    setGranularity,
    setScrubDate,
    resetToCurrent,
    clear,
  } = useTimelineStore();

  // Fetch timeline whenever scenarioId changes
  useEffect(() => {
    if (!scenarioId) {
      clear();
      return;
    }
    if (loadedScenarioId !== scenarioId) {
      fetchTimeline(scenarioId);
    }
  }, [scenarioId, loadedScenarioId, fetchTimeline, clear]);

  // Capture "now" once on mount so render stays pure. This is sufficient
  // for the Now indicator on the timeline — the timeline data doesn't need
  // sub-second precision.
  const [nowMs] = useState<number>(() => Date.now());

  const domain = useMemo(
    () => computeDomain(events, futureMarkers, nowMs),
    [events, futureMarkers, nowMs],
  );
  const ticks = useMemo(
    () => (domain ? generateTicks(domain.min, domain.max, granularity) : []),
    [domain, granularity],
  );

  const sliderMin = domain?.min.getTime() ?? 0;
  const sliderMax = domain?.max.getTime() ?? 1;
  const sliderSpan = Math.max(sliderMax - sliderMin, 1);

  const currentValue = scrubDate ? new Date(scrubDate).getTime() : Math.min(sliderMax, nowMs);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!scenarioId) return;
      const ms = Number(e.target.value);
      const iso = new Date(ms).toISOString();
      void setScrubDate(scenarioId, iso);
    },
    [scenarioId, setScrubDate],
  );

  const handleReset = useCallback(() => {
    resetToCurrent();
  }, [resetToCurrent]);

  const handleJumpToNow = useCallback(() => {
    if (!scenarioId) return;
    // Setting the scrub date to null shows current state
    resetToCurrent();
  }, [scenarioId, resetToCurrent]);

  // Position markers relative to the slider range
  const positionPercent = useCallback(
    (timestamp: string) => {
      const ms = new Date(timestamp).getTime();
      const pct = ((ms - sliderMin) / sliderSpan) * 100;
      return Math.max(0, Math.min(100, pct));
    },
    [sliderMin, sliderSpan],
  );

  // Empty state: no scenario selected
  if (!scenarioId) {
    return (
      <div
        className={cn(
          'flex items-center justify-center border-t border-gray-200 bg-white px-5 py-4 text-sm text-gray-400',
          className,
        )}
        data-testid="timeline-slider-empty"
      >
        <Clock size={16} className="mr-2" />
        Select a scenario to view its timeline
      </div>
    );
  }

  // Loading state
  if (loadingTimeline) {
    return (
      <div
        className={cn(
          'flex items-center justify-center border-t border-gray-200 bg-white px-5 py-4 text-sm text-gray-400',
          className,
        )}
        data-testid="timeline-slider-loading"
      >
        <Loader2 size={16} className="mr-2 animate-spin" />
        Loading timeline...
      </div>
    );
  }

  // Empty state: no history recorded
  if (!domain) {
    return (
      <div
        className={cn(
          'flex items-center justify-between border-t border-gray-200 bg-white px-5 py-3 text-xs text-gray-500',
          className,
        )}
        data-testid="timeline-slider-no-history"
      >
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-gray-400" />
          <span>
            No history yet. Changes you make will appear on the timeline as they happen.
          </span>
        </div>
      </div>
    );
  }

  const isScrubbing = scrubDate !== null;

  return (
    <div
      className={cn('border-t border-gray-200 bg-white px-5 py-3', className)}
      data-testid="timeline-slider"
    >
      {/* Header row: title + granularity + status + reset */}
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Clock size={14} className="text-blue-500" />
          <span className="font-medium">Timeline</span>
          {loadingHistory && (
            <Loader2 size={12} className="animate-spin text-gray-400" data-testid="timeline-loading-history" />
          )}
          <span className="ml-2 text-gray-400">
            {isScrubbing ? (
              <>
                Showing: <span className="font-medium text-gray-700">{formatDateFull(new Date(currentValue))}</span>
              </>
            ) : (
              <>Showing: <span className="font-medium text-emerald-700">Current</span></>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Granularity controls */}
          <div
            className="inline-flex overflow-hidden rounded-md border border-gray-200 text-xs"
            role="group"
            aria-label="Granularity"
            data-testid="timeline-granularity"
          >
            {GRANULARITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGranularity(opt.value)}
                className={cn(
                  'px-2 py-1 transition-colors',
                  granularity === opt.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50',
                )}
                data-testid={`timeline-granularity-${opt.value}`}
                aria-pressed={granularity === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {isScrubbing && (
            <button
              type="button"
              onClick={handleJumpToNow}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              data-testid="timeline-jump-now"
            >
              <RotateCcw size={12} />
              Jump to current
            </button>
          )}
        </div>
      </div>

      {/* Track with markers, current indicator, range */}
      <div className="relative pt-1 pb-4">
        {/* Start/end labels */}
        <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400">
          <span data-testid="timeline-start-label">{formatDateFull(domain.min)}</span>
          <span data-testid="timeline-end-label">{formatDateFull(domain.max)}</span>
        </div>

        {/* Markers row */}
        <div className="relative h-5" data-testid="timeline-markers">
          {/* Current-state (now) indicator */}
          {nowMs >= sliderMin && nowMs <= sliderMax && (
            <div
              className="pointer-events-none absolute top-0 h-full border-l-2 border-emerald-500"
              style={{ left: `${positionPercent(new Date(nowMs).toISOString())}%` }}
              title={`Current state: ${formatDateFull(new Date(nowMs))}`}
              data-testid="timeline-current-indicator"
            >
              <span className="absolute -top-1 -translate-x-1/2 rounded-sm bg-emerald-500 px-1 text-[9px] font-medium text-white">
                Now
              </span>
            </div>
          )}

          {/* Past event markers */}
          {events.map((event) => {
            const Icon = iconForAction(event.action);
            return (
              <button
                key={event._id}
                type="button"
                className={cn(
                  'absolute top-1 h-3 w-3 -translate-x-1/2 cursor-pointer rounded-full border shadow-sm transition-transform hover:scale-125',
                  colorForAction(event.action),
                )}
                style={{ left: `${positionPercent(event.timestamp)}%` }}
                title={`${event.action} at ${formatDateFull(new Date(event.timestamp))}`}
                onClick={() => {
                  if (!scenarioId) return;
                  void setScrubDate(scenarioId, event.timestamp);
                }}
                data-testid={`timeline-marker-${event.action}`}
                aria-label={`${event.action} event`}
              >
                <Icon size={8} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white" />
              </button>
            );
          })}

          {/* Future (scheduled) markers */}
          {futureMarkers.map((event) => {
            const Icon = iconForAction('scheduled');
            return (
              <div
                key={event._id}
                className={cn(
                  'absolute top-1 h-3 w-3 -translate-x-1/2 rounded-full border shadow-sm',
                  colorForAction(event.action, true),
                )}
                style={{ left: `${positionPercent(event.timestamp)}%` }}
                title={`Scheduled ${event.changeType ?? event.action} on ${formatDateFull(new Date(event.timestamp))}`}
                data-testid="timeline-marker-future"
              >
                <Icon size={8} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white" />
              </div>
            );
          })}
        </div>

        {/* The range input itself */}
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={86400000 /* 1 day */}
          value={currentValue}
          onChange={handleChange}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-500"
          aria-label="Timeline scrub slider"
          aria-valuetext={formatDateFull(new Date(currentValue))}
          data-testid="timeline-range-input"
          disabled={loadingHistory}
        />

        {/* Tick marks */}
        {ticks.length > 0 && (
          <div className="relative mt-1 h-4 text-[9px] text-gray-400" data-testid="timeline-ticks">
            {ticks.map((tick, idx) => {
              const pct = positionPercent(tick.date.toISOString());
              return (
                <span
                  key={idx}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${pct}%` }}
                >
                  {tick.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Reset pill (shown when scrubbing) */}
      {isScrubbing && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] text-blue-600 hover:underline"
            data-testid="timeline-reset"
          >
            Reset to current state
          </button>
        </div>
      )}
    </div>
  );
}
