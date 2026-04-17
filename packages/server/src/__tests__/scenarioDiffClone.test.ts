import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";
import Scenario from "../models/Scenario";
import Organization from "../models/Organization";
import Employee from "../models/Employee";

const TEST_PREFIX = `diff_clone_test_${Date.now()}`;
const testEmail = `${TEST_PREFIX}@example.com`;
// Not a real credential — only used for the ephemeral test user created by this suite.
const testPassword = "changeme-" + Date.now();
const testName = "DiffCloneTestUser";

let token: string;
let orgId: string;
let scenarioAId: string;
let scenarioBId: string;
// IDs in scenario A
let aliceAId: string;
let bobAId: string;
let carolAId: string;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  const regRes = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail, password: testPassword, name: testName });

  if (regRes.status === 409) {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: testPassword });
    token = loginRes.body.token;
  } else {
    token = regRes.body.token;
  }

  const orgRes = await request(app)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: `${TEST_PREFIX}_org` });
  orgId = orgRes.body._id;

  const scenARes = await request(app)
    .post(`/api/orgs/${orgId}/scenarios`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: `${TEST_PREFIX}_A` });
  scenarioAId = scenARes.body._id;

  // Seed scenario A: Alice manages Bob and Carol.
  const aliceRes = await request(app)
    .post(`/api/scenarios/${scenarioAId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Alice Manager",
      title: "Director",
      department: "Engineering",
      level: "M4",
      location: "NYC",
      employmentType: "FTE",
      status: "Active",
      salary: 200_000,
    });
  aliceAId = aliceRes.body._id;

  const bobRes = await request(app)
    .post(`/api/scenarios/${scenarioAId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Bob Engineer",
      title: "Engineer",
      department: "Engineering",
      level: "IC3",
      location: "NYC",
      employmentType: "FTE",
      status: "Active",
      salary: 150_000,
      managerId: aliceAId,
    });
  bobAId = bobRes.body._id;

  const carolRes = await request(app)
    .post(`/api/scenarios/${scenarioAId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Carol Engineer",
      title: "Engineer",
      department: "Engineering",
      level: "IC3",
      location: "NYC",
      employmentType: "FTE",
      status: "Active",
      salary: 150_000,
      managerId: aliceAId,
    });
  carolAId = carolRes.body._id;

  // Clone scenario A into B (server remaps all IDs, preserves hierarchy).
  const cloneRes = await request(app)
    .post(`/api/scenarios/${scenarioAId}/clone`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
  scenarioBId = cloneRes.body._id;

  // Now mutate scenario B to represent a "real" planning diff:
  //   - add 2 new employees
  //   - change Carol's salary (1 field-level change)
  //   - reparent Bob to have no manager (1 structural move)
  // Everything else (Alice as-is) must be "unchanged" after diff.
  const bEmployees = await Employee.find({ scenarioId: scenarioBId }).lean();
  const bCarol = bEmployees.find((e) => e.name === "Carol Engineer");
  const bBob = bEmployees.find((e) => e.name === "Bob Engineer");
  if (!bCarol || !bBob) throw new Error("Clone did not produce expected employees");

  await request(app)
    .patch(`/api/employees/${bCarol._id.toString()}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ salary: 180_000 });

  await request(app)
    .patch(`/api/employees/${bBob._id.toString()}/move`)
    .set("Authorization", `Bearer ${token}`)
    .send({ managerId: null, order: 0 });

  await request(app)
    .post(`/api/scenarios/${scenarioBId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Dave NewHire",
      title: "Engineer",
      department: "Engineering",
      level: "IC2",
      location: "SF",
      employmentType: "FTE",
      status: "Planned",
      salary: 120_000,
    });

  await request(app)
    .post(`/api/scenarios/${scenarioBId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Eve NewHire",
      title: "PM",
      department: "Product",
      level: "IC3",
      location: "SF",
      employmentType: "Contractor",
      status: "Planned",
      salary: 130_000,
    });

  // Avoid unused-variable noise if tests skip.
  void bobAId;
  void carolAId;
});

afterAll(async () => {
  await Employee.deleteMany({ scenarioId: { $in: [scenarioAId, scenarioBId] } });
  await Scenario.deleteMany({ orgId });
  await Organization.findByIdAndDelete(orgId);
  await User.findOneAndDelete({ email: testEmail });
  await mongoose.disconnect();
});

describe("VAL-CROSS-015: Cloned-scenario diff reports only deliberate changes", () => {
  it("does not flag employees as moved purely because of cloned manager ID remap", async () => {
    const res = await request(app)
      .get(`/api/scenarios/${scenarioAId}/diff/${scenarioBId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const { added, removed, moved, changed, unchanged } = res.body as {
      added: Array<{ employee: { name: string } }>;
      removed: Array<{ employee: { name: string } }>;
      moved: Array<{ employee: { name: string } }>;
      changed: Array<{ employee: { name: string } }>;
      unchanged: Array<{ employee: { name: string } }>;
    };

    const addedNames = added.map((e) => e.employee.name).sort();
    const removedNames = removed.map((e) => e.employee.name).sort();
    const movedNames = moved.map((e) => e.employee.name).sort();
    const changedNames = changed.map((e) => e.employee.name).sort();
    const unchangedNames = unchanged.map((e) => e.employee.name).sort();

    // Exactly 2 added (Dave and Eve)
    expect(addedNames).toEqual(["Dave NewHire", "Eve NewHire"]);
    // Nothing removed in a pure clone + additions/edits scenario
    expect(removedNames).toEqual([]);
    // Exactly 1 reparent (Bob) — not every employee who just got a new
    // DB id for their existing manager.
    expect(movedNames).toEqual(["Bob Engineer"]);
    // Exactly 1 field-level change (Carol salary)
    expect(changedNames).toEqual(["Carol Engineer"]);
    // Alice (same role, same reports) is unchanged.
    expect(unchangedNames).toContain("Alice Manager");
    // Sanity: no duplicate categorization.
    const allCounted = [
      ...addedNames,
      ...removedNames,
      ...movedNames,
      ...changedNames,
      ...unchangedNames,
    ];
    expect(new Set(allCounted).size).toBe(allCounted.length);
  });

  it("still treats a true manager change as moved after a clone", async () => {
    const res = await request(app)
      .get(`/api/scenarios/${scenarioAId}/diff/${scenarioBId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const moved = res.body.moved as Array<{
      employee: { name: string };
      changes: Record<string, { from: unknown; to: unknown }>;
    }>;
    const bob = moved.find((m) => m.employee.name === "Bob Engineer");
    expect(bob).toBeDefined();
    expect(bob!.changes).toHaveProperty("managerId");
    // Bob's manager went from Alice (some id) to null.
    expect(bob!.changes.managerId.to).toBeNull();
  });
});
