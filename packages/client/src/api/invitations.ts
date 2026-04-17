import client from './client';
import type { Invitation, OrgMember, OrgRole } from '@/types';

export async function sendInvite(orgId: string, email: string, role: OrgRole): Promise<Invitation> {
  const { data } = await client.post<Invitation>(`/orgs/${orgId}/invite`, { email, role });
  return data;
}

export async function listOrgInvitations(orgId: string): Promise<Invitation[]> {
  const { data } = await client.get<Invitation[]>(`/orgs/${orgId}/invitations`);
  return data;
}

export async function listMyInvitations(): Promise<Invitation[]> {
  const { data } = await client.get<Invitation[]>('/invitations');
  return data;
}

export async function acceptInvitation(invitationId: string): Promise<Invitation> {
  const { data } = await client.post<Invitation>(`/invitations/${invitationId}/accept`);
  return data;
}

export async function declineInvitation(invitationId: string): Promise<Invitation> {
  const { data } = await client.post<Invitation>(`/invitations/${invitationId}/decline`);
  return data;
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const { data } = await client.get<OrgMember[]>(`/orgs/${orgId}/members`);
  return data;
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  await client.delete(`/orgs/${orgId}/members/${userId}`);
}

export async function changeMemberRole(orgId: string, userId: string, role: OrgRole): Promise<void> {
  await client.patch(`/orgs/${orgId}/members/${userId}`, { role });
}

export async function getMyRole(orgId: string): Promise<OrgRole> {
  const { data } = await client.get<{ role: OrgRole }>(`/orgs/${orgId}/role`);
  return data.role;
}
