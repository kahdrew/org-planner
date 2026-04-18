/**
 * Regression tests for VAL-MULTI-002.
 *
 * The user-testing validator observed that clicking an employee name in
 * HierarchyView (which lives inside an `InlineEditableField` that calls
 * `e.stopPropagation()` on plain clicks) never set the selection anchor,
 * so a subsequent Shift+Click only selected the Shift-clicked item.
 *
 * Fix: set `lastClickedId` in the row's `onMouseDownCapture` handler, which
 * runs BEFORE any child's click/mousedown handlers. These tests simulate
 * the DOM event flow and confirm the anchor is set regardless of whether
 * the inline-editable child stops propagation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useSelectionStore } from '@/stores/selectionStore';

/**
 * Minimal reproduction of the HierarchyView row + InlineEditableField
 * pattern: the outer row sets the anchor on mousedown-capture, while the
 * inner name span stops propagation on plain click (to enter edit mode).
 */
function Row({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div
      data-testid={`row-${id}`}
      onMouseDownCapture={(e) => {
        if (!e.shiftKey) {
          useSelectionStore.setState({ lastClickedId: id });
        }
      }}
      onClick={(e) => {
        if (e.shiftKey) {
          // Simulate HierarchyView's shift+click handler
          const orderedIds = ['emp-1', 'emp-2', 'emp-3', 'emp-4', 'emp-5'];
          useSelectionStore.getState().rangeSelect(id, orderedIds);
        }
      }}
    >
      {children}
    </div>
  );
}

function NameField({ onEditStart }: { onEditStart: () => void }) {
  return (
    <span
      data-testid="name-field"
      onMouseDown={(e) => {
        // InlineEditableField stops propagation of mousedown on plain click
        e.stopPropagation();
      }}
      onClick={(e) => {
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.stopPropagation();
          onEditStart();
        }
      }}
    >
      Name Text
    </span>
  );
}

describe('VAL-MULTI-002 — capture-phase anchor survives inline-field stopPropagation', () => {
  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  it('plain click on inline name still sets the selection anchor via capture phase', () => {
    const { getByTestId } = render(
      <Row id="emp-2">
        <NameField onEditStart={() => {}} />
      </Row>,
    );

    // Plain click lands on the inline-editable name span
    fireEvent.mouseDown(getByTestId('name-field'));
    fireEvent.click(getByTestId('name-field'));

    // The row's capture-phase handler should have set lastClickedId before
    // the child stopPropagation blocked the row's own bubble-phase handler.
    expect(useSelectionStore.getState().lastClickedId).toBe('emp-2');
  });

  it('subsequent Shift+Click after plain click yields inclusive range selection', () => {
    const { getAllByTestId } = render(
      <div>
        <Row id="emp-1">
          <NameField onEditStart={() => {}} />
        </Row>
        <Row id="emp-2">
          <NameField onEditStart={() => {}} />
        </Row>
        <Row id="emp-3">
          <NameField onEditStart={() => {}} />
        </Row>
        <Row id="emp-4">
          <NameField onEditStart={() => {}} />
        </Row>
      </div>,
    );

    const nameFields = getAllByTestId('name-field');

    // 1. Plain click on Emp 1's name — captures emp-1 as anchor
    fireEvent.mouseDown(nameFields[0]);
    fireEvent.click(nameFields[0]);
    expect(useSelectionStore.getState().lastClickedId).toBe('emp-1');

    // 2. Shift+Click on Emp 4's name
    fireEvent.mouseDown(nameFields[3], { shiftKey: true });
    fireEvent.click(nameFields[3], { shiftKey: true });

    const state = useSelectionStore.getState();
    expect(state.selectionCount()).toBe(4);
    expect(state.isSelected('emp-1')).toBe(true);
    expect(state.isSelected('emp-2')).toBe(true);
    expect(state.isSelected('emp-3')).toBe(true);
    expect(state.isSelected('emp-4')).toBe(true);
  });

  it('Shift+Click does not overwrite the anchor (allows continued range extension)', () => {
    const { getAllByTestId } = render(
      <div>
        <Row id="emp-1">
          <NameField onEditStart={() => {}} />
        </Row>
        <Row id="emp-3">
          <NameField onEditStart={() => {}} />
        </Row>
      </div>,
    );

    const nameFields = getAllByTestId('name-field');

    // Plain click on first row sets anchor
    fireEvent.mouseDown(nameFields[0]);
    fireEvent.click(nameFields[0]);
    expect(useSelectionStore.getState().lastClickedId).toBe('emp-1');

    // Shift+Click on later row — capture handler should ignore (no anchor
    // reset) because shiftKey is true
    fireEvent.mouseDown(nameFields[1], { shiftKey: true });
    fireEvent.click(nameFields[1], { shiftKey: true });

    expect(useSelectionStore.getState().lastClickedId).toBe('emp-1');
  });
});
