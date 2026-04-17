import { Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { AuthRequest } from "../middleware/auth";
import Invitation from "../models/Invitation";
import Organization from "../models/Organization";
import User from "../models/User";
import { getUserOrgRole } from "../middleware/authorization";
import type { OrgRole } from "../models/Organization";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "viewer"]),
});

const changeRoleSchema = z.object({
  role: z.enum(["admin", "viewer"]),
});

/**
 * POST /api/orgs/:id/invite
 * Send an invitation to join the org. Only owner can invite.
 */
export const sendInvite = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email, role } = inviteSchema.parse(req.body);
    const orgId = req.params.id;
    const userId = req.user!.userId;

    const org = await Organization.findById(orgId);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    // Only the current owner can invite as owner (ownership transfer)
    if (role === "owner" && org.ownerId.toString() !== userId) {
      res.status(403).json({ error: "Only the current owner can invite as owner" });
      return;
    }

    // Check if user is already a member
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const isMember = org.memberIds.some(
        (id) => id.toString() === existingUser._id.toString()
      );
      if (isMember) {
        res.status(409).json({ error: "User is already a member of this organization" });
        return;
      }
    }

    // Check for existing pending invitation
    const existingInvite = await Invitation.findOne({
      orgId,
      email,
      status: "pending",
    });
    if (existingInvite) {
      res.status(409).json({ error: "Invitation already sent to this email" });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");

    const invitation = await Invitation.create({
      orgId,
      email,
      role,
      invitedBy: userId,
      status: "pending",
      token,
    });

    res.status(201).json(invitation);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/orgs/:id/invitations
 * List pending invitations for an org. Owner/admin can view.
 */
export const listOrgInvitations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const orgId = req.params.id;
    const invitations = await Invitation.find({ orgId, status: "pending" });
    res.json(invitations);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/invitations
 * List pending invitations for the currently authenticated user (by email).
 */
export const listMyInvitations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const invitations = await Invitation.find({
      email: user.email,
      status: "pending",
    }).populate("orgId", "name");

    res.json(invitations);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/invitations/:id/accept
 * Accept a pending invitation.
 */
export const acceptInvitation = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const invitationId = req.params.id;
    const userId = req.user!.userId;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    if (invitation.email !== user.email) {
      res.status(403).json({ error: "This invitation is not for you" });
      return;
    }

    if (invitation.status !== "pending") {
      res.status(400).json({ error: "Invitation is no longer pending" });
      return;
    }

    // Add user to org
    const org = await Organization.findById(invitation.orgId);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    org.memberIds.push(user._id);

    if (invitation.role === "owner") {
      // Transfer ownership: new user becomes owner, old owner becomes admin
      const previousOwnerId = org.ownerId;
      org.ownerId = user._id;

      // Update old owner's role to admin
      const oldOwnerRoleIndex = org.memberRoles.findIndex(
        (mr) => mr.userId.toString() === previousOwnerId.toString()
      );
      if (oldOwnerRoleIndex >= 0) {
        org.memberRoles[oldOwnerRoleIndex].role = "admin";
      } else {
        org.memberRoles.push({
          userId: previousOwnerId,
          role: "admin" as OrgRole,
        });
      }

      // Set new owner role
      org.memberRoles.push({
        userId: user._id,
        role: "owner" as OrgRole,
      });
    } else {
      org.memberRoles.push({
        userId: user._id,
        role: invitation.role as OrgRole,
      });
    }

    org.markModified("memberRoles");
    await org.save();

    invitation.status = "accepted";
    await invitation.save();

    res.json(invitation);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/invitations/:id/decline
 * Decline a pending invitation.
 */
export const declineInvitation = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const invitationId = req.params.id;
    const userId = req.user!.userId;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    if (invitation.email !== user.email) {
      res.status(403).json({ error: "This invitation is not for you" });
      return;
    }

    if (invitation.status !== "pending") {
      res.status(400).json({ error: "Invitation is no longer pending" });
      return;
    }

    invitation.status = "declined";
    await invitation.save();

    res.json(invitation);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/orgs/:id/members
 * List members of an org with their roles.
 */
export const listMembers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const orgId = req.params.id;
    const org = await Organization.findById(orgId).populate(
      "memberIds",
      "email name"
    );
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const members = (org.memberIds as unknown as Array<{ _id: string; email: string; name: string }>).map(
      (member) => {
        const roleEntry = org.memberRoles.find(
          (mr) => mr.userId.toString() === member._id.toString()
        );
        let role: OrgRole;
        if (org.ownerId.toString() === member._id.toString()) {
          role = "owner";
        } else if (roleEntry) {
          role = roleEntry.role;
        } else {
          role = "admin"; // Legacy members default to admin
        }
        return {
          _id: member._id,
          email: member.email,
          name: member.name,
          role,
        };
      }
    );

    res.json(members);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /api/orgs/:id/members/:userId
 * Remove a member from the org. Only owner can remove members.
 */
export const removeMember = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const orgId = req.params.id;
    const targetUserId = req.params.userId;
    const requesterId = req.user!.userId;

    const org = await Organization.findById(orgId);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    // Cannot remove the owner
    if (org.ownerId.toString() === targetUserId) {
      res.status(400).json({ error: "Cannot remove the owner" });
      return;
    }

    // Cannot remove yourself (owner should transfer ownership first)
    if (requesterId === targetUserId) {
      res.status(400).json({ error: "Cannot remove yourself" });
      return;
    }

    // Check target is actually a member
    const memberIndex = org.memberIds.findIndex(
      (id) => id.toString() === targetUserId
    );
    if (memberIndex === -1) {
      res.status(404).json({ error: "User is not a member" });
      return;
    }

    org.memberIds.splice(memberIndex, 1);
    org.memberRoles = org.memberRoles.filter(
      (mr) => mr.userId.toString() !== targetUserId
    );
    await org.save();

    res.json({ message: "Member removed" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /api/orgs/:id/members/:userId
 * Change a member's role. Only owner can change roles.
 */
export const changeMemberRole = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { role } = changeRoleSchema.parse(req.body);
    const orgId = req.params.id;
    const targetUserId = req.params.userId;

    const org = await Organization.findById(orgId);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    // Cannot change owner's role
    if (org.ownerId.toString() === targetUserId) {
      res.status(400).json({ error: "Cannot change owner's role" });
      return;
    }

    // Check target is actually a member
    const isMember = org.memberIds.some(
      (id) => id.toString() === targetUserId
    );
    if (!isMember) {
      res.status(404).json({ error: "User is not a member" });
      return;
    }

    // Update or create role entry
    const roleIndex = org.memberRoles.findIndex(
      (mr) => mr.userId.toString() === targetUserId
    );
    if (roleIndex >= 0) {
      org.memberRoles[roleIndex].role = role;
    } else {
      org.memberRoles.push({
        userId: new mongoose.Types.ObjectId(targetUserId),
        role,
      });
    }
    org.markModified("memberRoles");
    await org.save();

    res.json({ message: "Role updated", role });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/orgs/:id/role
 * Get the current user's role in the org.
 */
export const getMyRole = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const orgId = req.params.id;
    const userId = req.user!.userId;
    const role = await getUserOrgRole(orgId, userId);

    if (!role) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

    res.json({ role });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};
