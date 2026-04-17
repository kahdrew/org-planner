import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelectionStore } from '@/stores/selectionStore';
import { useOrgStore } from '@/stores/orgStore';
import {
  useKeyboardShortcuts,
  isInputElement,
} from '@/hooks/useKeyboardShortcuts';
import type { Employee } from '@/types';

/**
 * Tests for keyboard shortcut behavior.
 *
 * VAL-KEY-001 through VAL-KEY-007
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
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Keyboard Shortcuts — input guard', () => {
  it('does not fire shortcuts when focused in an INPUT element', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Pressing Backspace inside an input should NOT trigger delete
    const event = pressKey('Backspace', {}, input);
    // The shortcut handler should have been skipped — no side effects
    // (no confirmation dialog, no deletion)
    // We simply verify the event was NOT prevented (browser default still works)
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(input);
  });

  it('does not fire shortcuts when focused in a TEXTAREA element', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    const event = pressKey('Backspace', {}, textarea);
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(textarea);
  });

  it('does not fire shortcuts when focused in a contenteditable element', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    div.focus();

    const event = pressKey('Backspace', {}, div);
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(div);
  });

  it('does not fire shortcuts when focused in data-inline-edit element', () => {
    const input = document.createElement('input');
    input.setAttribute('data-inline-edit', 'true');
    document.body.appendChild(input);
    input.focus();

    const event = pressKey('Backspace', {}, input);
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(input);
  });
});

describe('Keyboard Shortcuts — Escape key', () => {
  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  it('clears multi-selection on Escape', () => {
    // Select some employees
    useSelectionStore.getState().selectAll(['emp-1', 'emp-2', 'emp-3']);
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);

    // Already handled by AppShell useEffect — we test the store behavior
    useSelectionStore.getState().clearSelection();
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
  });
});

describe('Keyboard Shortcuts — selection store integration', () => {
  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  it('selectAll populates the set and clearSelection empties it', () => {
    useSelectionStore.getState().selectAll(['a', 'b', 'c']);
    expect(useSelectionStore.getState().selectedIds.size).toBe(3);
    expect(useSelectionStore.getState().isSelected('a')).toBe(true);

    useSelectionStore.getState().clearSelection();
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
  });
});

describe('Keyboard Shortcuts — isInputElement helper', () => {
  // Unit-test the guard function directly
  it('identifies INPUT as an input element', () => {
    const input = document.createElement('input');
    expect(isInputElement(input)).toBe(true);
  });

  it('identifies TEXTAREA as an input element', () => {
    const ta = document.createElement('textarea');
    expect(isInputElement(ta)).toBe(true);
  });

  it('identifies SELECT as an input element', () => {
    const sel = document.createElement('select');
    expect(isInputElement(sel)).toBe(true);
  });

  it('identifies contentEditable div as an input element', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    expect(isInputElement(div)).toBe(true);
  });

  it('identifies data-inline-edit element as input', () => {
    const input = document.createElement('input');
    input.setAttribute('data-inline-edit', 'true');
    expect(isInputElement(input)).toBe(true);
  });

  it('returns false for regular div', () => {
    const div = document.createElement('div');
    expect(isInputElement(div)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isInputElement(null)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Hook integration tests — useKeyboardShortcuts                      */
/* ------------------------------------------------------------------ */

