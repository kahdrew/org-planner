import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from '@/stores/selectionStore';

describe('selectionStore', () => {
  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  /* -- toggleSelect ----------------------------------------------- */

  it('starts with empty selection', () => {
    const store = useSelectionStore.getState();
    expect(store.selectionCount()).toBe(0);
    expect(store.getSelectedIds()).toEqual([]);
  });

  it('toggleSelect adds an item to selection', () => {
    const store = useSelectionStore.getState();
    store.toggleSelect('emp-1');
    expect(store.isSelected('emp-1')).toBe(true);
    expect(store.selectionCount()).toBe(1);
  });

  it('toggleSelect removes an already-selected item', () => {
    const store = useSelectionStore.getState();
    store.toggleSelect('emp-1');
    store.toggleSelect('emp-1');
    expect(store.isSelected('emp-1')).toBe(false);
    expect(store.selectionCount()).toBe(0);
  });

  it('toggleSelect supports multiple selections', () => {
    const store = useSelectionStore.getState();
    store.toggleSelect('emp-1');
    store.toggleSelect('emp-2');
    store.toggleSelect('emp-3');
    expect(store.selectionCount()).toBe(3);
    expect(store.isSelected('emp-1')).toBe(true);
    expect(store.isSelected('emp-2')).toBe(true);
    expect(store.isSelected('emp-3')).toBe(true);
  });

  it('toggleSelect sets lastClickedId', () => {
    useSelectionStore.getState().toggleSelect('emp-1');
    expect(useSelectionStore.getState().lastClickedId).toBe('emp-1');
  });

  /* -- singleSelect ----------------------------------------------- */

  it('singleSelect clears previous selection and selects one', () => {
    const store = useSelectionStore.getState();
    store.toggleSelect('emp-1');
    store.toggleSelect('emp-2');
    store.singleSelect('emp-3');
    expect(store.selectionCount()).toBe(1);
    expect(store.isSelected('emp-3')).toBe(true);
    expect(store.isSelected('emp-1')).toBe(false);
  });

  /* -- rangeSelect ------------------------------------------------ */

  it('rangeSelect selects a range between anchor and target', () => {
    const orderedIds = ['emp-1', 'emp-2', 'emp-3', 'emp-4', 'emp-5'];
    const store = useSelectionStore.getState();
    // Set anchor
    store.toggleSelect('emp-2');
    // Range select to emp-4
    store.rangeSelect('emp-4', orderedIds);
    expect(store.selectionCount()).toBe(3);
    expect(store.isSelected('emp-2')).toBe(true);
    expect(store.isSelected('emp-3')).toBe(true);
    expect(store.isSelected('emp-4')).toBe(true);
    expect(store.isSelected('emp-1')).toBe(false);
    expect(store.isSelected('emp-5')).toBe(false);
  });

  it('rangeSelect works backwards (target before anchor)', () => {
    const orderedIds = ['emp-1', 'emp-2', 'emp-3', 'emp-4', 'emp-5'];
    const store = useSelectionStore.getState();
    store.toggleSelect('emp-4');
    store.rangeSelect('emp-2', orderedIds);
    expect(store.selectionCount()).toBe(3);
    expect(store.isSelected('emp-2')).toBe(true);
    expect(store.isSelected('emp-3')).toBe(true);
    expect(store.isSelected('emp-4')).toBe(true);
  });

  it('rangeSelect with no anchor selects only the target', () => {
    const orderedIds = ['emp-1', 'emp-2', 'emp-3'];
    const store = useSelectionStore.getState();
    store.rangeSelect('emp-2', orderedIds);
    expect(store.selectionCount()).toBe(1);
    expect(store.isSelected('emp-2')).toBe(true);
  });

  it('rangeSelect falls back to single when anchor not in list', () => {
    const orderedIds = ['emp-1', 'emp-2', 'emp-3'];
    const store = useSelectionStore.getState();
    store.toggleSelect('emp-missing');
    store.rangeSelect('emp-2', orderedIds);
    expect(store.selectionCount()).toBe(1);
    expect(store.isSelected('emp-2')).toBe(true);
  });

  /* -- selectAll -------------------------------------------------- */

  it('selectAll selects all given ids', () => {
    const store = useSelectionStore.getState();
    store.selectAll(['emp-1', 'emp-2', 'emp-3']);
    expect(store.selectionCount()).toBe(3);
    expect(store.isSelected('emp-1')).toBe(true);
    expect(store.isSelected('emp-2')).toBe(true);
    expect(store.isSelected('emp-3')).toBe(true);
  });

  /* -- clearSelection --------------------------------------------- */

  it('clearSelection removes all selections', () => {
    const store = useSelectionStore.getState();
    store.toggleSelect('emp-1');
    store.toggleSelect('emp-2');
    store.clearSelection();
    expect(store.selectionCount()).toBe(0);
    expect(store.lastClickedId).toBeNull();
  });

  /* -- getSelectedIds --------------------------------------------- */

  it('getSelectedIds returns array of selected IDs', () => {
    const store = useSelectionStore.getState();
    store.toggleSelect('emp-1');
    store.toggleSelect('emp-3');
    const ids = store.getSelectedIds();
    expect(ids).toHaveLength(2);
    expect(ids).toContain('emp-1');
    expect(ids).toContain('emp-3');
  });
});
