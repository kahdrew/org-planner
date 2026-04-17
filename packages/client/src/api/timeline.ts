import client from './client';
import type { Employee } from '@/types';

export type TimelineAction = 'create' | 'update' | 'delete' | 'move' | 'bulk_create' | 'scheduled';

export interface TimelineEvent {
  _id: string;
  scenarioId: string;
  employeeId: string;
  action: TimelineAction;
  snapshot?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  changeType?: string;
  changeData?: Record<string, unknown>;
  performedBy?: string;
  timestamp: string;
  isFuture?: boolean;
}

export interface TimelineResponse {
  events: TimelineEvent[];
  futureMarkers: TimelineEvent[];
}

/**
 * Fetch the list of past audit events and future scheduled-change markers
 * for a scenario. Used to populate the timeline slider markers.
 */
export async function getTimeline(scenarioId: string): Promise<TimelineResponse> {
  const { data } = await client.get<TimelineResponse>(`/scenarios/${scenarioId}/timeline`);
  return data;
}

/**
 * Fetch the org state at a specific point in time. If `date` is omitted,
 * the current state is returned.
 */
export async function getHistoryAtDate(
  scenarioId: string,
  date?: string,
): Promise<Employee[]> {
  const params = date ? { date } : {};
  const { data } = await client.get<Employee[]>(`/scenarios/${scenarioId}/history`, { params });
  return data;
}
