import { Router } from "express";
import auth from "../middleware/auth";
import { requireOrgMembership, requireOrgRole } from "../middleware/authorization";
import {
  sendInvite,
  listOrgInvitations,
  listMyInvitations,
  acceptInvitation,
  declineInvitation,
  listMembers,
  removeMember,
  changeMemberRole,
  getMyRole,
} from "../controllers/invitationController";

const router = Router();

router.use(auth);

// User-centric invitation routes
router.get("/invitations", listMyInvitations);
router.post("/invitations/:id/accept", acceptInvitation);
router.post("/invitations/:id/decline", declineInvitation);

// Org-scoped routes
router.post("/orgs/:id/invite", requireOrgMembership, requireOrgRole("owner"), sendInvite);
router.get("/orgs/:id/invitations", requireOrgMembership, listOrgInvitations);
router.get("/orgs/:id/members", requireOrgMembership, listMembers);
router.get("/orgs/:id/role", requireOrgMembership, getMyRole);
router.delete("/orgs/:id/members/:userId", requireOrgMembership, requireOrgRole("owner"), removeMember);
router.patch("/orgs/:id/members/:userId", requireOrgMembership, requireOrgRole("owner"), changeMemberRole);

export default router;
