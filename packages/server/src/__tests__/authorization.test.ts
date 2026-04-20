import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { registerAgent, type TestAgent } from "./helpers/authAgent";
import { TEST_PASSWORD } from "./helpers/testConstants";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";
import Organization from "../models/Organization";
import Scenario from "../models/Scenario";
import Employee from "../models/Employee";

const TEST_PREFIX = `authz_test_${Date.now()}`;

// User A — org owner
const userAEmail = `${TEST_PREFIX}_a@example.com`;
const userAPassword = TEST_PASSWORD;
const userAName = "AuthzUserA";

// User B — unauthorized user (separate org)
const userBEmail = `${TEST_PREFIX}_b@example.com`;
const userBPassword = TEST_PASSWORD;
const userBName = "AuthzUserB";

let agentA: TestAgent;
let agentB: TestAgent;

let orgAId: string;
let orgBId: string;
let scenarioAId: string;
let employeeAId: string;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  // Register User A
  agentA = await registerAgent(app, { email: userAEmail, password: userAPassword, name: userAName });

  // Register User B
  agentB = await registerAgent(app, { email: userBEmail, password: userBPassword, name: userBName });

  // User A creates an org
  const orgARes = await agentA
    .post("/api/orgs")
    .send({ name: `${TEST_PREFIX}_orgA` });
  orgAId = orgARes.body._id;

  // User B creates an org
  const orgBRes = await agentB
    .post("/api/orgs")
    .send({ name: `${TEST_PREFIX}_orgB` });
  orgBId = orgBRes.body._id;

  // User A creates a scenario in orgA
  const scenarioRes = await agentA
    .post(`/api/orgs/${orgAId}/scenarios`)
    .send({ name: `${TEST_PREFIX}_scenario` });
  scenarioAId = scenarioRes.body._id;

  // User A creates an employee in the scenario
  const empRes = await agentA
    .post(`/api/scenarios/${scenarioAId}/employees`)
    .send({
      name: "AuthzTestEmployee",
      title: "Engineer",
      department: "Engineering",
      level: "IC3",
      location: "NYC",
      employmentType: "FTE",
      status: "Active",
    });
  employeeAId = empRes.body._id;
});

afterAll(async () => {
  // Clean up test data
  await Employee.deleteMany({ scenarioId: scenarioAId });
  await Scenario.deleteMany({ orgId: { $in: [orgAId, orgBId] } });
  await Organization.deleteMany({ _id: { $in: [orgAId, orgBId] } });
  await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } });
  await mongoose.disconnect();
});

// ========================
// VAL-AUTHZ-001: GET /api/orgs returns only orgs where user is a member
// ========================
describe("VAL-AUTHZ-001: GET /api/orgs returns only user's orgs", () => {
  it("User A sees only orgA, not orgB", async () => {
    const res = await agentA
      .get("/api/orgs");

    expect(res.status).toBe(200);
    const orgIds = res.body.map((o: { _id: string }) => o._id);
    expect(orgIds).toContain(orgAId);
    expect(orgIds).not.toContain(orgBId);
  });

  it("User B sees only orgB, not orgA", async () => {
    const res = await agentB
      .get("/api/orgs");

    expect(res.status).toBe(200);
    const orgIds = res.body.map((o: { _id: string }) => o._id);
    expect(orgIds).toContain(orgBId);
    expect(orgIds).not.toContain(orgAId);
  });
});

// ========================
// VAL-AUTHZ-002: Org update restricted to owner only
// ========================
describe("VAL-AUTHZ-002: PATCH /api/orgs/:id restricted to owner", () => {
  it("Owner (User A) can update org name", async () => {
    const res = await agentA
      .patch(`/api/orgs/${orgAId}`)
      .send({ name: `${TEST_PREFIX}_orgA_updated` });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`${TEST_PREFIX}_orgA_updated`);
  });

  it("Non-owner (User B) gets 403 trying to update User A's org", async () => {
    const res = await agentB
      .patch(`/api/orgs/${orgAId}`)
      .send({ name: "Hacked Org Name" });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("error");
  });
});

