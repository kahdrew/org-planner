import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useScheduledChangeStore } from '@/stores/scheduledChangeStore';

// Mock the API module
vi.mock('@/api/scheduledChanges', () => ({
  getScheduledChanges: vi.fn(),
  createScheduledChange: vi.fn(),
  updateScheduledChange: vi.fn(),
  deleteScheduledChange: vi.fn(),
  applyDueChanges: vi.fn(),
}));

import * as api from '@/api/scheduledChanges';

const mockApi = api as {
  getScheduledChanges: ReturnType<typeof vi.fn>;
  createScheduledChange: ReturnType<typeof vi.fn>;
  updateScheduledChange: ReturnType<typeof vi.fn>;
  deleteScheduledChange: ReturnType<typeof vi.fn>;
  applyDueChanges: ReturnType<typeof vi.fn>;
};

const mockChange = {
  _id: 'sc1',
  employeeId: 'emp1',
  scenarioId: 'scen1',
  effectiveDate: '2026-05-01T00:00:00.000Z',
  changeType: 'promotion' as const,
  changeData: { title: 'Senior Engineer', level: 'IC4' },
  createdBy: 'user1',
  status: 'pending' as const,
  createdAt: '2026-04-15T00:00:00.000Z',
  updatedAt: '2026-04-15T00:00:00.000Z',
};

const mockChange2 = {
  ...mockChange,
  _id: 'sc2',
  employeeId: 'emp2',
  changeType: 'transfer' as const,
  changeData: { department: 'Product' },
};

describe('scheduledChangeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScheduledChangeStore.setState({
      scheduledChanges: [],
      loading: false,
    });
  });

  describe('fetchScheduledChanges', () => {
    it('fetches and sets scheduled changes', async () => {
      mockApi.getScheduledChanges.mockResolvedValue([mockChange, mockChange2]);
      await useScheduledChangeStore.getState().fetchScheduledChanges('scen1');
      expect(mockApi.getScheduledChanges).toHaveBeenCalledWith('scen1');
      expect(useScheduledChangeStore.getState().scheduledChanges).toEqual([mockChange, mockChange2]);
      expect(useScheduledChangeStore.getState().loading).toBe(false);
    });

    it('sets loading state during fetch', async () => {
      let resolvePromise: (value: unknown[]) => void;
      const promise = new Promise<unknown[]>((resolve) => {
        resolvePromise = resolve;
      });
      mockApi.getScheduledChanges.mockReturnValue(promise);

      const fetchPromise = useScheduledChangeStore.getState().fetchScheduledChanges('scen1');
      expect(useScheduledChangeStore.getState().loading).toBe(true);

      resolvePromise!([]);
      await fetchPromise;
      expect(useScheduledChangeStore.getState().loading).toBe(false);
    });
  });

  describe('createScheduledChange', () => {
    it('creates and adds a scheduled change to state', async () => {
      mockApi.createScheduledChange.mockResolvedValue(mockChange);
      const result = await useScheduledChangeStore.getState().createScheduledChange('scen1', {
        employeeId: 'emp1',
        effectiveDate: '2026-05-01',
        changeType: 'promotion',
        changeData: { title: 'Senior Engineer', level: 'IC4' },
      });
      expect(result).toEqual(mockChange);
      expect(useScheduledChangeStore.getState().scheduledChanges).toEqual([mockChange]);
    });
  });

  describe('updateScheduledChange', () => {
    it('updates a scheduled change in state', async () => {
      useScheduledChangeStore.setState({ scheduledChanges: [mockChange] });
      const updated = { ...mockChange, effectiveDate: '2026-06-01T00:00:00.000Z' };
      mockApi.updateScheduledChange.mockResolvedValue(updated);

      await useScheduledChangeStore.getState().updateScheduledChange('sc1', {
        effectiveDate: '2026-06-01',
      });

      const changes = useScheduledChangeStore.getState().scheduledChanges;
      expect(changes[0].effectiveDate).toBe('2026-06-01T00:00:00.000Z');
    });
  });

  describe('cancelScheduledChange', () => {
    it('cancels a scheduled change (updates status to cancelled)', async () => {
      useScheduledChangeStore.setState({ scheduledChanges: [mockChange] });
      const cancelled = { ...mockChange, status: 'cancelled' as const };
      mockApi.deleteScheduledChange.mockResolvedValue(cancelled);

      await useScheduledChangeStore.getState().cancelScheduledChange('sc1');

      const changes = useScheduledChangeStore.getState().scheduledChanges;
      expect(changes[0].status).toBe('cancelled');
    });
  });

  describe('applyDueChanges', () => {
    it('applies due changes and updates status', async () => {
      useScheduledChangeStore.setState({ scheduledChanges: [mockChange, mockChange2] });
      mockApi.applyDueChanges.mockResolvedValue({ applied: ['sc1'], count: 1 });

      const count = await useScheduledChangeStore.getState().applyDueChanges();

      expect(count).toBe(1);
      const changes = useScheduledChangeStore.getState().scheduledChanges;
      expect(changes.find((c) => c._id === 'sc1')?.status).toBe('applied');
      expect(changes.find((c) => c._id === 'sc2')?.status).toBe('pending');
    });

    it('returns 0 when no changes are due', async () => {
      mockApi.applyDueChanges.mockResolvedValue({ applied: [], count: 0 });
      const count = await useScheduledChangeStore.getState().applyDueChanges();
      expect(count).toBe(0);
    });
  });

  describe('getPendingChangesForEmployee', () => {
    it('returns only pending changes for a specific employee', () => {
      const cancelledChange = { ...mockChange, _id: 'sc3', status: 'cancelled' as const };
      useScheduledChangeStore.setState({
        scheduledChanges: [mockChange, mockChange2, cancelledChange],
      });

      const pending = useScheduledChangeStore.getState().getPendingChangesForEmployee('emp1');
      expect(pending).toHaveLength(1);
      expect(pending[0]._id).toBe('sc1');
    });

    it('returns empty array for employee with no changes', () => {
      useScheduledChangeStore.setState({ scheduledChanges: [mockChange] });
      const pending = useScheduledChangeStore.getState().getPendingChangesForEmployee('emp999');
      expect(pending).toHaveLength(0);
    });
  });

  describe('hasPendingChanges', () => {
    it('returns true when employee has pending changes', () => {
      useScheduledChangeStore.setState({ scheduledChanges: [mockChange] });
      expect(useScheduledChangeStore.getState().hasPendingChanges('emp1')).toBe(true);
    });

    it('returns false when employee has no pending changes', () => {
      useScheduledChangeStore.setState({ scheduledChanges: [mockChange] });
      expect(useScheduledChangeStore.getState().hasPendingChanges('emp999')).toBe(false);
    });

    it('returns false when all changes are cancelled', () => {
      const cancelled = { ...mockChange, status: 'cancelled' as const };
      useScheduledChangeStore.setState({ scheduledChanges: [cancelled] });
      expect(useScheduledChangeStore.getState().hasPendingChanges('emp1')).toBe(false);
    });
  });

  describe('clearChanges', () => {
    it('clears all scheduled changes', () => {
      useScheduledChangeStore.setState({ scheduledChanges: [mockChange, mockChange2] });
      useScheduledChangeStore.getState().clearChanges();
      expect(useScheduledChangeStore.getState().scheduledChanges).toEqual([]);
    });
  });
});
