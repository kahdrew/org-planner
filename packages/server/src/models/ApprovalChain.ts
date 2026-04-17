import mongoose, { Schema, Document, Types } from "mongoose";

export interface IApprovalStep {
  role: string;
  approverIds: Types.ObjectId[];
}

export interface IApprovalConditions {
  /** Minimum role level (e.g., "Director", "VP") that triggers this chain. Optional. */
  minLevel?: string;
  /** Minimum total cost (salary + equity) that triggers this chain. Optional. */
  minCost?: number;
}

export interface IApprovalChain extends Document {
  orgId: Types.ObjectId;
  name: string;
  description?: string;
  steps: IApprovalStep[];
  conditions: IApprovalConditions;
  /** Priority (higher value = evaluated first when matching conditions). */
  priority: number;
  /** Chain used when no other chain's conditions match. */
  isDefault: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalStepSchema = new Schema<IApprovalStep>(
  {
    role: { type: String, required: true, trim: true },
    approverIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false },
);

const ApprovalConditionsSchema = new Schema<IApprovalConditions>(
  {
    minLevel: { type: String },
    minCost: { type: Number, min: 0 },
  },
  { _id: false },
);

const ApprovalChainSchema = new Schema<IApprovalChain>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    steps: { type: [ApprovalStepSchema], default: [] },
    conditions: { type: ApprovalConditionsSchema, default: {} },
    priority: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// Ensure unique chain name per org
ApprovalChainSchema.index({ orgId: 1, name: 1 }, { unique: true });

export default mongoose.model<IApprovalChain>(
  "ApprovalChain",
  ApprovalChainSchema,
);