// ========================
// VAL-AUTHZ-003: Non-member cannot access org resources
// ========================
describe("VAL-AUTHZ-003: Non-member blocked from org resources", () => {
  it("User B cannot list scenarios in User A's org", async () => {
    const res = await agentB
      .get(`/api/orgs/${orgAId}/scenarios`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("User B cannot create scenarios in User A's org", async () => {
    const res = await agentB
      .post(`/api/orgs/${orgAId}/scenarios`)
      .send({ name: "Unauthorized Scenario" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });
});

// ========================
// VAL-AUTHZ-004: Scenario endpoints enforce org membership
// ========================
describe("VAL-AUTHZ-004: Scenario endpoints enforce org membership", () => {
  it("User B cannot clone User A's scenario", async () => {
    const res = await agentB
      .post(`/api/scenarios/${scenarioAId}/clone`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("User B cannot delete User A's scenario", async () => {
    const res = await agentB
      .delete(`/api/scenarios/${scenarioAId}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("User B cannot diff User A's scenarios", async () => {
    // Create a second scenario for User A to diff against
    const scenario2Res = await agentA
      .post(`/api/orgs/${orgAId}/scenarios`)
      .send({ name: `${TEST_PREFIX}_scenarioA2` });
    const scenarioA2Id = scenario2Res.body._id;

    const res = await agentB
      .get(`/api/scenarios/${scenarioAId}/diff/${scenarioA2Id}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");

    // Clean up
    await Scenario.findByIdAndDelete(scenarioA2Id);
  });

  it("User B cannot list scenarios in User A's org", async () => {
    const res = await agentB
      .get(`/api/orgs/${orgAId}/scenarios`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });
});

// ========================
// VAL-AUTHZ-005: Employee endpoints enforce org membership via scenario→org chain
// ========================
describe("VAL-AUTHZ-005: Employee endpoints enforce org membership", () => {
  it("User B cannot list employees in User A's scenario", async () => {
    const res = await agentB
      .get(`/api/scenarios/${scenarioAId}/employees`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("User B cannot create employees in User A's scenario", async () => {
    const res = await agentB
      .post(`/api/scenarios/${scenarioAId}/employees`)
      .send({
        name: "UnauthorizedEmp",
        title: "Hacker",
        department: "Security",
        level: "IC1",
        location: "Remote",
        employmentType: "FTE",
        status: "Active",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("User B cannot bulk create employees in User A's scenario", async () => {
    const res = await agentB
      .post(`/api/scenarios/${scenarioAId}/employees/bulk`)
      .send([
        {
          name: "BulkUnauth1",
          title: "Test",
          department: "Test",
          level: "IC1",
          location: "NYC",
          employmentType: "FTE",
          status: "Active",
        },
      ]);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("User B cannot update User A's employee", async () => {
    const res = await agentB
      .patch(`/api/employees/${employeeAId}`)
      .send({ title: "Hacked Title" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("User B cannot move User A's employee", async () => {
    const res = await agentB
      .patch(`/api/employees/${employeeAId}/move`)
      .send({ managerId: null, order: 0 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("User B cannot delete User A's employee", async () => {
    const res = await agentB
      .delete(`/api/employees/${employeeAId}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });
});

// ========================
// VAL-AUTHZ-006: Owner/member can perform all CRUD on their own resources
// ========================
describe("VAL-AUTHZ-006: Owner can perform all CRUD on own resources", () => {
  it("Owner can list scenarios in own org", async () => {
    const res = await agentA
      .get(`/api/orgs/${orgAId}/scenarios`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("Owner can create scenarios in own org", async () => {
    const res = await agentA
      .post(`/api/orgs/${orgAId}/scenarios`)
      .send({ name: `${TEST_PREFIX}_newScenario` });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`${TEST_PREFIX}_newScenario`);

    // Clean up
    await Employee.deleteMany({ scenarioId: res.body._id });
    await Scenario.findByIdAndDelete(res.body._id);
  });

  it("Owner can list employees in own scenario", async () => {
    const res = await agentA
      .get(`/api/scenarios/${scenarioAId}/employees`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("Owner can create employees in own scenario", async () => {
    const res = await agentA
      .post(`/api/scenarios/${scenarioAId}/employees`)
      .send({
        name: "AuthzOwnEmployee",
        title: "Manager",
        department: "Product",
        level: "M1",
        location: "SF",
        employmentType: "FTE",
        status: "Active",
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("AuthzOwnEmployee");

    // Clean up
    await Employee.findByIdAndDelete(res.body._id);
  });

  it("Owner can update own employee", async () => {
    const res = await agentA
      .patch(`/api/employees/${employeeAId}`)
      .send({ title: "Senior Engineer" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Senior Engineer");

    // Revert
    await agentA
      .patch(`/api/employees/${employeeAId}`)
      .send({ title: "Engineer" });
  });

  it("Owner can move own employee", async () => {
    const res = await agentA
      .patch(`/api/employees/${employeeAId}/move`)
      .send({ managerId: null, order: 1 });

    expect(res.status).toBe(200);
    expect(res.body.order).toBe(1);
  });

  it("Owner can clone own scenario", async () => {
    const res = await agentA
      .post(`/api/scenarios/${scenarioAId}/clone`);

    expect(res.status).toBe(201);
    expect(res.body.baseScenarioId).toBe(scenarioAId);

    // Clean up
    await Employee.deleteMany({ scenarioId: res.body._id });
    await Scenario.findByIdAndDelete(res.body._id);
  });

  it("Owner can diff own scenarios", async () => {
    // Create another scenario for diffing
    const s2 = await agentA
      .post(`/api/orgs/${orgAId}/scenarios`)
      .send({ name: `${TEST_PREFIX}_diffTarget` });
    const s2Id = s2.body._id;

    const res = await agentA
      .get(`/api/scenarios/${scenarioAId}/diff/${s2Id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("added");
    expect(res.body).toHaveProperty("removed");

    // Clean up
    await Scenario.findByIdAndDelete(s2Id);
  });
});

// ========================
// VAL-AUTHZ-007: Non-existent org/scenario IDs return 403 or 404
// ========================
describe("VAL-AUTHZ-007: Non-existent IDs return 403 or 404", () => {
  it("Non-existent org ID on scenario list returns 403", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await agentA
      .get(`/api/orgs/${fakeId}/scenarios`);

    expect([403, 404]).toContain(res.status);
  });

  it("Non-existent scenario ID on clone returns 403", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await agentA
      .post(`/api/scenarios/${fakeId}/clone`);

    expect([403, 404]).toContain(res.status);
  });

  it("Non-existent scenario ID on employee list returns 403", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await agentA
      .get(`/api/scenarios/${fakeId}/employees`);

    expect([403, 404]).toContain(res.status);
  });

  it("Non-existent employee ID on update returns 404", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await agentA
      .patch(`/api/employees/${fakeId}`)
      .send({ title: "Ghost" });

    expect(res.status).toBe(404);
  });
});

// ========================
// VAL-AUTHZ-008: Malformed IDs return 400 or 404, not 500
// ========================
describe("VAL-AUTHZ-008: Malformed IDs return 400 or 404, not 500", () => {
  it("Malformed org ID returns 400", async () => {
    const res = await agentA
      .get("/api/orgs/not-a-valid-id/scenarios");

    expect([400, 404]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it("Malformed scenario ID on employee list returns 400", async () => {
    const res = await agentA
      .get("/api/scenarios/not-a-valid-id/employees");

    expect([400, 404]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it("Malformed employee ID on PATCH returns 400 or 404", async () => {
    const res = await agentA
      .patch("/api/employees/not-a-valid-id")
      .send({ title: "Test" });

    expect([400, 404]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it("Malformed employee ID on DELETE returns 400 or 404", async () => {
    const res = await agentA
      .delete("/api/employees/not-a-valid-id");

    expect([400, 404]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it("Malformed employee ID on move returns 400 or 404", async () => {
    const res = await agentA
      .patch("/api/employees/not-a-valid-id/move")
      .send({ managerId: null, order: 0 });

    expect([400, 404]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it("Malformed scenario ID on diff returns 400", async () => {
    const res = await agentA
      .get("/api/scenarios/not-a-valid-id/diff/also-not-valid");

    expect([400, 404]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });
});
