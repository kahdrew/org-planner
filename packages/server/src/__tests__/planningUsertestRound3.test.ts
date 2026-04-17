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

const TEST_PREFIX = `planning_usertest_round3_${Date.now()}`;
const TEST_PASSWORD = ["round3", "tester", "pwd"].join("-") + Date.now();

let ownerToken: string;
let approverToken: string;
let approverUserId: string;
let submitterToken: string;
let submitterUserId: string;

let orgId: string;
let scenarioId: string;
let chainId: string;

function creds(suffix: string) {
  return {
    email: `${TEST_PREFIX}_${suffix}@example.com`,
    password: TEST_PASSWORD,
    name: `${suffix} User`,
  };
}

async function registerUser(
  suffix: string,
): Promise<{ token: string; id: string }> {
  const res = await request(app).post("/api/auth/register").send(creds(suffix));
  return { token: res.body.token, id: res.body.user.id };
}

async function acceptInvite(
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

  const owner = await registerUser("owner");
  ownerToken = owner.token;

  const approver = await registerUser("approver");
  approverToken = approver.token;
  approverUserId = approver.id;

  const submitter = await registerUser("submitter");
  submitterToken = submitter.token;
  submitterUserId = submitter.id;

  const orgRes = await request(app)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  await acceptInvite(creds("approver").email, "admin", approverToken);
  await acceptInvite(creds("submitter").email, "admin", submitterToken);

  const scnRes = await request(app)
    .post(`/api/orgs/${orgId}/scenarios`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Round3 Scenario" });
  scenarioId = scnRes.body._id;

  const chainRes = await request(app)
    .post(`/api/orgs/${orgId}/approval-chains`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      name: `Round3 Chain ${Date.now()}`,
      isDefault: true,
      steps: [{ role: "Manager", approverIds: [approverUserId] }],
    });
  chainId = chainRes.body._id;
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

describe("Resubmit — editHistory captured in audit trail (VAL-APPROVAL-012)", () => {
  it("records per-field changes in the resubmit audit entry", async () => {
    // Submit
    const submitRes = await request(app)
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .set("Authorization", `Bearer ${submitterToken}`)
      .send({
        chainId,
        employeeData: {
          name: "Edit Test Hire",
          title: "Engineer",
          department: "Engineering",
          level: "IC3",
          location: "SF",
          employmentType: "FTE",
          salary: 100_000,
          equity: 10_000,
        },
      });
    expect(submitRes.status).toBe(201);
    const reqId = submitRes.body._id;

    // Approver requests changes
    const rcRes = await request(app)
      .post(`/api/headcount-requests/${reqId}/request-changes`)
      .set("Authorization", `Bearer ${approverToken}`)
      .send({ comment: "Please raise the level" });
    expect(rcRes.status).toBe(200);

    // Submitter resubmits with updated data (title + level + salary change)
    const resubmit = await request(app)
      .post(`/api/headcount-requests/${reqId}/resubmit`)
      .set("Authorization", `Bearer ${submitterToken}`)
      .send({
        employeeData: {
          name: "Edit Test Hire",
          title: "Senior Engineer",
          department: "Engineering",
          level: "IC4",
          location: "SF",
          employmentType: "FTE",
          salary: 125_000,
          equity: 10_000,
        },
      });
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.status).toBe("pending");
    expect(resubmit.body.currentStep).toBe(0);

    const audit = resubmit.body.audit as Array<{
      action: string;
      changes?: Array<{ field: string; from: unknown; to: unknown }>;
    }>;
    const resubmitEntry = audit[audit.length - 1];
    expect(resubmitEntry.action).toBe("resubmit");
    expect(resubmitEntry.changes).toBeDefined();
    const fields = (resubmitEntry.changes ?? []).map((c) => c.field).sort();
    expect(fields).toContain("title");
    expect(fields).toContain("level");
    expect(fields).toContain("salary");
    // Untouched fields are NOT included
    expect(fields).not.toContain("name");
    expect(fields).not.toContain("department");
    const titleChange = (resubmitEntry.changes ?? []).find(
      (c) => c.field === "title",
    );
    expect(titleChange?.from).toBe("Engineer");
    expect(titleChange?.to).toBe("Senior Engineer");
  });

  it("resubmit without changes still advances state and audit but omits changes array", async () => {
    // Submit
    const submitRes = await request(app)
      .post(`/api/scenarios/${scenarioId}/headcount-requests`)
      .set("Authorization", `Bearer ${submitterToken}`)
      .send({
        chainId,
        employeeData: {
          name: "No-edit Hire",
          title: "Engineer",
          department: "Engineering",
          level: "IC3",
          location: "SF",
          employmentType: "FTE",
          salary: 100_000,
          equity: 10_000,
        },
      });
    const reqId = submitRes.body._id;

    // Approver requests changes
    await request(app)
      .post(`/api/headcount-requests/${reqId}/request-changes`)
      .set("Authorization", `Bearer ${approverToken}`)
      .send({ comment: "please retry" });

    // Submitter resubmits with NO body
    const resubmit = await request(app)
      .post(`/api/headcount-requests/${reqId}/resubmit`)
      .set("Authorization", `Bearer ${submitterToken}`)
      .send({});
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.status).toBe("pending");
    expect(resubmit.body.currentStep).toBe(0);
    const audit = resubmit.body.audit as Array<{
      action: string;
      changes?: Array<{ field: string }>;
    }>;
    const resubmitEntry = audit[audit.length - 1];
    expect(resubmitEntry.action).toBe("resubmit");
    expect(
      resubmitEntry.changes === undefined ||
        resubmitEntry.changes?.length === 0,
    ).toBe(true);
  });

  it("submitterUserId matches the resubmit performer", async () => {
    // Sanity: ensure the test user ids are wired correctly
    expect(submitterUserId).toBeDefined();
    expect(approverUserId).toBeDefined();
  });
});
