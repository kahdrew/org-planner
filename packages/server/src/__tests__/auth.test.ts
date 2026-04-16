import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../app";
import User from "../models/User";

const TEST_PREFIX = `auth_test_${Date.now()}`;
const testEmail = `${TEST_PREFIX}@example.com`;
const testPassword = "TestPass123!";
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
      (e: { path: string[] }) => e.path[0] === "email"
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
      (e: { path: string[] }) => e.path[0] === "password"
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
      (e: { path: string[] }) => e.path[0] === "name"
    );
    expect(nameError).toBeDefined();
  });

  it("registers successfully with valid data (VAL-AUTH-001)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: testEmail, password: testPassword, name: testName })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("id");
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.name).toBe(testName);

    // Token should be a valid JWT
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET!) as { userId: string };
    expect(decoded).toHaveProperty("userId");
    expect(decoded.userId).toBe(res.body.user.id);
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

  it("logs in successfully with correct credentials (VAL-AUTH-005)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: testPassword })
      .expect("Content-Type", /json/);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.name).toBe(testName);
    expect(res.body.user).toHaveProperty("id");
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

describe("Auth middleware (VAL-AUTH-008)", () => {
  it("rejects requests without Authorization header", async () => {
    const res = await request(app)
      .get("/api/orgs")
      .expect("Content-Type", /json/);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No token provided");
  });

  it("rejects requests with invalid token", async () => {
    const res = await request(app)
      .get("/api/orgs")
      .set("Authorization", "Bearer invalidtoken123")
      .expect("Content-Type", /json/);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid token");
  });

  it("rejects requests with expired token", async () => {
    // Create an expired token
    const expiredToken = jwt.sign(
      { userId: "fakeuserid" },
      process.env.JWT_SECRET!,
      { expiresIn: "0s" }
    );

    const res = await request(app)
      .get("/api/orgs")
      .set("Authorization", `Bearer ${expiredToken}`)
      .expect("Content-Type", /json/);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid token");
  });

  it("accepts requests with valid token (VAL-AUTH-010)", async () => {
    // Login to get a valid token
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: testPassword });

    const res = await request(app)
      .get("/api/orgs")
      .set("Authorization", `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
  });
});
