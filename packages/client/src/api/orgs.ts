import client from './client';
import type { Organization } from '@/types';

export async function getOrgs(): Promise<Organization[]> {
  const { data } = await client.get<Organization[]>('/orgs');
  return data;
}

export async function createOrg(name: string): Promise<Organization> {
  const { data } = await client.post<Organization>('/orgs', { name });
  return data;
}

export async function updateOrg(id: string, updates: Partial<Organization>): Promise<Organization> {
  const { data } = await client.patch<Organization>(`/orgs/${id}`, updates);
  return data;
}

export async function deleteOrg(id: string): Promise<void> {
  await client.delete(`/orgs/${id}`);
}
