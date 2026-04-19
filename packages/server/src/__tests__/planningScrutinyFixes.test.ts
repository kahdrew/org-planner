import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { registerAgent, type TestAgent } from "./helpers/authAgent";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";
import Organization from "../models/Organization";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";
import BudgetEnvelope from "../models/BudgetEnvelope";
import ApprovalChain from "../models/ApprovalChain";
import HeadcountRequest from "../models/HeadcountRequest";

const TEST_PREFIX = `planning_scrutiny_${Date.now()}`;
const TEST_PASSWORD = ["scrutiny", "tester", "pwd"].join("-") + Date.now();

let ownerAgent: TestAgent;
let ownerUserId: string;
let approverAgent: TestAgent;
let approverUserId: string;
let submitterAgent: TestAgent;
let outsiderAgent: TestAgent;
let outsiderUserId: string;

let orgId: string;
let scenarioId: string;

function creds(suffix: string) {
  return {
    email: `${TEST_PREFIX}_${suffix}@example.com`,
    password: TEST_PASSWORD,
    name: `${suffix} User`,
  };
}

async function registerUser(
  suffix: string,
): Promise<{ agent: TestAgent; id: string }> {
  const agent = await registerAgent(app, creds(suffix));
  const me = await agent.get("/api/auth/me");
  return { agent, id: me.body.user.id };
}

async function acceptInvite(
  email: string,
  role: "admin" | "viewer",
  inviteeAgent: TestAgent,
) {
  const inviteRes = await ownerAgent
    .post(`/api/orgs/${orgId}/invite`)
    .send({ email, role });
  const invitationId = inviteRes.body._id;
  await inviteeAgent.post(`/api/invitations/${invitationId}/accept`);
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  const owner = await registerUser("owner");
  ownerAgent = owner.agent;
  ownerUserId = owner.id;

  const approver = await registerUser("approver");
  approverAgent = approver.agent;
  approverUserId = approver.id;

  const submitter = await registerUser("submitter");
  submitterAgent = submitter.agent;

  const outsider = await registerUser("outsider");
  outsiderAgent = outsider.agent;
  outsiderUserId = outsider.id;

  // Org with owner; invite approver and submitter as admins (so they can
  // submit and be designated approvers).
  const orgRes = await ownerAgent
    .post("/api/orgs")
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  await acceptInvite(creds("approver").email, "admin", approverAgent);
  await acceptInvite(creds("submitter").email, "admin", submitterAgent);

  // Scenario
  const scnRes = await ownerAgent
    .post(`/api/orgs/${orgId}/scenarios`)
    .send({ name: "Scrutiny Scenario" });
  scenarioId = scnRes.body._id;
});

