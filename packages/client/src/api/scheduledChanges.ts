import client from './client';
import type { ScheduledChange } from '@/types';

export async function getScheduledChanges(
  scenarioId: string,
  status?: string,
): Promise<ScheduledChange[]> {
  const params = status ? { status } : {};
  const { data } = await client.get<ScheduledChange[]>(
    `/scenarios/${scenarioId}/scheduled-changes`,
    { params },
  );
  return data;
}

export async function createScheduledChange(
  scenarioId: string,
  payload: {
    employeeId: string;
    effectiveDate: string;
    changeType: string;
    changeData: Record<string, unknown>;
  },
): Promise<ScheduledChange> {
  const { data } = await client.post<ScheduledChange>(
    `/scenarios/${scenarioId}/scheduled-changes`,
    payload,
  );
  return data;
}

export async function updateScheduledChange(
  id: string,
  updates: Partial<Pick<ScheduledChange, 'effectiveDate' | 'changeType' | 'changeData'>>,
): Promise<ScheduledChange> {
  const { data } = await client.patch<ScheduledChange>(`/scheduled-changes/${id}`, updates);
  return data;
}

export async function deleteScheduledChange(id: string): Promise<ScheduledChange> {
  const { data } = await client.delete<ScheduledChange>(`/scheduled-changes/${id}`);
  return data;
}

export async function applyDueChanges(): Promise<{ applied: string[]; count: number }> {
  const { data } = await client.post<{ applied: string[]; count: number }>(
    '/scheduled-changes/apply-due',
  );
  return data;
}
