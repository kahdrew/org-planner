import mongoose, { Schema, Document, Types } from "mongoose";

export type HeadcountRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested";

export type HeadcountRequestType = "new_hire" | "comp_change";

export type ApprovalAuditAction =
  | "submit"
  | "approve"
  | "reject"
  | "request_changes"
  | "resubmit"
  | "auto_apply";

export interface IApprovalAuditEntry {
  action: ApprovalAuditAction;
  performedBy: Types.ObjectId;
  stepIndex: number;
  stepRole?: string;
  comment?: string;
  timestamp: Date;
}

/**
 * Minimal snapshot of employee-like data captured on the request. Shape
 * mirrors the Employee model's fields so an approved request can cleanly
 * create (or update) an Employee record.
 */
export interface IEmployeeRequestData {
  name: string;
  title: string;
  department: string;
  level: string;
  location: string;
  employmentType: "FTE" | "Contractor" | "Intern";
  status?: "Active" | "Planned" | "Open Req" | "Backfill";
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

export interface IHeadcountRequest extends Document {
  orgId: Types.ObjectId;
  scenarioId: Types.ObjectId;
  requestType: HeadcountRequestType;
  /** Snapshot of employee data submitted with the request. */
  employeeData: IEmployeeRequestData;
  /** For comp_change: the employee being updated. */
  targetEmployeeId?: Types.ObjectId | null;
  requestedBy: Types.ObjectId;
  chainId: Types.ObjectId;
  /** Index of the current step in the chain (0-based). */
  currentStep: number;
  status: HeadcountRequestStatus;
  /** Running audit trail of every action taken on the request. */
  audit: IApprovalAuditEntry[];
  /** When approved, the employee record that was created (or updated). */
  approvedEmployeeId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const AuditEntrySchema = new Schema<IApprovalAuditEntry>(
  {
    action: {
      type: String,
      enum: ["submit", "approve", "reject", "request_changes", "resubmit", "auto_apply"],
      required: true,
    },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    stepIndex: { type: Number, required: true, default: 0 },
    stepRole: { type: String },
    comment: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const EmployeeRequestDataSchema = new Schema<IEmployeeRequestData>(
  {
    name: { type: String, required: true },
    title: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    location: { type: String, required: true },
    employmentType: {
      type: String,
      enum: ["FTE", "Contractor", "Intern"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "Planned", "Open Req", "Backfill"],
    },
    salary: { type: Number },
    equity: { type: Number },
    managerId: { type: String, default: null },
    startDate: { type: String },
    costCenter: { type: String },
    hiringManager: { type: String },
    recruiter: { type: String },
    requisitionId: { type: String },
    justification: { type: String },
  },
  { _id: false },
);

const HeadcountRequestSchema = new Schema<IHeadcountRequest>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    requestType: {
      type: String,
      enum: ["new_hire", "comp_change"],
      default: "new_hire",
    },
    employeeData: { type: EmployeeRequestDataSchema, required: true },
    targetEmployeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chainId: {
      type: Schema.Types.ObjectId,
      ref: "ApprovalChain",
      required: true,
    },
    currentStep: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "changes_requested"],
      default: "pending",
    },
    audit: { type: [AuditEntrySchema], default: [] },
    approvedEmployeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
  },
  { timestamps: true },
);

// Index for efficient pending queries per org/scenario
HeadcountRequestSchema.index({ orgId: 1, status: 1 });
HeadcountRequestSchema.index({ scenarioId: 1, status: 1 });

export default mongoose.model<IHeadcountRequest>(
  "HeadcountRequest",
  HeadcountRequestSchema,
);
