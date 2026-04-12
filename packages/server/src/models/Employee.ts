import mongoose, { Schema, Document, Types } from "mongoose";

export interface IEmployee extends Document {
  scenarioId: Types.ObjectId;
  name: string;
  title: string;
  department: string;
  level: string;
  location: string;
  startDate?: Date;
  salary?: number;
  equity?: number;
  employmentType: "FTE" | "Contractor" | "Intern";
  status: "Active" | "Planned" | "Open Req" | "Backfill";
  costCenter?: string;
  hiringManager?: string;
  recruiter?: string;
  requisitionId?: string;
  managerId: Types.ObjectId | null;
  order: number;
  avatarUrl?: string;
  metadata: Record<string, unknown>;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    name: { type: String, required: true },
    title: { type: String, required: true },
    department: { type: String, required: true },
    level: { type: String, required: true },
    location: { type: String, required: true },
    startDate: { type: Date },
    salary: { type: Number },
    equity: { type: Number },
    employmentType: {
      type: String,
      enum: ["FTE", "Contractor", "Intern"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "Planned", "Open Req", "Backfill"],
      required: true,
    },
    costCenter: { type: String },
    hiringManager: { type: String },
    recruiter: { type: String },
    requisitionId: { type: String },
    managerId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    order: { type: Number, default: 0 },
    avatarUrl: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model<IEmployee>("Employee", EmployeeSchema);
