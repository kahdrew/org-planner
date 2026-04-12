import mongoose, { Schema, Document, Types } from "mongoose";

export interface IScenario extends Document {
  orgId: Types.ObjectId;
  name: string;
  description?: string;
  baseScenarioId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ScenarioSchema = new Schema<IScenario>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true },
    description: { type: String },
    baseScenarioId: { type: Schema.Types.ObjectId, ref: "Scenario" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IScenario>("Scenario", ScenarioSchema);
