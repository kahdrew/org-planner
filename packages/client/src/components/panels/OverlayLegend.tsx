import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useOverlayStore } from '@/stores/overlayStore';
import { useOrgStore } from '@/stores/orgStore';
import { buildLegend, buildOverlayContext, NEUTRAL_COLOR } from '@/utils/overlayColors';
import { cn } from '@/utils/cn';

interface OverlayLegendProps {
  className?: string;
}

/**
 * Floating legend displayed on top of the org chart when an overlay is
 * active. Shows either a gradient bar (salary / tenure) or categorical
 * swatches (department / employment type / status).
 */
export default function OverlayLegend({ className }: OverlayLegendProps) {
  const mode = useOverlayStore((s) => s.mode);
  const reset = useOverlayStore((s) => s.reset);
  const employees = useOrgStore((s) => s.employees);

  const legend = useMemo(
    () => buildLegend(mode, employees, buildOverlayContext(employees)),
    [mode, employees],
  );

  if (legend.type === 'none') return null;

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-lg border border-gray-200 bg-white/95 p-3 text-xs shadow-md backdrop-blur',
        className,
      )}
      data-testid="overlay-legend"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-800" data-testid="overlay-legend-title">
          {legend.title}
        </span>
        <button
          type="button"
          onClick={reset}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          title="Turn overlay off"
          data-testid="overlay-legend-close"
          aria-label="Turn overlay off"
        >
          <X size={12} />
        </button>
      </div>

      {legend.type === 'gradient' && (
        <div data-testid="overlay-legend-gradient">
          <div
            className="h-2 w-40 rounded"
            style={{
              background: `linear-gradient(to right, ${legend.stops.join(', ')})`,
            }}
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
            <span data-testid="overlay-legend-min">{legend.minLabel}</span>
            <span data-testid="overlay-legend-max">{legend.maxLabel}</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-400">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-gray-300"
              style={{ backgroundColor: NEUTRAL_COLOR }}
              aria-hidden
            />
            <span>No data</span>
          </div>
        </div>
      )}

      {legend.type === 'categorical' && (
        <ul
          className="space-y-1"
          data-testid="overlay-legend-categorical"
        >
          {legend.entries.length === 0 && (
            <li className="text-[10px] italic text-gray-400">No data</li>
          )}
          {legend.entries.map((entry) => (
            <li key={entry.label} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span className="text-gray-700">{entry.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
