import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { buildSessionMiddleware } from "../packages/server/src/middleware/session";
import authRoutes from "../packages/server/src/routes/authRoutes";
import orgRoutes from "../packages/server/src/routes/orgRoutes";
import scenarioRoutes from "../packages/server/src/routes/scenarioRoutes";
import employeeRoutes from "../packages/server/src/routes/employeeRoutes";
import invitationRoutes from "../packages/server/src/routes/invitationRoutes";
import scheduledChangeRoutes from "../packages/server/src/routes/scheduledChangeRoutes";
import timelineRoutes from "../packages/server/src/routes/timelineRoutes";
import budgetRoutes from "../packages/server/src/routes/budgetRoutes";
import approvalRoutes from "../packages/server/src/routes/approvalRoutes";
import sseRoutes from "../packages/server/src/routes/sseRoutes";
import aiRoutes from "../packages/server/src/routes/aiRoutes";

const app = express();

// Vercel terminates TLS upstream; trust the first proxy hop so `secure`
// session cookies are emitted based on X-Forwarded-Proto.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());

// Session middleware MUST come before any route that reads req.session.
app.use(buildSessionMiddleware());

app.use("/api/auth", authRoutes);
// SSE must be mounted before the default orgRoutes so the event-stream
// handler isn't shadowed by the authenticated CRUD router.
app.use("/api", sseRoutes);
app.use("/api/orgs", orgRoutes);
app.use("/api", scenarioRoutes);
app.use("/api", employeeRoutes);
app.use("/api", invitationRoutes);
app.use("/api", scheduledChangeRoutes);
app.use("/api", timelineRoutes);
app.use("/api", budgetRoutes);
app.use("/api", approvalRoutes);
app.use("/api", aiRoutes);

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI not set");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  isConnected = true;
}

export default async function handler(req: any, res: any) {
  await connectDB();
  return app(req, res);
}
