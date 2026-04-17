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
  metadata?: Record<string, unknown>;
}

export type OrgRole = 'owner' | 'admin' | 'viewer';

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface Invitation {
  _id: string;
  orgId: string | { _id: string; name: string };
  email: string;
  role: OrgRole;
  invitedBy: string;
  status: InvitationStatus;
  token: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrgMember {
  _id: string;
  email: string;
  name: string;
  role: OrgRole;
}

export type ScheduledChangeType = 'transfer' | 'promotion' | 'departure' | 'edit';
export type ScheduledChangeStatus = 'pending' | 'applied' | 'cancelled';

export interface ScheduledChange {
  _id: string;
  employeeId: string;
  scenarioId: string;
  effectiveDate: string;
  changeType: ScheduledChangeType;
  changeData: Record<string, unknown>;
  createdBy: string;
  status: ScheduledChangeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetEnvelope {
  _id: string;
  orgId: string;
  scenarioId: string;
  department: string;
  totalBudget: number;
  headcountCap: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type BudgetStatus = 'under' | 'warning' | 'exceeded';

export interface DepartmentBudgetSummary {
  department: string;
  envelopeId: string | null;
  totalBudget: number | null;
  headcountCap: number | null;
  actualSpend: number;
  actualHeadcount: number;
  remainingBudget: number | null;
  remainingHeadcount: number | null;
  utilizationPct: number | null;
  headcountUtilizationPct: number | null;
  budgetStatus: BudgetStatus | null;
  headcountStatus: BudgetStatus | null;
}

export interface BudgetSummary {
  departments: DepartmentBudgetSummary[];
  totals: {
    totalBudget: number;
    headcountCap: number;
    actualSpend: number;
    actualHeadcount: number;
    remainingBudget: number;
    remainingHeadcount: number;
    utilizationPct: number | null;
    headcountUtilizationPct: number | null;
  };
}

export interface ApprovalStep {
  role: string;
  approverIds: string[];
}

export interface ApprovalConditions {
  minLevel?: string;
  minCost?: number;
}

export interface ApprovalChain {
  _id: string;
  orgId: string;
  name: string;
  description?: string;
  steps: ApprovalStep[];
  conditions: ApprovalConditions;
  priority: number;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type HeadcountRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested';

export type HeadcountRequestType = 'new_hire' | 'comp_change';

export type ApprovalAuditAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'resubmit'
  | 'auto_apply';

export interface ApprovalAuditEntry {
  action: ApprovalAuditAction;
  performedBy: string;
  stepIndex: number;
  stepRole?: string;
  comment?: string;
  timestamp: string;
}

export interface HeadcountRequestEmployeeData {
  name: string;
  title: string;
  department: string;
  level: string;
  location: string;
  employmentType: 'FTE' | 'Contractor' | 'Intern';
  status?: 'Active' | 'Planned' | 'Open Req' | 'Backfill';
  salary?: number;
  equity?: number;
  managerId?: string | null;
  startDate?: string;
  costCenter?: string;
  hiringManager?: string;
  recruiter?: string;
  requisitionId?: string;
  justification?: string;
}

export interface HeadcountRequest {
  _id: string;
  orgId: string;
  scenarioId: string;
  requestType: HeadcountRequestType;
  employeeData: HeadcountRequestEmployeeData;
  targetEmployeeId?: string | null;
  requestedBy: string;
  chainId: string;
  currentStep: number;
  status: HeadcountRequestStatus;
  audit: ApprovalAuditEntry[];
  approvedEmployeeId?: string | null;
  createdAt: string;
  updatedAt: string;
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
