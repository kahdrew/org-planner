import mongoose, { Schema, Document, Types } from "mongoose";

export interface IBudgetEnvelope extends Document {
  orgId: Types.ObjectId;
  scenarioId: Types.ObjectId;
  department: string;
  totalBudget: number;
  headcountCap: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BudgetEnvelopeSchema = new Schema<IBudgetEnvelope>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    department: { type: String, required: true, trim: true },
    totalBudget: { type: Number, required: true, min: 0 },
    headcountCap: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Enforce one envelope per (scenario, department) combination.
BudgetEnvelopeSchema.index(
  { scenarioId: 1, department: 1 },
  { unique: true }
);

export default mongoose.model<IBudgetEnvelope>(
  "BudgetEnvelope",
  BudgetEnvelopeSchema
);
