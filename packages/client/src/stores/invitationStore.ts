import { create } from 'zustand';
import type { Invitation, OrgMember, OrgRole } from '@/types';
import * as invitationsApi from '@/api/invitations';

interface InvitationState {
  // Org members
  members: OrgMember[];
  membersLoading: boolean;

  // Org pending invitations (visible to owner/admin)
  orgInvitations: Invitation[];

  // Current user's pending invitations
  myInvitations: Invitation[];
  myInvitationsLoading: boolean;

  // Current user's role in the current org
  currentRole: OrgRole | null;

  // Actions
  fetchMembers: (orgId: string) => Promise<void>;
  fetchOrgInvitations: (orgId: string) => Promise<void>;
  fetchMyInvitations: () => Promise<void>;
  fetchMyRole: (orgId: string) => Promise<void>;
  sendInvite: (orgId: string, email: string, role: OrgRole) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;
  removeMember: (orgId: string, userId: string) => Promise<void>;
  changeMemberRole: (orgId: string, userId: string, role: OrgRole) => Promise<void>;
  resetRole: () => void;
}

export const useInvitationStore = create<InvitationState>((set, get) => ({
  members: [],
  membersLoading: false,
  orgInvitations: [],
  myInvitations: [],
  myInvitationsLoading: false,
  currentRole: null,

  fetchMembers: async (orgId) => {
    set({ membersLoading: true });
    try {
      const members = await invitationsApi.listMembers(orgId);
      set({ members });
    } finally {
      set({ membersLoading: false });
    }
  },

  fetchOrgInvitations: async (orgId) => {
    try {
      const orgInvitations = await invitationsApi.listOrgInvitations(orgId);
      set({ orgInvitations });
    } catch {
      // Non-critical; may fail for non-owner/admin
    }
  },

  fetchMyInvitations: async () => {
    set({ myInvitationsLoading: true });
    try {
      const myInvitations = await invitationsApi.listMyInvitations();
      set({ myInvitations });
    } finally {
      set({ myInvitationsLoading: false });
    }
  },

  fetchMyRole: async (orgId) => {
    try {
      const role = await invitationsApi.getMyRole(orgId);
      set({ currentRole: role });
    } catch {
      set({ currentRole: null });
    }
  },

  sendInvite: async (orgId, email, role) => {
    await invitationsApi.sendInvite(orgId, email, role);
    // Refresh org invitations
    get().fetchOrgInvitations(orgId);
  },

  acceptInvitation: async (invitationId) => {
    await invitationsApi.acceptInvitation(invitationId);
    // Remove from local list
    set((state) => ({
      myInvitations: state.myInvitations.filter((inv) => inv._id !== invitationId),
    }));
  },

  declineInvitation: async (invitationId) => {
    await invitationsApi.declineInvitation(invitationId);
    // Remove from local list
    set((state) => ({
      myInvitations: state.myInvitations.filter((inv) => inv._id !== invitationId),
    }));
  },

  removeMember: async (orgId, userId) => {
    await invitationsApi.removeMember(orgId, userId);
    set((state) => ({
      members: state.members.filter((m) => m._id !== userId),
    }));
  },

  changeMemberRole: async (orgId, userId, role) => {
    await invitationsApi.changeMemberRole(orgId, userId, role);
    set((state) => ({
      members: state.members.map((m) =>
        m._id === userId ? { ...m, role } : m
      ),
    }));
  },

  resetRole: () => {
    set({ currentRole: null, members: [], orgInvitations: [] });
  },
}));
