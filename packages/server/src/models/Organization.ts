import mongoose, { Schema, Document, Types } from "mongoose";

export type OrgRole = "owner" | "admin" | "viewer";

export interface MemberRole {
  userId: Types.ObjectId;
  role: OrgRole;
}

export interface IOrganization extends Document {
  name: string;
  ownerId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  memberRoles: MemberRole[];
  createdAt: Date;
  updatedAt: Date;
}

const MemberRoleSchema = new Schema<MemberRole>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: {
      type: String,
      enum: ["owner", "admin", "viewer"],
      required: true,
    },
  },
  { _id: false }
);

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    memberRoles: { type: [MemberRoleSchema], default: [] },
  },
  { timestamps: true }
);

/**
 * Helper: get the role of a user in this org.
 * Returns the role from memberRoles if present, otherwise infers from ownerId.
 */
OrganizationSchema.methods.getMemberRole = function (
  userId: string
): OrgRole | null {
  if (this.ownerId.toString() === userId) return "owner";
  const entry = this.memberRoles.find(
    (mr: MemberRole) => mr.userId.toString() === userId
  );
  if (entry) return entry.role;
  // Legacy: member exists in memberIds but has no role entry → treat as admin
  const isMember = this.memberIds.some(
    (id: Types.ObjectId) => id.toString() === userId
  );
  return isMember ? "admin" : null;
};

export default mongoose.model<IOrganization>("Organization", OrganizationSchema);
