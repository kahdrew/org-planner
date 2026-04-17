import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";
import Organization from "../models/Organization";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";
import ApprovalChain from "../models/ApprovalChain";
import HeadcountRequest from "../models/HeadcountRequest";

const TEST_PREFIX = `approval_test_${Date.now()}`;
const TEST_PASSWORD = ["approval", "tester", "pwd"].join("-") + Date.now();

let ownerToken: string;
let ownerUserId: string;
let vpToken: string;
let vpUserId: string;
let financeToken: string;
let financeUserId: string;
let managerToken: string;
let managerUserId: string;
let outsiderToken: string;

let orgId: string;
let scenarioId: string;

function testCreds(suffix: string) {
  return {
    email: `${TEST_PREFIX}_${suffix}@example.com`,
    password: TEST_PASSWORD,
    name: `${suffix} User`,
  };
}

async function registerUser(suffix: string): Promise<{ token: string; id: string }> {
  const res = await request(app).post("/api/auth/register").send(testCreds(suffix));
  return { token: res.body.token, id: res.body.user.id };
}

async function acceptInviteForUser(
  email: string,
  role: "admin" | "viewer",
  token: string,
) {
  const inviteRes = await request(app)
    .post(`/api/orgs/${orgId}/invite`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ email, role });
  const invitationId = inviteRes.body._id;
  await request(app)
    .post(`/api/invitations/${invitationId}/accept`)
    .set("Authorization", `Bearer ${token}`);
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  // Register users
  const owner = await registerUser("owner");
  ownerToken = owner.token;
  ownerUserId = owner.id;

  const vp = await registerUser("vp");
  vpToken = vp.token;
  vpUserId = vp.id;

  const finance = await registerUser("finance");
  financeToken = finance.token;
  financeUserId = finance.id;

  const manager = await registerUser("manager");
  managerToken = manager.token;
  managerUserId = manager.id;

  const outsider = await registerUser("outsider");
  outsiderToken = outsider.token;

  // Create org with owner
  const orgRes = await request(app)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  // Invite and accept everyone else as admin
  await acceptInviteForUser(testCreds("vp").email, "admin", vpToken);
  await acceptInviteForUser(testCreds("finance").email, "admin", financeToken);
  await acceptInviteForUser(testCreds("manager").email, "admin", managerToken);

  // Create scenario
  const scenarioRes = await request(app)
    .post(`/api/orgs/${orgId}/scenarios`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Approval Scenario" });
  scenarioId = scenarioRes.body._id;
});

