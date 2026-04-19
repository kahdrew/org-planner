/**
 * VAL-CROSS-019: Deleting a manager must cascade to clear the managerId of
 * all direct reports so they are no longer orphaned with stale references.
 */
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

const TEST_PREFIX = `mgr_cascade_${Date.now()}`;

let agent: TestAgent;
let orgId: string;
let scenarioId: string;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  const testPassword = ["cascade", "tester", "pwd"].join("-") + Date.now();
  agent = await registerAgent(app, {
    email: `${TEST_PREFIX}@example.com`,
    password: testPassword,
    name: `${TEST_PREFIX} User`,
  });

  const orgRes = await agent
    .post("/api/orgs")
    .send({ name: `${TEST_PREFIX} Org` });
  orgId = orgRes.body._id;

  const scnRes = await agent
    .post(`/api/orgs/${orgId}/scenarios`)
    .send({ name: "Cascade Scenario" });
  scenarioId = scnRes.body._id;
});

afterAll(async () => {
  await Employee.deleteMany({ scenarioId });
  await Scenario.deleteMany({ orgId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

async function createEmployee(
  payload: Partial<Record<string, unknown>>,
): Promise<string> {
  const res = await agent
    .post(`/api/scenarios/${scenarioId}/employees`)
    .send({
      name: "Test",
      title: "Engineer",
      department: "Engineering",
      level: "IC3",
      location: "SF",
      employmentType: "FTE",
      status: "Active",
      ...payload,
    });
  expect(res.status).toBe(201);
  return res.body._id;
}

describe("Manager deletion cascade (VAL-CROSS-019)", () => {
  it("clears managerId on direct reports when the manager is deleted", async () => {
    const managerId = await createEmployee({ name: "Boss" });
    const report1Id = await createEmployee({ name: "Report 1", managerId });
    const report2Id = await createEmployee({ name: "Report 2", managerId });
    const report3Id = await createEmployee({ name: "Report 3", managerId });

    // Sanity: the reports do start with the correct manager
    const before = await Employee.find({
      _id: { $in: [report1Id, report2Id, report3Id] },
    });
    expect(
      before.every((e) => e.managerId?.toString() === managerId),
    ).toBe(true);

    const delRes = await agent
      .delete(`/api/employees/${managerId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.message).toBe("Employee deleted");
    // Response reports which reports were orphaned/cleared
    expect(Array.isArray(delRes.body.affectedReportIds)).toBe(true);
    expect(delRes.body.affectedReportIds.sort()).toEqual(
      [report1Id, report2Id, report3Id].sort(),
    );

    const after = await Employee.find({
      _id: { $in: [report1Id, report2Id, report3Id] },
    });
    expect(after.length).toBe(3);
    for (const e of after) {
      expect(e.managerId).toBeNull();
    }

    // Manager is gone
    const mgr = await Employee.findById(managerId);
    expect(mgr).toBeNull();
  });

  it("does not touch unrelated employees in the same scenario", async () => {
    const managerId = await createEmployee({ name: "Manager B" });
    const reportId = await createEmployee({ name: "Report B", managerId });
    const unrelatedId = await createEmployee({
      name: "Unrelated",
      department: "Sales",
    });

    const delRes = await agent
      .delete(`/api/employees/${managerId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.affectedReportIds).toEqual([reportId]);

    const unrelated = await Employee.findById(unrelatedId);
    expect(unrelated).not.toBeNull();
    expect(unrelated?.managerId ?? null).toBeNull();

    const report = await Employee.findById(reportId);
    expect(report?.managerId).toBeNull();
  });

  it("returns an empty affectedReportIds array when the employee has no reports", async () => {
    const leafId = await createEmployee({ name: "Leaf" });
    const delRes = await agent
      .delete(`/api/employees/${leafId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.affectedReportIds).toEqual([]);
  });
});
