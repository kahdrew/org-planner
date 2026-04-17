import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelectionStore } from '@/stores/selectionStore';
import { useOrgStore } from '@/stores/orgStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { Employee } from '@/types';

/**
 * Tests for multi-select user-testing fixes:
 * - VAL-MULTI-002: Shift+Click range selection
 * - VAL-MULTI-003: Lasso/marquee selection (OrgChartView — integration test via store)
 * - VAL-MULTI-010: Cmd+A select-all
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Dispatch a keyboard event on window (or a given target). */
function pressKey(
  key: string,
  opts: Partial<KeyboardEventInit> = {},
  target: EventTarget = window,
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  target.dispatchEvent(event);
  return event;
}

/** Minimal mock employee for store testing. */
function mockEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    _id: 'emp-1',
    scenarioId: 'scen-1',
    name: 'Test Employee',
    title: 'Engineer',
    department: 'Engineering',
    level: 'IC3',
    location: 'Remote',
    employmentType: 'FTE',
    status: 'Active',
    order: 0,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  VAL-MULTI-002: Shift+Click range selection                        */
/* ------------------------------------------------------------------ */

describe('VAL-MULTI-002: Shift+Click range selection', () => {
  const orderedIds = ['emp-1', 'emp-2', 'emp-3', 'emp-4', 'emp-5'];

  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  it('selects a range when anchor is set by plain click (singleSelect) then shift+click', () => {
    const store = useSelectionStore.getState();

    // Simulate a plain click: clearSelection then set lastClickedId (our fix)
    store.clearSelection();
    useSelectionStore.setState({ lastClickedId: 'emp-2' });

    // Now shift+click on emp-4
    store.rangeSelect('emp-4', orderedIds);

    expect(store.selectionCount()).toBe(3);
    expect(store.isSelected('emp-2')).toBe(true);
    expect(store.isSelected('emp-3')).toBe(true);
    expect(store.isSelected('emp-4')).toBe(true);
    expect(store.isSelected('emp-1')).toBe(false);
    expect(store.isSelected('emp-5')).toBe(false);
  });

  it('anchor persists after clearSelection + setState pattern', () => {
    // This tests the exact pattern used in HierarchyView handleSelect fix
    const store = useSelectionStore.getState();

    store.clearSelection();
    // After clearSelection, lastClickedId is null
    expect(store.lastClickedId).toBeNull();

    // Set anchor explicitly (our fix)
    useSelectionStore.setState({ lastClickedId: 'emp-3' });
    expect(useSelectionStore.getState().lastClickedId).toBe('emp-3');

    // Range select should use emp-3 as anchor
    useSelectionStore.getState().rangeSelect('emp-5', orderedIds);
    const state = useSelectionStore.getState();
    expect(state.selectionCount()).toBe(3);
    expect(state.isSelected('emp-3')).toBe(true);
    expect(state.isSelected('emp-4')).toBe(true);
    expect(state.isSelected('emp-5')).toBe(true);
  });

  it('range select works backwards (target before anchor)', () => {
    useSelectionStore.setState({ lastClickedId: 'emp-4' });
    useSelectionStore.getState().rangeSelect('emp-1', orderedIds);

    const state = useSelectionStore.getState();
    expect(state.selectionCount()).toBe(4);
    expect(state.isSelected('emp-1')).toBe(true);
    expect(state.isSelected('emp-2')).toBe(true);
    expect(state.isSelected('emp-3')).toBe(true);
    expect(state.isSelected('emp-4')).toBe(true);
  });

  it('range select on same item as anchor selects just that item', () => {
    useSelectionStore.setState({ lastClickedId: 'emp-3' });
    useSelectionStore.getState().rangeSelect('emp-3', orderedIds);

    const state = useSelectionStore.getState();
    expect(state.selectionCount()).toBe(1);
    expect(state.isSelected('emp-3')).toBe(true);
  });

  it('range select with no anchor falls back to selecting target only', () => {
    // lastClickedId is null after clearSelection
    useSelectionStore.getState().clearSelection();
    useSelectionStore.getState().rangeSelect('emp-3', orderedIds);

    const state = useSelectionStore.getState();
    expect(state.selectionCount()).toBe(1);
    expect(state.isSelected('emp-3')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  VAL-MULTI-003: Lasso/marquee selection (store-level)              */
/* ------------------------------------------------------------------ */

describe('VAL-MULTI-003: Lasso/marquee selection store sync', () => {
  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  it('selectAll from lasso populates the selection store', () => {
    // Simulates what onSelectionChange does when React Flow fires with selected nodes
    const lassoSelectedIds = ['emp-1', 'emp-3', 'emp-5'];
    useSelectionStore.getState().selectAll(lassoSelectedIds);

    const state = useSelectionStore.getState();
    expect(state.selectionCount()).toBe(3);
    expect(state.isSelected('emp-1')).toBe(true);
    expect(state.isSelected('emp-3')).toBe(true);
    expect(state.isSelected('emp-5')).toBe(true);
    expect(state.isSelected('emp-2')).toBe(false);
  });

  it('clearSelection after lasso empties the store', () => {
    useSelectionStore.getState().selectAll(['emp-1', 'emp-2']);
    expect(useSelectionStore.getState().selectionCount()).toBe(2);

    useSelectionStore.getState().clearSelection();
    expect(useSelectionStore.getState().selectionCount()).toBe(0);
  });

  it('selectAll replaces previous selection', () => {
    useSelectionStore.getState().selectAll(['emp-1', 'emp-2']);
    useSelectionStore.getState().selectAll(['emp-3', 'emp-4']);

    const state = useSelectionStore.getState();
    expect(state.selectionCount()).toBe(2);
    expect(state.isSelected('emp-1')).toBe(false);
    expect(state.isSelected('emp-3')).toBe(true);
    expect(state.isSelected('emp-4')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  VAL-MULTI-010: Cmd+A select-all                                   */
/* ------------------------------------------------------------------ */

describe('VAL-MULTI-010: Cmd+A select-all', () => {
  let searchInput: HTMLInputElement;
  const onOpenShortcutsHelp = vi.fn();
  const onDeleteSelected = vi.fn();
  const onClosePanel = vi.fn();

  beforeEach(() => {
    searchInput = document.createElement('input');
    document.body.appendChild(searchInput);

    // Reset stores
    useSelectionStore.getState().clearSelection();
    useOrgStore.setState({
      selectedEmployee: null,
      employees: [
        mockEmployee({ _id: 'emp-1', name: 'Alice' }),
        mockEmployee({ _id: 'emp-2', name: 'Bob' }),
        mockEmployee({ _id: 'emp-3', name: 'Charlie' }),
      ],
    });

    onOpenShortcutsHelp.mockClear();
    onDeleteSelected.mockClear();
    onClosePanel.mockClear();
  });

  afterEach(() => {
    if (document.body.contains(searchInput)) {
      document.body.removeChild(searchInput);
    }
  });

  function renderShortcuts() {
    const ref = { current: searchInput };
    return renderHook(() =>
      useKeyboardShortcuts({
        searchInputRef: ref as React.RefObject<HTMLInputElement>,
        onOpenShortcutsHelp,
        onDeleteSelected,
        onClosePanel,
      }),
    );
  }

  it('Ctrl+A selects all employees', () => {
    renderShortcuts();

    act(() => {
      // In JSDOM, navigator.platform is empty so isMac=false → use ctrlKey
      pressKey('a', { ctrlKey: true });
    });

    const state = useSelectionStore.getState();
    expect(state.selectionCount()).toBe(3);
    expect(state.isSelected('emp-1')).toBe(true);
    expect(state.isSelected('emp-2')).toBe(true);
    expect(state.isSelected('emp-3')).toBe(true);
  });

  it('Ctrl+A prevents default browser select-all', () => {
    renderShortcuts();

    let event: KeyboardEvent;
    act(() => {
      event = pressKey('a', { ctrlKey: true });
    });

    expect(event!.defaultPrevented).toBe(true);
  });

  it('Ctrl+A does NOT fire when focused in an input field', () => {
    renderShortcuts();

    const textInput = document.createElement('input');
    document.body.appendChild(textInput);
    textInput.focus();

    act(() => {
      pressKey('a', { ctrlKey: true }, textInput);
    });

    // Selection store should remain empty — browser native select-all should work instead
    expect(useSelectionStore.getState().selectionCount()).toBe(0);

    document.body.removeChild(textInput);
  });

  it('Ctrl+A does NOT fire when focused in a textarea', () => {
    renderShortcuts();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    act(() => {
      pressKey('a', { ctrlKey: true }, textarea);
    });

    expect(useSelectionStore.getState().selectionCount()).toBe(0);

    document.body.removeChild(textarea);
  });

  it('Ctrl+A does nothing when no employees exist', () => {
    useOrgStore.setState({ employees: [] });

    renderShortcuts();

    act(() => {
      pressKey('a', { ctrlKey: true });
    });

    expect(useSelectionStore.getState().selectionCount()).toBe(0);
  });

  it('Ctrl+A with uppercase A also works', () => {
    renderShortcuts();

    act(() => {
      pressKey('A', { ctrlKey: true });
    });

    expect(useSelectionStore.getState().selectionCount()).toBe(3);
  });
});