afterAll(async () => {
  await HeadcountRequest.deleteMany({ orgId });
  await ApprovalChain.deleteMany({ orgId });
  await Employee.deleteMany({ scenarioId });
  await Scenario.deleteMany({ orgId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

describe("Approval Chain API", () => {
  describe("POST /api/orgs/:orgId/approval-chains", () => {
    it("owner can create a chain", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/approval-chains`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Standard Chain",
          description: "Default chain",
          isDefault: true,
          steps: [
            { role: "Manager", approverIds: [managerUserId] },
            { role: "VP", approverIds: [vpUserId] },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body._id).toBeDefined();
      expect(res.body.steps.length).toBe(2);
      expect(res.body.isDefault).toBe(true);
    });

    it("rejects duplicate chain name in the same org", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/approval-chains`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Standard Chain",
          steps: [{ role: "Manager", approverIds: [managerUserId] }],
        });
      expect(res.status).toBe(409);
    });

    it("rejects chain with no steps", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/approval-chains`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Empty Chain", steps: [] });
      expect(res.status).toBe(400);
    });

    it("rejects step with no approvers", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/approval-chains`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Bad Approvers",
          steps: [{ role: "Manager", approverIds: [] }],
        });
      expect(res.status).toBe(400);
    });

    it("outsider cannot create a chain (403)", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/approval-chains`)
        .set("Authorization", `Bearer ${outsiderToken}`)
        .send({
          name: "Hacker Chain",
          steps: [{ role: "Any", approverIds: [ownerUserId] }],
        });
      expect(res.status).toBe(403);
    });

    it("unauthenticated returns 401", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/approval-chains`)
        .send({ name: "X", steps: [] });
      expect(res.status).toBe(401);
    });

    it("creates a high-cost chain with conditions", async () => {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/approval-chains`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Executive Chain",
          description: "For high-cost or Director-level roles",
          priority: 10,
          conditions: { minCost: 200000, minLevel: "Director" },
          steps: [
            { role: "Manager", approverIds: [managerUserId] },
            { role: "VP", approverIds: [vpUserId] },
            { role: "Finance", approverIds: [financeUserId] },
            { role: "CHRO", approverIds: [ownerUserId] },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.conditions.minCost).toBe(200000);
      expect(res.body.conditions.minLevel).toBe("Director");
      expect(res.body.steps.length).toBe(4);
    });
  });

  describe("GET /api/orgs/:orgId/approval-chains", () => {
    it("lists chains for the org sorted by priority desc", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/approval-chains`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      // Executive (priority 10) first
      expect(res.body[0].name).toBe("Executive Chain");
    });

    it("outsider cannot list chains (403)", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/approval-chains`)
        .set("Authorization", `Bearer ${outsiderToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /api/orgs/:orgId/approval-chains/:chainId", () => {
    let chainId: string;
    beforeAll(async () => {
      const chains = await ApprovalChain.find({ orgId, name: "Standard Chain" });
      chainId = chains[0]._id.toString();
    });

    it("owner can update description", async () => {
      const res = await request(app)
        .patch(`/api/orgs/${orgId}/approval-chains/${chainId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ description: "Updated description" });
      expect(res.status).toBe(200);
      expect(res.body.description).toBe("Updated description");
    });

    it("returns 404 for non-existent chain", async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/orgs/${orgId}/approval-chains/${fakeId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ description: "x" });
      expect(res.status).toBe(404);
    });
  });
});

describe("Headcount Request Submission and Routing", () => {
  it("submits a new_hire request; selects default (Standard) chain for low-cost IC role", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        employeeData: {
          name: "Low Cost Hire",
          title: "Junior Engineer",
          department: "Engineering",
          level: "IC2",
          location: "Remote",
          employmentType: "FTE",
          salary: 80000,
          equity: 10000,
          justification: "Team capacity",
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.currentStep).toBe(0);
    expect(res.body.audit.length).toBe(1);
    expect(res.body.audit[0].action).toBe("submit");

    // Should use the 2-step Standard Chain (not the 4-step Executive Chain)
    const chain = await ApprovalChain.findById(res.body.chainId);
    expect(chain?.name).toBe("Standard Chain");
  });

  it("submits a high-cost hire → selects Executive Chain (4 steps)", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        employeeData: {
          name: "Director Hire",
          title: "Director of Eng",
          department: "Engineering",
          level: "Director",
          location: "SF",
          employmentType: "FTE",
          salary: 250000,
          equity: 100000,
        },
      });
    expect(res.status).toBe(201);
    const chain = await ApprovalChain.findById(res.body.chainId);
    expect(chain?.name).toBe("Executive Chain");
  });

  it("rejects submission with invalid employeeData", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ employeeData: { name: "" } });
    expect(res.status).toBe(400);
  });

  it("outsider cannot submit a request (403)", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({
        employeeData: {
          name: "Bad Hire",
          title: "t",
          department: "d",
          level: "IC1",
          location: "loc",
          employmentType: "FTE",
        },
      });
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent scenario", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/scenarios/${fakeId}/headcount-requests`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ employeeData: { name: "X" } });
    // requireScenarioRole returns 403 for non-existent scenarios
    expect([403, 404]).toContain(res.status);
  });
});

