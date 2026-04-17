import mongoose, { Schema, Document, Types } from "mongoose";

export type ScheduledChangeType = "transfer" | "promotion" | "departure" | "edit";
export type ScheduledChangeStatus = "pending" | "applied" | "cancelled";

export interface IScheduledChange extends Document {
  employeeId: Types.ObjectId;
  scenarioId: Types.ObjectId;
  effectiveDate: Date;
  changeType: ScheduledChangeType;
  changeData: Record<string, unknown>;
  createdBy: Types.ObjectId;
  status: ScheduledChangeStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledChangeSchema = new Schema<IScheduledChange>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    effectiveDate: { type: Date, required: true },
    changeType: {
      type: String,
      enum: ["transfer", "promotion", "departure", "edit"],
      required: true,
    },
    changeData: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "applied", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Index for efficient queries by scenario and status
ScheduledChangeSchema.index({ scenarioId: 1, status: 1 });
// Index for auto-apply job: find pending changes with past effective dates
ScheduledChangeSchema.index({ status: 1, effectiveDate: 1 });

export default mongoose.model<IScheduledChange>("ScheduledChange", ScheduledChangeSchema);
