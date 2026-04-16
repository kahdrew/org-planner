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

const TEST_PREFIX = `bugfix_test_${Date.now()}`;
const testEmail = `${TEST_PREFIX}@example.com`;
const testPassword = "TestPass123!";
const testName = "BugfixTestUser";

let token: string;
let orgId: string;
let scenarioAId: string;
let scenarioBId: string;

beforeAll(async () => {
  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI!);

  // Register a test user
  const regRes = await request(app)
    .post("/api/auth/register")
    .send({ email: testEmail, password: testPassword, name: testName });

  if (regRes.status === 409) {
    // User already exists, login instead
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: testPassword });
    token = loginRes.body.token;
  } else {
    token = regRes.body.token;
  }

  // Create a test org
  const orgRes = await request(app)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: `${TEST_PREFIX}_org` });
  orgId = orgRes.body._id;

  // Create two scenarios for diffing
  const scenarioARes = await request(app)
    .post(`/api/orgs/${orgId}/scenarios`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: `${TEST_PREFIX}_scenarioA` });
  scenarioAId = scenarioARes.body._id;

  const scenarioBRes = await request(app)
    .post(`/api/orgs/${orgId}/scenarios`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: `${TEST_PREFIX}_scenarioB` });
  scenarioBId = scenarioBRes.body._id;

  // Add employees to scenario A
  await request(app)
    .post(`/api/scenarios/${scenarioAId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Alice A",
      title: "Engineer",
      department: "Engineering",
      level: "IC3",
      location: "NYC",
      employmentType: "FTE",
      status: "Active",
    });

  await request(app)
    .post(`/api/scenarios/${scenarioAId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Bob B",
      title: "Designer",
      department: "Design",
      level: "IC2",
      location: "LA",
      employmentType: "FTE",
      status: "Active",
    });

  // Add employees to scenario B (different set)
  await request(app)
    .post(`/api/scenarios/${scenarioBId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Alice A",
      title: "Engineer",
      department: "Engineering",
      level: "IC3",
      location: "NYC",
      employmentType: "FTE",
      status: "Active",
    });

  await request(app)
    .post(`/api/scenarios/${scenarioBId}/employees`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Charlie C",
      title: "PM",
      department: "Product",
      level: "IC4",
      location: "SF",
      employmentType: "FTE",
      status: "Planned",
    });
});

afterAll(async () => {
  // Clean up test data
  await Employee.deleteMany({ scenarioId: { $in: [scenarioAId, scenarioBId] } });
  await Scenario.deleteMany({ orgId });
  await Organization.findByIdAndDelete(orgId);
  await User.findOneAndDelete({ email: testEmail });
  await mongoose.disconnect();
});

describe("Bug #1: Scenario diff uses path params GET /scenarios/:a/diff/:b", () => {
  it("returns diff with correct structure using path params", async () => {
    const res = await request(app)
      .get(`/api/scenarios/${scenarioAId}/diff/${scenarioBId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("added");
    expect(res.body).toHaveProperty("removed");
    expect(res.body).toHaveProperty("moved");
    expect(res.body).toHaveProperty("changed");
    expect(res.body).toHaveProperty("unchanged");
    expect(Array.isArray(res.body.added)).toBe(true);
    expect(Array.isArray(res.body.removed)).toBe(true);
    expect(Array.isArray(res.body.unchanged)).toBe(true);
  });

  it("correctly identifies added and removed employees", async () => {
    const res = await request(app)
      .get(`/api/scenarios/${scenarioAId}/diff/${scenarioBId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    // Bob B is only in scenario A -> removed
    const removedNames = res.body.removed.map((e: { employee: { name: string } }) => e.employee.name);
    expect(removedNames).toContain("Bob B");

    // Charlie C is only in scenario B -> added
    const addedNames = res.body.added.map((e: { employee: { name: string } }) => e.employee.name);
    expect(addedNames).toContain("Charlie C");

    // Alice A is in both -> unchanged
    const unchangedNames = res.body.unchanged.map((e: { employee: { name: string } }) => e.employee.name);
    expect(unchangedNames).toContain("Alice A");
  });

  it("returns 200 with empty arrays for non-existent scenario IDs", async () => {
    const fakeId1 = new mongoose.Types.ObjectId().toString();
    const fakeId2 = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .get(`/api/scenarios/${fakeId1}/diff/${fakeId2}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.added).toHaveLength(0);
    expect(res.body.removed).toHaveLength(0);
    expect(res.body.moved).toHaveLength(0);
    expect(res.body.changed).toHaveLength(0);
    expect(res.body.unchanged).toHaveLength(0);
  });
});

describe("Bug #2: Bulk create expects raw array", () => {
  it("accepts a raw array of employees and returns 201", async () => {
    const employees = [
      {
        name: "Bulk1",
        title: "Engineer",
        department: "Engineering",
        level: "IC2",
        location: "NYC",
        employmentType: "FTE",
        status: "Active",
      },
      {
        name: "Bulk2",
        title: "Designer",
        department: "Design",
        level: "IC3",
        location: "LA",
        employmentType: "Contractor",
        status: "Planned",
      },
    ];

    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/employees/bulk`)
      .set("Authorization", `Bearer ${token}`)
      .send(employees);

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("Bulk1");
    expect(res.body[1].name).toBe("Bulk2");

    // Clean up
    for (const emp of res.body) {
      await Employee.findByIdAndDelete(emp._id);
    }
  });

  it("rejects wrapped {employees:[...]} object with 400", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/employees/bulk`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        employees: [
          {
            name: "WrappedEmployee",
            title: "Engineer",
            department: "Engineering",
            level: "IC2",
            location: "NYC",
            employmentType: "FTE",
            status: "Active",
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("validates each employee in the array", async () => {
    const res = await request(app)
      .post(`/api/scenarios/${scenarioAId}/employees/bulk`)
      .set("Authorization", `Bearer ${token}`)
      .send([{ name: "" }]);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("Bug #3: Auth error responses use {error: string}", () => {
  it("login with wrong password returns {error: 'Invalid credentials'}", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toBe("Invalid credentials");
    // Ensure there is no 'message' field
    expect(res.body).not.toHaveProperty("message");
  });

  it("login with non-existent email returns {error: 'Invalid credentials'}", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nonexistent@example.com", password: "anypassword" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toBe("Invalid credentials");
    expect(res.body).not.toHaveProperty("message");
  });

  it("register with duplicate email returns {error: 'Email already in use'}", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail, password: testPassword, name: "Another User" });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toBe("Email already in use");
    expect(res.body).not.toHaveProperty("message");
  });
});
