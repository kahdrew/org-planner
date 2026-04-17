import { Router } from "express";
import auth from "../middleware/auth";
import {
  requireOrgMembership,
  requireOrgRole,
  requireScenarioAccess,
  requireScenarioRole,
} from "../middleware/authorization";
import {
  createApprovalChain,
  getApprovalChains,
  getApprovalChain,
  updateApprovalChain,
  deleteApprovalChain,
} from "../controllers/approvalChainController";
import {
  submitHeadcountRequest,
  getScenarioRequests,
  getOrgRequests,
  getPendingApprovalsForUser,
  getHeadcountRequest,
  approveHeadcountRequest,
  rejectHeadcountRequest,
  requestChangesOnHeadcountRequest,
  resubmitHeadcountRequest,
  bulkApprove,
  bulkReject,
} from "../controllers/headcountRequestController";

const router = Router();

router.use(auth);

// Approval chains (admin-configurable)
router.get(
  "/orgs/:orgId/approval-chains",
  requireOrgMembership,
  getApprovalChains,
);
router.get(
  "/orgs/:orgId/approval-chains/:chainId",
  requireOrgMembership,
  getApprovalChain,
);
router.post(
  "/orgs/:orgId/approval-chains",
  requireOrgMembership,
  requireOrgRole("owner", "admin"),
  createApprovalChain,
);
router.patch(
  "/orgs/:orgId/approval-chains/:chainId",
  requireOrgMembership,
  requireOrgRole("owner", "admin"),
  updateApprovalChain,
);
router.delete(
  "/orgs/:orgId/approval-chains/:chainId",
  requireOrgMembership,
  requireOrgRole("owner", "admin"),
  deleteApprovalChain,
);

// Headcount requests
// Submitting a request requires at least admin (or owner) on the scenario's org
// — viewers cannot submit. Org members who are NOT viewers may submit.
router.post(
  "/scenarios/:id/headcount-requests",
  requireScenarioRole("owner", "admin"),
  submitHeadcountRequest,
);
router.get(
  "/scenarios/:id/headcount-requests",
  requireScenarioAccess,
  getScenarioRequests,
);
router.get(
  "/orgs/:orgId/headcount-requests",
  requireOrgMembership,
  getOrgRequests,
);
router.get(
  "/orgs/:orgId/headcount-requests/pending",
  requireOrgMembership,
  getPendingApprovalsForUser,
);
router.get("/headcount-requests/:id", getHeadcountRequest);

// Actions on a request (authorization handled inside the controller since
// actions are approver-scoped, not role-scoped at the org level).
router.post("/headcount-requests/:id/approve", approveHeadcountRequest);
router.post("/headcount-requests/:id/reject", rejectHeadcountRequest);
router.post(
  "/headcount-requests/:id/request-changes",
  requestChangesOnHeadcountRequest,
);
router.post("/headcount-requests/:id/resubmit", resubmitHeadcountRequest);

// Bulk actions
router.post("/headcount-requests/bulk-approve", bulkApprove);
router.post("/headcount-requests/bulk-reject", bulkReject);

export default router;
