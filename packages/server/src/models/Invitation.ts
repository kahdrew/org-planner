import mongoose, { Schema, Document, Types } from "mongoose";

export type OrgRole = "owner" | "admin" | "viewer";
export type InvitationStatus = "pending" | "accepted" | "declined";

export interface IInvitation extends Document {
  orgId: Types.ObjectId;
  email: string;
  role: OrgRole;
  invitedBy: Types.ObjectId;
  status: InvitationStatus;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    email: { type: String, required: true },
    role: {
      type: String,
      enum: ["owner", "admin", "viewer"],
      required: true,
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    token: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate pending invitations
InvitationSchema.index(
  { orgId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

export default mongoose.model<IInvitation>("Invitation", InvitationSchema);
