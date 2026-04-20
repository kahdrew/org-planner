import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import request from "supertest";
import { registerAgent } from "./helpers/authAgent";
import { TEST_PASSWORD } from "./helpers/testConstants";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";

const TEST_PREFIX = `auth_test_${Date.now()}`;
const testEmail = `${TEST_PREFIX}@example.com`;
const testPassword = TEST_PASSWORD;
const testName = "Auth Test User";

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
});

afterAll(async () => {
  // Clean up test users
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
  await mongoose.disconnect();
});

describe("POST /api/auth/register", () => {
  it("rejects registration with missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({})
      .expect("Content-Type", /json/);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects registration with invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "password123", name: "Test" })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(Array.isArray(res.body.error)).toBe(true);
    const emailError = res.body.error.find(
      (e: { path: string[] }) => e.path[0] === "email",
    );
    expect(emailError).toBeDefined();
  });

  it("rejects registration with short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@example.com", password: "12345", name: "Test" })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(Array.isArray(res.body.error)).toBe(true);
    const passwordError = res.body.error.find(
      (e: { path: string[] }) => e.path[0] === "password",
    );
    expect(passwordError).toBeDefined();
  });

  it("rejects registration with empty name", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@example.com", password: "password123", name: "" })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(Array.isArray(res.body.error)).toBe(true);
    const nameError = res.body.error.find(
      (e: { path: string[] }) => e.path[0] === "name",
    );
    expect(nameError).toBeDefined();
  });

  it("registers successfully with valid data and sets a session cookie (VAL-AUTH-001)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail, password: testPassword, name: testName })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(201);
    // Session cookie (not a JWT) is now the credential.
    expect(res.body).not.toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("id");
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.name).toBe(testName);

    // Session cookie was emitted on the response.
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
    expect(cookieStr).toContain("orgplanner.sid=");
    expect(cookieStr.toLowerCase()).toContain("httponly");
  });

  it("rejects duplicate email with 409 (VAL-AUTH-003)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail, password: testPassword, name: testName })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email already in use");
  });
});

describe("POST /api/auth/login", () => {
  it("rejects login with missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({})
      .expect("Content-Type", /json/);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects login with invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "invalid", password: "password123" })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("logs in successfully with correct credentials and sets session cookie (VAL-AUTH-005)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: testPassword })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.name).toBe(testName);
    expect(res.body.user).toHaveProperty("id");

    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
    expect(cookieStr).toContain("orgplanner.sid=");
  });

  it("rejects login with wrong password (VAL-AUTH-006)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "WrongPassword!" })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("rejects login with non-existent email (VAL-AUTH-006)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nonexistent@example.com", password: "password123" })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("rejects NoSQL injection in auth fields (VAL-AUTH-011)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: { $gt: "" }, password: { $gt: "" } })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty("token");
  });
});

describe("Session-based auth middleware (VAL-AUTH-008)", () => {
  it("rejects requests without any session cookie", async () => {
    const res = await request(app)
      .get("/api/orgs")
      .expect("Content-Type", /json/);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });

  it("rejects requests bearing a garbled/unknown session cookie", async () => {
    const res = await request(app)
      .get("/api/orgs")
      .set("Cookie", "orgplanner.sid=s%3Agarbage.signature")
      .expect("Content-Type", /json/);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });

  it("accepts requests with a valid session cookie (VAL-AUTH-010)", async () => {
    const agent = await registerAgent(app, {
      email: `${TEST_PREFIX}_session@example.com`,
      password: testPassword,
      name: "Session User",
    });

    const res = await agent.get("/api/orgs");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 with no session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });

  it("returns the current user when authenticated", async () => {
    const agent = await registerAgent(app, {
      email: `${TEST_PREFIX}_me@example.com`,
      password: testPassword,
      name: "Me User",
    });

    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(`${TEST_PREFIX}_me@example.com`);
    expect(res.body.user.name).toBe("Me User");
  });
});

describe("POST /api/auth/logout", () => {
  it("destroys the session and subsequent requests fall back to 401", async () => {
    const agent = await registerAgent(app, {
      email: `${TEST_PREFIX}_logout@example.com`,
      password: testPassword,
      name: "Logout User",
    });

    // Before logout: /me works.
    const before = await agent.get("/api/auth/me");
    expect(before.status).toBe(200);

    // Logout.
    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(200);

    // After logout: /me returns 401.
    const after = await agent.get("/api/auth/me");
    expect(after.status).toBe(401);
  });

  it("is idempotent when called without an active session", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
  });
});
