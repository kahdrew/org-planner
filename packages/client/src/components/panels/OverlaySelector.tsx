import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useOverlayStore, OVERLAY_MODES, type OverlayMode } from '@/stores/overlayStore';

const MODE_LABEL: Record<OverlayMode, string> = OVERLAY_MODES.reduce(
  (acc, { value, label }) => {
    acc[value] = label;
    return acc;
  },
  {} as Record<OverlayMode, string>,
);

/**
 * Overlay selector button + dropdown shown in the toolbar. Lets the user
 * switch between overlay modes (Salary Band, Tenure, etc.) and turn the
 * overlay off.
 */
export default function OverlaySelector() {
  const mode = useOverlayStore((s) => s.mode);
  const setMode = useOverlayStore((s) => s.setMode);
  const reset = useOverlayStore((s) => s.reset);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when the user clicks outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const active = mode !== 'none';

  return (
    <div ref={wrapperRef} className="relative" data-testid="overlay-selector">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
          active
            ? 'border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'border-gray-300 text-gray-700 hover:bg-gray-50',
        )}
        title="Overlay"
        data-testid="overlay-selector-button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Palette size={16} />
        <span>{active ? `Overlay: ${MODE_LABEL[mode]}` : 'Overlay'}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
          data-testid="overlay-selector-menu"
        >
          <ul className="py-1 text-sm">
            {OVERLAY_MODES.map((option) => {
              const selected = option.value === mode;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      if (option.value === 'none') {
                        reset();
                      } else {
                        setMode(option.value);
                      }
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors',
                      selected
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50',
                    )}
                    data-testid={`overlay-option-${option.value}`}
                  >
                    <span>{option.label}</span>
                    {selected && <Check size={14} className="text-blue-600" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {active && (
            <div className="border-t border-gray-100 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                className="w-full rounded-md bg-gray-100 py-1 text-center text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
                data-testid="overlay-off-button"
              >
                Turn overlay off
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
