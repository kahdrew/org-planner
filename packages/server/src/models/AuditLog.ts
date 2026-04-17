import mongoose, { Schema, Document, Types } from "mongoose";

export type AuditAction = "create" | "update" | "delete" | "move" | "bulk_create";

export interface IAuditLog extends Document {
  scenarioId: Types.ObjectId;
  employeeId: Types.ObjectId;
  action: AuditAction;
  /** Snapshot of the employee at the time of the action */
  snapshot: Record<string, unknown>;
  /** For updates/moves: the changes that were applied */
  changes?: Record<string, unknown>;
  performedBy: Types.ObjectId;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    action: {
      type: String,
      enum: ["create", "update", "delete", "move", "bulk_create"],
      required: true,
    },
    snapshot: { type: Schema.Types.Mixed, required: true },
    changes: { type: Schema.Types.Mixed },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    timestamp: { type: Date, default: Date.now, required: true },
  },
  { timestamps: false }
);

// Index for efficient timeline queries
AuditLogSchema.index({ scenarioId: 1, timestamp: 1 });
// Index for per-employee history
AuditLogSchema.index({ scenarioId: 1, employeeId: 1, timestamp: 1 });

export default mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
