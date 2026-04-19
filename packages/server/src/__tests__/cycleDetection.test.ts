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

const TEST_PREFIX = `cycle_test_${Date.now()}`;

const userEmail = `${TEST_PREFIX}@example.com`;
const userPassword = "TestPass123!";
const userName = "CycleTestUser";

let agent: TestAgent;
let orgId: string;
let scenarioId: string;

// Hierarchy: CEO -> VP -> Manager -> Engineer
let ceoId: string;
let vpId: string;
let managerId: string;
let engineerId: string;

const employeeBase = {
  title: "Test",
  department: "Engineering",
  level: "IC3",
  location: "SF",
  employmentType: "FTE" as const,
  status: "Active" as const,
};

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  // Register user
  agent = await registerAgent(app, { email: userEmail, password: userPassword, name: userName });

  // Create org
  const orgRes = await agent
    .post("/api/orgs")
    .send({ name: `${TEST_PREFIX}_org` });
  orgId = orgRes.body._id;

  // Create scenario
  const scenRes = await agent
    .post(`/api/orgs/${orgId}/scenarios`)
    .send({ name: `${TEST_PREFIX}_scenario`, description: "test" });
  scenarioId = scenRes.body._id;

  // Create hierarchy: CEO -> VP -> Manager -> Engineer
  const ceo = await agent
    .post(`/api/scenarios/${scenarioId}/employees`)
    .send({ ...employeeBase, name: "CEO", title: "CEO", managerId: null });
  ceoId = ceo.body._id;

  const vp = await agent
    .post(`/api/scenarios/${scenarioId}/employees`)
    .send({ ...employeeBase, name: "VP", title: "VP", managerId: ceoId });
  vpId = vp.body._id;

  const mgr = await agent
    .post(`/api/scenarios/${scenarioId}/employees`)
    .send({ ...employeeBase, name: "Manager", title: "Manager", managerId: vpId });
  managerId = mgr.body._id;

  const eng = await agent
    .post(`/api/scenarios/${scenarioId}/employees`)
    .send({ ...employeeBase, name: "Engineer", title: "Engineer", managerId: managerId });
  engineerId = eng.body._id;
});

afterAll(async () => {
  // Clean up test data
  await Employee.deleteMany({ scenarioId });
  await Scenario.deleteMany({ _id: scenarioId });
  await Organization.deleteMany({ _id: orgId });
  await User.deleteMany({ email: userEmail });
  await mongoose.disconnect();
});

describe("Cycle detection in PATCH /employees/:id/move", () => {
  it("rejects moving an employee to itself as manager (self-referential)", async () => {
    const res = await agent
      .patch(`/api/employees/${vpId}/move`)
      .send({ managerId: vpId, order: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cycle|self/i);
  });

  it("rejects moving a manager to one of their descendants (cycle)", async () => {
    // Try to make CEO report to Engineer (CEO -> VP -> Manager -> Engineer -> CEO would be cycle)
    const res = await agent
      .patch(`/api/employees/${ceoId}/move`)
      .send({ managerId: engineerId, order: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cycle/i);
  });

  it("rejects moving a manager to direct report (immediate cycle)", async () => {
    // Try to make VP report to Manager (VP -> Manager -> VP would be cycle)
    const res = await agent
      .patch(`/api/employees/${vpId}/move`)
      .send({ managerId: managerId, order: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cycle/i);
  });

  it("allows valid moves (no cycle)", async () => {
    // Move Engineer to report directly to CEO (valid)
    const res = await agent
      .patch(`/api/employees/${engineerId}/move`)
      .send({ managerId: ceoId, order: 0 });

    expect(res.status).toBe(200);
    expect(res.body.managerId).toBe(ceoId);

    // Move Engineer back to Manager (restore original hierarchy)
    const res2 = await agent
      .patch(`/api/employees/${engineerId}/move`)
      .send({ managerId: managerId, order: 0 });

    expect(res2.status).toBe(200);
    expect(res2.body.managerId).toBe(managerId);
  });

  it("allows moving to null manager (top-level)", async () => {
    // Move VP to top-level (valid)
    const res = await agent
      .patch(`/api/employees/${vpId}/move`)
      .send({ managerId: null, order: 0 });

    expect(res.status).toBe(200);
    expect(res.body.managerId).toBeNull();

    // Move VP back to CEO
    await agent
      .patch(`/api/employees/${vpId}/move`)
      .send({ managerId: ceoId, order: 0 });
  });

  it("rejects move if managerId does not exist in the same scenario", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await agent
      .patch(`/api/employees/${engineerId}/move`)
      .send({ managerId: fakeId, order: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/manager not found|invalid manager/i);
  });
});
