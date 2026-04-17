import { useEffect, useCallback } from 'react';
import { useUndoRedoStore } from '@/stores/undoRedoStore';
import { useOrgStore } from '@/stores/orgStore';

/**
 * Hook that provides undo/redo functionality with keyboard shortcuts.
 *
 * - Cmd+Z (Mac) / Ctrl+Z (Win) → undo
 * - Cmd+Shift+Z (Mac) / Ctrl+Y (Win) → redo
 *
 * Shortcuts are suppressed when the user is typing in text inputs,
 * textareas, or contenteditable elements so that browser-native undo
 * within form fields is preserved.
 */
export function useUndoRedo() {
  const undo = useUndoRedoStore((s) => s.undo);
  const redo = useUndoRedoStore((s) => s.redo);
  const canUndo = useUndoRedoStore((s) => s.canUndo);
  const canRedo = useUndoRedoStore((s) => s.canRedo);
  const executeUndo = useOrgStore((s) => s.executeUndo);
  const executeRedo = useOrgStore((s) => s.executeRedo);

  const handleUndo = useCallback(async () => {
    const command = undo();
    if (command) {
      await executeUndo(command);
    }
  }, [undo, executeUndo]);

  const handleRedo = useCallback(async () => {
    const command = redo();
    if (command) {
      await executeRedo(command);
    }
  }, [redo, executeRedo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if the user is typing in a text field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        target.getAttribute('data-inline-edit') === 'true'
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (!mod) return;

      // Redo: Cmd+Shift+Z (Mac) or Ctrl+Y (Win) or Ctrl+Shift+Z
      if (
        (e.key === 'z' && e.shiftKey && mod) ||
        (e.key === 'Z' && e.shiftKey && mod) ||
        (e.key === 'y' && mod && !isMac)
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleRedo();
        return;
      }

      // Undo: Cmd+Z (Mac) or Ctrl+Z (Win)
      if ((e.key === 'z' || e.key === 'Z') && mod && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleUndo();
        return;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [handleUndo, handleRedo]);

  return {
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
  };
}
