import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";

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
});
