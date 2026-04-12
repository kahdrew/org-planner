export interface User {
  _id: string;
  email: string;
  name: string;
}

export interface Organization {
  _id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
}

export interface Scenario {
  _id: string;
  orgId: string;
  name: string;
  description?: string;
  baseScenarioId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  _id: string;
  scenarioId: string;
  name: string;
  title: string;
  department: string;
  level: string;
  location: string;
  startDate?: string;
  salary?: number;
  equity?: number;
  employmentType: 'FTE' | 'Contractor' | 'Intern';
  status: 'Active' | 'Planned' | 'Open Req' | 'Backfill';
  costCenter?: string;
  hiringManager?: string;
  recruiter?: string;
  requisitionId?: string;
  managerId?: string | null;
  order: number;
  avatarUrl?: string;
  metadata?: Record<string, any>;
}

export type DiffStatus = 'added' | 'removed' | 'moved' | 'changed' | 'unchanged';

export interface DiffEntry {
  employee: Employee;
  status: DiffStatus;
  changes?: string[];
}

export interface ScenarioDiff {
  added: DiffEntry[];
  removed: DiffEntry[];
  moved: DiffEntry[];
  changed: DiffEntry[];
  unchanged: DiffEntry[];
}