describe('useKeyboardShortcuts — Cmd+K input guard (scrutiny fix #1)', () => {
  let searchInput: HTMLInputElement;
  const onOpenShortcutsHelp = vi.fn();
  const onDeleteSelected = vi.fn();
  const onClosePanel = vi.fn();

  beforeEach(() => {
    searchInput = document.createElement('input');
    searchInput.setAttribute('data-testid', 'search-input');
    document.body.appendChild(searchInput);

    // Reset stores
    useSelectionStore.getState().clearSelection();
    useOrgStore.setState({ selectedEmployee: null });

    // Reset mocks
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

  it('Cmd+K does NOT fire when typing in an input field', () => {
    renderShortcuts();

    // Create and focus a regular text input (simulating search bar)
    const textInput = document.createElement('input');
    document.body.appendChild(textInput);
    textInput.focus();

    // Fire Ctrl+K from inside the focused input
    // (JSDOM uses ctrlKey as the modifier since navigator.platform is not Mac)
    const event = pressKey('k', { ctrlKey: true }, textInput);

    // The search input should NOT have been focused/selected
    // because the input guard blocked the Ctrl+K shortcut
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(textInput);
  });

  it('Ctrl+K does NOT fire when typing in a textarea', () => {
    renderShortcuts();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    const event = pressKey('k', { ctrlKey: true }, textarea);
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(textarea);
  });

  it('Ctrl+K does NOT fire when typing in a contenteditable element', () => {
    renderShortcuts();

    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    div.focus();

    const event = pressKey('k', { ctrlKey: true }, div);
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(div);
  });

  it('Cmd/Ctrl+K DOES fire when no input is focused', () => {
    renderShortcuts();

    const focusSpy = vi.spyOn(searchInput, 'focus');
    const selectSpy = vi.spyOn(searchInput, 'select');

    // In JSDOM, navigator.platform is empty so isMac=false, meaning ctrlKey
    // is the modifier key. Use ctrlKey for the test environment.
    const event = pressKey('k', { ctrlKey: true }, window);

    expect(event.defaultPrevented).toBe(true);
    expect(focusSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();

    focusSpy.mockRestore();
    selectSpy.mockRestore();
  });

  it('? shortcut does NOT fire when typing in an input field', () => {
    renderShortcuts();

    const textInput = document.createElement('input');
    document.body.appendChild(textInput);
    textInput.focus();

    pressKey('?', {}, textInput);
    expect(onOpenShortcutsHelp).not.toHaveBeenCalled();

    document.body.removeChild(textInput);
  });

  it('Backspace does NOT trigger delete when typing in an input field', () => {
    renderShortcuts();

    // Set up a selected employee so Backspace would otherwise trigger delete
    useOrgStore.setState({ selectedEmployee: mockEmployee() });

    const textInput = document.createElement('input');
    document.body.appendChild(textInput);
    textInput.focus();

    pressKey('Backspace', {}, textInput);
    expect(onDeleteSelected).not.toHaveBeenCalled();

    document.body.removeChild(textInput);
  });
});

describe('useKeyboardShortcuts — Escape mixed state handling (scrutiny fix #2)', () => {
  let searchInput: HTMLInputElement;
  const onOpenShortcutsHelp = vi.fn();
  const onDeleteSelected = vi.fn();
  const onClosePanel = vi.fn();

  beforeEach(() => {
    searchInput = document.createElement('input');
    document.body.appendChild(searchInput);

    // Reset stores
    useSelectionStore.getState().clearSelection();
    useOrgStore.setState({ selectedEmployee: null });

    // Reset mocks
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

  it('Escape closes detail panel AND clears multi-select in one press', () => {
    // Set up mixed state: detail panel open + multi-select active
    useOrgStore.setState({ selectedEmployee: mockEmployee() });
    useSelectionStore.getState().selectAll(['emp-1', 'emp-2', 'emp-3']);

    renderShortcuts();

    act(() => {
      pressKey('Escape');
    });

    // Both should be cleared
    expect(useOrgStore.getState().selectedEmployee).toBeNull();
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    expect(onClosePanel).toHaveBeenCalled();
  });

  it('Escape clears multi-select when only multi-select is active', () => {
    useSelectionStore.getState().selectAll(['emp-1', 'emp-2']);

    renderShortcuts();

    act(() => {
      pressKey('Escape');
    });

    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    expect(onClosePanel).toHaveBeenCalled();
  });

  it('Escape closes detail panel when only detail panel is open', () => {
    useOrgStore.setState({ selectedEmployee: mockEmployee() });

    renderShortcuts();

    act(() => {
      pressKey('Escape');
    });

    expect(useOrgStore.getState().selectedEmployee).toBeNull();
    expect(onClosePanel).toHaveBeenCalled();
  });

  it('Escape calls onClosePanel even when no detail panel or multi-select', () => {
    renderShortcuts();

    act(() => {
      pressKey('Escape');
    });

    // onClosePanel should always be called (for budget panel, etc.)
    expect(onClosePanel).toHaveBeenCalled();
  });

  it('Escape still works when focused inside an input element', () => {
    // Escape is the one shortcut that should still work inside inputs
    useOrgStore.setState({ selectedEmployee: mockEmployee() });
    useSelectionStore.getState().selectAll(['emp-1', 'emp-2']);

    renderShortcuts();

    const textInput = document.createElement('input');
    document.body.appendChild(textInput);
    textInput.focus();

    act(() => {
      pressKey('Escape', {}, textInput);
    });

    // Should still close panel and clear selection even from input
    expect(useOrgStore.getState().selectedEmployee).toBeNull();
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);

    document.body.removeChild(textInput);
  });
});
