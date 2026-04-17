import client from './client';
import type { BudgetEnvelope, BudgetSummary } from '@/types';

export async function getBudgetEnvelopes(
  scenarioId: string,
): Promise<BudgetEnvelope[]> {
  const { data } = await client.get<BudgetEnvelope[]>(
    `/scenarios/${scenarioId}/budgets`,
  );
  return data;
}

export async function createBudgetEnvelope(
  scenarioId: string,
  payload: { department: string; totalBudget: number; headcountCap: number },
): Promise<BudgetEnvelope> {
  const { data } = await client.post<BudgetEnvelope>(
    `/scenarios/${scenarioId}/budgets`,
    payload,
  );
  return data;
}

export async function updateBudgetEnvelope(
  scenarioId: string,
  budgetId: string,
  updates: Partial<Pick<BudgetEnvelope, 'department' | 'totalBudget' | 'headcountCap'>>,
): Promise<BudgetEnvelope> {
  const { data } = await client.patch<BudgetEnvelope>(
    `/scenarios/${scenarioId}/budgets/${budgetId}`,
    updates,
  );
  return data;
}

export async function deleteBudgetEnvelope(
  scenarioId: string,
  budgetId: string,
): Promise<void> {
  await client.delete(`/scenarios/${scenarioId}/budgets/${budgetId}`);
}

export async function getBudgetSummary(
  scenarioId: string,
): Promise<BudgetSummary> {
  const { data } = await client.get<BudgetSummary>(
    `/scenarios/${scenarioId}/budgets/summary`,
  );
  return data;
}
