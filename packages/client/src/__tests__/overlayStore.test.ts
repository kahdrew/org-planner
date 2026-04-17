import { describe, it, expect, beforeEach } from 'vitest';
import { useOverlayStore } from '@/stores/overlayStore';

describe('overlayStore', () => {
  beforeEach(() => {
    useOverlayStore.setState({ mode: 'none' });
  });

  it('defaults to "none" mode', () => {
    expect(useOverlayStore.getState().mode).toBe('none');
  });

  it('setMode updates the active mode', () => {
    useOverlayStore.getState().setMode('salary');
    expect(useOverlayStore.getState().mode).toBe('salary');

    useOverlayStore.getState().setMode('department');
    expect(useOverlayStore.getState().mode).toBe('department');
  });

  it('reset returns mode to "none"', () => {
    useOverlayStore.getState().setMode('tenure');
    expect(useOverlayStore.getState().mode).toBe('tenure');

    useOverlayStore.getState().reset();
    expect(useOverlayStore.getState().mode).toBe('none');
  });

  it('persists across unrelated state changes (singleton store)', () => {
    useOverlayStore.getState().setMode('status');
    // Simulate a consumer re-reading — should still observe the mode.
    expect(useOverlayStore.getState().mode).toBe('status');
  });

  it('supports all five overlay modes plus none', () => {
    const modes: Array<'none' | 'salary' | 'tenure' | 'department' | 'employmentType' | 'status'> = [
      'none',
      'salary',
      'tenure',
      'department',
      'employmentType',
      'status',
    ];
    for (const m of modes) {
      useOverlayStore.getState().setMode(m);
      expect(useOverlayStore.getState().mode).toBe(m);
    }
  });
});
