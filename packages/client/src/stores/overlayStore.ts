import { create } from 'zustand';

/** Overlay modes available on the org chart. */
export type OverlayMode =
  | 'none'
  | 'salary'
  | 'tenure'
  | 'department'
  | 'employmentType'
  | 'status';

export const OVERLAY_MODES: { value: OverlayMode; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'salary', label: 'Salary Band' },
  { value: 'tenure', label: 'Tenure' },
  { value: 'department', label: 'Department' },
  { value: 'employmentType', label: 'Employment Type' },
  { value: 'status', label: 'Status' },
];

interface OverlayState {
  /** Currently active overlay mode. 'none' means no overlay (default colors). */
  mode: OverlayMode;
  /** Set the active overlay mode. */
  setMode: (mode: OverlayMode) => void;
  /** Clear the overlay (equivalent to setMode('none')). */
  reset: () => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  mode: 'none',
  setMode: (mode) => set({ mode }),
  reset: () => set({ mode: 'none' }),
}));
