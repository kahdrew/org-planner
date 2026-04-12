import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "../packages/server/src/routes/authRoutes";
import orgRoutes from "../packages/server/src/routes/orgRoutes";
import scenarioRoutes from "../packages/server/src/routes/scenarioRoutes";
import employeeRoutes from "../packages/server/src/routes/employeeRoutes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/orgs", orgRoutes);
app.use("/api", scenarioRoutes);
app.use("/api", employeeRoutes);

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