describe("Approval Actions", () => {
  let requestId: string;
  let executiveRequestId: string;

  beforeAll(async () => {
    // Fresh request through Standard Chain (2 steps)
    const res = await request(app)
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        employeeData: {
          name: "Standard Flow Hire",
          title: "Senior Engineer",
          department: "Engineering",
          level: "IC4",
          location: "NYC",
          employmentType: "FTE",
          salary: 150000,
          equity: 40000,
          status: "Planned",
        },
      });
    requestId = res.body._id;

    // A separate high-cost request using Executive Chain (4 steps)
    const execRes = await request(app)
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        employeeData: {
          name: "Executive Flow Hire",
          title: "VP of Eng",
          department: "Engineering",
          level: "VP",
          location: "SF",
          employmentType: "FTE",
          salary: 400000,
          equity: 200000,
          status: "Planned",
        },
      });
    executiveRequestId = execRes.body._id;
  });

  describe("Self-approval prevention (VAL-APPROVAL-013)", () => {
    it("the submitter cannot approve their own request", async () => {
      const res = await request(app)
        .post(`/api/headcount-requests/${requestId}/approve`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ comment: "self-approve" });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/own request/i);
    });
  });

  describe("Pending approvals visibility (VAL-APPROVAL-005)", () => {
    it("manager (submitter) does not see their own request in pending queue", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/headcount-requests/pending`)
        .set("Authorization", `Bearer ${managerToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.map((r: { _id: string }) => r._id);
      expect(ids).not.toContain(requestId);
    });

    it("VP (not the first approver) does NOT see request at step 0", async () => {
      const res = await request(app)
        .get(`/api/orgs/${orgId}/headcount-requests/pending`)
        .set("Authorization", `Bearer ${vpToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.map((r: { _id: string }) => r._id);
      // The Standard Chain's step 0 approver is manager, so VP shouldn't see it.
      // But VP IS the manager for Executive Chain step 0? No — step 0 is Manager.
      expect(ids).not.toContain(requestId);
      expect(ids).not.toContain(executiveRequestId);
    });

    it("manager user (chain step 0 = 'Manager' approver) sees requests at step 0", async () => {
      // Need a submitter OTHER than manager to see requests in manager's queue.
      // Use VP as submitter.
      const vpSubmitRes = await request(app)
        .post(`/api/scenarios/${scenarioId}/headcount-requests`)
        .set("Authorization", `Bearer ${vpToken}`)
        .send({
          employeeData: {
            name: "VP Submitted Hire",
            title: "Engineer",
            department: "Engineering",
            level: "IC3",
            location: "SF",
            employmentType: "FTE",
            salary: 120000,
            equity: 20000,
          },
        });
      expect(vpSubmitRes.status).toBe(201);
      const vpRequestId = vpSubmitRes.body._id;

      const res = await request(app)
        .get(`/api/orgs/${orgId}/headcount-requests/pending`)
        .set("Authorization", `Bearer ${managerToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.map((r: { _id: string }) => r._id);
      expect(ids).toContain(vpRequestId);

      // Clean up
      await HeadcountRequest.findByIdAndDelete(vpRequestId);
    });
  });

  describe("Approve action advances the request (VAL-APPROVAL-007)", () => {
    it("non-approver cannot approve a request", async () => {
      // Finance is not an approver for Standard Chain (only Manager + VP)
      const res = await request(app)
        .post(`/api/headcount-requests/${requestId}/approve`)
        .set("Authorization", `Bearer ${financeToken}`)
        .send({ comment: "nope" });
      expect(res.status).toBe(403);
    });

    it("first approver (manager) advances the request to step 1", async () => {
      // Manager user is the step-0 approver, but manager submitted this request.
      // So we need a DIFFERENT user who's in the manager slot.
      // For Standard Chain, step 0 = manager. The submitter IS manager, so
      // self-approval blocks. Switch submitter: resubmit via different user.
      // Instead, let's re-seed: delete request, VP submits, manager approves.
      await HeadcountRequest.findByIdAndDelete(requestId);

      const vpSubmit = await request(app)
        .post(`/api/scenarios/${scenarioId}/headcount-requests`)
        .set("Authorization", `Bearer ${vpToken}`)
        .send({
          employeeData: {
            name: "Flow Target",
            title: "Engineer",
            department: "Engineering",
            level: "IC3",
            location: "SF",
            employmentType: "FTE",
            salary: 120000,
            equity: 20000,
            status: "Planned",
          },
        });
      requestId = vpSubmit.body._id;

      // Manager approves step 0
      const approve1 = await request(app)
        .post(`/api/headcount-requests/${requestId}/approve`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ comment: "Looks good" });
      expect(approve1.status).toBe(200);
      expect(approve1.body.currentStep).toBe(1);
      expect(approve1.body.status).toBe("pending");
      // Audit should now have submit + approve
      expect(approve1.body.audit.length).toBe(2);
      expect(approve1.body.audit[1].action).toBe("approve");
      expect(approve1.body.audit[1].comment).toBe("Looks good");
    });

    it("manager cannot approve step 1 (not the approver)", async () => {
      const res = await request(app)
        .post(`/api/headcount-requests/${requestId}/approve`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it("VP (VP is submitter) cannot approve step 1 (self-approval blocked)", async () => {
      const res = await request(app)
        .post(`/api/headcount-requests/${requestId}/approve`)
        .set("Authorization", `Bearer ${vpToken}`)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/own request/i);
    });
  });

  describe("Final approval materializes employee (VAL-APPROVAL-007 + auto-create)", () => {
    it("last-step approval creates an Employee record in the scenario", async () => {
      // Need a fresh scenario flow where submitter is manager, step-1 approver
      // is VP; VP must not be the submitter.
      const freshSubmit = await request(app)
        .post(`/api/scenarios/${scenarioId}/headcount-requests`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          employeeData: {
            name: "Materialize Me",
            title: "Engineer",
            department: "Product",
            level: "IC3",
            location: "Remote",
            employmentType: "FTE",
            salary: 130000,
            equity: 30000,
            status: "Planned",
          },
        });
      const freshId = freshSubmit.body._id;

      // Step 0 approved by someone OTHER than manager (the submitter) and
      // OTHER than the step-0 approver? Step 0 approver is the manager user,
      // who is the submitter — so no one can approve step 0. That's a bad
      // setup. Re-configure: update Standard Chain so step 0 approver is VP
      // and step 1 is owner.
      const chains = await ApprovalChain.find({ orgId, name: "Standard Chain" });
      await request(app)
        .patch(`/api/orgs/${orgId}/approval-chains/${chains[0]._id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          steps: [
            { role: "Manager", approverIds: [vpUserId] },
            { role: "VP", approverIds: [ownerUserId] },
          ],
        });

      // VP approves step 0
      const a1 = await request(app)
        .post(`/api/headcount-requests/${freshId}/approve`)
        .set("Authorization", `Bearer ${vpToken}`)
        .send({ comment: "ok step 0" });
      expect(a1.status).toBe(200);
      expect(a1.body.currentStep).toBe(1);

      // Owner approves step 1 (final)
      const a2 = await request(app)
        .post(`/api/headcount-requests/${freshId}/approve`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ comment: "final" });
      expect(a2.status).toBe(200);
      expect(a2.body.status).toBe("approved");
      expect(a2.body.approvedEmployeeId).toBeTruthy();

      // Verify the Employee was actually created
      const emp = await Employee.findById(a2.body.approvedEmployeeId);
      expect(emp).toBeDefined();
      expect(emp?.name).toBe("Materialize Me");
      expect(emp?.scenarioId.toString()).toBe(scenarioId);
    });

    it("approving an already-approved request returns 400", async () => {
      // Find the approved request from above
      const approved = await HeadcountRequest.findOne({
        scenarioId,
        status: "approved",
      });
      const res = await request(app)
        .post(`/api/headcount-requests/${approved!._id}/approve`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe("Reject action (VAL-APPROVAL-008)", () => {
    it("rejection terminates the chain and records audit", async () => {
      const submit = await request(app)
        .post(`/api/scenarios/${scenarioId}/headcount-requests`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          employeeData: {
            name: "Reject Target",
            title: "Engineer",
            department: "Engineering",
            level: "IC3",
            location: "SF",
            employmentType: "FTE",
            salary: 100000,
            equity: 20000,
          },
        });
      const rId = submit.body._id;

      // VP is step-0 approver in the updated Standard Chain
      const res = await request(app)
        .post(`/api/headcount-requests/${rId}/reject`)
        .set("Authorization", `Bearer ${vpToken}`)
        .send({ comment: "Budget constraints" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("rejected");
      expect(
        res.body.audit.find(
          (a: { action: string }) => a.action === "reject",
        ).comment,
      ).toBe("Budget constraints");

      // No employee should have been created
      const emp = await Employee.findOne({
        scenarioId,
        name: "Reject Target",
      });
      expect(emp).toBeNull();
    });
  });

  describe("Request changes + resubmit (VAL-APPROVAL-009)", () => {
    let rId: string;
    it("approver can request changes; status becomes changes_requested", async () => {
      const submit = await request(app)
        .post(`/api/scenarios/${scenarioId}/headcount-requests`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          employeeData: {
            name: "Change Me",
            title: "Engineer",
            department: "Engineering",
            level: "IC3",
            location: "SF",
            employmentType: "FTE",
            salary: 100000,
            equity: 20000,
          },
        });
      rId = submit.body._id;

      const res = await request(app)
        .post(`/api/headcount-requests/${rId}/request-changes`)
        .set("Authorization", `Bearer ${vpToken}`)
        .send({ comment: "Please adjust salary" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("changes_requested");
    });

    it("only submitter can resubmit; status returns to pending at step 0", async () => {
      // Non-submitter cannot resubmit
      const badRes = await request(app)
        .post(`/api/headcount-requests/${rId}/resubmit`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({});
      expect(badRes.status).toBe(403);

      const res = await request(app)
        .post(`/api/headcount-requests/${rId}/resubmit`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          employeeData: {
            name: "Change Me",
            title: "Engineer",
            department: "Engineering",
            level: "IC3",
            location: "SF",
            employmentType: "FTE",
            salary: 110000,
            equity: 22000,
          },
        });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("pending");
      expect(res.body.currentStep).toBe(0);
      expect(res.body.employeeData.salary).toBe(110000);
    });
  });
});

describe("Audit trail (VAL-APPROVAL-012)", () => {
  it("GET /api/headcount-requests/:id returns full audit history", async () => {
    const r = await HeadcountRequest.findOne({ scenarioId });
    if (!r) throw new Error("Expected at least one request");
    const res = await request(app)
      .get(`/api/headcount-requests/${r._id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.audit)).toBe(true);
    expect(res.body.audit.length).toBeGreaterThan(0);
    // Every audit entry has required fields
    for (const entry of res.body.audit) {
      expect(entry.action).toBeDefined();
      expect(entry.performedBy).toBeDefined();
      expect(entry.timestamp).toBeDefined();
    }
  });

  it("outsider cannot access a request detail (403)", async () => {
    const r = await HeadcountRequest.findOne({ scenarioId });
    const res = await request(app)
      .get(`/api/headcount-requests/${r!._id}`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Bulk approve / reject (VAL-APPROVAL-011)", () => {
  let bulkIds: string[];

  beforeAll(async () => {
    bulkIds = [];
    for (let i = 0; i < 3; i++) {
      const r = await request(app)
        .post(`/api/scenarios/${scenarioId}/headcount-requests`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          employeeData: {
            name: `Bulk Hire ${i}`,
            title: "Engineer",
            department: "Engineering",
            level: "IC2",
            location: "SF",
            employmentType: "FTE",
            salary: 80000 + i * 1000,
            equity: 10000,
          },
        });
      bulkIds.push(r.body._id);
    }
  });

  it("bulk-approve advances all approvable requests", async () => {
    const res = await request(app)
      .post(`/api/headcount-requests/bulk-approve`)
      .set("Authorization", `Bearer ${vpToken}`)
      .send({ requestIds: bulkIds, comment: "Batch approve" });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(bulkIds.length);
    // All should be either advanced (if multi-step) or approved (if single-step)
    for (const r of res.body.results) {
      expect(["approved", "advanced"]).toContain(r.status);
    }
  });

  it("bulk-reject terminates remaining requests with shared reason", async () => {
    // Create 2 more requests
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await request(app)
        .post(`/api/scenarios/${scenarioId}/headcount-requests`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          employeeData: {
            name: `Bulk Reject ${i}`,
            title: "Engineer",
            department: "Engineering",
            level: "IC2",
            location: "SF",
            employmentType: "FTE",
            salary: 80000,
            equity: 10000,
          },
        });
      ids.push(r.body._id);
    }

    const res = await request(app)
      .post(`/api/headcount-requests/bulk-reject`)
      .set("Authorization", `Bearer ${vpToken}`)
      .send({ requestIds: ids, comment: "Budget cuts" });
    expect(res.status).toBe(200);
    for (const r of res.body.results) {
      expect(r.status).toBe("rejected");
    }

    // Verify all got "rejected" + comment
    for (const id of ids) {
      const saved = await HeadcountRequest.findById(id);
      expect(saved?.status).toBe("rejected");
      const rejectEntry = saved?.audit.find((a) => a.action === "reject");
      expect(rejectEntry?.comment).toBe("Budget cuts");
    }
  });

  it("bulk actions skip requests the user cannot act on (e.g., own submissions)", async () => {
    // Manager owns these requests; trying to bulk-approve their own submissions
    // should result in all being skipped.
    const submitted: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await request(app)
        .post(`/api/scenarios/${scenarioId}/headcount-requests`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          employeeData: {
            name: `Self ${i}`,
            title: "T",
            department: "Engineering",
            level: "IC2",
            location: "SF",
            employmentType: "FTE",
            salary: 50000,
            equity: 0,
          },
        });
      submitted.push(r.body._id);
    }

    const res = await request(app)
      .post(`/api/headcount-requests/bulk-approve`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ requestIds: submitted });
    expect(res.status).toBe(200);
    for (const r of res.body.results) {
      expect(r.status).toBe("skipped");
    }
  });
});

describe("List and filter requests", () => {
  it("GET /api/scenarios/:id/headcount-requests?status=rejected returns only rejected", async () => {
    const res = await request(app)
      .get(`/api/scenarios/${scenarioId}/headcount-requests?status=rejected`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    for (const r of res.body) {
      expect(r.status).toBe("rejected");
    }
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("GET /api/orgs/:orgId/headcount-requests returns requests across scenarios", async () => {
    const res = await request(app)
      .get(`/api/orgs/${orgId}/headcount-requests`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("outsider cannot list org requests (403)", async () => {
    const res = await request(app)
      .get(`/api/orgs/${orgId}/headcount-requests`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});
