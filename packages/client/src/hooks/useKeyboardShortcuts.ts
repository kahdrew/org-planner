import { useEffect, useCallback } from 'react';
import { useSelectionStore } from '@/stores/selectionStore';
import { useOrgStore } from '@/stores/orgStore';

/**
 * Returns true if the given event target is an element that accepts text input,
 * meaning keyboard shortcuts should NOT fire.
 */
export function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.getAttribute('contenteditable') === 'true' ||
    target.getAttribute('data-inline-edit') === 'true'
  );
}

interface UseKeyboardShortcutsOptions {
  /** Ref to the search bar input element (Cmd+K focuses it) */
  searchInputRef: React.RefObject<HTMLInputElement>;
  /** Callback to open the keyboard shortcuts help dialog */
  onOpenShortcutsHelp: () => void;
  /** Callback when delete key is pressed with selected employees */
  onDeleteSelected: () => void;
  /** Callback to close open panels (detail panel, budget panel) */
  onClosePanel: () => void;
}

/**
 * Global keyboard shortcuts hook. Registers listeners on mount, removes on cleanup.
 *
 * Shortcuts:
 *   Cmd+K          — Focus search bar / command palette
 *   Backspace/Del  — Delete selected employee(s) with confirmation
 *   Escape         — Close panels, deselect
 *   ?              — Open keyboard shortcuts reference
 *   Cmd+A          — Select all employees (already handled in views)
 *
 * NOTE: Cmd+Z / Cmd+Shift+Z are handled by useUndoRedo hook.
 * NOTE: Arrow keys are handled locally in HierarchyView.
 */
export function useKeyboardShortcuts({
  searchInputRef,
  onOpenShortcutsHelp,
  onDeleteSelected,
  onClosePanel,
}: UseKeyboardShortcutsOptions) {
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const selectedEmployee = useOrgStore((s) => s.selectedEmployee);
  const selectEmployee = useOrgStore((s) => s.selectEmployee);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // --- Cmd+K: focus search ---
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // All other shortcuts are suppressed inside input elements
      if (isInputElement(target)) return;

      // --- Escape: close panels, deselect ---
      if (e.key === 'Escape') {
        // Close detail panel if open
        if (selectedEmployee) {
          selectEmployee(null);
          e.preventDefault();
          return;
        }
        // Close any panel
        onClosePanel();
        clearSelection();
        e.preventDefault();
        return;
      }

      // --- Backspace / Delete: delete selected employee(s) ---
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const hasSelection = selectedIds.size > 0;
        const hasSingleSelected = selectedEmployee !== null;

        if (hasSelection || hasSingleSelected) {
          e.preventDefault();
          onDeleteSelected();
        }
        return;
      }

      // --- ? key: open shortcuts help ---
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        onOpenShortcutsHelp();
        return;
      }
    },
    [
      searchInputRef,
      onOpenShortcutsHelp,
      onDeleteSelected,
      onClosePanel,
      clearSelection,
      selectedIds,
      selectedEmployee,
      selectEmployee,
    ],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
