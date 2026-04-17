import { create } from 'zustand';

interface SelectionState {
  /** Set of selected employee IDs */
  selectedIds: Set<string>;
  /** Last clicked employee ID (anchor for shift-click range selection) */
  lastClickedId: string | null;

  /** Toggle an individual selection (Cmd/Ctrl+Click) */
  toggleSelect: (id: string) => void;
  /** Select a range between lastClickedId and the given id (Shift+Click) */
  rangeSelect: (id: string, orderedIds: string[]) => void;
  /** Select a single employee (plain click — clears others) */
  singleSelect: (id: string) => void;
  /** Select all given ids */
  selectAll: (ids: string[]) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Check if an employee is selected */
  isSelected: (id: string) => boolean;
  /** Get the count of selected items */
  selectionCount: () => number;
  /** Get array of selected IDs */
  getSelectedIds: () => string[];
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: new Set(),
  lastClickedId: null,

  toggleSelect: (id) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next, lastClickedId: id };
    });
  },

  rangeSelect: (id, orderedIds) => {
    const { lastClickedId } = get();
    if (!lastClickedId) {
      // No anchor — treat as toggle
      set({ selectedIds: new Set([id]), lastClickedId: id });
      return;
    }

    const startIdx = orderedIds.indexOf(lastClickedId);
    const endIdx = orderedIds.indexOf(id);

    if (startIdx === -1 || endIdx === -1) {
      // Anchor or target not in list — just select the target
      set({ selectedIds: new Set([id]), lastClickedId: id });
      return;
    }

    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const rangeIds = orderedIds.slice(lo, hi + 1);
    set({ selectedIds: new Set(rangeIds) });
    // Note: we don't update lastClickedId so further shift-clicks extend from original anchor
  },

  singleSelect: (id) => {
    set({ selectedIds: new Set([id]), lastClickedId: id });
  },

  selectAll: (ids) => {
    set({ selectedIds: new Set(ids), lastClickedId: null });
  },

  clearSelection: () => {
    set({ selectedIds: new Set(), lastClickedId: null });
  },

  isSelected: (id) => {
    return get().selectedIds.has(id);
  },

  selectionCount: () => {
    return get().selectedIds.size;
  },

  getSelectedIds: () => {
    return Array.from(get().selectedIds);
  },
}));
