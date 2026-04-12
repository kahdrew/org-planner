import client from './client';
import type { Scenario, ScenarioDiff } from '@/types';

export async function getScenarios(orgId: string): Promise<Scenario[]> {
  const { data } = await client.get<Scenario[]>(`/orgs/${orgId}/scenarios`);
  return data;
}

export async function createScenario(orgId: string, payload: Partial<Scenario>): Promise<Scenario> {
  const { data } = await client.post<Scenario>(`/orgs/${orgId}/scenarios`, payload);
  return data;
}

export async function cloneScenario(id: string): Promise<Scenario> {
  const { data } = await client.post<Scenario>(`/scenarios/${id}/clone`);
  return data;
}

export async function deleteScenario(id: string): Promise<void> {
  await client.delete(`/scenarios/${id}`);
}

export async function diffScenarios(a: string, b: string): Promise<ScenarioDiff> {
  const { data } = await client.get<ScenarioDiff>(`/scenarios/diff`, { params: { a, b } });
  return data;
}
