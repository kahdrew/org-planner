import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInvitationStore } from '@/stores/invitationStore';

// Mock the API module
vi.mock('@/api/invitations', () => ({
  sendInvite: vi.fn(),
  listOrgInvitations: vi.fn(),
  listMyInvitations: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  listMembers: vi.fn(),
  removeMember: vi.fn(),
  changeMemberRole: vi.fn(),
  getMyRole: vi.fn(),
}));

import * as invitationsApi from '@/api/invitations';

const mockApi = invitationsApi as {
  sendInvite: ReturnType<typeof vi.fn>;
  listOrgInvitations: ReturnType<typeof vi.fn>;
  listMyInvitations: ReturnType<typeof vi.fn>;
  acceptInvitation: ReturnType<typeof vi.fn>;
  declineInvitation: ReturnType<typeof vi.fn>;
  listMembers: ReturnType<typeof vi.fn>;
  removeMember: ReturnType<typeof vi.fn>;
  changeMemberRole: ReturnType<typeof vi.fn>;
  getMyRole: ReturnType<typeof vi.fn>;
};

describe('invitationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = useInvitationStore.getState();
    store.resetRole();
    useInvitationStore.setState({
      myInvitations: [],
      myInvitationsLoading: false,
    });
  });

  describe('fetchMyRole', () => {
    it('fetches and sets the current role', async () => {
      mockApi.getMyRole.mockResolvedValue('admin');
      await useInvitationStore.getState().fetchMyRole('org1');
      expect(useInvitationStore.getState().currentRole).toBe('admin');
    });

    it('sets role to null on error', async () => {
      mockApi.getMyRole.mockRejectedValue(new Error('fail'));
      await useInvitationStore.getState().fetchMyRole('org1');
      expect(useInvitationStore.getState().currentRole).toBeNull();
    });
  });

  describe('fetchMembers', () => {
    it('fetches and sets members', async () => {
      const members = [
        { _id: 'u1', email: 'a@b.com', name: 'Alice', role: 'owner' },
        { _id: 'u2', email: 'c@d.com', name: 'Bob', role: 'viewer' },
      ];
      mockApi.listMembers.mockResolvedValue(members);
      await useInvitationStore.getState().fetchMembers('org1');
      expect(useInvitationStore.getState().members).toEqual(members);
      expect(useInvitationStore.getState().membersLoading).toBe(false);
    });
  });

  describe('fetchMyInvitations', () => {
    it('fetches and sets pending invitations', async () => {
      const invitations = [
        {
          _id: 'inv1',
          orgId: { _id: 'org1', name: 'Test Org' },
          email: 'test@example.com',
          role: 'viewer',
          status: 'pending',
        },
      ];
      mockApi.listMyInvitations.mockResolvedValue(invitations);
      await useInvitationStore.getState().fetchMyInvitations();
      expect(useInvitationStore.getState().myInvitations).toEqual(invitations);
    });
  });

  describe('acceptInvitation', () => {
    it('removes the invitation from local state', async () => {
      useInvitationStore.setState({
        myInvitations: [
          { _id: 'inv1', orgId: 'org1', email: 'a@b.com', role: 'viewer', status: 'pending', invitedBy: 'u1', token: 'tok', createdAt: '', updatedAt: '' },
          { _id: 'inv2', orgId: 'org2', email: 'a@b.com', role: 'admin', status: 'pending', invitedBy: 'u1', token: 'tok2', createdAt: '', updatedAt: '' },
        ],
      });
      mockApi.acceptInvitation.mockResolvedValue({});
      await useInvitationStore.getState().acceptInvitation('inv1');
      const remaining = useInvitationStore.getState().myInvitations;
      expect(remaining.length).toBe(1);
      expect(remaining[0]._id).toBe('inv2');
    });
  });

  describe('declineInvitation', () => {
    it('removes the invitation from local state', async () => {
      useInvitationStore.setState({
        myInvitations: [
          { _id: 'inv1', orgId: 'org1', email: 'a@b.com', role: 'viewer', status: 'pending', invitedBy: 'u1', token: 'tok', createdAt: '', updatedAt: '' },
        ],
      });
      mockApi.declineInvitation.mockResolvedValue({});
      await useInvitationStore.getState().declineInvitation('inv1');
      expect(useInvitationStore.getState().myInvitations.length).toBe(0);
    });
  });

  describe('removeMember', () => {
    it('removes the member from local state', async () => {
      useInvitationStore.setState({
        members: [
          { _id: 'u1', email: 'a@b.com', name: 'Alice', role: 'owner' },
          { _id: 'u2', email: 'c@d.com', name: 'Bob', role: 'viewer' },
        ],
      });
      mockApi.removeMember.mockResolvedValue(undefined);
      await useInvitationStore.getState().removeMember('org1', 'u2');
      const remaining = useInvitationStore.getState().members;
      expect(remaining.length).toBe(1);
      expect(remaining[0]._id).toBe('u1');
    });
  });

  describe('changeMemberRole', () => {
    it('updates the role in local state', async () => {
      useInvitationStore.setState({
        members: [
          { _id: 'u1', email: 'a@b.com', name: 'Alice', role: 'owner' },
          { _id: 'u2', email: 'c@d.com', name: 'Bob', role: 'viewer' },
        ],
      });
      mockApi.changeMemberRole.mockResolvedValue(undefined);
      await useInvitationStore.getState().changeMemberRole('org1', 'u2', 'admin');
      const bob = useInvitationStore.getState().members.find((m) => m._id === 'u2');
      expect(bob?.role).toBe('admin');
    });
  });

  describe('resetRole', () => {
    it('clears role and member data', () => {
      useInvitationStore.setState({
        currentRole: 'admin',
        members: [{ _id: 'u1', email: 'a@b.com', name: 'Alice', role: 'admin' }],
        orgInvitations: [],
      });
      useInvitationStore.getState().resetRole();
      const state = useInvitationStore.getState();
      expect(state.currentRole).toBeNull();
      expect(state.members).toEqual([]);
    });
  });
});