afterAll(async () => {
  await HeadcountRequest.deleteMany({ orgId });
  await ApprovalChain.deleteMany({ orgId });
  await BudgetEnvelope.deleteMany({ scenarioId });
  await Employee.deleteMany({ scenarioId });
  await Scenario.deleteMany({ orgId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

/* ------------------------------------------------------------------ */
/*  Fix 1: Budget server normalizes department keys                    */
/* ------------------------------------------------------------------ */

describe("Budget summary — department key normalization (Fix 1)", () => {
  it("groups envelope with trailing whitespace together with untrimmed employee departments", async () => {
    // Seed employees with mixed whitespace on the department field
    await Employee.create({
      scenarioId,
      name: "Normal Eng",
      title: "Engineer",
      department: "NormTest",
      level: "IC3",
      location: "SF",
      employmentType: "FTE",
      status: "Active",
      salary: 100_000,
      equity: 20_000,
    });
    await Employee.create({
      scenarioId,
      name: "Padded Eng",
      title: "Engineer",
      department: " NormTest ", // whitespace padded
      level: "IC3",
      location: "SF",
      employmentType: "FTE",
      status: "Active",
      salary: 50_000,
      equity: 0,
    });

    // Envelope trim is enforced by Mongoose schema on save, but verify that
    // summary is resilient even when the departments differ by whitespace.
    const env = await BudgetEnvelope.create({
      orgId,
      scenarioId,
      department: "NormTest",
      totalBudget: 300_000,
      headcountCap: 3,
      createdBy: ownerUserId,
    });

    const res = await ownerAgent
      .get(`/api/scenarios/${scenarioId}/budgets/summary`);
    expect(res.status).toBe(200);

    const normRows = res.body.departments.filter(
      (d: { department: string }) => d.department.trim() === "NormTest",
    );
    expect(normRows.length).toBe(1);
    expect(normRows[0].actualHeadcount).toBe(2);
    expect(normRows[0].actualSpend).toBe(170_000);
    expect(normRows[0].totalBudget).toBe(300_000);

    // Cleanup seeded rows
    await Employee.deleteMany({ scenarioId, department: { $regex: /NormTest/ } });
    await BudgetEnvelope.findByIdAndDelete(env._id);
  });

  it("trims department input on create so stored values are canonical", async () => {
    const res = await ownerAgent
      .post(`/api/scenarios/${scenarioId}/budgets`)
      .send({
        department: "  TrimDept  ",
        totalBudget: 10_000,
        headcountCap: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.department).toBe("TrimDept");

    const stored = await BudgetEnvelope.findById(res.body._id);
    expect(stored?.department).toBe("TrimDept");

    await BudgetEnvelope.findByIdAndDelete(res.body._id);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix 5: Scenario delete cascades to BudgetEnvelope                  */
/* ------------------------------------------------------------------ */

describe("deleteScenario — BudgetEnvelope cascade cleanup (Fix 5)", () => {
  it("deletes budget envelopes when their scenario is deleted", async () => {
    // Create a fresh scenario
    const scnRes = await ownerAgent
      .post(`/api/orgs/${orgId}/scenarios`)
      .send({ name: "ToBeDeleted" });
    const localScenarioId = scnRes.body._id;

    // Attach an envelope to it
    const envRes = await ownerAgent
      .post(`/api/scenarios/${localScenarioId}/budgets`)
      .send({
        department: "CleanupDept",
        totalBudget: 10_000,
        headcountCap: 1,
      });
    expect(envRes.status).toBe(201);
    const envelopeId = envRes.body._id;

    // Delete the scenario
    const delRes = await ownerAgent
      .delete(`/api/scenarios/${localScenarioId}`);
    expect(delRes.status).toBe(200);

    // Envelope must be gone
    const stillThere = await BudgetEnvelope.findById(envelopeId);
    expect(stillThere).toBeNull();

    // And no stray envelopes remain tied to the deleted scenario
    const remaining = await BudgetEnvelope.find({ scenarioId: localScenarioId });
    expect(remaining.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix 4: Approval actions verify org membership                      */
/*        Approver IDs validated against org membership                */
/* ------------------------------------------------------------------ */

describe("Approval chain — approver membership validation (Fix 4)", () => {
  it("rejects chain creation when an approverId is not a member of the org", async () => {
    const res = await ownerAgent
      .post(`/api/orgs/${orgId}/approval-chains`)
      .send({
        name: `BadApprovers ${Date.now()}`,
        steps: [
          {
            role: "Manager",
            // outsiderUserId is a valid ObjectId but NOT a member of the org
            approverIds: [outsiderUserId],
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/not a member of this organization/);
  });

  it("allows chain creation when all approvers are org members/owner", async () => {
    const res = await ownerAgent
      .post(`/api/orgs/${orgId}/approval-chains`)
      .send({
        name: `GoodChain ${Date.now()}`,
        steps: [
          { role: "Manager", approverIds: [approverUserId] },
          { role: "Owner", approverIds: [ownerUserId] },
        ],
      });
    expect(res.status).toBe(201);
    await ApprovalChain.findByIdAndDelete(res.body._id);
  });

  it("rejects chain update that introduces a non-member approver", async () => {
    // Create a valid chain first
    const createRes = await ownerAgent
      .post(`/api/orgs/${orgId}/approval-chains`)
      .send({
        name: `UpdateTest ${Date.now()}`,
        steps: [{ role: "Manager", approverIds: [approverUserId] }],
      });
    expect(createRes.status).toBe(201);
    const chainId = createRes.body._id;

    // Try to replace with an outsider as approver
    const patchRes = await ownerAgent
      .patch(`/api/orgs/${orgId}/approval-chains/${chainId}`)
      .send({
        steps: [{ role: "Manager", approverIds: [outsiderUserId] }],
      });
    expect(patchRes.status).toBe(400);
    expect(String(patchRes.body.error)).toMatch(
      /not a member of this organization/,
    );

    await ApprovalChain.findByIdAndDelete(chainId);
  });
});

describe("Approval actions — org membership check (Fix 4)", () => {
  let requestId: string;
  let chainId: string;

  beforeAll(async () => {
    // Create a chain where the outsider is NOT an approver
    const chainRes = await ownerAgent
      .post(`/api/orgs/${orgId}/approval-chains`)
      .send({
        name: `MembershipCheck ${Date.now()}`,
        isDefault: true,
        steps: [{ role: "Manager", approverIds: [approverUserId] }],
      });
    expect(chainRes.status).toBe(201);
    chainId = chainRes.body._id;

    // Submitter submits a request; approver will be the designated approver
    const subRes = await submitterAgent
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .send({
        employeeData: {
          name: "Membership Test Hire",
          title: "Engineer",
          department: "Engineering",
          level: "IC3",
          location: "SF",
          employmentType: "FTE",
          salary: 100_000,
          equity: 10_000,
        },
        chainId,
      });
    expect(subRes.status).toBe(201);
    requestId = subRes.body._id;
  });

  it("outsider (non-member) cannot approve a request — returns 403", async () => {
    const res = await outsiderAgent
      .post(`/api/headcount-requests/${requestId}/approve`)
      .send({ comment: "nope" });
    expect(res.status).toBe(403);
  });

  it("outsider (non-member) cannot reject a request — returns 403", async () => {
    const res = await outsiderAgent
      .post(`/api/headcount-requests/${requestId}/reject`)
      .send({ comment: "nope" });
    expect(res.status).toBe(403);
  });

  it("outsider (non-member) cannot request-changes on a request — returns 403", async () => {
    const res = await outsiderAgent
      .post(`/api/headcount-requests/${requestId}/request-changes`)
      .send({ comment: "changes" });
    expect(res.status).toBe(403);
  });

  it("org member who IS an approver can still act (sanity check)", async () => {
    const res = await approverAgent
      .post(`/api/headcount-requests/${requestId}/approve`)
      .send({ comment: "ok" });
    // This is a single-step chain so approval will finalize the request.
    expect(res.status).toBe(200);
    expect(["approved", "pending"]).toContain(res.body.status);
  });
});
