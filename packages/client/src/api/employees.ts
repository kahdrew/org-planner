import client from './client';
import type { Employee } from '@/types';

export async function getEmployees(scenarioId: string): Promise<Employee[]> {
  const { data } = await client.get<Employee[]>(`/scenarios/${scenarioId}/employees`);
  return data;
}

export async function createEmployee(scenarioId: string, payload: Partial<Employee>): Promise<Employee> {
  const { data } = await client.post<Employee>(`/scenarios/${scenarioId}/employees`, payload);
  return data;
}

export async function updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
  const { data } = await client.patch<Employee>(`/employees/${id}`, updates);
  return data;
}

export async function deleteEmployee(id: string): Promise<void> {
  await client.delete(`/employees/${id}`);
}

export async function moveEmployee(id: string, managerId: string | null, order: number): Promise<Employee> {
  const { data } = await client.patch<Employee>(`/employees/${id}/move`, { managerId, order });
  return data;
}

export async function bulkCreateEmployees(scenarioId: string, employees: Partial<Employee>[]): Promise<Employee[]> {
  const { data } = await client.post<Employee[]>(`/scenarios/${scenarioId}/employees/bulk`, employees);
  return data;
}
